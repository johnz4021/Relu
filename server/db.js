import { supabase } from './supabase.js';

/**
 * Create a new conversation for a user.
 */
export async function createConversation(userId, problemText) {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('conversations')
    .insert({ user_id: userId, problem_text: problemText, status: 'active' })
    .select('id')
    .single();

  if (error) {
    console.error('[DB] createConversation error:', error.message);
    return null;
  }
  return data.id;
}

/**
 * Save a message to a conversation (fire-and-forget).
 */
export function saveMessage(conversationId, role, type, content) {
  if (!supabase || !conversationId) return;
  supabase
    .from('messages')
    .insert({ conversation_id: conversationId, role, type, content })
    .then(({ error }) => {
      if (error) console.error('[DB] saveMessage error:', error.message);
    });
}

/**
 * Upsert agent state (messages array + solver result) for a conversation.
 */
export function saveAgentState(conversationId, messagesJson, solverResultJson, vizStateJson = null) {
  if (!supabase || !conversationId) return;
  supabase
    .from('agent_states')
    .upsert(
      {
        conversation_id: conversationId,
        messages_json: messagesJson,
        solver_result_json: solverResultJson || null,
        viz_state_json: vizStateJson || null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'conversation_id' }
    )
    .then(({ error }) => {
      if (error) console.error('[DB] saveAgentState error:', error.message);
    });
}

/**
 * Mark a conversation as complete.
 */
export function completeConversation(conversationId) {
  if (!supabase || !conversationId) return;
  supabase
    .from('conversations')
    .update({ status: 'complete', updated_at: new Date().toISOString() })
    .eq('id', conversationId)
    .then(({ error }) => {
      if (error) console.error('[DB] completeConversation error:', error.message);
    });
}

/**
 * List conversations for a user, most recent first.
 */
export async function listConversations(userId) {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('conversations')
    .select('id, problem_text, status, created_at, updated_at')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false });

  if (error) {
    console.error('[DB] listConversations error:', error.message);
    return [];
  }
  return data;
}

/**
 * Load all messages for a conversation.
 */
export async function loadConversationMessages(conversationId) {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('messages')
    .select('id, role, type, content, created_at')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true });

  if (error) {
    console.error('[DB] loadConversationMessages error:', error.message);
    return [];
  }
  return data;
}

/**
 * Save feedback to the feedback table (fire-and-forget).
 */
export function saveFeedback(category, { name, email, message, rating, meta }) {
  if (!supabase) return;
  supabase
    .from('feedback')
    .insert({ category, name, email, message, rating, meta })
    .then(({ error }) => {
      if (error) console.error('[DB] saveFeedback error:', error.message);
    });
}

/**
 * Load the agent state for a conversation (for resume).
 */
export async function loadAgentState(conversationId) {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('agent_states')
    .select('messages_json, solver_result_json, viz_state_json')
    .eq('conversation_id', conversationId)
    .single();

  if (error) {
    console.error('[DB] loadAgentState error:', error.message);
    return null;
  }
  return data;
}

/**
 * Count conversations for a user. Pass `sinceISO` to count only those created
 * on/after that timestamp (used for the Pro per-calendar-month cap); omit it for
 * the lifetime total (used for the free-trial gate).
 */
export async function countConversations(userId, sinceISO = null) {
  if (!supabase) return 0;
  let query = supabase
    .from('conversations')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId);
  if (sinceISO) query = query.gte('created_at', sinceISO);

  const { count, error } = await query;

  if (error) {
    console.error('[DB] countConversations error:', error.message);
    return 0;
  }
  return count || 0;
}

/**
 * Get user settings (API key, payment interest, etc.).
 */
export async function getUserSettings(userId) {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('user_settings')
    .select('*')
    .eq('user_id', userId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null; // not found
    console.error('[DB] getUserSettings error:', error.message);
    return null;
  }
  return data;
}

/**
 * Create a new LeetCode practice session record.
 */
export async function createLcSession(userId, title, algorithmKey, confidence, hasViz, outcomes = {}) {
  if (!supabase) return null;
  const { solver_succeeded, viz_rendered, session_completed } = outcomes;
  const { data, error } = await supabase
    .from('lc_sessions')
    .insert({
      user_id: userId,
      problem_title: title,
      algorithm_key: algorithmKey,
      confidence,
      has_viz: hasViz,
      ...(solver_succeeded !== undefined && { solver_succeeded }),
      ...(viz_rendered !== undefined && { viz_rendered }),
      ...(session_completed !== undefined && { session_completed }),
    })
    .select('id')
    .single();

  if (error) {
    console.error('[DB] createLcSession error:', error.message);
    return null;
  }
  return data.id;
}

/**
 * Mark a LeetCode session as mastered.
 */
export function masterLcSession(sessionId, userId) {
  if (!supabase || !sessionId) return;
  supabase
    .from('lc_sessions')
    .update({ mastered: true })
    .eq('id', sessionId)
    .eq('user_id', userId)
    .then(({ error }) => {
      if (error) console.error('[DB] masterLcSession error:', error.message);
    });
}

/**
 * List LeetCode sessions for a user, most recent first.
 */
export async function listLcSessions(userId) {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('lc_sessions')
    .select('id, problem_title, algorithm_key, confidence, has_viz, mastered, attempted_at')
    .eq('user_id', userId)
    .order('attempted_at', { ascending: false });

  if (error) {
    console.error('[DB] listLcSessions error:', error.message);
    return [];
  }
  return data;
}

/**
 * Get a user's Stripe subscription row, or null if they've never subscribed.
 */
export async function getSubscription(userId) {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('subscriptions')
    .select('*')
    .eq('user_id', userId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null; // not found
    console.error('[DB] getSubscription error:', error.message);
    return null;
  }
  return data;
}

/**
 * Upsert subscription state for a user. Called from the Stripe webhook on
 * checkout.session.completed.
 */
export async function upsertSubscription(userId, fields) {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('subscriptions')
    .upsert(
      { user_id: userId, ...fields, updated_at: new Date().toISOString() },
      { onConflict: 'user_id' }
    )
    .select()
    .single();

  if (error) {
    console.error('[DB] upsertSubscription error:', error.message);
    return null;
  }
  return data;
}

/**
 * Update subscription state by Stripe customer id. Called from the webhook on
 * customer.subscription.updated/deleted, where we only have Stripe's ids.
 */
export async function updateSubscriptionByCustomer(stripeCustomerId, fields) {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('subscriptions')
    .update({ ...fields, updated_at: new Date().toISOString() })
    .eq('stripe_customer_id', stripeCustomerId)
    .select();

  if (error) {
    console.error('[DB] updateSubscriptionByCustomer error:', error.message);
    return null;
  }
  return data?.[0] || null;
}

/**
 * Upsert user settings.
 */
export async function saveUserSettings(userId, fields) {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('user_settings')
    .upsert(
      { user_id: userId, ...fields, updated_at: new Date().toISOString() },
      { onConflict: 'user_id' }
    )
    .select()
    .single();

  if (error) {
    console.error('[DB] saveUserSettings error:', error.message);
    return null;
  }
  return data;
}
