# PayPilot AI — Agentic Commerce for Smarter Growth

![CI](https://github.com/asifsayyed06/PayPilot-AI-Agentic-Commerce-for-Smarter-Growth/actions/workflows/ci.yml/badge.svg)
![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)
![Node](https://img.shields.io/badge/Node-18%2B-green)

A working full-stack demo of how an AI shopping/purchasing agent can transact
on a user's behalf **within guardrails the user sets** — backed by a
transparent, rule-based risk engine and a human-in-the-loop approval step for
anything risky.

Built to explore a question that's becoming central to fintech and AI
infrastructure: **as AI agents start paying for things on our behalf, what
does a safe, auditable payment layer for that actually look like?**

![PayPilot AI Dashboard](assets/dashboard-screenshot.png)

## What it does

1. A user **authorizes an agent** with limits: per-transaction cap, daily
   spending cap, and an hourly transaction-rate limit, plus an optional
   merchant-category allow-list.
2. The agent receives a **signed JWT identity token** — it presents this on
   every payment request. The token embeds the agent's ID and owner.
3. When the agent tries to pay a merchant, the request runs through a
   **rule-based risk engine** that checks the hard limits, merchant category,
   merchant risk score, transaction velocity, and cumulative daily spend.
4. Based on the score, the transaction is **auto-approved, auto-declined, or
   held** for the human owner to review from the dashboard.
5. The dashboard shows a **live ledger**, lets you **revoke an agent
   instantly** (kill switch), and lets you **simulate agent purchases** to
   see the engine work.

## Why this project

This was built to demonstrate practical, end-to-end engineering ability
relevant to fintech, agentic AI, and platform-security roles:

- **System design**: a clean separation between identity (JWT), policy
  (per-agent limits), decisioning (risk engine), and audit (the ledger) —
  the same layering used in real payment-authorization systems.
- **Security-mindedness**: signed, short-lived agent tokens; an instant
  revocation path; and a human-in-the-loop step for anything the rules
  can't confidently approve.
- **Explainability over black boxes**: every decision comes with
  human-readable reasons, not just a score — something regulated systems
  need in practice.
- **Testing & CI**: the risk engine has unit tests (`npm test`) that run on
  every push via GitHub Actions.

## Tech stack

| Layer | Choice |
|---|---|
| Backend | Node.js, Express |
| Auth | JSON Web Tokens (`jsonwebtoken`) |
| Storage | JSON-file-backed store (swappable for Postgres/Mongo) |
| Frontend | Vanilla HTML/CSS/JS (no build step) |
| Testing | Node's built-in test runner (`node --test`) |
| CI | GitHub Actions |

## Project structure

```
PayPilot-AI/
├── index.html, styles.css, app.js   # Root copies of the frontend, so GitHub Pages can serve them directly
├── .nojekyll                        # Tells GitHub Pages to skip Jekyll processing
├── backend/
│   ├── server.js                    # Express app entrypoint
│   ├── db.js                        # JSON-file-backed store (swap for Postgres later)
│   ├── riskEngine.js                # Rule-based risk scoring
│   ├── utils/jwt.js                 # Agent identity token signing/verification
│   ├── tests/riskEngine.test.js     # Unit tests for the risk engine
│   ├── routes/
│   │   ├── agents.js                # Authorize / revoke / reactivate agents
│   │   ├── transactions.js          # Agent payment requests + human approve/decline
│   │   └── dashboard.js             # Summary stats + purchase simulation
│   └── package.json
├── frontend/                        # Original source copies (kept for the backend to serve locally too)
│   ├── index.html
│   ├── styles.css
│   └── app.js
├── .github/workflows/ci.yml         # Runs tests on every push/PR
├── .env.example
├── LICENSE
└── README.md
```

## Running it locally

```bash
cd backend
npm install
cp ../.env.example .env   # optional — sets your own JWT secret
npm start
```

The server starts on `http://localhost:4000` and also serves the frontend
directly, so just open that URL in your browser — no separate frontend
build step needed.

Data persists to `backend/data.json` between restarts. Delete that file to
reset the demo to a clean slate.

### Running the tests

```bash
cd backend
npm test
```

## Live demo on GitHub Pages

The static frontend (`index.html`, `styles.css`, `app.js` at the repo root)
is deployable directly via GitHub Pages. Note that Pages only serves static
files — it can't run the Express backend, so a Pages-hosted copy will show
the UI but won't have live data until the backend is deployed separately
(e.g. Render, Railway, Fly.io) and `app.js`'s `API` constant is pointed at
that URL.

## API overview

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/agents` | Authorize a new agent, returns `{ agent, token }` |
| GET | `/api/agents` | List agents |
| POST | `/api/agents/:id/revoke` | Kill switch |
| POST | `/api/agents/:id/reactivate` | Reactivate a revoked agent |
| POST | `/api/agents/:id/token` | Issue a fresh identity token |
| POST | `/api/transactions` | Agent submits a payment (`Authorization: Bearer <token>`) |
| GET | `/api/transactions` | Live ledger (filter with `?status=` or `?agentId=`) |
| POST | `/api/transactions/:id/approve` | Human approves a held transaction |
| POST | `/api/transactions/:id/decline` | Human declines a held transaction |
| GET | `/api/dashboard/summary` | Aggregate stats for the dashboard |
| POST | `/api/dashboard/simulate` | Simulate N purchases for an agent |

### Example: an agent making a payment

```bash
curl -X POST http://localhost:4000/api/transactions \
  -H "Authorization: Bearer <agent-token>" \
  -H "Content-Type: application/json" \
  -d '{"merchantName": "CloudCompute Inc", "amount": 42.50}'
```

## Risk engine logic

The engine is intentionally rule-based and explainable rather than a
black-box model, so every decision can be shown to the human owner:

- **Hard declines**: amount over the per-transaction cap, projected daily
  spend over the daily cap, or hourly transaction count at the rate limit.
- **Score contributors** (lead to a "held" status above a threshold):
  merchant not on the allow-list, merchant's intrinsic risk score, amount as
  a fraction of the per-transaction cap, and elevated velocity even under
  the hard cap.

## Roadmap / possible extensions

- Swap the JSON file store for Postgres with a proper migrations setup
- Add refresh tokens and per-scope agent permissions
- Webhook support so merchants can confirm settlement
- Configurable risk-engine weights per user, not just per agent

## Notes on this demo

- This is a demo/hackathon-grade project meant to illustrate the pattern
  (agent identity, guardrails, explainable risk scoring, human-in-the-loop),
  not a PCI-compliant payment processor.
- The JWT secret has a placeholder default — always set your own via
  `PAYPILOT_JWT_SECRET` before deploying anywhere real.

## License

MIT — see [LICENSE](LICENSE).

## GitHub Pages / Browser Demo Mode

The dashboard frontend now automatically falls back to **Browser Demo Mode** when the Express API is unavailable (for example, on GitHub Pages). All dashboard buttons remain functional and demo data is stored in the browser's `localStorage`.

For real backend data, run the Express server and serve the frontend from the same origin, or set `window.PAYPILOT_API` before loading `app.js` to point to your deployed API.
