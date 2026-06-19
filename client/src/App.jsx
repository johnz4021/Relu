import { useCallback, useEffect, useRef, useState } from 'react';
import { LazyMotion, domAnimation } from 'motion/react';
import VizLayout from './components/VizLayout';
import VizRequestToast from './components/VizRequestToast';
import VizErrorToast from './components/VizErrorToast';
import VizTierToast from './components/VizTierToast';
import ReportBugButton from './components/ReportBugButton';
import GraphRenderer from './components/renderers/GraphRenderer';
import Transcript from './components/Transcript';
import Controls from './components/Controls';
import LandingTabs from './components/LandingTabs';
import CompanionOpener from './components/CompanionOpener';
import AuthModal from './components/AuthModal';
import { resolveExtAuthProvider, extAuthAction, extAuthScreen, extAuthTabUrl, isOAuthReturn, readExtAuthMarker, extAuthMarker, EXT_AUTH_KEY, EXT_AUTH_SCREEN_TEXT } from './lib/extAuth';
import SessionFeedback from './components/SessionFeedback';
import SessionGate from './components/SessionGate';
import SettingsModal from './components/SettingsModal';
import ContextPanelHost from './components/context/ContextPanelHost';
import PseudocodePanel from './components/context/PseudocodePanel';
import ResizableSplit from './components/ResizableSplit';
import ExitConfirmModal from './components/ExitConfirmModal';
import Logo from './components/Logo';
import { useWebSocket } from './hooks/useWebSocket';
import { useAudioPlayer } from './hooks/useAudioPlayer';
import { useAuth } from './hooks/useAuth';
import { useLessonSession } from './hooks/useLessonSession';
import { useTutorState, normalizeVizActions } from './hooks/useTutorState';
import { applyActions, applyAction, applyActionsSequenced, killActiveTimeline, flushActiveTimeline, loadGraphImmediate } from './lib/rendererRegistry';
import { initContextManager, destroyContextManager } from './lib/contextManager';
import { supabase } from './lib/supabase';
import { track } from './lib/posthog';
import { OFFER_CHIPS, STUCK_MESSAGE } from './lib/offerChips';
import { selectVisibleContextPanels } from './lib/companionPanels';

// Captured at MODULE LOAD, before supabase's async init strips the OAuth hash via
// history.replaceState. Reading window.location.hash at render time is too late — the
// hash can already be gone, which would make the handoff tab fail to recognize itself
// as returning from OAuth (the bug behind the tab never closing).
const EXT_AUTH_INITIAL_HASH = typeof window !== 'undefined' ? window.location.hash : '';
const EXT_AUTH_INITIAL_SEARCH = typeof window !== 'undefined' ? window.location.search : '';
const EXT_AUTH_RETURNING = isOAuthReturn(EXT_AUTH_INITIAL_HASH, EXT_AUTH_INITIAL_SEARCH);

