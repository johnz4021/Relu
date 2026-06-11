import 'dotenv/config';
import express from 'express';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import { parse as parseUrl } from 'url';
import path from 'path';
import { fileURLToPath } from 'url';
import { DEFAULT_GRAPH } from './algorithms.js';
import { startGuidedSession, resumeGuidedSession } from './guidedAgent.js';
import { resolveHighlightResult, abortHighlightWait } from './agentLib.js';
import { resetTTSDisabled } from './tts.js';
import Anthropic from '@anthropic-ai/sdk';
import { verifyJWT } from './supabase.js';
import { createConversation, listConversations, loadConversationMessages, loadAgentState, countConversations, getUserSettings, saveUserSettings, saveFeedback, createLcSession, masterLcSession, listLcSessions } from './db.js';
import { parseLeetcodeProblem } from './leetcodeAgent.js';
import { ALGORITHMS, runRegisteredAlgorithm, runAlgorithmWithFallback } from './algorithms/registry.js';
import { encrypt, decrypt } from './crypto.js';
import { KEY_VALIDATION_MODEL } from './models.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
const server = createServer(app);

// Serve static client build
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'client', 'dist')));

// Feedback / help request endpoint
app.post('/api/feedback', (req, res) => {
  const { name, email, message, category } = req.body;
  console.log(`[Feedback] From: ${name || 'anonymous'} <${email || 'no email'}>\n  ${message}`);

  const detected = category
    || (message && message.startsWith('[Algorithm Request]') ? 'algorithm_request' : 'help');
  saveFeedback(detected, { name, email, message, meta: req.body.meta });

  res.json({ ok: true });
});

// Session feedback endpoint
app.post('/api/session-feedback', (req, res) => {
  const { rating, message, mode, algorithm } = req.body;
  console.log(`[SessionFeedback] rating=${rating} mode=${mode} algo=${algorithm}`);
  saveFeedback('session_rating', { rating, message, meta: { mode, algorithm } });
  res.json({ ok: true });
});

// Bug report endpoint — fired from the always-available "Report bug" button
// in the lesson-page header. Catches everything VizErrorToast can't auto-detect:
// wrong tutor hints, weird animations, "this looks off", confusion, suggestions.
// Severity values: broken | confusing | suggestion.
app.post('/api/bug-report', (req, res) => {
  const { email, algorithm, problem_text, severity, description, user_agent, viewport, url_path } = req.body;
  console.log(`[BugReport] sev=${severity} algo=${algorithm} from=${email || 'anonymous'}: ${(description || '').slice(0, 200)}`);
  saveFeedback('bug_report', {
    email,
    message: description || '',
    meta: {
      severity: severity || 'unknown',
      algorithm: algorithm || null,
      problem_text: problem_text || null,
      user_agent: user_agent || null,
      viewport: viewport || null,
      url_path: url_path || null,
    },
  });
  res.json({ ok: true });
});

// Viz error endpoint — fired from VizErrorToast when a user clicks "Report"
// after a renderer crash or never-mounted timeout. Logs to feedback table
// with category='viz_error'. Lets us prioritize fixes from real signal.
//
// Kinds:
//   "apply_failed"  — renderer.apply threw (undefined param, etc.)
//   "never_mounted" — actions buffered for >5s with no renderer registration
app.post('/api/viz-error', (req, res) => {
  const { algorithm, renderer, kind, action, message } = req.body;
  console.log(`[VizError] kind=${kind} algo=${algorithm} renderer=${renderer} action=${action}: ${message}`);
  saveFeedback('viz_error', {
    message: message || '',
    meta: {
      algorithm: algorithm || null,
      renderer: renderer || null,
      kind: kind || null,
      action: action || null,
    },
  });
  res.json({ ok: true });
});

// Viz request endpoint — fired from the "no viz available" fallback when a user
// pastes a LeetCode problem we don't classify (or we classify into a `broken: true`
// algo). Lets us prioritize which deferred algos to fix based on real demand.
//
// Reasons:
//   "no_match"      — classifier returned null algorithm_key
//   "low_confidence"— classifier returned algo but confidence < 0.7
//   "broken_algo"   — classifier picked an algo flagged broken in registry
//   "user_request"  — user clicked "Request a visualization" button explicitly
app.post('/api/viz-request', (req, res) => {
  const { email, problem_text, classified_algo, classification_confidence, reason } = req.body;
  console.log(`[VizRequest] reason=${reason} classified=${classified_algo || 'null'} from=${email || 'anonymous'}`);
  saveFeedback('viz_request', {
    email,
    message: problem_text || '',
    meta: {
      classified_algo: classified_algo || null,
      classification_confidence: classification_confidence ?? null,
      reason: reason || 'user_request',
    },
  });
  res.json({ ok: true });
});

