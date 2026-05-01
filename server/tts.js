// ElevenLabs TTS streaming

import WebSocket from 'ws';

const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
const VOICE_ID = process.env.ELEVENLABS_VOICE_ID || 'EXAVITQu4vr4xnSDxMaL';

// Auto-disable TTS after ElevenLabs failures (rate limit, credit exhaustion, etc.)
let ttsDisabled = false;

export function resetTTSDisabled() {
  if (ttsDisabled) {
    console.log('[TTS] Re-enabling TTS for new session');
    ttsDisabled = false;
  }
}

/**
 * Convert math/CS notation into speakable English for TTS.
 * ElevenLabs cannot handle symbols like dp[i][w], O(n log n), ≤, →, ∞, etc.
 * This runs before sending text to the API; the UI still shows original text.
 */
/**
 * Convert a single LaTeX math fragment (already stripped of $..$ delimiters)
 * into speakable English.
 */
function latexToSpeech(latex) {
  let t = latex;

  // \text{...} → plain text
  t = t.replace(/\\text\{([^}]*)\}/g, '$1');

  // \frac{a}{b} → "a over b"
  t = t.replace(/\\frac\{([^}]*)\}\{([^}]*)\}/g, '$1 over $2');

  // \sqrt{x} → "square root of x"
  t = t.replace(/\\sqrt\{([^}]*)\}/g, 'square root of $1');

  // Named operators / Greek letters → English words
  const symbols = [
    [/\\sum/g, 'sum'],
    [/\\prod/g, 'product'],
    [/\\int/g, 'integral'],
    [/\\min/g, 'min'],
    [/\\max/g, 'max'],
    [/\\log/g, 'log'],
    [/\\ln/g, 'ln'],
    [/\\inf/g, 'infimum'],
    [/\\sup/g, 'supremum'],
    [/\\lim/g, 'limit'],
    [/\\forall/g, 'for all'],
    [/\\exists/g, 'there exists'],
    [/\\in/g, ' in '],
    [/\\notin/g, ' not in '],
    [/\\subset/g, ' subset of '],
    [/\\subseteq/g, ' subset of '],
    [/\\cup/g, ' union '],
    [/\\cap/g, ' intersect '],
    [/\\emptyset/g, 'empty set'],
    [/\\neg/g, 'not '],
    [/\\land/g, ' and '],
    [/\\lor/g, ' or '],
    [/\\Sigma/g, 'sigma'],
    [/\\sigma/g, 'sigma'],
    [/\\Pi/g, 'pi'],
    [/\\pi/g, 'pi'],
    [/\\alpha/g, 'alpha'],
    [/\\beta/g, 'beta'],
    [/\\gamma/g, 'gamma'],
    [/\\delta/g, 'delta'],
    [/\\epsilon/g, 'epsilon'],
    [/\\lambda/g, 'lambda'],
    [/\\mu/g, 'mu'],
    [/\\theta/g, 'theta'],
    [/\\phi/g, 'phi'],
    [/\\infty/g, 'infinity'],
    [/\\cdot/g, ' times '],
    [/\\times/g, ' times '],
    [/\\div/g, ' divided by '],
    [/\\pm/g, ' plus or minus '],
    [/\\leq/g, ' less than or equal to '],
    [/\\geq/g, ' greater than or equal to '],
    [/\\neq/g, ' not equal to '],
    [/\\le/g, ' less than or equal to '],
    [/\\ge/g, ' greater than or equal to '],
    [/\\ne/g, ' not equal to '],
    [/\\lt/g, ' less than '],
    [/\\gt/g, ' greater than '],
    [/\\approx/g, ' approximately '],
    [/\\equiv/g, ' is equivalent to '],
    [/\\rightarrow/g, ' to '],
    [/\\leftarrow/g, ' from '],
    [/\\leftrightarrow/g, ' between '],
    [/\\Rightarrow/g, ' implies '],
    [/\\Leftarrow/g, ' is implied by '],
    [/\\iff/g, ' if and only if '],
    [/\\star/g, ' star '],
    [/\\ast/g, ' star '],
    [/\\mathbb\{N\}/g, 'the natural numbers'],
    [/\\mathbb\{R\}/g, 'the reals'],
    [/\\mathbb\{Z\}/g, 'the integers'],
    [/\\mathbb\{Q\}/g, 'the rationals'],
    [/\\mathbb\{C\}/g, 'the complex numbers'],
    [/\\mathbb\{(\w)\}/g, '$1'],
    [/\\mathcal\{O\}/g, 'big O'],
    [/\\bmod/g, ' mod '],
    [/\\pmod/g, ' mod '],
    [/\\mid/g, ' divides '],
    [/\\to/g, ' to '],
    [/\\implies/g, ' implies '],
    [/\\not/g, 'not '],
    [/\\ldots/g, ', and so on,'],
    [/\\cdots/g, ', and so on,'],
    [/\\prime/g, ' prime'],
    [/\\circ/g, ' composed with '],
  ];
  for (const [pat, rep] of symbols) {
    t = t.replace(pat, rep);
  }

  // Superscripts: x^{2} → "x to the power of 2", x^2 → "x squared"
  t = t.replace(/\^{\\prime}/g, ' prime');
  t = t.replace(/\^\{([^}]*)\}/g, ' to the power of $1');
  t = t.replace(/\^(\w)/g, (_, c) => {
    if (c === '2') return ' squared';
    if (c === '3') return ' cubed';
    return ` to the power of ${c}`;
  });

  // Special case: n_0 / n_{0} → "n naught"
  t = t.replace(/n_\{0\}/g, 'n naught');
  t = t.replace(/n_0/g, 'n naught');

  // Subscripts: x_{uv} → "x sub u v", x_i → "x sub i"
  t = t.replace(/_\{([^}]*)\}/g, ' sub $1');
  t = t.replace(/_(\w)/g, ' sub $1');

  // Strip remaining braces and backslashes
  t = t.replace(/[{}]/g, '');
  t = t.replace(/\\/g, ' ');

  return t.replace(/\s+/g, ' ').trim();
}

