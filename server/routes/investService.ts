import type { Request } from "express";
import type { Strategy, Operation } from "@shared/schema";
import { storage } from "../storage";
import { withTransaction } from "../db";
import { balances, positions, operations, auditLogs } from "@shared/schema";
import { and, eq } from "drizzle-orm";
import { assertNonNegative } from "../lib/invariants";

interface InvestAccessResult {
  ok: true;
} 

interface InvestAccessError {
  ok: false;
  status: number;
  body: { error: string; code: string; message: string };
}

export async function validateInvestAccess(userId: string): Promise<InvestAccessResult | InvestAccessError> {
  const security = await storage.getSecuritySettings(userId);
  const kycApplicant = await storage.getKycApplicant(userId);

  if (!security?.consentAccepted) {
    return {
      ok: false,
      status: 403,
      body: {
        error: "Consent required",
        code: "CONSENT_REQUIRED",
        message: "Please accept the terms and conditions before investing",
      },
    };
  }

  if (kycApplicant?.status !== "APPROVED") {
    return {
      ok: false,
      status: 403,
      body: {
        error: "KYC required",
        code: "KYC_REQUIRED",
        message: "Please complete identity verification before investing",
      },
    };
  }

  return { ok: true };
}

interface InvestValidationResult {
  ok: true;
  strategy: Strategy;
}

interface InvestValidationError {
  ok: false;
  status: number;
  body: { error: string; code?: string; message?: string; minimum?: string };
}

export async function validateInvestment(
  userId: string,
  strategyId: string,
  amount: string,
): Promise<InvestValidationResult | InvestValidationError> {
  const access = await validateInvestAccess(userId);
  if (!access.ok) {
    return access;
  }

  const strategy = await storage.getStrategy(strategyId);
  if (!strategy) {
    return { ok: false, status: 404, body: { error: "Strategy not found" } };
  }

  const existingPosition = await storage.getPosition(userId, strategyId);
  if (existingPosition?.paused) {
    return {
      ok: false,
      status: 403,
      body: {
        error: "Strategy paused",
        code: "STRATEGY_PAUSED",
        message: existingPosition.pausedReason === "dd_breach"
          ? "This strategy is paused due to drawdown limit breach. Please review your risk settings."
          : "This strategy is currently paused. Resume it to make new investments.",
      },
    };
  }

  const balance = await storage.getBalance(userId, "USDT");
  if (BigInt(balance?.available || "0") < BigInt(amount)) {
    return { ok: false, status: 400, body: { error: "Insufficient balance" } };
  }

  if (BigInt(amount) < BigInt(strategy.minInvestment)) {
    return {
      ok: false,
      status: 400,
      body: {
        error: "Amount below minimum investment",
        code: "MIN_INVESTMENT",
        minimum: strategy.minInvestment,
      },
    };
  }

  return { ok: true, strategy };
}

interface ExecuteInvestmentParams {
  req: Request;
  userId: string;
  strategyId: string;
  amount: string;
  strategy: Strategy;
}

export async function executeInvestment(params: ExecuteInvestmentParams): Promise<Operation> {
  const { req, userId, strategyId, amount, strategy } = params;

  return withTransaction(async (tx) => {
    // Re-fetch balance within transaction for consistency
    const [currentBalance] = await tx.select().from(balances)
      .where(and(eq(balances.userId, userId), eq(balances.asset, "USDT")));

    if (!currentBalance || BigInt(currentBalance.available) < BigInt(amount)) {
      throw new Error("INSUFFICIENT_BALANCE");
    }

    // Calculate new balance with invariant check
    const newAvailable = BigInt(currentBalance.available) - BigInt(amount);
    assertNonNegative(newAvailable, "USDT balance");

    // Update balance atomically
    await tx.update(balances)
      .set({ available: newAvailable.toString(), updatedAt: new Date() })
      .where(eq(balances.id, currentBalance.id));

    // Create or update position
    const [existingPos] = await tx.select().from(positions)
      .where(and(eq(positions.userId, userId), eq(positions.strategyId, strategyId)));

    if (existingPos) {
      const newLegacyPrincipal = (BigInt(existingPos.principal || "0") + BigInt(amount)).toString();
      const newLegacyCurrent = (BigInt(existingPos.currentValue || "0") + BigInt(amount)).toString();
      const newPrincipalMinor = (BigInt(existingPos.principalMinor || existingPos.principal || "0") + BigInt(amount)).toString();
      const newInvestedCurrentMinor = (BigInt(existingPos.investedCurrentMinor || existingPos.currentValue || "0") + BigInt(amount)).toString();

      await tx.update(positions)
        .set({
          principal: newLegacyPrincipal,
          currentValue: newLegacyCurrent,
          principalMinor: newPrincipalMinor,
          investedCurrentMinor: newInvestedCurrentMinor,
          updatedAt: new Date(),
        })
        .where(eq(positions.id, existingPos.id));
    } else {
      await tx.insert(positions).values({
        userId,
        strategyId,
        principal: amount,
        currentValue: amount,
        principalMinor: amount,
        investedCurrentMinor: amount,
      });
    }

    // Create operation record
    const [op] = await tx.insert(operations).values({
      userId,
      type: "INVEST",
      status: "completed",
      asset: "USDT",
      amount,
      fee: "0",
      txHash: null,
      providerRef: null,
      strategyId,
      strategyName: strategy.name,
      fromVault: null,
      toVault: null,
      metadata: null,
      reason: null,
    }).returning();

    // Audit log
    await tx.insert(auditLogs).values({
      userId,
      event: "INVEST",
      resourceType: "operation",
      resourceId: op.id,
      details: {
        amountMinor: amount,
        asset: "USDT",
        strategyId,
        idempotencyKey: req.headers["idempotency-key"] || null,
        requestId: req.requestId,
      },
      ip: req.ip || null,
      userAgent: req.headers["user-agent"] || null,
    });

    return op;
  });
}
