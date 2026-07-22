#!/usr/bin/env python3
"""
MBLink -> CommandCenter low-level telemetry bridge.

Reads MBLink rx data from GhostSDK and forwards telemetry into:
- POST /lowlevel/rx
- POST /lowlevel/joints

This adapter is passive: it does not command robot motion.
"""

import argparse
import os
import sys
import time
from typing import Any, Dict, List

import requests


def _to_list(values: Any) -> List[Any]:
    if values is None:
        return []
    if isinstance(values, list):
        return values
    try:
        return list(values)
    except Exception:
        return []


def _to_float_list(values: Any, max_len: int = 64) -> List[float]:
    out = []
    for item in _to_list(values)[:max_len]:
        try:
            out.append(float(item))
        except Exception:
            continue
    return out


def _to_int_list(values: Any, max_len: int = 64) -> List[int]:
    out = []
    for item in _to_list(values)[:max_len]:
        try:
            out.append(int(item))
        except Exception:
            continue
    return out


def _diag_bitfield(diag_values: Any) -> int:
    diag = _to_int_list(diag_values, max_len=4)
    if not diag:
        return 0
    if len(diag) >= 3:
        present, _enabled, health = diag[0], diag[1], diag[2]
        return int(present & ~health)
    if len(diag) == 2:
        return int(diag[1])
    return int(diag[0])


def _behavior_name(behavior_values: Any) -> str:
    behavior = _to_int_list(behavior_values, max_len=3)
    if not behavior:
        return "unknown"
    return {
        0: "sit",
        1: "stand",
        2: "walk",
    }.get(int(behavior[0]), "unknown")


def _mode_value(mode_values: Any) -> int:
    mode = _to_int_list(mode_values, max_len=2)
    if len(mode) >= 2:
        return int(mode[1])
    if len(mode) == 1:
        return int(mode[0])
    return 0


def _normalize_voltage(values: Any) -> List[float]:
    parsed = _to_float_list(values, max_len=4)
    if not parsed:
        return []
    if max(abs(v) for v in parsed) > 200.0:
        return [v / 1000.0 for v in parsed]
    return parsed


def _extract_rx_payload(rx: Dict[str, Any]) -> Dict[str, Any]:
    se2 = _to_float_list(rx.get("se2twist_des"), max_len=3)
    imu_w = _to_float_list(rx.get("imu_angular_velocity"), max_len=3)
    imu_a = _to_float_list(rx.get("imu_linear_acceleration"), max_len=3)
    twist = _to_float_list(rx.get("twist_linear"), max_len=3)
    voltage = _normalize_voltage(rx.get("voltage"))

    return {
        "control_mode": _mode_value(rx.get("mode")),
        "action": (_to_int_list(rx.get("behavior"), max_len=3) + [None])[0],
        "behavior": _behavior_name(rx.get("behavior")),
        "diagnostics_bitfield": _diag_bitfield(rx.get("diagnostics")),
        "se2twist_des": {
            "vx": se2[0] if len(se2) > 0 else 0.0,
            "vy": se2[1] if len(se2) > 1 else 0.0,
            "wz": se2[2] if len(se2) > 2 else 0.0,
        },
        "imu_angular_velocity": {
            "x": imu_w[0] if len(imu_w) > 0 else 0.0,
            "y": imu_w[1] if len(imu_w) > 1 else 0.0,
            "z": imu_w[2] if len(imu_w) > 2 else 0.0,
        },
        "imu_linear_acceleration": {
            "x": imu_a[0] if len(imu_a) > 0 else 0.0,
            "y": imu_a[1] if len(imu_a) > 1 else 0.0,
            "z": imu_a[2] if len(imu_a) > 2 else 0.0,
        },
        "twist_linear": {
            "x": twist[0] if len(twist) > 0 else 0.0,
            "y": twist[1] if len(twist) > 1 else 0.0,
            "z": twist[2] if len(twist) > 2 else 0.0,
        },
        "voltage": {
            "raw": ", ".join(f"{v:.2f}" for v in voltage),
            "parsed": voltage,
        },
    }


