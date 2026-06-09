// ReLU anchor — pure quote-anchoring logic for the page-highlight tool.
//
// Loaded as a classic content script BEFORE content.js (see manifest.json), and
// imported by extension/anchor.test.js for unit testing. No DOM, no chrome.*
// APIs in here — content.js owns the TreeWalker and Range construction; this
// module only maps a (possibly GraphQL-normalized) quote onto an ordered list
// of raw text-node strings.
//
// WHY THE MAPPING IS CHAR-BY-CHAR
//   The model quotes from htmlToText(GraphQL content) — a textContent-style
//   flattening with its own whitespace. The live DOM's text nodes carry NBSPs,
//   smart quotes, and arbitrary whitespace runs. We normalize BOTH sides the
//   same way, but a match found in normalized space must be converted back to
//   raw (segmentIndex, charOffset) pairs to build a DOM Range — so every
//   emitted normalized char records where it came from.
//
//   segments: ["You are given ", "nums", " sorted in order."]
//                    │ normalize + concat (posMap remembers raw positions)
//                    ▼
//   "You are given nums sorted in order."
//                    │ indexOf(normalizedQuote)        (lowercase retry on miss)
//                    ▼
//   { start: {seg, offset}, end: {seg, offset} }       (end offset exclusive)

(() => {
  'use strict';

  // Problem-statement containers, most-specific first. Shared by scrapeFromDom
  // (content.js) and the highlight anchorer so selector rot is fixed in ONE place.
  // Selectors drift on leetcode redesigns — that is expected and monitored via
  // the extension_highlight_shown funnel event.
  const DESCRIPTION_SELECTORS = [
    '[data-track-load="description_content"]',
    'div.elfjS', // 2024-era statement container (will drift)
    '[class*="content__"]',
  ];

  // Single-char translations applied before whitespace collapsing. Keys are the
  // page-side variants; values are the canonical char the GraphQL text uses.
  const CHAR_MAP = {
    ' ': ' ', // NBSP
    '‘': "'", '’': "'", // smart single quotes
    '“': '"', '”': '"', // smart double quotes
    '−': '-', // minus sign
    '–': '-', '—': '-', // en/em dash
  };

  const isWhitespace = (c) => c === ' ' || c === '\t' || c === '\n' || c === '\r' || c === '\f' || c === '';

  function mapChar(c) {
    const t = CHAR_MAP[c] ?? c;
    return isWhitespace(t) ? ' ' : t;
  }

  // Normalize a standalone string (the quote side): char-map, collapse
  // whitespace runs to single spaces, trim.
  function normalizeText(s) {
    if (typeof s !== 'string') return '';
    let out = '';
    for (const c of s) {
      const m = mapChar(c);
      if (m === ' ' && out.endsWith(' ')) continue;
      out += m;
    }
    return out.trim();
  }

  // Normalize the segment list (the DOM side) while remembering, for every
  // emitted normalized char, the raw (segment, offset) it came from.
  // Returns { norm, posMap } where posMap[i] = { seg, offset } of norm[i].
  function buildNormalizedIndex(segments) {
    let norm = '';
    const posMap = [];
    for (let seg = 0; seg < segments.length; seg++) {
      const text = segments[seg] || '';
      for (let offset = 0; offset < text.length; offset++) {
        const m = mapChar(text[offset]);
        if (m === ' ' && (norm.length === 0 || norm.endsWith(' '))) continue;
        norm += m;
        posMap.push({ seg, offset });
      }
    }
    // No trailing trim needed: a trailing space can never end an indexOf match
    // because needles are trimmed.
    return { norm, posMap };
  }

  // Locate `quote` inside `segments` (ordered raw text-node strings).
  // Returns { start: {seg, offset}, end: {seg, offset}, exact: bool } or null.
  // `end.offset` is EXCLUSIVE (ready for Range.setEnd). First occurrence wins
  // on ambiguity. Falls back to a case-insensitive pass when the exact-case
  // match misses (models occasionally re-case sentence starts).
  function locateQuote(segments, quote, opts = {}) {
    const minLen = opts.minLength ?? 5;
    if (!Array.isArray(segments) || segments.length === 0) return null;
    const needle = normalizeText(quote);
    if (needle.length < minLen) return null;

    const { norm, posMap } = buildNormalizedIndex(segments);
    if (norm.length === 0) return null;

    let exact = true;
    let idx = norm.indexOf(needle);
    if (idx === -1) {
      exact = false;
      idx = norm.toLowerCase().indexOf(needle.toLowerCase());
    }
    if (idx === -1) return null;

    const startPos = posMap[idx];
    const lastPos = posMap[idx + needle.length - 1];
    return {
      start: { seg: startPos.seg, offset: startPos.offset },
      end: { seg: lastPos.seg, offset: lastPos.offset + 1 },
      exact,
    };
  }

  const api = { DESCRIPTION_SELECTORS, normalizeText, locateQuote, buildNormalizedIndex };

  // Classic-script consumers (content.js) and the vitest suite both read this.
  globalThis.ReLUAnchor = api;
})();
