import { useCallback, useEffect, useRef, useState } from 'react';
import { LazyMotion, domAnimation } from 'motion/react';
import VizLayout from './components/VizLayout';
import GraphRenderer from './components/renderers/GraphRenderer';
import Transcript from './components/Transcript';
import Controls from './components/Controls';
import LandingTabs from './components/LandingTabs';
import AuthModal from './components/AuthModal';
import SessionFeedback from './components/SessionFeedback';
import SessionGate from './components/SessionGate';
import ContextPanelHost from './components/context/ContextPanelHost';
import ContextOverlay from './components/context/ContextOverlay';
import PseudocodePanel from './components/context/PseudocodePanel';
import ResizableSplit from './components/ResizableSplit';
import ExitConfirmModal from './components/ExitConfirmModal';
import Logo from './components/Logo';
import { useWebSocket } from './hooks/useWebSocket';
import { useAudioPlayer } from './hooks/useAudioPlayer';
import { useAuth } from './hooks/useAuth';
import { useTutorState, normalizeVizActions } from './hooks/useTutorState';
import { applyActions, applyAction, applyActionsSequenced, killActiveTimeline, flushActiveTimeline, loadGraphImmediate } from './lib/rendererRegistry';
import { initContextManager, destroyContextManager } from './lib/contextManager';
import { supabase } from './lib/supabase';
import { posthog, POSTHOG_KEY } from './lib/posthog';

const track = (event, props) => POSTHOG_KEY && posthog.capture(event, props);

