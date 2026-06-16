import { describe, it, expect, vi, beforeEach } from 'vitest';

// bridge.js is a content script: on import it registers a window 'message' listener
// and relays handoff messages to the background worker. We fake the browser globals,
// capture the listener, and drive synthetic events directly (node-based, matching the
// existing extension test style — no jsdom).
let messageListener = null;
const sendMessage = vi.fn();

globalThis.window = {
  addEventListener: (type, fn) => { if (type === 'message') messageListener = fn; },
};
globalThis.location = { origin: 'https://www.relu.run' };
globalThis.chrome = { runtime: { sendMessage, lastError: null } };

await import('./bridge.js');

const ev = (over = {}) => ({
  source: globalThis.window,
  origin: 'https://www.relu.run',
  data: { type: 'relu_ext_session', session: { access_token: 'a', refresh_token: 'r' } },
  ...over,
});

describe('bridge relay', () => {
  beforeEach(() => sendMessage.mockClear());

  it('registered a message listener on import', () => {
    expect(typeof messageListener).toBe('function');
  });

  it('relays a valid handoff session as relu_set_session', () => {
    messageListener(ev());
    expect(sendMessage).toHaveBeenCalledTimes(1);
    const [msg] = sendMessage.mock.calls[0];
    expect(msg.type).toBe('relu_set_session');
    expect(msg.session).toEqual({ access_token: 'a', refresh_token: 'r' });
  });

  it('passes closeTab through to the worker as closeSenderTab', () => {
    messageListener(ev({ data: { type: 'relu_ext_session', closeTab: true, session: { access_token: 'a', refresh_token: 'r' } } }));
    expect(sendMessage).toHaveBeenCalledTimes(1);
    expect(sendMessage.mock.calls[0][0].closeSenderTab).toBe(true);
  });

  it('ignores messages from a different origin', () => {
    messageListener(ev({ origin: 'https://evil.example' }));
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it('ignores messages whose source is not this window', () => {
    messageListener(ev({ source: {} }));
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it('ignores a malformed session (missing refresh_token)', () => {
    messageListener(ev({ data: { type: 'relu_ext_session', session: { access_token: 'a' } } }));
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it('ignores unrelated message types', () => {
    messageListener(ev({ data: { type: 'something_else' } }));
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it('forwards sign-out as relu_clear_session', () => {
    messageListener(ev({ data: { type: 'relu_ext_signout' } }));
    expect(sendMessage).toHaveBeenCalledTimes(1);
    expect(sendMessage.mock.calls[0][0]).toEqual({ type: 'relu_clear_session' });
  });
});