export function normalizeTTSText(text) {
  let t = text;

  // Process LaTeX math regions: $...$ → speakable English
  // Handle both $$...$$ (display) and $...$ (inline)
  t = t.replace(/\$\$([^$]+)\$\$/g, (_, inner) => latexToSpeech(inner));
  t = t.replace(/\$([^$]+)\$/g, (_, inner) => latexToSpeech(inner));

  // Single-letter function calls: f(n) → "f of n", T(n) → "T of n"
  // Negative lookbehind prevents matching multi-letter words like min(...), log(...)
  t = t.replace(/(?<![a-zA-Z])([a-zA-Z])\(([^)]+)\)/g, '$1 of $2');

  // Big-O notation: O(n log n) → "O of n log n"
  t = t.replace(/O\(([^)]+)\)/g, 'O of $1');

  // Double subscript: dp[i][w] → "dp of i, w"
  t = t.replace(/(\w+)\[([^\]]+)\]\[([^\]]+)\]/g, '$1 of $2, $3');
  // Single subscript: arr[0] → "arr of 0"
  t = t.replace(/(\w+)\[([^\]]+)\]/g, '$1 of $2');

  // Unicode superscripts: handle all digits, not just ² and ³
  // Multi-digit superscripts first (e.g. 3¹² → "3 to the power of 12")
  t = t.replace(/(\w)[⁰¹²³⁴⁵⁶⁷⁸⁹]+/g, (match) => {
    const base = match[0];
    const supMap = { '⁰': '0', '¹': '1', '²': '2', '³': '3', '⁴': '4', '⁵': '5', '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9' };
    const exp = [...match].slice(1).map(c => supMap[c] || c).join('');
    if (exp === '2') return `${base} squared`;
    if (exp === '3') return `${base} cubed`;
    return `${base} to the power of ${exp}`;
  });

  // Special case: n₀ → "n naught" (common in proofs)
  t = t.replace(/n₀/g, 'n naught');

  // Unicode subscript digits/letters (e.g. x₀, Mf with subscript f)
  t = t.replace(/[₀₁₂₃₄₅₆₇₈₉ₐₑₒₓₕₖₗₘₙₚₛₜ]+/g, (match) => {
    const subMap = { '₀': '0', '₁': '1', '₂': '2', '₃': '3', '₄': '4', '₅': '5', '₆': '6', '₇': '7', '₈': '8', '₉': '9', 'ₐ': 'a', 'ₑ': 'e', 'ₒ': 'o', 'ₓ': 'x', 'ₕ': 'h', 'ₖ': 'k', 'ₗ': 'l', 'ₘ': 'm', 'ₙ': 'n', 'ₚ': 'p', 'ₛ': 's', 'ₜ': 't' };
    const sub = [...match].map(c => subMap[c] || c).join('');
    return ` sub ${sub}`;
  });

  // Greek letters (Unicode, outside of LaTeX)
  t = t.replace(/ω/g, 'omega');
  t = t.replace(/Ω/g, 'omega');
  t = t.replace(/α/g, 'alpha');
  t = t.replace(/β/g, 'beta');
  t = t.replace(/γ/g, 'gamma');
  t = t.replace(/δ/g, 'delta');
  t = t.replace(/ε/g, 'epsilon');
  t = t.replace(/λ/g, 'lambda');
  t = t.replace(/μ/g, 'mu');
  t = t.replace(/θ/g, 'theta');
  t = t.replace(/φ/g, 'phi');
  t = t.replace(/σ/g, 'sigma');
  t = t.replace(/Σ/g, 'sigma');
  t = t.replace(/π/g, 'pi');
  t = t.replace(/Π/g, 'pi');
  t = t.replace(/τ/g, 'tau');

  // Quantifiers & logic (Unicode)
  t = t.replace(/∀/g, 'for all');
  t = t.replace(/∃/g, 'there exists');
  t = t.replace(/∈/g, ' in ');
  t = t.replace(/∉/g, ' not in ');
  t = t.replace(/∧/g, ' and ');
  t = t.replace(/∨/g, ' or ');
  t = t.replace(/¬/g, 'not ');

  // Set operations (Unicode)
  t = t.replace(/∩/g, ' intersect ');
  t = t.replace(/∪/g, ' union ');
  t = t.replace(/⊂/g, ' subset of ');
  t = t.replace(/⊆/g, ' subset of ');
  t = t.replace(/∅/g, 'empty set');

  // Double arrows (Unicode)
  t = t.replace(/⇔/g, ' if and only if ');
  t = t.replace(/⇒/g, ' implies ');
  t = t.replace(/⇐/g, ' is implied by ');

  // Multiplication / misc (Unicode)
  t = t.replace(/⋅/g, ' times ');
  t = t.replace(/·/g, ' times ');
  t = t.replace(/≈/g, ' approximately ');
  t = t.replace(/±/g, ' plus or minus ');
  t = t.replace(/×/g, ' times ');
  t = t.replace(/÷/g, ' divided by ');

  // Congruence / equivalence
  t = t.replace(/≡/g, ' is congruent to ');

  // Unicode math symbols
  t = t.replace(/∞/g, 'infinity');
  t = t.replace(/↔/g, ' between ');
  t = t.replace(/→/g, ' to ');
  t = t.replace(/←/g, ' from ');

  // ASCII arrows: A->B, A<-B, A<->B (must come before comparison operators)
  t = t.replace(/<->/g, ' between ');
  t = t.replace(/->/g, ' to ');
  t = t.replace(/<-/g, ' from ');
  t = t.replace(/≤/g, ' less than or equal to ');
  t = t.replace(/≥/g, ' greater than or equal to ');
  t = t.replace(/≠/g, ' not equal to ');

  // Equality operators: == → "equals"
  t = t.replace(/==/g, ' equals ');
  // Single = when followed by a value (assignment/equality in narration)
  t = t.replace(/(?<!=)=(?!=)/g, ' equals ');

  // Absolute value: |x| → "absolute value of x"
  t = t.replace(/\|([^|]+)\|/g, 'absolute value of $1');

  // Flow notation: "3/10" → "3 out of 10"
  t = t.replace(/(\d+)\/(\d+)/g, '$1 out of $2');

  // Set braces: {A, B} → "the set A, B"
  t = t.replace(/\{([^}]+)\}/g, 'the set $1');

  // Ellipsis → pause
  t = t.replace(/\.\.\./g, ', and so on,');

  // Clean up extra spaces
  t = t.replace(/\s+/g, ' ').trim();

  return t;
}

