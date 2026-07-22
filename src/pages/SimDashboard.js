import React, { useEffect, useState, useRef, useMemo } from 'react';
import io from 'socket.io-client';
import { Box, Typography, Paper, Button, Divider } from '@mui/material';
import MapView from '../pages/MapView';
import { SIM_SOCKET_URL } from '../utils/runtimeConfig';

function SimDashboard() {
  // map-focused state (keeps your current behavior)
  const [mapPoint, setMapPoint] = useState(null); // { id, lat, lon, heading }
  // richer state
  const [vehicles, setVehicles] = useState({});    // id -> { lat, lon, alt, heading, timestamp }
  const [session, setSession] = useState(null);    // last SessionStatus
  const [lastMsg, setLastMsg] = useState(null);    // last ANY message for debug
  const [connected, setConnected] = useState(false);
  const socketRef = useRef(null);

  // derive a selected vehicle for the map if none set yet
  const firstVehicleId = useMemo(() => {
    const ids = Object.keys(vehicles);
    return ids.length ? Number(ids[0]) : null;
  }, [vehicles]);
  const selectedId = mapPoint?.id ?? firstVehicleId;

  const selectedVehicle = useMemo(() => {
    if (!selectedId) return null;
    return vehicles[selectedId] || null;
  }, [vehicles, selectedId]);

  useEffect(() => {
    const socket = io(SIM_SOCKET_URL, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
    });
    socketRef.current = socket;

    // Connection lifecycle
    socket.on('connect', () => {
      setConnected(true);
      // eslint-disable-next-line no-console
      console.log('[socket] connected:', socket.id);
    });
    socket.on('disconnect', (reason) => {
      setConnected(false);
      console.warn('[socket] disconnected:', reason);
    });
    socket.on('connect_error', (err) => {
      setConnected(false);
      console.error('[socket] connect_error:', err.message);
    });

    // ---- General stream: every LMCP message (full JSON) ----
    socket.on('lmcp', (msg) => {
      setLastMsg(msg);
      // You can also add generic logging here if desired
      // console.log('lmcp:', msg);
    });

    // ---- Per-type: AirVehicleState (recommended for map/track) ----
    socket.on('lmcp:CMASI.AirVehicleState', (msg) => {
      // Expect either normalized `_norm` or flat fields depending on your bridge
      const n = msg._norm || {};
      const id = n.id ?? msg.ID ?? msg.vehicle_id;
      const lat = n.lat ?? msg.lat ?? msg.Location?.Latitude;
      const lon = n.lon ?? msg.lon ?? msg.Location?.Longitude;
      const alt = n.alt ?? msg.alt ?? msg.Location?.Altitude;
      const heading = n.heading ?? msg.heading ?? msg.Heading;
      const timestamp = n.timestamp ?? msg.timestamp ?? msg.Time ?? Date.now();

      if (typeof id !== 'number' || typeof lat !== 'number' || typeof lon !== 'number') return;

      setVehicles((prev) => ({
        ...prev,
        [id]: { id, lat, lon, alt, heading, timestamp },
      }));

      // If map doesn't have a point yet, set it to this vehicle
      setMapPoint((prev) => prev ?? { id, lat, lon, heading });
    });

    // ---- Keep your legacy 'simUpdate' (flat AVS) for compatibility ----
    socket.on('simUpdate', (msg) => {
      // shape: { type:'AirVehicleState', vehicle_id, lat, lon, heading, alt, timestamp }
      setLastMsg(msg);
      if (
        msg?.type === 'AirVehicleState' &&
        typeof msg.lat === 'number' &&
        typeof msg.lon === 'number'
      ) {
        setMapPoint({
          id: msg.vehicle_id,
          lat: msg.lat,
          lon: msg.lon,
          heading: msg.heading,
        });
        setVehicles((prev) => ({
          ...prev,
          [msg.vehicle_id]: {
            id: msg.vehicle_id,
            lat: msg.lat,
            lon: msg.lon,
            alt: msg.alt,
            heading: msg.heading,
            timestamp: msg.timestamp ?? Date.now(),
          },
        }));
      }
    });

    // ---- Per-type: SessionStatus (optional UI) ----
    socket.on('lmcp:CMASI.SessionStatus', (msg) => {
      setSession(msg);
    });

    return () => {
      socket.off('lmcp');
      socket.off('simUpdate');
      socket.off('lmcp:CMASI.AirVehicleState');
      socket.off('lmcp:CMASI.SessionStatus');
      socket.disconnect();
    };
  }, []);

  const handleSelectVehicle = (id) => {
    const v = vehicles[id];
    if (!v) return;
    setMapPoint({ id, lat: v.lat, lon: v.lon, heading: v.heading });
  };

  const sendCommand = () => {
    const id = mapPoint?.id;
    if (!id || !socketRef.current) return;
    socketRef.current.emit('sendCommand', {
      type: 'AutomationRequest',
      entityID: id,
    });
    console.log(' Sent AutomationRequest for entity', id);
  };

  return (
    <Box p={2} display="flex" flexDirection="column" gap={2}>
      <Box display="flex" alignItems="center" gap={2}>
        <Typography variant="h4">OpenAMASE Simulation Dashboard</Typography>
        <Typography variant="body2" color={connected ? 'green' : 'error'}>
          {connected ? 'Connected' : 'Disconnected'}
        </Typography>
      </Box>

      {/* Session status (if available) */}
      <Paper elevation={2} style={{ padding: '0.75rem' }}>
        <Typography variant="h6" gutterBottom>Session</Typography>
        <Typography variant="body2">
          {session ? JSON.stringify(session._norm ?? session, null, 2) : '—'}
        </Typography>
      </Paper>

      <Box display="grid" gridTemplateColumns="340px 1fr" gap={16}>
        {/* Left: Vehicle list + controls */}
        <Box display="flex" flexDirection="column" gap={2}>
          <Paper elevation={2} style={{ padding: '0.75rem' }}>
            <Typography variant="h6" gutterBottom>Vehicles</Typography>
            {Object.keys(vehicles).length === 0 ? (
              <Typography variant="body2">No vehicles yet…</Typography>
            ) : (
              <Box component="ul" sx={{ listStyle: 'none', p: 0, m: 0, maxHeight: 300, overflow: 'auto' }}>
                {Object.values(vehicles)
                  .sort((a, b) => a.id - b.id)
                  .map((v) => (
                    <li key={v.id}>
                      <Box
                        onClick={() => handleSelectVehicle(v.id)}
                        sx={{
                          p: 1,
                          borderRadius: 1,
                          cursor: 'pointer',
                          bgcolor: selectedId === v.id ? 'action.hover' : 'transparent',
                          '&:hover': { bgcolor: 'action.hover' },
                        }}
                      >
                        <Typography variant="subtitle2">Entity {v.id}</Typography>
                        <Typography variant="caption">
                          lat: {v.lat?.toFixed(6)} | lon: {v.lon?.toFixed(6)} | alt: {v.alt ?? '—'}
                        </Typography>
                        <br />
                        <Typography variant="caption">
                          hdg: {typeof v.heading === 'number' ? Math.round(v.heading) : '—'} | t: {new Date(v.timestamp ?? Date.now()).toLocaleTimeString()}
                        </Typography>
                      </Box>
                      <Divider sx={{ my: 0.5 }} />
                    </li>
                  ))}
              </Box>
            )}
            <Box mt={1}>
              <Button variant="contained" onClick={sendCommand} disabled={!mapPoint?.id}>
                Send AutomationRequest {mapPoint?.id ? `(Entity ${mapPoint.id})` : ''}
              </Button>
            </Box>
          </Paper>

          {/* Debug panel */}
          <Paper elevation={2} style={{ padding: '0.75rem' }}>
            <Typography variant="subtitle2" gutterBottom>Last message (debug)</Typography>
            <pre style={{ margin: 0, maxHeight: 200, overflow: 'auto' }}>
              {lastMsg ? JSON.stringify(lastMsg, null, 2) : '—'}
            </pre>
          </Paper>
        </Box>

        {/* Right: Map */}
        <Paper elevation={2} style={{ padding: '0.5rem', height: 520 }}>
          <Typography variant="h6" gutterBottom>Map</Typography>
          {selectedVehicle ? (
            <MapView
              position={[selectedVehicle.lat, selectedVehicle.lon]}
              id={selectedVehicle.id}
              heading={selectedVehicle.heading}
              // add more props to draw a trail if MapView supports it
            />
          ) : (
            <Typography variant="body2" color="text.secondary">
              Waiting for AirVehicleState…
            </Typography>
          )}
        </Paper>
      </Box>
    </Box>
  );
}

export default SimDashboard;
