# Vision 60 AprilTag And Ghost Mission How-To

## Short Answer

Yes. You need printed fixed tags.

For Vision 60, use `tag36h11` because the on-robot Ghost tag detector is already configured for that family on the front-left rectified camera.

Do not switch to `tag16h5` unless you also change the detector configuration.

## Exact Tags To Download

Recommended building relocalization IDs:

- `tag36_11_00000.png`
- `tag36_11_00001.png`
- `tag36_11_00002.png`
- `tag36_11_00003.png`
- `tag36_11_00004.png`
- `tag36_11_00005.png`
- `tag36_11_00006.png`
- `tag36_11_00007.png`
- `tag36_11_00008.png`
- `tag36_11_00009.png`
- `tag36_11_00010.png`
- `tag36_11_00011.png`
- `tag36_11_00012.png`
- `tag36_11_00013.png`
- `tag36_11_00014.png`
- `tag36_11_00015.png`

Direct folder:

- https://github.com/AprilRobotics/apriltag-imgs/tree/master/tag36h11

Direct raw file pattern:

- `https://raw.githubusercontent.com/AprilRobotics/apriltag-imgs/master/tag36h11/tag36_11_00000.png`

Change the last number to `00001`, `00002`, and so on.

## Pack Generator

After you download the PNGs into one folder, CommandCenter now includes a generator script:

- [generate_apriltag_pack.py](../tools/generate_apriltag_pack.py)

Example:

```bash
python3 tools/generate_apriltag_pack.py \
  /path/to/tag36h11_pngs \
  --site-name building_a \
  --prefix hall \
  --size-mm 180
```

That generates:

- `manifest.json`
- `manifest.csv`
- `apriltag.yaml`
- `tag_map.yaml`
- `printable_tags.pdf`
- `printable_contact_sheet.pdf`
- `README.md`

Default output folder:

- `<input-folder>/generated_pack`

Important:

- print one sample page first
- verify the black-square size with a ruler
- then print the full pack

## Reserved IDs

Do not use IDs `340-345` for hallway or room tags.

Ghost already uses those for a dock bundle at `0.24 m`.

If you need those exact dock files later, they are:

- `tag36_11_00340.png`
- `tag36_11_00341.png`
- `tag36_11_00342.png`
- `tag36_11_00343.png`
- `tag36_11_00344.png`
- `tag36_11_00345.png`

Use this split:

- building relocalization tags: `0-15`
- reserved dock bundle: `340-345`

## Vision 60 Paths Already On Robot

Confirmed Ghost paths:

- detector launch: `/home/ghost/current_ros2/share/ghost_tag_detector/launch/`
- detector config templates: `/home/ghost/current_ros2/share/ghost_tag_detector/config/`
- expected persistent config: `/home/ghost/.apriltag_configs/default/apriltag.yaml`

Confirmed camera topics already used by Ghost:

- image: `/argus/ar0234_front_left/rect/image_raw`
- camera info: `/argus/ar0234_front_left/rect/camera_info`

Confirmed family already configured:

- `tag36h11`

Important note:

- the expected `.apriltag_configs/default/` directory was not present when the robot was inspected, so you may need to create it.

## Printing Rules

1. Print on matte paper or matte adhesive vinyl.
2. Mount to rigid flat backing.
3. Do not use glossy laminate.
4. Measure the actual printed tag size.
5. Put the exact measured size into the tag config.

Good starting size:

- `0.18 m`

Use larger tags in long corridors or atriums:

- `0.24 m` to `0.30 m`

## Where To Place Tags

Best first placements:

1. building entrances
2. hallway intersections
3. dock or charging approach
4. mission-critical room entrances
5. long feature-poor corridors
6. key relocalization choke points

Avoid:

- glossy walls
- moving doors
- heavy occlusion areas
- cluttered corners

## How Tag Mapping Works

Each fixed tag needs two things:

1. detector config entry:
   - `id`
   - `size`
   - `family`
   - optional `name`
2. site map entry:
   - `id`
   - `x`
   - `y`
   - `z`
   - `yaw`
   - wall/location label

Runtime flow:

1. Ghost detects the tag in camera frame.
2. You already know the static transform from `base_link` to camera.
3. You already know the fixed `map -> tag` pose from your building survey.
4. Solve `map -> base_link`.
5. If localization is degraded, publish `/initialpose`.

Important:

- do not relocalize on every frame
- use tags when confidence is low, after manual repositioning, or during explicit recovery

## Your Current Setup

Based on what you provided, the first-pass Ghost setup is:

- family: `tag36h11`
- size: `6.5 in` printed black-square edge, which is `0.1651 m`
- IDs: `0` through `15`
- `tag 00000`: lab

This is enough to start a basic detector config even before the full site map is finished.

## Example Detector Config

Example content for `/home/ghost/.apriltag_configs/default/apriltag.yaml`:

```yaml
tag_family: tag36h11
publish_tf: true
image_msgs_decimation: 1
publish_tag_detections_image: true

standalone_tags:
  - id: 0
    size: 0.1651
    name: lab
  - id: 1
    size: 0.1651
    name: tag_01
  - id: 2
    size: 0.1651
    name: tag_02
  - id: 3
    size: 0.1651
    name: tag_03
  - id: 4
    size: 0.1651
    name: tag_04
  - id: 5
    size: 0.1651
    name: tag_05
  - id: 6
    size: 0.1651
    name: tag_06
  - id: 7
    size: 0.1651
    name: tag_07
  - id: 8
    size: 0.1651
    name: tag_08
  - id: 9
    size: 0.1651
    name: tag_09
  - id: 10
    size: 0.1651
    name: tag_10
  - id: 11
    size: 0.1651
    name: tag_11
  - id: 12
    size: 0.1651
    name: tag_12
  - id: 13
    size: 0.1651
    name: tag_13
  - id: 14
    size: 0.1651
    name: tag_14
  - id: 15
    size: 0.1651
    name: tag_15
```

## How To Test It

Test the setup in this order:

1. Print only tag 00000 first and measure the black-square edge after printing.
2. Confirm the measured size is still close to 0.1651 m.
3. Copy the config to `/home/ghost/.apriltag_configs/default/apriltag.yaml`.
4. Start the Ghost AprilTag detector with the normal Vision 60 front-left camera topics.
5. Put tag 00000 in the lab and point the camera at it from a normal working distance.
6. Confirm the detector reports the correct ID and the pose is stable for several seconds.
7. Move the camera slowly left, right, closer, and farther to make sure the pose stays consistent.
8. Print and mount one more tag, then confirm the detector sees both IDs correctly.
9. After that, fill in the real location names and map poses for the rest of IDs 1 through 15.

Pass criteria:

- the tag ID is correct
- the pose does not jump around badly
- the tag is detected at the intended working distance
- the measured print size matches the config size

## Example Site Tag Map

Keep a separate site map file such as `tag_map.yaml`:

```yaml
family: tag36h11
tags:
  - id: 0
    name: entry_north
    size: 0.18
    pose:
      x: 2.10
      y: -0.35
      z: 1.55
      yaw: 1.57
  - id: 1
    name: hall_a
    size: 0.18
    pose:
      x: 8.40
      y: 3.20
      z: 1.50
      yaw: 0.00
```

## New CommandCenter Ghost Endpoints

New backend routes in [move13.py](../backend/move13.py):

- `GET /ghost/status`
- `GET /ghost/scripts`
- `POST /ghost/mission/run`
- `POST /ghost/mission/start`
- `POST /ghost/mission/pause`
- `POST /ghost/mission/unpause`
- `POST /ghost/mission/cancel`
- `POST /ghost/lidar/activate`
- `POST /ghost/lidar/relocalize`
- `POST /ghost/lidar/activate_apriltag`
- `POST /ghost/lidar/planner`
- `POST /ghost/lidar/mpc_lio_obs`
- `POST /ghost/lidar/save_map`
- `GET /ghost/maps`
- `GET /ghost/maps/preview/<filename>`
- `GET /ghost/metrics`

## How To Use The New Ghost Controls

### 1. Start lidar odometry

```bash
curl -X POST http://<vision60-ip>:5002/ghost/lidar/activate
```

### 2. Restart relocalization before route record or replay

```bash
curl -X POST http://<vision60-ip>:5002/ghost/lidar/relocalize
```

### 3. Launch the built-in lidar route recording flow

```bash
curl -X POST http://<vision60-ip>:5002/ghost/mission/run \
  -H 'Content-Type: application/json' \
  -d '{"script":"record_lidar_route_reloc"}'
```

### 4. Start mission execution

```bash
curl -X POST http://<vision60-ip>:5002/ghost/mission/start
```

### 5. Save the current lidar map

```bash
curl -X POST http://<vision60-ip>:5002/ghost/lidar/save_map \
  -H 'Content-Type: application/json' \
  -d '{
    "destination": "/home/ghost/gps_denied_maps/site_a",
    "resolution": -30.0
  }'
```

### 6. Inspect saved maps and previews

```bash
curl http://<vision60-ip>:5002/ghost/maps
```

## Operator Workflow For GPS-Denied Indoor Use

1. Activate LIO.
2. Restart relocalization.
3. Wait for a valid relocalization status.
4. If needed, set manual `/initialpose`.
5. Start the Ghost mission.
6. If the robot drifts or “lands in a wall,” reacquire a known tag or restart relocalization before continuing.
7. Save a fresh map only after the run is stable.

## Why The Robot Ends Up “In A Wall”

Most likely causes on this platform:

1. route record or replay started before relocalization completed
2. replaying against the wrong saved map origin
3. indoor symmetry causing lidar scan matching to choose a wrong local minimum
4. no absolute correction tag near the failure area

Tags help because they give an absolute anchor at known map locations.
