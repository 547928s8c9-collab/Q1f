import { z } from "zod";
import { VALID_TIMEFRAMES } from "../schema";

export const ApiErrorSchema = z.object({
  code: z.string(),
  message: z.string(),
  details: z.unknown().optional(),
});

export const ApiEnvelopeSchema = <T extends z.ZodTypeAny>(data: T) =>
  z.union([
    z.object({ ok: z.literal(true), data }),
    z.object({ ok: z.literal(false), error: ApiErrorSchema }),
  ]);

export const InvestStrategySummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().nullable().optional(),
  riskTier: z.string(),
  expectedReturnMinBps: z.number().int().nullable().optional(),
  expectedReturnMaxBps: z.number().int().nullable().optional(),
  pairs: z.array(z.string()),
  benchmarks: z.array(z.string()),
  minInvestmentMinor: z.string(),
  isActive: z.boolean(),
  ui: z
    .object({
      badge: z.string().optional(),
      accent: z.string().optional(),
    })
    .optional(),
});

export const InvestStrategiesResponseSchema = ApiEnvelopeSchema(
  z.object({ strategies: z.array(InvestStrategySummarySchema) })
);

export const InvestStrategyOverviewResponseSchema = ApiEnvelopeSchema(
  z.object({
    strategy: InvestStrategySummarySchema,
    state: z.string().nullable(),
    equityMinor: z.string().nullable(),
    allocatedMinor: z.string().nullable(),
    pnlMinor: z.string().nullable(),
    lastSnapshotTs: z.number().nullable(),
  })
);

export const InvestCandlesQuerySchema = z.object({
  timeframe: z.enum(VALID_TIMEFRAMES).optional(),
  periodDays: z.coerce.number().int().min(1).max(365).optional(),
  startMs: z.coerce.number().int().optional(),
  endMs: z.coerce.number().int().optional(),
});

export const InvestCandlesResponseSchema = ApiEnvelopeSchema(
  z.object({
    candles: z.array(
      z.object({
        ts: z.number(),
        open: z.number(),
        high: z.number(),
        low: z.number(),
        close: z.number(),
        volume: z.number(),
      })
    ),
    gaps: z.array(
      z.object({
        startMs: z.number(),
        endMs: z.number(),
        reason: z.string(),
      })
    ),
    symbol: z.string(),
    timeframe: z.string(),
    periodDays: z.number(),
  })
);

export const InvestTradesQuerySchema = z.object({
  timeframe: z.enum(VALID_TIMEFRAMES).optional(),
  periodDays: z.coerce.number().int().min(1).max(365).optional(),
});

export const InvestTradesResponseSchema = ApiEnvelopeSchema(
  z.object({
    trades: z.array(
      z.object({
        id: z.string(),
        entryTs: z.number(),
        exitTs: z.number(),
        entryPrice: z.number(),
        exitPrice: z.number(),
        qty: z.number(),
        netPnl: z.number(),
        netPnlPct: z.number(),
        holdBars: z.number(),
        reason: z.string(),
      })
    ),
  })
);

export const InvestInsightsResponseSchema = ApiEnvelopeSchema(
  z.object({
    trades: z.array(
      z.object({
        id: z.string(),
        entryTs: z.number(),
        exitTs: z.number(),
        entryPrice: z.number(),
        exitPrice: z.number(),
        qty: z.number(),
        netPnl: z.number(),
        netPnlPct: z.number(),
        holdBars: z.number(),
        reason: z.string(),
      })
    ),
    metrics: z.object({
      totalTrades: z.number(),
      winRatePct: z.number(),
      netPnl: z.number(),
      netPnlPct: z.number(),
      grossPnl: z.number(),
      fees: z.number(),
      avgHoldBars: z.number(),
      profitFactor: z.number(),
      avgTradePnl: z.number(),
    }),
    timeframe: z.string(),
    periodDays: z.number(),
    symbol: z.string(),
  })
);

export const InvestMutationSchema = z.object({
  amountMinor: z.string().regex(/^\d+$/),
  requestId: z.string().optional(),
});

export const InvestMutationResponseSchema = ApiEnvelopeSchema(
  z.object({
    allocationId: z.string(),
    status: z.string(),
  })
);

export const WithdrawMutationSchema = z.object({
  amountMinor: z.string().regex(/^\d+$/),
  requestId: z.string().optional(),
});

export const WithdrawMutationResponseSchema = ApiEnvelopeSchema(
  z.object({
    allocationId: z.string(),
    status: z.string(),
  })
);

export type InvestStrategySummary = z.infer<typeof InvestStrategySummarySchema>;
export type InvestStrategiesResponse = z.infer<typeof InvestStrategiesResponseSchema>;
export type InvestStrategyOverviewResponse = z.infer<typeof InvestStrategyOverviewResponseSchema>;
export type InvestCandlesQuery = z.infer<typeof InvestCandlesQuerySchema>;
export type InvestCandlesResponse = z.infer<typeof InvestCandlesResponseSchema>;
export type InvestTradesQuery = z.infer<typeof InvestTradesQuerySchema>;
export type InvestTradesResponse = z.infer<typeof InvestTradesResponseSchema>;
export type InvestInsightsResponse = z.infer<typeof InvestInsightsResponseSchema>;
export type InvestMutation = z.infer<typeof InvestMutationSchema>;
export type InvestMutationResponse = z.infer<typeof InvestMutationResponseSchema>;
export type WithdrawMutation = z.infer<typeof WithdrawMutationSchema>;
export type WithdrawMutationResponse = z.infer<typeof WithdrawMutationResponseSchema>;
