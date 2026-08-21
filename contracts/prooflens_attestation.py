# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }

from genlayer import *
import hashlib
import json
import re


ALLOWED_CLASSIFICATIONS = [
    "low_risk",
    "ordinary",
    "bot_like",
    "sybil_like",
    "high_risk",
    "inconclusive",
]

ALLOWED_FACTORS = [
    "BURST_ACTIVITY",
    "CONCENTRATED_COUNTERPARTIES",
    "CONCENTRATED_CONTRACTS",
    "HIGH_FAILURE_RATE",
    "HIGH_AUTOMATION",
    "LOW_ACTIVITY",
    "MULTICHAIN_DEPTH",
    "PARTIAL_COVERAGE",
    "REPETITIVE_BEHAVIOR",
    "LONG_DORMANCY",
]

ERROR_EXPECTED = "[EXPECTED]"
ERROR_EXTERNAL = "[EXTERNAL]"
ERROR_TRANSIENT = "[TRANSIENT]"
ERROR_LLM = "[LLM_ERROR]"

BLOCKSCOUT_HOSTS = {
    "ethereum": "eth.blockscout.com",
    "base": "base.blockscout.com",
    "optimism": "optimism.blockscout.com",
    "arbitrum": "arbitrum.blockscout.com",
    "polygon": "polygon.blockscout.com",
    "gnosis": "gnosis.blockscout.com",
}


def _safe_text(value, limit):
    text = str(value or "")
    text = re.sub(r"[^a-zA-Z0-9 .,:'/_]", "", text)
    return text[:limit]


def _bounded_int(value, default):
    try:
        return max(0, min(100, int(value)))
    except (TypeError, ValueError):
        return default


def _normalize_result(raw):
    try:
        if isinstance(raw, str):
            raw = json.loads(raw)
    except Exception:
        raise gl.vm.UserError(ERROR_LLM + " Model returned invalid JSON")
    if not isinstance(raw, dict):
        raise gl.vm.UserError(ERROR_LLM + " Model returned an invalid result")

    classification = str(raw.get("classification", "inconclusive")).lower()
    if classification not in ALLOWED_CLASSIFICATIONS:
        classification = "inconclusive"

    risk_score = _bounded_int(raw.get("risk_score", 50), 50)
    confidence = _bounded_int(raw.get("confidence", 0), 0)

    factor_codes = []
    raw_factors = raw.get("factor_codes", [])
    if not isinstance(raw_factors, list):
        raw_factors = []
    for factor in raw_factors:
        code = str(factor).upper()
        if code in ALLOWED_FACTORS and code not in factor_codes:
            factor_codes.append(code)
        if len(factor_codes) == 6:
            break

    evidence_refs = []
    raw_references = raw.get("evidence_refs", [])
    if not isinstance(raw_references, list):
        raw_references = []
    for reference in raw_references:
        evidence_refs.append(_safe_text(reference, 120))
        if len(evidence_refs) == 6:
            break

    limitations = []
    raw_limitations = raw.get("limitations", [])
    if not isinstance(raw_limitations, list):
        raw_limitations = []
    for limitation in raw_limitations:
        limitations.append(_safe_text(limitation, 180))
        if len(limitations) == 5:
            break

    return {
        "classification": classification,
        "risk_score": risk_score,
        "confidence": confidence,
        "factor_codes": factor_codes,
        "summary": _safe_text(raw.get("summary", ""), 480),
        "evidence_refs": evidence_refs,
        "limitations": limitations,
        "policy_version": "prooflens-risk-v1",
    }


def _risk_family(classification):
    if classification in ["low_risk", "ordinary"]:
        return "low"
    if classification in ["sybil_like", "high_risk"]:
        return "high"
    return classification


def _factors_overlap(left, right):
    if not left and not right:
        return True
    for factor in left:
        if factor in right:
            return True
    return False


def _error_message(value):
    if hasattr(value, "message"):
        return str(value.message)
    return str(value)


def _optional_text(value):
    if value is None:
        return None
    return str(value)


def _optional_int(value):
    if value is None:
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def _address_hash(value):
    if not isinstance(value, dict):
        return None
    address = value.get("hash")
    if not isinstance(address, str):
        return None
    return address.lower()


