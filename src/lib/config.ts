/**
 * Runtime configuration.
 *
 * The active StudioNet deployment is pinned in `deployments/studionet.json`
 * (kept in sync with GENLAYER.deployment below) so the production relayer
 * can never silently use a stale environment value. The record ships in
 * `pending_deployment` state: deploy `contracts/prooflens_attestation.py`,
 * then fill in address, transactionHash and owner.
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

/** Mirror of deployments/studionet.json — keep in sync. */
export const GENLAYER: { deployment: GenLayerDeployment; consensusEnabled: boolean } = {
  deployment: {
    network: "studionet",
    contractName: "ProofLensAttestation",
    source: "contracts/prooflens_attestation.py",
    state: "active",
    address: "0xeC345794B787fEb03Bb05dB374B0624591608977",
    transactionHash: "",
    owner: "",
    deployedAt: "",
  },
  /**
   * Consensus submission runs through the serverless relayer (/api/attest)
   * which alone holds GENLAYER_PRIVATE_KEY. The browser seals evidence and
   * reads the finalized report — it never touches the key.
   */
  consensusEnabled: true,
};
