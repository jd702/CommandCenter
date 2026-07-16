const trimTrailingSlash = (value) => value.replace(/\/+$/, "");

export const ROBOT_API_BASE_URL = trimTrailingSlash(
  process.env.REACT_APP_ROBOT_API_URL || "http://127.0.0.1:5002"
);

export const MISSION_CONTROL_URL = process.env.REACT_APP_MISSION_CONTROL_URL || "";
