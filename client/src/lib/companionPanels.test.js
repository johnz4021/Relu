import { describe, it, expect } from 'vitest';
import { selectVisibleContextPanels } from './companionPanels';

const panels = [
  { id: 'queue', type: 'state', title: 'Queue' },
  { id: 'pseudo', type: 'pseudocode', title: 'Algorithm' },
];

describe('selectVisibleContextPanels — companion reveal-gate', () => {
  it('hides ALL panels in nudge mode before the key insight is revealed (no-spoiler guarantee)', () => {
    expect(selectVisibleContextPanels(panels, { companionNudge: true, keyInsightRevealed: false })).toEqual([]);
  });

  it('reveals the panels in nudge mode once the key insight is revealed', () => {
    expect(selectVisibleContextPanels(panels, { companionNudge: true, keyInsightRevealed: true })).toBe(panels);
  });

  it('never gates outside nudge mode (concept / show-me walkthrough / web app)', () => {
    expect(selectVisibleContextPanels(panels, { companionNudge: false, keyInsightRevealed: false })).toBe(panels);
    expect(selectVisibleContextPanels(panels, { companionNudge: false, keyInsightRevealed: true })).toBe(panels);
  });

  it('tolerates null/undefined panels', () => {
    expect(selectVisibleContextPanels(null, { companionNudge: false, keyInsightRevealed: false })).toEqual([]);
    expect(selectVisibleContextPanels(undefined, { companionNudge: true, keyInsightRevealed: true })).toEqual([]);
  });
});
