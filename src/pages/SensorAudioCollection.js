import React, { useEffect, useState } from "react";
import Alert from '@mui/material/Alert';
import {DataGrid} from '@mui/x-data-grid'
import {v4 as uuidv4} from 'uuid'
import {io} from "socket.io-client";
import baseURL from "../utils/baseURL";
import ReactAudioPlayer from 'react-audio-player';
import './SensorAudioCollection.css';
import {
  Box,
  Grid,
  Chip,
  Button,
  Stack,
  Divider,
  Card,
  CardContent,
  Typography,
} from "@mui/material";
import apiService from "../api/acoustics"
// import Speech from 'react-speech';
import Speech from "react-text-to-speech";
const audio_folder = '/results/media/audio/'

function getAudioFile(params) {
  return  <ReactAudioPlayer src={audio_folder+params.row.filename+'.wav'} controls/>
}

function getAudioPath(params) {
  return audio_folder+params.row.filename+'.wav'
}




function predictedClassSpeech(params){
  const predidtedClass = params.row['Predicted Class']
  return <Speech 
  voiceURI={[
    "victor",
    "Max"
    ]
  }
  pitch={0.1}
  text={predidtedClass} />
}

function getAnomalyStatus(params){
  return params.row.isAnomaly ? 'Anomaly': 'Not Anomaly'
}

function displayGeoLocation(params){
  return " Longitude: " +params.row.location.longitude + " Latitude: " + params.row.location.latitude
}
const columns = [
  {field: 'Predicted Class', headerName: 'Class to Speech',flex:0.3, renderCell:predictedClassSpeech},
  {field: 'PredictedClass', headerName: 'Predicted Class',flex: 0.5,minWidth: 5, },
  {field: 'Anomaly', headerName: 'Anomaly / Anomaly Audio', flex: 0.4,renderCell:getAnomalyStatus,align: 'center'},
  {field:'filename',headerName:'Sample Audio',flex: 0.5,renderCell:getAudioFile},
  { field: 'Softmax', headerName: 'Prediction Probability (%)',flex: 0.5,minWidth: 5,align: 'center' },
  {field: 'filePath', headerName: 'Audio Path', flex: 0.5, renderCell:getAudioPath}
  // { field: 'audio_start_time', headerName: 'Audio Start time',flex: 0.5,minWidth: 5, },
  // { field: 'audio_end_time', headerName: 'Audio end time',flex: 0.5,minWidth: 5, },
  // { field: 'location', headerName: 'Location',flex: 0.5,minWidth: 5, renderCell:displayGeoLocation}
]

export default function ResultPage(){
  const [speechSynthesis] = useState(window.speechSynthesis);
  const [isStart, setIsStart] = useState(false);
  const [isError, setIsError] = useState(false);
  const[isSocketConnect, setIsSocketConnect] = useState(false)
  const [connectionMsg, setConnectionMsg] = useState("");
  const [colorText, setColorText] = useState("while");
  const [resultParam, setResultParam] = useState({
  captureAudio: 0,
  classifyResults: 0
  });
  
  const [resultData,setResultData] = useState([])
  const [displayResult, setDisplayResult] = useState({
    isAnomaly: false,
    confidenceScore: 0
  });
  const [displayColor, setDisplayColor] = useState("#fff8e1")
  const [displayText, setDisplayText] = useState("Idle")

useEffect(() => {
  
  const socket = io(baseURL,{
    origin: "*",
    methods: ["GET", "POST"],
    credentials:true,
    reconnect: true,
    reconnectionAttempts: 3,
    reconnectionDelay: 10
  });

  function onConnect(test){
    setConnectionMsg("Connection Established!");
  }

  function onDisconnect(){
    setIsSocketConnect(false);
    setIsError(false);
    setConnectionMsg("Network Connection Disconnected");
    //socket.connect();
    
  }

  /**
   * Sets the Idle state for  Display card 
   * @param {any} val 
   */
  function onIdle(val){
    setDisplayText('Idle')
    setDisplayColor('#37D67A' )
    setColorText('white')
  }


  /**
   * Sets the State of the ResultDate
   * @param {any} val 
   */
  function onResults(val){
    setResultData((resultData) => [...resultData,val])
    setColorText( 'white')
    setDisplayColor('#009ce0' )
    setDisplayText(val.PredictedClass)
    setDisplayResult(val.ConfidenceScore)
  }


  socket.on("disconnect",onDisconnect)
  socket.on('idle',onIdle)
  socket.on('results',onResults)
  socket.on("connect_error", (err) => {
    setIsError(true);
    setConnectionMsg("Network Connection Error");
  });
  socket.on("connect", onConnect)

  return () => {
    speechSynthesis.cancel();

  };

}, [resultParam, speechSynthesis]);

const resetSession = () =>{

  setResultData([])
  setIsSocketConnect(false)
  stopAudioCapture()
}

const startAudioCapture = async () => {
  try{

    const resp = await apiService.startAudioCaptureAndClassify(resultParam)
    if(resp.status === 200){
      setIsError(false);
      setIsSocketConnect(true);
      setIsStart(true)
      setResultParam({
        captureAudio: 1,
        classifyResults: 1
        })
    }else{
        setIsError(true)
        setIsStart(false)
        setResultData([])
    }
  }catch(err){
    setConnectionMsg("Error Occured connecting to server!!!. Try again later.")
    setIsError(true)
    setIsStart(false)
    setResultData([])
  }
}

const stopAudioCapture = async () => {
  try{
    setIsStart(false)
    setResultParam({
      captureAudio: 0,
      classifyResults: 0
      })
  }catch(err){
    setIsStart(false)
  }
}

const displayCard = (

      <CardContent style={{backgroundColor: displayColor}}>
        <Typography gutterBottom  component="div" align='center' sx={{color: colorText,fontSize:60,mt:4,textTransform: 'uppercase',height:80}}>
        <Typography variant="h6" color="text.primary"  sx={{color: 'black',mt: 1}}>
          {displayText === 'Idle' ? '':'Classification class: '}
        </Typography>
            {displayText}
        </Typography>   
        <Divider><Chip label="." /></Divider>
        <Typography variant="h6" color="text.primary"  sx={{color: 'black',mt: 1}}>
          {displayText === 'Idle' ? '':'Prediction Probability: '}
        </Typography>
        <Typography variant="h3" align='center' color="text.primary"  sx={{color: '#ff9800',mt: 1}}>
          {displayText === 'Idle' ? '' : displayResult+"%"}
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
    <Card sx={{minWidth: 800, mb:4}} style={{backgroundColor: "#026ca0"}}>
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
      pageSizeOptions={[25,50,70,100]}
    experimentalFeatures={{ rowGrouping: true }}

      getRowId={(row) => row.id || uuidv4()}/>
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
      {/* <Stack direction="row" spacing={2}>
        <Button
          variant="outlined"
          startIcon={<PlayArrowIcon />}
          onClick={startAudioCapture}
          color="success"
          disabled={isStart}
        >
          Start
        </Button>

        <Button
          variant="outlined"
          startIcon={<StopIcon />}
          onClick={stopAudioCapture}
          color="error"
          disabled={!isStart}
        >
          Stop
        </Button>
        <Button
          variant="outlined"
          startIcon={<RefreshIcon />}
          onClick={resetSession}
          color="success"
        >
          Refresh
        </Button>
    </Stack> */}
    <Alert sx={{severity: isError ? "error" : "success"}}>{connectionMsg}</Alert>
  </Box> 
  
  </Grid>
  </Grid>
  );
}
