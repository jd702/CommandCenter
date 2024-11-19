import React, { useState } from 'react';
import {
  Box,
  Grid,
  Button,
  TextField,
  Card,
  CardContent,
  Typography,
  Divider,
  Chip,
  Alert,
} from '@mui/material';
import './SettingsPage.css'; // Ensure this file exists in the src/pages directory

const SettingsPage = () => {
  const [ip, setIp] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  const [severity, setSeverity] = useState('success');

  const handleUpdateConfig = async () => {
    const updatedConfig = {
      host: ip,
      username: username,
      password: password,
    };

    try {
      const response = await fetch('http://localhost:5000/ssh-connect', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(updatedConfig),
      });

      const result = await response.json();
      setMessage(result.message);
      setSeverity(result.status === 'success' ? 'success' : 'error');
    } catch (error) {
      setMessage('Error connecting to the server');
      setSeverity('error');
    }
  };

  return (
    <Grid
      container
      spacing={0}
      direction="column"
      alignItems="center"
      justify="center"
      style={{ minHeight: '100vh' }}
    >
      <Card sx={{ minWidth: 800, mb: 4 }} style={{ backgroundColor: '#026ca0' }}>
        <CardContent>
          <Typography gutterBottom component="div" align="center" sx={{ color: 'white', fontSize: 60, mt: 4, textTransform: 'uppercase', height: 80 }}>
            Settings
          </Typography>
          <Divider><Chip label="." /></Divider>
          <Box component="form" sx={{ mt: 3 }}>
            <TextField
              fullWidth
              label="IP Address"
              variant="outlined"
              value={ip}
              onChange={(e) => setIp(e.target.value)}
              sx={{ mb: 2 }}
            />
            <TextField
              fullWidth
              label="Username"
              variant="outlined"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              sx={{ mb: 2 }}
            />
            <TextField
              fullWidth
              label="Password"
              variant="outlined"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              sx={{ mb: 2 }}
            />
            <Button
              variant="contained"
              color="primary"
              onClick={handleUpdateConfig}
              sx={{ mt: 2 }}
            >
              Update Configuration
            </Button>
          </Box>
          {message && (
            <Alert severity={severity} sx={{ mt: 2 }}>
              {message}
            </Alert>
          )}
        </CardContent>
      </Card>
    </Grid>
  );
};

export default SettingsPage;