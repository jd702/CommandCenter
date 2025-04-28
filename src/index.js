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
import { IpProvider } from './context/IpContext';
import { IpProvider2 } from './context/IpContext2';
import { CommandListProvider } from './context/CommandListContext';
import DataTransformation from './pages/DataTransformation';
import Ros2Agents from "./pages/Ros2Agents";
import AgentTracker from "./pages/AgentTracker";

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
                  <Route path="*" element={<NoPageFound />} />
                  <Route path="data-transformation" element={<DataTransformation />} />
                  <Route path="Ros2Agents" element={<Ros2Agents />} />
                  <Route path="agent-tracker" element={<AgentTracker />} />

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