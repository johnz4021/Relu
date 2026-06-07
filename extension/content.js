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
  const RELU_ORIGIN = 'https://www.relu.run';
  const TAG = '[ReLU-spike]';
  const log = (...a) => console.log(TAG, ...a);
  const warn = (...a) => console.warn(TAG, ...a);

  // Per-load nonce. In step 2 the iframe (/embed) will require this on every
  // postMessage; page-world scripts can't read it because it lives only here
  // and in the iframe URL fragment (cross-origin to the page).
  const NONCE = Math.random().toString(36).slice(2) + Date.now().toString(36);

  let currentSlug = null;
  let overlayEl = null;
  let readyHandler = null; // window 'message' listener for the embed handshake

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
    btn.textContent = '🧠 Stuck? Ask ReLU';
    Object.assign(btn.style, {
      position: 'fixed',
      right: '20px',
      bottom: '20px',
      zIndex: '2147483646',
      padding: '10px 16px',
      borderRadius: '999px',
      border: 'none',
      background: '#4f46e5',
      color: '#fff',
      font: '600 14px system-ui, sans-serif',
      cursor: 'pointer',
      boxShadow: '0 4px 14px rgba(0,0,0,.25)',
    });
    btn.addEventListener('click', onStuckClick);
    document.body.appendChild(btn);
    log('button_shown', { slug: currentSlug }); // instrumentation proof
  }

  async function onStuckClick() {
    log('button_clicked', { slug: currentSlug });
    const problem = await extractProblem(currentSlug);
    if (!problem) {
      warn('extraction FAILED — no problem text. (Premium/locked or selectors rotted.) Fallback = manual paste.');
    } else {
      log('extraction OK', {
        source: problem.source,
        title: problem.title,
        isPaidOnly: problem.isPaidOnly,
        chars: problem.text.length,
      });
      log('--- extracted problem text (paste into the frame for the spike) ---\n' + problem.text);
    }
    openOverlay(problem);
  }

  // ----- 3. the overlay iframe (the framing kill-switch test) ----------------

  function clearReadyHandler() {
    if (readyHandler) { window.removeEventListener('message', readyHandler); readyHandler = null; }
  }

  function openOverlay(problem) {
    if (overlayEl) { overlayEl.remove(); overlayEl = null; }
    clearReadyHandler();

    const SIDEBAR_WIDTH = 'min(520px, 90vw)';
    const wrap = document.createElement('div');
    wrap.id = 'relu-overlay';
    Object.assign(wrap.style, {
      position: 'fixed', top: '0', right: '0', height: '100vh', width: SIDEBAR_WIDTH,
      zIndex: '2147483647', boxShadow: '-8px 0 24px rgba(0,0,0,.3)', background: '#fff',
      display: 'flex', flexDirection: 'column',
      transition: 'width 0.2s ease', // D2: hybrid sidebar <-> fullscreen
    });

    const bar = document.createElement('div');
    Object.assign(bar.style, { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', background: '#111', color: '#fff', font: '600 13px system-ui' });
    bar.innerHTML = '<span>ReLU (spike)</span>';

    const btnGroup = document.createElement('div');
    Object.assign(btnGroup.style, { display: 'flex', alignItems: 'center', gap: '6px' });

    // D2: expand-to-fullscreen toggle. Sidebar default (stay on the problem),
    // pop to full screen for dense viz, collapse back.
    let expanded = false;
    const expandBtn = document.createElement('button');
    expandBtn.textContent = '⤢';
    expandBtn.title = 'Expand to full screen';
    Object.assign(expandBtn.style, { background: 'transparent', color: '#fff', border: 'none', cursor: 'pointer', fontSize: '16px', lineHeight: '1' });
    expandBtn.addEventListener('click', () => {
      expanded = !expanded;
      wrap.style.width = expanded ? '100vw' : SIDEBAR_WIDTH;
      expandBtn.textContent = expanded ? '⤡' : '⤢';
      expandBtn.title = expanded ? 'Collapse to sidebar' : 'Expand to full screen';
      log(expanded ? 'expanded to fullscreen' : 'collapsed to sidebar');
    });

    const close = document.createElement('button');
    close.textContent = '✕';
    Object.assign(close.style, { background: 'transparent', color: '#fff', border: 'none', cursor: 'pointer', fontSize: '16px', lineHeight: '1' });
    close.addEventListener('click', () => { wrap.remove(); overlayEl = null; clearReadyHandler(); });

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

    // Handshake (step 2): the embedded app posts {type:'relu_embed_ready'} once
    // it's authed + WS-connected. We reply with the extracted problem so the
    // lesson auto-starts. Validate origin + that it came from OUR iframe.
    if (problem && problem.text) {
      readyHandler = (e) => {
        if (e.origin !== RELU_ORIGIN) return;
        // NOTE: do NOT check e.source === iframe.contentWindow here. In a
        // content-script isolated world, cross-origin contentWindow identity is
        // unreliable and this check silently dropped the handshake. The origin
        // check above is the real boundary (only our relu.run frame can match).
        if (!e.data || e.data.type !== 'relu_embed_ready') return;
        log('embed app ready → sending problem');
        iframe.contentWindow.postMessage(
          { type: 'relu_problem', problemText: problem.text, nonce: NONCE },
          RELU_ORIGIN
        );
        clearReadyHandler(); // one-shot
      };
      window.addEventListener('message', readyHandler);
    } else {
      warn('no extracted problem to auto-send — sign in (if needed) and paste it into the frame manually.');
    }

    log('overlay injected, iframe →', iframe.src);
  }

  // ----- 4. SPA navigation (leetcode switches problems w/o reload) -----------

  function onRouteMaybeChanged() {
    const slug = slugFromUrl();
    if (!slug) return; // not on a problem page
    if (slug === currentSlug) return;
    currentSlug = slug;
    log('problem switch →', slug);
    // tear down a stale overlay so the frame never talks about the old problem
    if (overlayEl) { overlayEl.remove(); overlayEl = null; }
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
  currentSlug = slugFromUrl();
  if (currentSlug) {
    log('booted on', currentSlug, '| nonce', NONCE);
    injectButton();
  }
  hookHistory();
})();