const authEnabled = !!(process.env.SUPABASE_URL && process.env.SUPABASE_SECRET_KEY);

// Use noServer so we handle the upgrade ourselves — avoids Vite proxy ECONNRESET noise
const wss = new WebSocketServer({ noServer: true });

const PORT = process.env.PORT || 3001;

const FREE_SESSION_LIMIT = 50;

const sessions = new Map();
const sessionsByUserId = new Map();

async function checkSessionGate(session) {
  if (!session.userId) return { allowed: true };
  const count = await countConversations(session.userId);
  if (count < FREE_SESSION_LIMIT) return { allowed: true, remaining: FREE_SESSION_LIMIT - count };
  const settings = await getUserSettings(session.userId);
  if (settings?.anthropic_api_key_encrypted) return { allowed: true, byok: true };
  return { allowed: false, count };
}

function generateId() {
  return Math.random().toString(36).slice(2, 10);
}

// Handle HTTP upgrade manually
server.on('upgrade', async (req, socket, head) => {
  if (authEnabled) {
    try {
      const { query } = parseUrl(req.url, true);
      const token = query.token;

      if (!token) {
        socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
        socket.destroy();
        return;
      }

      const user = await verifyJWT(token);
      if (!user) {
        socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
        socket.destroy();
        return;
      }

      req.user = user;
    } catch (err) {
      console.error('[WS] Auth error during upgrade:', err.message);
      socket.write('HTTP/1.1 500 Internal Server Error\r\n\r\n');
      socket.destroy();
      return;
    }
  }

  wss.handleUpgrade(req, socket, head, (ws) => {
    wss.emit('connection', ws, req);
  });
});

