import { useEffect } from 'react';

export default function ConversationHistory({ conversations, lcSessions, send, onViewTranscript, onResume, onMasterLcSession }) {
  useEffect(() => {
    send({ type: 'list_conversations' });
    send({ type: 'list_lc_sessions' });
  }, [send]);

  const hasAnything = (conversations && conversations.length > 0) || (lcSessions && lcSessions.length > 0);

  if (!hasAnything) {
    return (
      <div className="flex items-center justify-center h-64 text-text-tertiary text-sm font-body">
        No past sessions yet. Start a guided session to see your history here.
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 font-body">
      {lcSessions && lcSessions.length > 0 && (
        <div className="mb-8">
          <h2 className="text-lg font-display font-semibold text-text-primary mb-4">LeetCode Sessions</h2>
          <div className="divide-y divide-border">
            {lcSessions.map((s) => (
              <div key={s.id} className="py-4 flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-text-primary truncate">
                    {s.problem_title || 'Untitled problem'}
                  </p>
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    {s.algorithm_key && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-accent-muted text-accent">
                        {s.algorithm_key.replace(/_/g, ' ')}
                      </span>
                    )}
                    {s.mastered && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-green-500/15 text-green-400">
                        Mastered
                      </span>
                    )}
                    {!s.has_viz && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-surface-3 text-text-tertiary">
                        Text only
                      </span>
                    )}
                    <span className="text-xs text-text-tertiary">
                      {new Date(s.attempted_at).toLocaleDateString(undefined, {
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                  </div>
                </div>
                {!s.mastered && onMasterLcSession && (
                  <button
                    onClick={() => onMasterLcSession(s.id)}
                    className="px-3 py-1.5 text-xs font-medium bg-surface-3 hover:bg-border text-text-secondary rounded-lg transition-colors shrink-0"
                  >
                    Mark Mastered
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {conversations && conversations.length > 0 && (
        <>
          <h2 className="text-lg font-display font-semibold text-text-primary mb-4">Session History</h2>
          <div className="divide-y divide-border">
            {conversations.map((conv) => (
              <div
                key={conv.id}
                className="py-4 flex items-start justify-between gap-4"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-text-primary truncate">
                    {conv.problem_text || 'Untitled session'}
                  </p>
                  <div className="flex items-center gap-2 mt-1">
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full ${
                        conv.status === 'active'
                          ? 'bg-accent-muted text-accent'
                          : 'bg-green-500/15 text-green-400'
                      }`}
                    >
                      {conv.status === 'active' ? 'In Progress' : 'Complete'}
                    </span>
                    <span className="text-xs text-text-tertiary">
                      {new Date(conv.updated_at).toLocaleDateString(undefined, {
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                  </div>
                </div>
                <div className="flex gap-2 shrink-0">
                  {conv.status === 'active' && (
                    <button
                      onClick={() => onResume(conv.id)}
                      className="px-3 py-1.5 text-xs font-medium bg-accent hover:bg-accent-hover text-surface-0 rounded-lg transition-colors"
                    >
                      Resume
                    </button>
                  )}
                  <button
                    onClick={() => onViewTranscript(conv.id)}
                    className="px-3 py-1.5 text-xs font-medium bg-surface-3 hover:bg-border text-text-secondary rounded-lg transition-colors"
                  >
                    View
                  </button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
