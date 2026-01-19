import type { Request } from "express";

import { storage } from "../storage";

// Idempotency helper for money endpoints (atomic approach)
// Inserts a "pending" row first to claim the key, preventing race conditions
// Returns { acquired: true, keyId } if we claimed the key, or { acquired: false, response } if duplicate
export async function acquireIdempotencyLock(
  req: Request,
  userId: string,
  endpoint: string,
): Promise<
  | { acquired: true; keyId: string }
  | { acquired: false; cached: true; status: number; body: any }
  | { acquired: false; cached: false }
> {
  const idempotencyKey = req.headers["idempotency-key"];
  if (!idempotencyKey || typeof idempotencyKey !== "string") {
    return { acquired: false, cached: false };
  }

  try {
    // Try to insert a pending row (responseStatus = null means in-progress)
    const created = await storage.createIdempotencyKey({
      userId,
      idempotencyKey,
      endpoint,
      operationId: null,
      responseStatus: null,
      responseBody: null,
    });
    return { acquired: true, keyId: created.id };
  } catch (err: any) {
    // Unique constraint violation = key already exists
    if (err.code === "23505") {
      // Check if the existing key has a completed response
      const existing = await storage.getIdempotencyKey(userId, idempotencyKey, endpoint);
      if (existing && existing.responseStatus !== null) {
        return {
          acquired: false,
          cached: true,
          status: existing.responseStatus,
          body: existing.responseBody,
        };
      }
      // Key exists but no response yet (concurrent request in progress)
      // Return 409 Conflict to indicate retry later
      return {
        acquired: false,
        cached: true,
        status: 409,
        body: { error: "Request in progress", code: "IDEMPOTENCY_CONFLICT" },
      };
    }
    throw err;
  }
}

// Complete idempotency after successful operation
export async function completeIdempotency(
  keyId: string,
  operationId: string | null,
  status: number,
  body: any,
): Promise<void> {
  await storage.updateIdempotencyKey(keyId, {
    operationId,
    responseStatus: status,
    responseBody: body,
  });
}
