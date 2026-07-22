# Vision 60 Indoor Localization and Planner Roadmap

## Update After Live Vision 60 Inspection

The robot already exposes a Ghost-native mission and lidar stack. The most useful interfaces found on the live system are documented in [Vision60_Ghost_Findings_Report.md](Vision60_Ghost_Findings_Report.md).

That changes the implementation direction:

- prefer Ghost mission execution over a synthetic queue
- prefer Ghost lidar/relocalization services over a generic abstract control layer
- keep Nav2-style abstractions only as a compatibility layer if another robot needs them

## What exists now in CommandCenter

From the current backend:

- `POST /mpc/goal` publishes velocity goals to `/mpc/goal` in planner mode 160.
- `POST /command/send_local_goal` publishes `PoseStamped` goals to `/move_base_simple/goal` in planner mode 140.
- `POST /command/send_goal` accepts GPS lat/lon and converts that into a local goal path.
- MBLink low-level telemetry is partially bridged through `backend/mblink_adapter.py`.

Relevant local files:

- `backend/move13.py`
- `backend/mblink_adapter.py`
- `docs/GhostSDK_Integration_Gaps.md`

## What is still missing

### 1. Mission-level planner goals

Current code can publish one local goal or one MPC twist, but it does not provide:

- a waypoint queue
- cancel / pause / resume
- goal status feedback
- planner result codes
- retry / fallback behavior
- action-level integration with `nav2`

The current stack is publishing topics directly, not using Nav2 action servers.

### 2. Real Nav2 integration

There is no evidence in this repo of:

- `navigate_to_pose`
- `follow_waypoints`
- `follow_gps_waypoints`
- planner/controller recovery feedback
- costmap inspection
- localization status exposure

That means CommandCenter is not yet acting like a true Nav2 mission client.

### 3. Indoor GPS-denied localization workflow

You already have lidar map capture and point cloud display, but there is no explicit indoor relocalization layer:

- no `/initialpose` publisher
- no localization-confidence monitor
- no relocalization trigger
- no map/session manager for indoor maps
- no landmark-based absolute correction

This is the main reason the robot can end up "thinking it is in a wall" indoors. The stack drifts, scan matching converges to the wrong local minimum, and there is no absolute anchor to pull it back.

### 4. Security payload fusion

For the lidar security payload, what is missing is not raw sensing. What is missing is fusion and state management:

- fuse lidar odom + IMU + leg/body odom in `robot_localization`
- expose localization covariance / confidence
- freeze or degrade autonomy when localization quality drops
- relocalize from a landmark or operator-selected pose
- store separate indoor maps and entry poses per site

## Recommended feature additions

### Highest priority

1. Add Nav2 action clients in the backend
2. Add indoor relocalization support
3. Add waypoint missions with operator feedback
4. Add localization health to the UI

### Good additions after that

1. Map manager
2. Site presets for indoor and outdoor parameter sets
3. Recovery actions
4. Security-payload task plugins at waypoints

## What to build for planner goals

Implement a backend service that talks to Nav2 actions instead of only publishing topics.

Recommended actions:

- `nav2_msgs/action/NavigateToPose`
- `nav2_msgs/action/FollowWaypoints`
- `nav2_msgs/action/FollowGPSWaypoints`

The point is to get:

- accepted / rejected state
- progress feedback
- result codes
- cancellation
- retries

For Vision 60 this matters because direct topic publication gives almost no mission visibility.

## What to build for indoor localization

### Preferred architecture

1. Use lidar SLAM to build the indoor map
2. Save a serialized pose-graph, not only a flat occupancy map
3. Run localization mode indoors
4. Fuse wheel or leg odom, IMU, and lidar-derived pose
5. Add AprilTags at choke points, halls, doors, charging area, and mission-critical rooms
6. When a tag is seen, compute a corrected map-frame pose and republish `/initialpose` or inject the pose into the estimator

### Why this is better than GPS fallback

GPS-denied indoor operation needs occasional absolute anchors. Lidar scan matching alone is weak in:

- symmetric hallways
- blank walls
- glass
- dynamic furniture
- feature-poor corridors

AprilTags solve the "where am I globally?" problem at known places. Lidar still does the continuous local motion estimation between those anchors.

## Whether AprilTag can help

Yes, but not by itself.

AprilTag is useful as an absolute relocalization aid, not as the only localization source.

Use it for:

- initial indoor pose acquisition
- relocalization after drift
- recovery after kidnapping / manual repositioning
- docking / doorway / checkpoint verification

Do not use it as the only indoor localization method for full-building traversal unless tags are placed everywhere.

## Why AprilTag specifically fits this problem

The upstream AprilTag 3 repository states:

- it is faster than AprilTag 2
- it improves detection on small tags
- it provides pose estimation
- it supports multiple tag families

