import { useState, useEffect, useRef, useCallback } from 'react';
import { useSpeechToText } from '../hooks/useSpeechToText';
import GuidedOptions from './GuidedOptions';
import MathText from './MathText';
import { posthog, POSTHOG_KEY } from '../lib/posthog';
import { setTimelineSpeed } from '../lib/rendererRegistry';

const track = (event, props) => POSTHOG_KEY && posthog.capture(event, props);

export default function Controls({ status, agentStatus, onInterrupt, onPause, onResume, onSkip, onRestart, onSpeedChange, onTtsMuteToggle, ttsMuted, explanationMode, guidedOptions, onGuidedResponse, mode, onGuidedMessage, guidedPrompt, registerInsertRef, independentWork, onIndependentWorkSubmit, onKeepGuiding, onRevealHint }) {
  const [question, setQuestion] = useState('');
  const [pausePending, setPausePending] = useState(false);
  const [independentText, setIndependentText] = useState('');
  const { isListening, transcript, isSupported, start, stop, clearTranscript } = useSpeechToText();
  const inputRef = useRef(null);

  // Register input ref for clickable graph element insertion (Phase 7)
  useEffect(() => {
    if (registerInsertRef) {
      registerInsertRef(inputRef);
    }
  }, [registerInsertRef]);

  // Populate input field when speech transcript updates
  useEffect(() => {
    if (transcript) {
      setQuestion(transcript);
      // Auto-resize textarea to fit STT content
      if (inputRef.current) {
        inputRef.current.style.height = 'auto';
        inputRef.current.style.height = inputRef.current.scrollHeight + 'px';
      }
    }
  }, [transcript]);

  // Clear pausePending once the server confirms pause (status becomes 'paused')
  useEffect(() => {
    if (status === 'paused') {
      setPausePending(false);
    }
  }, [status]);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!question.trim()) return;
    if (guidedOptions?.mode === 'open_ended' && onGuidedResponse) {
      // Open-ended guided question (works in both guided and lesson mode)
      onGuidedResponse({ text: question.trim() });
    } else if (isExplain) {
      // In explain mode, all typed messages route as interrupts
      onInterrupt(question.trim());
    } else if (guidedPrompt && onGuidedMessage) {
      // conversational_reply is waiting for a response — route as guided message
      onGuidedMessage(question.trim());
    } else if (isGuided && onGuidedMessage) {
      onGuidedMessage(question.trim());
    } else {
      onInterrupt(question.trim());
    }
    setQuestion('');
    if (isListening) stop();
    clearTranscript();
    // Reset textarea height after clearing
    if (inputRef.current) {
      inputRef.current.style.height = 'auto';
    }
  };

  const insertAtCursor = useCallback((text) => {
    const el = inputRef.current;
    if (!el) {
      setQuestion((prev) => prev + text);
      return;
    }
    const start = el.selectionStart || 0;
    const end = el.selectionEnd || 0;
    const current = question;
    const newValue = current.slice(0, start) + text + current.slice(end);
    setQuestion(newValue);
    // Restore cursor position after React re-renders
    requestAnimationFrame(() => {
      el.selectionStart = el.selectionEnd = start + text.length;
      el.focus();
    });
  }, [question]);

  // Expose insertAtCursor for external use (Phase 7)
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current._insertAtCursor = insertAtCursor;
    }
  }, [insertAtCursor]);

  const handlePause = () => {
    setPausePending(true);
    onPause();
  };

  const toggleMic = () => {
    if (isListening) {
      stop();
    } else {
      track('mic_used', {});
      start();
    }
  };

  const showInput = status === 'teaching' || status === 'paused' || status === 'complete';
  const isGuided = mode === 'guided';
  const isExplain = mode === 'explain';
  // guidedOptions can appear in both guided AND direct (lesson) mode via send_options
  const hasGuidedOptions = !!guidedOptions;
  // Disable sending when the model is thinking/running tools (not waiting for input)
  const agentBusy = (isGuided || isExplain || hasGuidedOptions) && !!agentStatus;
  const placeholder = hasGuidedOptions
    ? (guidedOptions.mode === 'open_ended' && guidedOptions.input_placeholder)
      ? guidedOptions.input_placeholder
      : 'Type your answer...'
    : isExplain
      ? 'Ask a question about the explanation...'
      : isGuided
        ? 'Type your thoughts...'
        : status === 'complete'
          ? 'Any questions about the lesson?'
          : 'Ask a question, request something visual...';

  return (
    <div className="border-t border-border px-4 py-3 space-y-3 font-body">
      {guidedOptions && guidedOptions.mode !== 'open_ended' && (
        <GuidedOptions
          options={guidedOptions.options}
          prompt={guidedOptions.prompt}
          mode={guidedOptions.mode}
          inputPlaceholder={guidedOptions.input_placeholder}
          multiSelect={guidedOptions.multiSelect}
          onSelect={onGuidedResponse}
          disabled={agentBusy}
        />
      )}
      {(guidedPrompt || (guidedOptions && guidedOptions.mode === 'open_ended')) && !(guidedOptions && guidedOptions.mode !== 'open_ended') && (
        <div className="text-sm text-text-secondary italic px-1">
          <MathText>{guidedOptions?.prompt || guidedPrompt}</MathText>
        </div>
      )}
      {showInput && (
        <div className="bg-surface-2 border border-border rounded-xl overflow-hidden focus-within:border-accent transition-colors">
          <form onSubmit={handleSubmit} className="flex items-end gap-2 px-3 py-2">
            <textarea
              ref={inputRef}
              rows={1}
              value={question}
              onChange={(e) => {
                setQuestion(e.target.value);
                e.target.style.height = 'auto';
                e.target.style.height = e.target.scrollHeight + 'px';
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSubmit(e);
                }
              }}
              disabled={agentBusy}
              placeholder={agentBusy ? 'Waiting for tutor...' : placeholder}
              className={`flex-1 bg-transparent text-sm text-text-primary placeholder-text-tertiary focus:outline-none resize-none max-h-32 overflow-y-auto ${
                agentBusy ? 'opacity-50 cursor-not-allowed' : ''
              }`}
            />
            {isSupported && (
              <button
                type="button"
                onClick={toggleMic}
                className={`p-1.5 rounded-lg text-sm transition-colors shrink-0 ${
                  isListening
                    ? 'text-red-400 hover:text-red-300'
                    : 'text-text-tertiary hover:text-text-secondary'
                }`}
                title={isListening ? 'Stop listening' : 'Speak your question'}
              >
                {isListening ? (
                  <span className="flex items-center gap-1">
                    <span className="w-2 h-2 bg-red-400 rounded-full animate-pulse" />
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                      <path d="M7 4a3 3 0 016 0v6a3 3 0 11-6 0V4z" />
                      <path d="M5.5 9.643a.75.75 0 00-1.5 0V10c0 3.06 2.29 5.585 5.25 5.954V17.5h-1.5a.75.75 0 000 1.5h4.5a.75.75 0 000-1.5h-1.5v-1.546A6.001 6.001 0 0016 10v-.357a.75.75 0 00-1.5 0V10a4.5 4.5 0 01-9 0v-.357z" />
                    </svg>
                  </span>
                ) : (
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                    <path d="M7 4a3 3 0 016 0v6a3 3 0 11-6 0V4z" />
                    <path d="M5.5 9.643a.75.75 0 00-1.5 0V10c0 3.06 2.29 5.585 5.25 5.954V17.5h-1.5a.75.75 0 000 1.5h4.5a.75.75 0 000-1.5h-1.5v-1.546A6.001 6.001 0 0016 10v-.357a.75.75 0 00-1.5 0V10a4.5 4.5 0 01-9 0v-.357z" />
                  </svg>
                )}
              </button>
            )}
            <button
              type="submit"
              disabled={agentBusy}
              className={`p-1.5 rounded-lg text-sm transition-colors shrink-0 ${
                agentBusy
                  ? 'text-text-tertiary cursor-not-allowed'
                  : 'text-accent hover:text-accent-hover'
              }`}
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
                <path d="M3.105 2.289a.75.75 0 00-.826.95l1.414 4.925A1.5 1.5 0 005.135 9.25h6.115a.75.75 0 010 1.5H5.135a1.5 1.5 0 00-1.442 1.086l-1.414 4.926a.75.75 0 00.826.95 28.896 28.896 0 0015.293-7.154.75.75 0 000-1.115A28.897 28.897 0 003.105 2.289z" />
              </svg>
            </button>
          </form>
        </div>
      )}

      {status === 'teaching' && (
        <div className="flex items-center gap-2">
          <button
            onClick={handlePause}
            disabled={pausePending}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              pausePending
                ? 'bg-accent-muted text-accent cursor-not-allowed'
                : 'bg-accent-muted text-accent hover:bg-accent/20'
            }`}
          >
            {pausePending ? (
              <span className="flex items-center gap-2">
                <span className="w-2 h-2 bg-accent rounded-full animate-pulse" />
                Pausing...
              </span>
            ) : (
              'Pause'
            )}
          </button>
          <button
            onClick={onSkip}
            disabled={!!agentStatus}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors border border-border ${
              agentStatus
                ? 'bg-surface-2 text-text-tertiary cursor-not-allowed opacity-50'
                : 'bg-surface-2 text-text-secondary hover:text-text-primary hover:bg-surface-3'
            }`}
          >
            Skip
          </button>
        </div>
      )}

      {status === 'paused' && (
        <button
          onClick={onResume}
          className="bg-accent hover:bg-accent-hover text-surface-0 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
        >
          Resume
        </button>
      )}

      {status === 'interrupted' && (
        <p className="text-sm text-accent animate-pulse">
          Waiting for answer...
        </p>
      )}

      {explanationMode && (
        <p className="text-sm text-text-secondary flex items-center gap-2">
          <span className="w-2 h-2 bg-accent rounded-full animate-pulse" />
          Showing explanation...
        </p>
      )}

      {status === 'complete' && (
        <div className="flex items-center gap-3">
          <p className="text-sm text-green-400">Lesson complete!</p>
          <button
            onClick={onRestart}
            className="bg-surface-2 hover:bg-surface-3 border border-border text-text-secondary hover:text-text-primary px-3 py-1.5 rounded-lg text-sm transition-colors"
          >
            New Problem
          </button>
        </div>
      )}

      {status === 'independent_work' && independentWork && (
        <div className="space-y-4">
          <div className="bg-surface-2 border border-border rounded-xl p-4 space-y-3">
            <div className="flex items-center gap-2 text-accent text-sm font-medium">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              What you&apos;ve established
            </div>
            <p className="text-sm text-text-secondary">
              <MathText>{independentWork.checkpoint_summary}</MathText>
            </p>
          </div>

          <div className="bg-accent/10 border border-accent/30 rounded-xl p-4 space-y-2">
            <div className="text-sm font-medium text-accent">Your task</div>
            <p className="text-sm text-text-primary">
              <MathText>{independentWork.task_description}</MathText>
            </p>
          </div>

          {independentWork.hints.length > 0 && (
            <div className="space-y-2">
              {independentWork.hints.map((hint, i) => (
                <div key={i}>
                  {independentWork.revealedHints.includes(i) ? (
                    <div className="bg-surface-2 border border-border rounded-lg p-3 text-sm text-text-secondary">
                      <span className="text-accent font-medium">Hint {i + 1}:</span>{' '}
                      <MathText>{hint}</MathText>
                    </div>
                  ) : (
                    <button
                      onClick={() => onRevealHint(i)}
                      className="text-sm text-accent hover:text-accent-hover underline"
                    >
                      Reveal hint {i + 1}
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}

          <div className="bg-surface-2 border border-border rounded-xl overflow-hidden focus-within:border-accent transition-colors">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!independentText.trim()) return;
                onIndependentWorkSubmit(independentText.trim());
                setIndependentText('');
              }}
              className="flex flex-col gap-2 p-3"
            >
              <textarea
                rows={4}
                value={independentText}
                onChange={(e) => setIndependentText(e.target.value)}
                placeholder="Paste your attempt here when you're ready..."
                className="bg-transparent text-text-primary placeholder-text-tertiary resize-y outline-none text-sm font-body w-full"
              />
              <div className="flex items-center justify-between">
                <button
                  type="button"
                  onClick={onKeepGuiding}
                  className="text-sm text-text-tertiary hover:text-text-secondary underline"
                >
                  Keep guiding me instead
                </button>
                <button
                  type="submit"
                  disabled={!independentText.trim()}
                  className="bg-accent hover:bg-accent-hover disabled:opacity-40 text-surface-0 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                >
                  Submit my work
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {status === 'error' && (
        <div className="flex items-center gap-3">
          <p className="text-sm text-red-400">An error occurred.</p>
          <button
            onClick={onRestart}
            className="bg-surface-2 hover:bg-surface-3 border border-border text-text-secondary px-3 py-1.5 rounded-lg text-sm transition-colors"
          >
            Try again
          </button>
        </div>
      )}

      {(status === 'teaching' || status === 'paused' || status === 'interrupted') && (
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <label className="text-xs text-text-tertiary">Speed:</label>
            <input
              type="range"
              min="0.7"
              max="1.2"
              step="0.1"
              defaultValue="1"
              onChange={(e) => {
                const newSpeed = parseFloat(e.target.value);
                onSpeedChange(newSpeed);
                setTimelineSpeed(newSpeed);
              }}
              className="w-24 accent-accent"
            />
          </div>
          <button
            onClick={onTtsMuteToggle}
            className={`flex items-center gap-1 px-2 py-1 rounded text-xs font-medium transition-colors ${
              ttsMuted
                ? 'bg-red-900/30 text-red-400 hover:bg-red-900/50'
                : 'bg-surface-2 text-text-tertiary hover:text-text-secondary'
            }`}
            title={ttsMuted ? 'Turn voice on' : 'Turn voice off'}
          >
            {ttsMuted ? (
              <>
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
                  <path d="M9.547 3.062A.75.75 0 0110 3.75v12.5a.75.75 0 01-1.264.546L5.203 13.5H2.667a.75.75 0 01-.7-.48A6.985 6.985 0 011.5 10c0-.98.201-1.916.467-2.52a.75.75 0 01.7-.48h2.536l3.533-3.296a.75.75 0 01.811-.142z" />
                  <path d="M13.28 7.22a.75.75 0 10-1.06 1.06L13.94 10l-1.72 1.72a.75.75 0 101.06 1.06L15 11.06l1.72 1.72a.75.75 0 101.06-1.06L16.06 10l1.72-1.72a.75.75 0 00-1.06-1.06L15 8.94l-1.72-1.72z" />
                </svg>
                Turn Voice On
              </>
            ) : (
              <>
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
                  <path d="M10 3.75a.75.75 0 00-1.264-.546L5.203 6.5H2.667a.75.75 0 00-.7.48 6.985 6.985 0 000 6.04.75.75 0 00.7.48h2.536l3.533 3.296A.75.75 0 0010 16.25V3.75zM15.95 5.05a.75.75 0 00-1.06 1.061 5.5 5.5 0 010 7.778.75.75 0 001.06 1.06 7 7 0 000-9.899z" />
                  <path d="M13.829 7.172a.75.75 0 00-1.061 1.06 2.5 2.5 0 010 3.536.75.75 0 001.06 1.06 4 4 0 000-5.656z" />
                </svg>
                Turn Voice Off
              </>
            )}
          </button>
        </div>
      )}
    </div>
  );
}
