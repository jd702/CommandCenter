# Vision 60 Ghost Stack Findings

## Confirmed On Robot

Host inspected:

- `ROBOT_USER@ROBOT_HOST`

Core ROS 2 install:

- `/home/ghost/current_ros2`

## Mission Interfaces

Confirmed topics and interfaces:

- `/mm/run_mission` using `std_msgs/msg/String`
- `/command/start_mission`
- `/command/pause_mission`
- `/command/unpause_mission`
- `/command/cancel_mission`
- `/mission_control/status` using `mission_interfaces/msg/MissionControlStatus`
- `mission_interfaces/action/ExecuteMission.action`

Important conclusion:

- Vision 60 already has a mission stack.
- CommandCenter should bridge to Ghost mission execution instead of relying only on a synthetic local queue.

## Lidar And Relocalization

Confirmed services and topics:

- `/activate_lio`
- `/deactivate_lio`
- `/restart_lio`
- `/activate_relocalization`
- `/deactivate_relocalization`
- `/restart_relocalization`
- `/lio_sam/save_map`
- `/lio_sam/relocalization/status`

`ghost_slam_msgs/srv/SaveMap.srv` fields:

- `float32 resolution`
- `string destination`
- returns `bool success`

Important conclusion:

- The intended Ghost workflow is to activate lidar odometry, restart relocalization, wait for lock, and only then record or replay GPS-denied routes.

## Mission Script Evidence

Confirmed useful built-in missions:

- `Missions/Odometry/LioStart.txt`
- `Missions/Odometry/RelocalizeRestart.txt`
- `Missions/Odometry/LioSaveMap.txt`
- `Missions/Record/RecordLidarRouteReloc.txt`

Key behavior from those scripts:

- start ouster
- start LIO-SAM
- restart relocalization
- wait for relocalization
- then record lidar route

Important conclusion:

- The “robot thinks it is in a wall” failure is consistent with route record/replay happening before relocalization has actually converged, or against the wrong saved map origin.

## Point Cloud And Map Assets

Confirmed topics:

- `/mcu/state/pointcloud`
- `/mcu/state/obstmap`
- `/mcu/state/heightmap`
- `/obstacle_map/status`
- `/mpc/current_path_index`

Confirmed map directory:

- `/home/ghost/gps_denied_maps`

Observed files:

- `Latest.pcd`
- `Latest.png`
- `global_map_2025-10-23_16-11.pcd`
- matching `global_map_*.png` previews

Meaning:

- `.pcd` files are the actual saved lidar maps
- `.png` files are operator preview images

Important conclusion:

- CommandCenter should show both the live cloud and the saved map previews side by side.
- Full-resolution PCDs are too heavy for routine UI rendering and need preview/downsample handling.

## AprilTag Stack

Confirmed packages and paths:

- `/home/ghost/current_ros2/share/ghost_tag_detector/launch/`
- `/home/ghost/current_ros2/share/ghost_tag_detector/config/`

Confirmed camera topics already used by the tag detector:

- image: `/argus/ar0234_front_left/rect/image_raw`
- camera info: `/argus/ar0234_front_left/rect/camera_info`

Confirmed family already configured:

- `tag36h11`

Expected persistent config path:

- `/home/ghost/.apriltag_configs/default/apriltag.yaml`
- `/home/ghost/.apriltag_configs/default/dock_bundle_to_dock.launch.py`

Observed state:

- that `.apriltag_configs` directory was not present during inspection

Dock bundle reservation already in Ghost config:

- IDs `340-345`
- size `0.24 m`

Important conclusions:

- Use `tag36h11`, not `tag16h5`, for Vision 60 indoor relocalization.
- Do not reuse `340-345` for hallway or room tags.
- Use a separate building tag range like `0-15` or `0-31`.

## Recommended Integration Direction

CommandCenter should provide:

1. Ghost mission bridge:
   - run named mission scripts
   - start, pause, unpause, cancel
2. Lidar control panel:
   - activate LIO
   - restart relocalization
   - save map
   - show relocalization status
   - show current odom source
3. Lidar metrics:
   - cloud point count
   - cloud age
   - map save state
   - relocalization state
   - planner path index
4. Map assets:
   - latest preview image
   - previous saved previews
   - saved map file list
5. AprilTag setup docs:
   - exact file names
   - reserved IDs
   - config paths
   - placement and mapping workflow
