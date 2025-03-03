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

// Flask API Base URL
const FLASK_API_BASE_URL = "http://192.168.168.105:5002";

// Modular framework for multiple agents
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
      "Front Left": "front_left",
      "Front Right": "front_right",
      "Rear": "rear",
      "Side Left": "side_left",
      "Side Right": "side_right",
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

// 🔹 Send commands via the Flask API
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
  const [robotStatus, setRobotStatus] = useState("Unknown");
  const [robotPosition, setRobotPosition] = useState({ x: 0, y: 0, z: 0 });
  const [alerts, setAlerts] = useState([]);
  const [diagnostics, setDiagnostics] = useState([]);

  const agentData = agents[selectedAgent];

  // Fetch robot status & position
  useEffect(() => {
    const fetchStatus = async () => {
      try {
        const response = await fetch(`${FLASK_API_BASE_URL}/status`);
        if (!response.ok) throw new Error("Failed to fetch status");

        const data = await response.json();
        setRobotStatus(data.agents?.ghost || "Unknown");
        setRobotPosition(data.position?.ghost || { x: 0, y: 0, z: 0 });
      } catch (error) {
        console.error("Error fetching robot data:", error);
      }
    };

    fetchStatus();
    const interval = setInterval(fetchStatus, 5000);
    return () => clearInterval(interval);
  }, []);

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

    if (commandName === "Sit") {
      params = { mode: "sit" };
    } else if (commandName === "Stand") {
      params = { mode: "stand" };
    } else if (commandName === "Manual Twist") {
      params = { linear: { x: 1, y: 0, z: 0 }, angular: { x: 0, y: 0, z: 0 } };
    }

    sendCommand(selectedAgent, topic, params);
  };

  return (
    <Box sx={{ p: 4 }}>
      <Typography variant="h4" gutterBottom>
        ROS 2 Agent Control Center
      </Typography>

      {/* Agent Selection */}
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
              {agentData.cameras && (
                <Box mt={3}>
                  <Typography variant="h6">Camera Feed</Typography>
                  <Select value={selectedCamera} onChange={(e) => setSelectedCamera(e.target.value)}>
                    {Object.keys(agentData.cameras).map((cam) => (
                      <MenuItem key={cam} value={cam}>
                        {cam}
                      </MenuItem>
                    ))}
                  </Select>
                  <Box mt={2}>
                    <img
                      src={`${FLASK_API_BASE_URL}/camera_feed/${agentData.cameras[selectedCamera]}`}
                      alt="Robot Camera"
                      width="640"
                      height="480"
                    />
                  </Box>
                </Box>
              )}
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Box>
  );
}

export default Ros2Agents;


