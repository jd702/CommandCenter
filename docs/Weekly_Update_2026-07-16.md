# Weekly Delivery Report - July 16, 2026

## Delivery focus

This weekly delivery consolidated Command Center as a dynamic tasking and robot
operations interface. The operator workflow supports user-initiated tasks and the
task lifecycle states `queued`, `doing`, and `done`, alongside live robot status,
mission controls, sensor views, and command history.

## Completed work

- Expanded the ROS2 Agents console with Ghost mission controls, keyboard control,
  autonomous movement requests, lidar/relocalization controls, saved-map previews,
  diagnostics, parameters, and lower-level MBLink telemetry.
- Expanded point-cloud visualization and transport instrumentation, including raw
  and Hilbert space-filling curve compressed payload workflows.
- Improved Gesture Control process status, camera selection, webcam/proxy modes,
  validation, and operator error reporting.
- Added environment-driven runtime configuration for robot, augmentor, gesture,
  simulation, and optional mission-control endpoints.
- Added a Docker Compose deployment for the web UI and Data Transformation/Augmentor
  backend, plus an optional Hilbert compression service under the `tools` profile.
- Added complete run instructions covering Command Center startup and each major
  feature workflow.

## Docker deliverables

- `docker-compose.yml`
- `docker/web.Dockerfile`
- `docker/hilbert.Dockerfile`
- `docker/nginx.conf`
- `docker/web-entrypoint.sh`
- `services/augmentor/Dockerfile`
- `services/augmentor/app.py`
- `services/augmentor/aug.py`

## Run and verification

See [CommandCenter_Run_Guide.md](CommandCenter_Run_Guide.md) for local and Docker
startup orders, external runtime requirements, endpoint configuration, and current
integration limits.

## Security and publication notes

Deployment-specific robot addresses, passwords, API keys, and tokens are excluded.
Public defaults use loopback addresses or explicit placeholders, while real values
are supplied through ignored environment files at deployment time.
