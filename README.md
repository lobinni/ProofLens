# ProofLens

ProofLens scans any public EVM wallet across Ethereum, Base, Optimism,
Arbitrum, Polygon, and Gnosis. It creates a concise activity report, prepares a
bounded evidence sample, and asks a GenLayer Intelligent Contract to verify the
public records before producing a behavioral verdict.

No wallet connection is required to scan. Users who want an on-chain verdict
sign with their **own GenLayer wallet** — ProofLens never holds a private key.
Optional email sign-in only saves scan history.

## Builder Project Architecture

The project includes a real Intelligent Contract implementation:

```text
contracts/prooflens_intelligence.py
```

The GenLayer-native workflow is fully client-side for the core path:

```text
Any wallet address (no wallet needed to scan)
  → browser reads recent public Blockscout activity
  → browser creates canonical prooflens.v2 evidence (max 16 proofs)
  → browser conceives the contract directly (unsigned reads)
  → user optionally connects their GenLayer wallet (MetaMask + GenLayer Snap)
  → USER signs analyze_wallet() themselves and pays their own gas
  → validators re-fetch Blockscout counters and every committed transaction
  → validators recompute metrics and run intelligent consensus
  → contract stores the report
  → browser reads getTransaction and get_report directly from StudioNet
```

**No server private key exists anywhere in the project.** The user is the
only signer. There is no relayer write route and no secret fallback.

### Why user-signed, not relayer-signed

- Scanning any address stays permissionless and wallet-free.
- The only gas-bearing transaction is the one the user explicitly signs for
  their own analysis request, so they see exactly what they pay for.
- The selected MetaMask account must hold enough StudioNet GEN for gas. The
  Studio account selector includes a built-in faucet for funding test accounts.
- No server secret to provision, rotate, or secure — nothing to misconfigure.
- Follows the documented GenLayerJS pattern: `createClient({ chain, account })`
  with a plain address delegating signing to the wallet provider.

## Contract v3

### Public write

```python
analyze_wallet(
    scan_id: str,
    wallet: str,
    evidence_json: str,
    evidence_hash: str,
)
```

Any funded StudioNet account may call the write method. The contract rejects:

- invalid scan IDs, wallet addresses, or hashes
- evidence larger than 120 KB
- duplicate finalized scan IDs
- evidence whose SHA-256 does not match calldata
- mismatched schema, scan ID, or wallet
- unsupported or duplicate Blockscout sources
- more than 16 transaction proofs
- proofs that differ from authoritative Blockscout transactions
- claimed metrics that differ from validator-recomputed metrics

After deterministic verification, each validator receives only verified
counters, verified transactions, and recomputed sample metrics. Validators
compare classification family, risk score, confidence, and factor overlap.

### Public reads

```python
get_report(scan_id)
get_latest_report_id(wallet)
get_report_count()
```

The browser calls these methods directly through `genlayer-js` in
`src/lib/genlayer.ts`. It also calls `getTransaction(transaction_hash)` to
display the live consensus state.

## Deployment Status

The previous URL-based owner-gated deployment is preserved only in:

```text
deployments/legacy-studionet.json
```

The application no longer calls that address.

The active v3 deployment record is:

```text
deployments/studionet.json
```

The sample-integrity v3 contract is **deployed and active** at:

```text
0xC4CeEd79FcB9Eda180e961099aa96E0f2eDE6EB5
```

- Explorer: https://explorer-studio.genlayer.com/address/0xC4CeEd79FcB9Eda180e961099aa96E0f2eDE6EB5
- This address is pinned as the default in `src/lib/config.ts` and
  `api/_lib/env.ts`, so the app works without any manual env configuration.
- Runtime address overrides are intentionally disabled so stale Vercel
  settings cannot route users back to an older contract.

## Required Deployment Steps

1. Open GenLayer Studio and deploy:

```text
contracts/prooflens_intelligence.py
```

The constructor takes no arguments.

2. The deployment is live at `0xC4CeEd79FcB9Eda180e961099aa96E0f2eDE6EB5` and
is pinned throughout the codebase. **No env configuration is required
for the contract address** — the app, server, and reads all default to it.

3. The contract address is hard-pinned. For a future redeploy, update
   `deployments/studionet.json`, `src/lib/config.ts`, and `api/_lib/env.ts`
   together in the same commit.