/*import React, { useState, useEffect } from "react";
import { Button, Typography, Grid, TextField, Box, Card, CardContent } from "@mui/material";

const FLASK_API_BASE_URL = "http://192.168.168.105:5002"; // Flask API

const Ros2Agents = () => {
  const [robotStatus, setRobotStatus] = useState({
    ghost: "Unknown",
    huskyJackal: "Unknown",
    spot: "Unknown",
  });

  const [robotPosition, setRobotPosition] = useState({
    ghost: { x: 0, y: 0, z: 0 },
    huskyJackal: { x: 0, y: 0, z: 0 },
    spot: { x: 0, y: 0, z: 0 },
  });

  const [command, setCommand] = useState("");

  // Fetch Robot Status & Positions from Flask
  const fetchRobotData = async () => {
    try {
      const response = await fetch(`${FLASK_API_BASE_URL}/status`);
      if (!response.ok) throw new Error("Failed to fetch robot data");

      const data = await response.json();
      setRobotStatus(data.status);
      setRobotPosition(data.position);
    } catch (error) {
      console.error("Error fetching robot data:", error);
    }
  };

  // Send Movement Commands via Flask API
  const sendMoveCommand = async (robot, topic, linearX, angularZ) => {
    try {
      const response = await fetch(`${FLASK_API_BASE_URL}/command`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          robot: robot,
          topic: topic,
          command: {
            linear: { x: linearX, y: 0, z: 0 },
            angular: { x: 0, y: 0, z: angularZ },
          },
        }),
      });

      if (!response.ok) throw new Error("Failed to send command");

      const result = await response.json();
      console.log("Flask Response:", result);
    } catch (error) {
      console.error("Error sending command:", error);
    }
  };

  useEffect(() => {
    const interval = setInterval(fetchRobotData, 5000);
    return () => clearInterval(interval);
  }, []);

  return (
    <Box sx={{ p: 4 }}>
      <Typography variant="h4">ROS 2 Agent Control (Flask API)</Typography>

      <Grid container spacing={2}>
        <Grid item xs={12} md={4}>
          <Card>
            <CardContent>
              <Typography variant="h6">Ghost Robotics</Typography>
              <Typography>Status: {robotStatus.ghost}</Typography>
              <Typography>Position: X={robotPosition.ghost.x}, Y={robotPosition.ghost.y}, Z={robotPosition.ghost.z}</Typography>
              <Button onClick={() => sendMoveCommand("ghost", "/mcu/command/manual_twist", 1, 0)}>
                Move Forward
              </Button>
              <Button onClick={() => sendMoveCommand("ghost", "/mcu/command/manual_twist", -1, 0)}>
                Move Backward
              </Button>
              <Button onClick={() => sendMoveCommand("ghost", "/mcu/command/manual_twist", 0, 1)}>
                Turn Left
              </Button>
              <Button onClick={() => sendMoveCommand("ghost", "/mcu/command/manual_twist", 0, -1)}>
                Turn Right
              </Button>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={4}>
          <Card>
            <CardContent>
              <Typography variant="h6">Husky & Jackal</Typography>
              <Typography>Status: {robotStatus.huskyJackal}</Typography>
              <Typography>Position: X={robotPosition.huskyJackal.x}, Y={robotPosition.huskyJackal.y}, Z={robotPosition.huskyJackal.z}</Typography>
              <Button onClick={() => sendMoveCommand("huskyJackal", "/husky/cmd_vel", 1, 0)}>
                Move Forward
              </Button>
              <Button onClick={() => sendMoveCommand("huskyJackal", "/husky/cmd_vel", -1, 0)}>
                Move Backward
              </Button>
              <Button onClick={() => sendMoveCommand("huskyJackal", "/husky/cmd_vel", 0, 1)}>
                Turn Left
              </Button>
              <Button onClick={() => sendMoveCommand("huskyJackal", "/husky/cmd_vel", 0, -1)}>
                Turn Right
              </Button>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={4}>
          <Card>
            <CardContent>
              <Typography variant="h6">Spot</Typography>
              <Typography>Status: {robotStatus.spot}</Typography>
              <Typography>Position: X={robotPosition.spot.x}, Y={robotPosition.spot.y}, Z={robotPosition.spot.z}</Typography>
              <Button onClick={() => sendMoveCommand("spot", "/spot/cmd_vel", 1, 0)}>
                Move Forward
              </Button>
              <Button onClick={() => sendMoveCommand("spot", "/spot/cmd_vel", -1, 0)}>
                Move Backward
              </Button>
              <Button onClick={() => sendMoveCommand("spot", "/spot/cmd_vel", 0, 1)}>
                Turn Left
              </Button>
              <Button onClick={() => sendMoveCommand("spot", "/spot/cmd_vel", 0, -1)}>
                Turn Right
              </Button>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      <Box mt={3}>
        <TextField
          fullWidth
          variant="outlined"
          placeholder="Enter custom command..."
          value={command}
          onChange={(e) => setCommand(e.target.value)}
          onKeyPress={(e) => {
            if (e.key === "Enter") console.log("Sending custom command:", command);
          }}
        />
      </Box>
    </Box>
  );
};

export default Ros2Agents;
*/


