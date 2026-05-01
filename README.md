# ReLU

**Paste a LeetCode problem. Watch the algorithm animate step-by-step. Get an AI tutor that guides you toward genuine understanding — not just the answer.**

ReLU is the only tool that combines live algorithm animation with adaptive AI tutoring. No other tool in 2026 does both.

**[→ Try it live](https://relu.app)** &nbsp;·&nbsp; 30 free sessions, no credit card

---

## What makes it different

Most students grind LeetCode by brute-force repetition. ReLU replaces that with a conversation: you paste a problem, the algorithm animates in real time, and the AI tutor asks Socratic questions that lead you to understand the *pattern* — not just the solution.

The wedge moment: getting a problem right because you understood it, not because you copied it.

---

## Screenshots

![Algorithm animation and AI tutor](docs/screenshot-session.png)

---

## Self-hosting

Run your own instance in four steps.

**1. Clone the repo**
```bash
git clone https://github.com/johnz4021/ReLU.git
cd ReLU
```

**2. Create your accounts**
- [Supabase](https://supabase.com) — free tier is fine. Run `supabase-schema.sql` in the SQL editor to create the tables.
- [Anthropic](https://console.anthropic.com/settings/keys) — for the AI tutor.

**3. Configure environment variables**
```bash
cp .env.example .env
# Fill in SUPABASE_URL, SUPABASE_SECRET_KEY, VITE_SUPABASE_URL,
# VITE_SUPABASE_PUBLISHABLE_KEY, ANTHROPIC_API_KEY, and ENCRYPTION_KEY.
# See .env.example for full docs on each variable.
```

**4. Install and run**
```bash
npm install
npm install --prefix client
npm run dev
```

Open [http://localhost:5173](http://localhost:5173).

---

## Architecture

```
ReLU/
├── server/          # Node.js WebSocket + HTTP server
│   ├── index.js     # WS connection handler, session gate, auth
│   ├── guidedAgent.js   # AI tutor — Socratic question loop
│   ├── algorithms/  # Algorithm runners (trace generators)
│   └── renderers/   # Renderer advisor (picks the right viz)
├── client/          # Vite + React
│   ├── src/App.jsx  # Root — auth, session state, WS client
│   └── src/components/
│       ├── renderers/   # Array, Graph, Tree, Table, etc.
│       └── Transcript.jsx   # Tutor conversation UI
└── supabase-schema.sql  # Run once in Supabase SQL editor
```

**Stack:** Node.js · WebSockets · Vite · React · Tailwind · Supabase auth · Anthropic Claude

**Session model:** 30 free sessions per account. Users who want unlimited can supply their own Anthropic key (encrypted at rest in Supabase — [see how](server/index.js)).

---

## Contributing

### Adding a new algorithm visualization

1. **Write the runner** in `server/algorithms/<category>/yourAlgo.js`. Export a `run(input)` function that returns `{ trace: [...steps], input }`. Each step is a plain object describing the algorithm state at that moment.

2. **Register it** in `server/algorithms/registry.js`:
   ```js
   your_algo: {
     label: 'Your Algorithm',
     run: yourAlgoModule.run,
     renderer: 'ArrayRenderer', // or GraphRenderer, TreeRenderer, etc.
   }
   ```

3. **Wire the renderer** — most algorithms map to an existing renderer in `client/src/components/renderers/`. If you need a new one, add it to `rendererManifest.js` and implement the component.

4. **Test it** — run `npm test` (Vitest). Add a smoke test in `server/algorithms/registry.smoke.test.js`.

The AI tutor picks up new algorithms automatically via the LeetCode parser — no prompt changes needed.

### Other contributions

- Bug reports: open an issue with the problem text you used and the error you saw.
- New renderers, UX improvements, and accessibility fixes are welcome.

---

## License

MIT — see [LICENSE](LICENSE).
