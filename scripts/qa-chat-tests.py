#!/usr/bin/env python3
"""QA test harness for Gym-AI-Chatbot /api/chat endpoint."""
import json
import re
import subprocess
import sys
import urllib.request
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Tuple

BASE = "http://localhost:3000"
GYM = "demo-gym"
WELCOME = (
    "Hi! I'm the Iron Valley Fitness front desk assistant. "
    "Ask about hours, memberships, classes, or say you'd like to book a tour."
)


@dataclass
class TurnResult:
    response: str = ""
    events: List[dict] = field(default_factory=list)

    @property
    def lead_step(self) -> Optional[dict]:
        for e in self.events:
            if e.get("type") == "lead_step":
                return e
        return None

    @property
    def lead_saved(self) -> Optional[dict]:
        for e in self.events:
            if e.get("type") == "lead_saved":
                return e
        return None

    @property
    def lead_clear(self) -> bool:
        return any(e.get("type") == "lead_clear" for e in self.events)


def chat(session_id: str, messages: List[dict]) -> TurnResult:
    body = json.dumps({"sessionId": session_id, "gymId": GYM, "messages": messages}).encode()
    req = urllib.request.Request(
        f"{BASE}/api/chat",
        data=body,
        headers={
            "Content-Type": "application/json",
            "X-Forwarded-For": f"qa-{session_id}",
        },
        method="POST",
    )
    result = TurnResult()
    with urllib.request.urlopen(req, timeout=120) as resp:
        for line in resp:
            line = line.decode().strip()
            if not line:
                continue
            event = json.loads(line)
            t = event.get("type")
            if t == "text":
                result.response += event.get("content", "")
            elif t == "replace":
                result.response = event.get("content", "")
            else:
                result.events.append(event)
    return result


def session(prefix: str) -> str:
    import uuid
    return f"{prefix}-{uuid.uuid4().hex[:12]}"


def build_history(pairs: List[Tuple[str, str]]) -> List[dict]:
    return [{"role": r, "content": c} for r, c in pairs]


def send_incremental(session_id: str, turns: List[str]) -> List[TurnResult]:
    history: List[dict] = [{"role": "assistant", "content": WELCOME}]
    results = []
    for user_msg in turns:
        history.append({"role": "user", "content": user_msg})
        r = chat(session_id, history)
        results.append(r)
        history.append({"role": "assistant", "content": r.response})
    return results


@dataclass
class TestCase:
    name: str
    passed: bool
    note: str


tests: List[TestCase] = []


def record(name: str, passed: bool, note: str):
    tests.append(TestCase(name, passed, note))
    status = "PASS" if passed else "FAIL"
    print(f"[{status}] {name}: {note}")


def contains_all(text: str, *terms: str) -> bool:
    lower = text.lower()
    return all(t.lower() in lower for t in terms)


def contains_any(text: str, *terms: str) -> bool:
    lower = text.lower()
    return any(t.lower() in lower for t in terms)


def run_faq_tests():
    print("\n--- FAQ Tests ---")

    # 1. hi
    sid = session("faq-hi")
    r = send_incremental(sid, ["hi"])[0]
    ok = r.lead_step is None and r.lead_clear
    record("FAQ-1 hi", ok, f"lead_clear={r.lead_clear}, step={r.lead_step}")

    # 2. hours
    sid = session("faq-hours")
    r = send_incremental(sid, ["What are your hours?"])[0]
    ok = (
        r.lead_step is None
        and contains_all(r.response, "24/7", "5")
        and contains_any(r.response, "monday", "mon-fri", "monday through friday")
    )
    record("FAQ-2 hours", ok, r.response[:120] + "...")

    # 3. membership prices
    sid = session("faq-prices")
    r = send_incremental(sid, ["Membership prices"])[0]
    ok = (
        r.lead_step is None
        and contains_all(r.response, "$29", "$49", "$79")
        and "basic" in r.response.lower()
        and "plus" in r.response.lower()
        and "premium" in r.response.lower()
    )
    record("FAQ-3 membership prices", ok, r.response[:150] + "...")

    # 4. other memberships
    sid = session("faq-other")
    r = send_incremental(sid, ["are there other memberships?"])[0]
    lower = r.response.lower()
    only_basic = (
        "basic" in lower
        and "plus" not in lower
        and "premium" not in lower
    )
    ok = r.lead_step is None and not only_basic
    record("FAQ-4 other memberships", ok, "not only Basic" if ok else r.response[:120])

    # 5. location
    sid = session("faq-loc")
    r = send_incremental(sid, ["Where are you located?"])[0]
    ok = r.lead_step is None and contains_all(
        r.response, "742", "Iron Valley", "Austin"
    )
    record("FAQ-5 location", ok, r.response[:120] + "...")

    # 6. yoga
    sid = session("faq-yoga")
    r = send_incremental(sid, ["Do you have yoga classes?"])[0]
    ok = r.lead_step is None and "yoga" in r.response.lower()
    record("FAQ-6 yoga", ok, r.response[:120] + "...")

    # 7. personal training
    sid = session("faq-pt")
    r = send_incremental(sid, ["How much is personal training?"])[0]
    ok = r.lead_step is None and (
        "$65" in r.response or "65" in r.response
    ) and contains_any(r.response, "session", "package", "5 session", "10 session")
    record("FAQ-7 personal training", ok, r.response[:120] + "...")

    # 8. free trial
    sid = session("faq-trial")
    r = send_incremental(sid, ["Can I get a free trial?"])[0]
    ok = r.lead_step is None and contains_any(
        r.response, "day pass", "1-day", "free", "$20", "7-day", "week"
    )
    record("FAQ-8 free trial", ok, r.response[:120] + "...")


