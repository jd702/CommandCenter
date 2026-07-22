import React, { useState, useEffect, useMemo } from "react";
import {
  Button,
  Typography,
  Grid,
  TextField,
  Box,
  Card,
  CardContent,
  Select,
  MenuItem,
  Snackbar,
  Alert,
  Slider,
  FormControl,
  InputLabel,
  Switch,
  Chip,

} from "@mui/material";
import PointCloudViewer from "./PointCloudViewer";
import {PointCloudDecompressor} from './Ros2Agents_with_HSFC'
import getRuntimeConfig from "../utils/runtimeConfig";

const FLASK_API_BASE_URL = getRuntimeConfig().robotApiUrl;

const agents = {
  ghost: {
    name: "Ghost Robotics",
    commands: {
      "Move Forward": "/command/move_forward",
      "Move Backward": "/command/move_backward",
      "Move Left": "/command/move_left",
      "Move Right": "/command/move_right",
      "Turn Left": "/command/turn_left",
      "Turn Right": "/command/turn_right",
      "Stop": "/command/stop",
      "Sit": "/command/setAction",
      "Stand": "/command/setAction",
      "Walk": "/command/setAction",
      "Enter Manual Mode": "/command/setControlMode",
      "Return to Original Mode": "/command/return_to_original_mode",
      "E-Stop": "/command/setEStop",
      "Roll Over": "/command/setRollOver",
      "Run Mode": "/command/setRun",
      "Set Gait (Walk)": "/command/setGait",


    },
    cameras: {
      "Front Left": "front_left",
      "Front Left Rect": "front_left_rect",
      "Front Left Scaled": "front_left_scaled",
      "Front Left Zoom x2": "front_left_zoomx2",
      "Front Left Zoom x4": "front_left_zoomx4",

      "Front Right": "front_right",
      "Front Right Rect": "front_right_rect",
      "Front Right Scaled": "front_right_scaled",
      "Front Right Zoom x2": "front_right_zoomx2",
      "Front Right Zoom x4": "front_right_zoomx4",

      "Rear": "rear",
      "Rear Rect": "rear_rect",
      "Rear Scaled": "rear_scaled",
      "Rear Zoom x2": "rear_zoomx2",
      "Rear Zoom x4": "rear_zoomx4",

      "Side Left": "side_left",
      "Side Left Rect": "side_left_rect",
      "Side Left Scaled": "side_left_scaled",
      "Side Left Zoom x2": "side_left_zoomx2",
      "Side Left Zoom x4": "side_left_zoomx4",

      "Side Right": "side_right",
      "Side Right Rect": "side_right_rect",
      "Side Right Scaled": "side_right_scaled",
      "Side Right Zoom x2": "side_right_zoomx2",
      "Side Right Zoom x4": "side_right_zoomx4",

      // --- optional MCU (snapshots only) ---
      "MCU Image Left":  "mcu_image_left",
      "MCU Image Right": "mcu_image_right",
      "MCU Image Track": "mcu_image_track",
      "MCU RS2 Depth":   "mcu_rs2_depth",
      "MCU RS2 IR Left": "mcu_rs2_ir_left",
      "MCU RS2 IR Right":"mcu_rs2_ir_right",
      "MCU RS3 Depth":   "mcu_rs3_depth",
      "MCU RS4 Depth":   "mcu_rs4_depth",
      "MCU RS4 RGB":     "mcu_rs4_rgb",
    },
  },
};

const predefinedCommands = {
  "Move Forward (5s)": JSON.stringify(
    { topic: "/command/move_forward", command: { duration: 5 } },
    null,
    2
  ),
  "Turn Left (3s)": JSON.stringify(
    { topic: "/command/turn_left", command: { duration: 3 } },
    null,
    2
  ),
  "Sit Action": JSON.stringify(
    { topic: "/command/setAction", command: { action: "sit" } },
    null,
    2
  ),
  "Stand Action": JSON.stringify(
    { topic: "/command/setAction", command: { action: "stand" } },
    null,
    2
  ),
  "Start Mission": JSON.stringify(
    { topic: "/command/start_mission" },
    null,
    2
  ),
  "Stop Mission": JSON.stringify(
    { topic: "/command/stop_mission" },
    null,
    2
  ),
  "Enable Vision Mode": JSON.stringify(
    { topic: "/command/enable_vision_mode" },
    null,
    2
  ),
  "Move Left (3s)": JSON.stringify(
    { topic: "/command/move_left", command: { duration: 3 } },
    null,
    2
  ),
  "Move Right (3s)": JSON.stringify(
    { topic: "/command/move_right", command: { duration: 3 } },
    null,
    2
  ),

  // UInt32-style commands
  "Emergency Stop": JSON.stringify(
    { topic: "/command/setEStop", command: 1 },
    null,
    2
  ),
  "Run Mode": JSON.stringify(
    { topic: "/command/setRun", command: 1 },
    null,
    2
  ),
  "Set Gait to Crawl": JSON.stringify(
    { topic: "/command/setGait", command: 0 },
    null,
    2
  ),
  "Set Gait to Trot": JSON.stringify(
    { topic: "/command/setGait", command: 1 },
    null,
    2
  ),
  "Set Gait to Gallop": JSON.stringify(
    { topic: "/command/setGait", command: 2 },
    null,
    2
  ),
  "Autonomous Planner Move (Default Speed)": JSON.stringify(
  {
    topic: "/command/autonomous_move",
    method: "POST",
    linear_x: 0.6
  },
  null,
  2
),
"Autonomous Planner Move (Slow)": JSON.stringify(
  {
    topic: "/command/autonomous_move",
    method: "POST",
    linear_x: 0.2
  },
  null,
  2
),
"Autonomous Planner Move (Fast)": JSON.stringify(
  {
    topic: "/command/autonomous_move",
    method: "POST",
    linear_x: 1.2
  },
  null,
  2
),

};

const KEYBOARD_PROFILES = [
  { value: "wasd", label: "WASD + QE (strafe/turn)" },
  { value: "arrows", label: "Arrow Keys + ,/." },
  { value: "ijkl", label: "IJKL + U/O" },
  { value: "numpad", label: "Numpad 8/2/4/6/7/9" },
];

const KEYBOARD_BINDINGS = {
  wasd: {
    forward: ["KeyW"],
    backward: ["KeyS"],
    strafe_left: ["KeyA"],
    strafe_right: ["KeyD"],
    turn_left: ["KeyQ"],
    turn_right: ["KeyE"],
    stop: ["Space", "KeyX"],
  },
  arrows: {
    forward: ["ArrowUp"],
    backward: ["ArrowDown"],
    strafe_left: ["Comma"],
    strafe_right: ["Period"],
    turn_left: ["ArrowLeft"],
    turn_right: ["ArrowRight"],
    stop: ["Slash", "Space"],
  },
  ijkl: {
    forward: ["KeyI"],
    backward: ["KeyK"],
    strafe_left: ["KeyU"],
    strafe_right: ["KeyO"],
    turn_left: ["KeyJ"],
    turn_right: ["KeyL"],
    stop: ["KeyM", "Space"],
  },
  numpad: {
    forward: ["Numpad8"],
    backward: ["Numpad2"],
    strafe_left: ["Numpad7"],
    strafe_right: ["Numpad9"],
    turn_left: ["Numpad4"],
    turn_right: ["Numpad6"],
    stop: ["Numpad5", "Numpad0"],
  },
};

const JOINT_TEMP_WARN = 75;
const JOINT_TEMP_CRIT = 85;
const JOINT_CURRENT_WARN = 12;

const safeArray = (value) => (Array.isArray(value) ? value : []);

const summarizeArray = (value) => {
  const arr = safeArray(value).filter((n) => Number.isFinite(Number(n))).map(Number);
  if (!arr.length) return { count: 0, min: 0, max: 0, avg: 0 };
  const min = Math.min(...arr);
  const max = Math.max(...arr);
  const avg = arr.reduce((sum, n) => sum + n, 0) / arr.length;
  return { count: arr.length, min, max, avg };
};