function attachHandlers(ws, session) {
  ws.on('message', async (data) => {
    try {
      const msg = JSON.parse(data.toString());
      console.log(`[WS] Received:`, msg.type);

      switch (msg.type) {
        case 'guided_response': {
          if (!session.active) {
            console.warn(`[WS] guided_response dropped — session inactive (${session.userEmail || session.id})`);
            ws.send(JSON.stringify({ type: 'error', message: 'Session ended unexpectedly. Please start a new session.' }));
            ws.send(JSON.stringify({ type: 'session_ended' }));
            return;
          }
          session.guidedResponse = { optionId: msg.optionId, optionIds: msg.optionIds, labels: msg.labels, text: msg.text, timestamp: Date.now() };
          if (session.guidedResponseResolver) {
            session.guidedResponseResolver();
            session.guidedResponseResolver = null;
          } else {
            session.pendingGuidedResponses.push(session.guidedResponse);
          }
          // Auto-resume if paused so the response gets processed immediately
          if (session.pauseResolver) {
            session.pauseResolver();
            session.pauseResolver = null;
          }
          break;
        }

        case 'guided_message': {
          if (!session.active) {
            console.warn(`[WS] guided_message dropped — session inactive (${session.userEmail || session.id})`);
            ws.send(JSON.stringify({ type: 'error', message: 'Session ended unexpectedly. Please start a new session.' }));
            ws.send(JSON.stringify({ type: 'session_ended' }));
            return;
          }
          session.guidedMessageQueue.push(msg.text);
          session.interruptAbortFlag = true;
          // If the agent is waiting for a response (send_options), resolve it with the freeform text
          if (session.guidedResponseResolver) {
            session.guidedResponse = { text: msg.text, timestamp: Date.now() };
            session.guidedResponseResolver();
            session.guidedResponseResolver = null;
          } else if (session.followUpResolver) {
            // Follow-up question after lesson completion — pull from queue to avoid double-injection
            session.guidedMessageQueue.pop();
            session.followUpResolver(msg.text);
            session.followUpResolver = null;
          }
          // If paused, auto-resume so the student message gets processed immediately
          if (session.pauseResolver) {
            session.pauseResolver();
            session.pauseResolver = null;
          }
          break;
        }

        case 'interrupt': {
          if (!session.active) return;
          session.interruptFlag = {
            question: msg.question,
            timestamp: Date.now(),
          };
          session.interruptAbortFlag = true;
          console.log(`[WS] Interrupt queued: "${msg.question}"`);
          // Unblock guided response promise if waiting
          if (session.guidedResponseResolver) {
            session.guidedResponseResolver('__interrupted__');
            session.guidedResponseResolver = null;
          }
          // Unblock follow-up wait — treat as a follow-up question
          if (session.followUpResolver) {
            session.interruptFlag = null; // don't double-inject as interrupt
            session.followUpResolver(msg.question);
            session.followUpResolver = null;
          }
          break;
        }

        case 'highlight_result': {
          // Page-highlight ack from the embed app (companion mode). The id-checked
          // resolver in agentLib drops stale acks from timed-out calls.
          if (!resolveHighlightResult(session, msg)) {
            console.log(`[WS] highlight_result dropped (id=${msg.id}, no matching pending highlight)`);
          }
          break;
        }

        case 'end_session': {
          if (!session.active) {
            console.log(`[WS] end_session ignored — session not active (mode=${session.mode}, gen=${session.runGeneration})`);
            return;
          }
          console.log(`[WS] End session requested (mode=${session.mode}, gen=${session.runGeneration}, pauseResolver=${!!session.pauseResolver}, guidedResponseResolver=${!!session.guidedResponseResolver}, followUpResolver=${!!session.followUpResolver})`);
          session.endSessionFlag = true;
          session.pauseFlag = true; // unblock TTS waits
          // Unblock any pause wait
          if (session.pauseResolver) {
            session.pauseResolver();
            session.pauseResolver = null;
          }
          // Unblock guided response wait
          if (session.guidedResponseResolver) {
            session.guidedResponseResolver('__end_session__');
            session.guidedResponseResolver = null;
          }
          // Unblock follow-up wait
          if (session.followUpResolver) {
            session.followUpResolver('__end_session__');
            session.followUpResolver = null;
          }
          // Unblock a pending page-highlight ack wait
          abortHighlightWait(session);
          break;
        }

        case 'pause': {
          if (!session.active) return;
          session.pauseFlag = true;
          console.log(`[WS] Pause requested`);
          break;
        }

        case 'resume': {
          if (session.pauseResolver) {
            session.pauseResolver();
            session.pauseResolver = null;
          }
          console.log(`[WS] Resume requested`);
          break;
        }

        case 'skip': {
          if (!session.active) return;
          session.skipFlag = true;
          console.log(`[WS] Skip requested`);
          break;
        }

        case 'set_speed': {
          session.speedMultiplier = msg.multiplier || 1;
          break;
        }

        case 'set_tts_muted': {
          session.ttsMuted = !!msg.muted;
          console.log(`[WS] TTS muted: ${session.ttsMuted}`);
          break;
        }

        case 'list_conversations': {
          if (!session.userId) {
            ws.send(JSON.stringify({ type: 'conversations_list', conversations: [] }));
            return;
          }
          const conversations = await listConversations(session.userId);
          ws.send(JSON.stringify({ type: 'conversations_list', conversations }));
          break;
        }

        case 'load_conversation': {
          const messages = await loadConversationMessages(msg.conversationId);
          ws.send(JSON.stringify({ type: 'conversation_loaded', messages }));
          break;
        }

        case 'resume_conversation': {
          console.log(`[WS] resume_conversation received (active=${session.active}, endSessionFlag=${session.endSessionFlag}, mode=${session.mode}, gen=${session.runGeneration})`);
          if (session.active) {
            console.log(`[WS] resume_conversation — force-terminating old session (mode=${session.mode}, gen=${session.runGeneration})`);
            session.endSessionFlag = true;
            session.pauseFlag = true;
            if (session.pauseResolver) { session.pauseResolver(); session.pauseResolver = null; }
            if (session.guidedResponseResolver) { session.guidedResponseResolver('__end_session__'); session.guidedResponseResolver = null; }
            if (session.followUpResolver) { session.followUpResolver('__end_session__'); session.followUpResolver = null; }
            abortHighlightWait(session);
          }
          session.active = false;
          session.endSessionFlag = false;
          session.pauseFlag = false;
          session.skipFlag = false;
          session.runGeneration++;
          session.currentGraph = null;
          session.currentTrace = null;
          session._emittedTraceSteps = [];
          const resumeGen = session.runGeneration;
          {
            const gate = await checkSessionGate(session);
            if (!gate.allowed) {
              ws.send(JSON.stringify({ type: 'session_limit_reached', count: gate.count, limit: FREE_SESSION_LIMIT }));
              return;
            }
            if (gate.byok) {
              const settings = await getUserSettings(session.userId);
              const apiKey = decrypt(settings.anthropic_api_key_encrypted);
              session.anthropicClient = new Anthropic({ apiKey, maxRetries: 5 });
            }
          }

          const agentState = await loadAgentState(msg.conversationId);
          if (!agentState) {
            ws.send(JSON.stringify({ type: 'error', message: 'No saved agent state for this conversation' }));
            return;
          }

          // Send transcript to client for display
          const transcript = await loadConversationMessages(msg.conversationId);
          ws.send(JSON.stringify({ type: 'conversation_loaded', messages: transcript }));

          session.active = true;
          session.mode = 'guided';
          session.conversationId = msg.conversationId;

          try {
            await resumeGuidedSession(session, agentState.messages_json, agentState.solver_result_json, agentState.viz_state_json);
          } catch (err) {
            if (err.message === '__end_session__') {
              console.log('[GuidedAgent] Resumed session ended by user');
            } else {
              console.error('[GuidedAgent] Resume error:', err);
              if (session.ws.readyState === 1) session.ws.send(JSON.stringify({ type: 'error', message: 'Resume failed: ' + err.message }));
            }
          }
          if (session.runGeneration === resumeGen) {
            session.active = false;
            session.endSessionFlag = false;
            session.mode = 'direct';
            session.followUpResolver = null;
            session.followUpSent = false;
            session.conversationId = null;
            if (session.ws.readyState === 1) session.ws.send(JSON.stringify({ type: 'session_ended' }));
          }
          break;
        }

        case 'save_api_key': {
          if (!session.userId) {
            ws.send(JSON.stringify({ type: 'api_key_result', success: false, error: 'Not authenticated' }));
            return;
          }
          const key = msg.apiKey?.trim();
          if (!key || !key.startsWith('sk-ant-')) {
            ws.send(JSON.stringify({ type: 'api_key_result', success: false, error: 'Invalid API key format. Key should start with sk-ant-' }));
            return;
          }
          // Test the key with a cheap API call
          try {
            const testClient = new Anthropic({ apiKey: key });
            await testClient.messages.create({
              model: KEY_VALIDATION_MODEL,
              max_tokens: 1,
              messages: [{ role: 'user', content: 'hi' }],
            });
          } catch (err) {
            console.error('[WS] API key validation failed:', err.message);
            ws.send(JSON.stringify({ type: 'api_key_result', success: false, error: 'API key validation failed. Please check your key.' }));
            return;
          }
          // Encrypt and store
          const encrypted = encrypt(key);
          await saveUserSettings(session.userId, { anthropic_api_key_encrypted: encrypted });
          // Update the active session's Anthropic client so the new key is used immediately
          session.anthropicClient = new Anthropic({ apiKey: key, maxRetries: 5 });
          ws.send(JSON.stringify({ type: 'api_key_result', success: true }));
          break;
        }

        case 'delete_api_key': {
          if (!session.userId) {
            ws.send(JSON.stringify({ type: 'api_key_result', success: false, action: 'deleted', error: 'Not authenticated' }));
            return;
          }
          await saveUserSettings(session.userId, { anthropic_api_key_encrypted: null });
          // Drop the active client so the next session falls back to the server key (or the paywall)
          session.anthropicClient = null;
          ws.send(JSON.stringify({ type: 'api_key_result', success: true, action: 'deleted' }));
          break;
        }

        case 'register_interest': {
          if (!session.userId) return;
          // Auth-tied "would pay" intent → user_settings (existing schema).
          // Comments column kept populated with wedge_other for backward-compat
          // with anything reading it; full structured payload also goes to
          // feedback table for queryable analysis.
          await saveUserSettings(session.userId, {
            would_pay: true,
            would_pay_amount: msg.amount || null,
            other_classes: msg.otherClasses || null,
            comments: msg.wedgeOther || msg.comments || null,
          });
          // Survey signal → feedback table with category='gate_survey'. Lets
          // us run group-by queries on which wedge selections drive intent
          // without polluting user_settings with N more columns per question.
          saveFeedback('gate_survey', {
            email: session.userEmail || null,
            message: msg.problemContext || '',
            meta: {
              amount: msg.amount || null,
              other_classes: msg.otherClasses || null,
              wedge_selections: Array.isArray(msg.wedgeSelections) ? msg.wedgeSelections : [],
              wedge_other: msg.wedgeOther || null,
              nps_score: typeof msg.npsScore === 'number' ? msg.npsScore : null,
              had_problem_context: !!(msg.problemContext && msg.problemContext.trim()),
            },
          });
          ws.send(JSON.stringify({ type: 'interest_registered' }));
          break;
        }

        case 'check_session_status': {
          if (!session.userId) {
            ws.send(JSON.stringify({ type: 'session_status', allowed: true }));
            return;
          }
          const count = await countConversations(session.userId);
          const settings = await getUserSettings(session.userId);
          const hasByok = !!settings?.anthropic_api_key_encrypted;
          const allowed = count < FREE_SESSION_LIMIT || hasByok;
          ws.send(JSON.stringify({
            type: 'session_status',
            allowed,
            count,
            limit: FREE_SESSION_LIMIT,
            hasByok,
          }));
          break;
        }

        case 'start_leetcode': {
          console.log(`[WS] start_leetcode received (active=${session.active}, gen=${session.runGeneration})`);
          if (session.active) {
            console.log(`[WS] start_leetcode — force-terminating old session (mode=${session.mode}, gen=${session.runGeneration})`);
            session.endSessionFlag = true;
            session.pauseFlag = true;
            if (session.pauseResolver) { session.pauseResolver(); session.pauseResolver = null; }
            if (session.guidedResponseResolver) { session.guidedResponseResolver('__end_session__'); session.guidedResponseResolver = null; }
            if (session.followUpResolver) { session.followUpResolver('__end_session__'); session.followUpResolver = null; }
            abortHighlightWait(session);
          }
          session.active = false;
          session.endSessionFlag = false;
          session.pauseFlag = false;
          session.skipFlag = false;
          session.runGeneration++;
          session.currentGraph = null;
          session.currentTrace = null;
          session._emittedTraceSteps = [];
          const lcGen = session.runGeneration;
          {
            const gate = await checkSessionGate(session);
            if (!gate.allowed) {
              ws.send(JSON.stringify({ type: 'session_limit_reached', count: gate.count, limit: FREE_SESSION_LIMIT }));
              return;
            }
            if (gate.byok) {
              const settings = await getUserSettings(session.userId);
              const apiKey = decrypt(settings.anthropic_api_key_encrypted);
              session.anthropicClient = new Anthropic({ apiKey, maxRetries: 5 });
            }
          }

          // Parse the LeetCode problem
          let parsed;
          try {
            parsed = await parseLeetcodeProblem(msg.problemText, session.anthropicClient);
          } catch (err) {
            console.error('[LeetCode] parseLeetcodeProblem failed:', err.message);
            ws.send(JSON.stringify({ type: 'error', message: 'Failed to parse problem: ' + err.message }));
            return;
          }

          const { title, algorithm_key, confidence, test_case, expected_output, pattern_key, pattern_renderer } = parsed;
          const algoEntry = ALGORITHMS[algorithm_key];
          // ── Viz ladder ──
          // Tier 1: registry trace (deterministic). Tier 2: AI-authored trace for the
          // parser's free-form pattern_key (sandboxed + Example-1 correctness gate inside
          // runAlgorithmWithFallback). Tier 3: no trace — the agent hand-builds viz_actions
          // live through the enforcement ladder (hasViz stays false; run_algorithm filtered).
          const tier1Available = !!(algorithm_key && confidence >= 0.7 && algoEntry?.run);
          const tier2Key = !tier1Available && pattern_key ? pattern_key : null;
          const preRunKey = tier1Available ? algorithm_key : tier2Key;
          let hasViz = false;
          let vizTier = null;

          // Pre-run the trace so client gets viz immediately
          if (preRunKey) {
            try {
              if (tier2Key) {
                // Tier 2 generation is an LLM call (up to 3 authoring attempts). Tell the
                // client (safely ignored if unhandled) and cap the wait — on timeout we
                // degrade to Tier 3 rather than hang the session start.
                ws.send(JSON.stringify({ type: 'lc_generating_viz', algorithm_key: tier2Key }));
              }
              const runPromise = runAlgorithmWithFallback(preRunKey, test_case, { description: title, expectedOutput: expected_output || null });
              const result = tier2Key
                ? await Promise.race([
                    runPromise,
                    new Promise((_, reject) => setTimeout(() => reject(new Error('Tier 2 generation timeout (45s)')), 45_000)),
                  ])
                : await runPromise;
              session._leetcodeTrace = result.trace;
              session._leetcodeRenderer = result.renderer;
              session._leetcodeInput = result.input;
              session._leetcodeTier = result.tier;
              vizTier = result.tier;
              hasViz = true;
              ws.send(JSON.stringify({ type: 'lc_viz_ready', algorithm_key: preRunKey, renderer: result.renderer, trace: result.trace, input: result.input, tier: result.tier }));
            } catch (err) {
              console.warn(`[LeetCode] Failed to pre-run trace (${preRunKey}):`, err.message);
              hasViz = false;
              vizTier = null;
            }
          }

          session.hasViz = hasViz;
          // Tier 2 sessions teach against the pattern_key (run_algorithm resolves it via
          // the Tier 2 cache); Tier 1 uses the registry key; Tier 3 keeps the parsed key
          // (possibly null) — hasViz=false routes those sessions to live-viz mode.
          session._leetcodeAlgorithmKey = hasViz && tier2Key ? tier2Key : algorithm_key;
          session._leetcodePatternKey = pattern_key || null;
          session._leetcodePatternRenderer = pattern_renderer || null;
          session._leetcodeTestCase = test_case;
          session._leetcodeTitle = title;
          session._leetcodeExpectedOutput = expected_output || null;
          session._leetcodeConfidence = confidence;
          session._leetcodeVizTier = vizTier;

          ws.send(JSON.stringify({
            type: 'lc_parsed',
            title,
            algorithm_key,
            confidence,
            has_viz: hasViz,
            viz_tier: vizTier,
            fallback_reason: parsed.fallback_reason || null,
          }));

          session.active = true;
          session.mode = 'leetcode';
          // STUCK COMPANION MODE (eng D2/D6): the in-problem "Nudge me — no spoilers"
          // overlay sets this so the intake/system prompt switches to the no-spoiler
          // escalating-hint frame instead of the paste-to-learn walkthrough.
          session.companionMode = !!msg.companionMode;

          if (session.userId) {
            const convId = await createConversation(session.userId, `[LeetCode] ${title || msg.problemText.slice(0, 100)}`);
            session.conversationId = convId;
            if (convId) {
              ws.send(JSON.stringify({ type: 'conversation_created', conversationId: convId }));
            }
          }

          try {
            await startGuidedSession(session, msg.problemText);
          } catch (err) {
            if (err.message === '__end_session__') {
              console.log('[LeetCode] Session ended by user');
            } else {
              console.error('[LeetCode] Error:', err);
              if (session.ws.readyState === 1) session.ws.send(JSON.stringify({ type: 'error', message: 'LeetCode session failed: ' + err.message }));
            }
          }

          // Write to lc_sessions after session completes
          if (session.userId) {
            await createLcSession(session.userId, title, algorithm_key, confidence, hasViz, {
              solver_succeeded: session._solverSucceeded === true,
              viz_rendered: (session._leetcodeTrace?.length ?? 0) >= 1,
              session_completed: session.followUpSent === true,
            });
          }

          if (session.runGeneration === lcGen) {
            console.log(`[LeetCode] Cleanup: setting active=false (gen=${lcGen})`);
            session.active = false;
            session.endSessionFlag = false;
            session.mode = 'direct';
            session.followUpResolver = null;
            session.followUpSent = false;
            session.conversationId = null;
            session.hasViz = false;
            session._leetcodeTrace = null;
            session._leetcodeRenderer = null;
            session._leetcodeInput = null;
            session._leetcodeAlgorithmKey = null;
            session._leetcodeTestCase = null;
            session._leetcodeTitle = null;
            session._leetcodeConfidence = null;
            session._leetcodePatternKey = null;
            session._leetcodePatternRenderer = null;
            session._solverSucceeded = false;
            if (session.ws.readyState === 1) session.ws.send(JSON.stringify({ type: 'session_ended' }));
          } else {
            console.log(`[LeetCode] Cleanup skipped — gen mismatch (mine=${lcGen}, current=${session.runGeneration})`);
          }
          break;
        }

        case 'lc_master_session': {
          if (!session.userId) return;
          masterLcSession(msg.sessionId, session.userId);
          ws.send(JSON.stringify({ type: 'lc_mastered', sessionId: msg.sessionId }));
          break;
        }

        case 'list_lc_sessions': {
          if (!session.userId) {
            ws.send(JSON.stringify({ type: 'lc_sessions_listed', sessions: [] }));
            return;
          }
          const lcSessionsList = await listLcSessions(session.userId);
          ws.send(JSON.stringify({ type: 'lc_sessions_listed', sessions: lcSessionsList }));
          break;
        }
      }
    } catch (err) {
      console.error('[WS] Message parse error:', err);
    }
  });

  ws.on('close', () => {
    console.log(`[WS] Client disconnected: ${session.id} (active=${session.active})`);

    if (session.active) {
      // Grace period: keep session alive for 60s to allow reconnection
      session.wsDisconnectedAt = Date.now();
      session.graceTimer = setTimeout(() => {
        console.log(`[WS] Grace period expired for ${session.id}, cleaning up`);
        session.active = false;
        if (session.followUpResolver) {
          session.followUpResolver('__timeout__');
          session.followUpResolver = null;
        }
        sessions.delete(session.id);
        if (session.userId) {
          sessionsByUserId.delete(session.userId);
        }
        // Try to notify client if somehow still connected
        if (session.ws.readyState === 1) {
          session.ws.send(JSON.stringify({ type: 'session_ended' }));
        }
      }, 15 * 60 * 1000); // 15 minutes — covers sleep, tab switching, network changes
    } else {
      // No active lesson — clean up immediately
      sessions.delete(session.id);
      if (session.userId) {
        const existing = sessionsByUserId.get(session.userId);
        if (existing === session) {
          sessionsByUserId.delete(session.userId);
        }
      }
    }
  });
}

