import React, { useState, useEffect } from "react";
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

} from "@mui/material";
import PointCloudViewer from "./PointCloudViewer";
import {PointCloudDecompressor} from './Ros2Agents_with_HSFC'

const FLASK_API_BASE_URL = "http://192.168.168.105:5002";

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


function Ros2Agents() {
  const [selectedAgent, setSelectedAgent] = useState("ghost");
  const [selectedCamera, setSelectedCamera] = useState("Front Left");
  const [batteryStatus, setBatteryStatus] = useState("Unknown");
  const [gpsData, setGpsData] = useState({ lat: 0, lng: 0 });
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


  const decompressor = new PointCloudDecompressor(3);
  const [useCompression, setUseCompression] = useState(false);
  const [videoStreamUrl, setVideoStreamUrl] = useState("");
  const [viewMode, setViewMode] = useState("stream");
  const [feedback, setFeedback] = useState({
    open: false,
    message: "",
    severity: "info",
  });
  useEffect(() => {
    let interval; // To store interval reference for cleanup
  
    // Helper function: fetches snapshot image and forces URL update to prevent browser caching
    const fetchSnapshot = () => {
      const url = `${FLASK_API_BASE_URL}/proxy_camera_snapshot/${agents[selectedAgent].cameras[selectedCamera]}?t=${Date.now()}`;
      setVideoStreamUrl(url); // Update React state to re-render image
    };
  
    if (viewMode === "stream") {
      // "Stream" mode selected: fetch snapshot immediately, then continuously at 250ms interval
      // Creates a realistic, smooth video-like effect (4 fps)
      fetchSnapshot(); // Initial immediate fetch
      interval = setInterval(fetchSnapshot, 250); // Frequent updates for pseudo-live effect
    } else if (viewMode === "snapshot") {
      // "Snapshot" mode selected: fetch single snapshot immediately upon mode change
      fetchSnapshot();
  
      if (autoSnapshot) {
        // If user enabled "auto-snapshot", set slower periodic snapshot refresh (every 2 sec)
        interval = setInterval(fetchSnapshot, 2000);
      }
      // Else: no interval set, snapshot stays static unless manually refreshed by the user
    }
  
    // Cleanup: Clear interval whenever dependencies change to avoid memory leaks and duplicate intervals
    return () => clearInterval(interval);
  }, [selectedCamera, selectedAgent, viewMode, autoSnapshot]);
  
  
  
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
    // default raw:
    return pointCloudSource === "obstmap" ? "/obstmap" : "/pointcloud";
  })();

  const fetchPointCloud = async () => {
  try {
    // choose endpoint based on toggle
    const endpoint = useCompression
      ? `${pointCloudSource}_compressed`   // obstmap_compressed | pointcloud_compressed
      : pointCloudSource;                  // obstmap | pointcloud

    const res = await fetch(`${FLASK_API_BASE_URL}/${endpoint}`);
    const data = await res.json();
    // console.log("Fetched point cloud:", data);

    if (useCompression) {
      // compressed format
      if (data.status === "ok" && data.compressed_data) {
        const points = decompressor.decompressPointCloud(data.compressed_data);
        setObstPoints(points);
      } else {
        console.error("Compressed endpoint error:", data.message || data.status);
        setObstPoints([]);
      }
    } else {
      // raw format (your original behavior)
      if (Array.isArray(data.points)) {
        setObstPoints(data.points);
      } else if (Array.isArray(data.obstmap) || Array.isArray(data.pointcloud)) {
        const arr = pointCloudSource === "obstmap" ? data.obstmap : data.pointcloud;
        setObstPoints(arr || []);
      } else {
        setObstPoints([]);
      }
    }
  } catch (err) {
    console.error("Failed to fetch point cloud:", err);
  }
};


  fetchPointCloud(); // initial
  interval = setInterval(fetchPointCloud, POINTCLOUD_POLL_MS);

  return () => {
    abort = true;
    clearInterval(interval);
    setObstPoints([]);
  };
}, [show3DView, pointCloudSource, pointCloudTransport]);

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
  if (commandInput.trim() !== "") {
    try {
      const parsedCommand = JSON.parse(commandInput);

      // Special case for GPS goal command
      if (parsedCommand.topic === "/command/send_goal") {
        fetch(`${FLASK_API_BASE_URL}/command/send_goal`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(parsedCommand.command),
        })
          .then((res) => res.json())
          .then((result) =>
            setFeedback({
              open: true,
              message: result.message || "Goal sent!",
              severity: "success",
            })
          )
          .catch(() =>
            setFeedback({
              open: true,
              message: "Failed to send GPS goal.",
              severity: "error",
            })
          );
      } else {
        // Default command route
        sendCommand(selectedAgent, parsedCommand.topic, parsedCommand.command);
      }

      setCommandInput("");
    } catch (error) {
      setFeedback({
        open: true,
        message: "Invalid JSON format.",
        severity: "error",
      });
    }
  }
};

  
  return (
    <Box sx={{ p: 4 }}>
      <Typography variant="h4">ROS 2 Agent Control Center</Typography>
      <Typography variant="h6">Battery Status: {batteryStatus}%</Typography>
      <Typography variant="h6">
        GPS: Lat {gpsData.lat}, Lng {gpsData.lng}
      </Typography>
  
      <Box mb={3}>
        <Typography variant="h6">Select Agent:</Typography>
        <Select
          value={selectedAgent}
          onChange={(e) => setSelectedAgent(e.target.value)}
        >
          {Object.keys(agents).map((agent) => (
            <MenuItem key={agent} value={agent}>
              {agents[agent].name}
            </MenuItem>
          ))}
        </Select>
      </Box>
  
      <Box mb={3}>
        <Typography variant="h6">Live Camera Feed:</Typography>
        <Select
          value={selectedCamera}
          onChange={(e) => setSelectedCamera(e.target.value)}
        >
          {Object.keys(agents[selectedAgent].cameras).map((cam) => (
            <MenuItem key={cam} value={cam}>
              {cam}
            </MenuItem>
          ))}
        </Select>
  
        <Button
          variant="outlined"
          sx={{ my: 2 }}
          onClick={() =>
            setViewMode((prev) => (prev === "stream" ? "snapshot" : "stream"))
          }
        >
          Switch to {viewMode === "stream" ? "Snapshot" : "Live Stream"} View
        </Button>
  
        {viewMode === "snapshot" && (
          <>
            <Button
              variant="contained"
              sx={{ mx: 1 }}
              onClick={() => {
                const url = `${FLASK_API_BASE_URL}/proxy_camera_snapshot/${agents[selectedAgent].cameras[selectedCamera]}?t=${Date.now()}`;
                setVideoStreamUrl(url);
              }}
            >
              Refresh Snapshot
            </Button>
  
            <Button
              variant={autoSnapshot ? "contained" : "outlined"}
              color={autoSnapshot ? "success" : "primary"}
              sx={{ mx: 1 }}
              onClick={() => setAutoSnapshot((prev) => !prev)}
            >
              {autoSnapshot ? "Auto Snapshot: ON" : "Auto Snapshot: OFF"}
            </Button>
          </>
        )}
  
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

      </Box>  
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
              
               <Box mt={4} mb={2}>
  <Typography variant="h6">3D Point Cloud Visualization</Typography>

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

      <Button
        variant={useCompression ? "contained" : "outlined"}
        sx={{ ml: 2 }}
        onClick={() => setUseCompression(v => !v)}
      >
        {useCompression ? "Compression: ON" : "Compression: OFF"}
      </Button>

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




                {Object.keys(agents[selectedAgent].commands).map((cmd) => (
                  <Button
                    key={cmd}
                    variant="contained"
                    sx={{ m: 1 }}
                    onClick={() =>
                      sendCommand(
                        selectedAgent,
                        agents[selectedAgent].commands[cmd],
                        {
                          action: ["Sit", "Stand", "Walk"].includes(cmd)
                            ? cmd.toLowerCase()
                            : undefined,
                          gait: cmd === "Set Gait (walk)" ? "walk" : undefined,

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
                ))}

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
          topic: "/command/send_goal",
          command: {
          latitude: gpsGoal.lat,
          longitude: gpsGoal.lng,
          z: 0.0  
  }
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