export default function App() {
  const { session, user, loading: authLoading, signOut } = useAuth();
  const { state, processMessage, interrupt, reset, dispatchContext } = useTutorState();
  const audioPlayer = useAudioPlayer();
  const [ttsMuted, setTtsMuted] = useState(false);
  const [pendingFeedback, setPendingFeedback] = useState(null);
  const [showExitConfirm, setShowExitConfirm] = useState(false);
  const [gateStatus, setGateStatus] = useState(null);
  const [apiKeyResult, setApiKeyResult] = useState(null);
  const [keyDeletionResult, setKeyDeletionResult] = useState(null);
  const [showSettings, setShowSettings] = useState(false);
  const [ttsToast, setTtsToast] = useState(null);
  const [showCreditsModal, setShowCreditsModal] = useState(false);
  const [checkoutToast, setCheckoutToast] = useState(null);
  const [lcParsed, setLcParsed] = useState(null);
  const [lcSessions, setLcSessions] = useState([]);
  const [vizTier, setVizTier] = useState(null);
  const insertRefHolder = useRef(null);
  const sendRef = useRef(null);

  // Companion funnel state (eng D4). The in-overlay rungs flow through the app's
  // PostHog (already identified by Supabase user id, so they unify with the
  // background's extension-side events). Refs so the WS message handler — defined
  // before embedIntent — can read companion state and fire each rung once.
  const companionActiveRef = useRef(false);
  const companionFunnelRef = useRef({ nudgeGiven: false, structureShown: false, solutionShown: false });
  // Reactive mirror of the funnel's once-only reveal signal. Drives the companion
  // context-panel reveal-gate (design /plan-design-review 2026-06-15): panels stay
  // hidden in nudge mode until the tutor reports it revealed the key insight.
  const [keyInsightRevealed, setKeyInsightRevealed] = useState(false);
  // Private MessagePort to the extension content script (declared here, before
  // onMessage, for the same reason as the companion refs above). Set in the embed
  // handshake below; carries session updates out AND highlight commands/results.
  const embedAuthPortRef = useRef(null);

  const contextPanelsRef = useRef(state.contextPanels);
  contextPanelsRef.current = state.contextPanels;
  const vizPanelsRef = useRef(state.vizPanels);
  vizPanelsRef.current = state.vizPanels;
  // Stores the string input from lc_viz_ready so we can re-initialize after guided_start resets.
  const lcStringInputRef = useRef(null);

  useEffect(() => {
    initContextManager(dispatchContext);
    return () => destroyContextManager();
  }, [dispatchContext]);

  // Track session completion
  useEffect(() => {
    if (state.status === 'complete') {
      const duration = sessionStartRef.current
        ? Math.round((Date.now() - sessionStartRef.current) / 1000)
        : undefined;
      track('session_completed', {
        mode: state.mode, algorithm: state.algorithm,
        segment_count: state.segmentCount, duration_seconds: duration,
        companion: companionActiveRef.current, // eng D4 "returned" rung tag
      });
    }
  }, [state.status, state.mode, state.algorithm, state.segmentCount]);

  const onMessage = useCallback(
    (msg) => {
      console.log('[App] WS message:', msg.type, msg);

      // Kill any in-flight staggered action timeline before the graph is replaced,
      // otherwise GSAP callbacks fire against a destroyed/different cytoscape instance.
      if (msg.type === 'create_graph' || msg.type === 'create_visualization') {
        console.log('[App] killing active timeline for', msg.type, msg.graph?.nodes?.map(n => n.id));
        killActiveTimeline();
      }

      // Load graph into Cytoscape synchronously so it's ready before any
      // subsequent viz actions arrive (React useEffect would defer this).
      if (msg.type === 'create_graph' && msg.graph) {
        const graphPanelId = vizPanelsRef.current?.find(p => p.renderer === 'graph')?.id || 'graph';
        loadGraphImmediate(graphPanelId, msg.graph);
      }
      if (msg.type === 'create_visualization' && msg.panels) {
        for (const panel of msg.panels) {
          if (panel.renderer === 'graph' && panel.config?.graph) {
            loadGraphImmediate(panel.id || 'graph', panel.config.graph);
          }
          // For string panels: buffer set_string so it fires when the renderer mounts.
          // This survives guided_start resets that wipe vizPanels.
          if (panel.renderer === 'string' && lcStringInputRef.current) {
            applyAction({ renderer: panel.id || 'string', action: 'set_string', params: { s: lcStringInputRef.current } });
          }
        }
      }

      processMessage(msg);

      // Companion funnel (eng D4) — driven by the server's per-turn self-report
      // (msg.companion) instead of guessing from viz. nudge_given = the first turn
      // carrying a self-report; solution reveal = the turn the model flags
      // reveals_key_insight. structure_viz_shown stays the viz signal (a real
      // create_visualization, not a heuristic). Each fires once.
      if (companionActiveRef.current) {
        const f = companionFunnelRef.current;
        const report = msg.companion; // present on companion conversational/segment turns
        if (!f.nudgeGiven && report) {
          f.nudgeGiven = true;
          track('companion_nudge_given', { learner_state: report.learner_state });
        }
        if (!f.structureShown && (msg.type === 'create_graph' || msg.type === 'create_visualization')) {
          f.structureShown = true;
          track('companion_structure_viz_shown', {});
        }
        if (!f.solutionShown && report?.reveals_key_insight) {
          f.solutionShown = true;
          track('companion_solution_viz_shown', { learner_state: report.learner_state });
        }
        // Un-gate the context panels for the reveal/trace rung. Kept OUTSIDE the
        // once-only funnel guard so a restarted lesson (funnel already fired) still
        // re-reveals after its own reveal turn; reset to false at idle.
        if (report?.reveals_key_insight) setKeyInsightRevealed(true);
      }

      // Route all viz actions through the renderer registry.
      // normalizeVizActions wraps legacy (renderer-less) actions as renderer:'graph'.
      if (msg.type === 'segment_start' && msg.viz_actions?.length > 0) {
        const normalized = normalizeVizActions(msg.viz_actions);
        console.log('[App] Routing viz_actions:', JSON.stringify(normalized).slice(0, 500));

        // Legacy compat: convert update_table to context panel update
        const tableAction = msg.viz_actions.find((a) => a.action === 'update_table');
        if (tableAction && tableAction.table) {
          // Auto-create distances panel if none exist yet (legacy graph algo path)
          if (contextPanelsRef.current.length === 0) {
            dispatchContext({
              type: 'SET_CONTEXT_PANELS',
              panels: [{ id: 'distances', type: 'key_value', title: 'Distances' }],
            });
          }
          const entries = Object.entries(tableAction.table).map(([key, value]) => ({
            key,
            value: value === Infinity || value === 'Infinity' ? '\u221e' : value,
            status: 'default',
          }));
          applyActions([{
            renderer: 'context',
            action: 'update',
            params: { panel_id: 'distances', entries },
          }]);
        }

        // Extract residual edges from show_residual_overlay or set_residual_data actions for the toggle button
        const residualAction = msg.viz_actions.find((a) => a.action === 'show_residual_overlay' || a.action === 'set_residual_data');
        const residualEdges = residualAction?.params?.residual_edges || residualAction?.residual_edges;
        if (residualEdges) {
          dispatchContext({ type: 'SET_RESIDUAL_EDGES', edges: residualEdges });
        }

        // Flush any in-flight stagger timeline so the previous segment reaches
        // its fully-applied state before this segment's actions are applied.
        flushActiveTimeline();

        // Use sequenced application for multi-action segments
        if (normalized.length > 2) {
          applyActionsSequenced(normalized, { staggerMs: 300 });
        } else {
          applyActions(normalized);
        }
      } else if (msg.type === 'segment_start') {
        console.log('[App] segment_start with NO viz_actions');
      }
      if (msg.type === 'interrupt_response' && msg.viz_actions?.length > 0) {
        const normalized = normalizeVizActions(msg.viz_actions);
        applyActions(normalized);
      }
      if (msg.type === 'illustrate_step') {
        if (msg.viz_actions?.length > 0) {
          const normalized = normalizeVizActions(msg.viz_actions);
          applyActions(normalized);
        }
        if (msg.narration) {
          processMessage({
            type: 'segment_start',
            segment_id: 'illustrate_' + Date.now(),
            narration: msg.narration,
            phase: '',
            viz_actions: [],
          });
        }
      }
      if (msg.type === 'rewind_step_narration') {
        processMessage({
          type: 'segment_start',
          segment_id: 'rewind_' + Date.now(),
          narration: msg.narration,
          phase: 'Replaying step...',
          viz_actions: [],
        });
      }
      if (msg.type === 'audio_flush') {
        audioPlayer.flush();
      }

      // Session gate messages
      if (msg.type === 'session_status') {
        setGateStatus(msg);
      }
      if (msg.type === 'session_limit_reached') {
        setGateStatus({ allowed: false, count: msg.count, limit: msg.limit, capReached: msg.capReached, subscribed: msg.subscribed, billingEnabled: msg.billingEnabled });
        reset();
      }
      if (msg.type === 'api_key_result') {
        if (msg.action === 'deleted') {
          setKeyDeletionResult(msg);
          if (msg.success) {
            track('byok_key_deleted', {});
            sendRef.current?.({ type: 'check_session_status' });
          }
        } else {
          setApiKeyResult(msg);
          track('byok_key_submitted', { success: !!msg.success });
          if (msg.success) {
            sendRef.current?.({ type: 'check_session_status' });
          }
        }
      }
      if (msg.type === 'session_resumed') {
        console.log('[App] Session resumed after reconnection');
        setTtsMuted(false);
      }
      if (msg.type === 'session_ended') {
        // Server confirmed session is fully terminated — flush any lingering audio
        audioPlayer.flush();
        audioPlayer.stop();
      }
      if (msg.type === 'tts_auto_disabled') {
        setTtsMuted(true);
        sendRef.current?.({ type: 'set_tts_muted', muted: true });
        setTtsToast('Voice narration temporarily unavailable. Continuing with text only.');
        setTimeout(() => setTtsToast(null), 6000);
      }
      if (msg.type === 'credits_exhausted') {
        setShowCreditsModal(true);
      }
      if (msg.type === 'lc_parsed') {
        // Preserve the original problemText (set at submit time) so the
        // no-viz fallback banner can include it in /api/viz-request.
        setLcParsed((prev) => ({ ...msg, problemText: prev?.problemText ?? null }));
      }
      if (msg.type === 'lc_viz_ready') {
        if (msg.tier) setVizTier(msg.tier);
        if (msg.renderer === 'graph') {
          const graphPanelId = vizPanelsRef.current?.find(p => p.renderer === 'graph')?.id || 'graph';
          if (msg.input?.graph) {
            loadGraphImmediate(graphPanelId, msg.input.graph);
          } else {
            // No graph in input (e.g. backtracking builds tree from trace init step).
            // Initialize an empty Cytoscape canvas so add_node/add_edge actions land correctly.
            loadGraphImmediate(graphPanelId, { nodes: [], edges: [], directed: false });
          }
        }
        // For string renderer: store the input string so we can re-initialize after guided_start resets.
        if (msg.renderer === 'string' && msg.input?.s) {
          lcStringInputRef.current = msg.input.s;
        }
        // context renderer: no main viz panel needed — panels are set up when agent calls run_algorithm
      }
      if (msg.type === 'guided_start') {
        // Preserve lcParsed for no-viz LC sessions so VizRequestBanner can mount.
        // Without this guard, the banner gate (App.jsx:602) sees lcParsed === null
        // and never renders the "Request a visualization" CTA — capturing zero
        // demand signal for problems in the orphaned-classifier set (Sudoku, etc.).
        setLcParsed((prev) => (prev && prev.has_viz === false ? prev : null));
      }
      if (msg.type === 'highlight_problem') {
        // Companion page-highlight (eng review 2026-06-09): relay to the extension
        // content script over the private MessagePort. INSTANT NACK when the port
        // isn't here yet (model can call the tool on turn 1, before the handshake)
        // or the post throws — otherwise the server eats its full 2s ack timeout.
        const port = embedAuthPortRef.current;
        let relayed = false;
        if (port) {
          try {
            port.postMessage({ type: 'relu_highlight', id: msg.id, quote: msg.quote ?? null, clear: !!msg.clear });
            relayed = true;
          } catch { /* port closed (overlay tearing down) */ }
        }
        if (!relayed && !msg.clear) {
          sendRef.current?.({ type: 'highlight_result', id: msg.id, anchored: false, method: null, visible: false, reason: 'no-port' });
        }
      }
      if (msg.type === 'lc_sessions_listed') {
        setLcSessions(msg.sessions || []);
      }
      if (msg.type === 'lc_mastered') {
        setLcSessions(prev => prev.map(s => s.id === msg.sessionId ? { ...s, mastered: true } : s));
      }
    },
    [processMessage, dispatchContext, audioPlayer, reset]
  );

  const onBinary = useCallback(
    (data) => {
      console.log('[Audio] Binary frame received,', data.byteLength, 'bytes');
      audioPlayer.enqueuePCM(data);
    },
    [audioPlayer]
  );

  // Only connect WebSocket when auth is ready (or if Supabase isn't configured)
  const wsEnabled = !supabase || !!user;
  const { send, connected } = useWebSocket(onMessage, onBinary, wsEnabled);
  sendRef.current = send;

  // Shared start/resume lifecycle for both the web app and the leetcode overlay
  // (eng D6). companionMode threads through startLesson into the one server prompt.
  const { startLesson, resumeLesson, sessionStartRef } = useLessonSession({ send, reset, audioPlayer });

  // Check session gate status on connect
  useEffect(() => {
    if (connected && user) send({ type: 'check_session_status' });
  }, [connected, user, send]);

  // Re-check the gate whenever the user returns to the tab — e.g. after paying
  // in the Stripe popup (Checkout can't be framed, so it opens a top-level tab).
  // The webhook has already synced the subscription server-side; this re-asks so
  // the embed panel unlocks the moment the user switches back, without a reload.
  useEffect(() => {
    if (!connected || !user) return;
    const recheck = () => { if (!document.hidden) send({ type: 'check_session_status' }); };
    document.addEventListener('visibilitychange', recheck);
    return () => document.removeEventListener('visibilitychange', recheck);
  }, [connected, user, send]);

  // Returning from Stripe Checkout (?checkout=success|cancel). The webhook has
  // already synced the subscription in the success case; the on-connect
  // check_session_status above refreshes the gate. Just acknowledge + clean URL.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const checkout = params.get('checkout');
    if (!checkout) return;
    track(checkout === 'success' ? 'checkout_completed' : 'checkout_canceled', {});
    if (checkout === 'success') {
      // popup=1 marks the embed checkout popup tab (set server-side on the
      // success_url). Its job is done once payment completes, so close it and
      // drop the user straight back to the leetcode panel — which re-checks the
      // gate on focus. window.close() only works on script-opened tabs, so the
      // standalone web tab is an automatic no-op; if the browser refuses, fall
      // back to a clear "you can close this" message.
      if (params.get('popup') === '1') {
        setCheckoutToast('Subscription active — closing this tab…');
        setTimeout(() => {
          window.close();
          setCheckoutToast('Subscription active — you can close this tab and return to LeetCode.');
        }, 1200);
      } else {
        setCheckoutToast('Subscription active — welcome to ReLU Pro!');
        setTimeout(() => setCheckoutToast(null), 6000);
      }
    }
    params.delete('checkout');
    params.delete('popup');
    const rest = params.toString();
    window.history.replaceState({}, '', window.location.pathname + (rest ? `?${rest}` : ''));
  }, []);

  const handleSelectAlgorithm = useCallback(
    (algorithm, data) => {
      setVizTier(null);
      setLcParsed({ loading: true, problemText: data.problemText });
      // companionMode comes from the overlay opener intent ("Nudge me" → true);
      // directWalkthrough comes from "Show me how it works" → skip intake, jump to viz.
      // The web app omits both (false → paste-to-learn walkthrough with STAGE 0 intake).
      startLesson({ problemText: data.problemText, companionMode: data.companionMode, directWalkthrough: data.directWalkthrough });
    },
    [startLesson]
  );

  // --- EMBED MODE (Chrome extension overlay spike, step 2) ---------------
  // Loaded as `/?embed=1#n=NONCE` inside the leetcode extension iframe.
  // Timing-robust handshake:
  //   - announce `relu_embed_ready` to the parent on mount AND on every
  //     connection change, so the content script hears it regardless of auth,
  //   - accept the extracted problem via postMessage (origin + source + nonce),
  //     stash it, and auto-start the lesson the moment the WS is connected
  //     (i.e. right after the user signs in inside the frame).
  // Full no-op outside embed mode.
  //
  // AUTH (eng D5): the parent content script owns the Supabase session and hands
  // it in over a direct origin-targeted postMessage (safe from page-world reads).
  // The rotated session goes back out over a transferred MessagePort so the
  // access_token never touches the shared window 'message' bus. This is the
  // "production TOKEN channel must use a transferred MessagePort" hardening the
  // spike deferred — now implemented (see extension/content.js handshake).
  //
  // The SAME private port also carries the companion page-highlight traffic
  // (relu_highlight out, relu_highlight_result back — eng review 2026-06-09):
  // not because highlights are secret, but because the port is the one channel
  // that already exists, stays off the page-world bus, and dies with the overlay.
  const embedMode = new URLSearchParams(window.location.search).get('embed') === '1';
  const embedNonce = (window.location.hash.match(/[#&]n=([^&]+)/) || [])[1] || null;
  const embedStartedRef = useRef(false);
  const embedPendingProblemRef = useRef(null);
  // embedAuthPortRef is declared up top (next to the companion refs) so the WS
  // message handler can relay highlight commands over it.
  const [embedTick, setEmbedTick] = useState(0);
  // Flips true when the embed loading state has spun past its grace period
  // without the lesson starting — drives the retry UI instead of an infinite
  // spinner (investigate 2026-06-16).
  const [embedTimedOut, setEmbedTimedOut] = useState(false);

  // Opener intent (design Pass 1/2): 'nudge' → no-spoiler companion, 'showme' →
  // viz-first walkthrough. Intent is PER-OPEN, deliberately NOT persisted.
  // Re-asking on every overlay open (fresh iframe mount → null → opener shows) is
  // the point: a remembered 'showme' would hit the student with the answer the
  // instant they open a DIFFERENT problem they wanted to work through — spoiler by
  // default, and no way to switch back to nudge (bug: /investigate 2026-06-15,
  // the old localStorage 'relu_embed_intent' seed locked the first pick forever).
  const [embedIntent, setEmbedIntent] = useState(null);

  const chooseEmbedIntent = useCallback((intent) => {
    track('companion_intent_chosen', { intent }); // eng D4 funnel: the activation gate
    setEmbedIntent(intent);
  }, []);

  // Mark the companion funnel active only on the no-spoiler nudge path. Reset the
  // once-flags so a new problem (fresh overlay) re-arms each rung.
  useEffect(() => {
    companionActiveRef.current = embedMode && embedIntent === 'nudge';
    if (!companionActiveRef.current) {
      companionFunnelRef.current = { nudgeGiven: false, structureShown: false, solutionShown: false };
    }
  }, [embedMode, embedIntent]);

  // Re-gate the context panels between lessons: a fresh problem starts at idle, so a
  // returning/restarted nudge lesson hides its panels again until the next reveal.
  useEffect(() => {
    if (state.status === 'idle') setKeyInsightRevealed(false);
  }, [state.status]);

  // The in-rail "State · expand" disclosure asks the content script to go fullscreen
  // (the iframe can't resize its own rail). Mirrors the highlight relay over the port.
  const requestExpand = useCallback(() => {
    try { embedAuthPortRef.current?.postMessage({ type: 'relu_request_expand' }); } catch { /* port closed */ }
  }, []);

  // Latest auth session, mirrored to a ref so the message handler can post the
  // current session the instant the port arrives (no wait for the next render).
  const sessionRef = useRef(session);
  sessionRef.current = session;

  useEffect(() => {
    if (embedMode) console.log('[ReLU embed] embed mode ACTIVE, nonce=', embedNonce);
  }, [embedMode, embedNonce]);

  // Push the current session to the background worker over the private port, so a
  // first in-frame login and every supabase-js token rotation are persisted there.
  const postSessionToWorker = useCallback((s) => {
    const port = embedAuthPortRef.current;
    if (!port || !s?.access_token || !s?.refresh_token) return;
    try {
      port.postMessage({
        type: 'relu_session_update',
        session: { access_token: s.access_token, refresh_token: s.refresh_token },
      });
    } catch {
      /* port closed (overlay tearing down) */
    }
  }, []);

  // Receive the auth session + problem from the parent (any time, before or after auth).
  useEffect(() => {
    if (!embedMode) return;
    const ALLOWED_PARENT_ORIGINS = ['https://leetcode.com', 'http://localhost:5173'];
    function onParentMessage(e) {
      if (!ALLOWED_PARENT_ORIGINS.includes(e.origin)) return;
      if (e.source !== window.parent) return;
      const d = e.data;
      if (!d) return;
      if (embedNonce && d.nonce !== embedNonce) {
        console.warn('[ReLU embed] nonce mismatch — ignoring message');
        return;
      }

      // Background-owned auth: store the private return port and adopt the session
      // so the user is signed in without a re-login. setSession refreshes the
      // access_token from the refresh_token if it has expired (cold-worker case).
      if (d.type === 'relu_auth_token') {
        if (e.ports && e.ports[0]) {
          embedAuthPortRef.current = e.ports[0];
          // Inbound traffic on the private port: highlight acks from the content
          // script, forwarded to the server as the id-checked highlight_result.
          embedAuthPortRef.current.onmessage = (ev) => {
            const m = ev.data;
            if (m?.type === 'relu_highlight_result') {
              sendRef.current?.({ type: 'highlight_result', id: m.id, anchored: m.anchored, method: m.method ?? null, visible: m.visible === true });
            }
          };
          // If we already hold a session (e.g. partitioned storage persisted one),
          // push it now so the worker's copy is current the moment the port lands.
          postSessionToWorker(sessionRef.current);
        }
        if (d.session?.access_token && d.session?.refresh_token && supabase) {
          console.log('[ReLU embed] adopting background-owned session');
          supabase.auth
            .setSession({ access_token: d.session.access_token, refresh_token: d.session.refresh_token })
            .then(({ error }) => {
              if (error) {
                console.warn('[ReLU embed] setSession failed:', error.message);
                // Dead stored session (refresh token expired/invalidated): tell the
                // worker to drop it so it stops re-injecting a corpse on every open.
                // Session stays null, so the overlay falls through to the login form.
                try { embedAuthPortRef.current?.postMessage({ type: 'relu_session_clear' }); } catch { /* port closed */ }
              }
            });
        } else {
          console.log('[ReLU embed] no stored session — login UI will show once, then persist');
        }
        return;
      }

      if (d.type === 'relu_problem') {
        if (!d.problemText || typeof d.problemText !== 'string') return;
        console.log('[ReLU embed] problem received (connected=' + connected + ')');
        embedPendingProblemRef.current = d.problemText;
        setEmbedTick((t) => t + 1); // re-trigger the start effect below
      }
    }
    window.addEventListener('message', onParentMessage);
    return () => window.removeEventListener('message', onParentMessage);
  }, [embedMode, embedNonce, connected, postSessionToWorker]);

  // Whenever the auth session changes inside the overlay (first login, token
  // refresh/rotation), persist it back to the background worker.
  useEffect(() => {
    if (!embedMode) return;
    postSessionToWorker(session);
  }, [embedMode, session, postSessionToWorker]);

  // Announce readiness on mount and whenever the connection flips. Ready ping
  // carries NO nonce (parent page-world scripts could read it); the parent
  // replies with the problem + nonce targeted at our origin.
  useEffect(() => {
    if (!embedMode) return;
    try {
      window.parent.postMessage({ type: 'relu_embed_ready' }, '*');
      console.log('[ReLU embed] sent ready ping (connected=' + connected + ')');
    } catch {
      /* not framed */
    }
  }, [embedMode, connected]);

  // Start the lesson once we have a pending problem, a live connection, AND the
  // student has chosen an intent (or a remembered choice seeded it). companionMode
  // is the no-spoiler nudge path; 'showme' is the viz-first walkthrough.
  useEffect(() => {
    if (!embedMode || embedStartedRef.current) return;
    if (!connected || !embedPendingProblemRef.current || !embedIntent) return;
    embedStartedRef.current = true;
    console.log('[ReLU embed] starting lesson (intent=' + embedIntent + ')');
    handleSelectAlgorithm(null, {
      problemText: embedPendingProblemRef.current,
      companionMode: embedIntent === 'nudge',
      directWalkthrough: embedIntent === 'showme',
    });
  }, [embedMode, connected, embedTick, embedIntent, handleSelectAlgorithm]);

  // Safety net for the embed loading screen. "Loading your problem…" only clears
  // when the server answers start_leetcode. If that message is dropped on a
  // socket flap, or no problem was ever extracted (premium/locked page), the
  // panel would otherwise spin forever with no retry and no feedback — the
  // silent dead-end behind the prior "stuck on loading" reports. Arm a grace
  // timer whenever the spinner is up; if the lesson still hasn't started, flip
  // to the retry UI (investigate 2026-06-16).
  const embedSpinnerUp =
    embedMode && !!embedIntent && state.status === 'idle' &&
    !(gateStatus && !gateStatus.allowed) && !embedTimedOut;
  useEffect(() => {
    if (!embedSpinnerUp) return;
    const t = setTimeout(() => setEmbedTimedOut(true), 12000);
    return () => clearTimeout(t);
  }, [embedSpinnerUp]);

  // Manual retry after a stuck/failed embed start. Transient socket drops now
  // auto-recover (start_leetcode is queued and flushes on reconnect); this is
  // the backstop for "server never answered" and "no problem extracted". Re-ping
  // the parent so content.js re-sends the problem if it has one, then let the
  // start effect fire again. We only re-arm a fresh start WHEN CONNECTED — if
  // we're offline a queued start is already waiting to flush, and re-arming
  // would double it.
  const retryEmbedStart = useCallback(() => {
    track('companion_loading_retry', { connected });
    setEmbedTimedOut(false);
    reset();
    try { window.parent.postMessage({ type: 'relu_embed_ready' }, '*'); } catch { /* not framed */ }
    if (connected) {
      embedStartedRef.current = false;
      setEmbedTick((t) => t + 1);
    }
  }, [reset, connected]);

  const handleResumeConversation = useCallback(
    (conversationId) => {
      resumeLesson(conversationId);
    },
    [resumeLesson]
  );

  const handleGuidedResponse = useCallback(
    (response) => {
      track('question_answered', { answer_mode: state.guidedOptions?.mode });
      flushActiveTimeline();
      if (state.guidedOptions?.prompt) {
        processMessage({ type: 'add_guided_question', text: state.guidedOptions.prompt });
      }
      if (typeof response === 'object' && response.optionIds) {
        // Multi-select response
        const displayText = response.labels.join(', ');
        processMessage({ type: 'add_guided_answer', text: displayText });
        send({ type: 'guided_response', optionIds: response.optionIds, labels: response.labels });
      } else {
        const displayText = response.text || response.label || String(response);
        processMessage({ type: 'add_guided_answer', text: displayText });
        if (typeof response === 'object' && response.text) {
          send({ type: 'guided_response', text: response.text });
        } else if (typeof response === 'object' && response.optionId) {
          send({ type: 'guided_response', optionId: response.optionId });
        } else {
          send({ type: 'guided_response', optionId: response });
        }
      }
      processMessage({ type: 'clear_guided_options' });
      // Auto-resume if paused
      send({ type: 'resume' });
      processMessage({ type: 'resumed' });
    },
    [send, processMessage, state.guidedOptions]
  );

  const handleGuidedMessage = useCallback(
    (text, source) => {
      // companion_escalation_requested was RETIRED 2026-06-12 for FREEFORM follow-ups
      // (a typed reply could be an answer, a decline, or an acceptance — indistinguishable).
      // E-UX (2026-06-13) un-retires it ONLY for chip/stuck taps, which ARE distinguishable
      // (see handleOfferChip / handleStuck). `source` rides the message for server-side
      // correlation; consent itself still rides the model (the text is an explicit ask).
      processMessage({ type: 'add_student_message', text });
      flushActiveTimeline();
      audioPlayer.flush();
      send({ type: 'guided_message', text, ...(source ? { source } : {}) });
      // Auto-resume if paused
      send({ type: 'resume' });
      processMessage({ type: 'resumed' });
    },
    [send, processMessage, audioPlayer]
  );

  // E-UX: the student taps an offered-rung chip. We send an explicit consent SENTENCE
  // (client-owned copy) through the normal message channel — the tutor reads it as
  // consent via its own rules; NO server-side "this is consent" flag.
  const handleOfferChip = useCallback(
    (modality) => {
      const chip = OFFER_CHIPS[modality];
      if (!chip) return;
      track('companion_escalation_requested', { via: 'chip', modality });
      handleGuidedMessage(chip.consent, 'chip');
    },
    [handleGuidedMessage]
  );

  // E-UX: "I'm stuck" sends a standalone bid for help. The doctrine treats it as consent
  // for the next OFFERED rung (not a direct hint), so it can't outrun the ladder.
  const handleStuck = useCallback(() => {
    track('companion_escalation_requested', { via: 'stuck' });
    handleGuidedMessage(STUCK_MESSAGE, 'stuck');
  }, [handleGuidedMessage]);

  const handlePause = useCallback(() => {
    track('pause_used', {});
    flushActiveTimeline();
    send({ type: 'pause' });
    audioPlayer.flush();
  }, [send, audioPlayer]);

  const handleSkip = useCallback(() => {
    track('skip_used', {});
    flushActiveTimeline();
    send({ type: 'skip' });
    audioPlayer.flush();
  }, [send, audioPlayer]);

  const handleResume = useCallback(() => {
    send({ type: 'resume' });
    processMessage({ type: 'resumed' });
  }, [send, processMessage]);

  const handleIndependentWorkSubmit = useCallback(
    (text) => {
      processMessage({ type: 'add_student_message', text: `[Independent work submission]\n${text}` });
      dispatchContext({ type: 'CLEAR_INDEPENDENT_WORK' });
      send({ type: 'guided_message', text });
      send({ type: 'resume' });
    },
    [send, processMessage, dispatchContext]
  );

  const handleKeepGuiding = useCallback(() => {
    dispatchContext({ type: 'CLEAR_INDEPENDENT_WORK' });
    send({ type: 'skip' });
  }, [send, dispatchContext]);

  const handleRevealHint = useCallback(
    (hintIndex) => {
      dispatchContext({ type: 'REVEAL_HINT', hintIndex });
    },
    [dispatchContext]
  );

  const handleInterrupt = useCallback(
    (question) => {
      track('interrupt_asked', { question_length: question.length });
      interrupt(question);
      audioPlayer.flush();
      processMessage({ type: 'clear_guided_options' });
      send({ type: 'interrupt', question });
      send({ type: 'resume' });
    },
    [send, interrupt, processMessage, audioPlayer]
  );

  const handleRestart = useCallback(() => {
    if (state.status !== 'idle') {
      if (state.status !== 'complete') {
        const duration = sessionStartRef.current
          ? Math.round((Date.now() - sessionStartRef.current) / 1000)
          : undefined;
        track('session_abandoned', {
          mode: state.mode, algorithm: state.algorithm,
          segment_count: state.segmentCount, duration_seconds: duration,
        });
      }
      send({ type: 'end_session' });
      setPendingFeedback({ mode: state.mode, algorithm: state.algorithm });
    }
    sessionStartRef.current = null;
    audioPlayer.flush();
    audioPlayer.stop();
    setLcParsed(null);
    setVizTier(null);
    reset();
  }, [reset, send, audioPlayer, state.status, state.mode, state.algorithm, state.segmentCount]);

  const handleMasterLcSession = useCallback(
    (sessionId) => {
      send({ type: 'lc_master_session', sessionId });
    },
    [send]
  );

  const handleSpeedChange = useCallback(
    (multiplier) => {
      track('speed_changed', { multiplier });
      send({ type: 'set_speed', multiplier });
    },
    [send]
  );

  const handleTtsMuteToggle = useCallback(() => {
    setTtsMuted((prev) => {
      const next = !prev;
      track('tts_toggled', { muted: next });
      send({ type: 'set_tts_muted', muted: next });
      if (next) audioPlayer.flush(); // Immediately stop any playing audio
      return next;
    });
  }, [send, audioPlayer]);

  const handleElementClick = useCallback((refText) => {
    const inputEl = insertRefHolder.current?.current;
    if (inputEl && inputEl._insertAtCursor) {
      inputEl._insertAtCursor(refText);
    }
  }, []);

  const registerInsertRef = useCallback((ref) => {
    insertRefHolder.current = ref;
  }, []);

  const handleClearHistory = useCallback(() => {
    dispatchContext({ type: 'CLEAR_LOADED_CONVERSATION' });
  }, [dispatchContext]);

  // --- EXTENSION AUTH HANDOFF (frictionless Google sign-in) ------------------
  // This relu.run tab was opened by the overlay's "Continue with Google" because
  // Google can't be framed inside leetcode. We sign in top-level here, then post the
  // session to bridge.js, which relays it to the extension (background-owned session).
  // All the decision logic lives in lib/extAuth.js (pure + tested); this is wiring.
  const urlExtAuth = new URLSearchParams(EXT_AUTH_INITIAL_SEARCH).get('ext_auth');
  // OAuth-return signal captured at module load (see top of file). The marker lives in
  // localStorage (not sessionStorage — that doesn't survive the cross-origin OAuth
  // round-trip) and is honored only while returning from OAuth, so a stale marker can't
  // hijack a plain load.
  const [returningFromOAuth] = useState(EXT_AUTH_RETURNING);
  let storedExtAuth = null;
  try { storedExtAuth = readExtAuthMarker(localStorage.getItem(EXT_AUTH_KEY), Date.now()); } catch { /* storage blocked */ }
  const extAuthProvider = resolveExtAuthProvider(urlExtAuth, storedExtAuth, returningFromOAuth);
  const [extHandoffDone, setExtHandoffDone] = useState(false);
  const extTriggeredRef = useRef(false);

  useEffect(() => {
    // Wait for auth to settle before deciding trigger vs handoff: otherwise a slow
    // getSession() lets the trigger fire, then a late session flips us to handoff which
    // clears the marker — a race that strands the return tap.
    if (!extAuthProvider || !supabase || authLoading) return;
    const action = extAuthAction({
      provider: extAuthProvider,
      hasSession: !!(session?.access_token && session?.refresh_token),
      returningFromOAuth,
    });

    if (action === 'handoff') {
      // Hand the session to bridge.js (same-origin postMessage). closeTab asks the worker
      // to remove THIS tab from the extension side — the page's own window.close() is
      // blocked after an OAuth redirect. We never fall back to the web app: extHandoffDone
      // keeps the "signed in, close this tab" screen up.
      // Retry the post briefly: a fast first-visit handoff (already signed into the web
      // app, no OAuth round-trip) can fire BEFORE bridge.js finishes its document_idle
      // injection, and a dropped post would strand the tab signed-in while the extension
      // waits. The worker closes the tab on receipt, so the page unmounts and the retries
      // stop on their own.
      console.log('[ReLU ext_auth] handoff → posting session to bridge (closeTab=true)');
      const payload = { type: 'relu_ext_session', closeTab: true, session: { access_token: session.access_token, refresh_token: session.refresh_token } };
      window.postMessage(payload, window.location.origin);
      const retry = setInterval(() => window.postMessage(payload, window.location.origin), 300);
      setTimeout(() => clearInterval(retry), 3000);
      try { localStorage.removeItem(EXT_AUTH_KEY); } catch { /* storage blocked */ }
      setExtHandoffDone(true);
      return () => clearInterval(retry);
    }
    if (action === 'trigger' && !extTriggeredRef.current) {
      // Carry the marker in BOTH the redirect URL (?ext_auth — survives the cross-origin
      // round-trip when the Supabase redirect allowlist permits it; primary) AND
      // localStorage (fallback). Either lets the return tab recognize itself; the URL is
      // immune to the storage-eviction that was stranding us.
      extTriggeredRef.current = true;
      try { localStorage.setItem(EXT_AUTH_KEY, extAuthMarker(extAuthProvider, Date.now())); } catch { /* storage blocked */ }
      supabase.auth
        .signInWithOAuth({ provider: extAuthProvider, options: { redirectTo: extAuthTabUrl(window.location.origin, extAuthProvider) } })
        .then(({ error }) => { if (error) console.warn('[ReLU ext_auth] OAuth start failed:', error.message); });
    }
  }, [extAuthProvider, session, returningFromOAuth, authLoading]);

  // Handoff screen — short-circuits the normal app while this tab exists only to
  // complete sign-in for the overlay.
  if (extAuthProvider || extHandoffDone) {
    const sp = new URLSearchParams(window.location.search);
    const hp = new URLSearchParams((window.location.hash || '').replace(/^#/, ''));
    const screen = extHandoffDone
      ? 'signed-in'
      : extAuthScreen({
          provider: extAuthProvider,
          hasUser: !!user,
          returningFromOAuth,
          oauthError: sp.get('error') || hp.get('error'),
        });
    return (
      <div className="h-screen flex items-center justify-center bg-surface-0 p-6">
        <div className="text-text-secondary text-sm font-body text-center max-w-xs">{EXT_AUTH_SCREEN_TEXT[screen]}</div>
      </div>
    );
  }

  // Auth gate: if Supabase is configured, require login
  if (supabase) {
    if (authLoading) {
      return (
        <div className="h-screen flex items-center justify-center bg-surface-0">
          <div className="text-text-tertiary text-sm font-body">Loading...</div>
        </div>
      );
    }
    if (!user) {
      return <AuthModal embed={embedMode} />;
    }
  }

  const showSelector = state.status === 'idle' || state.status === 'error';
  const useVizLayout = state.vizPanels && (
    state.vizPanels.length > 1 || state.vizPanels.some((p) => p.renderer !== 'graph')
  );
  const noVis = !state.graph && (!state.vizPanels || state.vizPanels.length === 0);

  // Companion reveal-gate (design /plan-design-review 2026-06-15): in nudge mode the
  // context panels can spoil the hint ladder — TRAVERSAL LOG prints the answer order,
  // QUEUE shows the mechanism, pseudocode hints the approach — so suppress ALL of them
  // until the tutor reports it revealed the key insight. Concept / "show me" / web-app
  // modes are never gated. Everything below derives from this gated list, so a fresh
  // nudge lesson shows just graph + transcript until the reveal.
  const companionNudge = embedIntent === 'nudge';
  const visibleContextPanels = selectVisibleContextPanels(state.contextPanels, { companionNudge, keyInsightRevealed });
  const contextOnly = noVis && visibleContextPanels.length > 0;
  const transcriptOnly = noVis && visibleContextPanels.length === 0 && !showSelector;

  // Split context panels: pseudocode lives alongside the viz; state panels live in the sidebar
  const pseudocodePanel = visibleContextPanels.find(p => p.type === 'pseudocode') || null;
  const statePanels = visibleContextPanels.filter(p => p.type !== 'pseudocode');

  return (
    <LazyMotion features={domAnimation}>
    <>
    <div className="h-screen flex flex-col bg-surface-0 font-body">
      {/* Header */}
      <header className="flex items-center justify-between px-5 py-2.5 border-b border-border bg-surface-1">
        <div className="flex items-center gap-3">
          <Logo size="sm" />
          <span className="text-[10px] font-medium text-accent/70 bg-accent-muted px-1.5 py-0.5 rounded-full">beta</span>
          {state.algorithm && (
            <span className="text-sm text-text-secondary font-body">
              {state.algorithm.charAt(0).toUpperCase() + state.algorithm.slice(1)}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          {!showSelector && (
            <ReportBugButton
              algorithmKey={state.algorithm}
              problemText={lcParsed?.problemText || null}
              userEmail={user?.email}
            />
          )}
          {!showSelector && (
            <button
              onClick={() => setShowExitConfirm(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-text-secondary hover:text-text-primary bg-surface-2 hover:bg-surface-3 border border-border rounded-lg transition-colors"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
                <path fillRule="evenodd" d="M17 4.25A2.25 2.25 0 0014.75 2h-5.5A2.25 2.25 0 007 4.25v2a.75.75 0 001.5 0v-2a.75.75 0 01.75-.75h5.5a.75.75 0 01.75.75v11.5a.75.75 0 01-.75.75h-5.5a.75.75 0 01-.75-.75v-2a.75.75 0 00-1.5 0v2A2.25 2.25 0 009.25 18h5.5A2.25 2.25 0 0017 15.75V4.25z" clipRule="evenodd" />
                <path fillRule="evenodd" d="M14 10a.75.75 0 00-.75-.75H3.704l1.048-.943a.75.75 0 10-1.004-1.114l-2.5 2.25a.75.75 0 000 1.114l2.5 2.25a.75.75 0 101.004-1.114l-1.048-.943h9.546A.75.75 0 0014 10z" clipRule="evenodd" />
              </svg>
              Exit
            </button>
          )}
          {user && (
            <>
              <span className="text-xs text-text-tertiary">{user.email}</span>
              <span className="text-text-tertiary">·</span>
              <button
                onClick={() => setShowSettings(true)}
                className="text-xs text-text-tertiary hover:text-text-secondary transition-colors"
                title="Settings"
              >
                Settings
              </button>
              <span className="text-text-tertiary">·</span>
              <button
                onClick={signOut}
                className="text-xs text-text-tertiary hover:text-text-secondary transition-colors"
              >
                Sign Out
              </button>
            </>
          )}
          <div
            className={`w-2 h-2 rounded-full ${connected ? 'bg-green-500' : 'bg-red-500'}`}
            title={connected ? 'Connected' : 'Disconnected'}
          />
        </div>
      </header>

      {/* Main content */}
      {/* Below md (the 520px companion rail) the viz+chat split stacks vertically —
          viz top, tutor below (design review 2026-06-11; the 06-04 doc's intent).
          The other branches are single flex-1 children, indifferent to direction. */}
      <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
        {showSelector ? (
          <div className="flex-1 relative">
            {gateStatus && !gateStatus.allowed ? (
              <SessionGate
                count={gateStatus.count}
                limit={gateStatus.limit}
                send={send}
                apiKeyResult={apiKeyResult}
                onKeySuccess={() => setGateStatus((prev) => ({ ...prev, allowed: true, hasByok: true }))}
                billingEnabled={!!gateStatus.billingEnabled}
                capReached={!!gateStatus.capReached}
                subscribed={!!gateStatus.subscribed}
              />
            ) : embedMode ? (
              // Embed mode: never show the landing. Show the two-choice opener
              // until the student picks an intent (or a remembered choice seeds
              // it), then a clean loading state until the lesson kicks out of idle.
              // If the start handshake silently fails (dropped start_leetcode, no
              // problem extracted, or a server error), offer a retry instead of
              // spinning forever (investigate 2026-06-16).
              !embedIntent ? (
                <CompanionOpener
                  onChoose={chooseEmbedIntent}
                  problemTitle={lcParsed?.title || null}
                />
              ) : (embedTimedOut || state.status === 'error') ? (
                <div className="h-full flex flex-col items-center justify-center gap-3 bg-surface-0 px-6 text-center">
                  <div className="text-text-secondary text-sm font-body">Couldn’t start the lesson.</div>
                  <div className="text-text-tertiary text-xs font-body max-w-xs">
                    {connected
                      ? 'This problem may be premium or locked, or the connection hiccupped.'
                      : 'You appear to be offline — reconnecting. Try again in a moment.'}
                  </div>
                  <button
                    onClick={retryEmbedStart}
                    className="mt-1 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-surface-0 transition-colors hover:bg-accent-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface-0"
                  >
                    Try again
                  </button>
                </div>
              ) : (
                <div className="h-full flex items-center justify-center bg-surface-0">
                  <div className="text-text-tertiary text-sm font-body">Loading your problem…</div>
                </div>
              )
            ) : (
              <LandingTabs
                onSelect={handleSelectAlgorithm}
                disabled={!connected}
                send={send}
                conversations={state.conversations}
                lcSessions={lcSessions}
                loadedConversation={state.loadedConversation}
                viewingHistory={state.viewingHistory}
                onClearHistory={handleClearHistory}
                processMessage={processMessage}
                onResumeConversation={handleResumeConversation}
                lcParsed={lcParsed}
                onMasterLcSession={handleMasterLcSession}
              />
            )}
            {pendingFeedback && (
              <SessionFeedback
                mode={pendingFeedback.mode}
                algorithm={pendingFeedback.algorithm}
                onDismiss={() => setPendingFeedback(null)}
              />
            )}
          </div>
        ) : transcriptOnly ? (
          <div className="flex-1 flex flex-col items-center overflow-hidden">
            <div className="w-full max-w-2xl flex flex-col flex-1 overflow-hidden">
              {/* No-viz fallback: classifier returned null OR a broken algo.
                  Tutor still runs (text-only). The CTA moved from a permanent
                  banner here to VizRequestToast mounted at App level — same
                  demand-signal capture, no layout coupling, no transcript clutter. */}
              <div className="flex-1 overflow-hidden">
                <Transcript segments={state.segments} agentStatus={state.agentStatus} onOfferChip={handleOfferChip} centered />
              </div>
              <Controls
                status={state.status}
                agentStatus={state.agentStatus}
                onInterrupt={handleInterrupt}
                onPause={handlePause}
                onSkip={handleSkip}
                onResume={handleResume}
                onRestart={handleRestart}
                onSpeedChange={handleSpeedChange}
                onTtsMuteToggle={handleTtsMuteToggle}
                ttsMuted={ttsMuted}
                explanationMode={state.explanationMode}
                guidedOptions={state.guidedOptions}
                onGuidedResponse={handleGuidedResponse}
                mode={state.mode}
                onGuidedMessage={handleGuidedMessage}
                companion={embedIntent === 'nudge'}
                onStuck={handleStuck}
                guidedPrompt={state.guidedPrompt}
                registerInsertRef={registerInsertRef}
                independentWork={state.independentWork}
                onIndependentWorkSubmit={handleIndependentWorkSubmit}
                onKeepGuiding={handleKeepGuiding}
                onRevealHint={handleRevealHint}
              />
            </div>
          </div>
        ) : contextOnly ? (
          <div className="flex-1 flex flex-col items-center overflow-hidden">
            <div className="w-full max-w-2xl flex flex-col flex-1 overflow-hidden">
              <ResizableSplit
                initialRatio={0.35}
                className="flex-1"
                top={<ContextPanelHost panels={visibleContextPanels} className="h-full overflow-auto max-h-[40vh]" />}
                bottom={<Transcript segments={state.segments} agentStatus={state.agentStatus} onOfferChip={handleOfferChip} centered />}
              />
              <Controls
                status={state.status}
                agentStatus={state.agentStatus}
                onInterrupt={handleInterrupt}
                onPause={handlePause}
                onSkip={handleSkip}
                onResume={handleResume}
                onRestart={handleRestart}
                onSpeedChange={handleSpeedChange}
                onTtsMuteToggle={handleTtsMuteToggle}
                ttsMuted={ttsMuted}
                explanationMode={state.explanationMode}
                guidedOptions={state.guidedOptions}
                onGuidedResponse={handleGuidedResponse}
                mode={state.mode}
                onGuidedMessage={handleGuidedMessage}
                companion={embedIntent === 'nudge'}
                onStuck={handleStuck}
                guidedPrompt={state.guidedPrompt}
                registerInsertRef={registerInsertRef}
                independentWork={state.independentWork}
                onIndependentWorkSubmit={handleIndependentWorkSubmit}
                onKeepGuiding={handleKeepGuiding}
                onRevealHint={handleRevealHint}
              />
            </div>
          </div>
        ) : (
          <>
            {/* Left (stacked: top): visualization + optional pseudocode section */}
            <div className="w-full md:w-2/3 h-[45%] md:h-full overflow-hidden border-b md:border-b-0 md:border-r border-border flex flex-col">
              {/* Viz — expands to fill when no pseudocode, or takes ~62% when pseudocode exists */}
              <div className="overflow-hidden min-h-0" style={{ flex: pseudocodePanel ? '3 3 0' : '1 1 0' }}>
                {useVizLayout ? (
                  <VizLayout
                    key={state.algorithm}
                    panels={state.vizPanels}
                    explanationMode={state.explanationMode}
                    segmentCount={state.segmentCount}
                    rewindStep={state.rewindStep}
                    algorithm={state.algorithm}
                    residualEdges={state.latestResidualEdges}
                    residualToggle={state.residualToggle}
                    onElementClick={handleElementClick}
                  />
                ) : (
                  <GraphRenderer
                    key={state.algorithm}
                    rendererId={state.vizPanels?.[0]?.id || 'graph'}
                    graph={state.graph}
                    phase={state.currentPhase}
                    explanationMode={state.explanationMode}
                    segmentCount={state.segmentCount}
                    algorithm={state.algorithm}
                    residualEdges={state.latestResidualEdges}
                    residualToggle={state.residualToggle}
                    onElementClick={handleElementClick}
                  />
                )}
              </div>

              {/* Pseudocode section — only when algorithm has a pseudocode panel */}
              {pseudocodePanel && (
                <>
                  <div className="h-px bg-border flex-shrink-0" />
                  <div className="overflow-y-auto min-h-0 bg-gray-950 flex flex-col" style={{ flex: '2 2 0' }}>
                    <div className="px-4 py-2 border-b border-gray-800 shrink-0">
                      <span className="text-[11px] font-medium uppercase tracking-wide" style={{ color: 'var(--color-text-secondary, #9a9690)' }}>
                        {pseudocodePanel.title || 'Algorithm'}
                      </span>
                    </div>
                    <div className="p-2 flex-1">
                      <PseudocodePanel data={pseudocodePanel.data} />
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* Right (stacked: bottom): state panels (capped) + transcript + controls */}
            <div className="w-full md:w-1/3 flex-1 md:flex-none min-h-0 flex flex-col overflow-hidden bg-surface-1">
              {statePanels.length > 0 && (
                <>
                  {/* In the embed rail the panels are hidden below md (the sidebar
                      width) and restored when expanded to fullscreen; on the
                      standalone web app they always show. */}
                  <div className={`flex-shrink-0 border-b border-border overflow-y-auto ${embedMode ? 'hidden md:block' : ''}`} style={{ maxHeight: 200 }}>
                    <ContextPanelHost panels={statePanels} />
                  </div>
                  {/* Sidebar disclosure (embed, narrow only): names the live state
                      that's been collapsed and expands the rail to reveal it. Safe to
                      expose because statePanels are already reveal-gated upstream. */}
                  {embedMode && (
                    <button
                      type="button"
                      onClick={requestExpand}
                      title="Expand to see the live state panels"
                      className="md:hidden flex items-center justify-between gap-2 px-3 py-2 border-b border-border bg-surface-1 text-xs text-text-tertiary hover:text-text-primary hover:bg-surface-2 transition-colors"
                    >
                      <span className="flex items-center gap-1.5 min-w-0">
                        <span aria-hidden="true">▸</span>
                        <span className="font-medium uppercase tracking-wide shrink-0">State</span>
                        <span className="truncate text-text-tertiary normal-case">{statePanels.map((p) => p.title).filter(Boolean).join(', ')}</span>
                      </span>
                      <span className="flex items-center gap-1 text-accent font-medium shrink-0">expand <span aria-hidden="true">⤢</span></span>
                    </button>
                  )}
                </>
              )}
              <div className="flex-1 overflow-hidden">
                <Transcript segments={state.segments} agentStatus={state.agentStatus} onOfferChip={handleOfferChip} />
              </div>
              <Controls
                status={state.status}
                agentStatus={state.agentStatus}
                onInterrupt={handleInterrupt}
                onPause={handlePause}
                onSkip={handleSkip}
                onResume={handleResume}
                onRestart={handleRestart}
                onSpeedChange={handleSpeedChange}
                onTtsMuteToggle={handleTtsMuteToggle}
                ttsMuted={ttsMuted}
                explanationMode={state.explanationMode}
                guidedOptions={state.guidedOptions}
                onGuidedResponse={handleGuidedResponse}
                mode={state.mode}
                onGuidedMessage={handleGuidedMessage}
                companion={embedIntent === 'nudge'}
                onStuck={handleStuck}
                guidedPrompt={state.guidedPrompt}
                registerInsertRef={registerInsertRef}
                independentWork={state.independentWork}
                onIndependentWorkSubmit={handleIndependentWorkSubmit}
                onKeepGuiding={handleKeepGuiding}
                onRevealHint={handleRevealHint}
              />
            </div>
          </>
        )}
      </div>
    </div>
    <div className="h-px" />
    {showExitConfirm && (
      <ExitConfirmModal
        mode={state.mode}
        onConfirm={() => {
          setShowExitConfirm(false);
          handleRestart();
        }}
        onCancel={() => setShowExitConfirm(false)}
      />
    )}
    {showCreditsModal && (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
        <div className="bg-surface-1 border border-border rounded-xl p-6 max-w-md w-full mx-4 shadow-xl">
          <SessionGate
            count={0}
            limit={0}
            send={send}
            apiKeyResult={apiKeyResult}
            billingEnabled={!!gateStatus?.billingEnabled}
            onKeySuccess={() => {
              setShowCreditsModal(false);
              setApiKeyResult(null);
              processMessage({ type: 'clear_guided_options' });
            }}
          />
          <button
            onClick={() => setShowCreditsModal(false)}
            className="mt-3 w-full text-center text-xs text-text-tertiary hover:text-text-secondary transition-colors"
          >
            Dismiss
          </button>
        </div>
      </div>
    )}
    {ttsToast && (
      <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-surface-2 border border-border text-text-secondary text-sm px-4 py-2.5 rounded-lg shadow-lg animate-fade-in">
        {ttsToast}
      </div>
    )}
    {checkoutToast && (
      <div className="fixed top-6 left-1/2 -translate-x-1/2 z-50 bg-surface-2 border border-accent/40 text-text-primary text-sm px-4 py-2.5 rounded-lg shadow-lg animate-fade-in">
        {checkoutToast}
      </div>
    )}
    <SettingsModal
      open={showSettings}
      onClose={() => setShowSettings(false)}
      send={send}
      hasByok={!!gateStatus?.hasByok}
      subscribed={!!gateStatus?.subscribed}
      billingEnabled={!!gateStatus?.billingEnabled}
      deletionResult={keyDeletionResult}
      onKeyDeleted={() => setKeyDeletionResult(null)}
      saveResult={apiKeyResult}
      onKeySaved={() => setApiKeyResult(null)}
    />
    <VizErrorToast algorithmKey={state.algorithm} />
    <VizTierToast vizTier={vizTier} algorithmKey={state.algorithm} />
    <VizRequestToast lcParsed={lcParsed} userEmail={user?.email} />
    </>
    </LazyMotion>
  );
}
