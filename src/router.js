import MainHub from "./pages/MainHub";
import SensorAudioCollection from "./pages/SensorAudioCollection";
import CameraVisualDataCollection from "./pages/CameraVisualDataCollection";
import Tasking from "./pages/Tasking";
import LiveData from "./pages/LiveData";
import History from "./pages/History";
import SettingsPage from './pages/SettingsPage';
import Home from "./pages/Home";
import NoPageFound from "./pages/NoPageFound";
import DataTransformation from "./pages/DataTransformation";
import Ros2Agents from "./pages/Ros2Agents";
import AgentTracker from "./pages/AgentTracker"
import { Route, BrowserRouter as Router, Routes } from "react-router-dom";
import SimDashboard from "./pages/SimDashboard";

function AppRouter() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<MainHub />}>
          <Route index element={<Home />} />
          <Route path="history" element={<History />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="livedata" element={<LiveData />} />
          <Route path="sensor-audio" element={<SensorAudioCollection />} />
          <Route path="camera-visual" element={<CameraVisualDataCollection />} />
          <Route path="tasking" element={<Tasking />} />
          <Route path="data-transformation" element={<DataTransformation />} />
          <Route path="Ros2Agents" element={<Ros2Agents />} />
          <Route path="agent-tracker" element={<AgentTracker />} />
          <Route path="sim-dashboard" element={<SimDashboard />} />
          <Route path="*" element={<NoPageFound />} />
        </Route>
      </Routes>
    </Router>
  );
}

export default AppRouter;


/* import { Route, BrowserRouter as Router, Routes, Outlet } from "react-router-dom";
import LayoutPage from "./pages/layout/LayoutPage";
import ResultPage from "./pages/ResultPage";
import NoPageFound from "./pages/NoPageFound";
import Tasking from "./pages/Tasking"; // Corrected the import path
import React from "react";

function AppRouter() {
  return (
    <Router basename="/results">
      <Routes>
        <Route
          path="/"
          element={
            <Layout redirectPath="/">
              <LayoutPage />
            </Layout>
          }
        >
          <Route index element={<ResultPage />} />
          <Route path="results" element={<ResultPage />} />
          <Route path="*" element={<NoPageFound />} />
        </Route>
        <Route path="/tasking" element={<Tasking />} />
      </Routes>
    </Router>
  );
}

const Layout = ({ redirectPath = "/", children }) => {
  return children ? children : <Outlet />;
};

export default AppRouter;
*/