import React, { useEffect, useState } from "react";
import Alert from '@mui/material/Alert';
import { DataGrid } from '@mui/x-data-grid';
import { v4 as uuidv4 } from 'uuid';
import { io } from "socket.io-client";
import baseURL from "../utils/baseURL";
import './CameraVisualDataCollection.css';
import {
  Box,
  Grid,
  Chip,
  Divider,
  Card,
  CardContent,
  Typography,
  Paper,
  CircularProgress,
} from "@mui/material";

const image_folder = '/results/media/images/';

function getImageFile(params) {
  return <img src={image_folder + params.row.filename + '.jpg'} alt="Captured" style={{ width: '100%' }} />;
}

function getImagePath(params) {
  return image_folder + params.row.filename + '.jpg';
}

function getAnomalyStatus(params) {
  return params.row.isAnomaly ? 'Anomaly' : 'Not Anomaly';
}

const columns = [
  { field: 'Predicted Class', headerName: 'Predicted Class', flex: 0.5, minWidth: 5 },
  { field: 'Anomaly', headerName: 'Anomaly Status', flex: 0.4, renderCell: getAnomalyStatus, align: 'center' },
  { field: 'filename', headerName: 'Captured Image', flex: 0.5, renderCell: getImageFile },
  { field: 'Softmax', headerName: 'Prediction Probability (%)', flex: 0.5, minWidth: 5, align: 'center' },
  { field: 'filePath', headerName: 'Image Path', flex: 0.5, renderCell: getImagePath }
];

const CameraVisualDataCollection = () => {
  const [isError, setIsError] = useState(false);
  const [connectionMsg, setConnectionMsg] = useState("");
  const [colorText, setColorText] = useState("white");
  const [resultParam, setResultParam] = useState({
    captureImage: 0,
    classifyResults: 0
  });

  const [resultData, setResultData] = useState([]);
  const [displayResult, setDisplayResult] = useState({
    isAnomaly: false,
    confidenceScore: 0
  });
  const [displayColor, setDisplayColor] = useState("#fff8e1");
  const [displayText, setDisplayText] = useState("Idle");

  const [cameraResults, setCameraResults] = useState([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    const socket = io(baseURL, {
      origin: "*",
      methods: ["GET", "POST"],
      credentials: true,
      reconnect: true,
      reconnectionAttempts: 3,
      reconnectionDelay: 10
    });

    function onConnect() {
      setConnectionMsg("Connection Established!");
    }

    function onDisconnect() {
      setIsError(false);
      setConnectionMsg("Network Connection Disconnected");
    }

    function onIdle(val) {
      setDisplayText('Idle');
      setDisplayColor('#37D67A');
      setColorText('white');
    }

    function onResults(val) {
      setResultData((resultData) => [...resultData, val]);
      setColorText('white');
      setDisplayColor('#009ce0');
      setDisplayText(val.PredictedClass);
      setDisplayResult(val.ConfidenceScore);
    }

    socket.on("disconnect", onDisconnect);
    socket.on('idle', onIdle);
    socket.on('results', onResults);
    socket.on("connect_error", (err) => {
      setIsError(true);
      setConnectionMsg("Network Connection Error");
    });
    socket.on("connect", onConnect);

    return () => {
      socket.disconnect();
    };
  }, [resultParam]);

  const resetSession = () => {
    setResultData([]);
    setIsError(false);
    setConnectionMsg("");
  };

  const startImageCapture = async () => {
    try {
      const response = await fetch(`${baseURL}/start-image-capture`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(resultParam),
      });
      if (response.ok) {
        setIsError(false);
        setResultParam({
          captureImage: 1,
          classifyResults: 1
        });
      } else {
        setIsError(true);
        setResultData([]);
      }
    } catch (err) {
      setConnectionMsg("Error Occurred connecting to server!!!. Try again later.");
      setIsError(true);
      setResultData([]);
    }
  };

  const stopImageCapture = async () => {
    try {
      setResultParam({
        captureImage: 0,
        classifyResults: 0
      });
    } catch (err) {
      setIsError(true);
    }
  };

  const displayCard = (
    <CardContent style={{ backgroundColor: displayColor }}>
      <Typography gutterBottom component="div" align='center' sx={{ color: colorText, fontSize: 60, mt: 4, textTransform: 'uppercase', height: 80 }}>
        <Typography variant="h6" color="text.primary" sx={{ color: 'black', mt: 1 }}>
          {displayText === 'Idle' ? '' : 'Classification class: '}
        </Typography>
        {displayText}
      </Typography>
      <Divider><Chip label="." /></Divider>
      <Typography variant="h6" color="text.primary" sx={{ color: 'black', mt: 1 }}>
        {displayText === 'Idle' ? '' : 'Prediction Probability: '}
      </Typography>
      <Typography variant="h3" align='center' color="text.primary" sx={{ color: '#ff9800', mt: 1 }}>
        {displayText === 'Idle' ? '' : displayResult + "%"}
      </Typography>
    </CardContent>
  );

  return (
    <Grid
      container
      spacing={0}
      direction="column"
      alignItems="center"
      justify="center"
      style={{ minHeight: "100vh" }}
    >
      <Card sx={{ minWidth: 800, mb: 4 }} style={{ backgroundColor: "#026ca0" }}>
        {displayCard}
      </Card>

      <div style={{ minHeight: "15vh", width: '100%' }}>
        <DataGrid rows={resultData} columns={columns} sortingOrder="[asc]" autoHeight
          initialState={{
            pagination: {
              paginationModel: {
                pageSize: 15,
              },
            },
          }}
          pageSizeOptions={[25, 50, 70, 100]}
          experimentalFeatures={{ rowGrouping: true }}
          getRowId={(row) => row.id || uuidv4()} />
      </div>

      <Grid item xs={12} sm={12} md={12} lg={12}>
        <Grid item xs={12} md={12}>
          <div
            style={{ display: isError ? "flex" : "None", alignItems: "center" }}
            xs={12}
            md={6}
          >
          </div>
        </Grid>

        <Box display="flex" alignItems="center" justifyItems="center">
          <Alert sx={{ severity: isError ? "error" : "success" }}>{connectionMsg}</Alert>
        </Box>
      </Grid>

      <Box style={{ marginTop: '20px', width: '100%' }}>
        <Grid container spacing={3}>
          <Grid item xs={12}>
            <Paper elevation={3} className="results-section">
              <Typography variant="h5" gutterBottom>
                Camera Visual Data
              </Typography>
              <Box
                className="camera-results"
                style={{
                  padding: '10px',
                  border: '1px solid #ccc',
                  backgroundColor: '#f9f9f9',
                }}
              >
                {isLoading ? (
                  <CircularProgress />
                ) : cameraResults.length > 0 ? (
                  cameraResults.map((result, index) => (
                    <Typography key={index} variant="body2">
                      {result}
                    </Typography>
                  ))
                ) : (
                  <Typography variant="body2">No camera results available.</Typography>
                )}
              </Box>
            </Paper>
          </Grid>
        </Grid>
      </Box>
    </Grid>
  );
};

export default CameraVisualDataCollection;