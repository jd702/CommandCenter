import React, { useEffect } from "react";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

// Custom marker icon (optional)
const customIcon = new L.Icon({
  iconUrl: require("leaflet/dist/images/marker-icon.png"),
  shadowUrl: require("leaflet/dist/images/marker-shadow.png"),
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

// Fly-to effect on marker update
function FlyToMarker({ position }) {
  const map = useMap();
  useEffect(() => {
    if (position && position[0] && position[1]) {
      map.flyTo(position, map.getZoom(), { duration: 1.5 });
    }
  }, [position, map]);
  return null;
}

// Main map component
const MapView = ({ position = [39.0193, -76.7478], id = "UAV", heading = 0 }) => {
  return (
    <MapContainer
      center={position}
      zoom={17}
      scrollWheelZoom={true}
      style={{ height: "400px", width: "100%" }}
    >
      <TileLayer
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution='&copy; <a href="http://www.openstreetmap.org/">OpenStreetMap</a> contributors'
      />
      <FlyToMarker position={position} />
      <Marker position={position} icon={customIcon} rotationAngle={heading}>
        <Popup>
          <strong>{id}</strong>
          <br />
          Lat: {position[0].toFixed(5)} <br />
          Lon: {position[1].toFixed(5)} <br />
          Heading: {heading}°
        </Popup>
      </Marker>
    </MapContainer>
  );
};

export default MapView;
