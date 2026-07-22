#!/usr/bin/env python3
"""
ROS2 Flask API Server
This server allows frontend applications to control a ROS2 robot
via REST API endpoints.
"""

from flask import Flask, jsonify, request, Response, stream_with_context, make_response, send_file
from flask_cors import CORS
from prometheus_client import CollectorRegistry, Gauge, Counter, Histogram, generate_latest, CONTENT_TYPE_LATEST
import rclpy
from rclpy.node import Node
from geometry_msgs.msg import Twist, Pose, PoseStamped, PoseWithCovarianceStamped
from std_msgs.msg import String, UInt32
from sensor_msgs.msg import Image, Imu, NavSatFix
from nav_msgs.msg import Odometry
from cv_bridge import CvBridge
import sensor_msgs_py.point_cloud2 as pc2
from sensor_msgs.msg import PointCloud2
import  numpy as np
import threading
import time
import json
import cv2
import re

import requests
# import pyttsx3
import subprocess
import os
from pathlib import Path
from pyproj import CRS, Transformer
import pyproj
from rclpy.executors import MultiThreadedExecutor
from rclpy.task import Future


import base64
import numpy as np

from math import sin, cos  # add

try:
    from std_srvs.srv import Empty
except Exception:
    Empty = None

try:
    from ghost_slam_msgs.srv import SaveMap
except Exception:
    SaveMap = None

# --- Control modes / actions (adjust if your agent differs) ---
PLANNER_LOCAL = 140    # /move_base_simple/goal
PLANNER_MPC   = 160    # /mpc/goal
ACTION_WALK   = 2

# Global registry + metrics
_registry = CollectorRegistry()
pc_points_g = Gauge("pc_points", "Point count", ["topic", "method"], registry=_registry)
pc_raw_bytes_g = Gauge("pc_raw_json_bytes", "Estimated raw JSON bytes", ["topic", "method"], registry=_registry)
pc_packed_bytes_g = Gauge("pc_packed_bytes", "Hilbert-packed bytes (pre-b64)", ["topic", "method"], registry=_registry)
pc_ratio_g = Gauge("pc_compression_ratio", "raw_json_bytes / packed_bytes", ["topic", "method"], registry=_registry)
pc_pack_ms_h = Histogram("pc_pack_ms", "Packing time (ms)", ["topic", "method"], registry=_registry, buckets=[0.5,1,2,4,8,16,32,64,128,256])
pc_frames_total = Counter("pc_frames_total", "Total frames seen", ["topic"], registry=_registry)

def _record_metrics(*, topic:str, method:str, n_points:int, raw_json_bytes:int, packed_bytes:int, pack_ms:float):
    pc_points_g.labels(topic, method).set(n_points)
    pc_raw_bytes_g.labels(topic, method).set(raw_json_bytes)
    pc_packed_bytes_g.labels(topic, method).set(packed_bytes)
    if packed_bytes > 0:
        pc_ratio_g.labels(topic, method).set(raw_json_bytes / packed_bytes)
    pc_pack_ms_h.labels(topic, method).observe(pack_ms)
    pc_frames_total.labels(topic).inc()
def _b64_bytes_len(b64_str: str) -> int:
    s = b64_str.strip()
    pad = 2 if s.endswith('==') else (1 if s.endswith('=') else 0)
    return (len(s) * 3) // 4 - pad

def _with_pc_headers(resp, *, method: str, npoints: int, encoded_bytes: int = None, encode_ms: float = None):
    # let browser JS read these custom headers
    resp.headers['Access-Control-Expose-Headers'] = 'X-PC-Method, X-PC-Points, X-PC-Encoded-Bytes, X-PC-Encode-MS'
    resp.headers['X-PC-Method'] = method
    resp.headers['X-PC-Points'] = str(npoints)
    if encoded_bytes is not None:
        resp.headers['X-PC-Encoded-Bytes'] = str(encoded_bytes)
    if encode_ms is not None:
        resp.headers['X-PC-Encode-MS'] = f"{encode_ms:.3f}"
    return resp

def _pack_hilbert_metrics(pts_f32: np.ndarray):
    """
    Return packed bytes + metrics WITHOUT sending the big point list.
    """
    t0 = time.time()
    origin, scale, qpoints = pc_compressor.quantize(pts_f32)
    order = pc_compressor.hilbert_order(qpoints)
    packed = pc_compressor.pack(qpoints[order])
    pack_ms = (time.time() - t0) * 1000.0

    # If you want to test LZ4 again later, you can optionally compress here
    # and report both raw packed and lz4 sizes. For now we stick to raw.
    packed_len = len(packed)

    # Build a *rough* JSON size estimate for the raw endpoint.
    # This serializes minified JSON and measures actual bytes.
    # (Don’t worry—this is just for a /metrics endpoint, not your hot path.)
    sample_rgb = [100, 255, 100]  # matches your raw coloring
    raw_dict = {"points": [
        {"x": float(p[0]), "y": float(p[1]), "z": float(p[2]),
         "r": sample_rgb[0], "g": sample_rgb[1], "b": sample_rgb[2]}
        for p in pts_f32
    ]}
    raw_json_bytes = json.dumps(raw_dict, separators=(',', ':')).encode('utf-8')
    raw_json_len = len(raw_json_bytes)

       # record to Prometheus
    _record_metrics(
        
        topic="/mcu/state/pointcloud",
        method="hilbert-raw",
        n_points=int(pts_f32.shape[0]),
        raw_json_bytes=int(raw_json_len),
        packed_bytes=int(packed_len),
        pack_ms=pack_ms
    )

    return {
        "n_points": int(pts_f32.shape[0]),
        "packed_bytes": int(packed_len),
        "raw_json_bytes": int(raw_json_len),
        "compression_ratio": float(raw_json_len / max(1, packed_len)),
        "pack_ms": pack_ms,
        "origin": [float(origin[0]), float(origin[1]), float(origin[2])],
        "scale": float(scale),
    }

try:
    import lz4.frame as lz4f  # optional
except Exception:
    lz4f = None

# ---- add this line ----
USE_LZ4 = False  # default to RAW; turn True if you want LZ4 AND the frontend can decode it


from hilbert import PointCloudCompressor

# Initialize Flask app
app = Flask(__name__)
CORS(app)  # Enable CORS for cross-origin frontend communication

ENABLE_TTS = True # Set to 'False' to disable speaking from agent 


def speak(text: str):
    if ENABLE_TTS:
        try:
            subprocess.call(["espeak", text])
        except Exception as e:
            print("TTS error:", e)
        
#----------------------------------------------------------------------------------------- 
# Shared robot state (protected by a mutex for thread safety)
robot_status = {'ghost': 'Unknown'}
robot_gps = {'ghost': {'latitude': None, 'longitude': None}}
robot_battery = {'ghost': 'Unknown'}
robot_imu = {}
robot_camera = {}
robot_alerts = {}
robot_odometry = {'ghost': {}}

localization_state = {
    "mode": "outdoor",
    "confidence": "unknown",
    "source": "gps",
    "current_map": None,
    "last_initialpose": None,
    "last_apriltag": None,
    "last_reset_at": 0.0,
    "updated_at": 0.0,
}

site_profiles = {
    "indoor": {
        "mode": "indoor",
        "source": "lidar_apriltag",
        "description": "GPS denied. Use lidar localization plus AprilTag recovery.",
    },
    "outdoor": {
        "mode": "outdoor",
        "source": "gps_lidar",
        "description": "GPS assisted navigation with lidar obstacle handling.",
    },
}

mission_state = {
    "queue": [],
    "active_goal": None,
    "history": [],
    "status": "idle",
    "auto_start": False,
    "updated_at": 0.0,
}

lowlevel_state = {
    "control_mode": None,
    "action": None,
    "behavior": "unknown",
    "last_twist": {"vx": 0.0, "vy": 0.0, "wz": 0.0},
    "diagnostics_bitfield": 0,
    "updated_at": 0.0,
}

lowlevel_rx_state = {
    "control_mode": None,
    "action": None,
    "behavior": None,
    "diagnostics_bitfield": None,
    "se2twist_des": None,
    "imu_angular_velocity": None,
    "imu_linear_acceleration": None,
    "twist_linear": None,
    "voltage": None,
    "updated_at": 0.0,
}

lowlevel_params = {}

MAPS_DIR = Path(os.environ.get("GHOST_GPS_DENIED_MAP_DIR", "/home/ghost/gps_denied_maps"))

latest_obstmap_at = 0.0
latest_pointcloud_at = 0.0

ghost_state = {
    "mission": {
        "requested": None,
        "last_command": None,
        "last_command_at": 0.0,
        "status_text": "unknown",
        "active_script": None,
    },
    "lidar": {
        "lio_active": False,
        "relocalization_status": "unknown",
        "obstacle_status": "unknown",
        "apriltag_active": False,
        "odom_source": "gps",
        "last_map_save": None,
        "last_map_save_at": 0.0,
    },
    "planner": {
        "current_path_index": None,
    },
    "maps": {
        "directory": str(MAPS_DIR),
    },
}

ghost_script_catalog = {
    "record_lidar_route_reloc": {
        "mission": "Record/RecordLidarRouteReloc.txt",
        "description": "Start lidar odometry, restart relocalization, wait for lock, then record a GPS-denied route.",
    },
    "lio_start": {
        "mission": "Odometry/LioStart.txt",
        "description": "Activate ouster and LIO-SAM.",
    },
    "relocalize_restart": {
        "mission": "Odometry/RelocalizeRestart.txt",
        "description": "Restart lidar relocalization against the active saved map.",
    },
    "lio_save_map": {
        "mission": "Odometry/LioSaveMap.txt",
        "description": "Persist the current GPS-denied lidar map to disk.",
    },
}

lowlevel_joint_state = {
    "joint_position": [],
    "joint_velocity": [],
    "joint_current": [],
    "joint_temperature": [],
    "joint_voltage": [],
    "contacts": [],
    "phase": [],
    "swing_mode": [],
    "updated_at": 0.0,
}

_DIAG_FLAG_NAMES = {
    0: "sensor_3d_gyro",
    1: "sensor_3d_accel",
    2: "sensor_3d_mag",
    3: "sensor_abs_pressure",
    4: "sensor_diff_pressure",
    5: "sensor_gps",
    6: "sensor_optical_flow",
    7: "sensor_vision_position",
    8: "sensor_laser_position",
    9: "sensor_external_ground_truth",
    10: "sensor_angular_rate_control",
    11: "sensor_attitude_stabilization",
    12: "sensor_yaw_position",
    13: "sensor_z_altitude_control",
    14: "sensor_xy_position_control",
    15: "sensor_motor_outputs",
    16: "sensor_rc_receiver",
    17: "sensor_3d_gyro2",
    18: "sensor_3d_accel2",
    19: "sensor_3d_mag2",
    20: "geofence",
    21: "ahrs",
    22: "terrain",
    23: "reverse_motor",
    24: "logging",
    25: "battery",
    26: "proximity",
    27: "satcom",
    28: "prearm_check",
    29: "obstacle_avoidance",
    30: "propulsion",
    31: "extension",
}

def _decode_diagnostics(bitfield: int):
    active = []
    for idx, name in _DIAG_FLAG_NAMES.items():
        if bitfield & (1 << idx):
            active.append(name)
    return {
        "bitfield": int(bitfield),
        "active": active,
        "count": len(active),
    }

def _extract_battery_voltages(raw_value):
    if raw_value is None:
        return []
    values = [float(v) for v in re.findall(r"[-+]?\d*\.?\d+", str(raw_value))]
    return values[:2]

def _set_lowlevel_state(**kwargs):
    with command_mutex:
        for key, value in kwargs.items():
            if key in lowlevel_state:
                lowlevel_state[key] = value
        lowlevel_state["updated_at"] = time.time()

def _as_float_list(values, max_len=64):
    if not isinstance(values, list):
        return []
    out = []
    for item in values[:max_len]:
        try:
            out.append(float(item))
        except Exception:
            continue
    return out

def _as_int_list(values, max_len=64):
    if not isinstance(values, list):
        return []
    out = []
    for item in values[:max_len]:
        try:
            out.append(int(item))
        except Exception:
            continue
    return out

def _set_joint_state(payload: dict):
    with command_mutex:
        if "joint_position" in payload:
            lowlevel_joint_state["joint_position"] = _as_float_list(payload.get("joint_position", []))
        if "joint_velocity" in payload:
            lowlevel_joint_state["joint_velocity"] = _as_float_list(payload.get("joint_velocity", []))
        if "joint_current" in payload:
            lowlevel_joint_state["joint_current"] = _as_float_list(payload.get("joint_current", []))
        if "joint_temperature" in payload:
            lowlevel_joint_state["joint_temperature"] = _as_float_list(payload.get("joint_temperature", []))
        if "joint_voltage" in payload:
            lowlevel_joint_state["joint_voltage"] = _as_float_list(payload.get("joint_voltage", []))
        if "contacts" in payload:
            lowlevel_joint_state["contacts"] = _as_int_list(payload.get("contacts", []), max_len=16)
        if "phase" in payload:
            lowlevel_joint_state["phase"] = _as_float_list(payload.get("phase", []), max_len=16)
        if "swing_mode" in payload:
            lowlevel_joint_state["swing_mode"] = _as_int_list(payload.get("swing_mode", []), max_len=16)
        lowlevel_joint_state["updated_at"] = time.time()

