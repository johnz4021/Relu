import { useEffect, useRef, useState } from 'react';
import MathText from './MathText';

export default function Transcript({ segments, agentStatus, centered }) {
  const scrollContainerRef = useRef(null);
  const [waitSeconds, setWaitSeconds] = useState(0);

  useEffect(() => {
    const el = scrollContainerRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [segments, agentStatus]);

  // Track how long agentStatus has been active
  useEffect(() => {
    if (!agentStatus) {
      setWaitSeconds(0);
      return;
    }
    setWaitSeconds(0);
    const interval = setInterval(() => setWaitSeconds(s => s + 1), 1000);
    return () => clearInterval(interval);
  }, [agentStatus]);

  return (
    <div className="flex flex-col h-full font-body">
      <h2 className="text-xs font-medium text-text-tertiary uppercase tracking-wider px-4 py-3 border-b border-border">
        Transcript
      </h2>

      <div
        ref={scrollContainerRef}
        className={`flex-1 overflow-y-auto px-4 py-3 space-y-3 ${centered ? 'max-w-2xl mx-auto w-full' : ''}`}
      >
        {segments.length === 0 && (
          <p className="text-text-tertiary text-sm italic">
            Start a lesson to see the narration here...
          </p>
        )}

        {segments.map((seg) => (
          <div
            key={seg.id}
            className={`text-sm leading-relaxed rounded-lg px-3 py-2 ${
              seg.type === 'question'
                ? 'border-l-2 border-accent bg-accent-muted text-text-primary'
                : seg.type === 'answer'
                ? 'bg-surface-2 text-text-primary'
                : seg.type === 'guided_question'
                ? 'bg-surface-2 border border-border text-text-secondary'
                : seg.type === 'guided_answer'
                ? 'border-l-2 border-accent text-text-primary'
                : seg.type === 'student_message'
                ? 'border-l-2 border-accent bg-accent-muted text-text-primary'
                : seg.type === 'verification'
                ? seg.matches
                  ? 'bg-green-900/20 border border-green-800/50 text-green-300'
                  : 'bg-red-900/20 border border-red-800/50 text-red-300'
                : seg.active
                ? 'bg-surface-2 text-text-primary'
                : 'text-text-secondary'
            }`}
          >
            {seg.type === 'question' && (
              <span className="text-xs text-accent font-medium block mb-1">You asked:</span>
            )}
            {seg.type === 'answer' && (
              <span className="text-xs text-text-tertiary font-medium block mb-1">Argmax:</span>
            )}
            {seg.type === 'guided_question' && (
              <span className="text-xs text-text-tertiary font-medium block mb-1">Argmax asked:</span>
            )}
            {seg.type === 'guided_answer' && (
              <span className="text-xs text-accent font-medium block mb-1">Your answer:</span>
            )}
            {seg.type === 'student_message' && (
              <span className="text-xs text-accent font-medium block mb-1">You:</span>
            )}
            {seg.type === 'verification' && (
              <span className={`text-xs font-medium block mb-1 ${seg.matches ? 'text-green-400' : 'text-red-400'}`}>
                {seg.matches ? '\u2713 Verified' : '\u2717 Mismatch'}
              </span>
            )}
            <MathText>{seg.narration}</MathText>
            {seg.active && (
              <span className="inline-block w-2 h-4 bg-accent ml-1 animate-pulse" />
            )}
          </div>
        ))}

        {agentStatus && (
          <div className="px-1 py-1">
            <div className="flex items-center gap-2 text-xs text-text-tertiary">
              <span className="flex gap-0.5">
                <span className="w-1.5 h-1.5 bg-accent rounded-full animate-bounce [animation-delay:0ms]" />
                <span className="w-1.5 h-1.5 bg-accent rounded-full animate-bounce [animation-delay:150ms]" />
                <span className="w-1.5 h-1.5 bg-accent rounded-full animate-bounce [animation-delay:300ms]" />
              </span>
              {agentStatus.status === 'tool' ? `${agentStatus.tool}...` : 'Thinking...'}
            </div>
            {agentStatus.status === 'tool' && /deep analysis|analyzing problem|solving/i.test(agentStatus.tool) && (
              <p className="text-xs text-text-tertiary mt-1.5 ml-5">
                Hang tight — deep analysis can take 3–5 minutes.
              </p>
            )}
            {waitSeconds >= 8 && !(agentStatus.status === 'tool' && /deep analysis|analyzing problem|solving/i.test(agentStatus.tool)) && (
              <p className="text-xs text-text-tertiary mt-1.5 ml-5 animate-pulse">
                {waitSeconds >= 20 ? 'Slow connection — hang tight...' : 'Taking longer than usual...'}
              </p>
            )}
          </div>
        )}

      </div>

    </div>
  );
}
