// ReLU "Stuck Helper" — background service worker (eng D5: background-owned auth)
//
// Owns the Supabase session so a logged-in user never has to sign in again inside
// the overlay iframe. The iframe is a THIRD-PARTY frame on leetcode.com, so Chrome
// gives it a PARTITIONED storage bucket — the first-party relu.run session is
// invisible to it, which is the double-login that's the prime suspect for the prior
// 60→0 activation death. We fix it by persisting the session here, in the
// extension's own (non-partitioned, durable) chrome.storage.local, and handing it
// to the overlay on each open.
//
// Division of labor (deliberate): this worker is the DURABLE STORE; the overlay's
// supabase-js is the REFRESHER. supabase-js handles access_token expiry + refresh
// token rotation correctly on setSession(), so we let it, and it posts the rotated
// session back out (over a private MessagePort) for us to persist. chrome.storage
// is durable across MV3 cold-worker kills, so even after the worker is terminated
// and the access_token has expired, the refresh_token is still here and the overlay
// refreshes from it — no re-login. (Covers the test plan's cold-worker edge case.)

const SESSION_KEY = 'relu_session';

// ----- instrumentation sink (eng D4) ----------------------------------------
// The background worker is the funnel poster. Extension-side events (button_shown,
// opened, closed) were console-only — the D4 gap. We POST them to the PostHog HTTP
// capture API, tagged by the Supabase user id so they unify with the in-overlay
// app's PostHog events on one person. PostHog ingestion keys (phc_*) are public
// browser keys — the same one the web client ships. Fire-and-forget: if the sink is
// unreachable the event is dropped, never breaking anything (test-plan requirement).
const POSTHOG_KEY = 'phc_mEQEihXK45TOCLbXsTiFZCYUgjoQqtavJKkEDXw3vB4';
const POSTHOG_HOST = 'https://us.i.posthog.com';

chrome.runtime.onInstalled.addListener(() => {
  console.log('[ReLU] background installed (D5 auth + D4 instrumentation).');
});

// Decode the Supabase JWT's `sub` (the user id) without verifying — we only need it
// as a distinct_id, and the token came from our own stored session.
function decodeJwtSub(jwt) {
  try {
    const payload = jwt.split('.')[1];
    const json = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
    return JSON.parse(json).sub || null;
  } catch {
    return null;
  }
}

// distinct_id: prefer the Supabase user id (unifies extension + overlay events on one
// person), else a stable per-install anonymous id so the pre-login funnel still joins up.
async function getDistinctId() {
  const { [SESSION_KEY]: session } = await chrome.storage.local.get(SESSION_KEY);
  const sub = session?.access_token ? decodeJwtSub(session.access_token) : null;
  if (sub) return sub;
  const { relu_anon_id } = await chrome.storage.local.get('relu_anon_id');
  if (relu_anon_id) return relu_anon_id;
  const anon = 'anon_' + crypto.randomUUID();
  await chrome.storage.local.set({ relu_anon_id: anon });
  return anon;
}

async function track(event, properties) {
  if (!POSTHOG_KEY) return;
  try {
    const distinct_id = await getDistinctId();
    await fetch(`${POSTHOG_HOST}/capture/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      keepalive: true,
      body: JSON.stringify({
        api_key: POSTHOG_KEY,
        event,
        distinct_id,
        properties: { ...properties, $lib: 'relu-extension', source: 'extension_bg' },
      }),
    });
  } catch (err) {
    // Sink unreachable — drop the event, never break the session.
    console.warn('[ReLU] track dropped:', event, err?.message);
  }
}

function isUsableSession(s) {
  return !!(s && typeof s.access_token === 'string' && typeof s.refresh_token === 'string');
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  // Funnel event from the content script (or overlay, relayed via content script).
  // Fire-and-forget — no response awaited.
  if (msg?.type === 'relu_track' && typeof msg.event === 'string') {
    track(msg.event, msg.properties || {});
    return false;
  }

  // Content script asks for the stored session on overlay open. We return the raw
  // tokens; the overlay's supabase-js refreshes them if the access_token expired.
  if (msg?.type === 'relu_get_token') {
    chrome.storage.local
      .get(SESSION_KEY)
      .then(({ [SESSION_KEY]: session }) => {
        const usable = isUsableSession(session) ? session : null;
        console.log('[ReLU] relu_get_token →', usable ? 'session present' : 'no session');
        sendResponse({ session: usable });
      })
      .catch((err) => {
        console.warn('[ReLU] relu_get_token storage read failed:', err?.message);
        sendResponse({ session: null });
      });
    return true; // async sendResponse
  }

  // Overlay captured a fresh/rotated session (first in-frame login, or a token
  // refresh). Persist it so the next open is seamless and the refresh_token stays
  // current (Supabase rotates refresh tokens; the old one is invalidated).
  if (msg?.type === 'relu_set_session') {
    const s = msg.session;
    if (!isUsableSession(s)) {
      sendResponse({ ok: false, reason: 'invalid-session' });
      return true;
    }
    chrome.storage.local
      .set({ [SESSION_KEY]: { access_token: s.access_token, refresh_token: s.refresh_token, updated_at: Date.now() } })
      .then(() => {
        console.log('[ReLU] relu_set_session → persisted');
        sendResponse({ ok: true });
      })
      .catch((err) => {
        console.warn('[ReLU] relu_set_session write failed:', err?.message);
        sendResponse({ ok: false });
      });
    return true;
  }

  // Overlay signed out — drop the stored session so we don't re-inject a dead one.
  if (msg?.type === 'relu_clear_session') {
    chrome.storage.local
      .remove(SESSION_KEY)
      .then(() => {
        console.log('[ReLU] relu_clear_session → cleared');
        sendResponse({ ok: true });
      })
      .catch(() => sendResponse({ ok: false }));
    return true;
  }

  return false;
});
