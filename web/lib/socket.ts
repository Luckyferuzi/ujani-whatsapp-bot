import { io, Socket } from "socket.io-client";
const URL = process.env.NEXT_PUBLIC_API_BASE || ""; // empty → same-origin via rewrites
let s: Socket | null = null;

export function socket() {
  if (!s) s = io(URL, { transports: ["websocket"] });
  return s;
}
