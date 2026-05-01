import { useRef, useCallback } from 'react';

const SAMPLE_RATE = 24000;

export function useAudioPlayer() {
  const ctxRef = useRef(null);
  const nextStartTimeRef = useRef(0);
  const readyRef = useRef(false);
  const bufferQueueRef = useRef([]);
  const flushingRef = useRef(false);

  const drainQueue = useCallback(() => {
    const ctx = ctxRef.current;
    if (!ctx || !readyRef.current || flushingRef.current) return;

    while (bufferQueueRef.current.length > 0) {
      const arrayBuffer = bufferQueueRef.current.shift();
      playChunk(ctx, arrayBuffer, nextStartTimeRef);
    }
  }, []);

  const init = useCallback(async () => {
    if (!ctxRef.current) {
      ctxRef.current = new AudioContext({ sampleRate: SAMPLE_RATE });
      console.log('[Audio] AudioContext created, state:', ctxRef.current.state);
    }
    if (ctxRef.current.state === 'suspended') {
      await ctxRef.current.resume();
      console.log('[Audio] AudioContext resumed, state:', ctxRef.current.state);
    }
    readyRef.current = true;
    drainQueue();
  }, [drainQueue]);

  const enqueuePCM = useCallback((arrayBuffer) => {
    console.log('[Audio] Enqueuing PCM chunk,', arrayBuffer.byteLength, 'bytes');
    // Don't play audio while a flush is in progress
    if (flushingRef.current) return;

    const ctx = ctxRef.current;
    if (!ctx || !readyRef.current) {
      bufferQueueRef.current.push(arrayBuffer);
      return;
    }

    playChunk(ctx, arrayBuffer, nextStartTimeRef);
  }, []);

  // Flush all queued and playing audio without destroying the context
  const flush = useCallback(async () => {
    // Prevent concurrent flushes
    if (flushingRef.current) return;
    flushingRef.current = true;

    try {
      const ctx = ctxRef.current;
      if (!ctx || ctx.state === 'closed') return;
      // Suspend stops all scheduled sources immediately
      await ctx.suspend();
      // Close the old context and create a fresh one
      await ctx.close();
      ctxRef.current = new AudioContext({ sampleRate: SAMPLE_RATE });
      if (ctxRef.current.state === 'suspended') {
        await ctxRef.current.resume();
      }
      nextStartTimeRef.current = 0;
      bufferQueueRef.current = [];
      readyRef.current = true;
    } finally {
      flushingRef.current = false;
    }
  }, []);

  const stop = useCallback(() => {
    if (ctxRef.current && ctxRef.current.state !== 'closed') {
      ctxRef.current.close();
      ctxRef.current = null;
      nextStartTimeRef.current = 0;
      readyRef.current = false;
      bufferQueueRef.current = [];
    }
  }, []);

  return { init, enqueuePCM, flush, stop };
}

function playChunk(ctx, arrayBuffer, nextStartTimeRef) {
  // Guard against playing on a closed context
  if (ctx.state === 'closed') return;

  // Convert Int16 PCM to Float32
  const int16 = new Int16Array(arrayBuffer);
  const float32 = new Float32Array(int16.length);
  for (let i = 0; i < int16.length; i++) {
    float32[i] = int16[i] / 32768;
  }

  const audioBuffer = ctx.createBuffer(1, float32.length, SAMPLE_RATE);
  audioBuffer.getChannelData(0).set(float32);

  const source = ctx.createBufferSource();
  source.buffer = audioBuffer;
  source.connect(ctx.destination);

  const now = ctx.currentTime;
  const startTime = Math.max(now, nextStartTimeRef.current);
  source.start(startTime);
  nextStartTimeRef.current = startTime + audioBuffer.duration;
}
