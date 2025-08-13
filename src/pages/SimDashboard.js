import React, { useEffect, useState, useRef } from 'react';
import io from 'socket.io-client';
import { Box, Typography, Paper, Button } from '@mui/material';
import MapView from '../pages/MapView';

function SimDashboard() {
  const [data, setData] = useState(null);         // AirVehicleState for the map
  const [lastMsg, setLastMsg] = useState(null);   // any last message for debug
  const socketRef = useRef(null);

  useEffect(() => {
    // Create socket once, on mount
    const socket = io('http://localhost:5001', {
      transports: ['websocket', 'polling'],   // be explicit
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
    });
    socketRef.current = socket;

    socket.on('connect', () => {
      console.log(' socket.io connected, id:', socket.id);
    });

    socket.on('connect_error', (err) => {
      console.error(' socket connect_error:', err.message);
    });

    socket.on('disconnect', (reason) => {
      console.warn(' socket disconnected:', reason);
    });

    socket.on('simUpdate', (msg) => {
      // Log everything so we can see what’s coming from the bridge
      console.log('a simUpdate:', msg);
      setLastMsg(msg);

      // Only set map state on AirVehicleState
      if (
        msg?.type === 'AirVehicleState' &&
        typeof msg.lat === 'number' &&
        typeof msg.lon === 'number'
      ) {
        setData({
          id: msg.vehicle_id,
          lat: msg.lat,
          lon: msg.lon,
          heading: msg.heading,
        });
      }
    });

    // Cleanup on unmount / hot-reload
    return () => {
      socket.off('simUpdate');
      socket.disconnect();
    };
  }, []);

  const sendCommand = () => {
    if (!data?.id || !socketRef.current) return;
    socketRef.current.emit('sendCommand', {
      type: 'AutomationRequest',
      entityID: data.id,
    });
    console.log('➡️ Sent AutomationRequest for entity', data.id);
  };

  return (
    <Box p={2}>
      <Typography variant="h4" gutterBottom>
        OpenAMASE Simulation Dashboard
      </Typography>

      {data ? (
        <>
          <Box mt={2}>
            <Typography>ID: {data.id}</Typography>
            <Typography>Latitude: {data.lat}</Typography>
            <Typography>Longitude: {data.lon}</Typography>
            <Typography>Heading: {data.heading}</Typography>
          </Box>

          <Box mt={2} height="400px">
            <MapView position={[data.lat, data.lon]} id={data.id} heading={data.heading} />
          </Box>

          <Box mt={2}>
            <Button variant="contained" onClick={sendCommand}>
              Send AutomationRequest
            </Button>
          </Box>
        </>
      ) : (
        <Paper elevation={2} style={{ padding: '1rem', marginTop: '1rem' }}>
          <Typography variant="body2">
            Waiting for simulation data...
          </Typography>
        </Paper>
      )}

      {/* Debug panel to see what the backend is actually sending */}
      <Paper elevation={1} style={{ padding: '0.75rem', marginTop: '1rem' }}>
        <Typography variant="subtitle2" gutterBottom>Last message (debug):</Typography>
        <pre style={{ margin: 0, maxHeight: 160, overflow: 'auto' }}>
          {lastMsg ? JSON.stringify(lastMsg, null, 2) : '—'}
        </pre>
      </Paper>
    </Box>
  );
}

export default SimDashboard;
