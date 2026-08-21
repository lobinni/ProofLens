# ProofLens

Public wallet intelligence. Paste an EVM address; ProofLens reads the public
record across six chains, seals the evidence with a SHA-256 commitment, and
lets GenLayer StudioNet validators argue over it until a verdict is stored
on-chain. No wallet connection — the activity speaks for itself.

## Flow of a scan

1. **Collect** — the browser reads each chain independently through its public
   Blockscout v2 API. One grumpy explorer never erases the others.
2. **Analyze** — deterministic analytics: wallet age, cadence, volumes,
   counterparties, contract use, behavioral signals.
3. **Commit** — a canonical `prooflens.v2` evidence bundle (with the strict
   `blockscout.v1` verification section the contract expects: 1–6 counter
   sources, ≤16 transaction proofs, recomputed metrics) is SHA-256 sealed and
   POSTed to `/api/evidence`.
4. **Attest** — the serverless relayer (the only place the owner key exists)
   calls `attest_wallet(scan_id, wallet, evidence_url, evidence_hash)` on the
   deployed **ProofLensAttestation** contract.
5. **Consensus** — every validator re-fetches the evidence and each proof from
   Blockscout, recomputes metrics, and agrees on classification / risk /
   confidence. The report page polls `/api/report/[scanId]` until the verdict
   lands, then stores history.

**Deployed contract (StudioNet):**
[`0xeC345794B787fEb03Bb05dB374B0624591608977`](https://explorer-studio.genlayer.com/address/0xeC345794B787fEb03Bb05dB374B0624591608977)
— writes are owner-gated; reports are publicly readable via
`get_report(scan_id)` / `get_latest_report_id(wallet)`.

## Project layout

```
api/                       Vercel serverless functions (auto-detected)
  evidence/                commit + validator-facing canonical evidence GET
  attest.ts                relayer: submit attest_wallet() to StudioNet
  report/[scanId].ts       read finalized consensus report from the contract
  _lib/                    env, Postgres pool, genlayer-js signing client
contracts/                 GenLayer Intelligent Contract (deployed source)
deployments/               Pinned network deployment record
src/app/                   Application shell & routing
src/components/            Report, map, ledger, navigation, and scan UI
src/db/                    Table schema (DDL + drizzle-ready definitions)
src/lib/                   Collection, analytics, evidence, relayer client,
                           persistence, auth, genlayer helpers
tests/direct/              Fast contract behavior tests
tests/integration/         Live StudioNet consensus test
```

## Run locally

```bash
npm install
cp .env.example .env        # fill DATABASE_URL + GENLAYER_PRIVATE_KEY
npm run dev                 # frontend
# deploy /api via Vercel (or `vercel dev` to run functions locally)
```

Frontend alone needs **no env** — scans, analytics and evidence sealing work
statically. The verdict pipeline needs the serverless API:

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Postgres (evidence snapshots + scan mirror). Free tier: neon.tech |
| `GENLAYER_PRIVATE_KEY` | Relayer key — **must be the contract owner**. Use a dedicated key. |
| `VITE_PRIVY_APP_ID` | Optional email sign-in (Privy, email-only, wallets off). dashboard.privy.io |
| `GENLAYER_CONTRACT_ADDRESS` | Optional override (default pinned deployment) |
| `NEXT_PUBLIC_APP_URL` | Optional; falls back to `VERCEL_URL` |
| `RESEND_API_KEY` / `SESSION_SECRET` | Self-hosted OTP fallback when Privy is absent |

### Email sign-in

Identical to the reference architecture: Privy hosts the email OTP flow,
wallets are disabled everywhere (`loginMethods: ["email"]`,
`embeddedWallets.createOnLogin: "off"`). The browser needs only the public
App ID — server-side token verification uses Privy's public JWKS endpoint,
so **no `PRIVY_APP_SECRET` is ever required**. Sign-in only saves scan
history; anonymous scanning always works. Without the App ID, the app
degrades to the self-hosted OTP fallback (`/api/auth/*` + Resend), which
runs in dev mode locally and returns the code in the response.

## Deploy to Vercel

1. Push this repo, import into Vercel. Framework is pinned to **Vite** in
   `vercel.json`; `/api` TypeScript files become serverless functions
   automatically.
2. Add `DATABASE_URL` and `GENLAYER_PRIVATE_KEY` in Project → Settings →
   Environment Variables.
3. Deploy. Evidence endpoints live at `/api/evidence/*`.

## Contract checks

```bash
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
PATH=.venv/bin:$PATH .venv/bin/pytest tests/direct -v
```

## A necessary note about verdicts

ProofLens classifies public wallet behavior. It does not identify the person
behind an address, declare guilt, promise safety, or replace investigation.
`Sybil like` means the visible activity resembles coordinated account farming.
`Bot like` means the timing resembles automation. `High risk` means stronger
abuse indicators are present. `Low risk` and `ordinary` are descriptions,
never guarantees.
