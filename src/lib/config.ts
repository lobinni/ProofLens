/**
 * Runtime configuration.
 *
 * The v3 StudioNet deployment is pinned below and in `deployments/studionet.json`.
 * It is intentionally not overridable at runtime, preventing a stale Vercel
 * variable from silently routing writes back to an incompatible deployment.
 */

export const APP = {
  name: "ProofLens",
  evidenceSchema: "prooflens.v2",
  verificationSchema: "blockscout.v1",
  consensusVerdictModel: "genlayer-consensus",
  /** Proof set is intentionally bounded so validator re-verification stays practical. */
  proofBound: 16,
  repoUrl: "https://github.com/lobinni/ProofLens",
} as const;

export interface GenLayerDeployment {
  network: "studionet";
  contractName: string;
  source: string;
  state: "pending_deployment" | "active";
  address: string;
  transactionHash: string;
  owner: string;
  deployedAt: string;
}

/** Pinned live v3 deployment. Keep in sync with deployments/studionet.json. */
export const PINNED_V3_CONTRACT = "0xC4CeEd79FcB9Eda180e961099aa96E0f2eDE6EB5";

const activeAddress = PINNED_V3_CONTRACT;

/** Mirror of deployments/studionet.json — keep in sync. */
export const GENLAYER: { deployment: GenLayerDeployment; consensusEnabled: boolean } = {
  deployment: {
    network: "studionet",
    contractName: "ProofLensIntelligence",
    source: "contracts/prooflens_intelligence.py",
    state: "active",
    address: activeAddress,
    transactionHash: "",
    owner: "public submission",
    deployedAt: "",
  },
  /**
   * A signing relay pays transaction fees, but V2 does not grant it privileged
   * ownership. Any funded account may submit valid evidence.
   */
  consensusEnabled: Boolean(activeAddress),
};
