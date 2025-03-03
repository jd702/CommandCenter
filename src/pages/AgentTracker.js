import React, { useState, useEffect } from "react";
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
