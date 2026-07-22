const trimTrailingSlash = (value) => value.replace(/\/+$/, "");

const runtime = window.__COMMAND_CENTER_CONFIG__ || {};

export const ROBOT_API_BASE_URL = trimTrailingSlash(
  runtime.ROBOT_API_URL || process.env.REACT_APP_ROBOT_API_URL || "http://127.0.0.1:5002"
);

export const AUGMENTOR_BASE_URL = trimTrailingSlash(
  runtime.AUGMENTOR_URL || process.env.REACT_APP_AUGMENTOR_URL || "http://127.0.0.1:5000"
);

export const GESTURE_API_BASE_URL = trimTrailingSlash(
  runtime.GESTURE_API_URL || process.env.REACT_APP_GESTURE_API || "http://127.0.0.1:7001"
);

export const SIM_SOCKET_URL = trimTrailingSlash(
  runtime.SIM_SOCKET_URL || process.env.REACT_APP_SIM_SOCKET_URL || "http://127.0.0.1:5001"
);

export const MISSION_CONTROL_URL =
  runtime.MISSION_CONTROL_URL || process.env.REACT_APP_MISSION_CONTROL_URL || "";

export const getRuntimeConfig = () => ({
  augmentorUrl: AUGMENTOR_BASE_URL,
  robotApiUrl: ROBOT_API_BASE_URL,
  gestureApiUrl: GESTURE_API_BASE_URL,
  simSocketUrl: SIM_SOCKET_URL,
  missionControlUrl: MISSION_CONTROL_URL,
});

export default getRuntimeConfig;
