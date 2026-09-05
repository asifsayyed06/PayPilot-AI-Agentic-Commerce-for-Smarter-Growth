# PayPilot AI — Agentic Commerce for Smarter Growth

A working full-stack demo of how an AI shopping/purchasing agent can transact
on a user's behalf within guardrails the user sets — with a transparent,
rule-based risk engine and a human-in-the-loop approval step for anything risky.

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

## Project structure

```
PayPilot-AI/
├── backend/
│   ├── server.js           # Express app entrypoint
│   ├── db.js                # JSON-file-backed store (swap for Postgres later)
│   ├── riskEngine.js         # Rule-based risk scoring
│   ├── utils/jwt.js          # Agent identity token signing/verification
│   ├── routes/
│   │   ├── agents.js         # Authorize / revoke / reactivate agents
│   │   ├── transactions.js   # Agent payment requests + human approve/decline
│   │   └── dashboard.js      # Summary stats + purchase simulation
│   └── package.json
├── frontend/
│   ├── index.html            # Dashboard UI
│   ├── styles.css
│   └── app.js                # Talks to the backend REST API
└── README.md
```

## Running it

```bash
cd backend
npm install
npm start
```

The server starts on `http://localhost:4000` and also serves the frontend
directly, so just open that URL in your browser — no separate frontend
build step needed.

Data persists to `backend/data.json` between restarts. Delete that file to
reset the demo to a clean slate.

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

## Notes on this demo

- Uses a flat JSON file for storage to keep setup to `npm install && npm
  start` — swap `backend/db.js` for a real database in production.
- The JWT secret in `utils/jwt.js` is a placeholder — set
  `PAYPILOT_JWT_SECRET` in your environment before deploying anywhere real.
- This is a demo/hackathon-grade project meant to illustrate the pattern
  (agent identity, guardrails, explainable risk scoring, human-in-the-loop),
  not a PCI-compliant payment processor.
