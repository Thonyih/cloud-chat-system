// frontend/public/api.js
const isLocal = ["localhost", "127.0.0.1"].includes(window.location.hostname);
// The port 31403 refers to the NodePort exposed in the Kubernetes cluster for WebSocket connections
const WS_PORT = isLocal ? 8084 : 31403; // <-- NodePort from k8s

export const API = {
  BASE_URL: "",
  REGISTER: "/register",
  LOGIN: "/login",
  USERS: "/users",
  MESSAGES: "/messages",
  MESSAGES_READ: "/messages/read",
  GROUPS: "/groups",
  CONTACTS: "/contacts",
  MESSAGES_WS: `ws://${window.location.hostname}:${WS_PORT}`,
};
