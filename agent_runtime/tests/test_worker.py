"""AI tests use synthetic model replies; they do not call a vendor account."""
import importlib.util
from pathlib import Path
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location("worker", Path(__file__).parents[1] / "worker.py")
worker = importlib.util.module_from_spec(spec)
spec.loader.exec_module(worker)
REQ = {"id": "goal", "title": "说明目标", "required": True, "keywords": ["目标"]}
DOC = {"id": "d", "name": "source.md", "text": "目标：整理销售记录。预算未提供。", "truncated": False}
BASELINE = {"goal": "说明目标", "requirements": [REQ], "checks": [], "constraints": "不能编造预算", "acceptedGaps": True, "documents": [DOC]}


def supported(quote="目标：整理销售记录。", document_id="d"):
    return {"requirementId": "goal", "status": "supported", "reason": "对应资料", "citations": [{"documentId": document_id, "quote": quote}], "sourceCitations": [{"documentId": "d", "quote": "目标：整理销售记录。"}], "supplement": ""}


class WorkerTests(unittest.TestCase):
    def test_rules_are_not_semantic_pass(self):
        result = worker.handle({"operation": "prepare", "mode": "rules", "goal": "x", "requirements": [REQ], "documents": [DOC]})
        self.assertEqual(result["checks"][0]["status"], "partial")
        reviewed = worker.handle({"operation": "review", "mode": "rules", "baseline": BASELINE, "documents": [DOC]})
        self.assertEqual(reviewed["outcome"], "unable")

    def test_no_hits_is_unknown_not_asserted_absence(self):
        result = worker.keyword_checks([{**REQ, "keywords": ["不存在的词"]}], [DOC])
        self.assertEqual(result[0]["status"], "unknown")

    def test_fabricated_citation_cannot_support_requirement(self):
        for item in (supported("凭空的资料内容"), supported(document_id="foreign")):
            self.assertEqual(worker.validate_checks([item], [REQ], [DOC])[0]["status"], "unknown")

    def test_complete_checklist_is_mandatory(self):
        for checks in ([], [supported(), supported()]):
            with self.assertRaises(ValueError):
                worker.validate_checks(checks, [REQ], [DOC])

    def test_missing_key_does_not_fallback(self):
        with self.assertRaisesRegex(ValueError, "未配置"):
            worker.call_model("json", {}, {})

    def test_model_semantic_response_is_validated(self):
        with patch.object(worker, "call_model", return_value={"checks": [supported()], "findings": []}):
            result = worker.handle({"operation": "review", "mode": "agent", "baseline": BASELINE, "documents": [DOC], "config": {"key": "fixture", "model": "fixture"}})
        self.assertEqual(result["outcome"], "passed")

    def test_unknown_evidence_prevents_pass(self):
        with patch.object(worker, "call_model", return_value={"checks": [supported("虚构证据内容")], "findings": []}):
            result = worker.handle({"operation": "review", "mode": "agent", "baseline": BASELINE, "documents": [DOC], "config": {"model": "fixture"}})
        self.assertEqual(result["outcome"], "unable")

    def test_output_citation_without_source_cannot_pass(self):
        item = supported()
        item["sourceCitations"] = []
        with patch.object(worker, "call_model", return_value={"checks": [item], "findings": []}):
            result = worker.handle({"operation": "review", "mode": "agent", "baseline": BASELINE, "documents": [DOC], "config": {"model": "fixture"}})
        self.assertEqual(result["outcome"], "unable")

    def test_model_cannot_invent_a_finding_location(self):
        f = {"severity": "error", "title": "x", "detail": "x", "suggestion": "x", "documentId": "foreign", "quote": "虚构定位"}
        with patch.object(worker, "call_model", return_value={"checks": [supported()], "findings": [f]}):
            with self.assertRaisesRegex(ValueError, "无法验证"):
                worker.handle({"operation": "review", "mode": "agent", "baseline": BASELINE, "documents": [DOC], "config": {"model": "fixture"}})

    def test_partial_requirement_is_business_failure_not_execution_error(self):
        partial = {**supported(), "status": "partial", "supplement": "补充资料"}
        with patch.object(worker, "call_model", return_value={"checks": [partial], "findings": []}):
            result = worker.handle({"operation": "review", "mode": "agent", "baseline": BASELINE, "documents": [DOC], "config": {"model": "fixture"}})
        self.assertEqual(result["outcome"], "changes_requested")
        self.assertEqual(result["findings"][0]["severity"], "error")


if __name__ == "__main__":
    unittest.main()