function Ros2Agents() {
  const [selectedAgent, setSelectedAgent] = useState("ghost");
  const [selectedCamera, setSelectedCamera] = useState("Front Left");
  const [batteryStatus, setBatteryStatus] = useState("Unknown");
  const [gpsData, setGpsData] = useState({ lat: 0, lng: 0 });
  const [imuData, setImuData] = useState(null);
  const [odomData, setOdomData] = useState(null);
  const [gpsGoal, setGpsGoal] = useState({ lat: 0, lng: 0});
  const [commandInput, setCommandInput] = useState("");
  const [movementDuration, setMovementDuration] = useState(1);
  const [selectedPredefinedCommand, setSelectedPredefinedCommand] =
    useState("");
  const [plannerSpeed, setPlannerSpeed] = useState(0.6);

  const [autoSnapshot, setAutoSnapshot] = useState(false);
  const [obstPoints, setObstPoints] = useState([]);
  const [show3DView, setShow3DView] = useState(false);
  const [pointCloudSource, setPointCloudSource] = useState("obstmap"); // or "pointcloud"
  const [pointCloudTransport, setPointCloudTransport] = useState("raw"); // 'raw' | 'compressed' | 'combined'
  const POINTCLOUD_POLL_MS = 3000; // centralize poll rate
  const [checkData, setCheckData] = useState([]);
  const [pcStats, setPcStats] = useState(null);
  const [ghostRuntime, setGhostRuntime] = useState(null);
  const [ghostScripts, setGhostScripts] = useState({});
  const [saveMapDestination, setSaveMapDestination] = useState("");
  const [saveMapResolution, setSaveMapResolution] = useState(-30);

  const [keyboardEnabled, setKeyboardEnabled] = useState(false);
  const [keyboardProfile, setKeyboardProfile] = useState("wasd");
  const [keyboardSpeed, setKeyboardSpeed] = useState(0.6);
  const [keyboardStrafeSpeed, setKeyboardStrafeSpeed] = useState(0.6);
  const [keyboardTurnSpeed, setKeyboardTurnSpeed] = useState(1.0);
  const [keyboardTurbo, setKeyboardTurbo] = useState(1.6);
  const [keyboardError, setKeyboardError] = useState("");
  const [keyboardStatus, setKeyboardStatus] = useState({
    enabled: false,
    pressed: [],
  });


const decompressor = useMemo(() => new PointCloudDecompressor(3), []);
  // const [useCompression, setUseCompression] = useState(false);
  const [videoStreamUrl, setVideoStreamUrl] = useState("");
  const [viewMode, setViewMode] = useState("stream");
  const [feedback, setFeedback] = useState({
    open: false,
    message: "",
    severity: "info",
  });
  const [lowLevelTelemetry, setLowLevelTelemetry] = useState(null);
  const [diagBitfieldInput, setDiagBitfieldInput] = useState("0");
  const [paramName, setParamName] = useState("");
  const [paramValue, setParamValue] = useState("");
  const [paramFeedback, setParamFeedback] = useState("");

  const postJson = async (path, body = {}) => {
    const response = await fetch(`${FLASK_API_BASE_URL}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload.message || `Request failed: ${path}`);
    }
    return payload;
  };

  const showFeedback = (message, severity = "info") => {
    setFeedback({
      open: true,
      message,
      severity,
    });
  };

  const shouldIgnoreKeyTarget = (target) => {
    if (!target) return false;
    const tag = target.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
    return Boolean(target.isContentEditable);
  };

  const getProfileKeySet = (profile) => {
    const p = KEYBOARD_BINDINGS[profile] || KEYBOARD_BINDINGS.wasd;
    return new Set([
      ...p.forward,
      ...p.backward,
      ...p.strafe_left,
      ...p.strafe_right,
      ...p.turn_left,
      ...p.turn_right,
      ...p.stop,
      "ShiftLeft",
      "ShiftRight",
    ]);
  };

  const fetchKeyboardStatus = async () => {
    const res = await fetch(`${FLASK_API_BASE_URL}/keyboard/status`);
    if (!res.ok) {
      throw new Error("Failed to get keyboard status");
    }
    const data = await res.json();
    setKeyboardStatus({
      enabled: Boolean(data.enabled),
      pressed: Array.isArray(data.pressed) ? data.pressed : [],
    });
  };

  const postKeyboardConfig = async () => {
    const res = await fetch(`${FLASK_API_BASE_URL}/keyboard/enable`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        profile: keyboardProfile,
        speed: keyboardSpeed,
        strafe_speed: keyboardStrafeSpeed,
        turn_speed: keyboardTurnSpeed,
        turbo: keyboardTurbo,
        hold: true,
      }),
    });
    if (!res.ok) {
      const msg = await res.text();
      throw new Error(msg || "Failed to enable keyboard control");
    }
  };

  const toggleKeyboard = async (enabled) => {
    setKeyboardError("");
    if (enabled) {
      try {
        await postKeyboardConfig();
        setKeyboardEnabled(true);
        await fetchKeyboardStatus();
      } catch (err) {
        setKeyboardEnabled(false);
        setKeyboardError(err.message || "Failed to enable keyboard control");
      }
    } else {
      try {
        await fetch(`${FLASK_API_BASE_URL}/keyboard/disable`, { method: "POST" });
      } finally {
        setKeyboardEnabled(false);
        setKeyboardStatus({ enabled: false, pressed: [] });
      }
    }
  };

  useEffect(() => {
    if (!keyboardEnabled) return;
    postKeyboardConfig().catch((err) => setKeyboardError(err.message || "Failed to update keyboard config"));
  }, [keyboardEnabled, keyboardProfile, keyboardSpeed, keyboardStrafeSpeed, keyboardTurnSpeed, keyboardTurbo]);

  useEffect(() => {
    if (!keyboardEnabled) return;
    fetchKeyboardStatus().catch(() => {});
    const timer = setInterval(() => {
      fetchKeyboardStatus().catch(() => {});
    }, 500);
    return () => clearInterval(timer);
  }, [keyboardEnabled]);

  useEffect(() => {
    if (!keyboardEnabled) return;
    const handledCodes = getProfileKeySet(keyboardProfile);

    const sendKeyEvent = async (type, evt) => {
      if (shouldIgnoreKeyTarget(evt.target)) return;
      if (type === "down" && evt.repeat) return;
      const code = evt.code || "";
      const key = evt.key || "";
      const keyLower = String(key).toLowerCase();
      const normalizedFallback =
        keyLower.length === 1 && keyLower >= "a" && keyLower <= "z"
          ? `Key${keyLower.toUpperCase()}`
          : key;
      const shouldHandle = handledCodes.has(code) || handledCodes.has(normalizedFallback);
      if (!shouldHandle) return;

      evt.preventDefault();

      const payload = { type, code: evt.code, key: evt.key };
      try {
        const res = await fetch(`${FLASK_API_BASE_URL}/keyboard/event`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!res.ok) {
          const msg = await res.text();
          throw new Error(msg || "Keyboard event rejected");
        }
      } catch (err) {
        setKeyboardError(err.message || "Keyboard event send failed");
      }
    };

    const onKeyDown = (evt) => sendKeyEvent("down", evt);
    const onKeyUp = (evt) => sendKeyEvent("up", evt);
    const onBlur = () => {
      fetch(`${FLASK_API_BASE_URL}/keyboard/disable`, { method: "POST" }).catch(() => {});
      setKeyboardEnabled(false);
      setKeyboardStatus({ enabled: false, pressed: [] });
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);

    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
    };
  }, [keyboardEnabled, keyboardProfile, keyboardSpeed, keyboardStrafeSpeed, keyboardTurnSpeed, keyboardTurbo]);

  useEffect(() => {
  let interval;

  const cameraKey = agents[selectedAgent].cameras[selectedCamera];

  const setLive = () => {
    // True live MJPEG stream via Flask proxy, no interval needed
    const url = `${FLASK_API_BASE_URL}/proxy_camera_feed/${cameraKey}`;
    setVideoStreamUrl(url);
  };

  const setSnapshotOnce = () => {
    // Snapshot via Flask proxy (cache-busted)
    const url = `${FLASK_API_BASE_URL}/proxy_camera_snapshot/${cameraKey}?t=${Date.now()}`;
    setVideoStreamUrl(url);
  };

  if (viewMode === "stream") {
    setLive();
    // IMPORTANT: no interval for real MJPEG stream
  } else {
    setSnapshotOnce();
    if (autoSnapshot) {
      // You can make this 250ms to “simulate” video, or keep it lighter (e.g., 2s)
      interval = setInterval(setSnapshotOnce, 2000);
    }
  }

  return () => clearInterval(interval);
}, [selectedCamera, selectedAgent, viewMode, autoSnapshot]);

  // useEffect(() => {
  //   let interval; // To store interval reference for cleanup
  
  //   // Helper function: fetches snapshot image and forces URL update to prevent browser caching
  //   const fetchSnapshot = () => {
  //     const url = `${FLASK_API_BASE_URL}/proxy_camera_snapshot/${agents[selectedAgent].cameras[selectedCamera]}?t=${Date.now()}`;
  //     setVideoStreamUrl(url); // Update React state to re-render image
  //   };
  
  //   if (viewMode === "stream") {
  //     // "Stream" mode selected: fetch snapshot immediately, then continuously at 250ms interval
  //     // Creates a realistic, smooth video-like effect (4 fps)
  //     fetchSnapshot(); // Initial immediate fetch
  //     interval = setInterval(fetchSnapshot, 250); // Frequent updates for pseudo-live effect
  //   } else if (viewMode === "snapshot") {
  //     // "Snapshot" mode selected: fetch single snapshot immediately upon mode change
  //     fetchSnapshot();
  
  //     if (autoSnapshot) {
  //       // If user enabled "auto-snapshot", set slower periodic snapshot refresh (every 2 sec)
  //       interval = setInterval(fetchSnapshot, 2000);
  //     }
  //     // Else: no interval set, snapshot stays static unless manually refreshed by the user
  //   }
  
  //   // Cleanup: Clear interval whenever dependencies change to avoid memory leaks and duplicate intervals
  //   return () => clearInterval(interval);
  // }, [selectedCamera, selectedAgent, viewMode, autoSnapshot]);
  
  
  
  useEffect(() => {
    const fetchBatteryStatus = async () => {
      try {
        const response = await fetch(`${FLASK_API_BASE_URL}/status`);
        const data = await response.json();
        setBatteryStatus(data.battery?.ghost || "Unknown");
      } catch (error) {
        console.error("Error fetching battery status:", error);
      }
    };
    fetchBatteryStatus();
    const interval = setInterval(fetchBatteryStatus, 5000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const fetchGpsData = async () => {
      try {
        const response = await fetch(`${FLASK_API_BASE_URL}/gps`);
        const data = await response.json();
        if (data.ghost) {
          setGpsData({ lat: data.ghost.latitude, lng: data.ghost.longitude });
        }
      } catch (error) {
        console.error("Error fetching GPS data:", error);
      }
    };
    fetchGpsData();
    const interval = setInterval(fetchGpsData, 5000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const fetchMotionData = async () => {
      try {
        const [imuRes, odomRes] = await Promise.all([
          fetch(`${FLASK_API_BASE_URL}/imu`),
          fetch(`${FLASK_API_BASE_URL}/odom`),
        ]);

        if (imuRes.ok) {
          const imuJson = await imuRes.json();
          setImuData(imuJson.ghost || null);
        }
        if (odomRes.ok) {
          const odomJson = await odomRes.json();
          setOdomData(odomJson.ghost || null);
        }
      } catch {
        // keep prior telemetry values
      }
    };

    fetchMotionData();
    const interval = setInterval(fetchMotionData, 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const fetchLowLevelTelemetry = async () => {
      try {
        const res = await fetch(`${FLASK_API_BASE_URL}/lowlevel/telemetry`);
        if (!res.ok) return;
        const data = await res.json();
        setLowLevelTelemetry(data);
      } catch {
        // keep prior value
      }
    };

    fetchLowLevelTelemetry();
    const interval = setInterval(fetchLowLevelTelemetry, 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const fetchGhostRuntime = async () => {
      try {
        const [statusRes, scriptsRes] = await Promise.all([
          fetch(`${FLASK_API_BASE_URL}/ghost/status`),
          fetch(`${FLASK_API_BASE_URL}/ghost/scripts`),
        ]);
        if (statusRes.ok) {
          const statusJson = await statusRes.json();
          setGhostRuntime(statusJson.ghost || null);
        }
        if (scriptsRes.ok) {
          const scriptsJson = await scriptsRes.json();
          setGhostScripts(scriptsJson.scripts || {});
        }
      } catch {
        // keep prior values
      }
    };

    fetchGhostRuntime();
    const interval = setInterval(fetchGhostRuntime, 2000);
    return () => clearInterval(interval);
  }, []);

  const setLowLevelBehavior = async (behavior) => {
    try {
      const response = await fetch(`${FLASK_API_BASE_URL}/lowlevel/behavior`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ behavior }),
      });
      const result = await response.json().catch(() => ({}));
      setFeedback({
        open: true,
        message: result.message || `Behavior ${behavior} updated`,
        severity: response.ok ? "success" : "error",
      });
    } catch {
      setFeedback({
        open: true,
        message: `Failed to set behavior: ${behavior}`,
        severity: "error",
      });
    }
  };

  const runGhostScript = async (script) => {
    try {
      const result = await postJson("/ghost/mission/run", { script });
      setGhostRuntime(result.ghost || ghostRuntime);
      showFeedback(`Mission requested: ${result.mission || script}`, "success");
    } catch (error) {
      showFeedback(error.message || `Failed to run ${script}`, "error");
    }
  };

  const callGhostMissionAction = async (action) => {
    try {
      const result = await postJson(`/ghost/mission/${action}`, {});
      setGhostRuntime(result.ghost || ghostRuntime);
      showFeedback(`Mission action sent: ${action}`, "success");
    } catch (error) {
      showFeedback(error.message || `Mission action failed: ${action}`, "error");
    }
  };

  const callGhostLidarAction = async (action) => {
    try {
      const result = await postJson(`/ghost/lidar/${action}`, {});
      setGhostRuntime(result.ghost || ghostRuntime);
      showFeedback(`Lidar action sent: ${action}`, "success");
    } catch (error) {
      showFeedback(error.message || `Lidar action failed: ${action}`, "error");
    }
  };

  const saveGhostMap = async () => {
    try {
      const result = await postJson("/ghost/lidar/save_map", {
        destination: saveMapDestination,
        resolution: Number(saveMapResolution),
      });
      setGhostRuntime(result.ghost || ghostRuntime);
      showFeedback("Save map request sent", "success");
    } catch (error) {
      showFeedback(error.message || "Failed to save map", "error");
    }
  };

  const pushDiagnosticsBitfield = async () => {
    const parsed = Number(diagBitfieldInput);
    if (!Number.isFinite(parsed) || parsed < 0) {
      setParamFeedback("Diagnostics bitfield must be a non-negative number");
      return;
    }
    try {
      const response = await fetch(`${FLASK_API_BASE_URL}/lowlevel/diagnostics`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bitfield: parsed }),
      });
      const result = await response.json().catch(() => ({}));
      setParamFeedback(response.ok ? "Diagnostics updated" : (result.message || "Diagnostics update failed"));
    } catch {
      setParamFeedback("Diagnostics update failed");
    }
  };

  const setLowLevelParam = async () => {
    if (!paramName.trim()) {
      setParamFeedback("Param name is required");
      return;
    }
    try {
      let parsedValue = paramValue;
      try {
        parsedValue = JSON.parse(paramValue);
      } catch {
        parsedValue = paramValue;
      }
      const response = await fetch(`${FLASK_API_BASE_URL}/lowlevel/params/set`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: paramName.trim(), value: parsedValue }),
      });
      const result = await response.json().catch(() => ({}));
      setParamFeedback(response.ok ? `Set ${result.name} = ${JSON.stringify(result.value)}` : (result.message || "Set failed"));
    } catch {
      setParamFeedback("Set failed");
    }
  };

  const getLowLevelParam = async () => {
    if (!paramName.trim()) {
      setParamFeedback("Param name is required");
      return;
    }
    try {
      const response = await fetch(`${FLASK_API_BASE_URL}/lowlevel/params/get`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: paramName.trim() }),
      });
      const result = await response.json().catch(() => ({}));
      if (response.ok) {
        setParamValue(typeof result.value === "string" ? result.value : JSON.stringify(result.value ?? ""));
        setParamFeedback(`Read ${result.name} = ${JSON.stringify(result.value)}`);
      } else {
        setParamFeedback(result.message || "Read failed");
      }
    } catch {
      setParamFeedback("Read failed");
    }
  };

useEffect(() => {
  if (!show3DView) return;

  let abort = false;
  let interval;

  // decide endpoint based on Transport + Source
  const endpoint = (() => {
    if (pointCloudTransport === "compressed") {
      return pointCloudSource === "obstmap"
        ? "/obstmap_compressed"
        : "/pointcloud_compressed";
    }

  if (pointCloudTransport === "combined") return "/mapdata";
  // default (raw JSON):
  return pointCloudSource === "obstmap" ? "/obstmap" : "/pointcloud";
})();


 // Point cloud fetcher function
// Point cloud fetcher function
const fetchPointCloud = async () => {
  try {
    console.log("[PC] fetching", `${FLASK_API_BASE_URL}${endpoint}`, {
      transport: pointCloudTransport,
      source: pointCloudSource,
    });

    const tNet0 = performance.now();
    const res = await fetch(`${FLASK_API_BASE_URL}${endpoint}`);
    const tNet1 = performance.now();

    if (!res.ok) {
      console.error("[PC] HTTP error", res.status, res.statusText);
      return;
    }

    // --- read server headers (added in backend) ---
    const method = res.headers.get("X-PC-Method") || (pointCloudTransport === "raw" ? "raw-json" : "unknown");
    const ptsHdr = Number(res.headers.get("X-PC-Points") || 0);
    const wireBytes = Number(res.headers.get("X-PC-Encoded-Bytes") || 0);
    const encMsServer = Number(res.headers.get("X-PC-Encode-MS") || 0);

    const tParse0 = performance.now();
    const data = await res.json();
    const tParse1 = performance.now();

    console.log("[PC] raw payload keys:", Object.keys(data || {}));

    let points = [];
    let tDec0 = tParse1, tDec1 = tParse1;

    if (pointCloudTransport === "compressed") {
      // NEW packed schema (origin/scale/shape/data)
      tDec0 = performance.now();
      try {
        points = decompressor.decompressPointCloud(data);
      } catch (e) {
        console.error("[PC] decompression failed:", e, data);
        points = [];
      }
      tDec1 = performance.now();
    } else if (pointCloudTransport === "combined") {
      const arr = pointCloudSource === "obstmap" ? data.obstmap : data.pointcloud;
      points = Array.isArray(arr) ? arr : [];
    } else {
      // RAW JSON
      if (Array.isArray(data.points)) {
        points = data.points;
      } else {
        const arr = pointCloudSource === "obstmap" ? data.obstmap : data.pointcloud;
        points = Array.isArray(arr) ? arr : [];
      }
    }

    if (Array.isArray(points) && points.length > 0) {
      setObstPoints(points);
    }

    // (your old checkData line was wrong for compressed; use points)
    setCheckData(points);

    // --- publish metrics to UI ---
    setPcStats({
      method,
      points: ptsHdr || points.length,
      wireKB: wireBytes ? (wireBytes / 1024).toFixed(1) : null,
      netMs: (tNet1 - tNet0).toFixed(1),
      parseMs: (tParse1 - tParse0).toFixed(1),
      decodeMs: ((tDec1 - tDec0) || 0).toFixed(1),
      encMsServer: encMsServer ? encMsServer.toFixed(1) : null,
    });

  } catch (err) {
    console.error("[PC] fetch error:", err);
    // keep last good frame
  }
};



  fetchPointCloud(); 
  interval = setInterval(fetchPointCloud, POINTCLOUD_POLL_MS);

  return () => {
    abort = true;
    clearInterval(interval);
    setObstPoints([]);
  };
}, [show3DView, pointCloudSource, pointCloudTransport]);

//   const fetchPointCloud = async () => {
//   try {
//     // choose endpoint based on toggle
//     const endpoint = useCompression
//       ? `${pointCloudSource}_compressed`   // obstmap_compressed | pointcloud_compressed
//       : pointCloudSource;                  // obstmap | pointcloud

//     const res = await fetch(`${FLASK_API_BASE_URL}/${endpoint}`);
//     const data = await res.json();
//     // console.log("Fetched point cloud:", data);

//     if (useCompression) {
//       // compressed format
//       if (data.status === "ok" && data.compressed_data) {
//         const points = decompressor.decompressPointCloud(data.compressed_data);
//         setObstPoints(points);
//       } else {
//         console.error("Compressed endpoint error:", data.message || data.status);
//         setObstPoints([]);
//       }
//     } else {
//       // raw format (your original behavior)
//       if (Array.isArray(data.points)) {
//         setObstPoints(data.points);
//       } else if (Array.isArray(data.obstmap) || Array.isArray(data.pointcloud)) {
//         const arr = pointCloudSource === "obstmap" ? data.obstmap : data.pointcloud;
//         setObstPoints(arr || []);
//       } else {
//         setObstPoints([]);
//       }
//     }
//   } catch (err) {
//     console.error("Failed to fetch point cloud:", err);
//   }
// };


//   fetchPointCloud(); // initial
//   interval = setInterval(fetchPointCloud, POINTCLOUD_POLL_MS);

//   return () => {
//     abort = true;
//     clearInterval(interval);
//     setObstPoints([]);
//   };
// }, [show3DView, pointCloudSource, pointCloudTransport]);

// useEffect(() => {
//   if (!show3DView) return;

//   const fetchPointCloud = async () => {
//     try {
//       const res = await fetch(`${FLASK_API_BASE_URL}/${pointCloudSource}`);
//       const data = await res.json();
//       console.log("Fetched point cloud data:", data);

//       if (data.compressed_data) {
//         //  If backend sends compressed blob, decompress it
//         const points = decompressor.decompressPointCloud(data.compressed_data);
//         setObstPoints(points);
//       } else if (Array.isArray(data.points)) {
//         //  Handle current backend format: plain JSON array
//         setObstPoints(data.points);
//       } else if (Array.isArray(data.obstmap) || Array.isArray(data.pointcloud)) {
//         //  Handle combined map data format
//         const arr = pointCloudSource === "obstmap" ? data.obstmap : data.pointcloud;
//         setObstPoints(arr || []);
//       } else {
//         console.warn(" No recognizable point data found.");
//         setObstPoints([]);
//       }
//     } catch (err) {
//       console.error("Failed to fetch point cloud:", err);
//     }
//   };

//   fetchPointCloud(); // Fetch immediately
//   const interval = setInterval(fetchPointCloud, 3000); // Poll every 3s
//   return () => {
//     clearInterval(interval);
//     setObstPoints([]); // Clear points when 3D view is disabled
//   };
// }, [show3DView, pointCloudSource]);

/*
 useEffect(() => {
  if (!show3DView) return;

  const fetchPointCloud = async () => {
    try {
      const res = await fetch(`${FLASK_API_BASE_URL}/${pointCloudSource}`);
      const data = await res.json();
      console.log("Fetched point cloud data:", data);
      console.log("Here", data)
      if (data.compressed_data) {
        console.log("Here")
        const points = decompressor.decompressPointCloud(data.compressed_data)
        setObstPoints(points);
      }
    } catch (err) {
      console.error("Failed to fetch point cloud:", err);
    }
  };

  fetchPointCloud();
  const interval = setInterval(fetchPointCloud, 3000);
  return () => {
    clearInterval(interval);
    setObstPoints([]); // Clear points when 3D view is disabled
  };
}, [show3DView, pointCloudSource]);

*/
// Function to send commands to the Flask API
  const sendCommand = async (agent, topic, params = {}) => {
    try {
      const response = await fetch(`${FLASK_API_BASE_URL}/command`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic, command: params }),
      });
      const result = await response.json();
      setFeedback({
        open: true,
        message: result.message || "Command sent!",
        severity: response.ok ? "success" : "error",
      });
    } catch (error) {
      setFeedback({
        open: true,
        message: "Failed to send command.",
        severity: "error",
      });
    }
  };

  const enableVisionMode = async () => {
    try {
      const response = await fetch(
        `${FLASK_API_BASE_URL}/command/enable_vision_mode`,
        {
          method: "POST",
        }
      );
      const result = await response.json();
      setFeedback({
        open: true,
        message: result.message || "Vision mode triggered.",
        severity: response.ok ? "success" : "error",
      });
    } catch (error) {
      setFeedback({
        open: true,
        message: "Error enabling vision mode.",
        severity: "error",
      });
    }
  };
const handleCommandSubmit = (e) => {
  e.preventDefault();

  if (commandInput.trim() === "") return;

  let parsedCommand;
  try {
    parsedCommand = JSON.parse(commandInput);
  } catch (error) {
    setFeedback({
      open: true,
      message: "Invalid JSON format.",
      severity: "error",
    });
    return;
  }

  const topic = parsedCommand?.topic;
  const cmdObject =
    parsedCommand &&
    typeof parsedCommand.command === "object" &&
    parsedCommand.command !== null
      ? parsedCommand.command
      : {};
  const topLevelParams =
    parsedCommand && typeof parsedCommand === "object"
      ? Object.entries(parsedCommand).reduce((acc, [key, value]) => {
          if (key === "topic" || key === "method" || key === "command") return acc;
          acc[key] = value;
          return acc;
        }, {})
      : {};
  const cmd = { ...topLevelParams, ...cmdObject };

  if (!topic) {
    setFeedback({
      open: true,
      message: "Missing 'topic' field in JSON.",
      severity: "error",
    });
    return;
  }

  // Helper: show success/error snackbar consistently
  const showResult = (ok, result, fallbackSuccess, fallbackFail) => {
    setFeedback({
      open: true,
      message: (result && result.message) || (ok ? fallbackSuccess : fallbackFail),
      severity: ok ? "success" : "error",
    });
  };

  // Route-specific handler map
  const routeHandlers = {
    "/command/send_goal": async () => {
      // Expect: { topic:"/command/send_goal", command:{ latitude, longitude, z? } }
      const body = cmd; // backend accepts flat body
      const res = await fetch(`${FLASK_API_BASE_URL}/command/send_goal`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const result = await res.json().catch(() => ({}));
      showResult(res.ok, result, "GPS goal sent!", "Failed to send GPS goal.");
    },

    "/mpc/goal": async () => {
      // Expect: { topic:"/mpc/goal", command:{ vx, vy, wz, hold? } }
      const res = await fetch(`${FLASK_API_BASE_URL}/mpc/goal`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(cmd),
      });
      const result = await res.json().catch(() => ({}));
      showResult(res.ok, result, "MPC goal sent!", "Failed to send MPC goal.");
    },

    "/command/send_local_goal": async () => {
      // Expect: { topic:"/command/send_local_goal", command:{ x, y, yaw?, frame_id? } }
      const res = await fetch(`${FLASK_API_BASE_URL}/command/send_local_goal`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(cmd),
      });
      const result = await res.json().catch(() => ({}));
      showResult(res.ok, result, "Local goal sent!", "Failed to send local goal.");
    },

    "/command/autonomous_move": async () => {
      const linearX = Number(cmd.linear_x);
      const body = {
        linear_x: Number.isFinite(linearX) ? linearX : 0.6,
      };
      const res = await fetch(`${FLASK_API_BASE_URL}/command/autonomous_move`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const result = await res.json().catch(() => ({}));
      showResult(res.ok, result, "Planner goal sent!", "Failed to send planner goal.");
    },
  };

  // Execute either a route handler or default /command
  (async () => {
    try {
      if (routeHandlers[topic]) {
        await routeHandlers[topic]();
      } else {
        // Default command route (your existing behavior)
        await sendCommand(selectedAgent, topic, cmd);
      }

      setCommandInput("");
    } catch (err) {
      console.error("Command submit error:", err);
      setFeedback({
        open: true,
        message: "Command failed to send (network/backend error).",
        severity: "error",
      });
    }
  })();
};

  
  return (
    <Box sx={{ p: 4 }}>
      <Typography variant="h4">ROS 2 Agent Control Center</Typography>
      <Grid container spacing={2} sx={{ mt: 1, mb: 2 }}>
        <Grid item xs={12} md={4}>
          <Card variant="outlined">
            <CardContent sx={{ py: 1.5 }}>
              <Typography variant="subtitle2">Battery</Typography>
              <Typography variant="h6">{batteryStatus}%</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={4}>
          <Card variant="outlined">
            <CardContent sx={{ py: 1.5 }}>
              <Typography variant="subtitle2">GPS</Typography>
              <Typography variant="body1">Lat {gpsData.lat}, Lng {gpsData.lng}</Typography>
              <Typography variant="caption" sx={{ opacity: 0.75 }}>
                Speed x: {Number(odomData?.twist?.linear?.x || 0).toFixed(2)} m/s
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={4}>
          <Card variant="outlined">
            <CardContent sx={{ py: 1.5 }}>
              <Typography variant="subtitle2">Keyboard</Typography>
              <Chip
                size="small"
                label={keyboardEnabled ? "Enabled" : "Disabled"}
                color={keyboardEnabled ? "success" : "default"}
                sx={{ mr: 1 }}
              />
              <Chip
                size="small"
                label={`Pressed: ${keyboardStatus.pressed.length}`}
                variant="outlined"
              />
              <Typography variant="caption" sx={{ display: "block", mt: 1, opacity: 0.75 }}>
                Yaw rate: {Number(imuData?.angular_velocity?.z || 0).toFixed(2)} rad/s
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid item xs={12} md={4}>
          <FormControl fullWidth>
            <InputLabel id="agent-select-label">Agent</InputLabel>
            <Select
              labelId="agent-select-label"
              label="Agent"
              value={selectedAgent}
              onChange={(e) => setSelectedAgent(e.target.value)}
            >
              {Object.keys(agents).map((agent) => (
                <MenuItem key={agent} value={agent}>
                  {agents[agent].name}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </Grid>
        <Grid item xs={12} md={4}>
          <FormControl fullWidth>
            <InputLabel id="camera-select-label">Camera</InputLabel>
            <Select
              labelId="camera-select-label"
              label="Camera"
              value={selectedCamera}
              onChange={(e) => setSelectedCamera(e.target.value)}
            >
              {Object.keys(agents[selectedAgent].cameras).map((cam) => (
                <MenuItem key={cam} value={cam}>
                  {cam}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </Grid>
        <Grid item xs={12} md={4}>
          <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
            <Button
              variant="outlined"
              onClick={() => setViewMode((prev) => (prev === "stream" ? "snapshot" : "stream"))}
            >
              {viewMode === "stream" ? "Snapshot Mode" : "Live Mode"}
            </Button>
            {viewMode === "snapshot" && (
              <>
                <Button
                  variant="contained"
                  onClick={() => {
                    const url = `${FLASK_API_BASE_URL}/proxy_camera_snapshot/${agents[selectedAgent].cameras[selectedCamera]}?t=${Date.now()}`;
                    setVideoStreamUrl(url);
                  }}
                >
                  Refresh
                </Button>
                <Button
                  variant={autoSnapshot ? "contained" : "outlined"}
                  color={autoSnapshot ? "success" : "primary"}
                  onClick={() => setAutoSnapshot((prev) => !prev)}
                >
                  Auto {autoSnapshot ? "ON" : "OFF"}
                </Button>
              </>
            )}
          </Box>
        </Grid>
      </Grid>

      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid item xs={12} lg={6}>
          <Card
            sx={{
              background: "linear-gradient(135deg, #f4efe2 0%, #d7e5f3 100%)",
              border: "1px solid rgba(22,40,58,0.12)",
            }}
          >
            <CardContent>
              <Typography variant="h5">Ghost Mission Bridge</Typography>
              <Typography variant="body2" sx={{ mt: 1, opacity: 0.8 }}>
                Active script: {ghostRuntime?.mission?.active_script || "none"} | Requested: {ghostRuntime?.mission?.requested || "none"}
              </Typography>
              <Typography variant="body2" sx={{ opacity: 0.8 }}>
                Mission status: {ghostRuntime?.mission?.status_text || "unknown"} | Last command: {ghostRuntime?.mission?.last_command || "none"}
              </Typography>

              <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", mt: 2 }}>
                {Object.entries(ghostScripts).map(([key, meta]) => (
                  <Button key={key} size="small" variant="outlined" onClick={() => runGhostScript(key)}>
                    {key}
                  </Button>
                ))}
              </Box>

              <Typography variant="caption" sx={{ display: "block", mt: 1.5, opacity: 0.75 }}>
                Preferred Vision 60 workflows come from built-in Ghost missions, not the synthetic local queue.
              </Typography>

              <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", mt: 2 }}>
                <Button size="small" variant="contained" onClick={() => callGhostMissionAction("start")}>Start</Button>
                <Button size="small" variant="outlined" onClick={() => callGhostMissionAction("pause")}>Pause</Button>
                <Button size="small" variant="outlined" onClick={() => callGhostMissionAction("unpause")}>Unpause</Button>
                <Button size="small" color="error" variant="outlined" onClick={() => callGhostMissionAction("cancel")}>Cancel</Button>
              </Box>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} lg={6}>
          <Card
            sx={{
              background: "linear-gradient(135deg, #f7f2ea 0%, #e0f0e9 100%)",
              border: "1px solid rgba(34,60,44,0.12)",
            }}
          >
            <CardContent>
              <Typography variant="h5">Lidar And Relocalization</Typography>
              <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", mt: 1 }}>
                <Chip size="small" label={`LIO ${ghostRuntime?.lidar?.lio_active ? "active" : "idle"}`} color={ghostRuntime?.lidar?.lio_active ? "success" : "default"} />
                <Chip size="small" variant="outlined" label={`Reloc ${ghostRuntime?.lidar?.relocalization_status || "unknown"}`} />
                <Chip size="small" variant="outlined" label={`Odom ${ghostRuntime?.lidar?.odom_source || "unknown"}`} />
                <Chip size="small" variant="outlined" label={`Path idx ${ghostRuntime?.planner?.current_path_index ?? "-"}`} />
              </Box>

              <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", mt: 2 }}>
                <Button size="small" variant="contained" onClick={() => callGhostLidarAction("activate")}>Activate LIO</Button>
                <Button size="small" variant="outlined" onClick={() => callGhostLidarAction("relocalize")}>Restart Relocalization</Button>
                <Button size="small" variant="outlined" onClick={() => callGhostLidarAction("activate_apriltag")}>Enable AprilTag</Button>
                <Button size="small" variant="outlined" onClick={() => callGhostLidarAction("planner")}>Activate Planner</Button>
                <Button size="small" variant="outlined" onClick={() => callGhostLidarAction("mpc_lio_obs")}>MPC LIO Obs</Button>
              </Box>

              <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", mt: 2 }}>
                <TextField
                  size="small"
                  label="Save Map Destination"
                  value={saveMapDestination}
                  onChange={(e) => setSaveMapDestination(e.target.value)}
                  placeholder="/home/ghost/gps_denied_maps/site_a"
                />
                <TextField
                  size="small"
                  label="Resolution"
                  type="number"
                  value={saveMapResolution}
                  onChange={(e) => setSaveMapResolution(Number(e.target.value))}
                />
                <Button size="small" variant="contained" onClick={saveGhostMap}>Save Map</Button>
              </Box>

              <Typography variant="caption" sx={{ display: "block", mt: 1.5, opacity: 0.75 }}>
                Map dir: {ghostRuntime?.maps?.directory || "unknown"} | Last save: {ghostRuntime?.lidar?.last_map_save?.destination || "none"}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
  
        {show3DView ? (
  <Box mt={2} display="flex" justifyContent="space-between" gap={4}>
    <Box flex={1}>
      <Typography variant="h6">Live Camera View</Typography>
      <img
        src={videoStreamUrl}
        alt="Camera Feed"
        width="100%"
        style={{ border: "1px solid black", maxHeight: "480px", objectFit: "cover" }}
        onError={() =>
          setFeedback({
            open: true,
            message: "Failed to load camera feed.",
            severity: "error",
          })
        }
      />
    </Box>

    <Box flex={1}>
      <Typography variant="h6">
        {pointCloudSource === "obstmap"
          ? "3D Obstacle Map View"
          : "3D Raw Point Cloud View"}
      </Typography>
      {obstPoints.length === 0 ? (
        <Typography variant="body2">Loading 3D data...</Typography>
      ) : (
        <PointCloudViewer points={obstPoints} />
      )}
    </Box>
  </Box>
) : (
  <Box mt={2}>
    <img
      src={videoStreamUrl}
      alt="Camera Feed"
      width="100%"
      style={{ border: "1px solid black", maxHeight: "480px", objectFit: "cover" }}
      onError={() =>
        setFeedback({
          open: true,
          message: "Failed to load camera feed.",
          severity: "error",
        })
      }
    />
  </Box>
)}

      <Grid container spacing={4}>
        <Grid item xs={12}>
          <Card>
            <CardContent>
              <Typography variant="h5">{agents[selectedAgent].name}</Typography>
              <Box mt={3}>
                <Typography variant="h6">Control Commands</Typography>

                <TextField
                  type="number"
                  label="Movement Duration (seconds)"
                  variant="outlined"
                  value={movementDuration}
                  onChange={(e) =>
                    setMovementDuration(Number(e.target.value))
                  }
                  sx={{ mb: 2, width: "200px" }}
                  inputProps={{ min: 1, max: 10 }}
                />

                <Box sx={{ mt: 2, p: 2, border: "1px solid #ddd", borderRadius: 2 }}>
                  <Typography variant="h6">Keyboard Controller (Ghost Input)</Typography>
                  <Box sx={{ display: "flex", alignItems: "center", gap: 2, mt: 1 }}>
                    <Typography variant="body2">Enable</Typography>
                    <Switch
                      checked={keyboardEnabled}
                      onChange={(e) => toggleKeyboard(e.target.checked)}
                    />
                    <Typography variant="body2" sx={{ opacity: 0.7 }}>
                      Hold Shift for turbo, Space to stop
                    </Typography>
                    <Chip
                      size="small"
                      label={keyboardStatus.enabled ? "Backend: Ready" : "Backend: Idle"}
                      color={keyboardStatus.enabled ? "success" : "default"}
                      variant={keyboardStatus.enabled ? "filled" : "outlined"}
                    />
                  </Box>

                  {keyboardEnabled && (
                    <Typography variant="caption" sx={{ display: "block", mt: 1, opacity: 0.8 }}>
                      Active keys: {keyboardStatus.pressed.length ? keyboardStatus.pressed.join(", ") : "none"}
                    </Typography>
                  )}

                  {keyboardError && (
                    <Alert severity="error" sx={{ mt: 1 }}>
                      {keyboardError}
                    </Alert>
                  )}

                  <Box sx={{ display: "flex", gap: 2, mt: 2, flexWrap: "wrap" }}>
                    <FormControl size="small" sx={{ minWidth: 220 }}>
                      <InputLabel id="kb-profile-label">Profile</InputLabel>
                      <Select
                        labelId="kb-profile-label"
                        label="Profile"
                        value={keyboardProfile}
                        onChange={(e) => setKeyboardProfile(e.target.value)}
                      >
                        {KEYBOARD_PROFILES.map((p) => (
                          <MenuItem key={p.value} value={p.value}>
                            {p.label}
                          </MenuItem>
                        ))}
                      </Select>
                    </FormControl>

                    <TextField
                      label="Speed (m/s)"
                      type="number"
                      size="small"
                      value={keyboardSpeed}
                      onChange={(e) => setKeyboardSpeed(Number(e.target.value))}
                      inputProps={{ min: 0, step: 0.1 }}
                    />
                    <TextField
                      label="Strafe (m/s)"
                      type="number"
                      size="small"
                      value={keyboardStrafeSpeed}
                      onChange={(e) => setKeyboardStrafeSpeed(Number(e.target.value))}
                      inputProps={{ min: 0, step: 0.1 }}
                    />
                    <TextField
                      label="Turn (rad/s)"
                      type="number"
                      size="small"
                      value={keyboardTurnSpeed}
                      onChange={(e) => setKeyboardTurnSpeed(Number(e.target.value))}
                      inputProps={{ min: 0, step: 0.1 }}
                    />
                    <TextField
                      label="Turbo Mult"
                      type="number"
                      size="small"
                      value={keyboardTurbo}
                      onChange={(e) => setKeyboardTurbo(Number(e.target.value))}
                      inputProps={{ min: 1, step: 0.1 }}
                    />
                  </Box>
                </Box>

                <Box sx={{ mt: 2, p: 2, border: "1px solid #ddd", borderRadius: 2 }}>
                  <Typography variant="h6">Low-Level MBLink Upgrade Panel</Typography>
                  <Typography variant="body2" sx={{ mt: 1, opacity: 0.8 }}>
                    Behavior: {lowLevelTelemetry?.behavior?.name || "unknown"} | Mode: {lowLevelTelemetry?.behavior?.control_mode ?? "-"} | Action: {lowLevelTelemetry?.behavior?.action ?? "-"}
                  </Typography>
                  <Typography variant="body2" sx={{ opacity: 0.8 }}>
                    Twist des: vx {Number(lowLevelTelemetry?.se2twist_des?.vx || 0).toFixed(2)}, vy {Number(lowLevelTelemetry?.se2twist_des?.vy || 0).toFixed(2)}, wz {Number(lowLevelTelemetry?.se2twist_des?.wz || 0).toFixed(2)}
                  </Typography>
                  <Typography variant="body2" sx={{ opacity: 0.8 }}>
                    Diagnostics: {lowLevelTelemetry?.diagnostics?.count || 0} active
                  </Typography>
                  <Typography variant="caption" sx={{ display: "block", opacity: 0.75, mb: 1 }}>
                    {(lowLevelTelemetry?.diagnostics?.active || []).slice(0, 6).join(", ") || "No active flags"}
                  </Typography>

                  <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", mt: 1 }}>
                    <Button size="small" variant="outlined" onClick={() => setLowLevelBehavior("walk")}>Walk</Button>
                    <Button size="small" variant="outlined" onClick={() => setLowLevelBehavior("stand")}>Stand</Button>
                    <Button size="small" variant="outlined" onClick={() => setLowLevelBehavior("sit")}>Sit</Button>
                    <Button size="small" variant="outlined" onClick={() => setLowLevelBehavior("manual")}>Manual Mode</Button>
                    <Button size="small" variant="outlined" onClick={() => setLowLevelBehavior("original")}>Original Mode</Button>
                  </Box>

                  <Box sx={{ display: "flex", gap: 1, mt: 2, flexWrap: "wrap" }}>
                    <TextField
                      label="Diag Bitfield"
                      size="small"
                      type="number"
                      value={diagBitfieldInput}
                      onChange={(e) => setDiagBitfieldInput(e.target.value)}
                      inputProps={{ min: 0, step: 1 }}
                    />
                    <Button size="small" variant="contained" onClick={pushDiagnosticsBitfield}>Apply Diagnostics</Button>
                  </Box>

                  <Box sx={{ display: "flex", gap: 1, mt: 2, flexWrap: "wrap" }}>
                    <TextField
                      label="Param Name"
                      size="small"
                      value={paramName}
                      onChange={(e) => setParamName(e.target.value)}
                    />
                    <TextField
                      label="Param Value"
                      size="small"
                      value={paramValue}
                      onChange={(e) => setParamValue(e.target.value)}
                    />
                    <Button size="small" variant="outlined" onClick={getLowLevelParam}>Get</Button>
                    <Button size="small" variant="contained" onClick={setLowLevelParam}>Set</Button>
                  </Box>
                  {paramFeedback && (
                    <Typography variant="caption" sx={{ display: "block", mt: 1, opacity: 0.8 }}>
                      {paramFeedback}
                    </Typography>
                  )}

                  <Box sx={{ mt: 2 }}>
                    <Typography variant="subtitle2">Joint Telemetry (Vision60/Ghost)</Typography>
                    {(() => {
                      const jointTemp = safeArray(lowLevelTelemetry?.joint_temperature);
                      const jointCurrent = safeArray(lowLevelTelemetry?.joint_current);
                      const jointVoltage = safeArray(lowLevelTelemetry?.joint_voltage);
                      const tempSummary = summarizeArray(jointTemp);
                      const currentSummary = summarizeArray(jointCurrent);
                      const voltageSummary = summarizeArray(jointVoltage);

                      return (
                        <>
                          <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", mt: 1 }}>
                            <Chip size="small" variant="outlined" label={`Temp avg ${tempSummary.avg.toFixed(1)}°C`} />
                            <Chip size="small" variant="outlined" label={`Temp max ${tempSummary.max.toFixed(1)}°C`} color={tempSummary.max >= JOINT_TEMP_CRIT ? "error" : (tempSummary.max >= JOINT_TEMP_WARN ? "warning" : "default")} />
                            <Chip size="small" variant="outlined" label={`Current avg ${currentSummary.avg.toFixed(1)}A`} />
                            <Chip size="small" variant="outlined" label={`Current max ${currentSummary.max.toFixed(1)}A`} color={currentSummary.max >= JOINT_CURRENT_WARN ? "warning" : "default"} />
                            <Chip size="small" variant="outlined" label={`Voltage avg ${voltageSummary.avg.toFixed(1)}V`} />
                          </Box>

                          <Box sx={{ mt: 1, display: "grid", gap: 0.5, gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))" }}>
                            {jointTemp.map((temp, index) => {
                              const current = Number(jointCurrent[index] || 0);
                              const voltage = Number(jointVoltage[index] || 0);
                              const tempNum = Number(temp || 0);
                              const tempColor = tempNum >= JOINT_TEMP_CRIT ? "#ffebee" : (tempNum >= JOINT_TEMP_WARN ? "#fff8e1" : "#f5f5f5");
                              return (
                                <Box key={`joint-${index}`} sx={{ p: 0.75, borderRadius: 1, border: "1px solid #ddd", bgcolor: tempColor }}>
                                  <Typography variant="caption" sx={{ fontWeight: 700 }}>J{index}</Typography>
                                  <Typography variant="caption" sx={{ display: "block" }}>T {tempNum.toFixed(1)}°C</Typography>
                                  <Typography variant="caption" sx={{ display: "block" }}>I {current.toFixed(1)}A</Typography>
                                  <Typography variant="caption" sx={{ display: "block" }}>V {voltage.toFixed(1)}V</Typography>
                                </Box>
                              );
                            })}
                          </Box>

                          <Typography variant="caption" sx={{ display: "block", mt: 1, opacity: 0.75 }}>
                            Contacts: {(safeArray(lowLevelTelemetry?.contacts).length ? safeArray(lowLevelTelemetry?.contacts).join(", ") : "-")} | Phase: {(safeArray(lowLevelTelemetry?.phase).length ? safeArray(lowLevelTelemetry?.phase).map((p) => Number(p).toFixed(2)).join(", ") : "-")} | Swing: {(safeArray(lowLevelTelemetry?.swing_mode).length ? safeArray(lowLevelTelemetry?.swing_mode).join(", ") : "-")}
                          </Typography>
                        </>
                      );
                    })()}
                  </Box>
                </Box>
              
               <Box mt={4} mb={2}>
  <Typography variant="h6">3D Point Cloud Visualization</Typography>
<Typography variant="body2" sx={{ mt: 1 }}>
  Points received: {Array.isArray(checkData) ? checkData.length : 0}
</Typography>

{ghostRuntime?.metrics && (
  <Box
    sx={{
      mt: 1.5,
      p: 1.5,
      borderRadius: 2,
      background: "linear-gradient(135deg, #10212b 0%, #18384a 100%)",
      color: "#dcecf5",
      display: "grid",
      gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
      gap: 1,
      maxWidth: 980,
    }}
  >
    <div>raw pts: {ghostRuntime.metrics.pointcloud_points ?? 0}</div>
    <div>obst pts: {ghostRuntime.metrics.obstacle_points ?? 0}</div>
    <div>cloud age: {ghostRuntime.metrics.pointcloud_age_s ?? "-"} s</div>
    <div>obst age: {ghostRuntime.metrics.obstacle_age_s ?? "-"} s</div>
    <div>preview files: {ghostRuntime.metrics.preview_count ?? 0}</div>
    <div>latest map: {ghostRuntime.metrics.latest_map?.name || "none"}</div>
  </Box>
)}

{pcStats && (
  <Box
    sx={{
      mt: 1,
      p: 1,
      fontFamily: 'monospace',
      fontSize: 12,
      bgcolor: '#111',
      color: '#9f9',
      borderRadius: 1,
      lineHeight: 1.6,
      maxWidth: 420,
    }}
  >
    <div>method: {pcStats.method}</div>
    <div>points: {pcStats.points}</div>
    {pcStats.wireKB && <div>wire: {pcStats.wireKB} KB</div>}
    <div>net: {pcStats.netMs} ms</div>
    <div>parse: {pcStats.parseMs} ms</div>
    <div>decode: {pcStats.decodeMs} ms</div>
    {pcStats.encMsServer && <div>server-encode: {pcStats.encMsServer} ms</div>}
  </Box>
)}


  <Button
    variant={show3DView ? "contained" : "outlined"}
    onClick={() => setShow3DView((prev) => !prev)}
    sx={{ mr: 2 }}
  >
    {show3DView ? "Disable 3D View" : "Enable 3D View"}
  </Button>

  {show3DView && (
    <>
      {/* Existing source selector */}
      <FormControl size="small" sx={{ minWidth: 220, mr: 2 }}>
      <InputLabel id="pc-source-label">Source</InputLabel>
      <Select
        labelId="pc-source-label"
        label="Source"
        value={pointCloudSource}
        onChange={(e) => setPointCloudSource(e.target.value)}
      >
       <MenuItem value="obstmap">Obstacle Map (/obstmap)</MenuItem>
       <MenuItem value="pointcloud">Raw Point Cloud (/pointcloud)</MenuItem>
     </Select>
   </FormControl>

      {/* <Button
        variant={useCompression ? "contained" : "outlined"}
        sx={{ ml: 2 }}
        onClick={() => setUseCompression(v => !v)}
      >
        {useCompression ? "Compression: ON" : "Compression: OFF"}
      </Button> */}

      {/* Add this new Transport selector right here */}
      <FormControl size="small" sx={{ minWidth: 200 }}>
        <InputLabel>Transport</InputLabel>
        <Select
          label="Transport"
          value={pointCloudTransport}
          onChange={(e) => setPointCloudTransport(e.target.value)}
        >
          <MenuItem value="raw">Raw (JSON)</MenuItem>
          <MenuItem value="compressed">Compressed (Hilbert)</MenuItem>
          <MenuItem value="combined">Combined (/mapdata)</MenuItem>
        </Select>
      </FormControl>
    </>
  )}
</Box>

{ghostRuntime?.maps?.saved?.length ? (
  <Box sx={{ mt: 2 }}>
    <Typography variant="subtitle1">Saved GPS-Denied Maps</Typography>
    <Box sx={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 2, mt: 1 }}>
      {ghostRuntime.maps.saved.slice(0, 4).map((item) => (
        <Card key={item.name} variant="outlined" sx={{ overflow: "hidden", backgroundColor: item.is_latest ? "#f4f9ff" : "#fff" }}>
          {item.preview ? (
            <Box
              component="img"
              src={`${FLASK_API_BASE_URL}/ghost/maps/preview/${item.preview}`}
              alt={item.preview}
              sx={{ width: "100%", height: 140, objectFit: "cover", borderBottom: "1px solid #ddd" }}
            />
          ) : (
            <Box sx={{ width: "100%", height: 140, display: "grid", placeItems: "center", bgcolor: "#f3f3f3" }}>
              <Typography variant="caption">No preview PNG</Typography>
            </Box>
          )}
          <CardContent sx={{ py: 1.25 }}>
            <Typography variant="subtitle2">{item.name}</Typography>
            <Typography variant="caption" sx={{ display: "block", opacity: 0.75 }}>
              {(item.size_bytes / (1024 * 1024)).toFixed(1)} MB
            </Typography>
            <Typography variant="caption" sx={{ display: "block", opacity: 0.75 }}>
              preview: {item.preview || "none"}
            </Typography>
          </CardContent>
        </Card>
      ))}
    </Box>
  </Box>
) : null}

                <Grid container spacing={1} sx={{ mt: 1 }}>
                  {Object.keys(agents[selectedAgent].commands).map((cmd) => (
                    <Grid item xs={12} sm={6} md={4} lg={3} key={cmd}>
                      <Button
                        fullWidth
                        variant="contained"
                        color={cmd === "Stop" || cmd === "E-Stop" ? "error" : "primary"}
                        size="small"
                        onClick={() =>
                          sendCommand(
                            selectedAgent,
                            agents[selectedAgent].commands[cmd],
                            {
                              action: ["Sit", "Stand", "Walk"].includes(cmd)
                                ? cmd.toLowerCase()
                                : undefined,
                              gait: cmd === "Set Gait (Walk)" ? "walk" : undefined,
                              duration:
                                ["Move Forward", "Move Backward", "Move Left", "Move Right", "Turn Left", "Turn Right"].includes(
                                  cmd
                                )
                                  ? movementDuration
                                  : undefined,
                            }
                          )
                        }
                      >
                        {cmd}
                      </Button>
                    </Grid>
                  ))}
                </Grid>

                <Button
                  variant="outlined"
                  color="secondary"
                  sx={{ m: 1 }}
                  onClick={enableVisionMode}
                >
                  Enable Vision Obstacle Avoidance
                </Button>
              </Box>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      <Box mt={3}>
        <Typography variant="h6">Command Terminal</Typography>
        <Select
          value={selectedPredefinedCommand}
          onChange={(e) => {
            setSelectedPredefinedCommand(e.target.value);
            setCommandInput(predefinedCommands[e.target.value]);
          }}
        >
          <MenuItem value="">Select Predefined Command</MenuItem>
          {Object.keys(predefinedCommands).map((cmd) => (
            <MenuItem key={cmd} value={cmd}>
              {cmd}
            </MenuItem>
          ))}
        </Select>

        <form onSubmit={handleCommandSubmit}>
          <TextField
            fullWidth
            variant="outlined"
            multiline
            rows={4}
            placeholder="Enter JSON command here..."
            value={commandInput}
            onChange={(e) => setCommandInput(e.target.value)}
          />
          <Button type="submit" variant="contained" sx={{ mt: 2 }}>
            Send Command
          </Button>
        </form>
      </Box>
      <Box mt={4}>
  <Typography variant="h6">Send Autonomous Goal</Typography>
  <Grid container spacing={2}>
    <Grid item xs={6}>
      <TextField
        label="Latitude"
        type="text"
        inputMode="decimal"
        pattern="^-?\d*(\.\d+)?$"
        fullWidth
        value={gpsGoal.lat}
        onChange={(e) => setGpsGoal({ ...gpsGoal, lat: parseFloat(e.target.value) || 0 })}
      />
    </Grid>
    <Grid item xs={6}>
      <TextField
        label="Longitude"
        type="text"
        inputMode="decimal"
        pattern="^-?\d*(\.\d+)?$"
        fullWidth
        value={gpsGoal.lng}
        onChange={(e) => setGpsGoal({ ...gpsGoal, lng: parseFloat(e.target.value) || 0 })}
      />
    </Grid>
  </Grid>
  <Button
    variant="contained"
    sx={{ mt: 2 }}
    onClick={async () => {
      try {
        const response = await fetch(`${FLASK_API_BASE_URL}/command/send_goal`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
        latitude: gpsGoal.lat,
        longitude: gpsGoal.lng,
        z: 0.0,
      }),
  });

        const result = await response.json();
        setFeedback({
          open: true,
          message: result.message || "Goal sent!",
          severity: response.ok ? "success" : "error",
        });
      } catch (err) {
        setFeedback({
          open: true,
          message: "Failed to send GPS goal.",
          severity: "error",
        });
      }
    }}
  >
    Send GPS Goal to Robot
  </Button>
  <Box mt={4}>
  <Typography variant="h6">Autonomous Planner Control</Typography>

  <Box mt={2}>
    <Typography gutterBottom>Speed (m/s): {plannerSpeed.toFixed(2)}</Typography>
    <Slider
      value={plannerSpeed}
      onChange={(e, newValue) => setPlannerSpeed(newValue)}
      min={0.1}
      max={1.5}
      step={0.1}
      valueLabelDisplay="auto"
      aria-labelledby="planner-speed-slider"
    />
  </Box>

  <Button
    variant="contained"
    color="primary"
    sx={{ mt: 2 }}
    onClick={async () => {
      try {
        const response = await fetch(`${FLASK_API_BASE_URL}/command/autonomous_move`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ linear_x: plannerSpeed }),
        });
        const result = await response.json();
        setFeedback({
          open: true,
          message: result.message || "Planner goal sent!",
          severity: response.ok ? "success" : "error",
        });
      } catch (err) {
        setFeedback({
          open: true,
          message: "Failed to send planner goal.",
          severity: "error",
        });
      }
    }}
  >
    Send Planner Goal
  </Button>
</Box>


</Box>


      <Snackbar
        open={feedback.open}
        autoHideDuration={4000}
        onClose={() => setFeedback({ ...feedback, open: false })}
      >
        <Alert
          severity={feedback.severity}
          onClose={() => setFeedback({ ...feedback, open: false })}
        >
          {feedback.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}

export default Ros2Agents;
