#!/usr/bin/env python3
"""
ROS2 Flask API Server
This server allows frontend applications to control a ROS2 robot
via REST API endpoints.
"""

from flask import Flask, jsonify, request, Response, stream_with_context
from flask_cors import CORS
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
import cv2
import threading
import time
import requests
# import pyttsx3
import subprocess
from pyproj import CRS, Transformer
import pyproj
from rclpy.executors import MultiThreadedExecutor
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

# ----------------------------- ROS2 Node Class -----------------------------------

latest_obstmap = []

class ObstacleMapListener(Node):
    def __init__(self):
        super().__init__('obstacle_map_listener')
        self.points_compressor = PointCloudCompressor(hilbert_order=3)
        self.subscription = self.create_subscription(
            PointCloud2,
            '/mcu/state/obstmap',
            self.callback,
            10
        )

    def callback(self, msg):
        global latest_obstmap
        points = []
        for point in pc2.read_points(msg, skip_nans=True, field_names=("x", "y", "z")):
            points.append({
                "x": point[0], "y": point[1], "z": point[2],
                "r": 255, "g": 100, "b": 100
            })
        latest_obstmap = points
latest_pointcloud = []

class PointCloudListener(Node):
    def __init__(self):
        super().__init__('pointcloud_listener')
        self.subscription = self.create_subscription(PointCloud2, '/mcu/state/pointcloud', self.callback, 10)
        self.points_compressor = PointCloudCompressor(hilbert_order=3)

    def callback(self, msg):
        global latest_pointcloud
        points = []
        for point in pc2.read_points(msg, skip_nans=True, field_names=("x", "y", "z")):
            hilbert_result = self.points_compressor.compress_point_cloud(
                np.column_stack([point[0],point[1],point[2]]),
                np.column_stack([100,255,100]) )
            points.append({
                "x": point[0], "y": point[1], "z": point[2],
                "r": 100, "g": 255, "b": 100
            })
            print(f"Hilbert curve points: {hilbert_result}")
        latest_pointcloud = points

class RobotCommandPublisher(Node):
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

@app.route("/obstmap")
def get_obstmap():
    if not latest_obstmap:
        return jsonify({"points": [], "status": "waiting for data"}), 200
    return jsonify({"points": latest_obstmap})

@app.route("/pointcloud")
def get_pointcloud():
    if not latest_pointcloud:
        return jsonify({"points": [], "status": "waiting for data"}), 200
    return jsonify({"points": latest_pointcloud})

#
@app.route("/mapdata")
def get_combined_map():
    return jsonify({
        "obstmap": latest_obstmap,
        "pointcloud": latest_pointcloud
    })

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


@app.route('/command/send_goal', methods=['POST'])
def send_goal():
    """
    Send a global GPS waypoint goal to /move_base_simple/goal
    Requires control_mode=140 and action=2
    """
    data = request.get_json()
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
    ros2_node.send_goal_pose(lat, lng, z)

    return jsonify({'status': 'success', 'message': f'Goal sent to robot at ({lat}, {lng}, {z})'}), 200


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
}

@app.route('/proxy_camera_feed/<string:camera>', methods=['GET'])
def proxy_camera_feed(camera):
    """
    Proxy stream camera feed via ROS2 Web Server.
    """
    topic = PROXY_CAMERA_TOPICS.get(camera)
    if not topic:
        return jsonify({'status': 'error', 'message': f'Camera topic \"{camera}\" not found'}), 404

    stream_url = f"{ROS_CAMERA_BASE_URL}/stream_viewer?topic={topic}"

    def generate():
        try:
            with requests.get(stream_url, stream=True) as r:
                for chunk in r.iter_content(chunk_size=1024):
                    if chunk:
                        yield chunk
        except requests.exceptions.RequestException as e:
            yield f"Error streaming from remote server: {str(e)}".encode()

    return Response(stream_with_context(generate()), content_type='multipart/x-mixed-replace; boundary=frame')

@app.route('/proxy_camera_snapshot/<string:camera>', methods=['GET'])
def proxy_camera_snapshot(camera):
    """
    Proxy snapshot of camera image via ROS2 Web Server.
    """
    topic = PROXY_CAMERA_TOPICS.get(camera)
    if not topic:
        return jsonify({'status': 'error', 'message': f'Camera topic \"{camera}\" not found'}), 404

    snapshot_url = f"{ROS_CAMERA_BASE_URL}/snapshot?topic={topic}"
    try:
        response = requests.get(snapshot_url)
        return Response(response.content, content_type='image/jpeg')
    except requests.exceptions.RequestException as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500
    

# ------------------------------ Start the Server -------------------------------------

if __name__ == '__main__':
    print("Starting ROS2 Flask API Server...")
    app.run(host='0.0.0.0', port=5002, threaded=True)