def _set_lowlevel_rx_state(payload: dict):
    with command_mutex:
        if "control_mode" in payload:
            try:
                lowlevel_rx_state["control_mode"] = int(payload.get("control_mode"))
            except Exception:
                pass
        if "action" in payload:
            try:
                lowlevel_rx_state["action"] = int(payload.get("action"))
            except Exception:
                pass
        if "behavior" in payload:
            value = payload.get("behavior")
            lowlevel_rx_state["behavior"] = str(value).strip().lower() if value is not None else None
        if "diagnostics_bitfield" in payload:
            try:
                lowlevel_rx_state["diagnostics_bitfield"] = int(payload.get("diagnostics_bitfield"))
            except Exception:
                pass
        if "se2twist_des" in payload and isinstance(payload.get("se2twist_des"), dict):
            in_twist = payload.get("se2twist_des") or {}
            lowlevel_rx_state["se2twist_des"] = {
                "vx": float(in_twist.get("vx", 0.0)),
                "vy": float(in_twist.get("vy", 0.0)),
                "wz": float(in_twist.get("wz", 0.0)),
            }
        if "imu_angular_velocity" in payload and isinstance(payload.get("imu_angular_velocity"), dict):
            in_imu_w = payload.get("imu_angular_velocity") or {}
            lowlevel_rx_state["imu_angular_velocity"] = {
                "x": float(in_imu_w.get("x", 0.0)),
                "y": float(in_imu_w.get("y", 0.0)),
                "z": float(in_imu_w.get("z", 0.0)),
            }
        if "imu_linear_acceleration" in payload and isinstance(payload.get("imu_linear_acceleration"), dict):
            in_imu_a = payload.get("imu_linear_acceleration") or {}
            lowlevel_rx_state["imu_linear_acceleration"] = {
                "x": float(in_imu_a.get("x", 0.0)),
                "y": float(in_imu_a.get("y", 0.0)),
                "z": float(in_imu_a.get("z", 0.0)),
            }
        if "twist_linear" in payload and isinstance(payload.get("twist_linear"), dict):
            in_twist_lin = payload.get("twist_linear") or {}
            lowlevel_rx_state["twist_linear"] = {
                "x": float(in_twist_lin.get("x", 0.0)),
                "y": float(in_twist_lin.get("y", 0.0)),
                "z": float(in_twist_lin.get("z", 0.0)),
            }
        if "voltage" in payload:
            v = payload.get("voltage")
            if isinstance(v, dict):
                raw = v.get("raw")
                parsed = v.get("parsed")
                lowlevel_rx_state["voltage"] = {
                    "raw": str(raw) if raw is not None else "",
                    "parsed": _as_float_list(parsed if isinstance(parsed, list) else []),
                }
            elif isinstance(v, list):
                lowlevel_rx_state["voltage"] = {
                    "raw": ",".join(str(x) for x in v),
                    "parsed": _as_float_list(v),
                }
            else:
                lowlevel_rx_state["voltage"] = {
                    "raw": str(v),
                    "parsed": _extract_battery_voltages(v),
                }
        lowlevel_rx_state["updated_at"] = time.time()

def _mission_now() -> float:
    return time.time()

def _mission_snapshot():
    with mission_lock:
        return {
            "queue": list(mission_state.get("queue", [])),
            "active_goal": dict(mission_state["active_goal"]) if isinstance(mission_state.get("active_goal"), dict) else None,
            "history": list(mission_state.get("history", [])),
            "status": mission_state.get("status", "idle"),
            "auto_start": bool(mission_state.get("auto_start", False)),
            "updated_at": float(mission_state.get("updated_at", 0.0) or 0.0),
        }

def _set_localization_state(**kwargs):
    with command_mutex:
        for key, value in kwargs.items():
            if key in localization_state:
                localization_state[key] = value
        localization_state["updated_at"] = time.time()

def _localization_snapshot():
    with command_mutex:
        return dict(localization_state)

def _append_mission_history(item: dict):
    mission_state["history"].append(item)
    if len(mission_state["history"]) > 50:
        mission_state["history"] = mission_state["history"][-50:]

def _set_ghost_state(section: str, **kwargs):
    with command_mutex:
        state = ghost_state.get(section)
        if isinstance(state, dict):
            state.update(kwargs)

def _ghost_snapshot():
    with command_mutex:
        return json.loads(json.dumps(ghost_state))

def _safe_stat(path: Path):
    try:
        return path.stat()
    except Exception:
        return None

def _preview_name_for_pcd(pcd_name: str):
    stem = Path(pcd_name).stem
    return f"{stem}.png"

def _list_saved_maps(limit: int = 8):
    if not MAPS_DIR.exists():
        return []
    records = []
    for pcd_path in sorted(MAPS_DIR.glob("*.pcd"), key=lambda p: p.stat().st_mtime, reverse=True):
        stat = _safe_stat(pcd_path)
        if stat is None:
            continue
        preview_path = MAPS_DIR / _preview_name_for_pcd(pcd_path.name)
        preview_stat = _safe_stat(preview_path)
        records.append({
            "name": pcd_path.name,
            "size_bytes": int(stat.st_size),
            "updated_at": float(stat.st_mtime),
            "preview": preview_path.name if preview_stat else None,
            "preview_size_bytes": int(preview_stat.st_size) if preview_stat else None,
            "is_latest": pcd_path.name == "Latest.pcd",
        })
        if len(records) >= limit:
            break
    return records

def _latest_preview_candidates(limit: int = 6):
    if not MAPS_DIR.exists():
        return []
    pngs = []
    for png_path in sorted(MAPS_DIR.glob("*.png"), key=lambda p: p.stat().st_mtime, reverse=True):
        stat = _safe_stat(png_path)
        if stat is None:
            continue
        pngs.append({
            "name": png_path.name,
            "size_bytes": int(stat.st_size),
            "updated_at": float(stat.st_mtime),
        })
        if len(pngs) >= limit:
            break
    return pngs

def _pointcloud_metrics_payload():
    point_count = len(latest_pointcloud) if isinstance(latest_pointcloud, list) else 0
    obst_count = len(latest_obstmap) if isinstance(latest_obstmap, list) else 0
    maps = _list_saved_maps(limit=8)
    latest_map = maps[0] if maps else None
    now = time.time()
    return {
        "pointcloud_points": point_count,
        "obstacle_points": obst_count,
        "pointcloud_age_s": round(max(0.0, now - latest_pointcloud_at), 2) if latest_pointcloud_at else None,
        "obstacle_age_s": round(max(0.0, now - latest_obstmap_at), 2) if latest_obstmap_at else None,
        "preview_count": len([m for m in maps if m.get("preview")]),
        "latest_map": latest_map,
        "map_directory": str(MAPS_DIR),
    }

def _normalize_waypoint(raw: dict, index: int):
    frame_id = str(raw.get("frame_id", "map")).strip() or "map"
    return {
        "id": str(raw.get("id", f"wp-{index + 1}")),
        "x": float(raw["x"]),
        "y": float(raw["y"]),
        "yaw": float(raw.get("yaw", 0.0)),
        "frame_id": frame_id,
        "label": str(raw.get("label", f"Waypoint {index + 1}")),
        "timeout_s": max(1.0, float(raw.get("timeout_s", 90.0))),
        "created_at": _mission_now(),
    }

def _dispatch_mission_goal(goal: dict):
    ros2_node.publish_local_xy_goal(
        goal["x"],
        goal["y"],
        goal.get("yaw", 0.0),
        frame_id=goal.get("frame_id", "map"),
        ensure_mode=True,
        set_walk=True,
    )

def _mission_worker():
    while True:
        time.sleep(0.2)
        timed_out_goal = None
        next_goal = None
        with mission_lock:
            active_goal = mission_state.get("active_goal")
            if isinstance(active_goal, dict):
                started_at = float(active_goal.get("started_at", 0.0) or 0.0)
                timeout_s = float(active_goal.get("timeout_s", 0.0) or 0.0)
                if timeout_s > 0 and started_at > 0 and (_mission_now() - started_at) > timeout_s:
                    timed_out_goal = dict(active_goal)
                    timed_out_goal["result"] = "timeout"
                    timed_out_goal["finished_at"] = _mission_now()
                    mission_state["active_goal"] = None
                    mission_state["status"] = "paused"
                    _append_mission_history(timed_out_goal)
                    mission_state["updated_at"] = _mission_now()
            if mission_state.get("status") == "running" and mission_state.get("active_goal") is None and mission_state.get("queue"):
                next_goal = dict(mission_state["queue"].pop(0))
                next_goal["started_at"] = _mission_now()
                next_goal["result"] = "running"
                mission_state["active_goal"] = next_goal
                mission_state["updated_at"] = _mission_now()
        if next_goal is not None:
            try:
                _dispatch_mission_goal(next_goal)
            except Exception as exc:
                with mission_lock:
                    failed = dict(next_goal)
                    failed["result"] = "dispatch_error"
                    failed["error"] = str(exc)
                    failed["finished_at"] = _mission_now()
                    mission_state["active_goal"] = None
                    mission_state["status"] = "paused"
                    _append_mission_history(failed)
                    mission_state["updated_at"] = _mission_now()
        if timed_out_goal is not None:
            print(f"[MISSION] Goal timed out: {timed_out_goal.get('id')}")

# Mutex lock to prevent race conditions on shared robot state
command_mutex = threading.Lock()
mission_lock = threading.Lock()

# Keyboard controller state (ghost input)
keyboard_lock = threading.Lock()
KEYBOARD_IDLE_S = 0.5

KEYBOARD_PROFILES = {
    "wasd": {
        "forward": {"KeyW"},
        "backward": {"KeyS"},
        "strafe_left": {"KeyA"},
        "strafe_right": {"KeyD"},
        "turn_left": {"KeyQ"},
        "turn_right": {"KeyE"},
        "stop": {"Space", "KeyX"},
    },
    "arrows": {
        "forward": {"ArrowUp"},
        "backward": {"ArrowDown"},
        "turn_left": {"ArrowLeft"},
        "turn_right": {"ArrowRight"},
        "strafe_left": {"Comma"},
        "strafe_right": {"Period"},
        "stop": {"Slash", "Space"},
    },
    "ijkl": {
        "forward": {"KeyI"},
        "backward": {"KeyK"},
        "turn_left": {"KeyJ"},
        "turn_right": {"KeyL"},
        "strafe_left": {"KeyU"},
        "strafe_right": {"KeyO"},
        "stop": {"KeyM", "Space"},
    },
    "numpad": {
        "forward": {"Numpad8"},
        "backward": {"Numpad2"},
        "turn_left": {"Numpad4"},
        "turn_right": {"Numpad6"},
        "strafe_left": {"Numpad7"},
        "strafe_right": {"Numpad9"},
        "stop": {"Numpad5", "Numpad0"},
    },
}

keyboard_state = {
    "enabled": False,
    "profile": "wasd",
    "speed": 0.6,
    "strafe_speed": 0.6,
    "turn_speed": 1.0,
    "turbo": 1.6,
    "hold": True,
    "pressed": set(),
    "last_event": 0.0,
    "last_cmd": (None, None, None),
}

def _normalize_key(code: str, key: str) -> str:
    if code:
        return str(code)
    if key:
        raw = str(key)
        key_map = {
            "w": "KeyW",
            "a": "KeyA",
            "s": "KeyS",
            "d": "KeyD",
            "q": "KeyQ",
            "e": "KeyE",
            "i": "KeyI",
            "j": "KeyJ",
            "k": "KeyK",
            "l": "KeyL",
            "u": "KeyU",
            "o": "KeyO",
            "m": "KeyM",
            ",": "Comma",
            ".": "Period",
            "/": "Slash",
            " ": "Space",
            "spacebar": "Space",
            "arrowup": "ArrowUp",
            "arrowdown": "ArrowDown",
            "arrowleft": "ArrowLeft",
            "arrowright": "ArrowRight",
        }
        lowered = raw.lower()
        return key_map.get(lowered, raw)
    return ""

def _keyboard_compute(profile_name: str, pressed: set, cfg: dict):
    profile = KEYBOARD_PROFILES.get(profile_name, KEYBOARD_PROFILES["wasd"])
    fwd = any(k in pressed for k in profile.get("forward", set()))
    back = any(k in pressed for k in profile.get("backward", set()))
    left = any(k in pressed for k in profile.get("strafe_left", set()))
    right = any(k in pressed for k in profile.get("strafe_right", set()))
    tl = any(k in pressed for k in profile.get("turn_left", set()))
    tr = any(k in pressed for k in profile.get("turn_right", set()))
    stop = any(k in pressed for k in profile.get("stop", set()))

    if stop:
        return 0.0, 0.0, 0.0, True

    speed = float(cfg.get("speed", 0.6))
    strafe_speed = float(cfg.get("strafe_speed", speed))
    turn_speed = float(cfg.get("turn_speed", 1.0))
    turbo = float(cfg.get("turbo", 1.6))

    if "ShiftLeft" in pressed or "ShiftRight" in pressed:
        speed *= turbo
        strafe_speed *= turbo
        turn_speed *= turbo

    vx = (speed if fwd else 0.0) + (-speed if back else 0.0)
    vy = (strafe_speed if left else 0.0) + (-strafe_speed if right else 0.0)
    wz = (turn_speed if tl else 0.0) + (-turn_speed if tr else 0.0)
    return vx, vy, wz, False