/**
 * Synthesize text to speech and stream audio to the client.
 * `sendBinaryFn(buffer)` is called for each audio chunk.
 * `sendJsonFn(obj)` is called to send JSON messages (audio_start/audio_end).
 * Falls back to simulated delay if no ElevenLabs key.
 */
export async function synthesizeAndStream(sendBinaryFn, text, speedMultiplier = 1, sendJsonFn = null, shouldAbort = null, muted = false) {
  if (ttsDisabled || muted) {
    // Skip TTS audio but add a reading-speed delay so segments don't fly by
    const wordCount = normalizeTTSText(text).split(/\s+/).length;
    // ~180 WPM reading speed, adjusted by speed multiplier
    const readingDelayMs = (wordCount * 333) / speedMultiplier;
    const start = Date.now();
    while (Date.now() - start < readingDelayMs) {
      if (shouldAbort && shouldAbort()) {
        return { aborted: true };
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    return { aborted: false, ttsAutoDisabled: ttsDisabled };
  }

  if (!ELEVENLABS_API_KEY) {
    console.log('[TTS] No ElevenLabs API key configured, using simulated delay');
    const wordCount = normalizeTTSText(text).split(/\s+/).length;
    const delayMs = (wordCount * 200) / speedMultiplier;
    // Check abort during simulated delay (poll every 100ms)
    const start = Date.now();
    while (Date.now() - start < delayMs) {
      if (shouldAbort && shouldAbort()) {
        console.log('[TTS] Simulated delay aborted by pause');
        return { aborted: true };
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    return { aborted: false };
  }

  console.log('[TTS] API key length:', ELEVENLABS_API_KEY.length, '| Voice ID:', VOICE_ID);

  const wsUrl = `wss://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}/stream-input?model_id=eleven_turbo_v2_5&output_format=pcm_24000`;

  const streamStartTime = Date.now();

  return new Promise((resolve) => {
    let receivedAudio = false;
    let totalAudioBytes = 0;
    let timeoutId = null;
    let aborted = false;
    let abortCheckInterval = null;

    const elWs = new WebSocket(wsUrl);

    // Poll for abort signal
    if (shouldAbort) {
      abortCheckInterval = setInterval(() => {
        if (shouldAbort()) {
          aborted = true;
          console.log('[TTS] Abort signal received — resolving immediately, closing ElevenLabs WS in background');
          clearInterval(abortCheckInterval);
          abortCheckInterval = null;
          clearTimeout(timeoutId);
          timeoutId = null;
          // Send audio_end before resolving so client knows stream is done
          if (sendJsonFn && receivedAudio) {
            sendJsonFn({ type: 'audio_end' });
          }
          // Resolve immediately — don't block on the ElevenLabs WS close handshake
          resolve({ aborted: true });
          // Close WS for cleanup; close event will fire but we guard against it below
          try { elWs.close(); } catch (_) {}
        }
      }, 50);
    }

    // Timeout: if no audio within 10s, warn and resolve
    timeoutId = setTimeout(() => {
      if (!receivedAudio) {
        console.warn('[TTS] No audio received within 10s, resolving (voice ID:', VOICE_ID, ')');
        try { elWs.close(); } catch (_) {}
        resolve({ aborted: false });
      }
    }, 10000);

    elWs.on('open', () => {
      console.log('[TTS] ElevenLabs WS connected');
      // ElevenLabs speed range is 0.7–1.2; clamp the multiplier
      const clampedSpeed = Math.min(1.2, Math.max(0.7, speedMultiplier));
      elWs.send(
        JSON.stringify({
          text: ' ',
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.75,
            speed: clampedSpeed,
          },
          xi_api_key: ELEVENLABS_API_KEY,
        })
      );
      elWs.send(JSON.stringify({ text: normalizeTTSText(text) + ' ' }));
      elWs.send(JSON.stringify({ text: '' }));
    });

    elWs.on('message', (data) => {
      if (aborted) return; // Stop forwarding audio after abort
      try {
        const raw = data.toString();
        const msg = JSON.parse(raw);
        if (!msg.audio) {
          console.log('[TTS] Non-audio message:', raw.slice(0, 200));
          // Detect ElevenLabs error responses (e.g. rate limit, invalid key)
          if (msg.error || msg.message || msg.detail) {
            const errorMsg = msg.error || msg.message || msg.detail;
            console.error('[TTS] ElevenLabs API error, auto-disabling TTS:', errorMsg);
            ttsDisabled = true;
            try { elWs.close(); } catch (_) {}
            resolve({ aborted: false, ttsAutoDisabled: true });
            return;
          }
        }
        if (msg.audio) {
          if (!receivedAudio) {
            receivedAudio = true;
            console.log('[TTS] First audio chunk received');
            if (sendJsonFn) {
              sendJsonFn({ type: 'audio_start' });
            }
          }
          const audioBuffer = Buffer.from(msg.audio, 'base64');
          totalAudioBytes += audioBuffer.length;
          sendBinaryFn(audioBuffer);
        }
        if (msg.isFinal) {
          console.log('[TTS] Stream complete (isFinal received)');
          elWs.close();
        }
      } catch (err) {
        console.error('[TTS] Error parsing message:', err.message);
      }
    });

    elWs.on('close', (code, reason) => {
      if (timeoutId) { clearTimeout(timeoutId); timeoutId = null; }
      if (abortCheckInterval) {
        clearInterval(abortCheckInterval);
        abortCheckInterval = null;
      }

      if (aborted) {
        // Already resolved in the abort polling check — nothing to do
        console.log('[TTS] ElevenLabs WS closed after abort (already resolved)');
        return;
      }

      // PCM 24000 Hz, 16-bit mono = 2 bytes per sample
      const audioDurationMs = (totalAudioBytes / (24000 * 2)) * 1000;
      const elapsedMs = Date.now() - streamStartTime;
      const remainingMs = Math.max(0, audioDurationMs - elapsedMs);
      console.log('[TTS] ElevenLabs WS closed, code:', code, 'reason:', reason?.toString() || '(none)');
      console.log(`[TTS] Audio duration: ${Math.round(audioDurationMs)}ms, elapsed: ${Math.round(elapsedMs)}ms, waiting: ${Math.round(remainingMs)}ms`);
      if (sendJsonFn && receivedAudio) {
        sendJsonFn({ type: 'audio_end' });
      }
      // Wait for client to finish playing queued audio (abortable)
      if (remainingMs <= 0 || !shouldAbort) {
        setTimeout(() => resolve({ aborted: false, audioDurationMs }), remainingMs);
      } else {
        const waitStart = Date.now();
        const pollInterval = setInterval(() => {
          if (shouldAbort()) {
            clearInterval(pollInterval);
            resolve({ aborted: true, audioDurationMs });
          } else if (Date.now() - waitStart >= remainingMs) {
            clearInterval(pollInterval);
            resolve({ aborted: false, audioDurationMs });
          }
        }, 50);
      }
    });

    elWs.on('error', (err) => {
      clearTimeout(timeoutId);
      if (abortCheckInterval) {
        clearInterval(abortCheckInterval);
        abortCheckInterval = null;
      }
      console.error('[TTS] ElevenLabs WS error, auto-disabling TTS:', err.message);
      ttsDisabled = true;
      try { elWs.close(); } catch (_) {}
      resolve({ aborted: false, ttsAutoDisabled: true });
    });
  });
}
