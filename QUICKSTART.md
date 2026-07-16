# Command Center Quick Start

## 1. Configure the UI

```bash
cp .env.example .env.local
```

Set deployment-specific hosts in `.env.local`:

```dotenv
REACT_APP_ROBOT_API_URL=http://ROBOT_HOST:5002
REACT_APP_GESTURE_API=http://GESTURE_HOST:7001
```

Do not commit `.env.local`.

## 2. Start Command Center

```bash
npm install
npm start
```

Open `http://localhost:3000`.

## 3. Start the robot backend

On the ROS2-enabled robot computer:

```bash
export ROS_CAMERA_BASE_URL=http://ROBOT_HOST:8080
python3 backend/move13.py
```

The backend requires the robot's ROS2 packages and topics. Use the actual host only in local environment configuration.

## 4. Optional feature services

Data Transformation:

```bash
docker load -i /path/to/data-transformation.tar
docker run --rm -p 5000:5000 data-transformation:latest
```

Gesture Control:

```bash
export GESTURE_FLASK_URL=http://ROBOT_HOST:5002
export GESTURE_ROS_CAMERA=http://ROBOT_HOST:8080
python3 GestureControl_MMPOSE_YOLO/scripts/gesture_api.py
```

Voice Control:

```bash
export VOICE_FLASK_API=http://ROBOT_HOST:5002
python3 VoiceControl/VoiceControl4.py
```

OpenAMASE Simulation Dashboard:

- Start the LMCP-to-Socket.IO bridge on `http://localhost:5001`.
- Open **Sim Dashboard** in Command Center.

## 5. Operator checks

- Confirm robot status, battery, GPS, IMU, and odometry are updating.
- Test motion with dry-run or a secured robot area first.
- Verify E-stop behavior before autonomous or gesture-driven motion.
- Confirm queued, doing, and done task states against backend mission status.

See [README.md](README.md) and [docs/HSLA.md](docs/HSLA.md) for feature and architecture context.