# QoS profile 
from rclpy.qos import QoSProfile, QoSReliabilityPolicy, QoSHistoryPolicy
low_latency_qos = QoSProfile(
    reliability=QoSReliabilityPolicy.RELIABLE,
    history=QoSHistoryPolicy.KEEP_LAST,
    depth=1,
)
# then pass low_latency_qos instead of 10 when creating the subscriptions



# ----------------------------- ROS2 Node Class -----------------------------------

latest_obstmap = []
latest_pointcloud = []  #  required by /pointcloud and compressed route

# Hilbert compressor instance (used by the compressed endpoints)
pc_compressor = PointCloudCompressor(hilbert_order=3)

def _points_dicts_to_np(points_dict_list):
    """
    Convert [{'x','y','z',...}, ...] -> Nx3 float32 array.
    """
    if not points_dict_list:
        return np.zeros((0, 3), dtype=np.float32)
    arr = np.fromiter(
        (coord for p in points_dict_list for coord in (p["x"], p["y"], p["z"])),
        dtype=np.float32
    )
    return arr.reshape(-1, 3)



class ObstacleMapListener(Node):
    def __init__(self):
        super().__init__('obstacle_map_listener')
        self.points_compressor = PointCloudCompressor(hilbert_order=3)
        self.subscription = self.create_subscription(
            PointCloud2,
            '/mcu/state/obstmap',
            self.callback,
            low_latency_qos
        )
    def callback(self, msg):
        global latest_obstmap, latest_obstmap_at
        try:
            pts = []
            for x, y, z in pc2.read_points(msg, skip_nans=True, field_names=("x", "y", "z")):
                pts.append([float(x), float(y), float(z)])

            if not pts:
                latest_obstmap = []
                return

            arr = np.asarray(pts, dtype=np.float32)
            cols = np.full((arr.shape[0], 3), [255, 100, 100], dtype=np.uint8)

            # Optional: run compressor (for logging/metrics)
            _ = self.points_compressor.compress_point_cloud(arr, cols)

            latest_obstmap = [
                {"x": float(p[0]), "y": float(p[1]), "z": float(p[2]), "r": 255, "g": 100, "b": 100}
                for p in arr
            ]
            latest_obstmap_at = time.time()
            self.get_logger().info(f"ObstMap points: {len(latest_obstmap)}")
        except Exception as e:
            self.get_logger().error(f"ObstacleMapListener error: {e}")
            


class PointCloudListener(Node):
    def __init__(self):
        super().__init__('pointcloud_listener')
        self.subscription = self.create_subscription(PointCloud2, '/mcu/state/pointcloud', self.callback, low_latency_qos)
        self.points_compressor = PointCloudCompressor(hilbert_order=3)


    def callback(self, msg):
        global latest_pointcloud, latest_pointcloud_at
        try:
            pts = []
            for x, y, z in pc2.read_points(msg, skip_nans=True, field_names=("x", "y", "z")):
                pts.append([float(x), float(y), float(z)])

            if not pts:
                latest_pointcloud = []
                return

            # Build arrays once
            arr = np.asarray(pts, dtype=np.float32)  # (N, 3)
            cols = np.full((arr.shape[0], 3), [100, 255, 100], dtype=np.uint8)

            # Optional: run compressor (for logging/metrics); response served by compressed endpoints
            _ = self.points_compressor.compress_point_cloud(arr, cols)

            # Store RAW points for /pointcloud
            
            latest_pointcloud = [
                {"x": float(p[0]), "y": float(p[1]), "z": float(p[2]), "r": 100, "g": 255, "b": 100}
                for p in arr
            ]
            latest_pointcloud_at = time.time()
            self.get_logger().info(f"PointCloud points: {len(latest_pointcloud)}")
        except Exception as e:
            self.get_logger().error(f"PointCloudListener error: {e}")


class RobotCommandPublisher(Node):


        # ---------- Control-mode & planner helpers ----------

    def _set_control_mode(self, mode: int, sleep_s: float = 0.1):
        msg = UInt32(); msg.data = mode
        self.control_mode_pub.publish(msg)
        _set_lowlevel_state(control_mode=int(mode))
        if sleep_s > 0:
            time.sleep(sleep_s)

    @staticmethod
    def _yaw_to_quat(yaw_rad: float):
        half = 0.5 * yaw_rad
        return (0.0, 0.0, sin(half), cos(half))  # (x,y,z,w)

    def publish_mpc_goal(self, vx: float, vy: float, wz: float,
                         ensure_mode: bool = True, set_walk: bool = True, hold: bool = True):
        """Publish Twist to /mpc/goal (control_mode=160)."""
        if ensure_mode:
            self._set_control_mode(PLANNER_MPC)
        if set_walk:
            amsg = UInt32(); amsg.data = ACTION_WALK
            self.action_pub.publish(amsg)
            _set_lowlevel_state(action=int(ACTION_WALK), behavior="walk")

        tw = Twist()
        tw.linear.x = vx; tw.linear.y = vy; tw.linear.z = 0.0
        tw.angular.x = 0.0; tw.angular.y = 0.0; tw.angular.z = wz
        self.mpc_goal_pub.publish(tw)
        _set_lowlevel_state(last_twist={"vx": float(vx), "vy": float(vy), "wz": float(wz)})
        print(f"[MPC] /mpc/goal -> vx={vx:.3f} vy={vy:.3f} wz={wz:.3f}")

        # store for 10Hz hold (some MPC stacks require continuous setpoints)
        self._last_mpc_twist = tw
        self._mpc_hold_enabled = bool(hold)

    def publish_local_xy_goal(self, x: float, y: float, yaw: float = 0.0,
                              frame_id: str = "map", ensure_mode: bool = True, set_walk: bool = True):
        """Publish PoseStamped to /move_base_simple/goal (control_mode=140)."""
        if ensure_mode:
            self._set_control_mode(PLANNER_LOCAL)
        if set_walk:
            amsg = UInt32(); amsg.data = ACTION_WALK
            self.action_pub.publish(amsg)
            _set_lowlevel_state(action=int(ACTION_WALK), behavior="walk")

        p = PoseStamped()
        p.header.frame_id = frame_id
        p.header.stamp = self.get_clock().now().to_msg()
        p.pose.position.x = x; p.pose.position.y = y; p.pose.position.z = 0.0
        qx, qy, qz, qw = self._yaw_to_quat(yaw)
        p.pose.orientation.x = qx; p.pose.orientation.y = qy
        p.pose.orientation.z = qz; p.pose.orientation.w = qw

        self.goal_pub.publish(p)
        print(f"[LOCAL] /move_base_simple/goal -> frame={frame_id} x={x:.2f} y={y:.2f} yaw={yaw:.2f}rad")

    # ---------- MPC 10Hz re-publisher (optional but recommended) ----------
    _mpc_hold_enabled: bool = False
    _last_mpc_twist: Twist = None

    def _mpc_hold_tick(self):
        if self._mpc_hold_enabled and self._last_mpc_twist is not None:
            self.mpc_goal_pub.publish(self._last_mpc_twist)

    def stop_mpc(self):
        """Stop MPC hold and publish a zero twist."""
        self._mpc_hold_enabled = False
        self._last_mpc_twist = None
        tw = Twist()
        tw.linear.x = 0.0
        tw.linear.y = 0.0
        tw.linear.z = 0.0
        tw.angular.x = 0.0
        tw.angular.y = 0.0
        tw.angular.z = 0.0
        self.mpc_goal_pub.publish(tw)
        _set_lowlevel_state(last_twist={"vx": 0.0, "vy": 0.0, "wz": 0.0})


    """
    ROS2 Node that handles publishing robot control commands and subscribing
    to robot telemetry (status, GPS, IMU, etc.)
    """
    def __init__(self):
        super().__init__('flask_ros2_server')

        # Publishers for controlling robot
        self.manual_twist_pub = self.create_publisher(Twist, '/mcu/command/manual_twist', 10)
        self.control_mode_pub = self.create_publisher(UInt32, '/command/setControlMode', 10)
        self.action_pub = self.create_publisher(UInt32, '/command/setAction', 10)
        self.vision_pub = self.create_publisher(UInt32, '/command/setVisionMode', 10)
        self.pose_pub = self.create_publisher(Pose, '/mcu/command/pose', 10)
        self.estop_pub = self.create_publisher(UInt32, '/command/setEStop', 10)
        self.rollover_pub = self.create_publisher(UInt32, '/command/setRollOver', 10)
        self.run_pub = self.create_publisher(UInt32, '/command/setRun', 10)
        self.gait_pub = self.create_publisher(UInt32, '/command/setGait', 10)
        self.goal_pub = self.create_publisher(PoseStamped, '/move_base_simple/goal', 10)
        self.mpc_goal_pub = self.create_publisher(Twist, '/mpc/goal', 10)
        self.initialpose_pub = self.create_publisher(PoseWithCovarianceStamped, '/initialpose', 10)
        self.run_mission_pub = self.create_publisher(String, '/mm/run_mission', 10)
        self.start_mission_pub = self.create_publisher(UInt32, '/command/start_mission', 10)
        self.pause_mission_pub = self.create_publisher(UInt32, '/command/pause_mission', 10)
        self.unpause_mission_pub = self.create_publisher(UInt32, '/command/unpause_mission', 10)
        self.cancel_mission_pub = self.create_publisher(UInt32, '/command/cancel_mission', 10)
        self._mpc_hold_enabled = False
        self._last_mpc_twist = None
        self.empty_clients = {}
        self.save_map_client = None

        if Empty is not None:
            for service_name in (
                '/activate_lio',
                '/deactivate_lio',
                '/restart_lio',
                '/activate_relocalization',
                '/deactivate_relocalization',
                '/restart_relocalization',
                '/activate_apriltag_ros',
                '/deactivate_apriltag_ros',
                '/restart_apriltag_ros',
                '/activate_planner',
                '/activate_mpc_lio',
                '/activate_mpc_lio_obs',
                '/activate_obs_avoid_lio',
            ):
                self.empty_clients[service_name] = self.create_client(Empty, service_name)
        if SaveMap is not None:
            self.save_map_client = self.create_client(SaveMap, '/lio_sam/save_map')

        # keep MPC setpoints alive at 10Hz
        self.create_timer(0.1, self._mpc_hold_tick)

        # Subscriptions to robot state feedback
        self.create_subscription(String, '/mcu/state/robotVersion', self.ghost_status_callback, 10)
        self.create_subscription(String, '/mcu/state/battery', self.ghost_battery_callback, 10)
        self.create_subscription(Imu, '/gx5/imu/data', self.ghost_imu_callback, 10)
        self.create_subscription(NavSatFix, '/gx5/gnss1/fix', self.ghost_gps_callback, 10)
        self.create_subscription(Odometry, '/gx5/nav/odom', self.odom_callback, 10)
        self.create_subscription(String, '/lio_sam/relocalization/status', self.relocalization_status_callback, 10)
        self.create_subscription(String, '/obstacle_map/status', self.obstacle_status_callback, 10)
        self.create_subscription(UInt32, '/mpc/current_path_index', self.current_path_index_callback, 10)

        # CV Bridge for image conversion if needed later
        self.bridge = CvBridge()
        self.latest_frames = {}  # Store latest camera frames (future use)

    # ---------------------- Callback Methods for ROS Subscriptions --------------------



    def send_planner_goal(self, linear_x=0.6, linear_y=0.0, angular_z=0.0):
        """
        send a Twist message to /mpc/goal in control_mode=160.
        """
        msg = Twist()
        msg.linear.x = linear_x
        msg.linear.y = linear_y
        msg.angular.z = angular_z
        self.mpc_goal_pub.publish(msg)
        print(f"Publishes to /mpc/goal: linear({linear_x}, {linear_y}), angular_z={angular_z}")
    
    
    def ghost_status_callback(self, msg):
        # Update robot version/status
        with command_mutex:
            robot_status['ghost'] = msg.data

    def ghost_battery_callback(self, msg):
        # Update battery status
        with command_mutex:
            robot_battery['ghost'] = msg.data

    def ghost_imu_callback(self, msg):
        # Update IMU orientation data
        with command_mutex:
            robot_imu['ghost'] = {
                'orientation': {
                    'x': msg.orientation.x,
                    'y': msg.orientation.y,
                    'z': msg.orientation.z,
                    'w': msg.orientation.w
                },
                'angular_velocity': {
                    'x': msg.angular_velocity.x,
                    'y': msg.angular_velocity.y,
                    'z': msg.angular_velocity.z
                },
                'linear_acceleration': {
                    'x': msg.linear_acceleration.x,
                    'y': msg.linear_acceleration.y,
                    'z': msg.linear_acceleration.z
                }
            }

    def ghost_gps_callback(self, msg):
        if msg.status.status < 0:
            self.get_logger().warn("no valid GPS fix from gx5/gnss1/fix")
            return
        # Update GPS coordinates
        with command_mutex:
            robot_gps['ghost'] = {'latitude': msg.latitude, 'longitude': msg.longitude}
            print(f"Updated GPS: Lat {msg.latitude}, Lng {msg.longitude}")

    def odom_callback(self, msg):
        with command_mutex:
            robot_odometry['ghost'] = {
                'position': {
                    'x': msg.pose.pose.position.x,
                    'y': msg.pose.pose.position.y,
                    'z': msg.pose.pose.position.z
                },
                'orientation': {
                    'x': msg.pose.pose.orientation.x,
                    'y': msg.pose.pose.orientation.y,
                    'z': msg.pose.pose.orientation.z,
                    'w': msg.pose.pose.orientation.w
                },
                'twist': {
                    'linear': {
                        'x': msg.twist.twist.linear.x,
                        'y': msg.twist.twist.linear.y,
                        'z': msg.twist.twist.linear.z
                    },
                    'angular': {
                        'x': msg.twist.twist.angular.x,
                        'y': msg.twist.twist.angular.y,
                        'z': msg.twist.twist.angular.z
                    }
                }
            }

    def relocalization_status_callback(self, msg):
        text = str(msg.data).strip() or "unknown"
        odom_source = "lidar_relocalized" if "relocal" in text.lower() else ghost_state["lidar"].get("odom_source", "gps")
        _set_ghost_state("lidar", relocalization_status=text, odom_source=odom_source)

    def obstacle_status_callback(self, msg):
        _set_ghost_state("lidar", obstacle_status=str(msg.data).strip() or "unknown")

    def current_path_index_callback(self, msg):
        _set_ghost_state("planner", current_path_index=int(msg.data))

    # ---------------------- Action/Command Methods -----------------------------------
    def send_goal_pose(self, lat, lng, z=0.0):
        """
        Send a goal pose to the robot for navigation.
        """

        utm_crs = CRS.from_user_input(f"+proj=utm +zone={(int((lng + 180) / 6) +1)} +datum=WGS84 +units=m +no_defs")
        transformer = Transformer.from_crs("epsg:4326", utm_crs, always_xy=True)
        utm_x, utm_y = transformer.transform(lng, lat)

        msg = PoseStamped()
        msg.header.frame_id = "utm_local_frame"
        msg.header.stamp = self.get_clock().now().to_msg()
        msg.pose.position.x = utm_x
        msg.pose.position.y = utm_y
        msg.pose.position.z = z
        msg.pose.orientation.w = 1.0 # Default orientation (facing forward)
        self.goal_pub.publish(msg)
        print("Publishing PoseStamped to /move_base_simple/goal...")

    def publish_initial_pose(self, x: float, y: float, yaw: float = 0.0, frame_id: str = "map",
                             covariance_xy: float = 0.25, covariance_yaw: float = 0.2):
        msg = PoseWithCovarianceStamped()
        msg.header.frame_id = frame_id
        msg.header.stamp = self.get_clock().now().to_msg()
        msg.pose.pose.position.x = float(x)
        msg.pose.pose.position.y = float(y)
        msg.pose.pose.position.z = 0.0
        qx, qy, qz, qw = self._yaw_to_quat(float(yaw))
        msg.pose.pose.orientation.x = qx
        msg.pose.pose.orientation.y = qy
        msg.pose.pose.orientation.z = qz
        msg.pose.pose.orientation.w = qw
        cov = [0.0] * 36
        cov[0] = max(1e-6, float(covariance_xy))
        cov[7] = max(1e-6, float(covariance_xy))
        cov[35] = max(1e-6, float(covariance_yaw))
        msg.pose.covariance = cov
        self.initialpose_pub.publish(msg)
        print(f"[LOCALIZATION] /initialpose -> frame={frame_id} x={x:.2f} y={y:.2f} yaw={yaw:.2f}rad")

    def _publish_mission_control(self, publisher, value: int, label: str):
        publisher.publish(UInt32(data=int(value)))
        _set_ghost_state(
            "mission",
            last_command=label,
            last_command_at=time.time(),
            status_text=label,
        )

    def run_named_mission(self, mission_path: str):
        msg = String()
        msg.data = str(mission_path)
        self.run_mission_pub.publish(msg)
        _set_ghost_state(
            "mission",
            requested=mission_path,
            active_script=mission_path,
            last_command="run_mission",
            last_command_at=time.time(),
            status_text=f"requested:{mission_path}",
        )

    def start_mission(self):
        self._publish_mission_control(self.start_mission_pub, 1, "start")

    def pause_mission(self):
        self._publish_mission_control(self.pause_mission_pub, 1, "pause")

    def unpause_mission(self):
        self._publish_mission_control(self.unpause_mission_pub, 1, "unpause")

    def cancel_mission(self):
        self._publish_mission_control(self.cancel_mission_pub, 1, "cancel")

    def call_empty_service(self, service_name: str, timeout_s: float = 1.5):
        client = self.empty_clients.get(service_name)
        if client is None:
            raise RuntimeError(f"service client unavailable: {service_name}")
        if not client.wait_for_service(timeout_sec=float(timeout_s)):
            raise RuntimeError(f"service not available: {service_name}")
        req = Empty.Request()
        future = client.call_async(req)
        deadline = time.time() + max(0.5, float(timeout_s))
        while time.time() < deadline:
            if future.done():
                future.result()
                return True
            time.sleep(0.05)
        raise RuntimeError(f"service call timed out: {service_name}")

    def save_lio_map(self, destination: str = "", resolution: float = -30.0, timeout_s: float = 4.0):
        if self.save_map_client is None:
            raise RuntimeError("save_map service client unavailable")
        if not self.save_map_client.wait_for_service(timeout_sec=float(timeout_s)):
            raise RuntimeError("save_map service unavailable")
        req = SaveMap.Request()
        req.resolution = float(resolution)
        req.destination = str(destination)
        future = self.save_map_client.call_async(req)
        deadline = time.time() + max(1.0, float(timeout_s))
        while time.time() < deadline:
            if future.done():
                response = future.result()
                success = bool(getattr(response, "success", False))
                target = destination or "default"
                _set_ghost_state(
                    "lidar",
                    last_map_save={
                        "destination": target,
                        "resolution": float(resolution),
                        "success": success,
                    },
                    last_map_save_at=time.time(),
                )
                return {"success": success, "destination": target, "resolution": float(resolution)}
            time.sleep(0.05)
        raise RuntimeError("save_map call timed out")



    def enable_vision_obstacle_avoidance(self):
        # Switch robot to vision-based obstacle avoidance mode
        msg = UInt32()
        msg.data = 2  # 2 = vision-based mode
        self.vision_pub.publish(msg)
        print("Vision-based obstacle avoidance mode enabled.")
        
    def camera_callback(self, msg, camera_name):
        # Convert ROS Image to OpenCV format
        cv_image = self.bridge.imgmsg_to_cv2(msg, desired_encoding="bgr8")
        # Save one image (front_left) to disk for local debugging
        if camera_name == 'front_left':
            cv2.imwrite("/home/ghost/output.jpg", cv_image)
        # Encode image for web-based video streaming
        _, buffer = cv2.imencode('.jpg', cv_image)
        self.latest_frames[camera_name] = buffer.tobytes()

    def move_robot_duration(self, linear_x, angular_z, duration, linear_y=0.0):
        # Move robot by continuously sending Twist commands over a duration
        print(f"Moving robot for {duration}s at linear_x={linear_x}, linear_y={linear_y}, angular_z={angular_z}")
        twist = Twist()
        twist.linear.x = linear_x
        twist.linear.y = linear_y
        twist.angular.z = angular_z
        end_time = time.time() + duration

        while time.time() < end_time:
            self.manual_twist_pub.publish(twist)
            _set_lowlevel_state(last_twist={"vx": float(linear_x), "vy": float(linear_y), "wz": float(angular_z)})
            time.sleep(0.1)

        # Stop robot after movement
        twist.linear.x = 0.0
        twist.linear.y = 0.0
        twist.angular.z = 0.0
        self.manual_twist_pub.publish(twist)
        _set_lowlevel_state(last_twist={"vx": 0.0, "vy": 0.0, "wz": 0.0})
        print("Movement stopped.")
    
