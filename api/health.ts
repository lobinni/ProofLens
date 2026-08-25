/**
 * GET /api/health
 *
 * Deployment diagnostic. In the GenLayer-native architecture the PRIMARY path
 * is fully client-side: the browser reads the contract and the USER signs with
 * their own GenLayer Snap. A server key is ONLY an optional convenience for a
 * pre-paid relayer. Safe to expose: it reports booleans, never secret values.
 */

import { contractAddress, contractConfigured } from "./_lib/env";
import { inspectDeployedContract } from "./_lib/genlayer";

interface ReqLike {
  method?: string;
}
interface ResLike {
  status: (code: number) => ResLike;
  json: (body: unknown) => ResLike;
  setHeader: (name: string, value: string) => void;
}

export default async function handler(req: ReqLike, res: ResLike) {
  res.setHeader("cache-control", "no-store");
  if (req.method !== "GET") return res.status(405).json({ error: "method not allowed" });

  const checks = {
    functions: true,
    database: Boolean(process.env.DATABASE_URL),
    contract: contractConfigured(),
    contractReachable: false,
    contractCompatible: false,
  };

  const contractInspection = await inspectDeployedContract(true);
  checks.contractReachable = contractInspection.reachable;
  checks.contractCompatible = contractInspection.compatible;
  // The dapp is fully usable without any server key: reads are unsigned and
  // the user signs writes with their own GenLayer wallet (Snap).
  const contractReady =
    checks.contract && checks.contractReachable && checks.contractCompatible;
  const ok = contractReady;
  return res.status(ok ? 200 : 503).json({
    ok,
    checks,
    contract: checks.contract ? contractAddress() : null,
    contractMethods: contractInspection.methods,
    analyzeParams: contractInspection.analyzeParams,
    contractError: contractInspection.error ?? null,
    databaseError: checks.database ? null : "Not configured (optional)",
    hint: !checks.contract
      ? "Deploy ProofLensIntelligence V2 and set GENLAYER_CONTRACT_ADDRESS"
      : !checks.contractReachable
        ? "The configured address cannot be reached on StudioNet; inspect contractError"
        : !checks.contractCompatible
          ? "The deployed schema does not expose the expected V2 methods"
          : "Contract is ready. Writes need no server key: the user signs with their GenLayer wallet (Snap).",
  });
}