The ROS 2 wrappers publish TF and detections from rectified camera images plus camera intrinsics. That makes it practical to attach a camera to Vision 60 and turn tag sightings into map-frame corrections.

## Best ROS 2 implementation path

Use a ROS 2 AprilTag wrapper, not the bare C library directly.

Recommended wrapper choice:

- `christianrauch/apriltag_ros` if you want a straightforward ROS 2 node with TF and detection outputs
- `Adlink-ROS/apriltag_ros` if that branch matches your distro and camera launch needs better

For this use case, the `christianrauch` package is the cleaner fit because it explicitly documents:

- subscription to rectified images and `camera_info`
- TF output
- detection arrays
- per-tag frame naming
- tag-size configuration

## Vision 60 implementation plan

### Sensors and frames

You need:

- one calibrated camera rigidly mounted to the robot body
- a static transform from `base_link` to the camera frame
- a known transform from each fixed tag to `map`

Then each detection gives:

- `map -> tag`
- `tag -> camera`
- `camera -> base_link`

which yields:

- `map -> base_link`

That becomes your relocalization pose.

### Concrete ROS graph

Suggested nodes:

1. lidar mapping/localization node
   - `slam_toolbox` in mapping mode when building the map
   - `slam_toolbox` in localization mode indoors after map creation

2. state estimation
   - `robot_localization` EKF or UKF
   - inputs: IMU, body odom, lidar odom

3. AprilTag detection
   - `apriltag_ros`
   - inputs: rectified camera image + camera info
   - outputs: detections + `/tf`

4. tag relocalization bridge
   - custom node
   - converts trusted tag detections into `PoseWithCovarianceStamped`
   - publishes `/initialpose` or estimator corrections

5. Nav2
   - uses the corrected `map -> odom` / `map -> base_link` chain

### Tag relocalization logic

Only relocalize when:

- detection margin is good
- tag size and camera calibration are correct
- tag is from an allowlist of fixed tags
- robot speed is low or zero
- covariance is currently bad, or operator requested recovery

Avoid resetting pose on every tag frame. That causes localization jumps.

Recommended behavior:

- if localization confidence is healthy: use tag as a soft consistency check
- if confidence is poor: use tag to republish `/initialpose`
- if repeated failures occur: stop autonomy, ask for relocalization or rotate in place to reacquire a tag

## Why your current relocalization likely fails

Most likely causes:

1. map and live scan are not aligned because the initial pose is wrong
2. indoor environment is too symmetric for AMCL-style matching
3. odometry drift is too high before scan matching can recover
4. the robot body footprint or lidar origin is mis-modeled
5. there is no absolute landmark correction
6. GPS-derived map assumptions are leaking into indoor operation

The "in a wall" symptom usually means the estimator has converged to a wrong but locally plausible pose.

## Recommended stack choice

### If you want minimal change

- keep current lidar map workflow
- add `apriltag_ros`
- add a custom relocalization node
- publish `/initialpose` from tag sightings
- add Nav2 action clients to CommandCenter

### If you want the more robust indoor stack

- use `slam_toolbox` localization mode with serialized pose-graphs
- fuse IMU + body odom + lidar odom in `robot_localization`
- use AprilTags only for absolute correction and recovery
- use Nav2 waypoint follower for missions

This is the better architecture for Vision 60 indoors.

## Immediate engineering tasks for this repo

### Backend

1. Add a Nav2 action client service layer
2. Add endpoints for:
   - start waypoint mission
   - cancel mission
   - get mission status
   - publish `/initialpose`
   - report localization health
3. Add map/site profile handling
4. Add AprilTag relocalization event logging

### UI

1. Mission queue panel
2. Localization status panel
3. Indoor/outdoor profile selector
4. Relocalize button
5. Current map and last trusted tag display

### ROS integration

1. Camera calibration
2. Static TF for camera mount
3. AprilTag node launch
4. Custom tag-to-map relocalization node
5. Nav2 action client bridge

## Practical recommendation

Do not try to make indoor relocalization depend on GPS.

For Vision 60 indoors, the reliable pattern is:

- lidar for continuous local localization
- IMU/body odom for short-term motion stability
- AprilTags for absolute pose resets at known landmarks
- Nav2 actions for actual missions

That will be much more robust than trying to coerce a GPS-oriented flow to work indoors.

## Sources

- AprilTag upstream repository: https://github.com/AprilRobotics/apriltag
- ROS 2 AprilTag wrapper: https://github.com/christianrauch/apriltag_ros
- Alternate ROS 2 AprilTag wrapper: https://github.com/Adlink-ROS/apriltag_ros
- Nav2 waypoint follower docs: https://docs.ros.org/en/iron/p/nav2_waypoint_follower/index.html
- Nav2 AMCL docs: https://docs.ros.org/en/humble/p/nav2_amcl/
- slam_toolbox docs: https://docs.ros.org/en/ros2_packages/jazzy/api/slam_toolbox/
