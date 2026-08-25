/**
 * Server-side PUBLIC GenLayer reads only.
 *
 * The application has no signing endpoint and stores no GenLayer private
 * key. Users sign analyze_wallet() themselves in the browser with MetaMask.
 * This server module exists only for optional read mirrors and diagnostics.
 */

import { createClient } from "genlayer-js";
import { studionet } from "genlayer-js/chains";
import { contractAddress } from "./env";

type GenLayerClient = ReturnType<typeof createClient>;
let cachedRead: GenLayerClient | null = null;

function getReadClient(): GenLayerClient {
  if (!cachedRead) cachedRead = createClient({ chain: studionet });
  return cachedRead;
}

export interface ContractInspection {
  address: string;
  reachable: boolean;
  compatible: boolean;
  methods: string[];
  analyzeParams: string[];
  error?: string;
}

let schemaPromise: Promise<ContractInspection> | null = null;

export async function inspectDeployedContract(force = false): Promise<ContractInspection> {
  if (force) schemaPromise = null;
  if (!schemaPromise) {
    schemaPromise = (async () => {
      const address = contractAddress();
      try {
        const schema = (await getReadClient().getContractSchema(
          address as `0x${string}`,
        )) as {
          methods?: Record<string, { params?: [string, unknown][]; readonly?: boolean }>;
        };
        const methods = Object.keys(schema.methods ?? {}).sort();
        const analyze = schema.methods?.analyze_wallet;
        const analyzeParams = (analyze?.params ?? []).map(([name]) => name);
        const compatible =
          Boolean(analyze) &&
          analyze?.readonly === false &&
          analyzeParams.join(",") === "scan_id,wallet,evidence_json,evidence_hash" &&
          methods.includes("get_report") &&
          methods.includes("get_latest_report_id") &&
          methods.includes("get_report_count");
        return { address, reachable: true, compatible, methods, analyzeParams };
      } catch (err) {
        return {
          address,
          reachable: false,
          compatible: false,
          methods: [],
          analyzeParams: [],
          error: err instanceof Error ? err.message : String(err),
        };
      }
    })();
  }
  return schemaPromise;
}

export async function readReport(scanId: string): Promise<string> {
  const result = await getReadClient().readContract({
    address: contractAddress() as `0x${string}`,
    functionName: "get_report",
    args: [scanId],
  });
  return typeof result === "string" ? result : result ? String(result) : "";
}