import React from "react";
import { createRoot } from 'react-dom/client';
import { Route, BrowserRouter as Router, Routes, Navigate } from "react-router-dom";
import './index.css'; // Global styles
import Home from "./pages/Home";
//import HistoryData from "./pages/HistoryData";
import SensorAudioCollection from "./pages/SensorAudioCollection"; // Corrected import
import CameraVisualDataCollection from "./pages/CameraVisualDataCollection"; // Corrected import
import Tasking from './pages/Tasking';
import MainHub from './pages/MainHub'; // Updated import
import NoPageFound from "./pages/NoPageFound";
import { ThemeProvider, createTheme } from '@mui/material/styles';
import SettingsPage from "./pages/SettingsPage";

const theme = createTheme({
    palette: {
        mode: 'light', // or 'dark' based on your preference
    },
});

const rootElement = document.getElementById('root');
const root = createRoot(rootElement);

function AppRouter() {
  return (
    <ThemeProvider theme={theme}>
      <Router>
        <Routes>
          <Route path="/" element={<MainHub />}>
            <Route index element={<Home />} />
            <Route path="sensor-audio" element={<SensorAudioCollection />} /> {/* Corrected path */}
            <Route path="camera-visual" element={<CameraVisualDataCollection />} /> {/* Corrected path */}
            <Route path="tasking" element={<Tasking />} />
            <Route path="*" element={<NoPageFound />} />
            <Route path="settings" element={<SettingsPage/>} />

          </Route>
        </Routes>
      </Router>
    </ThemeProvider>
  );
}

root.render(
  <React.StrictMode>
    <AppRouter />
  </React.StrictMode>
);

export default AppRouter;
//<Route path="historydata" element={<HistoryData />} />
//  <Route path="results" element={<Navigate to="/pages/MainHub" />} /> {/* Redirect old results path */}