def run_lead_tests():
    print("\n--- Lead Capture Tests ---")

    # A. Tour flow
    sid = session("lead-tour")
    results = send_incremental(
        sid,
        [
            "tell me about the gym",
            "yes!",
            "Redt Dunn",
            "2025550147",
            "Basic membership",
        ],
    )

    r0 = results[0]
    no_capture_start = r0.lead_step is None
    record("Lead-A1 explore no capture", no_capture_start, f"step={r0.lead_step}")

    r1 = results[1]
    step1_ok = (
        r1.lead_step is not None
        and r1.lead_step.get("step") == 1
        and r1.lead_step.get("field") == "name"
    )
    record("Lead-A2 yes -> step 1 name", step1_ok, str(r1.lead_step))

    r2 = results[2]
    step2_ok = r2.lead_step and r2.lead_step.get("step") == 2
    record("Lead-A3 name -> step 2 phone", step2_ok, str(r2.lead_step))

    r3 = results[3]
    step3_ok = r3.lead_step and r3.lead_step.get("step") == 3
    record("Lead-A4 phone -> step 3 goals", step3_ok, str(r3.lead_step))

    r4 = results[4]
    saved_ok = r4.lead_saved is not None
    sms_disabled = r4.lead_saved and r4.lead_saved.get("smsDisabled") is True
    record("Lead-A5 goals -> lead_saved", saved_ok, str(r4.lead_saved))
    record("Lead-A6 sms disabled on save", sms_disabled, f"smsSent={r4.lead_saved and r4.lead_saved.get('smsSent')}")

    # B. Direct intent
    sid = session("lead-direct")
    results = send_incremental(
        sid,
        ["Book a tour", "Jane Smith", "5125551234", "Want to lose weight"],
    )
    r0 = results[0]
    direct_ok = r0.lead_step and r0.lead_step.get("step") == 1
    record("Lead-B1 book tour -> step 1", direct_ok, str(r0.lead_step))

    r3 = results[3]
    saved = r3.lead_saved is not None
    record("Lead-B2 direct flow completes", saved, str(r3.lead_saved))

    # C. Negative tests
    sid = session("lead-neg-hi")
    results = send_incremental(sid, ["Book a tour", "hi"])
    r1 = results[1]
    step_still_name = r1.lead_step and r1.lead_step.get("field") == "name"
    was_reset = r1.lead_step is None and r1.lead_clear
    name_not_saved = r1.lead_saved is None
    record(
        "Lead-C1 hi during step 1 not saved as name",
        (step_still_name or was_reset) and name_not_saved,
        f"step={r1.lead_step}, reset={was_reset}, resp={r1.response[:80]}",
    )

    sid = session("lead-neg-signup")
    r = send_incremental(sid, ["ready to sign up"])[0]
    signup_ok = r.lead_step and r.lead_step.get("step") == 1
    record("Lead-C2 ready to sign up starts capture", signup_ok, str(r.lead_step))

    sid = session("lead-neg-interested")
    r = send_incremental(sid, ["I am interested in joining"])[0]
    no_capture = r.lead_step is None
    record("Lead-C3 interested alone no capture", no_capture, str(r.lead_step))


def db_query():
    cmd = [
        "sqlite3",
        "data/leads.db",
        "SELECT id, name, phone, goals FROM leads ORDER BY id;",
    ]
    return subprocess.check_output(cmd, text=True)


def main():
    print("Waiting for server...")
    try:
        urllib.request.urlopen(BASE, timeout=5)
    except Exception as e:
        print(f"Server not ready: {e}")
        sys.exit(1)

    run_faq_tests()
    run_lead_tests()

    print("\n--- DB Verification ---")
    try:
        db = db_query()
        print(db or "(no leads)")
    except Exception as e:
        print(f"DB query failed: {e}")

    passed = sum(1 for t in tests if t.passed)
    total = len(tests)
    print(f"\n=== SUMMARY: {passed}/{total} passed ===")
    if passed < total:
        sys.exit(1)


if __name__ == "__main__":
    main()
