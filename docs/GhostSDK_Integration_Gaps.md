# GhostSDK → CommandCenter Integration Gaps

## Source reviewed
- `/home/bsuatlab/GhostSDK/share/gr/mblink/README.md`
- `/home/bsuatlab/GhostSDK/share/gr/examples/README.md`
- `/home/bsuatlab/GhostSDK/share/gr/modemgr/README.md`
- `/home/bsuatlab/GhostSDK/etc/roudi_config_example.toml`

## High-value missing features in CommandCenter

### 1) MBLink low-level telemetry panel (highest impact)
GhostSDK exposes rich telemetry keys not currently surfaced in `src/pages/Ros2Agents.js`:
- `joint_position`, `joint_velocity`, `joint_current`, `joint_temperature`, `joint_voltage`
- `contacts`, `phase`, `swing_mode`
- `imu_euler`, `imu_angular_velocity`, `imu_linear_acceleration`
- `twist_linear`, `se2twist_des`
- `behavior`, `diagnostics`, `version`

**Add to CommandCenter:**
- A compact “Low-Level Telemetry” card grid with thresholds (temp/current/voltage warnings).
- Leg contact + gait phase mini-visuals for fast operator awareness.

### 2) Parameter read/write tools (operations efficiency)
GhostSDK documents `getParam`, `setParam`, and `setRetry` patterns.

**Add to CommandCenter:**
- UI for parameter lookup/edit with validation + readback confirmation.
- Saved parameter presets ("Indoor", "Outdoor", "Stealth", etc.).

### 3) Behavior/mode manager visibility
GhostSDK `modemgr` implies explicit behavior-mode handling.

**Add to CommandCenter:**
- Current behavior/mode badges + transition history timeline.
- Safe mode transition buttons with disable states when invalid.

### 4) Diagnostics bitfield decode
GhostSDK `diagnostics` key maps to MAV_SYS_STATUS style flags.

**Add to CommandCenter:**
- Human-readable diagnostics panel (present/health/enabled) instead of raw numbers.
- Fault prioritization (Critical / Warning / Info).

### 5) High-frequency data transport
GhostSDK bundle includes Iceoryx docs and RouDi mempool config for high-throughput pub/sub.

**Add to CommandCenter stack (backend):**
- Optional local bridge for high-rate telemetry transport when ROS topics become bottlenecked.
- Keep current REST for commands, but use streaming/WebSocket/SSE for telemetry updates.

## Suggested implementation order
1. Expose MBLink-derived telemetry endpoint(s) in backend.
2. Add compact telemetry widgets in `Ros2Agents.js`.
3. Add parameter get/set panel with guardrails.
4. Add diagnostics decoder and alert surfacing.
5. Evaluate Iceoryx/streaming bridge if update rate still lags.

## Implemented in this upgrade (CommandCenter only)

### Backend endpoints added in `backend/move13.py`
- `GET /lowlevel/telemetry`
	- Returns MBLink-style operational subset: behavior, control mode, action, diagnostics decode, IMU vectors, odom linear twist, desired SE(2) twist, parsed battery voltage.
- `POST /lowlevel/rx`
	- Passive MBLink ingest endpoint (no command-side effects) for behavior/mode/action, diagnostics bitfield, IMU, twist, desired SE(2) twist, and voltage.
- `POST /lowlevel/behavior`
	- Behavior controls: `walk`, `stand`, `sit`, `manual`, `original`; optional explicit `control_mode`.
- `POST /lowlevel/diagnostics`
	- Accepts diagnostics bitfield and returns decoded active sensor/system flags.
- `GET /lowlevel/params`
	- Returns current parameter key/value store.
- `POST /lowlevel/params/get`
	- Reads a single parameter by name.
- `POST /lowlevel/params/set`
	- Sets a single parameter and returns verified readback.

### Backend bridge script added
- `backend/mblink_adapter.py`
	- Connects to GhostSDK MBLink Python bindings and forwards live telemetry into:
		- `POST /lowlevel/rx`
		- `POST /lowlevel/joints`
	- Keeps telemetry passive (does not send movement commands).

### UI integration added in `src/pages/Ros2Agents.js`
- New “Low-Level MBLink Upgrade Panel” with:
	- Behavior/mode/action status
	- Desired SE(2) twist display
	- Decoded diagnostics count and active flags preview
	- Behavior quick controls (walk/stand/sit/manual/original)
	- Diagnostics bitfield push tool
	- Parameter get/set controls with immediate feedback

## What MBLink capabilities are most useful for CommandCenter

1) **Behavior/mode authority**
- Reliable behavior transitions (`sit/stand/walk`, mode switching) are critical for mission safety and operator trust.

2) **SE(2) setpoint visibility**
- Showing commanded `(vx, vy, wz)` makes teleop/planner debugging much faster.

3) **Diagnostics bitfield decoding**
- Turning raw bitmasks into readable health flags accelerates triage during field ops.

4) **Param read/write with readback**
- Operator-tunable control parameters with verification supports repeatable deployments.

5) **Joint-level telemetry**
- `joint_position`, `joint_velocity`, `joint_current`, `joint_temperature`, `joint_voltage`, `contacts`, `phase`, and `swing_mode` are now represented in backend and UI.

## Remaining gaps after this upgrade
- Planner-goal transport from MBLink (`sendGoal`, planner frames/types) is not bridged yet.
- No persistent parameter profiles yet (e.g., mission presets).