wss.on('connection', (ws, req) => {
  const user = req.user || null;
  const userId = user?.id || null;

  // Check for an existing session that's in the grace period (disconnected but active)
  if (userId) {
    const existingSession = sessionsByUserId.get(userId);
    if (existingSession && existingSession.active && existingSession.wsDisconnectedAt) {
      // Reconnect: swap in the new WebSocket
      console.log(`[WS] Reconnecting user ${user.email} to session ${existingSession.id} (disconnected ${Date.now() - existingSession.wsDisconnectedAt}ms ago)`);
      clearTimeout(existingSession.graceTimer);
      existingSession.graceTimer = null;
      existingSession.wsDisconnectedAt = null;
      existingSession.ws = ws;
      // Reset TTS state so audio works fresh after reconnect
      resetTTSDisabled();
      existingSession.ttsMuted = false;
      attachHandlers(ws, existingSession);
      ws.send(JSON.stringify({ type: 'session_resumed' }));
      return;
    }
  }

  // Create a new session
  const sessionId = generateId();
  const session = {
    id: sessionId,
    ws,
    userId,
    userEmail: user?.email || null,
    interruptFlag: null,
    pauseFlag: false,
    skipFlag: false,
    pauseResolver: null,
    endSessionFlag: false,
    active: false,
    mode: 'direct',
    speedMultiplier: 1,
    ttsMuted: false,
    guidedResponse: null,
    guidedResponseResolver: null,
    pendingGuidedResponses: [],
    guidedMessageQueue: [],
    followUpResolver: null,
    followUpSent: false,
    conversationId: null,
    runGeneration: 0,
  };
  sessions.set(sessionId, session);
  if (userId) {
    sessionsByUserId.set(userId, session);
  }
  console.log(`[WS] Client connected: ${sessionId}${user ? ` (${user.email})` : ''}`);

  attachHandlers(ws, session);
});

// SPA fallback — serve index.html for all non-API routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'client', 'dist', 'index.html'));
});

server.listen(PORT, () => {
  console.log(`[Server] ReLU running on http://localhost:${PORT}`);
  if (authEnabled) {
    console.log(`[Server] Auth enabled (Supabase)`);
  } else {
    console.log(`[Server] Auth disabled (no Supabase credentials)`);
  }
});
