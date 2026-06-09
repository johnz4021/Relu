// ReLU "Stuck Helper" — content script (SPIKE step 1)
//
// Runs in the ISOLATED world on https://leetcode.com/problems/*.
// Its only job is to answer the three kill-switch questions cheaply,
// WITHOUT touching any ReLU app code:
//
//   1. Can we frame relu.run inside leetcode.com?   (leetcode CSP frame-src)
//   2. Can we extract the current problem?           (GraphQL → DOM fallback)
//   3. Is the in-frame ReLU session partitioned?     (login wall in frame = yes)
//
// DATA FLOW
//   leetcode page ──┐
//                   ▼
//   slugFromUrl() ──▶ fetchViaGraphQL(slug) ──(fail)──▶ scrapeFromDom() ──(fail)──▶ null
//                   │
//                   ▼
//   "I'm stuck" button ──click──▶ inject <iframe src=RELU_ORIGIN/?embed=1#n=NONCE>
//                                 + console.log the extracted problem (paste it in
//                                   the frame by hand for the spike; auto-send is step 2)
//
// Everything important is console.log'd with the [ReLU-spike] tag so the
// instrumentation question ("can we measure button_shown / button_clicked")
// is answered for free. Filter the console by "ReLU-spike".

(() => {
  'use strict';

  // ----- config -------------------------------------------------------------
  // Where the overlay iframe points. Use production to test the real CSP/origin,
  // or http://localhost:5173 if you're running `npm run dev` locally.
  const RELU_ORIGIN = 'http://localhost:5173';
  const TAG = '[ReLU-spike]';
  const log = (...a) => console.log(TAG, ...a);
  const warn = (...a) => console.warn(TAG, ...a);

  // Per-load nonce. In step 2 the iframe (/embed) will require this on every
  // postMessage; page-world scripts can't read it because it lives only here
  // and in the iframe URL fragment (cross-origin to the page).
  const NONCE = Math.random().toString(36).slice(2) + Date.now().toString(36);

  let currentSlug = null;
  let overlayEl = null;
  let readyHandler = null;   // window 'message' listener for the embed handshake
  let authPort = null;       // MessagePort1 of the private content-script ↔ overlay channel (D5)
  let keydownHandler = null; // document keydown for Escape-to-close while overlay open
  let launcherEl = null;     // the "Stuck?" button — focus returns here when the overlay closes

  // ----- design tokens + a11y styles (Step 8) -------------------------------
  // A minimal CSS-variable token set, scoped with relu-* names so it can't clash
  // with leetcode's chrome, plus focus-visible rings on our controls. The font is
  // Inter (best-effort load; leetcode CSP may block the link, in which case the
  // fallback stack — NOT bare system-ui — applies).
  function injectReluStyles() {
    if (document.getElementById('relu-tokens')) return;
    try {
      const font = document.createElement('link');
      font.rel = 'stylesheet';
      font.href = 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap';
      document.head.appendChild(font);
    } catch { /* head not ready / blocked — fallback stack covers it */ }

    const style = document.createElement('style');
    style.id = 'relu-tokens';
    style.textContent = `
      :root {
        --relu-accent: #4f46e5;
        --relu-accent-press: #4338ca;
        --relu-bar-bg: #111827;
        --relu-radius: 12px;
        --relu-font: 'Inter', ui-sans-serif, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      }
      #relu-stuck-btn:focus-visible,
      #relu-overlay button:focus-visible {
        outline: 2px solid var(--relu-accent);
        outline-offset: 2px;
      }
    `;
    (document.head || document.documentElement).appendChild(style);
  }

  // ----- 0. background-owned auth (eng D5) ----------------------------------
  // The background worker is the durable owner of the Supabase session. These two
  // helpers are the content script's window onto it. Both swallow errors: auth is
  // best-effort, never a blocker for opening the overlay.

  function getStoredSession() {
    return new Promise((resolve) => {
      try {
        chrome.runtime.sendMessage({ type: 'relu_get_token' }, (resp) => {
          if (chrome.runtime.lastError) { resolve(null); return; }
          resolve(resp?.session || null);
        });
      } catch { resolve(null); }
    });
  }

  function saveSession(session) {
    try {
      chrome.runtime.sendMessage({ type: 'relu_set_session', session }, () => void chrome.runtime.lastError);
    } catch { /* worker gone; next open re-syncs */ }
  }

  // Funnel event → background → PostHog (eng D4). The background tags it with the
  // user id, so the extension-side funnel joins the in-overlay app events. Best
  // effort: a dead worker just means a dropped event, never a broken page.
  function track(event, props) {
    try {
      chrome.runtime.sendMessage(
        { type: 'relu_track', event, properties: { slug: currentSlug, ...props } },
        () => void chrome.runtime.lastError,
      );
    } catch { /* worker gone */ }
  }

  // ----- 1. slug + extraction ----------------------------------------------

  function slugFromUrl() {
    // /problems/two-sum/  ·  /problems/two-sum/description/  ·  with query
    const m = location.pathname.match(/^\/problems\/([^/]+)/);
    return m ? m[1] : null;
  }

  async function fetchViaGraphQL(slug) {
    // Same-origin from a leetcode.com content script → sends the user's cookies,
    // so locked/premium problems resolve iff the user has access.
    const body = {
      operationName: 'questionContent',
      variables: { titleSlug: slug },
      query: `query questionContent($titleSlug: String!) {
        question(titleSlug: $titleSlug) {
          questionId
          title
          titleSlug
          difficulty
          isPaidOnly
          content
        }
      }`,
    };
    try {
      const res = await fetch('https://leetcode.com/graphql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        warn('GraphQL HTTP', res.status);
        return null;
      }
      const json = await res.json();
      const q = json?.data?.question;
      if (!q || !q.content) {
        warn('GraphQL returned no content', json?.errors || q);
        return null;
      }
      return {
        source: 'graphql',
        title: q.title,
        slug: q.titleSlug,
        difficulty: q.difficulty,
        isPaidOnly: q.isPaidOnly,
        // content is HTML; strip tags to a plain problem statement for the spike.
        text: htmlToText(q.content),
      };
    } catch (err) {
      warn('GraphQL fetch threw', err);
      return null;
    }
  }

  function scrapeFromDom() {
    // Fallback only — selectors rot on leetcode redesigns. Try a few known
    // containers for the problem statement.
    const sel = [
      '[data-track-load="description_content"]',
      'div.elfjS', // 2024-era statement container (will drift)
      '[class*="content__"]',
    ];
    for (const s of sel) {
      const el = document.querySelector(s);
      const text = el && el.innerText && el.innerText.trim();
      if (text && text.length > 40) {
        return { source: 'dom', title: document.title, slug: currentSlug, text };
      }
    }
    return null;
  }

  function htmlToText(html) {
    const div = document.createElement('div');
    div.innerHTML = html;
    return (div.innerText || div.textContent || '').trim();
  }

  // parse-failure predicate: no usable statement from any source.
  async function extractProblem(slug) {
    const viaApi = await fetchViaGraphQL(slug);
    if (viaApi && viaApi.text && viaApi.text.length > 40) return viaApi;
    const viaDom = scrapeFromDom();
    if (viaDom) return viaDom;
    return null; // caller falls back to clipboard/manual paste
  }

  // ----- 2. UI: the "I'm stuck" button -------------------------------------

  function injectButton() {
    if (document.getElementById('relu-stuck-btn')) return;
    const btn = document.createElement('button');
    btn.id = 'relu-stuck-btn';
    // Anti-slop: no emoji, single restrained indigo accent (no gradient), real font.
    btn.textContent = 'Stuck? Ask ReLU';
    btn.setAttribute('aria-label', 'Open the ReLU stuck helper');
    Object.assign(btn.style, {
      position: 'fixed',
      right: '20px',
      bottom: '20px',
      zIndex: '2147483646',
      minHeight: '44px', // a11y: 44px tap target
      padding: '10px 18px',
      borderRadius: '999px',
      border: 'none',
      background: 'var(--relu-accent)',
      color: '#fff',
      font: '600 14px var(--relu-font)',
      cursor: 'pointer',
      boxShadow: '0 4px 14px rgba(0,0,0,.25)',
    });
    btn.addEventListener('click', onStuckClick);
    document.body.appendChild(btn);
    launcherEl = btn; // focus returns here when the overlay closes (a11y)
    log('button_shown', { slug: currentSlug });
    track('extension_button_shown');
  }

  async function onStuckClick() {
    log('button_clicked', { slug: currentSlug });
    track('extension_button_clicked');
    const problem = await extractProblem(currentSlug);
    if (!problem) {
      warn('extraction FAILED — no problem text. (Premium/locked or selectors rotted.) Fallback = manual paste.');
      track('extension_extraction', { ok: false });
    } else {
      log('extraction OK', {
        source: problem.source,
        title: problem.title,
        isPaidOnly: problem.isPaidOnly,
        chars: problem.text.length,
      });
      track('extension_extraction', { ok: true, source: problem.source, is_paid_only: !!problem.isPaidOnly });
    }
    openOverlay(problem);
  }

  // ----- 3. the overlay iframe (the framing kill-switch test) ----------------

  function clearReadyHandler() {
    if (readyHandler) { window.removeEventListener('message', readyHandler); readyHandler = null; }
    if (authPort) { try { authPort.close(); } catch { /* already closed */ } authPort = null; }
    if (keydownHandler) { document.removeEventListener('keydown', keydownHandler); keydownHandler = null; }
  }

  function openOverlay(problem) {
    if (overlayEl) { overlayEl.remove(); overlayEl = null; }
    clearReadyHandler();

    const SIDEBAR_WIDTH = 'min(520px, 90vw)';
    const wrap = document.createElement('div');
    wrap.id = 'relu-overlay';
    // a11y: a labelled modal dialog; distinct white panel + dark bar, not leetcode chrome.
    wrap.setAttribute('role', 'dialog');
    wrap.setAttribute('aria-modal', 'true');
    wrap.setAttribute('aria-label', 'ReLU helper');
    Object.assign(wrap.style, {
      position: 'fixed', top: '0', right: '0', height: '100vh', width: SIDEBAR_WIDTH,
      zIndex: '2147483647', boxShadow: '-8px 0 24px rgba(0,0,0,.3)', background: '#fff',
      display: 'flex', flexDirection: 'column', font: '400 14px var(--relu-font)',
      transition: 'width 0.2s ease', // D2: hybrid sidebar <-> fullscreen
    });

    const bar = document.createElement('div');
    Object.assign(bar.style, { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 8px 4px 14px', background: 'var(--relu-bar-bg)', color: '#fff', font: '600 13px var(--relu-font)' });
    bar.innerHTML = '<span>ReLU</span>';

    const btnGroup = document.createElement('div');
    Object.assign(btnGroup.style, { display: 'flex', alignItems: 'center', gap: '2px' });

    // Shared by the ✕ button and Escape: tear down + restore focus to the launcher.
    function closeOverlay() {
      track('extension_overlay_closed');
      wrap.remove();
      overlayEl = null;
      clearReadyHandler();
      try { launcherEl?.focus(); } catch { /* launcher gone (SPA nav) */ }
    }

    // a11y: 44px tap targets, real icon buttons with labels + focus rings.
    const iconBtnStyle = { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minWidth: '44px', minHeight: '44px', background: 'transparent', color: '#fff', border: 'none', cursor: 'pointer', fontSize: '18px', lineHeight: '1', borderRadius: '8px' };

    // D2: expand-to-fullscreen toggle. Sidebar default (stay on the problem),
    // pop to full screen for dense viz, collapse back.
    let expanded = false;
    const expandBtn = document.createElement('button');
    expandBtn.type = 'button';
    expandBtn.textContent = '⤢';
    expandBtn.title = 'Expand to full screen';
    expandBtn.setAttribute('aria-label', 'Expand to full screen');
    Object.assign(expandBtn.style, iconBtnStyle);
    expandBtn.addEventListener('click', () => {
      expanded = !expanded;
      wrap.style.width = expanded ? '100vw' : SIDEBAR_WIDTH;
      expandBtn.textContent = expanded ? '⤡' : '⤢';
      const label = expanded ? 'Collapse to sidebar' : 'Expand to full screen';
      expandBtn.title = label;
      expandBtn.setAttribute('aria-label', label);
      log(expanded ? 'expanded to fullscreen' : 'collapsed to sidebar');
    });

    const close = document.createElement('button');
    close.type = 'button';
    close.textContent = '✕';
    close.title = 'Close';
    close.setAttribute('aria-label', 'Close the ReLU helper');
    Object.assign(close.style, iconBtnStyle);
    close.addEventListener('click', closeOverlay);

    btnGroup.appendChild(expandBtn);
    btnGroup.appendChild(close);
    bar.appendChild(btnGroup);

    const iframe = document.createElement('iframe');
    // ?embed=1 is a hint for step 2 (the app ignores it today).
    // #n=NONCE shares the nonce with the future /embed via the URL fragment.
    iframe.src = `${RELU_ORIGIN}/?embed=1&t=${Date.now()}#n=${NONCE}`;
    Object.assign(iframe.style, { border: 'none', flex: '1', width: '100%' });

    // FRAMING KILL-SWITCH DETECTION:
    // if leetcode's CSP frame-src blocks relu.run, the load never fires / errors.
    let loaded = false;
    iframe.addEventListener('load', () => { loaded = true; log('iframe load event fired (framing NOT blocked at the element level)'); });
    iframe.addEventListener('error', () => warn('iframe error event — framing likely blocked'));
    setTimeout(() => {
      if (!loaded) warn('iframe did NOT fire load within 4s — leetcode CSP may be blocking relu.run. Try enabling the DNR rule (see README).');
    }, 4000);

    wrap.appendChild(bar);
    wrap.appendChild(iframe);
    document.body.appendChild(wrap);
    overlayEl = wrap;

    // a11y: move focus into the panel on open, and Escape closes. A full focus
    // TRAP is not possible from here — the panel body is a cross-origin iframe whose
    // focus is opaque to the parent — so we do the achievable: initial focus on a
    // panel control, Escape-to-close, and focus restored to the launcher on close.
    try { close.focus(); } catch { /* not focusable yet */ }
    keydownHandler = (e) => {
      if (e.key === 'Escape' && overlayEl) { e.preventDefault(); closeOverlay(); }
    };
    document.addEventListener('keydown', keydownHandler);

    // Handshake (eng D5): the embedded app posts {type:'relu_embed_ready'} once it
    // mounts. We reply with (a) the background-owned auth session and (b) the
    // extracted problem, so the lesson auto-starts WITHOUT a re-login.
    //
    // SECURITY — two directions, two channels:
    //   inbound  (session → iframe): a direct iframe.contentWindow.postMessage
    //            targeted at RELU_ORIGIN. The leetcode page-world cannot read a
    //            message addressed to the iframe, so the access_token is safe here.
    //   outbound (rotated session → us): a transferred MessagePort. supabase-js in
    //            the overlay rotates the refresh token; if it posted that back over
    //            the shared window bus, leetcode page-world scripts could read it.
    //            The private port keeps it off that bus entirely. (This is the
    //            "production TOKEN channel must use a transferred MessagePort"
    //            note from the App.jsx spike — now implemented.)
    //
    // Validate origin (only our relu.run frame can match). We deliberately do NOT
    // check e.source === iframe.contentWindow: in an isolated-world content script
    // cross-origin contentWindow identity is unreliable and silently dropped the
    // handshake during the spike.
    const authChannel = new MessageChannel();
    authPort = authChannel.port1;
    authPort.onmessage = (ev) => {
      const d = ev.data;
      if (d && d.type === 'relu_session_update' && d.session) {
        log('overlay → rotated session; persisting to background');
        saveSession(d.session);
      }
    };
    let authSent = false; // transfer the port exactly once per overlay

    readyHandler = async (e) => {
      if (e.origin !== RELU_ORIGIN) return;
      if (!e.data || e.data.type !== 'relu_embed_ready') return;
      log('embed app ready');
      if (!authSent) {
        authSent = true;
        const session = await getStoredSession();
        // Hand over the port even with no stored session, so a first in-frame
        // login can flow its session back out and be captured for next time.
        iframe.contentWindow.postMessage(
          { type: 'relu_auth_token', session: session || null, nonce: NONCE },
          RELU_ORIGIN,
          [authChannel.port2],
        );
        log(session ? 'sent stored session → overlay (no re-login)' : 'no stored session; overlay shows login once, then it sticks');
      }
      if (problem && problem.text) {
        iframe.contentWindow.postMessage(
          { type: 'relu_problem', problemText: problem.text, nonce: NONCE },
          RELU_ORIGIN,
        );
        log('sent problem → overlay');
      } else {
        warn('no extracted problem to auto-send — paste it into the frame manually.');
      }
    };
    window.addEventListener('message', readyHandler);

    log('overlay injected, iframe →', iframe.src);
    track('extension_overlay_opened', { had_problem: !!(problem && problem.text) });
  }

  // ----- 4. SPA navigation (leetcode switches problems w/o reload) -----------

  function onRouteMaybeChanged() {
    const slug = slugFromUrl();
    if (!slug) return; // not on a problem page
    if (slug === currentSlug) return;
    currentSlug = slug;
    log('problem switch →', slug);
    // tear down a stale overlay so the frame never talks about the old problem
    if (overlayEl) { overlayEl.remove(); overlayEl = null; clearReadyHandler(); }
    injectButton();
  }

  function hookHistory() {
    for (const m of ['pushState', 'replaceState']) {
      const orig = history[m];
      history[m] = function (...args) {
        const r = orig.apply(this, args);
        queueMicrotask(onRouteMaybeChanged);
        return r;
      };
    }
    window.addEventListener('popstate', onRouteMaybeChanged);
  }

  // ----- boot ---------------------------------------------------------------
  injectReluStyles();
  currentSlug = slugFromUrl();
  if (currentSlug) {
    log('booted on', currentSlug, '| nonce', NONCE);
    injectButton();
  }
  hookHistory();
})();
