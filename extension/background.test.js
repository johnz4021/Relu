import { describe, it, expect, vi, beforeEach } from 'vitest';

// background.js registers its message listeners on import. We fake chrome, capture the
// onMessage handler, and exercise the relu_set_session broadcast gate: a session from
// the relu.run sign-in tab (bridge) pings open leetcode overlays; an overlay token
// rotation (relayed from a leetcode tab) must NOT, or it would echo back into the frame.
let onMessage = null;
const storageSet = vi.fn(() => Promise.resolve());
const storageGet = vi.fn(() => Promise.resolve({}));
const storageRemove = vi.fn(() => Promise.resolve());
const tabsQuery = vi.fn(() => Promise.resolve([{ id: 11 }, { id: 22 }]));
const tabsSendMessage = vi.fn();
const tabsRemove = vi.fn();

globalThis.chrome = {
  runtime: {
    onInstalled: { addListener: vi.fn() },
    onMessage: { addListener: (fn) => { onMessage = fn; } },
    lastError: null,
  },
  storage: { local: { get: storageGet, set: storageSet, remove: storageRemove } },
  tabs: { query: tabsQuery, sendMessage: tabsSendMessage, remove: tabsRemove },
};

await import('./background.js');

const flush = () => new Promise((r) => setTimeout(r, 0));
const session = { access_token: 'a', refresh_token: 'r' };

beforeEach(() => {
  storageSet.mockClear();
  tabsQuery.mockClear();
  tabsSendMessage.mockClear();
  tabsRemove.mockClear();
});

describe('relu_set_session broadcast gating', () => {
  it('persists and pings leetcode tabs when the session comes from the relu.run bridge', async () => {
    const sendResponse = vi.fn();
    const ret = onMessage(
      { type: 'relu_set_session', session },
      { tab: { url: 'https://www.relu.run/?ext_auth=google' } },
      sendResponse,
    );
    expect(ret).toBe(true); // keeps the message channel open for the async sendResponse
    await flush();
    expect(storageSet).toHaveBeenCalledTimes(1);
    expect(tabsQuery).toHaveBeenCalledWith({ url: 'https://leetcode.com/problems/*' });
    expect(tabsSendMessage).toHaveBeenCalledTimes(2);
    expect(tabsSendMessage.mock.calls[0][1]).toMatchObject({ type: 'relu_session_available', session });
    expect(sendResponse).toHaveBeenCalledWith({ ok: true });
  });

  it('treats a localhost:5173 sender as the bridge too (dev toggle)', async () => {
    const sendResponse = vi.fn();
    onMessage(
      { type: 'relu_set_session', session },
      { tab: { url: 'http://localhost:5173/?ext_auth=google' } },
      sendResponse,
    );
    await flush();
    expect(storageSet).toHaveBeenCalledTimes(1);
    expect(tabsQuery).toHaveBeenCalledTimes(1);
    expect(tabsSendMessage).toHaveBeenCalledTimes(2);
  });

  it('persists but does NOT broadcast for an overlay token rotation (leetcode sender)', async () => {
    const sendResponse = vi.fn();
    onMessage(
      { type: 'relu_set_session', session },
      { tab: { url: 'https://leetcode.com/problems/two-sum/' } },
      sendResponse,
    );
    await flush();
    expect(storageSet).toHaveBeenCalledTimes(1);
    expect(tabsQuery).not.toHaveBeenCalled();
    expect(tabsSendMessage).not.toHaveBeenCalled();
  });

  it('closes the sign-in handoff tab when closeSenderTab is set', async () => {
    const sendResponse = vi.fn();
    onMessage(
      { type: 'relu_set_session', closeSenderTab: true, session },
      { tab: { id: 99, url: 'http://localhost:5173/?code=abc' } },
      sendResponse,
    );
    await flush();
    expect(tabsRemove).toHaveBeenCalledWith(99, expect.any(Function));
  });

  it('does not close the tab for an overlay rotation (no closeSenderTab)', async () => {
    const sendResponse = vi.fn();
    onMessage(
      { type: 'relu_set_session', session },
      { tab: { id: 7, url: 'https://leetcode.com/problems/two-sum/' } },
      sendResponse,
    );
    await flush();
    expect(tabsRemove).not.toHaveBeenCalled();
  });

  it('rejects an invalid session without persisting or broadcasting', async () => {
    const sendResponse = vi.fn();
    onMessage(
      { type: 'relu_set_session', session: { access_token: 'a' } },
      { tab: { url: 'https://www.relu.run/' } },
      sendResponse,
    );
    await flush();
    expect(storageSet).not.toHaveBeenCalled();
    expect(tabsQuery).not.toHaveBeenCalled();
    expect(sendResponse).toHaveBeenCalledWith({ ok: false, reason: 'invalid-session' });
  });
});
