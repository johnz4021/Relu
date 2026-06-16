import { describe, it, expect } from 'vitest';
import {
  extAuthTabUrl,
  isOAuthReturn,
  resolveExtAuthProvider,
  extAuthAction,
  extAuthScreen,
  extAuthMarker,
  readExtAuthMarker,
  EXT_AUTH_TTL_MS,
  EXT_AUTH_SCREEN_TEXT,
} from './extAuth';

describe('extAuthTabUrl', () => {
  it('builds the ?ext_auth handoff URL, defaulting to google', () => {
    expect(extAuthTabUrl('https://www.relu.run')).toBe('https://www.relu.run/?ext_auth=google');
  });
  it('honors a non-default provider', () => {
    expect(extAuthTabUrl('http://localhost:5173', 'github')).toBe('http://localhost:5173/?ext_auth=github');
  });
});

describe('isOAuthReturn', () => {
  it('true when supabase puts tokens in the hash', () => {
    expect(isOAuthReturn('#access_token=abc&refresh_token=xyz', '')).toBe(true);
  });
  it('true on an OAuth error return', () => {
    expect(isOAuthReturn('#error=access_denied', '')).toBe(true);
    expect(isOAuthReturn('', '?error=server_error')).toBe(true);
  });
  it('false on the first visit (?ext_auth=google, no tokens)', () => {
    expect(isOAuthReturn('', '?ext_auth=google')).toBe(false);
  });
  it('false on a plain web-app load', () => {
    expect(isOAuthReturn('', '')).toBe(false);
  });
});

describe('resolveExtAuthProvider', () => {
  it('prefers the URL param on first load', () => {
    expect(resolveExtAuthProvider('google', null, false)).toBe('google');
  });
  it('uses the stored marker ONLY when returning from OAuth (query is gone by then)', () => {
    expect(resolveExtAuthProvider(null, 'google', true)).toBe('google');
  });
  it('ignores a stored marker on a normal load — no hijack', () => {
    // The critical guard: a stale marker must not make a plain web-app load act
    // like a handoff tab.
    expect(resolveExtAuthProvider(null, 'google', false)).toBe(null);
  });
  it('is null when nothing applies', () => {
    expect(resolveExtAuthProvider(null, null, true)).toBe(null);
  });
});

describe('extAuthAction', () => {
  it('none when not a handoff tab', () => {
    expect(extAuthAction({ provider: null, hasSession: false, returningFromOAuth: false })).toBe('none');
  });
  it('trigger on first visit: no session, not returning', () => {
    expect(extAuthAction({ provider: 'google', hasSession: false, returningFromOAuth: false })).toBe('trigger');
  });
  it('wait while returning from OAuth before the session parses (no re-trigger)', () => {
    expect(extAuthAction({ provider: 'google', hasSession: false, returningFromOAuth: true })).toBe('wait');
  });
  it('handoff once a session exists', () => {
    expect(extAuthAction({ provider: 'google', hasSession: true, returningFromOAuth: true })).toBe('handoff');
    expect(extAuthAction({ provider: 'google', hasSession: true, returningFromOAuth: false })).toBe('handoff');
  });
});

describe('extAuthScreen', () => {
  it('null when not a handoff tab', () => {
    expect(extAuthScreen({ provider: null })).toBe(null);
  });
  it('opening before OAuth starts', () => {
    expect(extAuthScreen({ provider: 'google', hasUser: false, returningFromOAuth: false, oauthError: null })).toBe('opening');
  });
  it('finishing while returning from OAuth, pre-session', () => {
    expect(extAuthScreen({ provider: 'google', hasUser: false, returningFromOAuth: true, oauthError: null })).toBe('finishing');
  });
  it('canceled when the provider returned an error', () => {
    expect(extAuthScreen({ provider: 'google', hasUser: false, returningFromOAuth: true, oauthError: 'access_denied' })).toBe('canceled');
  });
  it('signed-in once the user resolves — wins over a stale error', () => {
    expect(extAuthScreen({ provider: 'google', hasUser: true, returningFromOAuth: true, oauthError: 'access_denied' })).toBe('signed-in');
  });
  it('has copy for every screen state', () => {
    for (const k of ['signed-in', 'canceled', 'finishing', 'opening']) {
      expect(typeof EXT_AUTH_SCREEN_TEXT[k]).toBe('string');
      expect(EXT_AUTH_SCREEN_TEXT[k].length).toBeGreaterThan(0);
    }
  });
});

describe('extAuth localStorage marker', () => {
  it('round-trips a fresh marker', () => {
    const raw = extAuthMarker('google', 1000);
    expect(readExtAuthMarker(raw, 1000)).toBe('google');
    expect(readExtAuthMarker(raw, 1000 + EXT_AUTH_TTL_MS - 1)).toBe('google');
  });
  it('expires a stale marker (TTL bounds an abandoned attempt)', () => {
    const raw = extAuthMarker('google', 1000);
    expect(readExtAuthMarker(raw, 1000 + EXT_AUTH_TTL_MS + 1)).toBe(null);
  });
  it('returns null for missing or corrupt markers', () => {
    expect(readExtAuthMarker(null, 1000)).toBe(null);
    expect(readExtAuthMarker('not json', 1000)).toBe(null);
    expect(readExtAuthMarker('{}', 1000)).toBe(null);
  });
});
