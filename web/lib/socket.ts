// web/lib/socket.ts

import { io, Socket } from "socket.io-client";
import { getWebRuntimeEnv } from "./env";

// must match backend URL
export const API = getWebRuntimeEnv().apiBase;

let s: Socket | null = null;

export function socket() {
  if (!API) {
    console.warn(
      "⚠ NEXT_PUBLIC_API_BASE missing. Socket.io cannot connect."
    );
    return {
      on() {},
      off() {},
    } as any;
  }

  if (!s) {
    s = io(API, {
      transports: ["websocket"],
      path: "/socket.io",
      reconnection: true,
      reconnectionAttempts: Infinity,
    });

    s.on("connect", () => {
      console.log("[socket] connected", s?.id);
    });

    s.on("disconnect", () => {
      console.log("[socket] disconnected");
    });
  }

  return s;
}
