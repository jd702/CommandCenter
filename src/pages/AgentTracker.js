import React, { useState, useEffect } from "react";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import axios from "axios";
import {
  Grid,
  Card,
  CardContent,
  Typography,
  Box,
  Divider,
} from "@mui/material";

import markerIconPng from "leaflet/dist/images/marker-icon.png";
import markerShadowPng from "leaflet/dist/images/marker-shadow.png";

const FLASK_API_BASE_URL = "http://192.168.168.105:5002";

const customIcon = new L.Icon({
  iconUrl: markerIconPng,
  shadowUrl: markerShadowPng,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

const BOWIE_CS_BUILDING = [39.0193, -76.7478];

function DynamicMapMarker({ gps, icon }) {
  const map = useMap();

  useEffect(() => {
    if (gps?.latitude && gps?.longitude) {
      map.flyTo([gps.latitude, gps.longitude], map.getZoom(), {
        duration: 1.5,
      });
    }
  }, [gps, map]);

  return gps?.latitude && gps?.longitude ? (
    <Marker position={[gps.latitude, gps.longitude]} icon={icon}>
      <Popup>
        <strong>Ghost Robotics</strong>
        <br />
        Lat: {gps.latitude.toFixed(5)}
        <br />
        Lng: {gps.longitude.toFixed(5)}
      </Popup>
    </Marker>
  ) : null;
}

const AgentTracker = () => {
  const [gps, setGps] = useState({});
  const [battery, setBattery] = useState("N/A");
  const [status, setStatus] = useState("Unknown");
  const [imu, setImu] = useState({});
  const [odom, setOdom] = useState({});



  useEffect(() => {
    const fetchData = async () => {
      try {
        const [gpsRes, statusRes, imuRes, odomRes] = await Promise.all([
          axios.get(`${FLASK_API_BASE_URL}/gps`),
          axios.get(`${FLASK_API_BASE_URL}/status`),
          axios.get(`${FLASK_API_BASE_URL}/imu`),
          axios.get(`${FLASK_API_BASE_URL}/odom`),
        ]);

        setGps(gpsRes.data.ghost);
        setBattery(statusRes.data.battery.ghost);
        setStatus(statusRes.data.agents.ghost);
        setImu(imuRes.data.ghost || {});
        setOdom(odomRes.data.ghost || {});

        console.log("GPS Data:", gpsRes.data.ghost);
        console.log("IMU:" , imuRes.data.ghost);
        console.log("Odom:" , odomRes.data.ghost);

      } catch (error) {
        console.error("Error fetching data:", error);
      }
    };

    fetchData();
    const interval = setInterval(fetchData, 3000);
    return () => clearInterval(interval);
  }, []);

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h4" gutterBottom>
        Agent Live Tracker
      </Typography>

      <MapContainer
        center={BOWIE_CS_BUILDING}
        zoom={18}
        style={{ height: "600px", width: "100%" }}
      >
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/">OpenStreetMap</a> contributors'
        />
        <DynamicMapMarker gps={gps} icon={customIcon} />
      </MapContainer>

      <Grid item xs={12} md={6}>
  <Card>
    <CardContent>
      <Typography variant="h6">Odometry</Typography>
      <Divider sx={{ my: 1 }} />

      <Typography fontWeight="bold">Position</Typography>
      <Typography>X: {odom?.position?.x ?? "N/A"}</Typography>
      <Typography>Y: {odom?.position?.y ?? "N/A"}</Typography>
      <Typography>Z: {odom?.position?.z ?? "N/A"}</Typography>

      <Typography fontWeight="bold" mt={2}>
        Orientation
      </Typography>
      <Typography>X: {odom?.orientation?.x ?? "N/A"}</Typography>
      <Typography>Y: {odom?.orientation?.y ?? "N/A"}</Typography>
      <Typography>Z: {odom?.orientation?.z ?? "N/A"}</Typography>
      <Typography>W: {odom?.orientation?.w ?? "N/A"}</Typography>

      <Typography fontWeight="bold" mt={2}>
        Linear Velocity
      </Typography>
      <Typography>X: {odom?.twist?.linear?.x ?? "N/A"}</Typography>
      <Typography>Y: {odom?.twist?.linear?.y ?? "N/A"}</Typography>
      <Typography>Z: {odom?.twist?.linear?.z ?? "N/A"}</Typography>

      <Typography fontWeight="bold" mt={2}>
        Angular Velocity
      </Typography>
      <Typography>X: {odom?.twist?.angular?.x ?? "N/A"}</Typography>
      <Typography>Y: {odom?.twist?.angular?.y ?? "N/A"}</Typography>
      <Typography>Z: {odom?.twist?.angular?.z ?? "N/A"}</Typography>
    </CardContent>
  </Card>
</Grid>

    </Box>

    
  );
};

export default AgentTracker;



/*import React, { useState, useEffect } from "react";
import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import markerIconPng from "leaflet/dist/images/marker-icon.png";
import markerShadowPng from "leaflet/dist/images/marker-shadow.png";
import axios from "axios";

const FLASK_API_BASE_URL = "http://192.168.168.105:5002";

// Define custom icon
const customIcon = new L.Icon({
  iconUrl: markerIconPng,
  shadowUrl: markerShadowPng,
  iconSize: [25, 41], // default Leaflet icon size
  iconAnchor: [12, 41], // anchor point of the icon
  popupAnchor: [1, -34], // where the popup should appear
  shadowSize: [41, 41], 
});

const BOWIE_CS_BUILDING = [39.0193, -76.7478];

const AgentTracker = () => {
  const [agents, setAgents] = useState([
    { id: 1, name: "Ghost Robotics", lat: 39.0182, lng: -76.7472, status: "online" },
    { id: 2, name: "Husky", lat: 39.0195, lng: -76.7480, status: "offline" },
    { id: 3, name: "Jackal", lat: 39.0192, lng: -76.7475, status: "offline" },
    { id: 4, name: "Boston Spot", lat: 39.0191, lng: -76.7479, status: "offline" },
  ]);

  useEffect(() => {
    const fetchAgentData = async () => {
      try {
        const response = await axios.get(`${FLASK_API_BASE_URL}/agents`);
        setAgents(response.data);
      } catch (error) {
        console.error("Error fetching agent data:", error);
      }
    };

    fetchAgentData();
    const intervalId = setInterval(fetchAgentData, 5000); // Fetch data every 5 seconds

    return () => clearInterval(intervalId);
  }, []);

  return (
    <div>
      <h2>Agent Tracker</h2>
      <MapContainer center={BOWIE_CS_BUILDING} zoom={18} style={{ height: "600px", width: "100%" }}>
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        />
        {agents.map((agent) => (
          <Marker key={agent.id} position={[agent.lat, agent.lng]} icon={customIcon}>
            <Popup>
              {agent.name} - Status: {agent.status}
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
};

export default AgentTracker;
*/