import { useState } from 'react';
import { posthog, POSTHOG_KEY } from '../lib/posthog';

const track = (event, props) => POSTHOG_KEY && posthog.capture(event, props);

export default function SessionFeedback({ mode, algorithm, onDismiss }) {
  const [rating, setRating] = useState(null);
  const [feedbackText, setFeedbackText] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = () => {
    if (!rating) return;
    track('session_rated', { rating, feedback_text: feedbackText || null, mode, algorithm });
    fetch('/api/session-feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rating, message: feedbackText || null, mode, algorithm }),
    }).catch(() => {});
    setSubmitted(true);
    setTimeout(() => onDismiss(), 1500);
  };

  const handleSkip = () => {
    track('feedback_dismissed', { mode, algorithm });
    onDismiss();
  };

  if (submitted) {
    return (
      <div className="fixed bottom-4 right-4 z-50 bg-surface-2 border border-border rounded-2xl p-5 shadow-lg w-80">
        <p className="text-sm text-text-primary font-display text-center">Thanks for the feedback!</p>
      </div>
    );
  }

  return (
    <div className="fixed bottom-4 right-4 z-50 bg-surface-2 border border-border rounded-2xl p-5 shadow-lg w-80">
      <div className="flex items-start justify-between mb-3">
        <h3 className="font-display text-text-primary text-sm font-medium">How was this session?</h3>
        <button onClick={handleSkip} className="text-text-tertiary text-xs hover:text-text-secondary transition-colors">
          Skip
        </button>
      </div>

      <div className="flex gap-1 mb-3">
        {[1, 2, 3, 4, 5].map((star) => (
          <button
            key={star}
            onClick={() => setRating(star)}
            className={`text-2xl transition-colors ${
              rating && star <= rating ? 'text-accent' : 'text-text-tertiary hover:text-text-secondary'
            }`}
          >
            ★
          </button>
        ))}
      </div>

      <textarea
        value={feedbackText}
        onChange={(e) => setFeedbackText(e.target.value)}
        placeholder="Any thoughts? (optional)"
        rows={2}
        className="w-full bg-surface-1 border border-border rounded-lg px-3 py-2 text-sm text-text-primary placeholder-text-tertiary font-body focus:outline-none focus:border-border-hover resize-none mb-3"
      />

      <button
        onClick={handleSubmit}
        disabled={!rating}
        className={`w-full py-2 rounded-lg text-sm font-medium transition-colors ${
          rating
            ? 'bg-accent text-surface-0 hover:bg-accent-hover'
            : 'bg-surface-3 text-text-tertiary cursor-not-allowed'
        }`}
      >
        Submit
      </button>
    </div>
  );
}
