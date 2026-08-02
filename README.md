# Command Center

Command Center is a React-based operator interface for robot tasking, telemetry, sensing, simulation, and Vision 60 / Ghost Robotics workflows.

## Core capabilities

- Dynamic task entry and command history
- Task-state model for queued, doing, and done work
- Vision 60 motion, action, gait, mission, and safety controls
- GPS, IMU, odometry, battery, diagnostics, and MBLink telemetry
- Live camera, obstacle map, and point-cloud visualization
- Hilbert space-filling curve point-cloud compression
- Audio and visual sensor collection
- Image data transformation through the Augmentor service
- Agent tracking, OpenAMASE simulation, gesture control, and voice control
- Lidar mapping, relocalization, saved-map previews, and AprilTag support

## Quick start

Requirements:

- Node.js 18 or newer
- npm
- Optional feature services described in [QUICKSTART.md](QUICKSTART.md)

```bash
git clone https://github.com/jd702/CommandCenter.git
cd CommandCenter
cp .env.example .env.local
npm install
npm start
```

Open `http://localhost:3000`.

Authentication is disabled by default for local development. See [Security](#security) before deploying the application beyond a trusted development network.

## Runtime configuration

Edit `.env.local`; do not commit it.

| Variable | Purpose | Default |
| --- | --- | --- |
| `REACT_APP_ROBOT_API_URL` | Flask + ROS2 robot API | `http://127.0.0.1:5002` |
| `REACT_APP_AUGMENTOR_URL` | Data Transformation API | `http://127.0.0.1:5000` |
| `REACT_APP_GESTURE_API` | Gesture process API | `http://localhost:7001` |
| `REACT_APP_SIM_SOCKET_URL` | Simulation Socket.IO bridge | `http://127.0.0.1:5001` |
| `REACT_APP_MISSION_CONTROL_URL` | Optional embedded mission dashboard | disabled |
| `REACT_APP_GOOGLE_MAPS_API_KEY` | Optional browser-restricted Maps key | disabled |
| `REACT_APP_AUTH_MODE` | `disabled` or local-only `demo` mode | `disabled` |

Values prefixed with `REACT_APP_` are bundled into browser JavaScript and must never contain secrets.

## Dynamic tasking

The tasking interface accepts predefined or operator-entered commands and sends them to the configured backend. Command history is retained locally for operator traceability. The mission integration provides the foundation for task lifecycle reporting:

- `queued`: accepted and waiting for execution
- `doing`: active mission or command
- `done`: completed or closed task

Backend mission status should remain the source of truth when the UI is connected to a robot.

## Documentation

- [Quick start and feature services](QUICKSTART.md)
- [Complete feature run guide](docs/CommandCenter_Run_Guide.md)
- [July 16, 2026 weekly delivery](docs/Weekly_Update_2026-07-16.md)
- [Project work report](docs/CommandCenter_Work_Report.md)
- [High-Level System Architecture](docs/HSLA.md)
- [Public repository security](docs/SECURITY.md)

## Docker start

The default Compose stack starts the Command Center web UI and Data Transformation
service. The optional `tools` profile also starts the Hilbert compression API.

```bash
cp docker.env.example .env
docker compose up --build
docker compose --profile tools up --build
```

Open `http://localhost:3000`. Robot, gesture, and simulation backends remain external
because they require robot ROS2, GPU inference, or simulator-specific runtimes.

## Demo video

[Watch the Command Center feature demo (MP4)](https://github.com/jd702/CommandCenter/releases/download/demo-2026-08/CommandCenter_Demo.mp4)

The public demo covers data transformation, live agent tracking, point-cloud
visualization, and Vision 60 camera integration. Location coordinates and
terminal/network details are redacted. The video is distributed as a
[GitHub Release asset](https://github.com/jd702/CommandCenter/releases/tag/demo-2026-08)
to keep normal repository clones small.

## Build and test

```bash
npm test -- --watchAll=false
npm run build
```

## Security

- Keep `.env.local`, credentials, tokens, robot addresses, and deployment-specific configuration out of Git.
- Use placeholders such as `ROBOT_HOST` in public documentation.
- The built-in demo authentication mode is not production authentication; enforce production identity and authorization server-side.
- Review [docs/SECURITY.md](docs/SECURITY.md) before publishing or deploying.

## Related projects

- [Voice Control](https://github.com/jd702/VoiceControl)
- [Gesture Control](https://github.com/jd702/GestureControl)
