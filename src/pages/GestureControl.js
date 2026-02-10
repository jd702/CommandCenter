import React, { useEffect, useState } from "react";
import {
  Box,
  Typography,
  Paper,
  Grid,
  Button,
  TextField,
  MenuItem,
} from "@mui/material";
import "./GestureControl.css";

const DEFAULT_API = process.env.REACT_APP_GESTURE_API || "http://localhost:7001";

const GestureControl = () => {
  const [apiBase, setApiBase] = useState(DEFAULT_API);
  const [cameras, setCameras] = useState([]);
  const [camera, setCamera] = useState("front_left");
  const [cameraMode, setCameraMode] = useState("ros");
  const [showWindow, setShowWindow] = useState(false);
  const [status, setStatus] = useState({});
  const [running, setRunning] = useState(false);

  const fetchCameras = async () => {
    try {
      const res = await fetch(`${apiBase}/cameras`);
      const data = await res.json();
      setCameras(data.cameras || []);
      if (data.default) {
        setCamera(data.default);
      }
    } catch (e) {
      console.error("cameras error", e);
    }
  };

  const fetchStatus = async () => {
    try {
      const res = await fetch(`${apiBase}/status`);
      const data = await res.json();
      setStatus(data || {});
      setRunning(Boolean(data.process_running));
    } catch (e) {
      console.error("status error", e);
    }
  };

  useEffect(() => {
    fetchCameras();
    fetchStatus();
    const t = setInterval(fetchStatus, 1500);
    return () => clearInterval(t);
  }, [apiBase]);

  const startGesture = async () => {
    await fetch(`${apiBase}/start`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        camera,
        camera_mode: cameraMode,
        show: showWindow,
      }),
    });
    fetchStatus();
  };

  const stopGesture = async () => {
    await fetch(`${apiBase}/stop`, { method: "POST" });
    fetchStatus();
  };

  const nextCamera = async () => {
    await fetch(`${apiBase}/camera/next`, { method: "POST" });
    fetchStatus();
  };

  const prevCamera = async () => {
    await fetch(`${apiBase}/camera/prev`, { method: "POST" });
    fetchStatus();
  };

  const setCameraOnApi = async (value) => {
    setCamera(value);
    await fetch(`${apiBase}/camera/set`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ camera: value }),
    });
    fetchStatus();
  };

  return (
    <Box className="gesture-root">
      <Typography variant="h4" gutterBottom>
        Gesture Control
      </Typography>

      <Grid container spacing={3}>
        <Grid item xs={12} md={6}>
          <Paper className="gesture-panel" elevation={3}>
            <Typography variant="h6" gutterBottom>
              Controls
            </Typography>

            <TextField
              label="Local API"
              value={apiBase}
              onChange={(e) => setApiBase(e.target.value)}
              fullWidth
              size="small"
              className="gesture-field"
            />

            <TextField
              select
              label="Camera"
              value={camera}
              onChange={(e) => setCameraOnApi(e.target.value)}
              fullWidth
              size="small"
              className="gesture-field"
            >
              {cameras.map((c) => (
                <MenuItem key={c} value={c}>
                  {c}
                </MenuItem>
              ))}
            </TextField>

            <TextField
              select
              label="Camera Mode"
              value={cameraMode}
              onChange={(e) => setCameraMode(e.target.value)}
              fullWidth
              size="small"
              className="gesture-field"
            >
              <MenuItem value="ros">ros</MenuItem>
              <MenuItem value="proxy">proxy</MenuItem>
            </TextField>

            <Box className="gesture-buttons">
              <Button variant="contained" color="success" onClick={startGesture}>
                Start
              </Button>
              <Button variant="contained" color="error" onClick={stopGesture}>
                Stop
              </Button>
              <Button variant="outlined" onClick={prevCamera}>
                Prev Camera
              </Button>
              <Button variant="outlined" onClick={nextCamera}>
                Next Camera
              </Button>
            </Box>

            <Box className="gesture-toggle">
              <label>
                <input
                  type="checkbox"
                  checked={showWindow}
                  onChange={(e) => setShowWindow(e.target.checked)}
                />
                Show local preview window
              </label>
            </Box>
          </Paper>
        </Grid>

        <Grid item xs={12} md={6}>
          <Paper className="gesture-panel" elevation={3}>
            <Typography variant="h6" gutterBottom>
              Status
            </Typography>
            <Typography variant="body2">Running: {running ? "Yes" : "No"}</Typography>
            <Typography variant="body2">Camera: {status.camera || "-"}</Typography>
            <Typography variant="body2">Last Gesture: {status.gesture || "-"}</Typography>
            <Typography variant="body2">PID: {status.pid || "-"}</Typography>
            <Typography variant="body2">Log: {status.log_file || "-"}</Typography>
          </Paper>
        </Grid>
      </Grid>
    </Box>
  );
};

export default GestureControl;
