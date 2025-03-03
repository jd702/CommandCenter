import React, { useState, useContext } from 'react';
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
import { IpContext } from '../context/IpContext'; // Import the IpContext
import { IpContext2 } from '../context/IpContext2'; // Import the IpContext2
import { CommandListContext } from '../context/CommandListContext'; // Import the CommandListContext
import './SettingsPage.css'; // Ensure this file exists in the src/pages directory

const SettingsPage = () => {
  const [message, setMessage] = useState('');
  const [severity, setSeverity] = useState('success');
  const { ip, setIp } = useContext(IpContext); // Use the IpContext
  const { ip2, setIp2 } = useContext(IpContext2); // Use the IpContext2
  const { commandList, addCommand } = useContext(CommandListContext); // Use the CommandListContext

  // Update Flask IP
  const handleUpdateFlaskIp = async () => {
    const updatedConfig = {
      ip: ip,
    };

    try {
      console.log(ip);
      const response = await fetch(`http://${ip}:5000/update-ip`, { // dynamic IP address entered by the user
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(updatedConfig),
      });

      const result = await response.json();
      setMessage(result.message);
      setSeverity(result.status === 'success' ? 'success' : 'error');
      addCommand(`Update Flask IP: ${result.status}`);
    } catch (error) {
      setMessage('Error connecting to the server');
      setSeverity('error');
      addCommand('Update Flask IP: error');
    }
  };

  // Update Tasking IP
  const handleUpdateTaskingIp = () => {
    setMessage(`Tasking IP updated to ${ip2}`);
    setSeverity('success');
    addCommand('Update Tasking IP: success');
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
      <Card sx={{ minWidth: 800, mb: 4 }} style={{ backgroundColor: '#808080' }}>
        <CardContent>
          <Typography gutterBottom component="div" align="center" sx={{ color: 'white', fontSize: 60, mt: 4, textTransform: 'uppercase', height: 80 }}>
            Settings
          </Typography>
          <Divider><Chip label="." /></Divider>
          <Box component="form" sx={{ mt: 3 }}>
            <Typography variant="h6" gutterBottom>Update Flask Server IP for Sensors</Typography>
            <TextField
              fullWidth
              label="Flask Server IP Address"
              variant="outlined"
              value={ip}
              onChange={(e) => setIp(e.target.value)} // Update the IP address in context
              sx={{ mb: 2 }}
            />
            <Button
              variant="contained"
              color="primary"
              onClick={handleUpdateFlaskIp}
              sx={{ mt: 2 }}
            >
              Update Flask IP
            </Button>
          </Box>
          <Box component="form" sx={{ mt: 3 }}>
            <Typography variant="h6" gutterBottom>Update Command Center Tasking IP</Typography>
            <TextField
              fullWidth
              label="Tasking IP Address"
              variant="outlined"
              value={ip2}
              onChange={(e) => setIp2(e.target.value)} // Update the IP address in context
              sx={{ mb: 2 }}
            />
            <Button
              variant="contained"
              color="primary"
              onClick={handleUpdateTaskingIp}
              sx={{ mt: 2 }}
            >
              Update Tasking IP
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


/* import React, { useState, useContext } from 'react';
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
import { IpContext } from '../context/IpContext'; // Import the IpContext
import { IpContext2 } from '../context/IpContext2'; // Import the IpContext2
import { CommandListContext } from '../context/CommandListContext'; // Import the CommandListContext
import './SettingsPage.css'; // Ensure this file exists in the src/pages directory

const SettingsPage = () => {
  const [message, setMessage] = useState('');
  const [severity, setSeverity] = useState('success');
  const { ip, setIp } = useContext(IpContext); // Use the IpContext
  const { ip2, setIp2 } = useContext(IpContext2); // Use the IpContext2
  const { commandList, addCommand } = useContext(CommandListContext); // Use the CommandListContext

  const handleUpdateFlaskIp = async () => {
    const updatedConfig = {
      ip: ip,
    };

    try {
      console.log(ip)
      const response = await fetch(`http://${ip}:5000/update-ip`, { // dynamic IP address entered by the user
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(updatedConfig),
      });

      const result = await response.json();
      setMessage(result.message);
      setSeverity(result.status === 'success' ? 'success' : 'error');
      addCommand(`Update Flask IP: ${result.status}`);
    } catch (error) {
      setMessage('Error connecting to the server');
      setSeverity('error');
      addCommand('Update Flask IP: error');
    }
  };

  const handleUpdateTaskingIp = () => {
    setMessage(`Tasking IP updated to ${ip2}`);
    setSeverity('success');
    addCommand('Update Tasking IP: success');
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
      <Card sx={{ minWidth: 800, mb: 4 }} style={{ backgroundColor: '#808080' }}>
        <CardContent>
          <Typography gutterBottom component="div" align="center" sx={{ color: 'white', fontSize: 60, mt: 4, textTransform: 'uppercase', height: 80 }}>
            Settings
          </Typography>
          <Divider><Chip label="." /></Divider>
          <Box component="form" sx={{ mt: 3 }}>
            <Typography variant="h6" gutterBottom>Update Flask Server IP for Sensors</Typography>
            <TextField
              fullWidth
              label="Flask Server IP Address"
              variant="outlined"
              value={ip}
              onChange={(e) => setIp(e.target.value)} // Update the IP address in context
              sx={{ mb: 2 }}
            />
            <Button
              variant="contained"
              color="primary"
              onClick={handleUpdateFlaskIp}
              sx={{ mt: 2 }}
            >
              Update Flask IP
            </Button>
          </Box>
          <Box component="form" sx={{ mt: 3 }}>
            <Typography variant="h6" gutterBottom>Update Command Center Tasking IP</Typography>
            <TextField
              fullWidth
              label="Tasking IP Address"
              variant="outlined"
              value={ip2}
              onChange={(e) => setIp2(e.target.value)} // Update the IP address in context
              sx={{ mb: 2 }}
            />
            <Button
              variant="contained"
              color="primary"
              onClick={handleUpdateTaskingIp}
              sx={{ mt: 2 }}
            >
              Update Tasking IP
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

*/