def _read_json_response(response, source_name, size_limit=200000):
    if response.status >= 500:
        raise gl.vm.UserError(
            ERROR_TRANSIENT
            + " "
            + source_name
            + " returned "
            + str(response.status)
        )
    if response.status >= 400:
        raise gl.vm.UserError(
            ERROR_EXTERNAL
            + " "
            + source_name
            + " returned "
            + str(response.status)
        )
    body = response.body or b""
    if isinstance(body, str):
        body = body.encode("utf-8")
    if len(body) > size_limit:
        raise gl.vm.UserError(ERROR_EXPECTED + " " + source_name + " is too large")
    try:
        parsed = json.loads(body.decode("utf-8"))
    except Exception:
        raise gl.vm.UserError(
            ERROR_EXPECTED + " " + source_name + " is not valid JSON"
        )
    if not isinstance(parsed, dict):
        raise gl.vm.UserError(
            ERROR_EXPECTED + " " + source_name + " has an invalid shape"
        )
    return parsed


def _blockscout_base(chain_id):
    host = BLOCKSCOUT_HOSTS.get(chain_id)
    if host is None:
        raise gl.vm.UserError(ERROR_EXPECTED + " Unsupported Blockscout chain")
    return "https://" + host + "/api/v2"


def _parse_counter(value):
    if value is None:
        return None
    try:
        parsed = int(value)
    except (TypeError, ValueError):
        raise gl.vm.UserError(ERROR_EXPECTED + " Invalid Blockscout counter")
    if parsed < 0:
        raise gl.vm.UserError(ERROR_EXPECTED + " Invalid Blockscout counter")
    return parsed


def _fetch_counter_source(source_ref, wallet):
    if not isinstance(source_ref, dict):
        raise gl.vm.UserError(ERROR_EXPECTED + " Invalid Blockscout source")
    chain_id = str(source_ref.get("chainId", ""))
    expected_url = (
        _blockscout_base(chain_id)
        + "/addresses/"
        + wallet.lower()
        + "/counters"
    )
    if source_ref.get("countersUrl") != expected_url:
        raise gl.vm.UserError(ERROR_EXPECTED + " Invalid Blockscout source URL")
    payload = _read_json_response(
        gl.nondet.web.get(expected_url), "Blockscout counters"
    )
    return {
        "chain_id": chain_id,
        "transactions": _parse_counter(payload.get("transactions_count")),
        "token_transfers": _parse_counter(
            payload.get("token_transfers_count")
        ),
    }


def _transaction_method(payload):
    method = payload.get("method")
    if method is not None:
        return str(method)
    decoded = payload.get("decoded_input")
    if not isinstance(decoded, dict):
        return None
    method_call = decoded.get("method_call")
    if not isinstance(method_call, str):
        return None
    return method_call.split("(")[0]


def _canonical_transaction(payload):
    created_contract = payload.get("created_contract")
    created_address = _address_hash(created_contract)
    target = created_contract if created_address is not None else payload.get("to")
    status = payload.get("status")
    if status is None:
        status = payload.get("result")
    return {
        "hash": str(payload.get("hash", "")).lower(),
        "blockNumber": _optional_int(payload.get("block_number")),
        "timestamp": _optional_text(payload.get("timestamp")),
        "from": _address_hash(payload.get("from")) or "",
        "to": _address_hash(target),
        "value": str(payload.get("value") or "0"),
        "status": _optional_text(status),
        "method": _transaction_method(payload),
        "targetIsContract": bool(
            isinstance(target, dict) and target.get("is_contract")
        ),
        "createdContract": created_address is not None,
    }


def _canonical_proof(proof):
    return {
        "hash": str(proof.get("hash", "")).lower(),
        "blockNumber": _optional_int(proof.get("blockNumber")),
        "timestamp": _optional_text(proof.get("timestamp")),
        "from": str(proof.get("from", "")).lower(),
        "to": (
            str(proof.get("to")).lower()
            if proof.get("to") is not None
            else None
        ),
        "value": str(proof.get("value") or "0"),
        "status": _optional_text(proof.get("status")),
        "method": _optional_text(proof.get("method")),
        "targetIsContract": bool(proof.get("targetIsContract")),
        "createdContract": bool(proof.get("createdContract")),
    }


