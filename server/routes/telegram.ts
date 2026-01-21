import type { RouteDeps } from "./types";
import { z } from "zod";
import { validateTelegramInitData } from "../telegram/validateInitData";
import { requireTelegramJwt } from "../middleware/requireTelegramJwt";
import { signTelegramJwt, verifyTelegramJwt } from "../telegram/jwt";
import { storage } from "../storage";
import { getPortfolioSummary } from "../app/portfolioService";
import { answerCallbackQuery, editMessageText, sendTelegramMessageWithKeyboard, type InlineKeyboardButton } from "../telegram/botApi";
import { logger } from "../lib/logger";
import rateLimit from "express-rate-limit";
import { TgCandlesQuerySchema, TgStrategiesQuerySchema, TgStrategyDetailQuerySchema, TgTradeEventsQuerySchema, TgTradesQuerySchema } from "@shared/contracts/tg";
import { db } from "../db";
import { simEquitySnapshots, simPositions, simTrades, simTradeEvents, investState } from "@shared/schema";
import { and, desc, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { normalizeTimeframe } from "../marketData/utils";
import { getMarketCandles } from "../app/marketDataService";

const DAY_MS = 86_400_000;

const authPayloadSchema = z.object({
  initData: z.string().min(1, "initData is required"),
});

const linkPayloadSchema = z.object({
  initData: z.string().min(1, "initData is required"),
  code: z.string().trim().min(1, "code is required").max(64, "code is too long"),
});

// Rate limiter for /api/telegram/auth: 30/min per IP
const telegramAuthLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, error: { code: "RATE_LIMITED", message: "Too many requests" } },
  validate: { xForwardedForHeader: false },
});

// Rate limiter for /api/telegram/link/confirm: 10/min per IP
const telegramLinkConfirmLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, error: { code: "RATE_LIMITED", message: "Too many requests" } },
  validate: { xForwardedForHeader: false },
});

// Rate limiter for /api/tg/bootstrap: 60/min per IP
const telegramBootstrapLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, error: { code: "RATE_LIMITED", message: "Too many requests" } },
});

// Rate limiter for /api/tg/engine/status: 60/min per telegramUserId
const telegramEngineStatusLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, error: { code: "RATE_LIMITED", message: "Too many requests" } },
  validate: { xForwardedForHeader: false, default: false },
});

function ok<T>(data: T) {
  return { ok: true, data };
}

function fail(code: string, message: string, details?: unknown) {
  return { ok: false, error: { code, message, details } };
}

function downsample<T>(items: T[], maxPoints: number): T[] {
  if (items.length <= maxPoints) {
    return items;
  }

  if (maxPoints <= 2) {
    return [items[0], items[items.length - 1]];
  }

  const result: T[] = [];
  const step = (items.length - 1) / (maxPoints - 1);

  for (let i = 0; i < maxPoints; i += 1) {
    const index = Math.round(i * step);
    result.push(items[index]);
  }

  return result;
}

function toBps(numerator: bigint, denominator: bigint): number {
  if (denominator === 0n) return 0;
  const ratio = Number(numerator) / Number(denominator);
  return Math.round(ratio * 10000);
}

