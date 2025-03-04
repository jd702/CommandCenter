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
} from "@mui/material";

// Base Flask API URL (Update if needed)
const FLASK_API_BASE_URL = "http://192.168.168.105:5002";

// 🔹 Modular Framework for Multiple Agents
const agents = {
  ghost: {
    name: "Ghost Robotics",
    commands: {
      "Manual Twist": "/mcu/command/manual_twist",
      "Remote Twist": "/mcu/command/remote_twist",
      "Come Home": "/command/come_home",
      "Dock": "/command/dock",
      "Undock": "/command/undock",
      "Cancel Mission": "/command/cancel_mission",
      "Start Mission": "/command/start_mission",
      "Pause Mission": "/command/pause_mission",
      "Unpause Mission": "/command/unpause_mission",
      "Set EStop": "/command/setEStop",
      "Play Sound": "/command/play_sound",
      "Record Route": "/command/record_route",
      "Return to Start": "/command/return_to_start",
      "Set Control Mode": "/command/setControlMode",
      "Set Robot Mode": "/command/setRobotMode",
      "Sit": "/command/setRobotMode",
      "Stand": "/command/setRobotMode",
      "GPS Route": "/command/gps_route",
      "Send Goal": "/move_base_simple/goal",
    },
    cameras: {
      "Front Left": "/argus/ar0234_front_left/image_raw",
      "Front Right": "/argus/ar0234_front_right/image_raw",
      "Rear": "/argus/ar0234_rear/image_raw",
      "Side Left": "/argus/ar0234_side_left/image_raw",
      "Side Right": "/argus/ar0234_side_right/image_raw",
    },
    sensors: {
      "IMU Data": "/gx5/imu/data",
      "GPS Data": "/gps_addon/fix",
      "Battery Status": "/mcu/state/battery",
    },
  },
  husky: {
    name: "Husky (ROS1)",
    commands: {
      "Move Forward": "/husky/cmd_vel",
      "Move Backward": "/husky/cmd_vel",
      "Turn Left": "/husky/cmd_vel",
      "Turn Right": "/husky/cmd_vel",
    },
  },
  jackal: {
    name: "Jackal (ROS1)",
    commands: {
      "Move Forward": "/jackal/cmd_vel",
      "Move Backward": "/jackal/cmd_vel",
      "Turn Left": "/jackal/cmd_vel",
      "Turn Right": "/jackal/cmd_vel",
    },
  },
  spot: {
    name: "Spot (ROS2)",
    commands: {
      "Move Forward": "/spot/cmd_vel",
      "Move Backward": "/spot/cmd_vel",
      "Turn Left": "/spot/cmd_vel",
      "Turn Right": "/spot/cmd_vel",
    },
  },
};

// 🔹 Send a command via the Flask API
const sendCommand = async (agent, topic, params = {}) => {
  console.log(`Sending command to ${agent}:`, topic, params);

  try {
    const response = await fetch(`${FLASK_API_BASE_URL}/command`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        agent,
        topic,
        command: params,
      }),
    });

    if (!response.ok) throw new Error(`Command failed: ${response.status}`);

    const result = await response.json();
    console.log("Command result:", result);
  } catch (error) {
    console.error("Error sending command:", error);
  }
};

