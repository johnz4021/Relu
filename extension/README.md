# ReLU Stuck Helper — Spike (step 1)

Throwaway, load-unpacked-only dev extension. **Not** for the Web Store. Its whole
job is to answer the three kill-switch questions from the eng review before you
invest in the hardened build.

## What it does

On any `leetcode.com/problems/*` page it:
1. Drops a **"🧠 Stuck? Ask ReLU"** button (bottom-right).
2. On click, **extracts the problem** via LeetCode's GraphQL (`titleSlug` from the URL),
   falling back to DOM scraping, and logs it.
3. **Injects an iframe** overlay pointing at `https://www.relu.run`.
4. Console-logs everything under the `[ReLU-spike]` tag.

It touches **zero ReLU app code**. Fully reversible — delete the folder.

## Run it (≈2 min)

1. Chrome → `chrome://extensions` → toggle **Developer mode** (top-right).
2. **Load unpacked** → select this `extension/` folder.
3. Open a real problem, e.g. `https://leetcode.com/problems/two-sum/`.
4. Open DevTools console, filter by `ReLU-spike`.
5. Click the **Stuck?** button.

> To point the overlay at a local dev build instead of production, change
> `RELU_ORIGIN` at the top of `content.js` to `http://localhost:5173` and run
> `npm run dev` from the repo root.

## Reading the result — what each outcome means

| Observation | Verdict |
|---|---|
| `iframe load event fired` + ReLU UI visible in the panel | ✅ **Framing works** — leetcode's CSP allows framing relu.run. Biggest kill-switch cleared. |
| `iframe did NOT fire load within 4s` / blank panel / CSP error in console | ❌ **Framing blocked** by leetcode's CSP. Try the DNR fallback below before giving up. |
| `extraction OK { source: 'graphql', ... }` | ✅ **Extraction works** via the stable GraphQL path. |
| `extraction OK { source: 'dom', ... }` | ⚠️ GraphQL failed, DOM scrape saved it — flag for hardening. |
| `extraction FAILED` | ❌ Premium/locked problem or selectors rotted — the fallback is manual paste. |
| ReLU panel shows a **login screen** even though you're logged into relu.run | ✅ Confirms **storage partitioning (D2)** — the in-frame session is walled off. Expected. Step 2 (background-owned token) is the fix. |
| `button_shown` / `button_clicked` logged | ✅ **Instrumentation** path is viable (the activation metric). |

## If framing is blocked (DNR fallback)

LeetCode may set a `frame-src` CSP that blocks third-party iframes. To test whether
relaxing it unblocks framing:

1. In `manifest.json`, set the `relax_leetcode_csp` rule resource `"enabled": true`.
2. Reload the extension and the leetcode page.

`rules.json` **removes leetcode's CSP** on the problem page (a spike-only sledgehammer —
the hardened build would surgically rewrite only `frame-src`). If framing works *with*
the rule and fails *without* it, you've found your answer: the production extension needs
a targeted `declarativeNetRequest` header rule, and that becomes a Web Store review
talking point.

## What this spike does NOT do (step 2, only if framing works)

- Pass a real auth token into the frame (background-owned Supabase session → `postMessage`).
- The `/embed` route + `?embed` auto-start (today the problem is logged for manual paste).
- Hardened postMessage (origin + `event.source` + nonce) validation in the app.
- Tests, Web Store packaging.

See the design doc's "Engineering Review — Architecture Decisions" section for the full plan.
