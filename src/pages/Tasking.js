import React, { useState, useEffect, useContext } from 'react';
import './Tasking.css'; // Import the specific CSS for Tasking component
import { Button, TextField, Container, Typography, Box, Switch as MuiSwitch, CircularProgress, Accordion, AccordionSummary, AccordionDetails, MenuItem, Select, InputLabel, FormControl, Grid, Card, CardContent } from '@mui/material';
import { toast, ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import PropTypes from 'prop-types';
import { createTheme, ThemeProvider } from '@mui/material/styles';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import SendIcon from '@mui/icons-material/Send';
import { IpContext2 } from '../context/IpContext2'; // Import the IpContext2
import { CommandListContext } from '../context/CommandListContext'; // Import the CommandListContext

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
    jackal: ['jackal go to GPS location 1.0, 1.0', 'jackal go to location 1,1'],
    husky: ['husky go to location 0, 0', 'husky go to location 1.0, 1.0'], 
    sensor1: ['sensor 1 start visual data collection', 'sensor 1 start audio data collection'],
    sensor2: ['sensor 2 start visual data collection', 'sensor 2 start audio data collection'],
};

const Tasking = () => {
    const { ip2 } = useContext(IpContext2); // Use the IpContext2
    const { commandList, addCommand } = useContext(CommandListContext); // Use the CommandListContext
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
    const [selectedRobot, setSelectedRobot] = useState('jackal');
    const [selectedCommand, setSelectedCommand] = useState('');
    const [commandHistory, setCommandHistory] = useState([]);

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
        addCommand(`${robot}: ${command}`); // Add the command to the global command list with a timestamp
    };

    const handleSubmit = async () => {
        if (command.trim()) {
            setIsLoading(true);
            try {
                console.log(`Sending command to http://${ip2}:5000/command`); // Debugging line
                const response = await fetch(`http://${ip2}:5000/command`, { 
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
                setCommandHistory([...commandHistory, command]);
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
            console.log(`Checking server status at http://${ip2}:5000/command`); // Debugging line
            const response = await fetch(`http://${ip2}:5000/command`);
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
    }, [ip2]);

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

                <Grid container spacing={3}>
                    <Grid item xs={12} md={6}>
                        <Card>
                            <CardContent>
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

                                <Button variant="contained" color="primary" onClick={handleSubmit} endIcon={<SendIcon />} style={{ marginBottom: '20px' }}>
                                    Submit Command
                                </Button>

                                <Box>
                                    {isLoading ? (
                                        <CircularProgress />
                                    ) : (
                                        <Typography variant="h6">{output}</Typography>
                                    )}
                                </Box>
                            </CardContent>
                        </Card>
                    </Grid>

                    <Grid item xs={12} md={6}>
                        <Card>
                            <CardContent>
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
                                                    </li>
                                                ))}
                                            </ul>
                                        </AccordionDetails>
                                    </Accordion>
                                ))}
                            </CardContent>
                        </Card>
                    </Grid>
                </Grid>

                <Grid container spacing={3} style={{ marginTop: '20px' }}>
                    <Grid item xs={12} md={6}>
                        <Card>
                            <CardContent>
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
                            </CardContent>
                        </Card>
                    </Grid>
                </Grid>

                <Grid container spacing={3} style={{ marginTop: '20px' }}>
                    <Grid item xs={12}>
                        <Card>
                            <CardContent>
                                <Typography variant="h6">Terminal</Typography>
                                <Box className="terminal">
                                    <Box className="command-history">
                                        {commandHistory.map((cmd, index) => (
                                            <Typography key={index} className="command">{cmd}</Typography>
                                        ))}
                                    </Box>
                                    <Box className="command-input">
                                        <TextField
                                            fullWidth
                                            variant="outlined"
                                            placeholder="Enter command..."
                                            value={command}
                                            onChange={handleInputChange}
                                            onKeyPress={(event) => {
                                                if (event.key === 'Enter') {
                                                    handleSubmit();
                                                }
                                            }}
                                            InputProps={{
                                                style: { fontFamily: 'monospace', backgroundColor: '#000', color: '#0f0' }
                                            }}
                                        />
                                    </Box>
                                </Box>
                            </CardContent>
                        </Card>
                    </Grid>
                </Grid>
            </Container>
        </ThemeProvider>
    );
};

export default Tasking;