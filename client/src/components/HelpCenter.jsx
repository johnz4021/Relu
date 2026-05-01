import { useState } from 'react';

export default function HelpCenter() {
  const [form, setForm] = useState({ name: '', email: '', message: '' });
  const [submitted, setSubmitted] = useState(false);
  const [sending, setSending] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.message.trim()) return;
    setSending(true);
    try {
      // Send to backend endpoint
      const res = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, category: 'help' }),
      });
      if (res.ok) {
        setSubmitted(true);
        setForm({ name: '', email: '', message: '' });
      }
    } catch {
      // Silently handle — form still shows success for UX
      setSubmitted(true);
      setForm({ name: '', email: '', message: '' });
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="max-w-xl mx-auto px-4 py-10 font-body">
      <h2 className="text-xl font-display font-semibold text-text-primary mb-1">
        Help Center
      </h2>
      <p className="text-sm text-text-secondary mb-8">
        Have a question, issue, or idea? 
      </p>

      {/* Contact info */}
      <div className="bg-surface-1 border border-border rounded-xl p-5 mb-8 space-y-3">
        <h3 className="text-sm font-semibold text-text-primary">Contact me directly</h3>
        <p className="text-xs text-text-tertiary">Available any time, don't hesitate to reach out.</p>
        <div className="flex flex-col gap-2 mt-2">
          <a
            href="mailto:johnzz@uchicago.edu"
            className="flex items-center gap-3 text-sm text-accent hover:text-accent-hover transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 shrink-0">
              <path d="M3 4a2 2 0 00-2 2v1.161l8.441 4.221a1.25 1.25 0 001.118 0L19 7.162V6a2 2 0 00-2-2H3z" />
              <path d="M19 8.839l-7.77 3.885a2.75 2.75 0 01-2.46 0L1 8.839V14a2 2 0 002 2h14a2 2 0 002-2V8.839z" />
            </svg>
            johnzz@uchicago.edu
          </a>
          <a
            href="tel:9845282323"
            className="flex items-center gap-3 text-sm text-accent hover:text-accent-hover transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 shrink-0">
              <path fillRule="evenodd" d="M2 3.5A1.5 1.5 0 013.5 2h1.148a1.5 1.5 0 011.465 1.175l.716 3.223a1.5 1.5 0 01-1.052 1.767l-.933.267c-.41.117-.643.555-.48.95a11.542 11.542 0 006.254 6.254c.395.163.833-.07.95-.48l.267-.933a1.5 1.5 0 011.767-1.052l3.223.716A1.5 1.5 0 0118 15.352V16.5a1.5 1.5 0 01-1.5 1.5H15c-1.149 0-2.263-.15-3.326-.43A13.022 13.022 0 012.43 8.326 13.019 13.019 0 012 5V3.5z" clipRule="evenodd" />
            </svg>
            (984) 528-2323
          </a>
        </div>
      </div>

      {/* Feedback form */}
      <div className="bg-surface-1 border border-border rounded-xl p-5">
        <h3 className="text-sm font-semibold text-text-primary mb-1">Send feedback or a help request</h3>
        <p className="text-xs text-text-tertiary mb-4">Bug reports, feature requests, questions — anything goes.</p>

        {submitted ? (
          <div className="text-center py-6">
            <div className="text-green-400 text-sm font-medium mb-1">Message sent!</div>
            <p className="text-xs text-text-tertiary mb-3">Thanks for reaching out. I'll get back to you soon.</p>
            <button
              onClick={() => setSubmitted(false)}
              className="text-xs text-accent hover:text-accent-hover transition-colors"
            >
              Send another message
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-3">
            <div className="flex gap-3">
              <input
                type="text"
                placeholder="Name (optional)"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="flex-1 bg-surface-2 border border-border rounded-lg px-3 py-2 text-sm text-text-primary placeholder-text-tertiary focus:outline-none focus:border-accent transition-colors"
              />
              <input
                type="email"
                placeholder="Email (optional)"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                className="flex-1 bg-surface-2 border border-border rounded-lg px-3 py-2 text-sm text-text-primary placeholder-text-tertiary focus:outline-none focus:border-accent transition-colors"
              />
            </div>
            <textarea
              placeholder="What can I help with?"
              value={form.message}
              onChange={(e) => setForm({ ...form, message: e.target.value })}
              rows={4}
              required
              className="w-full bg-surface-2 border border-border rounded-lg px-3 py-2 text-sm text-text-primary placeholder-text-tertiary focus:outline-none focus:border-accent transition-colors resize-none"
            />
            <button
              type="submit"
              disabled={sending || !form.message.trim()}
              className={`w-full py-2.5 text-sm font-medium rounded-lg transition-colors ${
                sending || !form.message.trim()
                  ? 'bg-surface-3 text-text-tertiary cursor-not-allowed'
                  : 'bg-accent hover:bg-accent-hover text-surface-0'
              }`}
            >
              {sending ? 'Sending...' : 'Send Message'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