# Compression helper
def _compress_points(points_list, compressor):
    if not points_list:
        return {"status": "waiting", "compressed_data": None}

    pts = np.array([[p["x"], p["y"], p["z"]] for p in points_list], dtype=np.float32)
    cols = np.array([[p["r"], p["g"], p["b"]] for p in points_list], dtype=np.uint8)
    blob = compressor.compress_point_cloud(pts, cols)  # returns pure-Python lists
    return {"status": "ok", "compressed_data": blob}

# ---------------------------- Initialize ROS2 ------------------------------------

# 1. Initialize ROS once
rclpy.init()

# 2. Start your main command/control node
ros2_node = RobotCommandPublisher()

# 3. Create listener nodes
obst_node = ObstacleMapListener()
pc_node = PointCloudListener()


# 4. Use a shared executor

executor = MultiThreadedExecutor()
executor.add_node(ros2_node)
executor.add_node(obst_node)
executor.add_node(pc_node)

# 5. Run executor in background
threading.Thread(target=executor.spin, daemon=True).start()
threading.Thread(target=_mission_worker, daemon=True).start()

def _keyboard_apply(snapshot: dict):
    if not snapshot.get("enabled"):
        return
    vx, vy, wz, force_stop = _keyboard_compute(
        snapshot.get("profile", "wasd"),
        snapshot.get("pressed", set()),
        snapshot,
    )

    last_cmd = snapshot.get("last_cmd") or (None, None, None)
    new_cmd = (vx, vy, wz)

    if force_stop or (vx == 0.0 and vy == 0.0 and wz == 0.0):
        ros2_node.stop_mpc()
        new_cmd = (0.0, 0.0, 0.0)
    elif new_cmd != last_cmd:
        ros2_node.publish_mpc_goal(vx, vy, wz, ensure_mode=True, set_walk=True, hold=bool(snapshot.get("hold", True)))

    with keyboard_lock:
        keyboard_state["last_cmd"] = new_cmd

def _keyboard_watchdog():
    while True:
        time.sleep(0.1)
        snapshot = None
        now = time.time()
        with keyboard_lock:
            if not keyboard_state.get("enabled"):
                continue
            if (now - keyboard_state.get("last_event", 0.0)) > KEYBOARD_IDLE_S:
                keyboard_state["pressed"].clear()
                snapshot = dict(keyboard_state)
        if snapshot:
            _keyboard_apply(snapshot)

threading.Thread(target=_keyboard_watchdog, daemon=True).start()
# --------------------------- Flask API Endpoints ---------------------------------

@app.route('/mpc/goal', methods=['POST'])
def http_mpc_goal():
    """
    Body:
    {
      "vx": 0.6,   # m/s
      "vy": 0.0,   # m/s
      "wz": 0.0,   # rad/s
      "hold": true # optional; keep re-publishing at 10Hz (default true)
    }
    """
    try:
        data = request.get_json(force=True, silent=True) or {}
        vx = float(data.get('vx', 0.6))
        vy = float(data.get('vy', 0.0))
        wz = float(data.get('wz', 0.0))
        hold = bool(data.get('hold', True))

        # safety clamps (tune as needed)
        vx = max(min(vx, 1.5), -1.5)
        vy = max(min(vy, 1.0), -1.0)
        wz = max(min(wz, 2.0), -2.0)

        ros2_node.publish_mpc_goal(vx, vy, wz, ensure_mode=True, set_walk=True, hold=hold)
        speak("M P C goal set")
        return jsonify({"status": "success", "mode": PLANNER_MPC, "vx": vx, "vy": vy, "wz": wz, "hold": hold}), 200
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500

@app.route('/keyboard/enable', methods=['POST'])
def keyboard_enable():
    data = request.get_json(force=True, silent=True) or {}
    profile = data.get("profile", "wasd")
    if profile not in KEYBOARD_PROFILES:
        profile = "wasd"

    with keyboard_lock:
        keyboard_state["enabled"] = True
        keyboard_state["profile"] = profile
        keyboard_state["speed"] = max(0.0, float(data.get("speed", keyboard_state["speed"])))
        keyboard_state["strafe_speed"] = max(0.0, float(data.get("strafe_speed", keyboard_state["strafe_speed"])))
        keyboard_state["turn_speed"] = max(0.0, float(data.get("turn_speed", keyboard_state["turn_speed"])))
        keyboard_state["turbo"] = max(1.0, float(data.get("turbo", keyboard_state["turbo"])))
        keyboard_state["hold"] = bool(data.get("hold", keyboard_state["hold"]))
        keyboard_state["pressed"].clear()
        keyboard_state["last_event"] = time.time()
        keyboard_state["last_cmd"] = (None, None, None)

    return jsonify({"status": "ok", "profile": profile, "enabled": True}), 200