def _verify_transaction_proof(proof, source_chains, wallet):
    if not isinstance(proof, dict):
        raise gl.vm.UserError(ERROR_EXPECTED + " Invalid transaction proof")
    chain_id = str(proof.get("chainId", ""))
    if chain_id not in source_chains:
        raise gl.vm.UserError(ERROR_EXPECTED + " Unbound transaction proof")
    transaction_hash = str(proof.get("hash", "")).lower()
    if not re.match(r"^0x[a-f0-9]{64}$", transaction_hash):
        raise gl.vm.UserError(ERROR_EXPECTED + " Invalid transaction proof hash")
    expected_url = (
        _blockscout_base(chain_id) + "/transactions/" + transaction_hash
    )
    if proof.get("url") != expected_url:
        raise gl.vm.UserError(
            ERROR_EXPECTED + " Invalid transaction proof URL"
        )
    authoritative = _canonical_transaction(
        _read_json_response(
            gl.nondet.web.get(expected_url), "Blockscout transaction"
        )
    )
    normalized_wallet = wallet.lower()
    if (
        authoritative["from"] != normalized_wallet
        and authoritative["to"] != normalized_wallet
    ):
        raise gl.vm.UserError(
            ERROR_EXPECTED + " Transaction proof does not involve wallet"
        )
    if authoritative != _canonical_proof(proof):
        raise gl.vm.UserError(
            ERROR_EXPECTED + " Blockscout transaction proof mismatch"
        )
    return {
        "chain_id": chain_id,
        **authoritative,
    }


def _direction(record, wallet):
    if record["from"] == wallet and record["to"] == wallet:
        return "self"
    if record["from"] == wallet:
        return "outbound"
    return "inbound"


def _is_failed(record):
    status = str(record.get("status") or "").lower()
    return any(value in status for value in ["error", "failure", "reverted"])


def _recompute_metrics(records, wallet):
    timestamps = sorted(
        [
            record["timestamp"]
            for record in records
            if record["timestamp"] is not None
        ]
    )
    return {
        "sampledTransactions": len(records),
        "sampledOutbound": len(
            [
                record
                for record in records
                if _direction(record, wallet) == "outbound"
            ]
        ),
        "sampledInbound": len(
            [
                record
                for record in records
                if _direction(record, wallet) == "inbound"
            ]
        ),
        "sampledSelf": len(
            [
                record
                for record in records
                if _direction(record, wallet) == "self"
            ]
        ),
        "sampledFailed": len(
            [record for record in records if _is_failed(record)]
        ),
        "sampledContractCalls": len(
            [
                record
                for record in records
                if _direction(record, wallet) == "outbound"
                and not record["createdContract"]
                and (
                    record["targetIsContract"]
                    or record["method"] is not None
                )
            ]
        ),
        "sampledContractCreations": len(
            [
                record
                for record in records
                if _direction(record, wallet) == "outbound"
                and record["createdContract"]
            ]
        ),
        "sampledChains": len(
            set([record["chain_id"] for record in records])
        ),
        "firstActivityAt": timestamps[0] if timestamps else None,
        "lastActivityAt": timestamps[-1] if timestamps else None,
    }


