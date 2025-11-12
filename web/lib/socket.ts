import { io, Socket } from "socket.io-client";
import { API } from "./api";

let s: Socket | null = null;
export function getSocket() {
  if (s) return s;
  s = io(API, {
    // let Socket.IO fall back to polling if websocket can't upgrade immediately
    transports: ["websocket", "polling"],
    // keep trying (Render free can be sleepy)
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 500,
    reconnectionDelayMax: 3000,
    timeout: 20000,
    // path stays default '/socket.io' (match server below)
    path: "/socket.io",
    withCredentials: false,
  });
  return s;
}