@app.route('/keyboard/disable', methods=['POST'])
def keyboard_disable():
    with keyboard_lock:
        keyboard_state["enabled"] = False
        keyboard_state["pressed"].clear()
        keyboard_state["last_cmd"] = (None, None, None)
    ros2_node.stop_mpc()
    return jsonify({"status": "ok", "enabled": False}), 200

@app.route('/keyboard/event', methods=['POST'])
def keyboard_event():
    data = request.get_json(force=True, silent=True) or {}
    event_type = data.get("type", "down")
    code = _normalize_key(data.get("code"), data.get("key"))
    if not code:
        return jsonify({"status": "error", "message": "missing key code"}), 400

    snapshot = None
    with keyboard_lock:
        if not keyboard_state.get("enabled"):
            return jsonify({"status": "error", "message": "keyboard control disabled"}), 409

        if event_type == "down":
            keyboard_state["pressed"].add(code)
        elif event_type == "up":
            keyboard_state["pressed"].discard(code)
        else:
            return jsonify({"status": "error", "message": "invalid event type"}), 400

        keyboard_state["last_event"] = time.time()
        snapshot = dict(keyboard_state)

    _keyboard_apply(snapshot)
    return jsonify({"status": "ok", "pressed": len(snapshot.get("pressed", []))}), 200

@app.route('/keyboard/status', methods=['GET'])
def keyboard_status():
    with keyboard_lock:
        return jsonify({
            "enabled": keyboard_state["enabled"],
            "profile": keyboard_state["profile"],
            "speed": keyboard_state["speed"],
            "strafe_speed": keyboard_state["strafe_speed"],
            "turn_speed": keyboard_state["turn_speed"],
            "turbo": keyboard_state["turbo"],
            "pressed": sorted(list(keyboard_state["pressed"]))
        }), 200

@app.route('/command/send_local_goal', methods=['POST'])
def http_send_local_goal():
    """
    Body:
    {
      "x": 2.0,
      "y": 1.0,
      "yaw": 1.57,       # optional (rad), default 0
      "frame_id": "map"  # optional, default "map"
    }
    """
    try:
        data = request.get_json(force=True, silent=True) or {}
        x = float(data['x'])
        y = float(data['y'])
        yaw = float(data.get('yaw', 0.0))
        frame_id = data.get('frame_id', 'map')

        ros2_node.publish_local_xy_goal(x, y, yaw, frame_id=frame_id, ensure_mode=True, set_walk=True)
        speak("Local waypoint sent")
        return jsonify({"status": "success", "mode": PLANNER_LOCAL, "x": x, "y": y, "yaw": yaw, "frame_id": frame_id}), 200
    except KeyError as ke:
        return jsonify({'status': 'error', 'message': f"Missing field: {ke}"}), 400
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500


@app.route('/command', methods=['POST'])
def receive_command():
    """
    Main endpoint to receive movement, control mode, action, and mission commands.
    """
    try:
        data = request.get_json()
        topic = data.get('topic')
        params = data.get('command', {})

        if not topic:
            return jsonify({'status': 'error', 'message': 'Missing topic'}), 400

        # Handle movement commands
        if topic in ["/command/move_forward", "/command/move_backward", "/command/turn_left",
                     "/command/turn_right", "/command/move_left", "/command/move_right"]:
            twist = Twist()
            if topic == "/command/move_forward":
                twist.linear.x = 0.6
            elif topic == "/command/move_backward":
                twist.linear.x = -0.6
            #elif topic == "/command/move_left":
           #     twist.linear.y = -0.6
            #elif topic == "/command/move_right":
             #   twist.linear.y = 1.0
            elif topic == "/command/move_left":
                twist.linear.y = 0.6
            elif topic == "/command/move_right":
                twist.linear.y = -1.0
            elif topic == "/command/turn_left":
                twist.angular.z = 1.0
            elif topic == "/command/turn_right":
                twist.angular.z = -1.0

            # Default duration is 1 second if not specified
            duration = params.get('duration', 1)

            ros2_node.move_robot_duration(
                twist.linear.x if twist.linear.x else 0.0,
                twist.angular.z if twist.angular.z else 0.0,
                duration,
                linear_y=twist.linear.y if twist.linear.y else 0.0
            )
            
            # Robot speaks after executing movement 
            speak(f"Executing {topic.replace('/command/', '').replace('_', ' ')} for {duration} seconds")

            return jsonify({'status': 'success', 'message': f'{topic} executed for {duration} seconds'}), 200

        # Stop robot immediately
        elif topic == "/command/stop":
            ros2_node.move_robot_duration(0.0, 0.0, duration=1, linear_y=0.0)
            speak("Robot stopped") # speak for agent stopping
            return jsonify({'status': 'success', 'message': 'Robot stopped'}), 200

        # Set robot control mode to manual
        elif topic == "/command/setControlMode":
            msg = UInt32(data=140)
            ros2_node.control_mode_pub.publish(msg)
            _set_lowlevel_state(control_mode=140, behavior="manual")
            speak("Manual mode activated")  # speak for switch to manual mode
            return jsonify({'status': 'success', 'message': 'Manual Mode Activated'}), 200

        # Return robot to original mode
        elif topic == "/command/return_to_original_mode":
            msg = UInt32(data=180)
            ros2_node.control_mode_pub.publish(msg)
            _set_lowlevel_state(control_mode=180, behavior="original")
            speak("Original mode restored") # speak for original mode
            return jsonify({'status': 'success', 'message': 'Original Mode Restored'}), 200

        # Perform an action (sit, stand, walk)
        elif topic == "/command/setAction":
            action_map = {"walk": 2, "sit": 0, "stand": 1}
            action = params.get("action")
            if action in action_map:
                msg = UInt32(data=action_map[action])
                ros2_node.action_pub.publish(msg)
                _set_lowlevel_state(action=int(action_map[action]), behavior=str(action))
                speak(f"{action} mode activated")  # robot speaks
                return jsonify({'status': 'success', 'message': f'{action} mode activated'}), 200

        # Start or stop mission
        elif topic == "/command/setEStop":
            msg = UInt32(data=1) 
            ros2_node.estop_pub.publish(msg)
            return jsonify({'status': 'success', 'message': 'Emergency stop activated'}), 200
        
        elif topic == "/command/start_mission":
            msg = UInt32(data=1)
            ros2_node.action_pub.publish(msg)
            return jsonify({'status': 'success', 'message': 'Mission started'}), 200
        elif topic == "/command/stop_mission":
            msg = UInt32(data=0)
            ros2_node.action_pub.publish(msg)
            return jsonify({'status': 'success', 'message': 'Mission stopped'}), 200

        return jsonify({'status': 'error', 'message': 'Unknown command'}), 400

    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500

@app.route('/status', methods=['GET'])
def get_status():
    """
    Endpoint to get online status, robot battery, and agent info.
    """
    with command_mutex:
        return jsonify({'status': 'online', 'agents': robot_status, 'battery': robot_battery}), 200

@app.route('/gps', methods=['GET'])
def get_gps():
    """
    Endpoint to get latest GPS coordinates.
    """
    with command_mutex:
        return jsonify({'ghost': robot_gps['ghost']}), 200

@app.route('/command/enable_vision_mode', methods=['POST'])
def enable_vision_mode():
    """
    Enable vision-based obstacle avoidance mode.
    """
    try:
        ros2_node.enable_vision_obstacle_avoidance()
        return jsonify({'status': 'success', 'message': 'Vision obstacle avoidance enabled'}), 200
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500

@app.route('/imu', methods=['GET'])
def get_imu():
    with command_mutex:
        return jsonify({'ghost': robot_imu.get('ghost', {})}), 200

    
@app.route('/odom', methods=['GET'])
def get_odom():
    with command_mutex:
        return jsonify({'ghost': robot_odometry.get('ghost', {})}), 200

@app.route('/lowlevel/telemetry', methods=['GET'])
def lowlevel_telemetry():
    with command_mutex:
        imu = robot_imu.get('ghost', {}) or {}
        odom = robot_odometry.get('ghost', {}) or {}
        battery_raw = robot_battery.get('ghost', 'Unknown')

        rx_diag = lowlevel_rx_state.get("diagnostics_bitfield")
        diag_src = rx_diag if rx_diag is not None else lowlevel_state.get('diagnostics_bitfield', 0)
        diag = _decode_diagnostics(int(diag_src or 0))

        rx_voltage = lowlevel_rx_state.get("voltage")
        if isinstance(rx_voltage, dict) and (rx_voltage.get("raw") or rx_voltage.get("parsed")):
            voltage_raw = rx_voltage.get("raw", "")
            voltages = _as_float_list(rx_voltage.get("parsed", []))
        else:
            voltage_raw = battery_raw
            voltages = _extract_battery_voltages(battery_raw)

        imu_ang = lowlevel_rx_state.get("imu_angular_velocity") or imu.get('angular_velocity', {})
        imu_lin = lowlevel_rx_state.get("imu_linear_acceleration") or imu.get('linear_acceleration', {})
        twist_linear = lowlevel_rx_state.get("twist_linear") or (odom.get('twist', {}) or {}).get('linear', {})
        se2_twist = lowlevel_rx_state.get("se2twist_des") or lowlevel_state.get("last_twist", {"vx": 0.0, "vy": 0.0, "wz": 0.0})

        behavior_name = lowlevel_rx_state.get("behavior") or lowlevel_state.get("behavior", "unknown")
        behavior_control_mode = lowlevel_rx_state.get("control_mode")
        if behavior_control_mode is None:
            behavior_control_mode = lowlevel_state.get("control_mode")
        behavior_action = lowlevel_rx_state.get("action")
        if behavior_action is None:
            behavior_action = lowlevel_state.get("action")

        updated_at = max(float(lowlevel_state.get("updated_at", 0.0) or 0.0), float(lowlevel_rx_state.get("updated_at", 0.0) or 0.0))
        payload = {
            "behavior": {
                "control_mode": behavior_control_mode,
                "action": behavior_action,
                "name": behavior_name,
            },
            "diagnostics": diag,
            "imu_angular_velocity": imu_ang,
            "imu_linear_acceleration": imu_lin,
            "twist_linear": twist_linear,
            "se2twist_des": se2_twist,
            "voltage": {
                "raw": voltage_raw,
                "parsed": voltages,
            },
            "joint_position": lowlevel_joint_state.get("joint_position", []),
            "joint_velocity": lowlevel_joint_state.get("joint_velocity", []),
            "joint_current": lowlevel_joint_state.get("joint_current", []),
            "joint_temperature": lowlevel_joint_state.get("joint_temperature", []),
            "joint_voltage": lowlevel_joint_state.get("joint_voltage", []),
            "contacts": lowlevel_joint_state.get("contacts", []),
            "phase": lowlevel_joint_state.get("phase", []),
            "swing_mode": lowlevel_joint_state.get("swing_mode", []),
            "joint_updated_at": lowlevel_joint_state.get("updated_at", 0.0),
            "updated_at": updated_at,
        }
    return jsonify(payload), 200

@app.route('/lowlevel/rx', methods=['POST'])
def lowlevel_rx_set():
    data = request.get_json(force=True, silent=True) or {}
    _set_lowlevel_rx_state(data)
    with command_mutex:
        summary = {
            "control_mode": lowlevel_rx_state.get("control_mode"),
            "action": lowlevel_rx_state.get("action"),
            "behavior": lowlevel_rx_state.get("behavior"),
            "diagnostics_bitfield": lowlevel_rx_state.get("diagnostics_bitfield"),
            "updated_at": lowlevel_rx_state.get("updated_at", 0.0),
        }
    return jsonify({"status": "ok", "rx": summary}), 200

@app.route('/lowlevel/joints', methods=['POST'])
def lowlevel_joints_set():
    data = request.get_json(force=True, silent=True) or {}
    _set_joint_state(data)
    with command_mutex:
        result = {
            "joint_position": len(lowlevel_joint_state.get("joint_position", [])),
            "joint_velocity": len(lowlevel_joint_state.get("joint_velocity", [])),
            "joint_current": len(lowlevel_joint_state.get("joint_current", [])),
            "joint_temperature": len(lowlevel_joint_state.get("joint_temperature", [])),
            "joint_voltage": len(lowlevel_joint_state.get("joint_voltage", [])),
            "contacts": len(lowlevel_joint_state.get("contacts", [])),
            "phase": len(lowlevel_joint_state.get("phase", [])),
            "swing_mode": len(lowlevel_joint_state.get("swing_mode", [])),
        }
    return jsonify({"status": "ok", "counts": result}), 200

@app.route('/lowlevel/diagnostics', methods=['POST'])
def lowlevel_diagnostics_set():
    data = request.get_json(force=True, silent=True) or {}
    bitfield = int(data.get("bitfield", 0))
    _set_lowlevel_state(diagnostics_bitfield=bitfield)
    return jsonify({"status": "ok", "diagnostics": _decode_diagnostics(bitfield)}), 200

@app.route('/lowlevel/params', methods=['GET'])
def lowlevel_params_get_all():
    with command_mutex:
        return jsonify({"status": "ok", "params": lowlevel_params}), 200

