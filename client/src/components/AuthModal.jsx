import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import Logo from './Logo';

// `embed` = rendered inside the leetcode extension rail (a narrow sidebar). There
// the desktop two-column marketing card (max-w-3xl + md: split) is the wrong shape:
// it blows the panel out to ~768px just to show the sign-in form. In embed we drop
// the marketing column and cap the card to a compact single column that fits a
// sidebar at any rail width.
export default function AuthModal({ embed = false }) {
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [message, setMessage] = useState(null);
  const [loading, setLoading] = useState(false);

  // Reset transient state when the page is restored from bfcache (back-forward cache).
  // Without this, hitting back from the Google OAuth screen leaves `loading: true`
  // because the in-flight signInWithOAuth never resolves on this page.
  useEffect(() => {
    const handlePageShow = (e) => {
      if (e.persisted) {
        setLoading(false);
        setError(null);
        setMessage(null);
      }
    };
    window.addEventListener('pageshow', handlePageShow);
    return () => window.removeEventListener('pageshow', handlePageShow);
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setMessage(null);
    setLoading(true);

    try {
      if (isSignUp) {
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        setMessage('Check your email for a confirmation link.');
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setError(null);
    setMessage(null);
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: window.location.origin },
      });
      if (error) throw error;
      // Browser navigates to Google. On return, useAuth picks up the session.
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-surface-0 flex items-center justify-center z-50 p-4">
      <div className={`w-full bg-surface-1 border border-border rounded-xl overflow-hidden flex ${embed ? 'max-w-sm' : 'max-w-3xl'}`}>

        {/* Left — product preview. Hidden in the extension rail (sidebar); shown on
            the standalone web app at md+ where there's room for the two-column card. */}
        <div className={`${embed ? 'hidden' : 'hidden md:flex'} flex-col justify-between w-1/2 bg-surface-2 p-8 border-r border-border`}>
          <div>
            <Logo size="lg" />
            <p className="mt-4 text-sm text-text-secondary font-body leading-relaxed">
              Paste a LeetCode problem. Watch the algorithm animate step-by-step.
              Get an AI tutor that asks the right questions until you actually understand it.
            </p>

            <ul className="mt-6 space-y-4">
              {[
                { icon: '◈', label: 'Live algorithm animation', detail: 'BFS, DFS, DP, graphs, trees — animated as the algorithm runs' },
                { icon: '◎', label: 'Socratic AI tutor', detail: 'Guides you to the insight, never just gives the answer' },
                { icon: '◐', label: 'Any LeetCode problem', detail: 'Paste the text, ReLU detects the algorithm and loads the right visualization' },
              ].map(({ icon, label, detail }) => (
                <li key={label} className="flex gap-3">
                  <span className="text-accent mt-0.5 text-lg leading-none">{icon}</span>
                  <div>
                    <div className="text-sm font-medium text-text-primary font-body">{label}</div>
                    <div className="text-xs text-text-tertiary font-body mt-0.5">{detail}</div>
                  </div>
                </li>
              ))}
            </ul>
          </div>

          <p className="text-xs text-text-tertiary font-body mt-8">
            10 free sessions · No credit card
          </p>
        </div>

        {/* Right — auth form */}
        <div className="flex-1 p-8">
          <div className={`${embed ? '' : 'md:hidden'} text-center mb-4`}>
            <Logo size="lg" />
          </div>

          <p className="text-sm text-text-tertiary font-body mb-6">
            {isSignUp ? 'Create an account to get started' : 'Sign in to continue'}
          </p>

          <button
            type="button"
            onClick={handleGoogleSignIn}
            disabled={loading}
            className="w-full py-2 mb-3 bg-white text-gray-900 text-sm font-medium font-body rounded-lg hover:bg-gray-100 transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
          >
            <svg width="16" height="16" viewBox="0 0 48 48" aria-hidden="true">
              <path fill="#FFC107" d="M43.611 20.083H42V20H24v8h11.303c-1.649 4.657-6.08 8-11.303 8-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-1.341-.138-2.65-.389-3.917z"/>
              <path fill="#FF3D00" d="M6.306 14.691l6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 16.318 4 9.656 8.337 6.306 14.691z"/>
              <path fill="#4CAF50" d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238C29.211 35.091 26.715 36 24 36c-5.202 0-9.619-3.317-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44z"/>
              <path fill="#1976D2" d="M43.611 20.083H42V20H24v8h11.303c-.792 2.237-2.231 4.166-4.087 5.571.001-.001.002-.001.003-.002l6.19 5.238C36.971 39.205 44 34 44 24c0-1.341-.138-2.65-.389-3.917z"/>
            </svg>
            Continue with Google
          </button>

          <div className="flex items-center gap-3 my-3">
            <div className="flex-1 h-px bg-border" />
            <span className="text-xs text-text-tertiary font-body">or</span>
            <div className="flex-1 h-px bg-border" />
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs text-text-secondary mb-1 font-body">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
                className="w-full px-3 py-2 bg-surface-2 border border-border rounded-lg text-sm text-text-primary font-body placeholder-text-tertiary focus:outline-none focus:border-accent transition-colors"
              />
            </div>
            <div>
              <label className="block text-xs text-text-secondary mb-1 font-body">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                minLength={6}
                className="w-full px-3 py-2 bg-surface-2 border border-border rounded-lg text-sm text-text-primary font-body placeholder-text-tertiary focus:outline-none focus:border-accent transition-colors"
              />
            </div>

            {error && (
              <p className="text-sm text-red-400 bg-red-400/10 px-3 py-2 rounded-lg font-body">{error}</p>
            )}
            {message && (
              <p className="text-sm text-green-400 bg-green-400/10 px-3 py-2 rounded-lg font-body">{message}</p>
            )}

            <button
              type="submit"
              disabled={loading}
              className={`w-full py-2 ${isSignUp ? 'bg-[#b07a50] hover:bg-[#9a6a45]' : 'bg-accent hover:bg-accent-hover'} disabled:opacity-50 text-surface-0 text-sm font-medium font-body rounded-lg transition-colors`}
            >
              {loading ? 'Loading...' : isSignUp ? 'Sign Up' : 'Sign In'}
            </button>
          </form>

          <p className="text-xs text-text-tertiary text-center mt-4 font-body">
            {isSignUp ? 'Already have an account?' : "Don't have an account?"}{' '}
            <button
              onClick={() => {
                setIsSignUp(!isSignUp);
                setError(null);
                setMessage(null);
              }}
              className="text-accent hover:text-accent-hover"
            >
              {isSignUp ? 'Sign In' : 'Sign Up'}
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}
