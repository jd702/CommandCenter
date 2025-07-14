const net = require('net');
const { Server } = require('socket.io');
const http = require('http');

// TCP Server info from OpenAMASE
const PORT = 5555;
const HOST = '127.0.0.1';

// Create a basic HTTP server for socket.io to hook into
const server = http.createServer();
const io = new Server(server, {
  cors: {
    origin: '*', // adjust as needed
  },
});

// Start WebSocket server
const WS_PORT = 5001;
server.listen(WS_PORT, () => {
  console.log(`WebSocket server running on http://localhost:${WS_PORT}`);
});

// WebSocket event listener
io.on('connection', (socket) => {
  console.log('Frontend connected');

  socket.on('sendCommand', (command) => {
    console.log('Received command from React:', command);
    // TODO: Send command back into OpenAMASE (optional, future)
  });
});

// Function to parse raw XML into UAV data
function parseAirVehicleState(data) {
  const xml = data.toString();
  const lat = xml.match(/<Latitude>(.*?)<\/Latitude>/)?.[1];
  const lon = xml.match(/<Longitude>(.*?)<\/Longitude>/)?.[1];
  const alt = xml.match(/<Altitude>(.*?)<\/Altitude>/)?.[1];
  const id = xml.match(/<ID>(.*?)<\/ID>/)?.[1];
  const heading = xml.match(/<Heading>(.*?)<\/Heading>/)?.[1];
  const speed = xml.match(/<Airspeed>(.*?)<\/Airspeed>/)?.[1];

  return {
    id,
    lat: parseFloat(lat),
    lon: parseFloat(lon),
    alt: parseFloat(alt),
    heading: parseFloat(heading),
    speed: parseFloat(speed),
  };
}

// TCP client to receive simulation data from OpenAMASE
const client = new net.Socket();

client.connect(PORT, HOST, () => {
  console.log(`Connected to OpenAMASE TCP server at ${HOST}:${PORT}`);
});

client.on('data', (data) => {
  const parsed = parseAirVehicleState(data);
  if (parsed?.id) {
    io.emit('simUpdate', parsed); // broadcast to React frontend
  }
});

client.on('close', () => {
  console.log('TCP connection closed');
});

client.on('error', (err) => {
  console.error('TCP error:', err.message);
});
