"""Fast checks for the V2 ProofLensIntelligence contract surface."""

import os

CONTRACT_PATH = os.path.join(
    os.path.dirname(__file__), "..", "..", "contracts", "prooflens_intelligence.py"
)


def _source():
    with open(CONTRACT_PATH, "r", encoding="utf-8") as handle:
        return handle.read()


def test_v2_is_public_and_uses_direct_evidence():
    source = _source()
    assert "class ProofLensIntelligence(gl.Contract):" in source
    assert "def analyze_wallet(" in source
    assert "evidence_json: str" in source
    assert 'evidence_json.encode("utf-8")' in source
    assert "Only the ProofLens scan relayer" not in source
    assert "evidence_url" not in source


def test_v2_rechecks_blockscout_and_bounds_proofs():
    source = _source()
    assert '"prooflens.v2"' in source
    assert '"blockscout.v1"' in source
    assert "len(proofs) > 16" in source
    assert "gl.nondet.web.get(expected_url)" in source
    assert "Blockscout transaction proof mismatch" in source
    assert "Verification metrics mismatch" in source
    # Counters are tolerant: a single flaky chain does not abort the scan
    assert '"available": False' in source


def test_v2_runs_intelligent_consensus_and_stores_views():
    source = _source()
    assert "gl.nondet.exec_prompt" in source
    assert "gl.vm.run_nondet_unsafe" in source
    assert "def get_report(" in source
    assert "def get_latest_report_id(" in source
    assert "def get_report_count(" in source


def test_sample_integrity_enforcement():
    """The contract must prevent cherry-picked samples from getting confident verdicts."""
    source = _source()
    assert "coverage_weak" in source
    assert "coverage_ratio" in source
    assert "total_transactions" in source
    # The contract hard-overrides to inconclusive when coverage is too weak
    assert 'result["classification"] = "inconclusive"' in source
    assert "sampling_coverage" in source
    assert "policy_version" in source
    assert "prooflens-risk-v3" in source