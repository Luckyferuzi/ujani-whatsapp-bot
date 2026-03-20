import pino from "pino";
import type { Request, Response } from "express";
import pinoHttpModule from "pino-http";
import { randomUUID } from "node:crypto";

const level = process.env.LOG_LEVEL || (process.env.NODE_ENV === "production" ? "info" : "debug");

export const logger = pino({
  level,
  redact: {
    paths: [
      "req.headers.authorization",
      "req.headers.x-inbox-key",
      "req.headers.cookie",
      "accessToken",
      "token",
      "password",
      "app_secret",
      "whatsapp_token",
    ],
    remove: true,
  },
});

export function getRequestId(req: { headers?: Record<string, unknown> }) {
  const incoming = req.headers?.["x-request-id"];
  if (typeof incoming === "string" && incoming.trim()) return incoming.trim();
  return randomUUID();
}

const pinoHttp = (pinoHttpModule as any).default ?? pinoHttpModule;

export const httpLogger = pinoHttp({
  logger,
  genReqId: getRequestId,
  customSuccessMessage(req: Request, res: Response) {
    return `${req.method} ${req.url} completed with ${res.statusCode}`;
  },
  customErrorMessage(req: Request, res: Response) {
    return `${req.method} ${req.url} failed with ${res.statusCode}`;
  },
  customProps(req: Request) {
    return {
      requestId: String((req as any).id ?? ""),
    };
  },
});

export function logOperationalError(message: string, error: unknown, extra: Record<string, unknown> = {}) {
  logger.error(
    {
      err: error,
      ...extra,
    },
    message
  );
}