/* import React, { useState, useEffect } from "react";
import ROSLIB from "roslib";
import { Button, Typography, Grid, TextField, Box } from "@mui/material";

const Ros2Agents = () => {
  const [rosConnected, setRosConnected] = useState({
    ghost: false,
    huskyJackal: false,
    spot: false,
  });

  const [robotPosition, setRobotPosition] = useState({
    ghost: { x: 0, y: 0, z: 0 },
    huskyJackal: { x: 0, y: 0, z: 0 },
    spot: { x: 0, y: 0, z: 0 },
  });

  const [robotStatus, setRobotStatus] = useState({
    ghost: "Unknown",
    huskyJackal: "Unknown",
    spot: "Unknown",
  });

  const [command, setCommand] = useState("");

  useEffect(() => {
    // Setup WebSocket Connections for Each Robot
    const ghostRos = new ROSLIB.Ros({ url: "ws://192.168.168.105:9090" });
    const huskyJackalRos = new ROSLIB.Ros({ url: "ws://192.168.168.106:9091" });
    const spotRos = new ROSLIB.Ros({ url: "ws://192.168.168.107:9092" });

    // Connection Handlers
    const handleConnection = (robot) => setRosConnected((prev) => ({ ...prev, [robot]: true }));
    const handleError = (robot) => setRosConnected((prev) => ({ ...prev, [robot]: false }));
    const handleClose = (robot) => setRosConnected((prev) => ({ ...prev, [robot]: false }));

    ghostRos.on("connection", () => handleConnection("ghost"));
    ghostRos.on("error", () => handleError("ghost"));
    ghostRos.on("close", () => handleClose("ghost"));

    huskyJackalRos.on("connection", () => handleConnection("huskyJackal"));
    huskyJackalRos.on("error", () => handleError("huskyJackal"));
    huskyJackalRos.on("close", () => handleClose("huskyJackal"));

    spotRos.on("connection", () => handleConnection("spot"));
    spotRos.on("error", () => handleError("spot"));
    spotRos.on("close", () => handleClose("spot"));

    // Subscribe to Position Topics (Odometry)
    const setupOdometry = (ros, robot, topicName) => {
      const odomTopic = new ROSLIB.Topic({
        ros,
        name: topicName,
        messageType: "nav_msgs/Odometry",
      });

      odomTopic.subscribe((msg) => {
        setRobotPosition((prev) => ({
          ...prev,
          [robot]: {
            x: msg.pose.pose.position.x.toFixed(2),
            y: msg.pose.pose.position.y.toFixed(2),
            z: msg.pose.pose.position.z.toFixed(2),
          },
        }));
      });
    };

    setupOdometry(ghostRos, "ghost", "/gx5/nav/odom");
    setupOdometry(huskyJackalRos, "huskyJackal", "/odom");
    setupOdometry(spotRos, "spot", "/odom");

    // Subscribe to Status Topics
    const setupStatus = (ros, robot, topicName) => {
      const statusTopic = new ROSLIB.Topic({
        ros,
        name: topicName,
        messageType: "std_msgs/String",
      });

      statusTopic.subscribe((msg) => {
        setRobotStatus((prev) => ({ ...prev, [robot]: msg.data }));
      });
    };

    setupStatus(ghostRos, "ghost", "/mcu/state/robotVersion");
    setupStatus(huskyJackalRos, "huskyJackal", "/state/heartbeat");
    setupStatus(spotRos, "spot", "/state/heartbeat");

    // Cleanup on Unmount
    return () => {
      ghostRos.close();
      huskyJackalRos.close();
      spotRos.close();
    };
  }, []);

  // Function to Send Movement Commands
  const sendMoveCommand = (robot, linearX, angularZ, topic) => {
    let ros;
    if (robot === "ghost") ros = new ROSLIB.Ros({ url: "ws://192.168.168.105:9090" });
    else if (robot === "huskyJackal") ros = new ROSLIB.Ros({ url: "ws://192.168.168.106:9091" });
    else if (robot === "spot") ros = new ROSLIB.Ros({ url: "ws://192.168.168.107:9092" });

    const cmdVel = new ROSLIB.Topic({
      ros,
      name: topic,
      messageType: "geometry_msgs/Twist",
    });

    const twist = new ROSLIB.Message({
      linear: { x: linearX, y: 0, z: 0 },
      angular: { x: 0, y: 0, z: angularZ },
    });

    cmdVel.publish(twist);
  };

  return (
    <div>
      <Typography variant="h4">ROS 2 Agent Control (Multi-Robot)</Typography>

      <Typography>Ghost Robotics: {rosConnected.ghost ? "✅ Connected" : "❌ Disconnected"}</Typography>
      <Typography>Husky & Jackal: {rosConnected.huskyJackal ? "✅ Connected" : "❌ Disconnected"}</Typography>
      <Typography>Spot: {rosConnected.spot ? "✅ Connected" : "❌ Disconnected"}</Typography>

      <Grid container spacing={2}>
        <Grid item>
          <Button onClick={() => sendMoveCommand("ghost", 1, 0, "/mcu/command/manual_twist")}>Move Ghost Forward</Button>
        </Grid>
        <Grid item>
          <Button onClick={() => sendMoveCommand("huskyJackal", 1, 0, "/husky/cmd_vel")}>Move Husky & Jackal Forward</Button>
        </Grid>
        <Grid item>
          <Button onClick={() => sendMoveCommand("spot", 1, 0, "/spot/cmd_vel")}>Move Spot Forward</Button>
        </Grid>
      </Grid>

      <Box mt={2}>
        <TextField
          fullWidth
          variant="outlined"
          placeholder="Enter custom command..."
          value={command}
          onChange={(e) => setCommand(e.target.value)}
          onKeyPress={(e) => {
            if (e.key === "Enter") console.log("Sending custom command:", command);
          }}
        />
      </Box>
    </div>
  );
};

export default Ros2Agents;
*/