@app.route('/lowlevel/params/get', methods=['POST'])
def lowlevel_params_get_one():
    data = request.get_json(force=True, silent=True) or {}
    name = str(data.get("name", "")).strip()
    if not name:
        return jsonify({"status": "error", "message": "name is required"}), 400
    with command_mutex:
        value = lowlevel_params.get(name)
    return jsonify({"status": "ok", "name": name, "value": value}), 200

@app.route('/lowlevel/params/set', methods=['POST'])
def lowlevel_params_set_one():
    data = request.get_json(force=True, silent=True) or {}
    name = str(data.get("name", "")).strip()
    if not name:
        return jsonify({"status": "error", "message": "name is required"}), 400
    value = data.get("value")
    with command_mutex:
        lowlevel_params[name] = value
        readback = lowlevel_params.get(name)
    return jsonify({"status": "ok", "name": name, "value": readback, "verified": True}), 200

@app.route('/lowlevel/behavior', methods=['POST'])
def lowlevel_behavior_set():
    data = request.get_json(force=True, silent=True) or {}
    behavior = str(data.get("behavior", "")).strip().lower()
    control_mode = data.get("control_mode")

    behavior_map = {
        "sit": 0,
        "stand": 1,
        "walk": 2,
    }

    if control_mode is not None:
        cm = int(control_mode)
        ros2_node.control_mode_pub.publish(UInt32(data=cm))
        _set_lowlevel_state(control_mode=cm)

    if behavior in behavior_map:
        action_value = int(behavior_map[behavior])
        ros2_node.action_pub.publish(UInt32(data=action_value))
        _set_lowlevel_state(action=action_value, behavior=behavior)
    elif behavior == "manual":
        ros2_node.control_mode_pub.publish(UInt32(data=140))
        _set_lowlevel_state(control_mode=140, behavior="manual")
    elif behavior == "original":
        ros2_node.control_mode_pub.publish(UInt32(data=180))
        _set_lowlevel_state(control_mode=180, behavior="original")
    elif behavior:
        return jsonify({"status": "error", "message": f"unsupported behavior: {behavior}"}), 400

    with command_mutex:
        state = {
            "control_mode": lowlevel_state.get("control_mode"),
            "action": lowlevel_state.get("action"),
            "behavior": lowlevel_state.get("behavior"),
        }
    return jsonify({"status": "ok", "state": state}), 200

@app.route('/localization/status', methods=['GET'])
def localization_status():
    payload = _localization_snapshot()
    return jsonify({"status": "ok", "localization": payload}), 200

@app.route('/localization/profiles', methods=['GET'])
def localization_profiles():
    return jsonify({"status": "ok", "profiles": site_profiles}), 200

@app.route('/localization/profile', methods=['POST'])
def localization_set_profile():
    data = request.get_json(force=True, silent=True) or {}
    name = str(data.get("name", "")).strip().lower()
    profile = site_profiles.get(name)
    if not profile:
        return jsonify({"status": "error", "message": f"unknown profile: {name}"}), 400
    _set_localization_state(
        mode=profile.get("mode"),
        source=profile.get("source"),
        confidence=data.get("confidence", "nominal"),
    )
    return jsonify({"status": "ok", "profile": name, "localization": _localization_snapshot()}), 200

@app.route('/localization/initialpose', methods=['POST'])
def localization_initialpose():
    data = request.get_json(force=True, silent=True) or {}
    try:
        x = float(data["x"])
        y = float(data["y"])
        yaw = float(data.get("yaw", 0.0))
        frame_id = str(data.get("frame_id", "map")).strip() or "map"
        covariance_xy = float(data.get("covariance_xy", 0.25))
        covariance_yaw = float(data.get("covariance_yaw", 0.2))
    except KeyError as exc:
        return jsonify({"status": "error", "message": f"missing field: {exc}"}), 400
    except Exception as exc:
        return jsonify({"status": "error", "message": str(exc)}), 400

    ros2_node.publish_initial_pose(x, y, yaw, frame_id=frame_id, covariance_xy=covariance_xy, covariance_yaw=covariance_yaw)
    payload = {
        "x": x,
        "y": y,
        "yaw": yaw,
        "frame_id": frame_id,
        "covariance_xy": covariance_xy,
        "covariance_yaw": covariance_yaw,
        "set_by": str(data.get("set_by", "operator")),
    }
    _set_localization_state(
        source=str(data.get("source", "manual_initialpose")),
        confidence=str(data.get("confidence", "recovering")),
        last_initialpose=payload,
        last_reset_at=time.time(),
    )
    return jsonify({"status": "ok", "initialpose": payload, "localization": _localization_snapshot()}), 200

@app.route('/localization/confidence', methods=['POST'])
def localization_confidence():
    data = request.get_json(force=True, silent=True) or {}
    confidence = str(data.get("confidence", "")).strip().lower()
    if not confidence:
        return jsonify({"status": "error", "message": "confidence is required"}), 400
    updates = {"confidence": confidence}
    if "source" in data:
        updates["source"] = str(data.get("source"))
    if "current_map" in data:
        updates["current_map"] = data.get("current_map")
    _set_localization_state(**updates)
    return jsonify({"status": "ok", "localization": _localization_snapshot()}), 200

@app.route('/localization/apriltag', methods=['POST'])
def localization_apriltag():
    data = request.get_json(force=True, silent=True) or {}
    try:
        tag_id = int(data["tag_id"])
        x = float(data["x"])
        y = float(data["y"])
        yaw = float(data.get("yaw", 0.0))
    except KeyError as exc:
        return jsonify({"status": "error", "message": f"missing field: {exc}"}), 400
    except Exception as exc:
        return jsonify({"status": "error", "message": str(exc)}), 400

    frame_id = str(data.get("frame_id", "map")).strip() or "map"
    detection_margin = float(data.get("decision_margin", data.get("margin", 0.0)))
    event = {
        "tag_id": tag_id,
        "tag_family": str(data.get("tag_family", "tag36h11")),
        "x": x,
        "y": y,
        "yaw": yaw,
        "frame_id": frame_id,
        "decision_margin": detection_margin,
        "stamp": time.time(),
        "camera_frame": str(data.get("camera_frame", "")),
    }

    relocalize = bool(data.get("relocalize", False))
    confidence = str(data.get("confidence", "recovered" if relocalize else "nominal"))
    if relocalize:
        ros2_node.publish_initial_pose(
            x,
            y,
            yaw,
            frame_id=frame_id,
            covariance_xy=float(data.get("covariance_xy", 0.1)),
            covariance_yaw=float(data.get("covariance_yaw", 0.08)),
        )
        _set_localization_state(
            source="apriltag",
            confidence=confidence,
            last_initialpose={
                "x": x,
                "y": y,
                "yaw": yaw,
                "frame_id": frame_id,
                "set_by": "apriltag",
            },
            last_reset_at=time.time(),
            last_apriltag=event,
        )
    else:
        _set_localization_state(source="apriltag", confidence=confidence, last_apriltag=event)

    return jsonify({"status": "ok", "apriltag": event, "relocalized": relocalize, "localization": _localization_snapshot()}), 200

@app.route('/mission/status', methods=['GET'])
def mission_status():
    return jsonify({"status": "ok", "mission": _mission_snapshot()}), 200

@app.route('/mission/queue', methods=['POST'])
def mission_queue_add():
    data = request.get_json(force=True, silent=True) or {}
    raw_goals = data.get("goals")
    if not isinstance(raw_goals, list) or not raw_goals:
        return jsonify({"status": "error", "message": "goals array is required"}), 400
    added = []
    try:
        for idx, raw_goal in enumerate(raw_goals):
            if not isinstance(raw_goal, dict):
                return jsonify({"status": "error", "message": f"goal at index {idx} must be an object"}), 400
            added.append(_normalize_waypoint(raw_goal, idx))
    except KeyError as exc:
        return jsonify({"status": "error", "message": f"goal missing field: {exc}"}), 400
    except Exception as exc:
        return jsonify({"status": "error", "message": str(exc)}), 400

    with mission_lock:
        mission_state["queue"].extend(added)
        mission_state["auto_start"] = bool(data.get("auto_start", mission_state.get("auto_start", False)))
        if mission_state["status"] == "idle" and mission_state["auto_start"]:
            mission_state["status"] = "running"
        mission_state["updated_at"] = _mission_now()
    snapshot = _mission_snapshot()
    return jsonify({"status": "ok", "added": added, "mission": snapshot}), 200

@app.route('/mission/start', methods=['POST'])
def mission_start():
    with mission_lock:
        if mission_state.get("active_goal") is None and not mission_state.get("queue"):
            mission_state["status"] = "idle"
            mission_state["updated_at"] = _mission_now()
            return jsonify({"status": "error", "message": "mission queue is empty"}), 409
        mission_state["status"] = "running"
        mission_state["auto_start"] = True
        mission_state["updated_at"] = _mission_now()
    snapshot = _mission_snapshot()
    return jsonify({"status": "ok", "mission": snapshot}), 200

@app.route('/mission/cancel', methods=['POST'])
def mission_cancel():
    data = request.get_json(force=True, silent=True) or {}
    clear_queue = bool(data.get("clear_queue", True))
    with mission_lock:
        active_goal = mission_state.get("active_goal")
        if isinstance(active_goal, dict):
            cancelled = dict(active_goal)
            cancelled["result"] = "cancelled"
            cancelled["finished_at"] = _mission_now()
            _append_mission_history(cancelled)
        mission_state["active_goal"] = None
        mission_state["status"] = "idle"
        mission_state["auto_start"] = False
        if clear_queue:
            mission_state["queue"] = []
        mission_state["updated_at"] = _mission_now()
    ros2_node.stop_mpc()
    snapshot = _mission_snapshot()
    return jsonify({"status": "ok", "mission": snapshot}), 200

@app.route('/mission/active/complete', methods=['POST'])
def mission_complete_active():
    with mission_lock:
        active_goal = mission_state.get("active_goal")
        if not isinstance(active_goal, dict):
            return jsonify({"status": "error", "message": "no active goal"}), 409
        completed = dict(active_goal)
        completed["result"] = "completed"
        completed["finished_at"] = _mission_now()
        mission_state["active_goal"] = None
        if mission_state.get("queue"):
            mission_state["status"] = "running"
        else:
            mission_state["status"] = "idle"
        _append_mission_history(completed)
        mission_state["updated_at"] = _mission_now()
    snapshot = _mission_snapshot()
    return jsonify({"status": "ok", "completed": completed, "mission": snapshot}), 200

@app.route('/mission/active/fail', methods=['POST'])
def mission_fail_active():
    data = request.get_json(force=True, silent=True) or {}
    reason = str(data.get("reason", "failed")).strip() or "failed"
    with mission_lock:
        active_goal = mission_state.get("active_goal")
        if not isinstance(active_goal, dict):
            return jsonify({"status": "error", "message": "no active goal"}), 409
        failed = dict(active_goal)
        failed["result"] = "failed"
        failed["reason"] = reason
        failed["finished_at"] = _mission_now()
        mission_state["active_goal"] = None
        mission_state["status"] = "paused"
        _append_mission_history(failed)
        mission_state["updated_at"] = _mission_now()
    snapshot = _mission_snapshot()
    return jsonify({"status": "ok", "failed": failed, "mission": snapshot}), 200

@app.route('/ghost/scripts', methods=['GET'])
def ghost_scripts():
    return jsonify({
        "status": "ok",
        "scripts": ghost_script_catalog,
    }), 200

@app.route('/ghost/status', methods=['GET'])
def ghost_status():
    snapshot = _ghost_snapshot()
    snapshot["metrics"] = _pointcloud_metrics_payload()
    snapshot["maps"]["saved"] = _list_saved_maps(limit=8)
    snapshot["maps"]["previews"] = _latest_preview_candidates(limit=6)
    snapshot["localization"] = _localization_snapshot()
    snapshot["synthetic_mission"] = _mission_snapshot()
    return jsonify({"status": "ok", "ghost": snapshot}), 200

@app.route('/ghost/mission/run', methods=['POST'])
def ghost_mission_run():
    data = request.get_json(force=True, silent=True) or {}
    script_key = str(data.get("script", "")).strip()
    mission_path = str(data.get("mission", "")).strip()
    if script_key:
        script_meta = ghost_script_catalog.get(script_key)
        if not script_meta:
            return jsonify({"status": "error", "message": f"unknown script: {script_key}"}), 400
        mission_path = script_meta["mission"]
    if not mission_path:
        return jsonify({"status": "error", "message": "script or mission is required"}), 400
    try:
        ros2_node.run_named_mission(mission_path)
        return jsonify({
            "status": "ok",
            "mission": mission_path,
            "ghost": _ghost_snapshot(),
        }), 200
    except Exception as exc:
        return jsonify({"status": "error", "message": str(exc)}), 500

@app.route('/ghost/mission/<string:action>', methods=['POST'])
def ghost_mission_action(action):
    action = action.strip().lower()
    action_map = {
        "start": ros2_node.start_mission,
        "pause": ros2_node.pause_mission,
        "unpause": ros2_node.unpause_mission,
        "cancel": ros2_node.cancel_mission,
    }
    fn = action_map.get(action)
    if fn is None:
        return jsonify({"status": "error", "message": f"unsupported mission action: {action}"}), 400
    try:
        fn()
        return jsonify({"status": "ok", "action": action, "ghost": _ghost_snapshot()}), 200
    except Exception as exc:
        return jsonify({"status": "error", "message": str(exc)}), 500

