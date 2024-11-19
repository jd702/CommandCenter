import MainHub from "./pages/MainHub";
import SensorAudioCollection from "./pages/SensorAudioCollection"; // Corrected import
import CameraVisualDataCollection from "./pages/CameraVisualDataCollection"; // Corrected import
import Tasking from "./pages/Tasking";
import HistoryData from "./pages/HistoryData";
import LiveData from "./pages/LiveData";
import SettingsPage from './pages/SettingsPage';

import Home from "./pages/Home";
import NoPageFound from "./pages/NoPageFound"; // Optional: Handle 404
import { Route, BrowserRouter as Router, Routes } from "react-router-dom";

function AppRouter() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<MainHub />}>
          <Route index element={<Home />} />
          <Route path="historydata" element={<HistoryData />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="livedata" element={<LiveData />} />
          <Route path="sensor-audio" element={<SensorAudioCollection />} /> {/* Corrected path */}
          <Route path="camera-visual" element={<CameraVisualDataCollection />} /> {/* Corrected path */}
          <Route path="tasking" element={<Tasking />} />
          <Route path="*" element={<NoPageFound />} /> {/* Optional: Handle 404 */}
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