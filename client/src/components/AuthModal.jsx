import { useState } from 'react';
import { supabase } from '../lib/supabase';
import Logo from './Logo';

export default function AuthModal() {
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [message, setMessage] = useState(null);
  const [loading, setLoading] = useState(false);

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

  return (
    <div className="fixed inset-0 bg-surface-0 flex items-center justify-center z-50 p-4">
      <div className="w-full max-w-3xl bg-surface-1 border border-border rounded-xl overflow-hidden flex">

        {/* Left — product preview */}
        <div className="hidden md:flex flex-col justify-between w-1/2 bg-surface-2 p-8 border-r border-border">
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
            30 free sessions · No credit card
          </p>
        </div>

        {/* Right — auth form */}
        <div className="flex-1 p-8">
          <div className="md:hidden text-center mb-4">
            <Logo size="lg" />
          </div>

          <p className="text-sm text-text-tertiary font-body mb-6">
            {isSignUp ? 'Create an account to get started' : 'Sign in to continue'}
          </p>

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
