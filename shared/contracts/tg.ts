import { z } from "zod";

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

export const TgRiskTierSchema = z.enum(["LOW", "CORE", "HIGH"]);

export const TgEngineStatusResponseSchema = ApiEnvelopeSchema(
  z.object({
    state: z.string(),
    lastTickAt: z.number().nullable(),
    activeLoops: z.number(),
    lastError: z.string().nullable().optional(),
    serverTime: z.string(),
  })
);

export const TgStrategiesQuerySchema = z.object({
  riskTier: TgRiskTierSchema.optional(),
  limit: z.coerce.number().int().min(1).max(50).optional(),
  sort: z.enum(["equity", "roi30d", "drawdown30d", "trades24h"]).optional(),
});

export const TgSparklinePointSchema = z.object({
  ts: z.number(),
  equityMinor: z.string(),
});

export const TgStrategyCompactSchema = z.object({
  id: z.string(),
  name: z.string(),
  riskTier: TgRiskTierSchema,
  symbol: z.string().nullable(),
  timeframe: z.string().nullable(),
  state: z.string(),
  equityMinor: z.string(),
  pnlMinor: z.string(),
  roi30dBps: z.number(),
  maxDrawdown30dBps: z.number(),
  trades24h: z.number(),
  sparkline: z.array(TgSparklinePointSchema).max(30),
});

export const TgStrategiesResponseSchema = ApiEnvelopeSchema(
  z.object({
    strategies: z.array(TgStrategyCompactSchema),
    serverTime: z.string(),
  })
);

export const TgStrategyDetailQuerySchema = z.object({
  periodDays: z.coerce.number().int().min(1).max(180).optional(),
});

export const TgStrategyDetailResponseSchema = ApiEnvelopeSchema(
  z.object({
    strategy: z.object({
      id: z.string(),
      name: z.string(),
      riskTier: TgRiskTierSchema,
      symbol: z.string().nullable(),
      timeframe: z.string().nullable(),
    }),
    state: z.string(),
    allocatedMinor: z.string(),
    equityMinor: z.string(),
    pnlMinor: z.string(),
    roi30dBps: z.number(),
    maxDrawdown30dBps: z.number(),
    trades24h: z.number(),
    equitySeries: z.array(TgSparklinePointSchema).max(200),
    lastSnapshotTs: z.number().nullable(),
  })
);

export const TgCandlesQuerySchema = z.object({
  periodDays: z.coerce.number().int().min(1).max(30).optional(),
  limit: z.coerce.number().int().min(50).max(600).optional(),
});

export const TgCandlesResponseSchema = ApiEnvelopeSchema(
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
    symbol: z.string(),
    timeframe: z.string(),
    periodDays: z.number(),
  })
);

export const TgTradesQuerySchema = z.object({
  periodDays: z.coerce.number().int().min(1).max(180).optional(),
  limit: z.coerce.number().int().min(1).max(50).optional(),
  cursor: z.string().optional(),
});

export const TgTradesResponseSchema = ApiEnvelopeSchema(
  z.object({
    trades: z.array(
      z.object({
        id: z.string(),
        strategyId: z.string(),
        symbol: z.string(),
        side: z.string(),
        status: z.string(),
        entryTs: z.number().nullable(),
        exitTs: z.number().nullable(),
        entryPrice: z.string().nullable(),
        exitPrice: z.string().nullable(),
        qty: z.string(),
        grossPnlMinor: z.string(),
        feesMinor: z.string(),
        netPnlMinor: z.string(),
        holdBars: z.number().nullable(),
        reason: z.string().nullable(),
      })
    ),
    nextCursor: z.string().optional(),
  })
);

export const TgTradeEventsQuerySchema = z.object({
  tradeId: z.string().min(1),
  limit: z.coerce.number().int().min(1).max(200).optional(),
});

export const TgTradeEventsResponseSchema = ApiEnvelopeSchema(
  z.object({
    events: z.array(
      z.object({
        id: z.string(),
        tradeId: z.string(),
        strategyId: z.string(),
        type: z.string(),
        ts: z.number(),
        payloadJson: z.unknown().nullable(),
      })
    ),
  })
);

export const TgActivityResponseSchema = ApiEnvelopeSchema(
  z.object({
    trades: z.array(
      z.object({
        id: z.string(),
        strategyId: z.string(),
        strategyName: z.string(),
        symbol: z.string(),
        side: z.string(),
        exitTs: z.number().nullable(),
        netPnlMinor: z.string(),
      })
    ),
    notifications: z.object({
      unreadCount: z.number(),
    }),
    serverTime: z.string(),
  })
);

export type TgStrategiesQuery = z.infer<typeof TgStrategiesQuerySchema>;
export type TgStrategyCompact = z.infer<typeof TgStrategyCompactSchema>;
export type TgStrategiesResponse = z.infer<typeof TgStrategiesResponseSchema>;
export type TgStrategyDetailResponse = z.infer<typeof TgStrategyDetailResponseSchema>;
export type TgCandlesQuery = z.infer<typeof TgCandlesQuerySchema>;
export type TgCandlesResponse = z.infer<typeof TgCandlesResponseSchema>;
export type TgTradesQuery = z.infer<typeof TgTradesQuerySchema>;
export type TgTradesResponse = z.infer<typeof TgTradesResponseSchema>;
export type TgTradeEventsQuery = z.infer<typeof TgTradeEventsQuerySchema>;
export type TgTradeEventsResponse = z.infer<typeof TgTradeEventsResponseSchema>;
export type TgActivityResponse = z.infer<typeof TgActivityResponseSchema>;