4. On-chain writes are signed by the
   user's own GenLayer wallet (MetaMask + GenLayer Snap) in the browser.

5. Deploy the app. Only a `VITE_PRIVY_APP_ID` (optional, for email history)
   is worth setting up — no GenLayer secret is required.

6. Scan a real public wallet, sign with a GenLayer wallet, and retain:

- the app report URL or screenshots
- the `analyze_wallet` transaction hash
- the StudioNet transaction explorer link
- the contract address and deployment transaction
- the scan ID
- the output of `get_report(scan_id)`
- the non-zero result of `get_report_count()`

These artifacts are the evidence that the dapp uses the Intelligent Contract.

## Runtime Workflow

### Fast report path

The browser reads one recent transaction page and one token-transfer page per
selected network. Both requests run in parallel. This gives enough records for
the bounded proof set without indexing an entire wallet history.

The concise report appears immediately after collection and contains:

- verdict or review status
- six core metrics
- one readable behavior summary
- behavior signal bars
- eight recent activities with explorer links
- a compact evidence record with up to six receipts

### GenLayer path (user-signed, the default)

After the report appears, the user connects their own GenLayer wallet once and
signs the transaction themselves in the browser. The browser builds the client
with the user's address and the Snap handles signing:

```ts
const client = createClient({ chain: studionet, account: userAddress });
const hash = await client.writeContract({
  address: contractAddress,
  functionName: "analyze_wallet",
  args: [scanId, wallet, evidenceJson, evidenceHash],
  value: 0n,
  consensusMaxRotations: 5,
});
```

The user pays their own gas. The transaction hash is returned immediately and
the report polls StudioNet directly, swapping the pending state for the stored
verdict after finality.

## Environment

Copy `.env.example` to `.env` for local work. Never commit `.env`.

**For the CORE user-signed flow, NO GenLayer env vars are required** — the
contract address is pinned in `src/lib/config.ts`, reads are unsigned, and the
user signs writes with their own wallet.

```bash
```

Optional email authentication:

```bash
VITE_PRIVY_APP_ID="your-public-app-id"
```

Configure Privy for email-only login and disable embedded wallet creation.

Optional account history and self-hosted OTP:

```bash
DATABASE_URL="postgresql://..."
RESEND_API_KEY="re_..."
AUTH_EMAIL_FROM="ProofLens <login@example.com>"
SESSION_SECRET="random-secret"
```

Database configuration does not block GenLayer submission.

## Local Development

```bash
npm install
npm run dev
```

Run the Vercel API locally:

```bash
npx vercel dev
```

Build:

```bash
npm run build
```

## Contract Checks

```bash
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
PATH=.venv/bin:$PATH .venv/bin/pytest tests/direct -v
```

Live v3 integration test using a downloaded evidence file:

```bash
PROOFLENS_INTEGRATION_EVIDENCE_FILE="./prooflens-evidence.json" \
PROOFLENS_INTEGRATION_WALLET="0x..." \
PROOFLENS_INTEGRATION_SCAN_ID="pl_..." \
PATH=.venv/bin:$PATH .venv/bin/pytest tests/integration -v -s
```

## API Surface

| Route | Purpose |
|---|---|
| `GET /api/report/[scanId]` | Optional server mirror of `get_report` |
| `GET /api/health` | Operator check for the v3 address and schema |
| `GET /api/history` | Optional authenticated scan history |
| `POST /api/auth/request` | Self-hosted OTP fallback |
| `POST /api/auth/verify` | Verify fallback OTP |

## Sample Integrity

The reviewer correctly noted that callers can cherry-pick a curated set of
"clean" transactions and still receive a confident verdict. The contract now
enforces two layers of protection:

1. **Coverage ratio**: After verifying proofs, the contract compares the
   sample size against the wallet's authoritative total transaction count
   (from Blockscout counters). If coverage is too thin, the contract
   hard-overrides the verdict to `inconclusive` regardless of what the model
   says. Thresholds:
   - Fewer than 3 verified proofs → inconclusive
   - Wallet has > 500 total transactions but < 8 proofs → inconclusive
   - Wallet has > 5000 total transactions but < 16 proofs → inconclusive

