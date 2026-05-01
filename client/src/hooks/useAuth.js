import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { posthog, POSTHOG_KEY } from '../lib/posthog';

export function useAuth() {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!supabase) {
      // No Supabase configured — skip auth
      setLoading(false);
      return;
    }

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (POSTHOG_KEY && session?.user) {
        posthog.identify(session.user.id, {
          email: session.user.email,
          email_domain: session.user.email?.split('@')[1],
        });
      }
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setSession(session);
        if (POSTHOG_KEY) {
          if (session?.user) {
            posthog.identify(session.user.id, {
              email: session.user.email,
              email_domain: session.user.email?.split('@')[1],
            });
          } else {
            posthog.reset();
          }
        }
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  const signOut = async () => {
    if (supabase) {
      await supabase.auth.signOut();
    }
    if (POSTHOG_KEY) posthog.reset();
  };

  return {
    session,
    user: session?.user ?? null,
    loading,
    signOut,
  };
}
