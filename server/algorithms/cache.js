/**
 * Two-level cache for generated trace generators.
 * L1: in-memory Map (fast, lost on restart)
 * L2: Supabase generated_traces table (persistent across restarts)
 *
 * Cache keys: plain algorithmId for Tier 1 / untitled requests,
 * or algorithmId:normalizedTitle for problem-specific Tier 2 generators.
 * Use buildCacheKey() to form the key consistently everywhere.
 */

const memCache = new Map();

async function getSupabase() {
  try {
    const { supabase } = await import('../supabase.js');
    return supabase;
  } catch {
    return null;
  }
}

export function buildCacheKey(algorithmId, description) {
  if (!description) return algorithmId;
  const normalized = description.toLowerCase().replace(/[^a-z0-9]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');
  return normalized ? `${algorithmId}:${normalized}` : algorithmId;
}

export async function getCachedGenerator(algorithmId, description) {
  const key = buildCacheKey(algorithmId, description);
  // L1 hit
  const mem = memCache.get(key);
  if (mem) return mem;

  // L2 hit
  const db = await getSupabase();
  if (!db) return null;

  const { data, error } = await db
    .from('generated_traces')
    .select('code, renderer, verified_at, hit_count')
    .eq('algorithm_id', key)
    .single();

  if (error || !data) return null;

  const entry = { code: data.code, renderer: data.renderer, verifiedAt: data.verified_at, hitCount: data.hit_count };
  memCache.set(key, entry);
  return entry;
}

export async function cacheGenerator(algorithmId, { code, renderer, verifiedAt }, description) {
  const key = buildCacheKey(algorithmId, description);
  const entry = { code, renderer, verifiedAt, hitCount: 0 };
  memCache.set(key, entry);

  const db = await getSupabase();
  if (!db) return;

  db.from('generated_traces')
    .upsert(
      { algorithm_id: key, code, renderer, verified_at: verifiedAt, hit_count: 0, updated_at: new Date().toISOString() },
      { onConflict: 'algorithm_id' }
    )
    .then(({ error }) => {
      if (error) console.error('[Cache] Supabase upsert error:', error.message);
    });
}

export async function incrementHitCount(algorithmId, description) {
  const key = buildCacheKey(algorithmId, description);
  const entry = memCache.get(key);
  if (entry) entry.hitCount++;

  const db = await getSupabase();
  if (!db) return;

  db.rpc('increment_trace_hit_count', { alg_id: key })
    .then(({ error }) => {
      // Silently ignore if RPC doesn't exist — hit count is best-effort
      if (error && !error.message.includes('does not exist')) {
        console.error('[Cache] increment hit_count error:', error.message);
      }
    });
}

/**
 * Returns true if the trace result matches the expected output, or if either is absent.
 * Uses the last result-typed step in the trace.
 * Comparison is string-based: false negatives possible for array outputs (e.g. [0,1] vs "0,1"),
 * but never false positives — the gate is safe.
 */
export function outputMatchesExpected(trace, expectedOutput) {
  if (!expectedOutput) return true;
  const resultStep = [...trace].reverse().find(s => s.type === 'result');
  if (!resultStep?.output) return true;
  return String(resultStep.output).trim() === String(expectedOutput).trim();
}
