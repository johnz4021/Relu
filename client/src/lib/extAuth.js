// Pure decision logic for the extension's Google sign-in handoff tab (frictionless
// login). Side-effect-free so App.jsx / AuthModal stay thin wiring layers and the
// detection + screen states are unit-testable without a DOM.
//
// Flow: the overlay can't frame Google, so "Continue with Google" opens a relu.run tab
// at extAuthTabUrl(). That tab signs in top-level, posts the session to bridge.js, and
// the worker closes it.
//
// MARKER PERSISTENCE: the OAuth redirect comes back to the bare origin with the tokens
// in the URL hash (`/#access_token=...`) — the `?ext_auth=google` query is gone. We
// therefore stash the provider in localStorage, NOT sessionStorage: sessionStorage does
// not reliably survive a cross-origin OAuth round-trip (this is why supabase-js stores
// its PKCE verifier in localStorage too). The marker is honored ONLY when the page is
// actually returning from OAuth (tokens/error in the hash), so a stale marker can never
// hijack a normal web-app load. A short TTL bounds an abandoned attempt.

export const EXT_AUTH_KEY = 'relu_ext_auth';
export const EXT_AUTH_TTL_MS = 30 * 60 * 1000;

// The relu.run tab URL the overlay opens to start Google sign-in. Single source of
// truth for the ?ext_auth contract (producer = AuthModal, consumer = the App effect).
export function extAuthTabUrl(origin, provider = 'google') {
  return `${origin}/?ext_auth=${provider}`;
}

// True when this page load is the OAuth provider redirecting back: supabase puts the
// session (or an error) in the URL fragment.
export function isOAuthReturn(hash, search) {
  return /(?:access_token|[?&#]error)=/.test(`${hash || ''}${search || ''}`);
}

// Which provider this handoff tab is completing. The URL query wins on first visit; on
// the OAuth return the query is gone, so fall back to the stored marker — but ONLY when
// returning from OAuth, so a stale marker never makes a plain web-app load act like a
// handoff tab.
export function resolveExtAuthProvider(urlExtAuth, storedProvider, returningFromOAuth) {
  if (urlExtAuth) return urlExtAuth;
  if (returningFromOAuth && storedProvider) return storedProvider;
  return null;
}

// What the handoff effect should do this render:
//   'handoff' — a session exists; post it to the bridge and let the worker close the tab.
//   'wait'    — returning from OAuth, session still parsing; do nothing (no re-trigger).
//   'trigger' — first visit, no session; start the provider OAuth.
//   'none'    — not a handoff tab.
export function extAuthAction({ provider, hasSession, returningFromOAuth }) {
  if (!provider) return 'none';
  if (hasSession) return 'handoff';
  if (returningFromOAuth) return 'wait';
  return 'trigger';
}

// Which handoff-screen message to show.
export function extAuthScreen({ provider, hasUser, returningFromOAuth, oauthError }) {
  if (!provider) return null;
  if (hasUser) return 'signed-in';
  if (oauthError) return 'canceled';
  if (returningFromOAuth) return 'finishing';
  return 'opening';
}

// Serialize / read the localStorage marker (provider + timestamp). `now` is injected so
// the TTL check is testable. A corrupt or expired marker reads as null.
export function extAuthMarker(provider, now) {
  return JSON.stringify({ provider, ts: now });
}

export function readExtAuthMarker(raw, now) {
  if (!raw) return null;
  try {
    const { provider, ts } = JSON.parse(raw);
    if (provider && typeof ts === 'number' && now - ts < EXT_AUTH_TTL_MS) return provider;
  } catch { /* corrupt marker */ }
  return null;
}

export const EXT_AUTH_SCREEN_TEXT = {
  'signed-in': 'Signed in. You can close this tab and continue in the ReLU panel on LeetCode.',
  canceled: 'Sign-in was canceled. You can close this tab and try again.',
  finishing: 'Finishing sign-in…',
  opening: 'Opening Google sign-in…',
};
