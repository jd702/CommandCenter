import React, { useEffect, useState } from 'react';
import io from 'socket.io-client';
import { Box, Typography, Paper, Button } from '@mui/material';
import { parseStringPromise } from 'xml2js';
import MapView from '../pages/MapView'; // This should be your Leaflet map

const socket = io('http://localhost:5001'); // TCP bridge server

function SimDashboard() {
  const [data, setData] = useState(null);

  useEffect(() => {
    socket.on('simUpdate', async (msg) => {
      try {
        const parsed = await parseStringPromise(msg);
        const avState = parsed?.AirVehicleState;

        if (avState) {
          const id = avState.ID?.[0];
          const lat = parseFloat(avState.Location?.[0]?.Latitude?.[0]);
          const lon = parseFloat(avState.Location?.[0]?.Longitude?.[0]);
          const heading = parseFloat(avState.Heading?.[0]);

          setData({ id, lat, lon, heading });
        }
      } catch (err) {
        console.error('Parsing failed:', err);
      }
    });

    return () => socket.off('simUpdate');
  }, []);

  const sendCommand = () => {
    // Example: You could emit a custom command to the bridge here
    socket.emit('sendCommand', {
      type: 'AutomationRequest',
      entityID: data?.id,
    });
    console.log('Sent AutomationRequest for entity', data?.id);
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
          <Typography variant="body2" component="pre">
            Waiting for simulation data...
          </Typography>
        </Paper>
      )}
    </Box>
  );
}

export default SimDashboard;
