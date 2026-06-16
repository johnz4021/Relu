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
  let overlayExpanded = false; // sidebar (false) vs fullscreen (true) — feeds the highlight ack's `visible`
  let activeMark = null;     // <mark> fallback node when the Highlight API is unavailable — unwrapped on clear

  // ----- rail geometry (design review 2026-06-11: push-don't-cover + resizable rail)
  // The sidebar PUSHES the leetcode layout left (margin-right on <html>) instead of
  // occluding the editor. Fixed-position page chrome (top nav) doesn't reflow and
  // slides under our opaque rail — accepted; the flow content (description, editor)
  // is what must stay visible.
  const RAIL_MIN = 420;          // below this the embed's chat column is unusable
  const RAIL_MAX_FRACTION = 0.6; // never take more than 60% of the window from the page
  // Open at a true sidebar width, not a half-window. 440 keeps the embed below
  // Tailwind's md (768px) so the app stays single-column (auth form, stacked
  // viz+chat) instead of unfolding the wide two-column desktop layouts. Students
  // who want more room drag the grip; the choice persists (relu_rail_width).
  const RAIL_DEFAULT = 440;
  // Bump when the default/sizing design changes. A persisted width lives in the
  // leetcode.com page's localStorage and survives extension/page reloads — so a
  // stale half-window drag from an earlier build (e.g. ~520–768px) would keep
  // overriding the new sidebar default forever. A version mismatch drops the old
  // value ONCE (reset to RAIL_DEFAULT); the next drag re-persists under v2.
  const RAIL_PREF_VERSION = '2';
  let railWidth = RAIL_DEFAULT;
  try {
    const saved = parseInt(localStorage.getItem('relu_rail_width'), 10);
    const savedVer = localStorage.getItem('relu_rail_width_v');
    if (savedVer === RAIL_PREF_VERSION && Number.isFinite(saved)) {
      railWidth = saved; // honored: saved under the current design
    } else if (localStorage.getItem('relu_rail_width') !== null) {
      localStorage.removeItem('relu_rail_width'); // stale design — reset to default once
    }
  } catch { /* storage blocked — default stands */ }
  let pagePushed = false;      // whether <html> currently carries our margin/transition
  let prevHtmlMargin = '';     // <html>'s prior inline margin-right, restored on close
  let prevHtmlTransition = ''; // <html>'s prior inline transition, restored on close
  let winResizeHandler = null; // re-clamps the rail when the window shrinks

  function clampRail(w) {
    const max = Math.max(RAIL_MIN, Math.round(window.innerWidth * RAIL_MAX_FRACTION));
    return Math.round(Math.min(Math.max(w, RAIL_MIN), max));
  }

  function pushPage(px, { animate = true } = {}) {
    const html = document.documentElement;
    if (!pagePushed) {
      pagePushed = true;
      prevHtmlMargin = html.style.marginRight || '';
      prevHtmlTransition = html.style.transition || '';
    }
    html.style.transition = animate ? 'margin-right 0.2s ease' : 'none';
    html.style.marginRight = px + 'px';
  }

  function unpushPage() {
    if (!pagePushed) return;
    const html = document.documentElement;
    html.style.marginRight = prevHtmlMargin;
    html.style.transition = prevHtmlTransition;
    pagePushed = false;
  }

  // ----- design tokens + a11y styles (Step 8) -------------------------------
  // A minimal CSS-variable token set, scoped with relu-* names so it can't clash
  // with leetcode's chrome, plus focus-visible rings on our controls. Fonts +
  // accent MIRROR the in-app theme (client/src/index.css @theme: Instrument Sans /
  // Source Sans 3, --color-accent #d4a574) so the launcher + overlay chrome read as
  // the same product. Best-effort load; leetcode CSP may block the link, in which
  // case the fallback stack — NOT bare system-ui — applies.
  function injectReluStyles() {
    if (document.getElementById('relu-tokens')) return;
    try {
      const font = document.createElement('link');
      font.rel = 'stylesheet';
      font.href = 'https://fonts.googleapis.com/css2?family=Instrument+Sans:wght@400;500;600;700&family=Source+Sans+3:wght@400;500;600&display=swap';
      document.head.appendChild(font);
    } catch { /* head not ready / blocked — fallback stack covers it */ }

    const style = document.createElement('style');
    style.id = 'relu-tokens';
    style.textContent = `
      :root {
        --relu-accent: #d4a574;
        --relu-accent-press: #c0956c;
        --relu-bar-bg: #161615;
        --relu-text: #e8e5e0;
        --relu-radius: 12px;
        --relu-font: 'Instrument Sans', 'Source Sans 3', ui-sans-serif, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      }
      #relu-stuck-btn:focus-visible,
      #relu-overlay button:focus-visible {
        outline: 2px solid var(--relu-accent);
        outline-offset: 2px;
      }
      #relu-rail-grip:hover,
      #relu-rail-grip:focus-visible {
        background: rgba(212, 165, 116, 0.35);
        outline: none;
      }
      ::highlight(relu-hint) {
        background-color: rgba(212, 165, 116, 0.32);
        color: inherit;
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
    // Fallback only — selectors rot on leetcode redesigns. Selector list is
    // shared with the highlight anchorer (anchor.js) so rot is fixed once.
    const sel = globalThis.ReLUAnchor?.DESCRIPTION_SELECTORS || ['[data-track-load="description_content"]'];
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
    // Anti-slop: no emoji, the app's warm tan accent (no gradient), real font.
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
      color: '#0d0d0d', // dark text on the light tan accent (matches the app's text-surface-0 on accent buttons; white would fail contrast)
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
    if (winResizeHandler) { window.removeEventListener('resize', winResizeHandler); winResizeHandler = null; }
  }

  function openOverlay(problem) {
    if (overlayEl) { overlayEl.remove(); overlayEl = null; }
    clearReadyHandler();

    railWidth = clampRail(railWidth); // re-clamp against the current window
    const wrap = document.createElement('div');
    wrap.id = 'relu-overlay';
    // a11y: a labelled modal dialog in the app's dark theme (surface-0), not leetcode
    // chrome. Dark panel bg also avoids a white flash before the iframe app paints.
    wrap.setAttribute('role', 'dialog');
    wrap.setAttribute('aria-modal', 'true');
    wrap.setAttribute('aria-label', 'ReLU helper');
    Object.assign(wrap.style, {
      position: 'fixed', top: '0', right: '0', height: '100vh', width: railWidth + 'px',
      zIndex: '2147483647', boxShadow: '-8px 0 24px rgba(0,0,0,.3)', background: '#0d0d0d',
      display: 'flex', flexDirection: 'column', font: '400 14px var(--relu-font)',
      transition: 'width 0.2s ease', // D2: hybrid sidebar <-> fullscreen
    });

    const bar = document.createElement('div');
    Object.assign(bar.style, { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 8px 4px 14px', background: 'var(--relu-bar-bg)', color: 'var(--relu-text)', borderBottom: '1px solid #2a2a28', font: '600 13px var(--relu-font)' });
    bar.innerHTML = '<span>ReLU</span>';

    const btnGroup = document.createElement('div');
    Object.assign(btnGroup.style, { display: 'flex', alignItems: 'center', gap: '2px' });

    // Shared by the ✕ button and Escape: tear down + restore focus to the launcher.
    function closeOverlay() {
      track('extension_overlay_closed');
      clearPageHighlight(); // no orphan highlight (or <mark>) after the companion leaves
      unpushPage();         // give the page its width back
      wrap.remove();
      overlayEl = null;
      clearReadyHandler();
      try { launcherEl?.focus(); } catch { /* launcher gone (SPA nav) */ }
    }

    // a11y: 44px tap targets, real icon buttons with labels + focus rings.
    const iconBtnStyle = { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minWidth: '44px', minHeight: '44px', background: 'transparent', color: 'var(--relu-text)', border: 'none', cursor: 'pointer', fontSize: '18px', lineHeight: '1', borderRadius: '8px' };

    // D2: expand-to-fullscreen toggle. Sidebar default (stay on the problem),
    // pop to full screen for dense viz, collapse back.
    let expanded = false;
    overlayExpanded = false; // fresh overlay opens in sidebar mode
    const expandBtn = document.createElement('button');
    expandBtn.type = 'button';
    expandBtn.textContent = '⤢';
    expandBtn.title = 'Expand to full screen';
    expandBtn.setAttribute('aria-label', 'Expand to full screen');
    Object.assign(expandBtn.style, iconBtnStyle);
    // Single source of truth for the sidebar<->fullscreen toggle, so the in-frame app
    // can request expansion (the "State · expand" disclosure that reveals the context
    // panels post-reveal) over the private port — not only the button.
    function setExpanded(next) {
      if (next === expanded) return;
      expanded = next;
      overlayExpanded = expanded; // module-level mirror for the highlight ack's `visible`
      wrap.style.width = expanded ? '100vw' : railWidth + 'px';
      grip.style.display = expanded ? 'none' : ''; // no resize affordance over a fullscreen panel
      expandBtn.textContent = expanded ? '⤡' : '⤢';
      const label = expanded ? 'Collapse to sidebar' : 'Expand to full screen';
      expandBtn.title = label;
      expandBtn.setAttribute('aria-label', label);
      log(expanded ? 'expanded to fullscreen' : 'collapsed to sidebar');
    }
    expandBtn.addEventListener('click', () => setExpanded(!expanded));

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

    // Resizable rail (design review 2026-06-11): drag the left edge to trade page
    // width for panel width. Pointer events on the grip, not the iframe — the
    // cross-origin iframe swallows the pointer, so it's disabled during the drag.
    const grip = document.createElement('div');
    grip.id = 'relu-rail-grip';
    grip.setAttribute('role', 'separator');
    grip.setAttribute('aria-orientation', 'vertical');
    grip.setAttribute('aria-label', 'Resize the ReLU panel (arrow keys or drag)');
    grip.tabIndex = 0;
    Object.assign(grip.style, {
      position: 'absolute', left: '0', top: '0', bottom: '0', width: '8px',
      cursor: 'ew-resize', zIndex: '1', touchAction: 'none',
    });

    function applyRail(w, { animate = false } = {}) {
      railWidth = clampRail(w);
      if (expanded) return; // fullscreen owns the width; railWidth applies on collapse
      wrap.style.width = railWidth + 'px';
      pushPage(railWidth, { animate });
    }
    function persistRail() {
      try {
        localStorage.setItem('relu_rail_width', String(railWidth));
        localStorage.setItem('relu_rail_width_v', RAIL_PREF_VERSION);
      } catch { /* storage blocked */ }
    }

    grip.addEventListener('pointerdown', (e) => {
      if (expanded) return;
      e.preventDefault();
      grip.setPointerCapture(e.pointerId);
      iframe.style.pointerEvents = 'none';
      wrap.style.transition = 'none'; // live-track the pointer, no easing lag
      const move = (ev) => applyRail(window.innerWidth - ev.clientX);
      const up = () => {
        grip.removeEventListener('pointermove', move);
        iframe.style.pointerEvents = '';
        wrap.style.transition = 'width 0.2s ease';
        persistRail();
        track('extension_rail_resized', { width: railWidth });
      };
      grip.addEventListener('pointermove', move);
      grip.addEventListener('pointerup', up, { once: true });
      grip.addEventListener('pointercancel', up, { once: true });
    });
    grip.addEventListener('keydown', (e) => {
      if (expanded) return;
      if (e.key === 'ArrowLeft') { e.preventDefault(); applyRail(railWidth + 32, { animate: true }); persistRail(); }
      if (e.key === 'ArrowRight') { e.preventDefault(); applyRail(railWidth - 32, { animate: true }); persistRail(); }
    });

    wrap.appendChild(bar);
    wrap.appendChild(iframe);
    wrap.appendChild(grip);
    document.body.appendChild(wrap);
    overlayEl = wrap;

    // Push-don't-cover: shrink the page into the remaining width so the problem
    // description AND the editor stay visible next to the rail.
    pushPage(railWidth);
    winResizeHandler = () => { if (!expanded) applyRail(railWidth); };
    window.addEventListener('resize', winResizeHandler);

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
      if (d && d.type === 'relu_highlight') {
        handleHighlightCommand(d);
      }
      if (d && d.type === 'relu_request_expand') {
        setExpanded(true); // the in-frame "State · expand" disclosure asked to reveal panels
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

  // ----- 3.5 ANCHOR SPIKE HARNESS (eng review D7 — gates the highlight tool) --
  // Alt+Shift+H on a problem page: derives sentence quotes from the GraphQL
  // text (the SAME source the tutoring model will quote from), runs
  // ReLUAnchor.locateQuote against the live DOM's text nodes, paints the first
  // hit via CSS Custom Highlight API (the per-world open question — VISUALLY
  // confirm the tan wash appears), and dumps a fixture pair for
  // extension/anchor.test.js. Run on ~20 problems; the hit-rate decides whether
  // the server-side highlight pipeline gets built. Everything logs under TAG.

  function getDescriptionContainer() {
    for (const s of (globalThis.ReLUAnchor?.DESCRIPTION_SELECTORS || [])) {
      const el = document.querySelector(s);
      if (el && el.innerText && el.innerText.trim().length > 40) return el;
    }
    return null;
  }

  function collectTextNodes(container) {
    const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
    const nodes = [];
    let n;
    while ((n = walker.nextNode())) nodes.push(n);
    return nodes;
  }

  // Sentence-ish candidate quotes from the GraphQL text — what the model would
  // realistically pass as `quote`. Mixes prose sentences and constraint lines.
  function deriveSpikeQuotes(text) {
    const sentences = text
      .split(/(?<=[.?!])\s+/)
      .map((s) => s.trim())
      .filter((s) => s.length >= 20 && s.length <= 160);
    const constraints = text
      .split('\n')
      .map((s) => s.trim())
      .filter((s) => s.length >= 8 && s.length <= 120 && (s.includes('<=') || s.includes('10^') || /^\d/.test(s)));
    return [...new Set([...sentences.slice(0, 8), ...constraints.slice(0, 4)])];
  }

  async function runAnchorSpike() {
    const anchor = globalThis.ReLUAnchor;
    if (!anchor) { warn('SPIKE: anchor.js not loaded — check manifest content_scripts order'); return; }
    const container = getDescriptionContainer();
    if (!container) { warn('SPIKE: no description container matched DESCRIPTION_SELECTORS'); return; }
    const problem = await fetchViaGraphQL(currentSlug);
    if (!problem?.text) { warn('SPIKE: GraphQL extraction failed — cannot derive quotes'); return; }

    const nodes = collectTextNodes(container);
    const segments = nodes.map((node) => node.data);
    const quotes = deriveSpikeQuotes(problem.text);
    if (!quotes.length) { warn('SPIKE: no candidate quotes derived'); return; }

    const results = quotes.map((q) => {
      const loc = anchor.locateQuote(segments, q);
      return { quote: q.slice(0, 60), hit: !!loc, exact: loc?.exact ?? null, loc };
    });
    const hits = results.filter((r) => r.hit).length;
    log(`SPIKE [${currentSlug}]: ${hits}/${results.length} quotes anchored (${Math.round((hits / results.length) * 100)}%)`);
    console.table(results.map(({ quote, hit, exact }) => ({ quote, hit, exact })));

    // Paint test — the CSS.highlights per-world question. One range, centered.
    const first = results.find((r) => r.hit);
    if (first) {
      try {
        const range = new Range();
        range.setStart(nodes[first.loc.start.seg], first.loc.start.offset);
        range.setEnd(nodes[first.loc.end.seg], first.loc.end.offset);
        if (typeof Highlight !== 'undefined' && CSS.highlights) {
          CSS.highlights.set('relu-hint', new Highlight(range));
          nodes[first.loc.start.seg].parentElement?.scrollIntoView({ block: 'center', behavior: 'smooth' });
          log('SPIKE: painted via CSS.highlights — VISUAL CHECK: is a tan wash visible on:', first.quote);
        } else {
          warn('SPIKE: CSS Custom Highlight API unavailable in this world — mark fallback would be the only path');
        }
      } catch (err) {
        warn('SPIKE: paint threw', err);
      }
    }

    // Fixture pair for anchor.test.js (GraphQL text + raw DOM segments).
    const fixture = { slug: currentSlug, capturedAt: new Date().toISOString(), graphqlText: problem.text, segments };
    try { chrome.storage.local.set({ ['relu_fixture_' + currentSlug]: fixture }); } catch { /* storage full/gone */ }
    log('SPIKE: fixture stored (chrome.storage.local key relu_fixture_' + currentSlug + '). Copyable JSON below:');
    console.log(JSON.stringify(fixture));
    track('extension_anchor_spike', { hits, total: results.length });
  }

  // ----- 3.6 PAGE HIGHLIGHT (companion "point at the input" rung) -------------
  // Command arrives from the overlay over the private MessagePort
  // ({type:'relu_highlight', id, quote|clear}); the id-tagged ack goes back the
  // same way and the embed forwards it to the server, where the tool call is
  // awaiting it. anchored = range located; method = how it painted; visible =
  // on-screen in sidebar mode right now. Never mutates the page DOM except the
  // single-text-node <mark> fallback (unwrapped on every clear — eng review D3).

  function clearPageHighlight() {
    try { if (typeof Highlight !== 'undefined' && CSS.highlights) CSS.highlights.delete('relu-hint'); } catch { /* no registry */ }
    if (activeMark) {
      try {
        const parent = activeMark.parentNode;
        while (activeMark.firstChild) parent.insertBefore(activeMark.firstChild, activeMark);
        parent.removeChild(activeMark);
        parent.normalize(); // re-merge the split text nodes — DOM back to byte-identical
      } catch { /* leetcode re-rendered it away — nothing to unwrap */ }
      activeMark = null;
    }
  }

  function handleHighlightCommand(d) {
    const reply = (payload) => {
      try { authPort?.postMessage({ type: 'relu_highlight_result', id: d.id, ...payload }); } catch { /* port closed */ }
    };
    if (d.clear) {
      clearPageHighlight();
      reply({ anchored: true, method: 'clear', visible: false });
      return;
    }
    const anchor = globalThis.ReLUAnchor;
    const container = getDescriptionContainer();
    if (!anchor || !container || typeof d.quote !== 'string') {
      track('extension_highlight_shown', { ok: false, method: null, reason: 'no-container' });
      reply({ anchored: false, method: null, visible: false });
      return;
    }
    const nodes = collectTextNodes(container);
    const loc = anchor.locateQuote(nodes.map((n) => n.data), d.quote);
    if (!loc) {
      track('extension_highlight_shown', { ok: false, method: null, reason: 'no-match' });
      reply({ anchored: false, method: null, visible: false });
      return;
    }

    clearPageHighlight(); // one highlight at a time — replace, never stack
    let method = null;
    try {
      const range = new Range();
      range.setStart(nodes[loc.start.seg], loc.start.offset);
      range.setEnd(nodes[loc.end.seg], loc.end.offset);
      if (typeof Highlight !== 'undefined' && CSS.highlights) {
        CSS.highlights.set('relu-hint', new Highlight(range));
        method = 'highlight-api';
      } else if (loc.start.seg === loc.end.seg) {
        // <mark> fallback (eng review D3 — accepted React-DOM risk, single text
        // node only, strict unwrap on clear).
        const mark = document.createElement('mark');
        mark.className = 'relu-mark';
        mark.style.backgroundColor = 'rgba(212, 165, 116, 0.32)'; // tan accent wash, matches ::highlight(relu-hint)
        mark.style.color = 'inherit';
        range.surroundContents(mark);
        activeMark = mark;
        method = 'mark';
      } else {
        track('extension_highlight_shown', { ok: false, method: null, reason: 'multi-node-no-api' });
        reply({ anchored: false, method: null, visible: false });
        return;
      }
      // Instant scroll (not smooth) so the visibility rect below tells the truth.
      nodes[loc.start.seg].parentElement?.scrollIntoView({ block: 'center', behavior: 'auto' });
      const rect = range.getBoundingClientRect();
      const onScreen = rect.bottom > 0 && rect.top < window.innerHeight && rect.width + rect.height > 0;
      const visible = onScreen && !overlayExpanded;
      track('extension_highlight_shown', { ok: true, method, visible });
      reply({ anchored: true, method, visible });
    } catch (err) {
      warn('highlight paint threw', err);
      track('extension_highlight_shown', { ok: false, method, reason: 'paint-threw' });
      reply({ anchored: false, method: null, visible: false });
    }
  }

  // ----- 4. SPA navigation (leetcode switches problems w/o reload) -----------

  function onRouteMaybeChanged() {
    const slug = slugFromUrl();
    if (slug === currentSlug) return; // no change (covers null===null and same problem)
    currentSlug = slug;
    // Any detected route change tears down a stale overlay + highlight so the
    // frame never keeps talking about the PREVIOUS problem (the side-panel
    // switch bug — investigate 2026-06-16).
    clearPageHighlight();
    if (overlayEl) { overlayEl.remove(); overlayEl = null; clearReadyHandler(); unpushPage(); }
    if (slug) {
      log('problem switch →', slug);
      injectButton(); // fresh launcher for the new problem; clicking reopens with it
    } else {
      log('left problem page — overlay torn down');
      const btn = document.getElementById('relu-stuck-btn');
      if (btn) { btn.remove(); launcherEl = null; }
    }
  }

  function watchForRouteChanges() {
    // LeetCode is an SPA: problem→problem navigation (the side panel, next/prev)
    // happens via history.pushState in the PAGE's MAIN world. We CANNOT intercept
    // that from the ISOLATED world — patching history.pushState here only touches
    // the isolated realm's History object, never the page's, so the old pushState
    // hook silently missed every side-panel switch and the overlay stayed pinned
    // to the old problem (investigate 2026-06-16). location.pathname DOES reflect
    // the live URL across worlds, so we poll it. popstate (back/forward) crosses
    // worlds too, so we keep it for instant response on those.
    window.addEventListener('popstate', onRouteMaybeChanged);
    let lastHref = location.href;
    setInterval(() => {
      if (location.href !== lastHref) {
        lastHref = location.href;
        onRouteMaybeChanged();
      }
    }, 400);
  }

  // ----- boot ---------------------------------------------------------------
  injectReluStyles();
  currentSlug = slugFromUrl();
  if (currentSlug) {
    log('booted on', currentSlug, '| nonce', NONCE, '| Alt+Shift+H = anchor spike');
    injectButton();
  }
  watchForRouteChanges();
  document.addEventListener('keydown', (e) => {
    // e.code (physical key), NOT e.key: on macOS Option+Shift+H yields e.key "Ó",
    // so a key-value check never fires there.
    if (e.altKey && e.shiftKey && e.code === 'KeyH' && currentSlug) {
      e.preventDefault();
      runAnchorSpike();
    }
  });
})();
