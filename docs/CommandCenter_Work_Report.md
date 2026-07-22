# Command Center Work Report

## Purpose

This report summarizes the work completed across the Command Center project so it can be presented in a meeting as a delivered-capabilities review.

Run instructions for Command Center and its major feature services are documented in:

- [docs/CommandCenter_Run_Guide.md](../docs/CommandCenter_Run_Guide.md)

Important note:

- This checkout currently shows `No commits yet on main`, so this report is reconstructed from the implemented code, shipped pages, backend endpoints, helper scripts, and project documentation in the repository.
- Where possible, the report reflects the current delivered system rather than an inferred roadmap.

## Executive Summary

The Command Center project evolved into a multi-modal robot operations platform centered on Vision 60 / Ghost Robotics support, with additional simulation, sensing, and operator tooling. The delivered work spans:

- a React-based operator console with a unified sidebar and multiple mission pages
- ROS2 and Flask backend integration for robot command and telemetry
- Ghost mission bridging and lidar/relocalization controls
- point cloud streaming, compression, and 3D visualization
- audio and camera data collection interfaces
- image/data transformation tooling
- live robot tracking and map-based situational awareness
- gesture-driven control from a GPU laptop
- voice-driven control using Whisper
- OpenAMASE simulation monitoring and command injection
- AprilTag and indoor localization support assets, docs, and utilities
- MBLink/GhostSDK telemetry integration and low-level operator controls

## Core Product Areas Delivered

### 1. Main operator shell and navigation

The main Command Center UI is organized around a reusable shell in [src/pages/MainHub.js](../src/pages/MainHub.js) with a Material UI app bar, drawer, page routing, and operator navigation.

Delivered user-facing sections include:

- Home
- Sensor Audio Collection
- Camera Visual Data Collection
- Tasking
- Settings
- History Data
- Data Transformation
- ROS2 Agents
- Agent Tracker
- Gesture Control
- Sim Dashboard

This gave the project a single operator-facing workspace instead of separate ad hoc utilities.

### 2. Tasking and mission-control commands

The Tasking module in [src/pages/Tasking.js](../src/pages/Tasking.js) delivers:

- robot selection for Jackal, Husky, and sensor endpoints
- predefined command templates
- freeform command submission
- server health polling
- command output display
- persisted command history through shared context/local storage

This work established the baseline operator workflow for issuing commands and tracking what was sent.

### 3. Settings and operational history

Support pages were added to improve usability and repeatability:

- [src/pages/SettingsPage.js](../src/pages/SettingsPage.js) for updating Flask/tasking endpoint configuration
- [src/pages/History.js](../src/pages/History.js) for operator command history review
- context providers in [src/context/IpContext.js](../src/context/IpContext.js), [src/context/IpContext2.js](../src/context/IpContext2.js), and [src/context/CommandListContext.js](../src/context/CommandListContext.js)

This gave the system environment awareness, basic persistence, and a trace of operator actions.

### 4. Sensor audio collection workflow

The Sensor Audio Collection page in [src/pages/SensorAudioCollection.js](../src/pages/SensorAudioCollection.js) provides:

- socket-driven live result streaming
- classification result tables with probability display
- anomaly/not-anomaly presentation
- inline playback of captured `.wav` files
- text-to-speech playback of predicted class labels
- session reset/start-stop flow for capture/classification

This work turned audio collection into an operator-visible pipeline instead of a backend-only process.

### 5. Camera visual data collection workflow

The Camera Visual Data Collection page in [src/pages/CameraVisualDataCollection.js](../src/pages/CameraVisualDataCollection.js) provides:

- live result streaming over sockets
- prediction and anomaly display
- image result table
- start/stop image capture control
- connection-state feedback for camera processing

This created a matching visual collection workflow alongside the audio pipeline.

### 6. Data transformation and augmentation tools

The main data transformation implementation is the in-app page in
[src/pages/DataTransformation.js](../src/pages/DataTransformation.js).

Delivered capabilities include:

- multi-image upload
- drag-and-drop upload flow
- image preview canvas
- selectable transforms and augmentations
- configurable parameters for blur, noise, rotation, flip, posterize, cutout, erode, dilate, edge detection, and brightness/contrast adjustment
- side-by-side original/processed comparison
- backend submission to a local processing service

