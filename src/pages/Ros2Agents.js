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
} from "@mui/material";

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
};

function Ros2Agents() {
  const [selectedAgent, setSelectedAgent] = useState("ghost");
  const [selectedCamera, setSelectedCamera] = useState("Front Left");
  const [batteryStatus, setBatteryStatus] = useState("Unknown");
  const [gpsData, setGpsData] = useState({ lat: 0, lng: 0 });
  const [commandInput, setCommandInput] = useState("");
  const [movementDuration, setMovementDuration] = useState(1);
  const [selectedPredefinedCommand, setSelectedPredefinedCommand] =
    useState("");
  const [videoStreamUrl, setVideoStreamUrl] = useState("");
  const [viewMode, setViewMode] = useState("stream");
  const [feedback, setFeedback] = useState({
    open: false,
    message: "",
    severity: "info",
  });

  useEffect(() => {
    const basePath =
      viewMode === "stream"
        ? "/proxy_camera_feed"
        : "/proxy_camera_snapshot";

    setVideoStreamUrl(
      `${FLASK_API_BASE_URL}${basePath}/${agents[selectedAgent].cameras[selectedCamera]}`
    );
  }, [selectedCamera, selectedAgent, viewMode]);

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
        sendCommand(selectedAgent, parsedCommand.topic, parsedCommand.command);
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

        <Box mt={2}>
          <img
            src={videoStreamUrl}
            alt="Camera Feed"
            width="1920"
            height="1080"
            style={{ border: "1px solid black" }}
            onError={() =>
              setFeedback({
                open: true,
                message: "Failed to load camera feed.",
                severity: "error",
              })
            }
          />
        </Box>
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
