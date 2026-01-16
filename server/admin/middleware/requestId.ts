import type { Request, Response, NextFunction } from "express";
import { randomUUID } from "crypto";

export function ensureRequestId(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const existingId = req.headers["x-request-id"];
  const requestId =
    typeof existingId === "string" && existingId.length > 0
      ? existingId
      : randomUUID();

  res.locals.requestId = requestId;
  res.setHeader("x-request-id", requestId);
  next();
}
