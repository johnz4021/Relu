// ReLU bridge — runs on relu.run (top-level tabs only; all_frames defaults to
// false, so it never injects into the embed iframe). Carries a freshly-created
// Supabase session into the extension. This is the frictionless-Google courier.
//
// Why it exists: Google won't render inside the leetcode iframe (X-Frame-Options),
// so the overlay's "Continue with Google" opens relu.run in a normal tab where Google
// works. The resulting session lands in relu.run's first-party storage, which the
// extension can't read on its own. In ?ext_auth handoff mode the app posts the session
// to the page; we relay it to the background worker, which already knows how to persist
// this {access_token, refresh_token} shape (relu_set_session).
(() => {
  'use strict';

  window.addEventListener('message', (e) => {
    // Same-document, same-origin only. The tokens are the user's own, but we still
    // refuse anything not posted by this page to itself.
    if (e.source !== window) return;
    if (e.origin !== location.origin) return;
    const d = e.data;
    if (!d || typeof d !== 'object') return;

    if (d.type === 'relu_ext_session') {
      const s = d.session;
      if (!s || !s.access_token || !s.refresh_token) return;
      console.log('[ReLU bridge] relaying session → worker (closeTab=' + !!d.closeTab + ')');
      chrome.runtime.sendMessage(
        { type: 'relu_set_session', closeSenderTab: !!d.closeTab, session: { access_token: s.access_token, refresh_token: s.refresh_token } },
        () => void chrome.runtime.lastError,
      );
      return;
    }

    // Sign-out forwarded from the web app — clear the extension's copy too, so a
    // logout on relu.run doesn't leave a stale session in the overlay.
    if (d.type === 'relu_ext_signout') {
      chrome.runtime.sendMessage({ type: 'relu_clear_session' }, () => void chrome.runtime.lastError);
    }
  });
})();