function Ros2Agents() {
  const [selectedAgent, setSelectedAgent] = useState("ghost");
  const [customCommand, setCustomCommand] = useState("");
  const [selectedCamera, setSelectedCamera] = useState("Front Left");
  const [selectedSensor, setSelectedSensor] = useState("IMU Data");
  const [robotStatus, setRobotStatus] = useState("Unknown");
  const [robotPosition, setRobotPosition] = useState({ x: 0, y: 0, z: 0 });
  const [alerts, setAlerts] = useState([]);
  const [diagnostics, setDiagnostics] = useState([]);
  const [videoStreamUrl, setVideoStreamUrl] = useState("");
  
  const agentData = agents[selectedAgent];

  // Fetch robot status & position
  useEffect(() => {
    const fetchStatus = async () => {
      try {
        const response = await fetch(`${FLASK_API_BASE_URL}/status`);
        if (!response.ok) throw new Error("Failed to fetch status");

        const data = await response.json();
        setRobotStatus(data.agents?.[selectedAgent] || "Unknown");
        setRobotPosition(data.position?.[selectedAgent] || { x: 0, y: 0, z: 0 });
      } catch (error) {
        console.error("Error fetching robot data:", error);
      }
    };

    fetchStatus();
    const interval = setInterval(fetchStatus, 5000);
    return () => clearInterval(interval);
  }, [selectedAgent]);

  // Fetch alerts & diagnostics
  useEffect(() => {
    const fetchAlertsAndDiagnostics = async () => {
      try {
        const alertsResponse = await fetch(`${FLASK_API_BASE_URL}/alerts`);
        const diagnosticsResponse = await fetch(`${FLASK_API_BASE_URL}/diagnostics`);
        if (!alertsResponse.ok || !diagnosticsResponse.ok) throw new Error("Failed to fetch alerts/diagnostics");

        const alertsData = await alertsResponse.json();
        const diagnosticsData = await diagnosticsResponse.json();

        setAlerts(alertsData.alerts || []);
        setDiagnostics(diagnosticsData.diagnostics || []);
      } catch (error) {
        console.error("Error fetching alerts/diagnostics:", error);
      }
    };

    fetchAlertsAndDiagnostics();
    const interval = setInterval(fetchAlertsAndDiagnostics, 10000);
    return () => clearInterval(interval);
  }, []);

  // Handle predefined commands
  const handlePredefinedCommand = (commandName) => {
    const topic = agentData.commands[commandName];
    let params = {};

    if (commandName === "Sit") params = { mode: "sit" };
    else if (commandName === "Stand") params = { mode: "stand" };
    else if (commandName.includes("Move Forward")) params = { linear: { x: 1, y: 0, z: 0 }, angular: { x: 0, y: 0, z: 0 } };
    else if (commandName.includes("Move Backward")) params = { linear: { x: -1, y: 0, z: 0 }, angular: { x: 0, y: 0, z: 0 } };
    else if (commandName.includes("Turn Left")) params = { linear: { x: 0, y: 0, z: 0 }, angular: { x: 0, y: 0, z: 1 } };
    else if (commandName.includes("Turn Right")) params = { linear: { x: 0, y: 0, z: 0 }, angular: { x: 0, y: 0, z: -1 } };

    sendCommand(selectedAgent, topic, params);
  };

  return (
    <Box sx={{ p: 4 }}>
      <Typography variant="h4">ROS 2 Agent Control Center</Typography>

      <Box mb={3}>
        <Typography variant="h6">Select Agent:</Typography>
        <Select value={selectedAgent} onChange={(e) => setSelectedAgent(e.target.value)}>
          {Object.keys(agents).map((agent) => (
            <MenuItem key={agent} value={agent}>
              {agents[agent].name}
            </MenuItem>
          ))}
        </Select>
      </Box>

      <Grid container spacing={4}>
        <Grid item xs={12}>
          <Card>
            <CardContent>
              <Typography variant="h5">{agentData.name}</Typography>
              <Typography>Status: {robotStatus}</Typography>
              <Typography>Position: X={robotPosition.x}, Y={robotPosition.y}, Z={robotPosition.z}</Typography>

              <Box mt={3}>
                <Typography variant="h6">Movement Controls</Typography>
                {["Move Forward", "Move Backward", "Turn Left", "Turn Right"].map((cmd) => (
                  <Button key={cmd} variant="contained" onClick={() => handlePredefinedCommand(cmd)}>
                    {cmd}
                  </Button>
                ))}
              </Box>
            </CardContent>
          </Card>
        </Grid>

        {/* Predefined Commands */}
        <Box mt={3}>
          <Typography variant="subtitle1">Commands</Typography>
          <Grid container spacing={2}>
            {Object.keys(agentData.commands).map((cmd) => (
              <Grid item key={cmd}>
                <Button variant="contained" onClick={() => handlePredefinedCommand(cmd)}>
                  {cmd}
                </Button>
              </Grid>
            ))}
          </Grid>
        </Box>

        {/* Camera Feeds */}
        <Box mt={3}>
          <Typography variant="h6">Live Video Feed</Typography>
          <Select value={selectedCamera} onChange={(e) => setSelectedCamera(e.target.value)}>
            {Object.keys(agentData.cameras).map((cam) => (
              <MenuItem key={cam} value={cam}>{cam}</MenuItem>
            ))}
          </Select>
          <Box mt={2}>
            <img
              src={`${FLASK_API_BASE_URL}/camera_feed?topic=${agentData.cameras[selectedCamera]}`}
              alt="Robot Camera"
              width="640"
              height="480"
              onError={(e) => {
                console.error("Error loading camera feed:", e);
                e.target.src = "path/to/placeholder/image.png"; // Fallback image
              }}
            />
          </Box>
        </Box>

        {/* Sensor Data */}
        <Box mt={3}>
          <Typography variant="h6">Sensor Data</Typography>
          <Select value={selectedSensor} onChange={(e) => setSelectedSensor(e.target.value)}>
            {Object.keys(agentData.sensors).map((sensor) => (
              <MenuItem key={sensor} value={sensor}>
                {sensor}
              </MenuItem>
            ))}
          </Select>
        </Box>
      </Grid>
    </Box>
  );
}

export default Ros2Agents;