export default function App() {
  const { session, user, loading: authLoading, signOut } = useAuth();
  const { state, processMessage, interrupt, reset, dispatchContext } = useTutorState();
  const audioPlayer = useAudioPlayer();
  const [ttsMuted, setTtsMuted] = useState(false);
  const [pendingFeedback, setPendingFeedback] = useState(null);
  const [showExitConfirm, setShowExitConfirm] = useState(false);
  const [gateStatus, setGateStatus] = useState(null);
  const [apiKeyResult, setApiKeyResult] = useState(null);
  const [ttsToast, setTtsToast] = useState(null);
  const [showCreditsModal, setShowCreditsModal] = useState(false);
  const [lcParsed, setLcParsed] = useState(null);
  const [lcSessions, setLcSessions] = useState([]);
  const [vizTier, setVizTier] = useState(null);
  const sessionStartRef = useRef(null);
  const insertRefHolder = useRef(null);
  const sendRef = useRef(null);

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
        setGateStatus({ allowed: false, count: msg.count, limit: msg.limit });
        reset();
      }
      if (msg.type === 'api_key_result') {
        setApiKeyResult(msg);
        if (msg.success) {
          track('byok_key_submitted', { success: true });
        } else {
          track('byok_key_submitted', { success: false });
        }
      }
      if (msg.type === 'interest_registered') {
        track('would_pay_registered', {});
      }
      if (msg.type === 'session_resumed') {
        console.log('[App] Session resumed after reconnection');
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
      if (msg.type === 'independent_work') {
        processMessage({
          type: 'INDEPENDENT_WORK',
          checkpoint_summary: msg.checkpoint_summary,
          task_description: msg.task_description,
          hints: msg.hints,
        });
      }
      if (msg.type === 'lc_parsed') {
        setLcParsed(msg);
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
        setLcParsed(null);
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

  // Check session gate status on connect
  useEffect(() => {
    if (connected && user) send({ type: 'check_session_status' });
  }, [connected, user, send]);

  const handleSelectAlgorithm = useCallback(
    (algorithm, data) => {
      audioPlayer.init(); // Must be from user gesture
      reset();
      setVizTier(null);
      sessionStartRef.current = Date.now();

      if (algorithm === 'leetcode') {
        track('leetcode_started', {});
        setLcParsed({ loading: true });
        send({ type: 'start_leetcode', problemText: data.problemText });
        return;
      }

      track('session_started', {
        mode: algorithm === 'guided' ? 'guided' : 'explain',
        algorithm,
      });
      const msg = {
        type: algorithm === 'explain' ? 'start_explain' : 'start_guided',
        problemText: data.problemText,
      };
      if (data.imageBase64) {
        msg.imageBase64 = data.imageBase64;
        msg.imageMimeType = data.imageMimeType;
      }
      send(msg);
    },
    [send, reset, audioPlayer]
  );

  const handleResumeConversation = useCallback(
    (conversationId) => {
      audioPlayer.init(); // Must be from user gesture to unlock AudioContext
      reset();
      sessionStartRef.current = Date.now();
      track('conversation_resumed', {});
      send({ type: 'resume_conversation', conversationId });
    },
    [send, reset, audioPlayer]
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
    (text) => {
      processMessage({ type: 'add_student_message', text });
      flushActiveTimeline();
      audioPlayer.flush();
      send({ type: 'guided_message', text });
      // Auto-resume if paused
      send({ type: 'resume' });
      processMessage({ type: 'resumed' });
    },
    [send, processMessage, audioPlayer]
  );

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
      processMessage({ type: 'CLEAR_INDEPENDENT_WORK' });
      send({ type: 'guided_message', text });
      send({ type: 'resume' });
    },
    [send, processMessage]
  );

  const handleKeepGuiding = useCallback(() => {
    processMessage({ type: 'CLEAR_INDEPENDENT_WORK' });
    send({ type: 'skip' });
  }, [send, processMessage]);

  const handleRevealHint = useCallback(
    (hintIndex) => {
      processMessage({ type: 'REVEAL_HINT', hintIndex });
    },
    [processMessage]
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
      return <AuthModal />;
    }
  }

  const showSelector = state.status === 'idle' || state.status === 'error';
  const useVizLayout = state.vizPanels && (
    state.vizPanels.length > 1 || state.vizPanels.some((p) => p.renderer !== 'graph')
  );
  const noVis = !state.graph && (!state.vizPanels || state.vizPanels.length === 0);
  const contextOnly = noVis && state.contextPanels.length > 0;
  const transcriptOnly = noVis && state.contextPanels.length === 0 && !showSelector;

  // Split context panels: pseudocode lives alongside the viz; state panels live in the sidebar
  const pseudocodePanel = state.contextPanels.find(p => p.type === 'pseudocode') || null;
  const statePanels = state.contextPanels.filter(p => p.type !== 'pseudocode');

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
          {vizTier === 2 && !showSelector && (
            <span
              title="This problem type doesn't have a hand-written trace, so Argmax generated one on-the-fly using AI. It may be less polished than built-in visualizations."
              className="text-[10px] font-medium text-amber-600/80 bg-amber-50 dark:bg-amber-900/20 dark:text-amber-400/80 border border-amber-200 dark:border-amber-800/40 px-1.5 py-0.5 rounded-full cursor-help"
            >
              live viz
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
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
      <div className="flex-1 flex overflow-hidden">
        {showSelector ? (
          <div className="flex-1 relative">
            {gateStatus && !gateStatus.allowed ? (
              <SessionGate
                count={gateStatus.count}
                limit={gateStatus.limit}
                send={send}
                apiKeyResult={apiKeyResult}
                onKeySuccess={() => setGateStatus((prev) => ({ ...prev, allowed: true, hasByok: true }))}
              />
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
              <div className="flex-1 overflow-hidden">
                <Transcript segments={state.segments} agentStatus={state.agentStatus} centered />
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
                top={<ContextPanelHost panels={state.contextPanels} className="h-full overflow-auto max-h-[40vh]" />}
                bottom={<Transcript segments={state.segments} agentStatus={state.agentStatus} centered />}
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
            {/* Left: visualization + optional pseudocode section */}
            <div className="w-2/3 h-full overflow-hidden border-r border-border flex flex-col">
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

            {/* Right: state panels (capped) + transcript + controls */}
            <div className="w-1/3 flex flex-col overflow-hidden bg-surface-1">
              {statePanels.length > 0 && (
                <div className="flex-shrink-0 border-b border-border overflow-y-auto" style={{ maxHeight: 200 }}>
                  <ContextPanelHost panels={statePanels} />
                </div>
              )}
              <div className="flex-1 overflow-hidden">
                <Transcript segments={state.segments} agentStatus={state.agentStatus} />
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
    </>
    </LazyMotion>
  );
}