This is important to mention in the meeting because it shows the project was not only focused on robot control, but also on dataset preparation and sensor-data conditioning.

### 7. Data transformation backend and deployment support

The image/data-transformation UI in Command Center is wired to a Flask-style augmentation service on `localhost:5000` that accepts multipart image uploads and serves processed outputs back from `/processed/...`.

From the SSD backup, the matching service is the older Augmentor backend in:

- the Augmentor service application from the local project backup
- the Augmentor service Dockerfile from the local project backup

That backup service matches the Command Center frontend contract because it:

- accepts `POST /` with uploaded `file` entries
- applies the same augmentation flags used by `src/pages/DataTransformation.js`
- returns processed file metadata
- serves outputs from `/processed/<filename>`

Separate from that, the repository also includes a standalone Flask service in [flask/server.py](../flask/server.py) for Hilbert space-filling curve point-cloud compression experiments and API serving.

Related infrastructure work includes:

- local API serving for transformation/compression workflows
- container-aware configuration comments in [src/context/IpContext.js](../src/context/IpContext.js), which expects config to be mounted when deployed in a container
- frontend/backend separation suitable for local service deployment

Important clarification for the meeting:

- I did not find a checked-in Docker artifact for the current Command Center repo itself.
- I verified a Dockerized Augmentor backend in the local project backup; it is the data-transformation service integrated with Command Center.
- The `flask/server.py` service in this repo is not the image augmentor; it is the Hilbert compression service for point-cloud data.

### 8. ROS2 Agents operations console

The largest delivered feature area is the ROS2/Ghost operator console in [src/pages/Ros2Agents.js](../src/pages/Ros2Agents.js), backed by [backend/move13.py](../backend/move13.py).

Delivered capabilities include:

- direct robot control commands
- movement duration controls
- action commands such as sit, stand, and walk
- E-stop, rollover, run mode, and gait controls
- autonomous planner movement requests
- GPS goal submission
- local goal submission
- vision-mode enablement
- camera selection across many Vision 60 camera feeds
- live stream and snapshot modes
- auto-refresh snapshot mode
- IMU, odometry, battery, and status polling
- camera proxy integration

This work is the core of the robot command-and-observe experience in Command Center.

### 9. Keyboard teleoperation

Within the ROS2 Agents page, keyboard-driven control support was added:

- multiple keybinding profiles
- backend keyboard enable/disable handling
- adjustable forward/strafe/turn/turbo tuning
- active-key monitoring
- stop behavior and turbo support

This improves operator speed during live testing and manual intervention.

### 10. Ghost mission bridge

A major upgrade was the move from generic control to Ghost-native mission integration.

Frontend support in [src/pages/Ros2Agents.js](../src/pages/Ros2Agents.js) and backend support in [backend/move13.py](../backend/move13.py) deliver:

- Ghost script catalog and mission awareness
- run named mission scripts
- start, pause, unpause, and cancel mission controls
- mission runtime status display
- preferred use of native Ghost workflows over synthetic local queues

Supporting documentation is captured in [docs/Vision60_Ghost_Findings_Report.md](../docs/Vision60_Ghost_Findings_Report.md).

### 11. Lidar, relocalization, and indoor autonomy support

The project includes significant work for GPS-denied and indoor operations:

- lidar activation and relocalization controls
- relocalization status tracking
- planner path index tracking
- map-save controls and destination management
- map preview browsing for saved GPS-denied maps
- odom source visibility
- AprilTag activation/restart hooks

This is backed by [backend/move13.py](../backend/move13.py) plus planning documents:

- [docs/Vision60_Indoor_Localization_Plan.md](../docs/Vision60_Indoor_Localization_Plan.md)
- [docs/Vision60_Ghost_Findings_Report.md](../docs/Vision60_Ghost_Findings_Report.md)
- [docs/Vision60_AprilTag_HowTo.md](../docs/Vision60_AprilTag_HowTo.md)

This is one of the strongest “systems engineering” areas in the repo because it combines robot inspection findings, backend controls, UI exposure, and field workflow guidance.

### 12. Point cloud pipeline and Hilbert space-filling curve compression

The project includes substantial work on point cloud handling:

- live raw point cloud endpoint exposure
- obstacle map endpoint exposure
- compressed point cloud endpoints using Hilbert space-filling curve packing
- Prometheus-style metrics for payload size and encoding timing
- 3D point cloud rendering in the UI
- transport toggles between raw and compressed paths
- performance stats for wire size, parse time, decode time, and server encode time

Relevant files:

- [backend/move13.py](../backend/move13.py)
- [backend/hilbert.py](../backend/hilbert.py)
- [src/pages/PointCloudViewer.js](../src/pages/PointCloudViewer.js)
- [flask/server.py](../flask/server.py)

This is a notable technical accomplishment because it addresses both operator visualization and data transport efficiency using Hilbert space-filling curve ordering and packing.

### 13. MBLink / GhostSDK low-level telemetry integration

The project goes beyond high-level teleop and includes low-level Ghost integration work.

Implemented pieces include:

- low-level telemetry endpoint exposure
- passive MBLink ingest endpoint
- behavior control endpoint
- diagnostics bitfield decoding
- parameter get/set/readback endpoints
- joint telemetry ingestion
- frontend low-level telemetry panel
- behavior/mode/action visibility
- desired SE(2) twist display
- diagnostics preview
- parameter tools with feedback
- joint temperature/current/voltage summaries
- leg contact, phase, and swing information

Relevant files:

- [backend/move13.py](../backend/move13.py)
- [backend/mblink_adapter.py](../backend/mblink_adapter.py)
- [docs/GhostSDK_Integration_Gaps.md](../docs/GhostSDK_Integration_Gaps.md)
- [src/pages/Ros2Agents.js](../src/pages/Ros2Agents.js)

This is a good meeting highlight because it shows a shift from simple command sending to real robot-state introspection.

### 14. Agent live tracking

The Agent Tracker page in [src/pages/AgentTracker.js](../src/pages/AgentTracker.js) delivers:

- live map-centered tracking using Leaflet
- GPS polling
- status and battery polling
- IMU polling
- odometry polling
- map auto-follow to latest robot position
- telemetry cards under the live map

This gives Command Center a proper situational-awareness page for field use.

### 15. Gesture control system

The project includes a full gesture-control subsystem spanning UI, local API, and inference pipeline.

Frontend:

- [src/pages/GestureControl.js](../src/pages/GestureControl.js)

Backend/local control:

