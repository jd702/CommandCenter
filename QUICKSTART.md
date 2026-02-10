# Command Center Quick Start (Gesture Control)

This quick start assumes:
- Vision‑60 is online and running `move13.py` (Flask ROS2 API)
- GPU laptop will run gesture inference + local control API

## 1) Start Local Gesture API (GPU Laptop)

```bash
cd /home/bert/CommandCenter/GestureControl_MMPOSE_YOLO
python scripts/gesture_api.py
```

Default API: `http://localhost:7001`

If Vision‑60 IP changes, set env vars:

```bash
export GESTURE_FLASK_URL=http://<vision60-ip>:5002
export GESTURE_ROS_CAMERA=http://<vision60-ip>:8080
python scripts/gesture_api.py
```

## 2) Start Command Center UI

```bash
cd /home/bert/CommandCenter/CommandUI
npm start
```

Open `http://localhost:3000` and click **Gesture Control** in the sidebar.

## 3) Use Gesture Control Panel

- **Start** launches the gesture script
- **Stop** ends it
- **Next/Prev Camera** cycles
- Status shows current camera + last gesture

## 4) Switching to a New Laptop

- Copy this repo to the new laptop
- Start `scripts/gesture_api.py` on the new laptop
- Set UI env var if the UI is running elsewhere:

```bash
REACT_APP_GESTURE_API=http://<new-laptop-ip>:7001 npm start
```
