#!/usr/bin/env python3
"""
Autonomous planner endpoint smoke test for CommandCenter backend.

Validates these routes:
- GET /status
- POST /mpc/goal
- POST /command/autonomous_move
- POST /command/send_local_goal
- GET /lowlevel/telemetry

This test checks HTTP success and basic telemetry state reflection.
"""

import argparse
import sys
import time
from typing import Any, Dict, Optional, Tuple

import requests


class PlannerTester:
    def __init__(self, base_url: str, timeout_s: float, pause_s: float):
        self.base_url = base_url.rstrip("/")
        self.timeout_s = timeout_s
        self.pause_s = pause_s
        self.session = requests.Session()
        self.failures = []

    def _url(self, path: str) -> str:
        return f"{self.base_url}{path}"

    def _request(self, method: str, path: str, payload: Optional[Dict[str, Any]] = None) -> Tuple[bool, int, Any]:
        try:
            response = self.session.request(
                method=method,
                url=self._url(path),
                json=payload,
                timeout=self.timeout_s,
            )
            try:
                body = response.json()
            except Exception:
                body = response.text
            ok = 200 <= response.status_code < 300
            return ok, response.status_code, body
        except Exception as exc:
            return False, 0, {"error": str(exc)}

    def _assert(self, condition: bool, name: str, detail: str):
        if condition:
            print(f"[PASS] {name}: {detail}")
            return
        print(f"[FAIL] {name}: {detail}")
        self.failures.append(f"{name}: {detail}")

    def check_status(self):
        ok, code, body = self._request("GET", "/status")
        self._assert(ok, "status endpoint", f"code={code}")
        if ok and isinstance(body, dict):
            self._assert("status" in body, "status payload", "contains status field")

    def check_mpc_goal(self):
        payload = {"vx": 0.25, "vy": 0.0, "wz": 0.1, "hold": True}
        ok, code, body = self._request("POST", "/mpc/goal", payload)
        self._assert(ok, "mpc goal", f"code={code}, payload={payload}")
        if isinstance(body, dict):
            self._assert(body.get("status") == "success", "mpc response", str(body))

    def check_autonomous_move(self):
        payload = {"linear_x": 0.35}
        ok, code, body = self._request("POST", "/command/autonomous_move", payload)
        self._assert(ok, "autonomous move", f"code={code}, payload={payload}")
        if isinstance(body, dict):
            self._assert(body.get("status") == "success", "autonomous response", str(body))

    def check_local_goal(self):
        payload = {"x": 1.0, "y": 0.3, "yaw": 0.0, "frame_id": "map"}
        ok, code, body = self._request("POST", "/command/send_local_goal", payload)
        self._assert(ok, "local goal", f"code={code}, payload={payload}")
        if isinstance(body, dict):
            self._assert(body.get("status") == "success", "local-goal response", str(body))

    def check_lowlevel_telemetry(self):
        ok, code, body = self._request("GET", "/lowlevel/telemetry")
        self._assert(ok, "lowlevel telemetry", f"code={code}")
        if not ok or not isinstance(body, dict):
            return

        behavior = body.get("behavior", {})
        self._assert(isinstance(behavior, dict), "telemetry behavior", "present")
        self._assert("se2twist_des" in body, "telemetry se2twist_des", "present")
        self._assert("joint_position" in body, "telemetry joint_position", "present")

    def run(self) -> int:
        print(f"[INFO] Testing planner endpoints at {self.base_url}")
        self.check_status()
        self.check_mpc_goal()
        time.sleep(self.pause_s)
        self.check_autonomous_move()
        time.sleep(self.pause_s)
        self.check_local_goal()
        time.sleep(self.pause_s)
        self.check_lowlevel_telemetry()

        if self.failures:
            print("\n[SUMMARY] FAIL")
            for item in self.failures:
                print(f" - {item}")
            return 1

        print("\n[SUMMARY] PASS")
        return 0


def main() -> int:
    parser = argparse.ArgumentParser(description="Smoke test autonomous planner routes")
    parser.add_argument("--base-url", default="http://127.0.0.1:5002", help="Backend URL")
    parser.add_argument("--timeout", type=float, default=3.0, help="Request timeout seconds")
    parser.add_argument("--pause", type=float, default=0.2, help="Pause between route checks")
    args = parser.parse_args()

    tester = PlannerTester(base_url=args.base_url, timeout_s=args.timeout, pause_s=args.pause)
    return tester.run()


if __name__ == "__main__":
    raise SystemExit(main())
