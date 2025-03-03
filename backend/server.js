const express = require("express");
const http = require("http");
const socketIo = require("socket.io");
const cors = require("cors");
const ROSLIB = require("roslib");
const rosnodejs = require("rosnodejs");

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*", // Allow frontend to access
  },
});

// ROS 2 setup
const ros2 = new ROSLIB.Ros({
  url: "ws://localhost:9090" // Replace with your ROS 2 WebSocket URL
});

ros2.on("connection", () => {
  console.log("Connected to ROS 2");
});

ros2.on("error", (error) => {
  console.log("Error connecting to ROS 2:", error);
});

ros2.on("close", () => {
  console.log("Connection to ROS 2 closed");
});

// ROS 1 setup
rosnodejs.initNode('/my_node')
  .then((rosNode) => {
    console.log("Connected to ROS 1");

    // Define ROS 1 topics for GPS data
    const huskyGpsTopic = rosNode.subscribe('/husky/gps', 'sensor_msgs/NavSatFix', (message) => {
      updateAgentData("Husky", message.latitude, message.longitude);
    });

    const jackalGpsTopic = rosNode.subscribe('/jackal/gps', 'sensor_msgs/NavSatFix', (message) => {
      updateAgentData("Jackal", message.latitude, message.longitude);
    });
  })
  .catch((error) => {
    console.log("Error connecting to ROS 1:", error);
  });

// Define ROS 2 topics for GPS data
const spotGpsTopic = new ROSLIB.Topic({
  ros: ros2,
  name: "/spot/gps",
  messageType: "sensor_msgs/NavSatFix"
});

const ghostGpsTopic = new ROSLIB.Topic({
  ros: ros2,
  name: "/ghost/gps",
  messageType: "sensor_msgs/NavSatFix"
});

// Store the latest GPS data for each robot
let agents = [
  { id: 1, name: "Husky", lat: 0, lng: 0, status: "online" },
  { id: 2, name: "Jackal", lat: 0, lng: 0, status: "online" },
  { id: 3, name: "Boston Spot", lat: 0, lng: 0, status: "online" },
  { id: 4, name: "Ghost Robotics", lat: 0, lng: 0, status: "online" },
];

// Update agent data with actual GPS data
const updateAgentData = (name, lat, lng) => {
  agents = agents.map(agent => 
    agent.name === name ? { ...agent, lat, lng } : agent
  );
  io.emit("updateAgents", agents);
};

// Subscribe to ROS 2 GPS topics
spotGpsTopic.subscribe((message) => {
  updateAgentData("Boston Spot", message.latitude, message.longitude);
});

ghostGpsTopic.subscribe((message) => {
  updateAgentData("Ghost Robotics", message.latitude, message.longitude);
});

// Handle client connections
io.on("connection", (socket) => {
  console.log("Client connected");
  socket.emit("updateAgents", agents); // Send initial data

  socket.on("sendCommand", (data) => {
    const { robot, command } = data;
    const twist = new ROSLIB.Message({
      linear: {
        x: command === "forward" ? 1.0 : 0.0,
        y: 0.0,
        z: 0.0
      },
      angular: {
        x: 0.0,
        y: 0.0,
        z: command === "left" ? 1.0 : command === "right" ? -1.0 : 0.0
      }
    });

    if (robot === "spot") {
      const spotCommandTopic = new ROSLIB.Topic({
        ros: ros2,
        name: "/spot/cmd_vel",
        messageType: "geometry_msgs/Twist"
      });
      spotCommandTopic.publish(twist);
    } else if (robot === "ghost") {
      const ghostCommandTopic = new ROSLIB.Topic({
        ros: ros2,
        name: "/ghost/cmd_vel",
        messageType: "geometry_msgs/Twist"
      });
      ghostCommandTopic.publish(twist);
    }
  });

  socket.on("disconnect", () => {
    console.log("Client disconnected");
  });
});

// Start server
const PORT = 5000;
server.listen(PORT, () => console.log(`WebSocket server running on port ${PORT}`));
