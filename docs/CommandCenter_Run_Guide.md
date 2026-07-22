# Command Center Run Guide

## Purpose

This guide puts the current Command Center setup in one place:

- how to install and run the main UI
- how to run the bundled Docker stack
- how to run each major feature
- which services are bundled in-repo
- which services still depend on external robot, microphone, GPU, or sim environments

## What Is Bundled In This Repo

Runnable directly from this repo:

- React Command Center UI
- bundled Augmentor image-transformation backend
- optional Hilbert compression Flask service
- Vision 60 / Ghost Flask+ROS2 backend source in [backend/move13.py](../backend/move13.py)
- Gesture Control UI and local API source
- Voice Control listener source
- OpenAMASE TCP-to-Socket.IO bridge in [src/tcpbridge.js](../src/tcpbridge.js)

Not fully self-contained inside this repo:

- Vision 60 ROS 2 runtime and robot topics/services
- gesture inference model stack on the GPU laptop
- microphone/audio devices for voice control
- acoustics/image-classification backend used by the Sensor Audio and Camera Visual Data Collection pages

## Quick Start Options

### Option A: Bundled Docker stack

This is the easiest way to run the UI plus the image-augmentation backend.

From the repo root:

```bash
cd CommandCenter
cp docker.env.example .env
docker compose up --build
```

Open:

- `http://localhost:3000`

Default bundled services:

- `web` on `3000`
- `augmentor` on `5000`

Optional profile:

```bash
docker compose --profile tools up --build
```

That also starts:

- `hilbert-api` on `5055`

### Option B: Local development

```bash
cd CommandCenter
npm install
npm start
```

Open:

- `http://localhost:3000`

## Login

Authentication is disabled by default for local development. If demo mode is enabled,
provide non-sensitive local values through `.env.local`; never commit credentials.

## Docker Runtime Configuration

The web container reads runtime values from environment variables and writes them into `runtime-config.js`.

Set these in `.env`:

- `ROBOT_API_URL`
- `GESTURE_API_URL`
- `SIM_SOCKET_URL`

Defaults in [docker.env.example](../docker.env.example):

```env
ROBOT_API_URL=http://host.docker.internal:5002
GESTURE_API_URL=http://host.docker.internal:7001
SIM_SOCKET_URL=http://host.docker.internal:5001
```

Important:

- `augmentor` is bundled and proxied through `/augmentor`
- the Vision 60 backend is not bundled into the Docker stack because it requires the robot ROS 2 runtime
- `host.docker.internal` works with the compose file because `extra_hosts` is configured for Linux Docker host-gateway resolution

## Main App Structure

Main app shell:

- [src/index.js](../src/index.js)
- [src/pages/MainHub.js](../src/pages/MainHub.js)

Main pages:

- Home
- Sensor Audio Collection
- Camera Visual Data Collection
- Tasking
- Settings
- History
- Data Transformation
- ROS2 Agents
- Agent Tracker
- Gesture Control
- Sim Dashboard

## Feature-by-Feature Run Instructions

### 1. Home / Main Shell

Requirements:

- only the React UI

How to run:

- use Docker Option A or local Option B above

### 2. Tasking

Primary files:

- [src/pages/Tasking.js](../src/pages/Tasking.js)
- [src/context/IpContext2.js](../src/context/IpContext2.js)
- [src/pages/SettingsPage.js](../src/pages/SettingsPage.js)

Requirements:

- UI running
- tasking endpoint reachable at the configured IP

How to use:

1. Start the UI.
2. Open Settings.
3. Set the tasking IP if needed.
4. Use the Tasking page to submit jobs.

### 3. Data Transformation

Primary files:

- [src/pages/DataTransformation.js](../src/pages/DataTransformation.js)
- [services/augmentor/app.py](../services/augmentor/app.py)
- [services/augmentor/aug.py](../services/augmentor/aug.py)

Bundled:

- yes

How to run in Docker:

```bash
docker compose up --build
```

How to run locally without Docker:

```bash
cd CommandCenter/services/augmentor
python3 -m pip install -r requirements.txt
python3 app.py
```

Frontend behavior:

- uploads to the configured augmentor URL
- reads processed images from `/processed/<filename>`

How to use:

1. Open Data Transformation.
2. Drag and drop one or more images.
3. Select filters like blur, noise, rotate, flip, posterize, cutout, erode, dilate, edge detection, or brightness/contrast.
4. Submit and compare originals to processed results.

### 4. ROS2 Agents

Primary files:

- [src/pages/Ros2Agents.js](../src/pages/Ros2Agents.js)
- [backend/move13.py](../backend/move13.py)

Bundled:

- UI only
- robot backend remains external

Robot backend requirements:

- ROS 2 runtime
- Vision 60 / Ghost topics and services
- Python dependencies listed below

Run robot backend:

```bash
cd CommandCenter/backend
python3 move13.py
```

Expected robot API:

- default documented port: `5002`

What the page supports:

- motion commands
- camera snapshots and MJPEG streams
- MPC and planner commands
- Ghost mission bridge
- lidar and relocalization controls
- save-map actions
- low-level MBLink telemetry
- point cloud and saved map previews

How to use:

1. Start the robot-side backend.
2. Start the UI.
3. Set `ROBOT_API_URL` in Docker or use the runtime-config default.
4. Open ROS2 Agents.
5. Use the Ghost Mission Bridge panel for mission scripts and mission control.
6. Use the Lidar And Relocalization panel for LIO, relocalization, and map save actions.

### 5. Agent Tracker

Primary file:

- [src/pages/AgentTracker.js](../src/pages/AgentTracker.js)

Requirements:

- Vision 60 backend online

Uses:

- `/gps`
- `/status`
- `/imu`
- `/odom`

How to use:

1. Start the robot backend.
2. Open Agent Tracker.
3. Verify map motion, battery, IMU, and odometry updates.

### 6. Gesture Control

Primary files:

- [src/pages/GestureControl.js](../src/pages/GestureControl.js)
- [GestureControl_MMPOSE_YOLO/scripts/gesture_api.py](https://github.com/jd702/GestureControl/blob/main/scripts/gesture_api.py)
- [GestureControl_MMPOSE_YOLO/scripts/gesture_control.py](https://github.com/jd702/GestureControl/blob/main/scripts/gesture_control.py)
- [GestureControl_MMPOSE_YOLO/README.md](https://github.com/jd702/GestureControl/blob/main/README.md)

Bundled:

- source and UI are in repo
- not included in the base Docker stack because this workflow depends on GPU inference and camera/model setup

Run on the GPU laptop:

```bash
cd CommandCenter/GestureControl_MMPOSE_YOLO
python3 -m venv .venv
source .venv/bin/activate
python -m pip install --upgrade pip setuptools wheel
pip install -r requirements.txt
python scripts/gesture_api.py
```

Default local API:

- `http://localhost:7001`

How to use:

1. Start the robot backend.
2. Start the local gesture API on the GPU laptop.
3. Set `GESTURE_API_URL` if the API is remote from the browser.
4. Open Gesture Control.
5. Use Start, Stop, Prev Camera, Next Camera, and camera selection controls.

### 7. Voice Control

Primary files:

- [VoiceControl/VoiceControl4.py](https://github.com/jd702/VoiceControl/blob/main/VoiceControl4.py)
- [VoiceControl/README.md](https://github.com/jd702/VoiceControl/blob/main/README.md)
- [VoiceControl/INSTALLATION.md](https://github.com/jd702/VoiceControl/blob/main/INSTALLATION.md)

Bundled:

- source only
- not included in the base Docker stack because it depends on host microphone/audio devices and Whisper runtime size

Host setup:

```bash
cd CommandCenter/VoiceControl
python3 -m pip install --upgrade pip
python3 -m pip install openai-whisper torch pyaudio requests
python3 VoiceControl4.py
```

Before running:

- set `VOICE_FLASK_API=http://ROBOT_HOST:5002` in the shell
- confirm robot backend is reachable

How to use:

1. Start the robot backend.
2. Start `VoiceControl4.py` on a host with microphone access.
3. Speak supported commands like forward, backward, turn left, turn right, sit, stand, walk, stop, or enter manual mode.

### 8. Sensor Audio Collection

Primary files:

- [src/pages/SensorAudioCollection.js](../src/pages/SensorAudioCollection.js)
- [src/api/acoustics.js](../src/api/acoustics.js)

Bundled:

- UI only

Requirements:

- same-origin backend exposing:
  - `POST /results/start`
  - `GET /results/stop`
- Socket.IO events:
  - `idle`
  - `results`
- result media path:
  - `/results/media/audio/`

Current status:

- this backing service is not fully present in the current repo
- the page is documented, but the capture/classification backend must be supplied separately

### 9. Camera Visual Data Collection

Primary file:

- [src/pages/CameraVisualDataCollection.js](../src/pages/CameraVisualDataCollection.js)

Bundled:

- UI only

Requirements:

- same-origin endpoint:
  - `POST /start-image-capture`
- Socket.IO events:
  - `idle`
  - `results`
- result media path:
  - `/results/media/images/`

Current status:

- the capture/classification backend is not fully present in this repo

### 10. Sim Dashboard

Primary files:

- [src/pages/SimDashboard.js](../src/pages/SimDashboard.js)
- [src/tcpbridge.js](../src/tcpbridge.js)

Bundled:

- UI and TCP bridge source
- not in the default Docker stack

How to run locally:

```bash
cd CommandCenter
node src/tcpbridge.js
```

Default ports:

- OpenAMASE TCP input: `5555`
- Socket.IO output: `5001`

How to use:

1. Start OpenAMASE or the compatible TCP source.
2. Start `node src/tcpbridge.js`.
3. Set `SIM_SOCKET_URL` if needed.
4. Open Sim Dashboard.

### 11. Optional Hilbert Compression Service

Primary file:

- [flask/server.py](../flask/server.py)

Bundled:

- yes, as optional Docker profile `tools`

Run locally:

```bash
cd CommandCenter/flask
python3 server.py
```

Run with Docker profile:

```bash
docker compose --profile tools up --build
```

Exposed port:

- `5055`

Important:

- this service is for point-cloud compression experiments
- it is not the image augmentor backend

## Robot Backend Setup Details

For the Vision 60 backend in [backend/move13.py](../backend/move13.py), install at least:

```bash
python3 -m pip install --upgrade pip
python3 -m pip install flask flask-cors prometheus-client requests numpy opencv-python pyproj
```

Additional robot-side requirements come from the ROS 2 installation:

- `rclpy`
- `cv_bridge`
- ROS message packages

Optional:

```bash
python3 -m pip install lz4
```

## Docker Files Added

This repo now includes:

- [docker-compose.yml](../docker-compose.yml)
- [docker/web.Dockerfile](../docker/web.Dockerfile)
- [docker/hilbert.Dockerfile](../docker/hilbert.Dockerfile)
- [docker/nginx.conf](../docker/nginx.conf)
- [docker/web-entrypoint.sh](../docker/web-entrypoint.sh)
- [services/augmentor/Dockerfile](../services/augmentor/Dockerfile)

## Best Practical Startup Orders

### UI + Augmentor only

```bash
docker compose up --build
```

### Vision 60 session

1. Start the robot backend on the robot.
2. Set `ROBOT_API_URL` in `.env` if needed.
3. Start `docker compose up --build`.
4. Open ROS2 Agents and Agent Tracker.

### Gesture session

1. Start the robot backend.
2. Start the gesture API on the GPU laptop.
3. Set `GESTURE_API_URL`.
4. Start the UI.
5. Open Gesture Control.

### Simulation session

1. Start OpenAMASE feed.
2. Start `node src/tcpbridge.js`.
3. Set `SIM_SOCKET_URL`.
4. Start the UI.
5. Open Sim Dashboard.

## Current Limits

These are the important honest limits in the current repo:

- the bundled Docker stack does not include the Vision 60 ROS 2 runtime
- the bundled Docker stack does not include the full GPU pose stack for gesture inference
- the bundled Docker stack does not include the full audio/image classification backend for the Sensor Audio and Camera Visual Data Collection pages
- those features are documented and wired on the frontend, but their runtime backends remain external dependencies
