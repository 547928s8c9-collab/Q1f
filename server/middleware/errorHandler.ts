import type { Request, Response, NextFunction } from "express";

export function errorHandler(err: any, _req: Request, res: Response, next: NextFunction) {
  console.error("[error-handler]", err);
  if (res.headersSent) {
    return next(err);
  }
  const status = err.status || err.statusCode || 500;
  const message = err.message || "Internal Server Error";
  res.status(status).json({ message });
}