export function registerTelegramRoutes({ app, isAuthenticated, getUserId }: RouteDeps): void {
  // POST /api/telegram/link-token - Generate a new link token
  app.post("/api/telegram/link-token", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const result = await storage.createTelegramLinkToken(userId, 10);

      return res.status(200).json({
        ok: true,
        data: {
          code: result.code,
          expiresAt: result.expiresAt.toISOString(),
        },
      });
    } catch (error) {
      return res.status(500).json({
        ok: false,
        error: {
          code: "INTERNAL_ERROR",
          message: "Failed to create link token",
        },
      });
    }
  });

  app.post("/api/telegram/auth", telegramAuthLimiter, async (req, res) => {
    const parsedBody = authPayloadSchema.safeParse(req.body);
    if (!parsedBody.success) {
      return res.status(400).json({
        ok: false,
        error: {
          code: "INVALID_REQUEST",
          message: "initData is required",
        },
      });
    }

    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    if (!botToken) {
      return res.status(500).json({
        ok: false,
        error: {
          code: "TELEGRAM_BOT_TOKEN_MISSING",
          message: "Telegram bot token not configured",
        },
      });
    }

    if (!process.env.TELEGRAM_JWT_SECRET) {
      return res.status(500).json({
        ok: false,
        error: {
          code: "TELEGRAM_JWT_SECRET_MISSING",
          message: "Telegram JWT secret not configured",
        },
      });
    }

    try {
      const { telegramUserId } = validateTelegramInitData(parsedBody.data.initData, botToken);

      const linkedAccount = await storage.getTelegramAccountByTelegramUserId(telegramUserId);
      const linkedUserId = linkedAccount?.userId ?? null;

      if (!linkedUserId) {
        return res.status(401).json({
          ok: false,
          error: {
            code: "TELEGRAM_NOT_LINKED",
            message: "Telegram account not linked",
          },
        });
      }

      const token = signTelegramJwt({ userId: linkedUserId, telegramUserId });
      const decoded = verifyTelegramJwt(token);
      const expiresAt = decoded.exp ? new Date(decoded.exp * 1000).toISOString() : null;

      return res.status(200).json({
        ok: true,
        data: {
          token,
          expiresAt,
          userId: linkedUserId,
        },
      });
    } catch (_error) {
      return res.status(400).json({
        ok: false,
        error: {
          code: "INVALID_INIT_DATA",
          message: "Invalid init data",
        },
      });
    }
  });

  app.post("/api/telegram/link/confirm", telegramLinkConfirmLimiter, async (req, res) => {
    const parsedBody = linkPayloadSchema.safeParse(req.body);
    if (!parsedBody.success) {
      return res.status(400).json({
        ok: false,
        error: {
          code: "INVALID_REQUEST",
          message: "initData and code are required",
        },
      });
    }

    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    if (!botToken) {
      return res.status(500).json({
        ok: false,
        error: {
          code: "TELEGRAM_BOT_TOKEN_MISSING",
          message: "Telegram bot token not configured",
        },
      });
    }

    try {
      const { telegramUserId } = validateTelegramInitData(parsedBody.data.initData, botToken);
      
      // Try to consume new link token first
      let userId: string | null = null;
      try {
        const tokenResult = await storage.consumeTelegramLinkToken(parsedBody.data.code);
        userId = tokenResult.userId;
      } catch (tokenError) {
        // If token not found/expired/used, try legacy fallback
        if (tokenError instanceof Error && 
            (tokenError.message === "INVALID_CODE" || 
             tokenError.message === "CODE_EXPIRED" || 
             tokenError.message === "CODE_ALREADY_USED")) {
          // Fallback to legacy antiPhishingCode
          const user = await storage.getUserByTelegramLinkCode(parsedBody.data.code);
          if (user) {
            userId = user.id;
          } else {
            return res.status(400).json({
              ok: false,
              error: {
                code: "INVALID_CODE",
                message: "Invalid or expired link code",
              },
            });
          }
        } else {
          throw tokenError;
        }
      }

      if (!userId) {
        return res.status(400).json({
          ok: false,
          error: {
            code: "INVALID_CODE",
            message: "Invalid link code",
          },
        });
      }

      const existingAccount = await storage.getTelegramAccountByTelegramUserId(telegramUserId);
      if (existingAccount && existingAccount.userId !== userId) {
        return res.status(409).json({
          ok: false,
          error: {
            code: "TELEGRAM_ALREADY_LINKED",
            message: "Telegram account already linked to another user",
          },
        });
      }

      await storage.upsertTelegramAccount(userId, telegramUserId);

      return res.status(200).json({
        ok: true,
        data: {
          userId,
        },
      });
    } catch (_error) {
      return res.status(400).json({
        ok: false,
        error: {
          code: "INVALID_INIT_DATA",
          message: "Invalid init data",
        },
      });
    }
  });

  app.get("/api/tg/bootstrap", telegramBootstrapLimiter, requireTelegramJwt, async (req, res) => {
    try {
      const userId = res.locals.userId as string | undefined;
      if (!userId) {
        return res.status(401).json({
          ok: false,
          error: {
            code: "TELEGRAM_AUTH_REQUIRED",
            message: "Telegram authorization required",
          },
        });
      }

      const [user, balances, positions, unreadCount, strategies] = await Promise.all([
        storage.getUserById(userId),
        storage.getBalances(userId),
        storage.getPositions(userId),
        storage.getUnreadNotificationCount(userId),
        storage.getStrategies(),
      ]);

      if (!user) {
        return res.status(404).json({
          ok: false,
          error: {
            code: "USER_NOT_FOUND",
            message: "User not found",
          },
        });
      }

      const strategyMap = new Map(strategies.map((strategy) => [strategy.id, strategy.name]));

      return res.status(200).json({
        ok: true,
        data: {
          user: {
            id: user.id,
            email: user.email ?? undefined,
          },
          balances,
          positions: positions.map((position) => ({
            id: position.id,
            strategyId: position.strategyId,
            strategyName: strategyMap.get(position.strategyId) ?? "Strategy",
            principalMinor: position.principalMinor,
            currentMinor: position.investedCurrentMinor,
          })),
          notifications: {
            unreadCount,
          },
          serverTime: new Date().toISOString(),
        },
      });
    } catch (error) {
      logger.error("Telegram bootstrap error", "telegram-bootstrap", { userId: res.locals.userId }, error);
      return res.status(500).json({
        ok: false,
        error: {
          code: "INTERNAL_ERROR",
          message: "Failed to load Telegram data",
        },
      });
    }
  });

  app.get("/api/tg/engine/status", telegramEngineStatusLimiter, requireTelegramJwt, async (req, res) => {
    try {
      const { engineScheduler } = await import("../app/engineScheduler");
      const health = engineScheduler.getHealth();

      const lastTickAt = health.loops
        .map((loop) => loop.lastTickTs)
        .filter((ts): ts is number => ts !== null)
        .sort((a, b) => b - a)[0] ?? null;

      const lastError = health.loops
        .map((loop) => loop.lastError)
        .filter((err): err is string => err !== null)
        .sort()[0] ?? null;

      let state: "running" | "idle" | "degraded" = health.activeLoops > 0 ? "running" : "idle";
      if (health.activeLoops > 0 && lastError) {
        state = "degraded";
      }

      res.json(ok({
        state,
        lastTickAt,
        activeLoops: health.activeLoops,
        lastError,
        serverTime: new Date().toISOString(),
      }));
    } catch (error) {
      logger.error("Telegram engine status error", "telegram-engine", { userId: res.locals.userId }, error);
      res.status(500).json(fail("INTERNAL_ERROR", "Failed to load engine status"));
    }
  });

  app.get("/api/tg/strategies", requireTelegramJwt, async (req, res) => {
    const userId = res.locals.userId as string | undefined;
    if (!userId) {
      return res.status(401).json(fail("TELEGRAM_AUTH_REQUIRED", "Telegram authorization required"));
    }

    const parsed = TgStrategiesQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json(fail("INVALID_QUERY", "Invalid query", parsed.error.flatten()));
    }

    try {
      const { riskTier, limit = 50, sort } = parsed.data;
      const strategies = await storage.getStrategies();
      const filteredStrategies = riskTier ? strategies.filter((strategy) => strategy.riskTier === riskTier) : strategies;
      const cappedStrategies = filteredStrategies.slice(0, limit);
      const strategyIds = cappedStrategies.map((strategy) => strategy.id);

      if (strategyIds.length === 0) {
        return res.json(ok({ strategies: [], serverTime: new Date().toISOString() }));
      }

      const now = Date.now();
      const thirtyDaysAgo = now - 30 * DAY_MS;
      const twentyFourHoursAgo = now - DAY_MS;

      const [positions, profiles, simPos, states, snapshots, trades24h] = await Promise.all([
        storage.getPositions(userId),
        storage.getStrategyProfiles(),
        db
          .select()
          .from(simPositions)
          .where(and(eq(simPositions.userId, userId), inArray(simPositions.strategyId, strategyIds))),
        db
          .select()
          .from(investState)
          .where(and(eq(investState.userId, userId), inArray(investState.strategyId, strategyIds))),
        db
          .select()
          .from(simEquitySnapshots)
          .where(
            and(
              eq(simEquitySnapshots.userId, userId),
              inArray(simEquitySnapshots.strategyId, strategyIds),
              gte(simEquitySnapshots.ts, thirtyDaysAgo)
            )
          )
          .orderBy(desc(simEquitySnapshots.ts))
          .limit(5000),
        db
          .select({
            strategyId: simTrades.strategyId,
            count: sql<number>`COUNT(*)::int`,
          })
          .from(simTrades)
          .where(
            and(
              eq(simTrades.userId, userId),
              inArray(simTrades.strategyId, strategyIds),
              gte(simTrades.entryTs, twentyFourHoursAgo)
            )
          )
          .groupBy(simTrades.strategyId),
      ]);

      const positionMap = new Map(positions.map((position) => [position.strategyId, position]));
      const profileMap = new Map(profiles.map((profile) => [profile.displayName, profile]));
      const simPosMap = new Map(simPos.map((pos) => [pos.strategyId, pos]));
      const stateMap = new Map(states.map((state) => [state.strategyId, state.state]));
      const trades24hMap = new Map(trades24h.map((trade) => [trade.strategyId, trade.count]));

      const snapshotsByStrategy = new Map<string, typeof snapshots>();
      for (const snapshot of snapshots) {
        if (!snapshotsByStrategy.has(snapshot.strategyId)) {
          snapshotsByStrategy.set(snapshot.strategyId, []);
        }
        snapshotsByStrategy.get(snapshot.strategyId)!.push(snapshot);
      }

      const mapped = cappedStrategies.map((strategy) => {
        const position = positionMap.get(strategy.id);
        const profile = profileMap.get(strategy.name);
        const simPosition = simPosMap.get(strategy.id);
        const snapshotsForStrategy = snapshotsByStrategy.get(strategy.id) || [];
        const equityMinor = position?.investedCurrentMinor ?? snapshotsForStrategy[0]?.equityMinor ?? "0";
        const principalMinor = position?.principalMinor ?? snapshotsForStrategy[0]?.allocatedMinor ?? "0";
        const pnlMinor = (BigInt(equityMinor) - BigInt(principalMinor)).toString();

        let roi30dBps = 0;
        let maxDrawdown30dBps = 0;

        if (snapshotsForStrategy.length >= 2) {
          const sorted = [...snapshotsForStrategy].sort((a, b) => a.ts - b.ts);
          const firstEquity = BigInt(sorted[0].equityMinor || "0");
          const lastEquity = BigInt(sorted[sorted.length - 1].equityMinor || "0");
          roi30dBps = toBps(lastEquity - firstEquity, firstEquity);

          let peak = BigInt(0);
          let maxDrawdown = 0;
          for (const snapshot of sorted) {
            const equity = BigInt(snapshot.equityMinor || "0");
            if (equity > peak) {
              peak = equity;
            }
            if (peak > 0n) {
              const drawdown = Number(peak - equity) / Number(peak);
              if (drawdown > maxDrawdown) {
                maxDrawdown = drawdown;
              }
            }
          }
          maxDrawdown30dBps = Math.round(maxDrawdown * 10000);
        }

        const sparklineRaw = [...snapshotsForStrategy].sort((a, b) => a.ts - b.ts).map((snapshot) => ({
          ts: snapshot.ts,
          equityMinor: snapshot.equityMinor,
        }));

        return {
          id: strategy.id,
          name: strategy.name,
          riskTier: strategy.riskTier,
          symbol: simPosition?.symbol ?? profile?.symbol ?? null,
          timeframe: simPosition?.timeframe ?? profile?.timeframe ?? null,
          state: stateMap.get(strategy.id) ?? "NOT_INVESTED",
          equityMinor,
          pnlMinor,
          roi30dBps,
          maxDrawdown30dBps,
          trades24h: trades24hMap.get(strategy.id) ?? 0,
          sparkline: downsample(sparklineRaw, 30),
        };
      });

      const sorted = sort
        ? [...mapped].sort((a, b) => {
            switch (sort) {
              case "roi30d":
                return b.roi30dBps - a.roi30dBps;
              case "drawdown30d":
                return b.maxDrawdown30dBps - a.maxDrawdown30dBps;
              case "trades24h":
                return b.trades24h - a.trades24h;
              case "equity":
              default:
                return Number(BigInt(b.equityMinor) - BigInt(a.equityMinor));
            }
          })
        : mapped;

      res.json(ok({ strategies: sorted, serverTime: new Date().toISOString() }));
    } catch (error) {
      logger.error("Telegram strategies error", "telegram-strategies", { userId }, error);
      res.status(500).json(fail("INTERNAL_ERROR", "Failed to load strategies"));
    }
  });

  app.get("/api/tg/strategies/:id", requireTelegramJwt, async (req, res) => {
    const userId = res.locals.userId as string | undefined;
    if (!userId) {
      return res.status(401).json(fail("TELEGRAM_AUTH_REQUIRED", "Telegram authorization required"));
    }

    const parsed = TgStrategyDetailQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json(fail("INVALID_QUERY", "Invalid query", parsed.error.flatten()));
    }

    try {
      const strategy = await storage.getStrategy(req.params.id);
      if (!strategy) {
        return res.status(404).json(fail("NOT_FOUND", "Strategy not found"));
      }

      const periodDays = parsed.data.periodDays ?? 30;
      const now = Date.now();
      const fromTs = now - periodDays * DAY_MS;
      const twentyFourHoursAgo = now - DAY_MS;

      const [profiles, position, simPosition, state, snapshots, trades24h] = await Promise.all([
        storage.getStrategyProfiles(),
        storage.getPosition(userId, strategy.id),
        db
          .select()
          .from(simPositions)
          .where(and(eq(simPositions.userId, userId), eq(simPositions.strategyId, strategy.id))),
        db
          .select()
          .from(investState)
          .where(and(eq(investState.userId, userId), eq(investState.strategyId, strategy.id))),
        storage.getSimEquitySnapshots(userId, strategy.id, fromTs, now),
        db
          .select({
            count: sql<number>`COUNT(*)::int`,
          })
          .from(simTrades)
          .where(
            and(
              eq(simTrades.userId, userId),
              eq(simTrades.strategyId, strategy.id),
              gte(simTrades.entryTs, twentyFourHoursAgo)
            )
          ),
      ]);

      const profile = profiles.find((item) => item.displayName === strategy.name) ?? null;
      const simPosData = simPosition[0];
      const equityMinor = position?.investedCurrentMinor ?? snapshots[0]?.equityMinor ?? "0";
      const allocatedMinor = position?.principalMinor ?? snapshots[0]?.allocatedMinor ?? "0";
      const pnlMinor = (BigInt(equityMinor) - BigInt(allocatedMinor)).toString();
      const stateValue = state[0]?.state ?? "NOT_INVESTED";

      let roi30dBps = 0;
      let maxDrawdown30dBps = 0;
      const sortedSnapshots = [...snapshots].sort((a, b) => a.ts - b.ts);
      if (sortedSnapshots.length >= 2) {
        const firstEquity = BigInt(sortedSnapshots[0].equityMinor || "0");
        const lastEquity = BigInt(sortedSnapshots[sortedSnapshots.length - 1].equityMinor || "0");
        roi30dBps = toBps(lastEquity - firstEquity, firstEquity);

        let peak = BigInt(0);
        let maxDrawdown = 0;
        for (const snapshot of sortedSnapshots) {
          const equity = BigInt(snapshot.equityMinor || "0");
          if (equity > peak) {
            peak = equity;
          }
          if (peak > 0n) {
            const drawdown = Number(peak - equity) / Number(peak);
            if (drawdown > maxDrawdown) {
              maxDrawdown = drawdown;
            }
          }
        }
        maxDrawdown30dBps = Math.round(maxDrawdown * 10000);
      }

      const equitySeries = downsample(
        sortedSnapshots.map((snapshot) => ({
          ts: snapshot.ts,
          equityMinor: snapshot.equityMinor,
        })),
        200
      );

      res.json(ok({
        strategy: {
          id: strategy.id,
          name: strategy.name,
          riskTier: strategy.riskTier,
          symbol: simPosData?.symbol ?? profile?.symbol ?? null,
          timeframe: simPosData?.timeframe ?? profile?.timeframe ?? null,
        },
        state: stateValue,
        allocatedMinor,
        equityMinor,
        pnlMinor,
        roi30dBps,
        maxDrawdown30dBps,
        trades24h: trades24h[0]?.count ?? 0,
        equitySeries,
        lastSnapshotTs: sortedSnapshots[sortedSnapshots.length - 1]?.ts ?? null,
      }));
    } catch (error) {
      logger.error("Telegram strategy detail error", "telegram-strategy-detail", { userId, strategyId: req.params.id }, error);
      res.status(500).json(fail("INTERNAL_ERROR", "Failed to load strategy"));
    }
  });

  app.get("/api/tg/strategies/:id/candles", requireTelegramJwt, async (req, res) => {
    const userId = res.locals.userId as string | undefined;
    if (!userId) {
      return res.status(401).json(fail("TELEGRAM_AUTH_REQUIRED", "Telegram authorization required"));
    }

    const parsed = TgCandlesQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json(fail("INVALID_QUERY", "Invalid query", parsed.error.flatten()));
    }

    try {
      const strategy = await storage.getStrategy(req.params.id);
      if (!strategy) {
        return res.status(404).json(fail("NOT_FOUND", "Strategy not found"));
      }

      const profiles = await storage.getStrategyProfiles();
      const profile = profiles.find((item) => item.displayName === strategy.name);
      if (!profile) {
        return res.status(404).json(fail("NOT_FOUND", "Strategy profile not found"));
      }

      const periodDays = parsed.data.periodDays ?? 7;
      const limit = Math.min(parsed.data.limit ?? 200, 600);
      const endMs = Date.now();
      const startMs = endMs - periodDays * DAY_MS;
      const timeframe = normalizeTimeframe(profile.timeframe);

      const result = await getMarketCandles({
        exchange: "synthetic",
        symbol: profile.symbol,
        timeframe,
        fromTs: startMs,
        toTs: endMs,
        userId,
        strategyId: strategy.id,
        maxCandles: Math.max(limit, 200),
      });

      const candles = downsample(result.candles, limit);

      res.json(ok({
        candles,
        symbol: profile.symbol,
        timeframe,
        periodDays,
      }));
    } catch (error) {
      logger.error("Telegram candles error", "telegram-candles", { userId, strategyId: req.params.id }, error);
      res.status(500).json(fail("INTERNAL_ERROR", "Failed to load candles"));
    }
  });

  app.get("/api/tg/strategies/:id/trades", requireTelegramJwt, async (req, res) => {
    const userId = res.locals.userId as string | undefined;
    if (!userId) {
      return res.status(401).json(fail("TELEGRAM_AUTH_REQUIRED", "Telegram authorization required"));
    }

    const parsed = TgTradesQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json(fail("INVALID_QUERY", "Invalid query", parsed.error.flatten()));
    }

    try {
      const strategy = await storage.getStrategy(req.params.id);
      if (!strategy) {
        return res.status(404).json(fail("NOT_FOUND", "Strategy not found"));
      }

      const periodDays = parsed.data.periodDays ?? 30;
      const limit = Math.min(parsed.data.limit ?? 20, 50);
      const now = Date.now();
      const fromTs = now - periodDays * DAY_MS;

      const { trades, nextCursor } = await storage.getSimTrades(userId, strategy.id, fromTs, now, limit, parsed.data.cursor);

      res.json(ok({
        trades: trades.map((trade) => ({
          id: trade.id,
          strategyId: trade.strategyId,
          symbol: trade.symbol,
          side: trade.side,
          status: trade.status,
          entryTs: trade.entryTs ?? null,
          exitTs: trade.exitTs ?? null,
          entryPrice: trade.entryPrice ?? null,
          exitPrice: trade.exitPrice ?? null,
          qty: trade.qty,
          grossPnlMinor: trade.grossPnlMinor ?? "0",
          feesMinor: trade.feesMinor ?? "0",
          netPnlMinor: trade.netPnlMinor ?? "0",
          holdBars: trade.holdBars ?? null,
          reason: trade.reason ?? null,
        })),
        nextCursor,
      }));
    } catch (error) {
      logger.error("Telegram trades error", "telegram-trades", { userId, strategyId: req.params.id }, error);
      res.status(500).json(fail("INTERNAL_ERROR", "Failed to load trades"));
    }
  });

  app.get("/api/tg/strategies/:id/trade-events", requireTelegramJwt, async (req, res) => {
    const userId = res.locals.userId as string | undefined;
    if (!userId) {
      return res.status(401).json(fail("TELEGRAM_AUTH_REQUIRED", "Telegram authorization required"));
    }

    const parsed = TgTradeEventsQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json(fail("INVALID_QUERY", "Invalid query", parsed.error.flatten()));
    }

    try {
      const { tradeId, limit = 200 } = parsed.data;
      const [trade] = await db
        .select()
        .from(simTrades)
        .where(and(eq(simTrades.id, tradeId), eq(simTrades.userId, userId)))
        .limit(1);

      if (!trade) {
        return res.status(404).json(fail("NOT_FOUND", "Trade not found"));
      }

      const events = await storage.getSimTradeEvents(tradeId);
      const limited = events.slice(0, limit);

      res.json(ok({
        events: limited.map((event) => ({
          id: event.id,
          tradeId: event.tradeId,
          strategyId: event.strategyId,
          type: event.type,
          ts: event.ts,
          payloadJson: event.payloadJson ?? null,
        })),
      }));
    } catch (error) {
      logger.error("Telegram trade events error", "telegram-trade-events", { userId, strategyId: req.params.id }, error);
      res.status(500).json(fail("INTERNAL_ERROR", "Failed to load trade events"));
    }
  });

  app.get("/api/tg/activity", requireTelegramJwt, async (req, res) => {
    const userId = res.locals.userId as string | undefined;
    if (!userId) {
      return res.status(401).json(fail("TELEGRAM_AUTH_REQUIRED", "Telegram authorization required"));
    }

    try {
      const [trades, unreadCount, strategies] = await Promise.all([
        db
          .select()
          .from(simTrades)
          .where(eq(simTrades.userId, userId))
          .orderBy(desc(simTrades.exitTs))
          .limit(30),
        storage.getUnreadNotificationCount(userId),
        storage.getStrategies(),
      ]);

      const strategyMap = new Map(strategies.map((strategy) => [strategy.id, strategy.name]));

      res.json(ok({
        trades: trades.map((trade) => ({
          id: trade.id,
          strategyId: trade.strategyId,
          strategyName: strategyMap.get(trade.strategyId) ?? "Strategy",
          symbol: trade.symbol,
          side: trade.side,
          exitTs: trade.exitTs ?? null,
          netPnlMinor: trade.netPnlMinor ?? "0",
        })),
        notifications: {
          unreadCount,
        },
        serverTime: new Date().toISOString(),
      }));
    } catch (error) {
      logger.error("Telegram activity error", "telegram-activity", { userId }, error);
      res.status(500).json(fail("INTERNAL_ERROR", "Failed to load activity"));
    }
  });

  app.get("/api/telegram/notifications/status", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const [prefs, account] = await Promise.all([
        storage.getNotificationPreferences(userId),
        storage.getTelegramAccountByUserId(userId),
      ]);

      res.json({
        linked: Boolean(account),
        enabled: prefs.telegramEnabled,
      });
    } catch (error) {
      logger.error("Telegram notification status error", "telegram-notifications", { userId: getUserId(req) }, error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/telegram/notifications/enable", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const account = await storage.getTelegramAccountByUserId(userId);
      if (!account) {
        return res.status(400).json({
          ok: false,
          error: {
            code: "TELEGRAM_NOT_LINKED",
            message: "Telegram account not linked",
          },
        });
      }

      const updated = await storage.updateNotificationPreferences(userId, { telegramEnabled: true });
      res.json({ linked: true, enabled: updated.telegramEnabled });
    } catch (error) {
      logger.error("Enable Telegram notifications error", "telegram-notifications", { userId: getUserId(req) }, error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/telegram/notifications/disable", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const updated = await storage.updateNotificationPreferences(userId, { telegramEnabled: false });
      const account = await storage.getTelegramAccountByUserId(userId);
      res.json({ linked: Boolean(account), enabled: updated.telegramEnabled });
    } catch (error) {
      logger.error("Disable Telegram notifications error", "telegram-notifications", { userId: getUserId(req) }, error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // POST /api/telegram/bot/webhook - Telegram Bot webhook for callback queries and commands
  app.post("/api/telegram/bot/webhook", async (req, res) => {
    try {
      // Security check: in production, require X-Telegram-Bot-Api-Secret-Token header
      if (process.env.NODE_ENV === "production") {
        const webhookSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
        if (!webhookSecret) {
          logger.error("TELEGRAM_WEBHOOK_SECRET not configured in production", "telegram-webhook");
          return res.status(500).json({ ok: false, error: "Webhook not configured" });
        }

        const providedSecret = req.headers["x-telegram-bot-api-secret-token"] as string | undefined;
        if (providedSecret !== webhookSecret) {
          logger.warn("Invalid webhook secret", "telegram-webhook", { provided: !!providedSecret });
          return res.status(401).json({ ok: false, error: "Unauthorized" });
        }
      }

      const update = req.body as {
        update_id?: number;
        message?: {
          message_id: number;
          from?: { id: number; username?: string; first_name?: string };
          chat: { id: number; type: string };
          text?: string;
        };
        callback_query?: {
          id: string;
          from: { id: number; username?: string; first_name?: string };
          message?: {
            message_id: number;
            chat: { id: number };
          };
          data?: string;
        };
      };

      // Handle callback_query
      if (update.callback_query) {
        const { callback_query } = update;
        const telegramUserId = String(callback_query.from.id);
        const callbackQueryId = callback_query.id;
        const messageId = callback_query.message?.message_id;
        const chatId = callback_query.message?.chat.id;

        // Always answer callback query to remove loading state
        try {
          await answerCallbackQuery(callbackQueryId);
        } catch (error) {
          logger.error("Failed to answer callback query", "telegram-webhook", { callbackQueryId }, error);
        }

        // Parse callback data: format "a:<token>"
        const data = callback_query.data;
        if (!data || !data.startsWith("a:")) {
          logger.warn("Invalid callback data format", "telegram-webhook", { data });
          return res.status(200).json({ ok: true });
        }

        const token = data.slice(2); // Remove "a:" prefix

        try {
          // Consume action token
          const tokenResult = await storage.consumeTelegramActionToken(token, telegramUserId);
          const { action, userId } = tokenResult;

          // Handle REFRESH action
          if (action === "REFRESH" && messageId && chatId) {
            // Get portfolio summary
            const [balances, positions, unreadCount] = await Promise.all([
              storage.getBalances(userId),
              storage.getPositions(userId),
              storage.getUnreadNotificationCount(userId),
            ]);

            const usdtBalance = balances.find((b) => b.asset === "USDT");
            const balanceAvailable = BigInt(usdtBalance?.available ?? "0");
            const balanceFormatted = (Number(balanceAvailable) / 1_000_000).toFixed(2);

            // Format summary message (using HTML for simpler formatting)
            const summaryText = [
              "📊 <b>Portfolio Summary</b>",
              "",
              `💰 Available: ${balanceFormatted} USDT`,
              `📈 Positions: ${positions.length}`,
              `🔔 Unread: ${unreadCount}`,
            ].join("\n");

            // Create new action token for refresh button
            const webappUrl = process.env.TELEGRAM_PUBLIC_WEBAPP_URL || "https://example.com/tg";
            const refreshToken = await storage.createTelegramActionToken({
              telegramUserId,
              userId,
              action: "REFRESH",
              ttlSeconds: 300,
            });

            const keyboard: InlineKeyboardButton[][] = [
              [
                { text: "🔄 Refresh", callback_data: `a:${refreshToken.token}` },
                { text: "📱 Open App", web_app: { url: webappUrl } },
              ],
            ];

            // Edit message with updated summary
            await editMessageText(String(chatId), messageId, summaryText, {
              parseMode: "HTML",
              replyMarkup: { inline_keyboard: keyboard },
            });
          }
        } catch (error) {
          if (error instanceof Error) {
            if (error.message === "INVALID_TOKEN" || error.message === "TOKEN_EXPIRED" || error.message === "TOKEN_ALREADY_USED" || error.message === "TOKEN_USER_MISMATCH") {
              logger.warn("Invalid action token", "telegram-webhook", { telegramUserId, error: error.message });
              return res.status(200).json({ ok: true });
            }
          }
          logger.error("Error processing callback query", "telegram-webhook", { telegramUserId }, error);
        }

        return res.status(200).json({ ok: true });
      }

      // Handle message /start
      if (update.message?.text === "/start") {
        const telegramUserId = String(update.message.from?.id);
        const chatId = update.message.chat.id;

        if (!telegramUserId || !chatId) {
          return res.status(400).json({ ok: false, error: "Invalid message" });
        }

        // Find linked account
        const account = await storage.getTelegramAccountByTelegramUserId(telegramUserId);
        if (!account) {
          const welcomeText = "👋 Welcome! Please link your account first using the web app.";
          await sendTelegramMessageWithKeyboard(String(chatId), welcomeText);
          return res.status(200).json({ ok: true });
        }

        // Get portfolio summary
        const [balances, positions, unreadCount] = await Promise.all([
          storage.getBalances(account.userId),
          storage.getPositions(account.userId),
          storage.getUnreadNotificationCount(account.userId),
        ]);

        const usdtBalance = balances.find((b) => b.asset === "USDT");
        const balanceAvailable = BigInt(usdtBalance?.available ?? "0");
        const balanceFormatted = (Number(balanceAvailable) / 1_000_000).toFixed(2);

        // Format welcome message (using HTML for simpler formatting)
        const welcomeText = [
          "👋 <b>Welcome to your Portfolio!</b>",
          "",
          `💰 Available: ${balanceFormatted} USDT`,
          `📈 Positions: ${positions.length}`,
          `🔔 Unread: ${unreadCount}`,
        ].join("\n");

        // Create action token for refresh button
        const refreshToken = await storage.createTelegramActionToken({
          telegramUserId,
          userId: account.userId,
          action: "REFRESH",
          ttlSeconds: 300,
        });

        const webappUrl = process.env.TELEGRAM_PUBLIC_WEBAPP_URL || "https://example.com/tg";
        const keyboard: InlineKeyboardButton[][] = [
          [
            { text: "🔄 Refresh", callback_data: `a:${refreshToken.token}` },
            { text: "📱 Open App", web_app: { url: webappUrl } },
          ],
        ];

        await sendTelegramMessageWithKeyboard(String(chatId), welcomeText, {
          parseMode: "HTML",
          replyMarkup: { inline_keyboard: keyboard },
        });

        return res.status(200).json({ ok: true });
      }

      // Unknown update type
      return res.status(200).json({ ok: true });
    } catch (error) {
      logger.error("Webhook error", "telegram-webhook", {}, error);
      return res.status(500).json({ ok: false, error: "Internal server error" });
    }
  });
}
