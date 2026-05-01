/**
 * Two-level cache for generated trace generators.
 * L1: in-memory Map (fast, lost on restart)
 * L2: Supabase generated_traces table (persistent across restarts)
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

export async function getCachedGenerator(algorithmId) {
  // L1 hit
  const mem = memCache.get(algorithmId);
  if (mem) return mem;

  // L2 hit
  const db = await getSupabase();
  if (!db) return null;

  const { data, error } = await db
    .from('generated_traces')
    .select('code, renderer, verified_at, hit_count')
    .eq('algorithm_id', algorithmId)
    .single();

  if (error || !data) return null;

  const entry = { code: data.code, renderer: data.renderer, verifiedAt: data.verified_at, hitCount: data.hit_count };
  memCache.set(algorithmId, entry);
  return entry;
}

export async function cacheGenerator(algorithmId, { code, renderer, verifiedAt }) {
  const entry = { code, renderer, verifiedAt, hitCount: 0 };
  memCache.set(algorithmId, entry);

  const db = await getSupabase();
  if (!db) return;

  db.from('generated_traces')
    .upsert(
      { algorithm_id: algorithmId, code, renderer, verified_at: verifiedAt, hit_count: 0, updated_at: new Date().toISOString() },
      { onConflict: 'algorithm_id' }
    )
    .then(({ error }) => {
      if (error) console.error('[Cache] Supabase upsert error:', error.message);
    });
}

export async function incrementHitCount(algorithmId) {
  const entry = memCache.get(algorithmId);
  if (entry) entry.hitCount++;

  const db = await getSupabase();
  if (!db) return;

  db.rpc('increment_trace_hit_count', { alg_id: algorithmId })
    .then(({ error }) => {
      // Silently ignore if RPC doesn't exist — hit count is best-effort
      if (error && !error.message.includes('does not exist')) {
        console.error('[Cache] increment hit_count error:', error.message);
      }
    });
}

export function getCacheStats() {
  const stats = {};
  for (const [id, entry] of memCache) {
    stats[id] = { renderer: entry.renderer, hitCount: entry.hitCount, verifiedAt: entry.verifiedAt };
  }
  return stats;
}
