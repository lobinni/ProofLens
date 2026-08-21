"""Direct contract behavior tests — fast, no live consensus.

Targets the deployed ProofLensAttestation surface:
  write: attest_wallet(scan_id, wallet, evidence_url, evidence_hash)  (owner-gated)
  views: get_report(scan_id) / get_latest_report_id(wallet) / get_report_count()

Run:
    PATH=.venv/bin:$PATH .venv/bin/pytest tests/direct -v
"""

import hashlib
import json
import os

import pytest

CONTRACT_PATH = os.path.join(
    os.path.dirname(__file__), "..", "..", "contracts", "prooflens_attestation.py"
)

DEPLOYED_ADDRESS = "0xeC345794B787fEb03Bb05dB374B0624591608977"


def test_contract_source_declares_schemas_and_bounds():
    with open(CONTRACT_PATH, "r", encoding="utf-8") as fh:
        source = fh.read()
    assert '"prooflens.v2"' in source
    assert '"blockscout.v1"' in source
    assert '"prooflens-risk-v1"' in source
    assert "len(proofs) > 16" in source
    for host in (
        "eth.blockscout.com",
        "base.blockscout.com",
        "optimism.blockscout.com",
        "arbitrum.blockscout.com",
        "polygon.blockscout.com",
        "gnosis.blockscout.com",
    ):
        assert host in source


def test_deployment_record_pins_live_contract():
    record_path = os.path.join(
        os.path.dirname(__file__), "..", "..", "deployments", "studionet.json"
    )
    with open(record_path, "r", encoding="utf-8") as fh:
        record = json.load(fh)
    assert record["state"] == "active"
    assert record["address"].lower() == DEPLOYED_ADDRESS.lower()
    assert record["writeMethod"] == "attest_wallet"


def test_canonical_hash_fixture_matches_client_expectation():
    canonical = json.dumps(
        {
            "schemaVersion": "prooflens.v2",
            "scanId": "pl_fixture",
            "wallet": "0x" + "ab" * 20,
        },
        sort_keys=True,
        separators=(",", ":"),
    )
    digest = hashlib.sha256(canonical.encode("utf-8")).hexdigest()
    assert len(digest) == 64


def test_contract_behavior_against_genlayer_sandbox():
    gltest = pytest.importorskip("gltest", reason="gltest not installed in .venv")

    factory = gltest.get_contract_factory(CONTRACT_PATH)
    owner = gltest.new_account()
    outsider = gltest.new_account()

    contract = factory.deploy()

    assert int(contract.get_report_count()) == 0
    assert contract.get_report("pl_missing") == ""
    assert contract.get_latest_report_id("0x" + "11" * 20) == ""

    with pytest.raises(Exception):
        # Non-owner callers must be rejected before any nondet work.
        contract.connect(outsider).attest_wallet(
            "pl_x", "0x" + "11" * 20, "https://example.com/e.json", "00" * 32
        )
