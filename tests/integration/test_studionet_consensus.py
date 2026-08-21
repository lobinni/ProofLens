"""Live StudioNet consensus test against the attestation flow.

Deploys a FRESH contract (a throwaway relayer), lets real validators fetch
the committed ProofLens evidence, waits for consensus, and confirms the
stored report carries the exact commitment that was submitted.

    PROOFLENS_INTEGRATION_EVIDENCE_URL=https://your-deployment.example/api/evidence/SCAN_ID \
    PROOFLENS_INTEGRATION_EVIDENCE_HASH=<sha256 of the canonical body> \
    PROOFLENS_INTEGRATION_WALLET=0x<lowercase wallet> \
    PROOFLENS_INTEGRATION_SCAN_ID=pl_... \
        PATH=.venv/bin:$PATH .venv/bin/gltest tests/integration -v -s --network studionet

The deployed production contract lives at:
    0xeC345794B787fEb03Bb05dB374B0624591608977  (writes are owner-gated)
"""

import json
import os

import pytest

gltest = pytest.importorskip("gltest", reason="gltest not installed in .venv")

EVIDENCE_URL = os.environ.get("PROOFLENS_INTEGRATION_EVIDENCE_URL", "")
EVIDENCE_HASH = os.environ.get("PROOFLENS_INTEGRATION_EVIDENCE_HASH", "")
WALLET = os.environ.get("PROOFLENS_INTEGRATION_WALLET", "")
SCAN_ID = os.environ.get("PROOFLENS_INTEGRATION_SCAN_ID", "")

CONTRACT_PATH = os.path.join(
    os.path.dirname(__file__), "..", "..", "contracts", "prooflens_attestation.py"
)

requires_fixture = pytest.mark.skipif(
    not all([EVIDENCE_URL, EVIDENCE_HASH, WALLET, SCAN_ID]),
    reason="set PROOFLENS_INTEGRATION_* env vars to run the live consensus test",
)


@requires_fixture
def test_consensus_stores_committed_report():
    factory = gltest.get_contract_factory(CONTRACT_PATH)
    owner = gltest.new_account()
    contract = factory.deploy()

    # The deployer is the owner; attest_wallet is owner-gated by design.
    contract.connect(owner).attest_wallet(SCAN_ID, WALLET, EVIDENCE_URL, EVIDENCE_HASH)

    stored = json.loads(contract.get_report(SCAN_ID))
    assert stored["scan_id"] == SCAN_ID
    assert stored["wallet"] == WALLET.lower()
    assert stored["evidence_url"] == EVIDENCE_URL
    assert stored["evidence_hash"] == EVIDENCE_HASH.lower()
    assert stored["evidence_schema"] == "prooflens.v2"
    assert stored["verification_schema"] == "blockscout.v1"
    assert stored["policy_version"] == "prooflens-risk-v1"

    verdict = stored["verdict"]
    assert verdict["classification"] in (
        "low_risk",
        "ordinary",
        "bot_like",
        "sybil_like",
        "high_risk",
        "inconclusive",
    )
    assert 0 <= int(verdict["risk_score"]) <= 100
    assert 0 <= int(verdict["confidence"]) <= 100
    assert len(verdict["factor_codes"]) <= 6

    assert contract.get_latest_report_id(WALLET) == SCAN_ID
    assert int(contract.get_report_count()) == 1