def _extract_joint_payload(rx: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "joint_position": _to_float_list(rx.get("joint_position"), max_len=32),
        "joint_velocity": _to_float_list(rx.get("joint_velocity"), max_len=32),
        "joint_current": _to_float_list(rx.get("joint_current"), max_len=32),
        "joint_temperature": _to_float_list(rx.get("joint_temperature"), max_len=32),
        "joint_voltage": _to_float_list(rx.get("joint_voltage"), max_len=32),
        "contacts": _to_int_list(rx.get("contacts"), max_len=16),
        "phase": _to_float_list(rx.get("phase"), max_len=16),
        "swing_mode": _to_int_list(rx.get("swing_mode"), max_len=16),
    }


def _post_json(session: requests.Session, url: str, payload: Dict[str, Any], timeout_s: float) -> bool:
    try:
        response = session.post(url, json=payload, timeout=timeout_s)
        return 200 <= response.status_code < 300
    except Exception:
        return False


def main() -> int:
    parser = argparse.ArgumentParser(description="Bridge MBLink telemetry to CommandCenter low-level endpoints")
    parser.add_argument("--backend-url", default="http://127.0.0.1:5000", help="Base URL of CommandCenter backend")
    parser.add_argument("--ghostsdk-root", default=os.environ.get("GHOSTSDK_ROOT", "/home/bsuatlab/GhostSDK"), help="GhostSDK root directory")
    parser.add_argument("--sim", action="store_true", help="Connect MBLink in sim mode")
    parser.add_argument("--verbose", action="store_true", help="Print periodic adapter status")
    parser.add_argument("--log", action="store_true", help="Enable MBLink log capture")
    parser.add_argument("--post-timeout", type=float, default=0.4, help="HTTP POST timeout seconds")
    parser.add_argument("--status-every", type=int, default=50, help="Print status every N MBLink frames")
    args = parser.parse_args()

    mblink_examples = os.path.join(args.ghostsdk_root, "share", "gr", "mblink", "examples")
    if mblink_examples not in sys.path:
        sys.path.append(mblink_examples)

    try:
        from grpy import mb80v2
    except Exception as exc:
        print(f"[adapter] Failed to import GhostSDK MBLink python bindings from {mblink_examples}: {exc}")
        return 1

    print(f"[adapter] Connecting MBLink (sim={args.sim})")
    mb = mb80v2.MB80v2(sim=args.sim, verbose=args.verbose, log=args.log)

    # Improve upstream update rate when supported.
    try:
        mb.setRetry("UPST_LOOP_DELAY", 2)
    except Exception:
        pass

    session = requests.Session()
    rx_url = args.backend_url.rstrip("/") + "/lowlevel/rx"
    joints_url = args.backend_url.rstrip("/") + "/lowlevel/joints"

    frames = 0
    post_failures = 0
    try:
        while True:
            rx = mb.get()
            rx_payload = _extract_rx_payload(rx)
            joints_payload = _extract_joint_payload(rx)

            ok_rx = _post_json(session, rx_url, rx_payload, args.post_timeout)
            ok_joints = _post_json(session, joints_url, joints_payload, args.post_timeout)
            if not ok_rx or not ok_joints:
                post_failures += 1

            frames += 1
            if args.verbose and frames % max(1, args.status_every) == 0:
                jp = len(joints_payload.get("joint_position", []))
                cm = rx_payload.get("control_mode")
                bh = rx_payload.get("behavior")
                print(f"[adapter] frames={frames} failures={post_failures} joints={jp} mode={cm} behavior={bh}")

            if not mb.alive():
                print("[adapter] MBLink no longer alive; exiting")
                break

    except KeyboardInterrupt:
        print("[adapter] Stopping on Ctrl+C")
    finally:
        try:
            mb.rxstop(save=args.log)
        except Exception:
            pass

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