def _verify_blockscout_evidence(snapshot, wallet):
    verification = snapshot.get("verification")
    if not isinstance(verification, dict):
        raise gl.vm.UserError(
            ERROR_EXPECTED + " Blockscout verification is missing"
        )
    if verification.get("schemaVersion") != "blockscout.v1":
        raise gl.vm.UserError(
            ERROR_EXPECTED + " Blockscout verification schema mismatch"
        )

    source_refs = verification.get("sourceRefs")
    if not isinstance(source_refs, list) or not 1 <= len(source_refs) <= 6:
        raise gl.vm.UserError(ERROR_EXPECTED + " Invalid Blockscout sources")
    source_chains = []
    live_counters = []
    for source_ref in source_refs:
        counter = _fetch_counter_source(source_ref, wallet)
        if counter["chain_id"] in source_chains:
            raise gl.vm.UserError(
                ERROR_EXPECTED + " Duplicate Blockscout source"
            )
        source_chains.append(counter["chain_id"])
        live_counters.append(counter)

    proofs = verification.get("transactionProofs")
    if not isinstance(proofs, list) or len(proofs) > 16:
        raise gl.vm.UserError(ERROR_EXPECTED + " Invalid transaction proofs")
    verified_records = []
    proof_ids = []
    for proof in proofs:
        record = _verify_transaction_proof(proof, source_chains, wallet)
        proof_id = record["chain_id"] + ":" + record["hash"]
        if proof_id in proof_ids:
            raise gl.vm.UserError(
                ERROR_EXPECTED + " Duplicate transaction proof"
            )
        proof_ids.append(proof_id)
        verified_records.append(record)

    claimed_metrics = verification.get("metrics")
    recomputed_metrics = _recompute_metrics(verified_records, wallet.lower())
    if claimed_metrics != recomputed_metrics:
        raise gl.vm.UserError(
            ERROR_EXPECTED + " Verification metrics mismatch"
        )
    return recomputed_metrics, live_counters, verified_records


def _leader_error_agrees(leader_result, analyze):
    leader_message = _error_message(leader_result)
    try:
        analyze()
        return False
    except gl.vm.UserError as error:
        validator_message = _error_message(error)
        if validator_message.startswith(ERROR_EXPECTED):
            return validator_message == leader_message
        if validator_message.startswith(ERROR_EXTERNAL):
            return validator_message == leader_message
        if validator_message.startswith(ERROR_TRANSIENT):
            return leader_message.startswith(ERROR_TRANSIENT)
        return False
    except Exception:
        return False


