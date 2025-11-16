// backend/src/sockets.ts
import type { Server as HttpServer } from 'http';
import { Server } from 'socket.io';

let io: Server | null = null;

export function attachSockets(server: HttpServer, origins: string[] = ['*']) {
  io = new Server(server, {
    path: '/socket.io',
    cors: { origin: origins, methods: ['GET', 'POST'] },
  });
  io.on('connection', () => console.log('Socket client connected'));
}

export function emit(event: string, payload: any) {
  if (io) io.emit(event, payload);
}
