import type { Request, Response, NextFunction } from "express";
import { logger } from "../lib/logger";

const isProduction = process.env.NODE_ENV === "production";

/**
 * Determines if an error should expose internal details to the client
 */
function isClientSafeError(err: any): boolean {
  // Client-safe errors have explicit status codes and are not system errors
  if (err.status && err.status < 500) return true;
  if (err.statusCode && err.statusCode < 500) return true;
  
  // Known error codes that are safe to expose
  const safeErrorCodes = [
    "INSUFFICIENT_BALANCE",
    "INVALID_AMOUNT",
    "VALIDATION_ERROR",
    "NOT_FOUND",
    "UNAUTHORIZED",
    "FORBIDDEN",
    "TWO_FACTOR_REQUIRED",
    "TWO_FACTOR_INVALID",
    "KYC_REQUIRED",
    "IDEMPOTENCY_CONFLICT",
  ];
  
  if (err.code && safeErrorCodes.includes(err.code)) return true;
  
  return false;
}

/**
 * Extracts safe error information for client response
 */
function getClientError(err: any): { message: string; code?: string } {
  const code = err.code || err.name;
  const message = err.message || "Internal Server Error";
  
  // In production, only expose safe errors
  if (isProduction && !isClientSafeError(err)) {
    return {
      message: "An error occurred. Please try again later.",
      code: "INTERNAL_ERROR",
    };
  }
  
  return { message, code };
}

export function errorHandler(
  err: any,
  req: Request,
  res: Response,
  next: NextFunction
): void {
  // If headers already sent, delegate to Express default handler
  if (res.headersSent) {
    return next(err);
  }

  const status = err.status || err.statusCode || 500;
  const clientError = getClientError(err);
  const requestId = req.requestId || "unknown";

  // Log error with full context
  logger.error(
    `Request failed: ${req.method} ${req.path}`,
    "error-handler",
    {
      requestId,
      method: req.method,
      path: req.path,
      status,
      errorCode: clientError.code,
      userId: (req as any).user?.id || (req as any).user?.claims?.sub,
    },
    err
  );

  // Send response
  res.status(status).json({
    error: clientError.message,
    code: clientError.code,
    ...(isProduction ? {} : { requestId }), // Include requestId in development for debugging
  });
}