2. **Model guidance**: The LLM prompt includes `sampling_coverage` with
   `coverage_weak` and `coverage_ratio`. The model is explicitly instructed
   to return `inconclusive` when coverage is weak. The contract then
   post-processes to enforce this deterministically.

Policy version updated to `prooflens-risk-v3`.

## Latest Implementation Update

- **Sample integrity enforcement**: contract now computes coverage ratio from
  authoritative Blockscout counters and forces `inconclusive` when the
  caller-selected sample is too thin relative to the wallet's total activity.
  Cherry-picked or empty samples can no longer produce a confident verdict.
- **Tolerant counter fetching**: a single flaky Blockscout counter endpoint
  no longer aborts the entire consensus. The chain is marked unavailable and
  the validator proceeds with the remaining sources.
- **Removed all server-side private-key and signing code.** The core flow is
  now fully client-side and GenLayer-native: the browser reads the contract
  unsigned, and the USER signs `analyze_wallet()` themselves through the
  GenLayer MetaMask Snap (`createClient({ chain, account })` with a plain
  address). There is no server-side write route and no pre-paid fallback.
- Added `src/lib/genlayer-wallet.ts` (Snap connect, account sync, user-signed
  submit) and `src/hooks/useGenLayerWallet.ts`; the Header gains a GenLayer
  wallet button and the verdict panel gains a "Connect wallet & sign" action.
- Fixed the Snap integration to delegate installation to the official
  `genlayer-js.connect("studionet", "npm")`, which uses the current package ID
  `npm:genlayer-wallet-plugin`; removed the incorrect hardcoded Snap ID.
- Fixed a React stale-state bug: `connect()` now returns the signing connection
  immediately, so the first "Connect wallet & sign" click proceeds directly
  to `writeContract()` instead of seeing the previous render's null client.
- The signing button is now always visible as soon as a report is ready; it is
  no longer hidden behind a failed server submission state.
- `/api/health` is read-only and reports contract schema compatibility only.
- Added mandatory `getContractSchema()` verification for the deployed address;
  it must expose public `analyze_wallet(scan_id,wallet,evidence_json,evidence_hash)`
  and all three expected read methods.
- Extended `/api/health` with live StudioNet reachability, deployed method
  names, analyze parameter names, compatibility, and RPC errors.
- Reduced direct calldata to only contract-consumed fields: schema, scan ID,
  wallet, source references, bounded transaction proofs, and recomputed
  metrics. UI analytics are no longer duplicated into the GenLayer call.
- Replaced the owner-gated URL-based contract path with public contract
  `analyze_wallet`.
- Moved canonical evidence directly into transaction calldata.
- Removed PostgreSQL and public evidence hosting from the critical GenLayer
  path.
- Kept authoritative Blockscout counter and transaction re-verification inside
  validator consensus.
- Marked the old deployment as legacy and removed it from runtime config.
- Added separate server and browser contract address settings to prevent accidental
  calls to the incompatible legacy method.
- Changed the transaction signer from a contract owner to the user-selected
  MetaMask account.
- Updated direct and live integration tests for the v3 method.
- Kept the fast bounded scan and concise report workflow.

Update this section whenever contract behavior, deployment evidence, or the
dapp-to-contract workflow changes.

## Builder Submission Checklist

- [x] Sample-integrity v3 contract deployed at `0xC4CeEd79FcB9Eda180e961099aa96E0f2eDE6EB5`
- [x] Deployment address pinned in `deployments/studionet.json`, `src/lib/config.ts`, `api/_lib/env.ts`
- [x] App, server, and browser reads all default to the same live v3 address
- [ ] At least one successful `analyze_wallet` transaction exists
- [ ] Transaction is linked from the app report
- [ ] `get_report(scan_id)` returns a real verdict
- [ ] `get_report_count()` is non-zero and visible in the dapp
- [ ] Repository contains contract source and integration tests
- [ ] Submission includes app, contract, deployment transaction, and analysis
  transaction links

## Push To GitHub

```bash
git add .
git commit -m "feat: pin live ProofLensIntelligence v3 sample-integrity contract"
git push origin main
```

## Safety

ProofLens describes visible public behavior. It does not identify a person,
declare guilt, guarantee safety, or replace investigation.