class ProofLensAttestation(gl.Contract):
    owner: Address
    reports: TreeMap[str, str]
    wallet_latest: TreeMap[str, str]
    report_count: u64
    policy_version: str

    def __init__(self):
        self.owner = gl.message.sender_address
        self.report_count = u64(0)
        self.policy_version = "prooflens-risk-v1"

    @gl.public.view
    def get_report(self, scan_id: str) -> str:
        return self.reports.get(scan_id, "")

    @gl.public.view
    def get_latest_report_id(self, wallet: str) -> str:
        return self.wallet_latest.get(wallet.lower(), "")

    @gl.public.view
    def get_report_count(self) -> u64:
        return self.report_count

    @gl.public.write
    def attest_wallet(
        self,
        scan_id: str,
        wallet: str,
        evidence_url: str,
        evidence_hash: str,
    ) -> None:
        if gl.message.sender_address != self.owner:
            raise gl.vm.UserError("Only the ProofLens scan relayer can submit reports")
        if not re.match(r"^[a-zA-Z0-9_-]{1,80}$", scan_id):
            raise gl.vm.UserError("Invalid scan ID")
        if not re.match(r"^0x[a-fA-F0-9]{40}$", wallet):
            raise gl.vm.UserError("Invalid EVM wallet")
        if not re.match(r"^[a-f0-9]{64}$", evidence_hash):
            raise gl.vm.UserError("Invalid evidence hash")
        if len(evidence_url) > 500 or not evidence_url.startswith("https://"):
            raise gl.vm.UserError("Evidence must use HTTPS")
        if self.reports.get(scan_id, "") != "":
            raise gl.vm.UserError("This scan already has a report")

        def analyze():
            response = gl.nondet.web.get(evidence_url)
            if response.status >= 500:
                raise gl.vm.UserError(
                    ERROR_TRANSIENT
                    + " Evidence source returned "
                    + str(response.status)
                )
            if response.status >= 400:
                raise gl.vm.UserError(
                    ERROR_EXTERNAL
                    + " Evidence source returned "
                    + str(response.status)
                )
            body = response.body or b""
            if isinstance(body, str):
                body = body.encode("utf-8")
            if len(body) > 600000:
                raise gl.vm.UserError(ERROR_EXPECTED + " Evidence body is too large")
            actual_hash = hashlib.sha256(body).hexdigest()
            if actual_hash != evidence_hash:
                raise gl.vm.UserError(ERROR_EXPECTED + " Evidence hash mismatch")

            try:
                snapshot = json.loads(body.decode("utf-8"))
            except Exception:
                raise gl.vm.UserError(ERROR_EXPECTED + " Evidence is not valid JSON")
            if snapshot.get("schemaVersion") != "prooflens.v2":
                raise gl.vm.UserError(
                    ERROR_EXPECTED + " Evidence schema mismatch"
                )
            if str(snapshot.get("scanId", "")) != scan_id:
                raise gl.vm.UserError(ERROR_EXPECTED + " Evidence scan mismatch")
            if str(snapshot.get("wallet", "")).lower() != wallet.lower():
                raise gl.vm.UserError(ERROR_EXPECTED + " Evidence wallet mismatch")

            verified_metrics, live_counters, verified_records = (
                _verify_blockscout_evidence(snapshot, wallet)
            )
            model_input = {
                "verified_sample_metrics": verified_metrics,
                "live_blockscout_counters": live_counters,
                "verified_transactions": [
                    {
                        "chain_id": record["chain_id"],
                        "hash": record["hash"],
                        "block_number": record["blockNumber"],
                        "timestamp": record["timestamp"],
                        "from": record["from"],
                        "to": record["to"],
                        "value": record["value"],
                        "status": record["status"],
                        "method": record["method"],
                        "target_is_contract": record["targetIsContract"],
                        "created_contract": record["createdContract"],
                        "direction": _direction(record, wallet.lower()),
                    }
                    for record in verified_records
                ],
            }

            prompt = """
You are one independent validator in ProofLens, a wallet evidence attestation protocol.
Judge only the supplied Blockscout records independently fetched and verified by
this validator. Never infer a real person's identity. Live counters describe broad
coverage; the bounded transaction sample is the only source for behavioral details.
Sybil-like means coordinated or repetitive behavior that resembles account farming.
Bot-like means automation without necessarily being malicious.
High risk means the on-chain behavior shows strong abuse, scam, or exploit indicators.
Low risk and ordinary are behavioral descriptions, never guarantees of safety.
Use inconclusive when coverage or activity is too thin.

Return JSON only with:
classification: low_risk, ordinary, bot_like, sybil_like, high_risk, or inconclusive
risk_score: integer 0 to 100
confidence: integer 0 to 100
factor_codes: zero to six values from BURST_ACTIVITY, CONCENTRATED_COUNTERPARTIES,
CONCENTRATED_CONTRACTS, HIGH_FAILURE_RATE, HIGH_AUTOMATION, LOW_ACTIVITY,
MULTICHAIN_DEPTH, PARTIAL_COVERAGE, REPETITIVE_BEHAVIOR, LONG_DORMANCY
summary: at most 70 words, evidence based, plain language
evidence_refs: zero to six short references to supplied metrics
limitations: zero to five short limitations

Wallet evidence:
""" + json.dumps(model_input, sort_keys=True)

            raw = gl.nondet.exec_prompt(prompt, response_format="json")
            return _normalize_result(raw)

        def validate(leader_result):
            if not isinstance(leader_result, gl.vm.Return):
                return _leader_error_agrees(leader_result, analyze)

            own = analyze()
            proposed = leader_result.calldata
            if not isinstance(proposed, dict):
                return False
            if _risk_family(own["classification"]) != _risk_family(
                proposed["classification"]
            ):
                return False
            if abs(own["risk_score"] - proposed["risk_score"]) > 15:
                return False
            if abs(own["confidence"] - proposed["confidence"]) > 25:
                return False
            return _factors_overlap(own["factor_codes"], proposed["factor_codes"])

        verdict = gl.vm.run_nondet_unsafe(analyze, validate)
        report = {
            "scan_id": scan_id,
            "wallet": wallet.lower(),
            "evidence_url": evidence_url,
            "evidence_hash": evidence_hash,
            "evidence_schema": "prooflens.v2",
            "verification_schema": "blockscout.v1",
            "policy_version": self.policy_version,
            "verdict": verdict,
        }
        self.reports[scan_id] = json.dumps(report, sort_keys=True)
        self.wallet_latest[wallet.lower()] = scan_id
        self.report_count = u64(int(self.report_count) + 1)
