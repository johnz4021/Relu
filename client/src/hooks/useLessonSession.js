import { useCallback, useRef } from 'react';
import { track } from '../lib/posthog';


// Shared lesson-session lifecycle (eng D6). Both the web app (paste-to-learn) and
// the leetcode overlay (the in-problem "Nudge me — no spoilers" companion) route
// their "start a lesson" / "resume a lesson" actions through this ONE hook, so the
// stuck-companion no-spoiler mode is a *parameter* (companionMode) carried into the
// single server prompt — not a copied client code path.
//
// Scope is deliberately the start/resume lifecycle (the genuinely-shared,
// genuinely-parameterized surface). Per-turn controls (pause/skip/guided replies)
// are byte-identical across both surfaces and stay in App; pulling them in here
// would only create a dependency cycle with App's message handler for no gain.
//
// Leaf hooks (useTutorState/useAudioPlayer/useWebSocket) stay in App and are passed
// in, so there is no chicken-and-egg between the WS message handler and this hook.
export function useLessonSession({ send, reset, audioPlayer }) {
  // Wall-clock start of the active lesson — drives duration analytics in App
  // (session_completed / session_abandoned). Owned here so both entry points
  // stamp it identically.
  const sessionStartRef = useRef(null);

  // Start a fresh lesson. companionMode=false → the paste-to-learn walkthrough;
  // companionMode=true → the no-spoiler escalating-hint companion (the overlay's
  // "Nudge me" intent). Both hit the same start_leetcode handler server-side.
  const startLesson = useCallback(
    ({ problemText, companionMode = false }) => {
      audioPlayer.init(); // must originate from a user gesture to unlock AudioContext
      reset();
      sessionStartRef.current = Date.now();
      track('leetcode_started', { companion_mode: !!companionMode });
      send({ type: 'start_leetcode', problemText, companionMode: !!companionMode });
    },
    [send, reset, audioPlayer],
  );

  // Resume a saved conversation. Companion vs walkthrough framing is restored
  // server-side from the persisted session, so no flag is needed here.
  const resumeLesson = useCallback(
    (conversationId) => {
      audioPlayer.init(); // must be from a user gesture to unlock AudioContext
      reset();
      sessionStartRef.current = Date.now();
      track('conversation_resumed', {});
      send({ type: 'resume_conversation', conversationId });
    },
    [send, reset, audioPlayer],
  );

  return { startLesson, resumeLesson, sessionStartRef };
}
