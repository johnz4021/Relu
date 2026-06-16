import { useRef, useEffect, useCallback, useState } from 'react';
import { supabase } from '../lib/supabase';

// Messages that survive a disconnect: queued while the socket is down and
// replayed on reconnect. Lesson-start messages MUST be here. Dropping
// start_leetcode / resume_conversation on a socket flap (server restart,
// post-login reconnect, sleep/wake) silently strands the leetcode overlay on
// "Loading your problem…" forever — no retry, no timeout, reload-only escape.
// That was the root of the "stuck on loading" reports (investigate 2026-06-16).
export const QUEUEABLE_TYPES = [
  'start_leetcode',
  'resume_conversation',
  'guided_response',
  'guided_message',
  'interrupt',
  'end_session',
  'pause',
  'resume',
  'set_speed',
  'set_tts_muted',
];

// Pure queue policy (unit-tested in useWebSocket.test.js). Returns a NEW array
// when the message is queued, or the SAME array reference when it's dropped, so
// callers can cheaply detect whether anything was enqueued. A fresh lesson-start
// supersedes any still-queued start/resume, so a reconnect never replays two
// lessons (which would double-bill and race two agent loops on the server).
export function enqueueMessage(queue, msg) {
  if (!QUEUEABLE_TYPES.includes(msg?.type)) return queue;
  const isStart = msg.type === 'start_leetcode' || msg.type === 'resume_conversation';
  const base = isStart
    ? queue.filter((m) => m.type !== 'start_leetcode' && m.type !== 'resume_conversation')
    : queue;
  return [...base, msg];
}

export function useWebSocket(onMessage, onBinary, enabled = true) {
  const wsRef = useRef(null);
  const [connected, setConnected] = useState(false);
  const reconnectTimer = useRef(null);
  const onMessageRef = useRef(onMessage);
  const onBinaryRef = useRef(onBinary);
  const pendingMessages = useRef([]);

  // Keep refs current without triggering reconnects
  onMessageRef.current = onMessage;
  onBinaryRef.current = onBinary;

  useEffect(() => {
    if (!enabled) return;

    let disposed = false;

    async function connect() {
      if (disposed) return;

      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      let wsUrl = `${protocol}//${window.location.host}/ws`;

      // Attach auth token if Supabase is configured
      if (supabase) {
        try {
          const { data: { session } } = await supabase.auth.getSession();
          if (session?.access_token) {
            wsUrl += `?token=${session.access_token}`;
          } else {
            // No session — don't attempt connection, retry later
            reconnectTimer.current = setTimeout(connect, 2000);
            return;
          }
        } catch (err) {
          console.error('[WS] Failed to get auth token:', err);
          reconnectTimer.current = setTimeout(connect, 2000);
          return;
        }
      }

      if (disposed) return;

      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;
      ws.binaryType = 'arraybuffer';

      ws.onopen = () => {
        console.log('[WS] Connected');
        // Flush any messages queued while disconnected
        if (pendingMessages.current.length > 0) {
          console.log(`[WS] Flushing ${pendingMessages.current.length} queued messages`);
          for (const queued of pendingMessages.current) {
            ws.send(JSON.stringify(queued));
          }
          pendingMessages.current = [];
        }
        setConnected(true);
      };

      ws.onmessage = (event) => {
        if (event.data instanceof ArrayBuffer) {
          onBinaryRef.current?.(event.data);
        } else {
          try {
            const msg = JSON.parse(event.data);
            onMessageRef.current?.(msg);
          } catch (err) {
            console.error('[WS] Parse error:', err);
          }
        }
      };

      ws.onclose = () => {
        console.log('[WS] Disconnected');
        setConnected(false);
        wsRef.current = null;
        if (!disposed) {
          reconnectTimer.current = setTimeout(connect, 2000);
        }
      };

      ws.onerror = (err) => {
        console.error('[WS] Error:', err);
      };
    }

    connect();
    return () => {
      disposed = true;
      clearTimeout(reconnectTimer.current);
      wsRef.current?.close();
    };
  }, [enabled]);

  const send = useCallback((msg) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(msg));
    } else {
      // Socket not open: queue replayable messages for reconnect, drop the rest.
      const next = enqueueMessage(pendingMessages.current, msg);
      if (next !== pendingMessages.current) {
        console.log(`[WS] Queuing message (disconnected): ${msg.type}`);
        pendingMessages.current = next;
      }
    }
  }, []);

  return { send, connected };
}
