#!/usr/bin/env python3
"""
ROS2 Flask API Server
This server allows frontend applications to control a ROS2 robot
via REST API endpoints.
"""

from flask import Flask, jsonify, request, Response, stream_with_context, make_response
from flask_cors import CORS
from prometheus_client import CollectorRegistry, Gauge, Counter, Histogram, generate_latest, CONTENT_TYPE_LATEST
import rclpy
from rclpy.node import Node
from geometry_msgs.msg import Twist, Pose, PoseStamped
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

import requests
# import pyttsx3
import subprocess
from pyproj import CRS, Transformer
import pyproj
from rclpy.executors import MultiThreadedExecutor


import base64
import numpy as np

from math import sin, cos  # add

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

# Mutex lock to prevent race conditions on shared robot state
command_mutex = threading.Lock()

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
        global latest_obstmap
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
            self.get_logger().info(f"ObstMap points: {len(latest_obstmap)}")
        except Exception as e:
            self.get_logger().error(f"ObstacleMapListener error: {e}")
            


class PointCloudListener(Node):
    def __init__(self):
        super().__init__('pointcloud_listener')
        self.subscription = self.create_subscription(PointCloud2, '/mcu/state/pointcloud', self.callback, low_latency_qos)
        self.points_compressor = PointCloudCompressor(hilbert_order=3)


    def callback(self, msg):
        global latest_pointcloud
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
            self.get_logger().info(f"PointCloud points: {len(latest_pointcloud)}")
        except Exception as e:
            self.get_logger().error(f"PointCloudListener error: {e}")


class RobotCommandPublisher(Node):


        # ---------- Control-mode & planner helpers ----------

    def _set_control_mode(self, mode: int, sleep_s: float = 0.1):
        msg = UInt32(); msg.data = mode
        self.control_mode_pub.publish(msg)
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

        tw = Twist()
        tw.linear.x = vx; tw.linear.y = vy; tw.linear.z = 0.0
        tw.angular.x = 0.0; tw.angular.y = 0.0; tw.angular.z = wz
        self.mpc_goal_pub.publish(tw)
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
        self._mpc_hold_enabled = False
        self._last_mpc_twist = None

        # keep MPC setpoints alive at 10Hz
        self.create_timer(0.1, self._mpc_hold_tick)

        # Subscriptions to robot state feedback
        self.create_subscription(String, '/mcu/state/robotVersion', self.ghost_status_callback, 10)
        self.create_subscription(String, '/mcu/state/battery', self.ghost_battery_callback, 10)
        self.create_subscription(Imu, '/gx5/imu/data', self.ghost_imu_callback, 10)
        self.create_subscription(NavSatFix, '/gx5/gnss1/fix', self.ghost_gps_callback, 10)
        self.create_subscription(Odometry, '/gx5/nav/odom', self.odom_callback, 10)

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
            time.sleep(0.1)

        # Stop robot after movement
        twist.linear.x = 0.0
        twist.linear.y = 0.0
        twist.angular.z = 0.0
        self.manual_twist_pub.publish(twist)
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
            speak("Manual mode activated")  # speak for switch to manual mode
            return jsonify({'status': 'success', 'message': 'Manual Mode Activated'}), 200

        # Return robot to original mode
        elif topic == "/command/return_to_original_mode":
            msg = UInt32(data=180)
            ros2_node.control_mode_pub.publish(msg)
            speak("Original mode restored") # speak for original mode
            return jsonify({'status': 'success', 'message': 'Original Mode Restored'}), 200

        # Perform an action (sit, stand, walk)
        elif topic == "/command/setAction":
            action_map = {"walk": 2, "sit": 0, "stand": 1}
            action = params.get("action")
            if action in action_map:
                msg = UInt32(data=action_map[action])
                ros2_node.action_pub.publish(msg)
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

ROS_CAMERA_BASE_URL = 'http://192.168.168.105:8080'


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



