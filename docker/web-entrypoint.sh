#!/bin/sh
set -eu

cat > /usr/share/nginx/html/runtime-config.js <<EOF
window.__COMMAND_CENTER_CONFIG__ = {
  AUGMENTOR_URL: "${AUGMENTOR_URL:-/augmentor}",
  ROBOT_API_URL: "${ROBOT_API_URL:-http://host.docker.internal:5002}",
  GESTURE_API_URL: "${GESTURE_API_URL:-http://host.docker.internal:7001}",
  SIM_SOCKET_URL: "${SIM_SOCKET_URL:-http://host.docker.internal:5001}"
};
EOF
