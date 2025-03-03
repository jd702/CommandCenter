import React from "react";
import { createRoot } from 'react-dom/client';
import { Route, BrowserRouter as Router, Routes } from "react-router-dom";
import './index.css'; // Global styles
import Home from "./pages/Home";
import SensorAudioCollection from "./pages/SensorAudioCollection";
import CameraVisualDataCollection from "./pages/CameraVisualDataCollection";
import Tasking from './pages/Tasking';
import MainHub from './pages/MainHub';
import NoPageFound from "./pages/NoPageFound";
import { ThemeProvider, createTheme } from '@mui/material/styles';
import SettingsPage from "./pages/SettingsPage";
import History from "./pages/History";
import AgentTracker from "./pages/AgentTracker";  // ✅ Import AgentTracker
import Ros2Agents from "./pages/Ros2Agents";  // ✅ Import Ros2Agents
import { IpProvider } from './context/IpContext';
import { IpProvider2 } from './context/IpContext2';
import { CommandListProvider } from './context/CommandListContext';

const theme = createTheme({
    palette: {
        mode: 'light',
    },
});

const rootElement = document.getElementById('root');
const root = createRoot(rootElement);

function AppRouter() {
  return (
    <ThemeProvider theme={theme}>
      <CommandListProvider>
        <IpProvider>
          <IpProvider2>
            <Router>
              <Routes>
                <Route path="/" element={<MainHub />}>
                  <Route index element={<Home />} />
                  <Route path="sensor-audio" element={<SensorAudioCollection />} />
                  <Route path="camera-visual" element={<CameraVisualDataCollection />} />
                  <Route path="tasking" element={<Tasking />} />
                  <Route path="settings" element={<SettingsPage />} />
                  <Route path="history" element={<History />} />
                  <Route path="tracker" element={<AgentTracker />} />  
                  <Route path="ros2agents" element={<Ros2Agents />} />  
                  <Route path="*" element={<NoPageFound />} />
                </Route>
              </Routes>
            </Router>
          </IpProvider2>
        </IpProvider>
      </CommandListProvider>
    </ThemeProvider>
  );
}

root.render(
  <React.StrictMode>
    <AppRouter />
  </React.StrictMode>
);