- [GestureControl_MMPOSE_YOLO/scripts/gesture_api.py](https://github.com/jd702/GestureControl/blob/main/scripts/gesture_api.py)
- [GestureControl_MMPOSE_YOLO/scripts/gesture_control.py](https://github.com/jd702/GestureControl/blob/main/scripts/gesture_control.py)

Delivered capabilities include:

- start/stop gesture pipeline from Command Center
- camera enumeration and camera switching
- support for ROS, proxy, and webcam camera modes
- GPU laptop inference workflow
- MMPose WholeBody + RTMDet integration
- gesture-to-command mapping for movement, stop, sit, and camera toggling
- stable-frame and cooldown logic to reduce accidental triggers
- local status and log-file tracking

Supporting runbooks and architecture docs were also created:

- [GestureControl_MMPOSE_YOLO/README.md](https://github.com/jd702/GestureControl/blob/main/README.md)
- [GestureControl_MMPOSE_YOLO/docs/architecture.md](https://github.com/jd702/GestureControl/blob/main/docs/architecture.md)
- [QUICKSTART.md](../QUICKSTART.md)

### 16. Voice control system

The project also includes a voice-control path using Whisper:

- [VoiceControl/VoiceControl4.py](https://github.com/jd702/VoiceControl/blob/main/VoiceControl4.py)
- [VoiceControl/README.md](https://github.com/jd702/VoiceControl/blob/main/README.md)
- [VoiceControl/INSTALLATION.md](https://github.com/jd702/VoiceControl/blob/main/INSTALLATION.md)

Delivered capabilities include:

- microphone capture on a laptop/PC
- Whisper transcription
- simple intent parsing for move/turn/action/mode/stop commands
- duration parsing from both digits and number words
- HTTP command submission into the robot backend
- optional laptop-side TTS feedback
- install/run documentation and architecture diagrams

This is another important example of the platform becoming multi-modal rather than strictly GUI-driven.

### 17. Simulation dashboard

The simulation page in [src/pages/SimDashboard.js](../src/pages/SimDashboard.js) delivers:

- Socket.IO connection to a local simulation bridge
- LMCP message handling
- AirVehicleState tracking
- SessionStatus display
- live vehicle list
- map visualization using [src/pages/MapView.js](../src/pages/MapView.js)
- operator command injection for `AutomationRequest`
- last-message debug panel

This extends Command Center beyond physical robot ops into simulation and testing workflows.

### 18. AprilTag workflow and tooling

AprilTag support is not just documented; it includes a concrete generation utility in [tools/generate_apriltag_pack.py](../tools/generate_apriltag_pack.py).

Delivered outputs from this utility include:

- manifest generation
- CSV export
- `apriltag.yaml`
- tag map YAML
- printable tag PDFs
- contact sheet PDFs

This is complemented by the detailed operational guide in [docs/Vision60_AprilTag_HowTo.md](../docs/Vision60_AprilTag_HowTo.md).

### 19. Authentication scaffolding

The repository also contains basic authentication scaffolding:

- [src/pages/Login.js](../src/pages/Login.js)
- [src/components/ProtectedRoute.js](../src/components/ProtectedRoute.js)
- [src/context/AuthContext.js](../src/context/AuthContext.js)

This appears to be foundational rather than the main delivered workflow, but it is part of the completed platform code.

## Backend Work Delivered

The backend work in [backend/move13.py](../backend/move13.py) is especially substantial. Key delivered backend areas include:

- ROS2 publishers for manual twist, control mode, action, vision mode, gait, run, estop, rollover, local goals, and planner goals
- subscriptions for battery, GPS, IMU, odometry, point cloud, obstacle map, relocalization status, and camera streams
- REST endpoints for command submission and movement wrappers
- REST endpoints for GPS, IMU, odometry, and robot status
- mission queue and mission status endpoints
- Ghost mission bridge endpoints
- Ghost lidar save-map endpoint
- low-level telemetry and diagnostics endpoints
- AprilTag-assisted localization endpoint
- point cloud and obstacle map endpoints in both raw and compressed forms
- camera proxy feed/snapshot endpoints
- Prometheus metrics endpoint

This backend effectively became the robotics integration layer for the whole project.

## Documentation and Operational Enablement

The repo contains strong supporting documentation, which is worth calling out as completed work:

- operator quick start for gesture control
- voice-control setup and architecture documentation
- Ghost stack inspection findings
- indoor localization and planner roadmap
- AprilTag how-to and tag selection guidance
- GhostSDK integration gap analysis and implemented upgrades

This matters because the project did not stop at coding features; it also captured the procedures needed to run, test, and expand them.

## Suggested Meeting Narrative

If you want a simple way to explain the work, this sequence is strong:

1. Command Center started as a robot operations UI and expanded into a full mission-control platform.
2. I built the main operator shell and the core pages for tasking, settings, history, audio collection, visual collection, and data transformation.
3. I integrated the frontend with ROS2/Flask backend services so the system could command robots and display telemetry.
4. I expanded the platform specifically for Vision 60 and Ghost Robotics with mission bridging, lidar controls, relocalization workflows, point cloud streaming, MBLink telemetry, and live tracking.
5. I added multi-modal control paths through gesture control, voice control, and simulation support.
6. I also delivered enabling artifacts for indoor localization and AprilTag deployment, including docs and generation tools.

## Short Version For Speaking

“Over time, I turned Command Center into a unified robot operations platform. The work included the full operator UI, tasking and history flows, audio and visual data collection, image/data transformation, ROS2 and Flask backend integration, Ghost mission and lidar controls, Hilbert space-filling curve point-cloud compression and 3D visualization, MBLink low-level telemetry, live agent tracking, gesture control, voice control, simulation support, and the AprilTag/localization toolchain for indoor Vision 60 use.”

## Final Notes

- The strongest differentiator in this project is breadth plus integration: UI, backend, robot interfaces, perception workflows, localization support, and operator documentation all exist in the same repo.
- For the Docker/data-transformation topic, I recommend describing it as service/deployment support around the transformation backend unless you have a separate Docker artifact outside this checkout that you want to bring into the meeting.
