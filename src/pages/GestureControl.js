import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Box,
  Typography,
  Paper,
  Grid,
  Button,
  TextField,
  MenuItem,
  FormControlLabel,
  Checkbox,
  Alert,
} from "@mui/material";
import "./GestureControl.css";
import getRuntimeConfig from "../utils/runtimeConfig";

const DEFAULT_API = getRuntimeConfig().gestureApiUrl;

const GestureControl = () => {
  const [apiBase, setApiBase] = useState(DEFAULT_API);
  const [cameras, setCameras] = useState([]);
  const [camera, setCamera] = useState("front_left");
  const [cameraMode, setCameraMode] = useState("proxy");
  const [webcamIndex, setWebcamIndex] = useState(0);
  const [showWindow, setShowWindow] = useState(false);
  const [status, setStatus] = useState({});
  const [running, setRunning] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const normalizedApiBase = useMemo(
    () => apiBase.trim().replace(/\/+$/, ""),
    [apiBase]
  );

  const fetchJson = useCallback(async (url, options = {}) => {
    const res = await fetch(url, options);
    const text = await res.text();
    let data = {};
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      data = { raw: text };
    }
    if (!res.ok) {
      throw new Error(data?.message || `HTTP ${res.status}`);
    }
    return data;
  }, []);

  const fetchCameras = useCallback(async () => {
    try {
      setError("");
      const data = await fetchJson(`${normalizedApiBase}/cameras`);
      setCameras(Array.isArray(data.cameras) ? data.cameras : []);
      if (data.default) setCamera(data.default);
    } catch (e) {
      setError(`Cameras error: ${e.message}`);
    }
  }, [fetchJson, normalizedApiBase]);

  const fetchStatus = useCallback(async () => {
    try {
      const data = await fetchJson(`${normalizedApiBase}/status`);
      setStatus(data || {});
      setRunning(Boolean(data?.process_running));
      setError("");
    } catch (e) {
      setError(`Status error: ${e.message}`);
      setRunning(false);
    }
  }, [fetchJson, normalizedApiBase]);

  useEffect(() => {
    fetchCameras();
    fetchStatus();
    const t = setInterval(fetchStatus, 1500);
    return () => clearInterval(t);
  }, [fetchCameras, fetchStatus]);

  const startGesture = async () => {
    try {
      setBusy(true);
      setError("");
      await fetchJson(`${normalizedApiBase}/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          camera,
          camera_mode: cameraMode,
          webcam_index: Number(webcamIndex) || 0,
          show: showWindow,
          // Optional overrides:
          // flask_url: "http://ROBOT_HOST:5002",
          // ros_camera_base: "http://ROBOT_HOST:8080",
          // device: "cuda:0",
        }),
      });
      await fetchStatus();
    } catch (e) {
      setError(`Start error: ${e.message}`);
    } finally {
      setBusy(false);
    }
  };

  const stopGesture = async () => {
    try {
      setBusy(true);
      setError("");
      await fetchJson(`${normalizedApiBase}/stop`, { method: "POST" });
      await fetchStatus();
    } catch (e) {
      setError(`Stop error: ${e.message}`);
    } finally {
      setBusy(false);
    }
  };

  const nextCamera = async () => {
    try {
      setBusy(true);
      setError("");
      await fetchJson(`${normalizedApiBase}/camera/next`, { method: "POST" });
      await fetchStatus();
    } catch (e) {
      setError(`Next camera error: ${e.message}`);
    } finally {
      setBusy(false);
    }
  };

  const prevCamera = async () => {
    try {
      setBusy(true);
      setError("");
      await fetchJson(`${normalizedApiBase}/camera/prev`, { method: "POST" });
      await fetchStatus();
    } catch (e) {
      setError(`Prev camera error: ${e.message}`);
    } finally {
      setBusy(false);
    }
  };

  const setCameraOnApi = async (value) => {
    try {
      setBusy(true);
      setError("");
      setCamera(value);
      await fetchJson(`${normalizedApiBase}/camera/set`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ camera: value }),
      });
      await fetchStatus();
    } catch (e) {
      setError(`Set camera error: ${e.message}`);
    } finally {
      setBusy(false);
    }
  };

  const isWebcamMode = cameraMode === "webcam";

  return (
    <Box className="gesture-root">
      <Typography variant="h4" gutterBottom>
        Gesture Control
      </Typography>

      {error ? <Alert severity="error">{error}</Alert> : null}

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
              label="Camera Mode"
              value={cameraMode}
              onChange={(e) => setCameraMode(e.target.value)}
              fullWidth
              size="small"
              className="gesture-field"
            >
              <MenuItem value="ros">ros</MenuItem>
              <MenuItem value="proxy">proxy</MenuItem>
              <MenuItem value="webcam">webcam</MenuItem>
            </TextField>

            {!isWebcamMode && (
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
            )}

            {isWebcamMode && (
              <TextField
                label="Webcam Index"
                type="number"
                value={webcamIndex}
                onChange={(e) => setWebcamIndex(e.target.value)}
                fullWidth
                size="small"
                className="gesture-field"
                inputProps={{ min: 0, step: 1 }}
                helperText="Usually 0 for built-in webcam"
              />
            )}

            <Box className="gesture-buttons">
              <Button
                variant="contained"
                color="success"
                onClick={startGesture}
                disabled={busy}
              >
                Start
              </Button>
              <Button
                variant="contained"
                color="error"
                onClick={stopGesture}
                disabled={busy}
              >
                Stop
              </Button>
              <Button
                variant="outlined"
                onClick={prevCamera}
                disabled={busy || isWebcamMode}
              >
                Prev Camera
              </Button>
              <Button
                variant="outlined"
                onClick={nextCamera}
                disabled={busy || isWebcamMode}
              >
                Next Camera
              </Button>
            </Box>

            <Box className="gesture-toggle">
              <FormControlLabel
                control={
                  <Checkbox
                    checked={showWindow}
                    onChange={(e) => setShowWindow(e.target.checked)}
                  />
                }
                label="Show local preview window"
              />
            </Box>
          </Paper>
        </Grid>

        <Grid item xs={12} md={6}>
          <Paper className="gesture-panel" elevation={3}>
            <Typography variant="h6" gutterBottom>
              Status
            </Typography>
            <Typography variant="body2">
              Running: {running ? "Yes" : "No"}
            </Typography>
            <Typography variant="body2">Camera: {status.camera || "-"}</Typography>
            <Typography variant="body2">
              Last Gesture: {status.gesture || "-"}
            </Typography>
            <Typography variant="body2">PID: {status.pid || "-"}</Typography>
            <Typography variant="body2">Log: {status.log_file || "-"}</Typography>
          </Paper>
        </Grid>
      </Grid>
    </Box>
  );
};

export default GestureControl;
