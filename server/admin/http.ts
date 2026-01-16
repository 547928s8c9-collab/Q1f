import type { Response } from "express";

export interface AdminEnvelope<T = unknown> {
  ok: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
  meta?: {
    total?: number;
    limit?: number;
    nextCursor?: string | null;
  };
  requestId: string;
}

export function ok<T>(
  res: Response,
  data: T,
  meta?: AdminEnvelope["meta"],
  status = 200
): Response {
  const requestId = (res.locals.requestId as string) || "unknown";
  const envelope: AdminEnvelope<T> = {
    ok: true,
    data,
    requestId,
  };
  if (meta) envelope.meta = meta;
  return res.status(status).json(envelope);
}

export function fail(
  res: Response,
  code: string,
  message: string,
  status = 400,
  details?: unknown
): Response {
  const requestId = (res.locals.requestId as string) || "unknown";
  const envelope: AdminEnvelope = {
    ok: false,
    error: { code, message, details },
    requestId,
  };
  return res.status(status).json(envelope);
}

export const ErrorCodes = {
  AUTH_REQUIRED: "AUTH_REQUIRED",
  RBAC_DENIED: "RBAC_DENIED",
  ADMIN_REQUIRED: "ADMIN_REQUIRED",
  NOT_FOUND: "NOT_FOUND",
  VALIDATION_ERROR: "VALIDATION_ERROR",
  INTERNAL_ERROR: "INTERNAL_ERROR",
  STATE_TRANSITION_INVALID: "STATE_TRANSITION_INVALID",
} as const;
