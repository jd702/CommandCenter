import React, { useState, useEffect } from 'react';
import './Tasking.css'; // Import the specific CSS for Tasking component
import { Button, TextField, Container, Typography, Box, Switch as MuiSwitch, CircularProgress, Accordion, AccordionSummary, AccordionDetails, MenuItem, Select, InputLabel, FormControl } from '@mui/material';
import { toast, ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import PropTypes from 'prop-types';
import { createTheme, ThemeProvider } from '@mui/material/styles';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';

export const StatusIndicator = ({ status }) => (
    <span
        style={{
            width: '20px',
            height: '20px',
            borderRadius: '50%',
            display: 'inline-block',
            marginLeft: '10px',
            backgroundColor: status === 'online' ? 'green' : 'red',
        }}
    />
);

StatusIndicator.propTypes = {
    status: PropTypes.oneOf(['online', 'offline']).isRequired,
};

const predefinedCommands = {
    jackal: ['jackal go to location 1', 'jackal return to base'],
    husky: ['husky go to location 1', 'husky charge battery'],
    sensor1: ['Start audio capture'],
    sensor2: ['Start recording'],
};

const Tasking = () => {
    const [darkMode, setDarkMode] = useState(false);
    const [command, setCommand] = useState('');
    const [output, setOutput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [commands, setCommands] = useState({
        jackal: [],
        husky: [],
        sensor1: [],
        sensor2: [],
    });
    const [serverStatus, setServerStatus] = useState('offline');
    const [robotStatus, setRobotStatus] = useState({
        jackal: 'offline',
        husky: 'offline',
        sensor1: 'offline',
        sensor2: 'offline',
    });
    const [selectedRobot, setSelectedRobot] = useState('jackal');
    const [selectedCommand, setSelectedCommand] = useState('');

    const theme = createTheme({
        palette: {
            mode: darkMode ? 'dark' : 'light',
        },
    });

    const handleInputChange = (e) => {
        setCommand(e.target.value);
    };

    const handleRobotSelectChange = (e) => {
        setSelectedRobot(e.target.value);
        setSelectedCommand('');
        setCommand('');
    };

    const handleCommandSelectChange = (e) => {
        const command = e.target.value;
        setSelectedCommand(command);
        setCommand(command);
    };

    const updateCommandList = (robot, command) => {
        setCommands((prevCommands) => ({
            ...prevCommands,
            [robot]: [...prevCommands[robot], command],
        }));
    };

    const handleSubmit = async () => {
        if (command.trim()) {
            setIsLoading(true);
            try {
                const response = await fetch('192.168.1.127:5000/command', { 
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ command }),
                });

                if (!response.ok) {
                    throw new Error(`Server responded with ${response.status}: ${response.statusText}`);
                }

                const result = await response.json();
                setOutput(result.message);
                updateCommandList(selectedRobot, command);
                setRobotStatus({
                    ...robotStatus,
                    [result.robot]: result.status,
                });
                toast.success('Command sent successfully!');
            } catch (error) {
                console.error('Error sending command:', error);
                toast.error(`Error: Could not send command to the server. ${error.message}`);
            } finally {
                setIsLoading(false);
            }
            setCommand('');
            setSelectedCommand('');
        } else {
            toast.error('Please enter a command.');
        }
    };

    const checkServerStatus = async () => {
        try {
            const response = await fetch('192.168.1.127:5000/command');
            if (response.ok) {
                setServerStatus('online');
            } else {
                setServerStatus('offline');
            }
        } catch (error) {
            console.error('Error checking server status:', error);
            setServerStatus('offline');
        }
    };

    useEffect(() => {
        const statusInterval = setInterval(checkServerStatus, 5000);
        return () => clearInterval(statusInterval);
    }, []);

    return (
        <ThemeProvider theme={theme}>
            <Container maxWidth="md" style={{ marginTop: '20px' }}>
                <ToastContainer />

                <Typography variant="h4" gutterBottom>
                    Mission Control Center
                </Typography>

                <Box display="flex" alignItems="center" justifyContent="space-between" marginBottom={2}>
                    <Typography variant="body1">Dark Mode</Typography>
                    <MuiSwitch checked={darkMode} onChange={() => setDarkMode(!darkMode)} />
                </Box>

                <FormControl fullWidth style={{ marginBottom: '20px' }}>
                    <InputLabel>Select Robot</InputLabel>
                    <Select value={selectedRobot} onChange={handleRobotSelectChange} label="Select Robot">
                        <MenuItem value="jackal">Jackal</MenuItem>
                        <MenuItem value="husky">Husky</MenuItem>
                        <MenuItem value="sensor1">Sensor 1</MenuItem>
                        <MenuItem value="sensor2">Sensor 2</MenuItem>
                    </Select>
                </FormControl>

                <FormControl fullWidth style={{ marginBottom: '20px' }}>
                    <InputLabel>Select Command</InputLabel>
                    <Select value={selectedCommand} onChange={handleCommandSelectChange} label="Select Command">
                        {predefinedCommands[selectedRobot].map((cmd, index) => (
                            <MenuItem key={index} value={cmd}>
                                {cmd}
                            </MenuItem>
                        ))}
                    </Select>
                </FormControl>

                <TextField
                    fullWidth
                    label="Enter Command"
                    variant="outlined"
                    value={command}
                    onChange={handleInputChange}
                    placeholder="Enter command e.g., 'jackal go to location 1'"
                    style={{ marginBottom: '20px' }}
                />

                <Button variant="contained" color="primary" onClick={handleSubmit} style={{ marginBottom: '20px' }}>
                    Submit Command
                </Button>

                <Box>
                    {isLoading ? (
                        <CircularProgress />
                    ) : (
                        <Typography variant="h6">{output}</Typography>
                    )}
                </Box>

                <Box
                    className="command-list"
                    style={{
                        marginTop: '20px',
                        padding: '10px',
                        border: '1px solid #ccc',
                        backgroundColor: '#f9f9f9',
                    }}
                >
                    <Typography variant="h6">Command List</Typography>
                    {['jackal', 'husky', 'sensor1', 'sensor2'].map((robot) => (
                        <Accordion key={robot}>
                            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                                <Typography variant="body1">
                                    <strong>{robot.charAt(0).toUpperCase() + robot.slice(1)}</strong>
                                </Typography>
                            </AccordionSummary>
                            <AccordionDetails>
                                <ul>
                                    {commands[robot].map((cmd, index) => (
                                        <li key={index}>
                                            {cmd} - <small>{new Date().toLocaleTimeString()}</small>
                                            <StatusIndicator status={robotStatus[robot]} />
                                        </li>
                                    ))}
                                </ul>
                            </AccordionDetails>
                        </Accordion>
                    ))}
                </Box>

                <Box style={{ marginTop: '20px' }}>
                    <Typography variant="body1">
                        <strong>Server Status:</strong>
                    </Typography>
                    {serverStatus === 'checking' ? (
                        <CircularProgress size={20} />
                    ) : (
                        <StatusIndicator status={serverStatus} />
                    )}
                    <Typography variant="body2" style={{ marginLeft: '10px' }}>
                        {serverStatus === 'online' ? 'Server is online' : 'Server is offline'}
                    </Typography>
                </Box>

                <Box style={{ marginTop: '10px' }}>
                    <Typography variant="body1">
                        <strong>Robot Status:</strong>
                    </Typography>
                    <div>
                        Jackal: <StatusIndicator status={robotStatus.jackal} />
                        Husky: <StatusIndicator status={robotStatus.husky} />
                        Sensor 1: <StatusIndicator status={robotStatus.sensor1} />
                        Sensor 2: <StatusIndicator status={robotStatus.sensor2} />
                    </div>
                </Box>
            </Container>
        </ThemeProvider>
    );
};

export default Tasking;