@app.route('/ghost/lidar/<string:action>', methods=['POST'])
def ghost_lidar_action(action):
    action = action.strip().lower()
    service_map = {
        "activate": "/activate_lio",
        "deactivate": "/deactivate_lio",
        "restart": "/restart_lio",
        "relocalize": "/restart_relocalization",
        "activate_relocalization": "/activate_relocalization",
        "deactivate_relocalization": "/deactivate_relocalization",
        "activate_apriltag": "/activate_apriltag_ros",
        "restart_apriltag": "/restart_apriltag_ros",
        "deactivate_apriltag": "/deactivate_apriltag_ros",
        "planner": "/activate_planner",
        "mpc_lio": "/activate_mpc_lio",
        "mpc_lio_obs": "/activate_mpc_lio_obs",
        "obs_avoid_lio": "/activate_obs_avoid_lio",
    }
    service_name = service_map.get(action)
    if service_name is None:
        return jsonify({"status": "error", "message": f"unsupported lidar action: {action}"}), 400
    try:
        ros2_node.call_empty_service(service_name)
        updates = {}
        if action == "activate":
            updates["lio_active"] = True
            updates["odom_source"] = "lidar"
        elif action == "deactivate":
            updates["lio_active"] = False
        elif action in ("relocalize", "activate_relocalization"):
            updates["relocalization_status"] = "requested"
            updates["odom_source"] = "lidar_relocalizing"
        elif action == "activate_apriltag":
            updates["apriltag_active"] = True
        elif action == "deactivate_apriltag":
            updates["apriltag_active"] = False
        if updates:
            _set_ghost_state("lidar", **updates)
        return jsonify({"status": "ok", "action": action, "service": service_name, "ghost": _ghost_snapshot()}), 200
    except Exception as exc:
        return jsonify({"status": "error", "message": str(exc), "service": service_name}), 500

@app.route('/ghost/lidar/save_map', methods=['POST'])
def ghost_lidar_save_map():
    data = request.get_json(force=True, silent=True) or {}
    destination = str(data.get("destination", "")).strip()
    resolution = float(data.get("resolution", -30.0))
    try:
        result = ros2_node.save_lio_map(destination=destination, resolution=resolution)
        return jsonify({"status": "ok", "result": result, "ghost": _ghost_snapshot()}), 200
    except Exception as exc:
        return jsonify({"status": "error", "message": str(exc)}), 500

@app.route('/ghost/maps', methods=['GET'])
def ghost_maps():
    maps = _list_saved_maps(limit=int(request.args.get("limit", 12)))
    previews = _latest_preview_candidates(limit=int(request.args.get("preview_limit", 8)))
    return jsonify({
        "status": "ok",
        "directory": str(MAPS_DIR),
        "maps": maps,
        "previews": previews,
    }), 200

@app.route('/ghost/maps/preview/<path:filename>', methods=['GET'])
def ghost_map_preview(filename):
    safe_name = Path(filename).name
    target = MAPS_DIR / safe_name
    if not target.exists() or target.suffix.lower() != ".png":
        return jsonify({"status": "error", "message": "preview not found"}), 404
    return send_file(target, mimetype='image/png', max_age=0)

@app.route('/ghost/metrics', methods=['GET'])
def ghost_metrics():
    payload = _pointcloud_metrics_payload()
    payload["planner"] = _ghost_snapshot().get("planner", {})
    payload["lidar"] = _ghost_snapshot().get("lidar", {})
    return jsonify({"status": "ok", "metrics": payload}), 200

#@app.route("/obstmap")
#def get_obstmap():
 #   if request.args.get("compressed") in ("1","true","True"):
  # if not latest_obstmap:
   #     return jsonify({"points": [], "status": "waiting for data"}), 200
    #return jsonify({"points": latest_obstmap})


#@app.route("/pointcloud")
#def get_pointcloud():
    # Optional compressed query path for convenience
 #   if request.args.get("compressed") in ("1", "true", "True"):
  #      return get_pointcloud_compressed()

   # if not latest_pointcloud:
    #    return jsonify({"points": [], "status": "waiting for data"}), 200
    #return jsonify({"points": latest_pointcloud})

@app.route("/obstmap")
def get_obstmap():
    body = {"points": latest_obstmap if latest_obstmap else [],
            "status": "ok" if latest_obstmap else "waiting for data"}
    npts = len(latest_obstmap) if latest_obstmap else 0
    txt = json.dumps(body, separators=(',', ':'))  # minified to measure bytes fairly
    resp = make_response(txt, 200)
    resp.headers['Content-Type'] = 'application/json'
    return _with_pc_headers(resp,
                            method="raw-json",
                            npoints=npts,
                            encoded_bytes=len(txt.encode('utf-8')))

@app.route("/pointcloud")
def get_pointcloud():
    # allow ?compressed=1 to reuse compressed route if you want, but still stamp headers
    if request.args.get("compressed") in ("1", "true", "True"):
        return get_pointcloud_compressed()

    body = {"points": latest_pointcloud if latest_pointcloud else [],
            "status": "ok" if latest_pointcloud else "waiting for data"}
    npts = len(latest_pointcloud) if latest_pointcloud else 0
    txt = json.dumps(body, separators=(',', ':'))
    resp = make_response(txt, 200)
    resp.headers['Content-Type'] = 'application/json'
    return _with_pc_headers(resp,
                            method="raw-json",
                            npoints=npts,
                            encoded_bytes=len(txt.encode('utf-8')))

# @app.route("/pointcloud")
# def get_pointcloud():
#     if request.args.get("compressed") in ("1","true","True"):
#         return jsonify(_compress_points(latest_pointcloud, pc_node.points_compressor)), 200
#     if not latest_pointcloud:
#         return jsonify({"points": [], "status": "waiting for data"}), 200
#     return jsonify({"points": latest_pointcloud})


# @app.route("/obstmap")
# def get_obstmap():
#     if not latest_obstmap:
#         return jsonify({"points": [], "status": "waiting for data"}), 200
#     return jsonify({"points": latest_obstmap})

# @app.route("/pointcloud")
# def get_pointcloud():
#     if not latest_pointcloud:
#         return jsonify({"points": [], "status": "waiting for data"}), 200
#     return jsonify({"points": latest_pointcloud})

#
@app.route("/mapdata")
def get_combined_map():
    return jsonify({
        "obstmap": latest_obstmap,
        "pointcloud": latest_pointcloud
    })
@app.route("/obstmap_compressed")
def get_obstmap_compressed():
    t0 = time.time()
    pts = _points_dicts_to_np(latest_obstmap)  # Nx3 float32

    if pts.size == 0:
        payload = {
            "transport": "compressed",
            "method": "hilbert-raw",
            "version": 1,
            "origin": [0.0, 0.0, 0.0],
            "scale": 1.0,
            "shape": [0, 3],
            "data": ""
        }
        resp = make_response(json.dumps(payload), 200)
        resp.headers['Content-Type'] = 'application/json'
        return _with_pc_headers(resp, method="hilbert-raw", npoints=0, encoded_bytes=0, encode_ms=0.0)

    origin, scale, qpoints = pc_compressor.quantize(pts.astype(np.float32))
    order = pc_compressor.hilbert_order(qpoints)
    packed = pc_compressor.pack(qpoints[order])

    use_lz4 = (lz4f is not None) and USE_LZ4 and request.args.get("lz4", "0").lower() not in ("0", "false")
    if use_lz4:
        blob = lz4f.compress(packed)
        method = "hilbert-lz4"
    else:
        blob = packed
        method = "hilbert-raw"

    b64 = base64.b64encode(blob).decode("ascii")
    payload = {
        "transport": "compressed",
        "method": method,
        "version": 1,
        "origin": [float(origin[0]), float(origin[1]), float(origin[2])],
        "scale": float(scale),
        "shape": [int(pts.shape[0]), 3],
        "data": b64
    }
    enc_ms = (time.time() - t0) * 1000.0

    resp = make_response(json.dumps(payload), 200)
    resp.headers['Content-Type'] = 'application/json'
    return _with_pc_headers(resp,
                            method=method,
                            npoints=int(pts.shape[0]),
                            encoded_bytes=_b64_bytes_len(b64),
                            encode_ms=enc_ms)

@app.route("/pointcloud_compressed")
def get_pointcloud_compressed():
    t0 = time.time()
    pts = _points_dicts_to_np(latest_pointcloud)  # Nx3 float32

    if pts.size == 0:
        payload = {
            "transport": "compressed",
            "method": "hilbert-raw",
            "version": 1,
            "origin": [0.0, 0.0, 0.0],
            "scale": 1.0,
            "shape": [0, 3],
            "data": ""
        }
        resp = make_response(json.dumps(payload), 200)
        resp.headers['Content-Type'] = 'application/json'
        return _with_pc_headers(resp, method="hilbert-raw", npoints=0, encoded_bytes=0, encode_ms=0.0)

    origin, scale, qpoints = pc_compressor.quantize(pts.astype(np.float32))
    order = pc_compressor.hilbert_order(qpoints)
    packed = pc_compressor.pack(qpoints[order])

    # RAW only (no LZ4)
    blob = packed
    method = "hilbert-raw"

    b64 = base64.b64encode(blob).decode("ascii")
    payload = {
        "transport": "compressed",
        "method": method,
        "version": 1,
        "origin": [float(origin[0]), float(origin[1]), float(origin[2])],
        "scale": float(scale),
        "shape": [int(pts.shape[0]), 3],
        "data": b64
    }
    enc_ms = (time.time() - t0) * 1000.0

    resp = make_response(json.dumps(payload), 200)
    resp.headers['Content-Type'] = 'application/json'
    return _with_pc_headers(resp,
                            method=method,
                            npoints=int(pts.shape[0]),
                            encoded_bytes=_b64_bytes_len(b64),
                            encode_ms=enc_ms)

# @app.route("/obstmap_compressed")
# def get_obstmap_compressed():
#     pts = _points_dicts_to_np(latest_obstmap)  # Nx3 float32

#     if pts.size == 0:
#         return jsonify({
#             "transport": "compressed",
#             "method": "hilbert-raw",
#             "version": 1,
#             "origin": [0.0, 0.0, 0.0],
#             "scale": 1.0,
#             "shape": [0, 3],
#             "data": ""
#         }), 200

#     origin, scale, qpoints = pc_compressor.quantize(pts.astype(np.float32))
#     order = pc_compressor.hilbert_order(qpoints)
#     packed = pc_compressor.pack(qpoints[order])

#     use_lz4 = (
#         lz4f is not None
#         and USE_LZ4
#         and request.args.get("lz4", "0").lower() not in ("0", "false")
#     )

#     if use_lz4:
#         blob = lz4f.compress(packed)
#         method = "hilbert-lz4"
#     else:
#         blob = packed
#         method = "hilbert-raw"

#     b64 = base64.b64encode(blob).decode("ascii")

#     return jsonify({
#         "transport": "compressed",
#         "method": method,
#         "version": 1,
#         "origin": [float(origin[0]), float(origin[1]), float(origin[2])],
#         "scale": float(scale),
#         "shape": [int(pts.shape[0]), 3],
#         "data": b64
#     }), 200

# # ----- Compressed point cloud routes (Hilbert) -----
# @app.route("/pointcloud_compressed")
# def get_pointcloud_compressed():
#     """
#     Compressed (Hilbert + base64) point cloud, RAW only (no LZ4).
#     """
#     pts = _points_dicts_to_np(latest_pointcloud)  # Nx3 float32

#     if pts.size == 0:
#         return jsonify({
#             "transport": "compressed",
#             "method": "hilbert-raw",
#             "version": 1,
#             "origin": [0.0, 0.0, 0.0],
#             "scale": 1.0,
#             "shape": [0, 3],
#             "data": ""
#         }), 200

#     origin, scale, qpoints = pc_compressor.quantize(pts.astype(np.float32))
#     order = pc_compressor.hilbert_order(qpoints)
#     packed = pc_compressor.pack(qpoints[order])

#     # Always RAW (no LZ4) so the frontend doesn’t need a decoder
#     blob = packed
#     method = "hilbert-raw"

#     b64 = base64.b64encode(blob).decode("ascii")

#     return jsonify({
#         "transport": "compressed",
#         "method": method,
#         "version": 1,
#         "origin": [float(origin[0]), float(origin[1]), float(origin[2])],
#         "scale": float(scale),
#         "shape": [int(pts.shape[0]), 3],
#         "data": b64
#     }), 200



    # Quantize and pack (uint16 interleaved)
    origin, scale, qpoints = pc_compressor.quantize(pts.astype(np.float32))
    order = pc_compressor.hilbert_order(qpoints)
    packed = pc_compressor.pack(qpoints[order])

    # ONLY use LZ4 if explicitly requested and available
    use_lz4 = (lz4f is not None) and (request.args.get("lz4") in ("1", "true", "True"))

    if use_lz4:
        blob = lz4f.compress(packed)
        method = "hilbert-lz4"
    else:
        blob = packed
        method = "hilbert-raw"

    b64 = base64.b64encode(blob).decode("ascii")

    return jsonify({
        "transport": "compressed",
        "method": method,
        "version": 1,
        "origin": [float(origin[0]), float(origin[1]), float(origin[2])],
        "scale": float(scale),
        "shape": [int(pts.shape[0]), 3],
        "data": b64
    }), 200

