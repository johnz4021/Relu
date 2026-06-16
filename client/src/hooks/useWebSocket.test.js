import { describe, it, expect } from 'vitest';
import { QUEUEABLE_TYPES, enqueueMessage } from './useWebSocket';

// Regression guard for the "stuck on Loading your problem…" dead-end
// (investigate 2026-06-16). The leetcode overlay starts a lesson by sending
// start_leetcode over the WS. If the socket isn't OPEN at send time (post-login
// reconnect, server restart, sleep/wake), the message must be QUEUED and
// replayed on reconnect — not silently dropped. Before the fix, start_leetcode
// was absent from the queueable list, so a single mistimed send stranded the
// panel forever with no retry and no timeout.
describe('useWebSocket queue policy — lesson-start delivery', () => {
  it('treats start_leetcode and resume_conversation as queueable (the regression)', () => {
    expect(QUEUEABLE_TYPES).toContain('start_leetcode');
    expect(QUEUEABLE_TYPES).toContain('resume_conversation');
  });

  it('queues a start_leetcode sent while disconnected instead of dropping it', () => {
    const start = { type: 'start_leetcode', problemText: 'two sum' };
    const next = enqueueMessage([], start);
    expect(next).toEqual([start]);
  });

  it('drops messages that are NOT safe to replay (returns the same array)', () => {
    const queue = [];
    const next = enqueueMessage(queue, { type: 'highlight_result', id: 1 });
    expect(next).toBe(queue); // same reference → nothing enqueued
    expect(next).toHaveLength(0);
  });

  it('a fresh start supersedes any still-queued start/resume (no double lesson on reconnect)', () => {
    let q = enqueueMessage([], { type: 'start_leetcode', problemText: 'A' });
    q = enqueueMessage(q, { type: 'resume_conversation', conversationId: 'c1' });
    q = enqueueMessage(q, { type: 'start_leetcode', problemText: 'B' });
    const starts = q.filter((m) => m.type === 'start_leetcode' || m.type === 'resume_conversation');
    expect(starts).toEqual([{ type: 'start_leetcode', problemText: 'B' }]);
  });

  it('still queues non-start messages additively (e.g. control messages)', () => {
    let q = enqueueMessage([], { type: 'pause' });
    q = enqueueMessage(q, { type: 'set_speed', speed: 1.5 });
    expect(q).toEqual([{ type: 'pause' }, { type: 'set_speed', speed: 1.5 }]);
  });

  it('tolerates a missing/garbage message type without throwing', () => {
    const queue = [{ type: 'pause' }];
    expect(enqueueMessage(queue, {})).toBe(queue);
    expect(enqueueMessage(queue, { type: 'nope' })).toBe(queue);
  });
});