@app.route("/pc_metrics")
def pc_metrics():
    """
    Compare estimated raw JSON payload size vs Hilbert-packed size,
    and report packing time. No big payloads are returned here.
    """
    pts = _points_dicts_to_np(latest_pointcloud)  # Nx3 float32
    if pts.size == 0:
        return jsonify({"n_points": 0, "message": "waiting for data"}), 200
    m = _pack_hilbert_metrics(pts.astype(np.float32))
    return jsonify(m), 200

# autonomous move route
@app.route('/command/autonomous_move', methods=['POST'])
def autonomous_move():
    """
    Trigger autonomous forward movement using /mpc/goal
    Requires control_mode=160 and gait action=2
    Accepts linear_x as input (defaults to 0.6 m/s)
    """
    try:
        data = request.get_json(force=True, silent=True) or {}
        linear_x = float(data.get('linear_x', 0.6))

        msg = UInt32()
        msg.data = 160
        ros2_node.control_mode_pub.publish(msg)
        time.sleep(0.5)

        msg.data = 2
        ros2_node.action_pub.publish(msg)
        time.sleep(0.5)

        ros2_node.send_planner_goal(linear_x=linear_x)

        return jsonify({'status': 'success', 'message': f'Planner goal sent with linear_x={linear_x}'}), 200

    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500

# send GPS waypoint goal 
@app.route('/command/send_goal', methods=['POST'])
def send_goal():
    """
    Send a global GPS waypoint goal to /move_base_simple/goal
    Ensures control_mode=140 and action=2 before publishing.
    Accepts either:
      A) { "latitude": 38.9, "longitude": -76.9, "z": 0.0 }
      B) { "command": { "latitude": 38.9, "longitude": -76.9, "z": 0.0 } }
      C) { "lat": ..., "lng": ... } (aliases)
    """
    data = request.get_json(force=True, silent=True) or {}
    params = data.get("command", data)

    lat = params.get('latitude') or params.get('lat')
    lng = params.get('longitude') or params.get('lng')
    z = params.get('z', 0.0)

    if lat is None or lng is None:
        return jsonify({'status': 'error', 'message': 'Latitude and longitude are required'}), 400

    try:
        lat = float(lat)
        lng = float(lng)
        z = float(z)
    except ValueError:
        return jsonify({'status': 'error', 'message': 'Latitude, longitude, and z must be valid numbers'}), 400

    print(f"[GPS Goal] lat={lat}, lng={lng}, z={z}")

    # --- enforce required mode/action ---
    ros2_node.control_mode_pub.publish(UInt32(data=PLANNER_LOCAL))
    time.sleep(0.15)
    ros2_node.action_pub.publish(UInt32(data=ACTION_WALK))
    time.sleep(0.15)

    # publish goal pose (your existing conversion + publisher)
    ros2_node.send_goal_pose(lat, lng, z)

    speak("GPS goal sent")
    return jsonify({
        'status': 'success',
        'mode': PLANNER_LOCAL,
        'message': f'Goal sent to robot at ({lat}, {lng}, {z})'
    }), 200


## Point cloud route compression
@app.route("/pc_status")
def pc_status():
    return jsonify({
        "obstmap_len": len(latest_obstmap) if isinstance(latest_obstmap, list) else -1,
        "pointcloud_len": len(latest_pointcloud) if isinstance(latest_pointcloud, list) else -1,
    }), 200


# Expose /metrics for Prometheus
@app.route("/metrics")
def metrics():
    return Response(generate_latest(_registry), mimetype=CONTENT_TYPE_LATEST)


# ------------------- Proxy Camera Streaming (Optional Future Section) --------------------

ROS_CAMERA_BASE_URL = os.environ.get('ROS_CAMERA_BASE_URL', 'http://127.0.0.1:8080')


PROXY_CAMERA_TOPICS = {
    # Front Left
    'front_left': '/argus/ar0234_front_left/image_raw',
    'front_left_rect': '/argus/ar0234_front_left/rect/image_raw',
    'front_left_scaled': '/argus/ar0234_front_left/scaled/image_raw',
    'front_left_zoomx2': '/argus/ar0234_front_left/zoomx2/image_raw',
    'front_left_zoomx4': '/argus/ar0234_front_left/zoomx4/image_raw',

    # Front Right
    'front_right': '/argus/ar0234_front_right/image_raw',
    'front_right_rect': '/argus/ar0234_front_right/rect/image_raw',
    'front_right_scaled': '/argus/ar0234_front_right/scaled/image_raw',
    'front_right_zoomx2': '/argus/ar0234_front_right/zoomx2/image_raw',
    'front_right_zoomx4': '/argus/ar0234_front_right/zoomx4/image_raw',

    # Rear
    'rear': '/argus/ar0234_rear/image_raw',
    'rear_rect': '/argus/ar0234_rear/rect/image_raw',
    'rear_scaled': '/argus/ar0234_rear/scaled/image_raw',
    'rear_zoomx2': '/argus/ar0234_rear/zoomx2/image_raw',
    'rear_zoomx4': '/argus/ar0234_rear/zoomx4/image_raw',

    # Side Left
    'side_left': '/argus/ar0234_side_left/image_raw',
    'side_left_rect': '/argus/ar0234_side_left/rect/image_raw',
    'side_left_scaled': '/argus/ar0234_side_left/scaled/image_raw',
    'side_left_zoomx2': '/argus/ar0234_side_left/zoomx2/image_raw',
    'side_left_zoomx4': '/argus/ar0234_side_left/zoomx4/image_raw',

    # Side Right
    'side_right': '/argus/ar0234_side_right/image_raw',
    'side_right_rect': '/argus/ar0234_side_right/rect/image_raw',
    'side_right_scaled': '/argus/ar0234_side_right/scaled/image_raw',
    'side_right_zoomx2': '/argus/ar0234_side_right/zoomx2/image_raw',
    'side_right_zoomx4': '/argus/ar0234_side_right/zoomx4/image_raw',

    # MCU aliases (snapshots only, but included so frontend keys resolve)
    'mcu_image_left':  '/mcu/state/image_left',
    'mcu_image_right': '/mcu/state/image_right',
    'mcu_image_track': '/mcu/state/image_track',
    'mcu_rs2_depth':   '/mcu/state/rs2/depth',
    'mcu_rs2_ir_left': '/mcu/state/rs2/ir_left',
    'mcu_rs2_ir_right':'/mcu/state/rs2/ir_right',
    'mcu_rs3_depth':   '/mcu/state/rs3/depth',
    'mcu_rs4_depth':   '/mcu/state/rs4/depth',
    'mcu_rs4_rgb':     '/mcu/state/rs4/rgb',
}

# PROXY_CAMERA_TOPICS = {
#     # Front Left
#     'front_left': '/argus/ar0234_front_left/image_raw',
#     'front_left_rect': '/argus/ar0234_front_left/rect/image_raw',
#     'front_left_scaled': '/argus/ar0234_front_left/scaled/image_raw',
#     'front_left_zoomx2': '/argus/ar0234_front_left/zoomx2/image_raw',
#     'front_left_zoomx4': '/argus/ar0234_front_left/zoomx4/image_raw',

#     # Front Right
#     'front_right': '/argus/ar0234_front_right/image_raw',
#     'front_right_rect': '/argus/ar0234_front_right/rect/image_raw',
#     'front_right_scaled': '/argus/ar0234_front_right/scaled/image_raw',
#     'front_right_zoomx2': '/argus/ar0234_front_right/zoomx2/image_raw',
#     'front_right_zoomx4': '/argus/ar0234_front_right/zoomx4/image_raw',

#     # Rear
#     'rear': '/argus/ar0234_rear/image_raw',
#     'rear_rect': '/argus/ar0234_rear/rect/image_raw',
#     'rear_scaled': '/argus/ar0234_rear/scaled/image_raw',
#     'rear_zoomx2': '/argus/ar0234_rear/zoomx2/image_raw',
#     'rear_zoomx4': '/argus/ar0234_rear/zoomx4/image_raw',

#     # Side Left
#     'side_left': '/argus/ar0234_side_left/image_raw',
#     'side_left_rect': '/argus/ar0234_side_left/rect/image_raw',
#     'side_left_scaled': '/argus/ar0234_side_left/scaled/image_raw',
#     'side_left_zoomx2': '/argus/ar0234_side_left/zoomx2/image_raw',
#     'side_left_zoomx4': '/argus/ar0234_side_left/zoomx4/image_raw',

#     # Side Right
#     'side_right': '/argus/ar0234_side_right/image_raw',
#     'side_right_rect': '/argus/ar0234_side_right/rect/image_raw',
#     'side_right_scaled': '/argus/ar0234_side_right/scaled/image_raw',
#     'side_right_zoomx2': '/argus/ar0234_side_right/zoomx2/image_raw',
#     'side_right_zoomx4': '/argus/ar0234_side_right/zoomx4/image_raw',
# }

# Proxy camera streaming routing 

@app.route('/proxy_camera_feed/<string:camera>', methods=['GET'])
def proxy_camera_feed(camera):
    topic = PROXY_CAMERA_TOPICS.get(camera)
    if not topic:
        return jsonify({'status': 'error', 'message': f'Camera topic "{camera}" not found'}), 404

    # IMPORTANT: use the raw MJPEG endpoint
    stream_url = f"{ROS_CAMERA_BASE_URL}/stream?topic={topic}"

    try:
        upstream = requests.get(stream_url, stream=True, timeout=10)
        # Prepare headers
        headers = {
            'Content-Type': upstream.headers.get(
                'Content-Type',
                'multipart/x-mixed-replace; boundary=frame'
            ),
            'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
            'Pragma': 'no-cache',
        }

        def generate():
            for chunk in upstream.iter_content(chunk_size=4096):
                if chunk:
                    yield chunk

        return Response(stream_with_context(generate()), headers=headers, status=upstream.status_code)
    except requests.exceptions.RequestException as e:
        return jsonify({'status': 'error', 'message': f'Upstream stream error: {e}'}), 502


# proxy camera snapshots routing
@app.route('/proxy_camera_snapshot/<string:camera>', methods=['GET'])
def proxy_camera_snapshot(camera):
    topic = PROXY_CAMERA_TOPICS.get(camera)
    if not topic:
        return jsonify({'status': 'error', 'message': f'Camera topic "{camera}" not found'}), 404

    snapshot_url = f"{ROS_CAMERA_BASE_URL}/snapshot?topic={topic}"
    try:
        upstream = requests.get(snapshot_url, timeout=5)
        if upstream.status_code != 200:
            return jsonify({'status': 'error', 'message': f'Upstream returned {upstream.status_code}'}), 502

        headers = {
            'Content-Type': upstream.headers.get('Content-Type', 'image/jpeg'),
            'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
            'Pragma': 'no-cache',
        }
        return Response(upstream.content, headers=headers, status=200)
    except requests.exceptions.RequestException as e:
        return jsonify({'status': 'error', 'message': f'Upstream snapshot error: {e}'}), 502

# @app.route('/proxy_camera_feed/<string:camera>', methods=['GET'])
# def proxy_camera_feed(camera):
#     """
#     Proxy stream camera feed via ROS2 Web Server.
#     """
#     topic = PROXY_CAMERA_TOPICS.get(camera)
#     if not topic:
#         return jsonify({'status': 'error', 'message': f'Camera topic \"{camera}\" not found'}), 404

#     stream_url = f"{ROS_CAMERA_BASE_URL}/stream_viewer?topic={topic}"

#     def generate():
#         try:
#             with requests.get(stream_url, stream=True) as r:
#                 for chunk in r.iter_content(chunk_size=1024):
#                     if chunk:
#                         yield chunk
#         except requests.exceptions.RequestException as e:
#             yield f"Error streaming from remote server: {str(e)}".encode()

#     return Response(stream_with_context(generate()), content_type='multipart/x-mixed-replace; boundary=frame')

# @app.route('/proxy_camera_snapshot/<string:camera>', methods=['GET'])
# def proxy_camera_snapshot(camera):
#     """
#     Proxy snapshot of camera image via ROS2 Web Server.
#     """
#     topic = PROXY_CAMERA_TOPICS.get(camera)
#     if not topic:
#         return jsonify({'status': 'error', 'message': f'Camera topic \"{camera}\" not found'}), 404

#     snapshot_url = f"{ROS_CAMERA_BASE_URL}/snapshot?topic={topic}"
#     try:
#         response = requests.get(snapshot_url)
#         return Response(response.content, content_type='image/jpeg')
#     except requests.exceptions.RequestException as e:
#         return jsonify({'status': 'error', 'message': str(e)}), 500
    

# ------------------------------ Start the Server -------------------------------------

if __name__ == '__main__':
    print("Starting ROS2 Flask API Server...")
    app.run(host='0.0.0.0', port=5002, threaded=True)
