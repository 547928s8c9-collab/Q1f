import { db } from "./db";
import { eq, and, desc, gte, or, ilike, lte, lt, sql, inArray } from "drizzle-orm";
import {
  balances,
  vaults,
  strategies,
  strategyPerformance,
  positions,
  operations,
  portfolioSeries,
  strategySeries,
  quotes,
  securitySettings,
  whitelistAddresses,
  payoutInstructions,
  redemptionRequests,
  consents,
  auditLogs,
  kycApplicants,
  notifications,
  idempotencyKeys,
  marketCandles,
  AddressStatus,
  dbRowToCandle,
  // Admin tables
  roles,
  permissions,
  rolePermissions,
  type Balance,
  type InsertBalance,
  type Vault,
  type InsertVault,
  type Strategy,
  type InsertStrategy,
  type StrategyPerformance,
  type InsertStrategyPerformance,
  type Position,
  type InsertPosition,
  type Operation,
  type InsertOperation,
  type PortfolioSeries,
  type InsertPortfolioSeries,
  type StrategySeries,
  type InsertStrategySeries,
  type Quote,
  type InsertQuote,
  type SecuritySettings,
  type InsertSecuritySettings,
  type WhitelistAddress,
  type InsertWhitelistAddress,
  type PayoutInstruction,
  type InsertPayoutInstruction,
  type RedemptionRequest,
  type InsertRedemptionRequest,
  type Consent,
  type InsertConsent,
  type AuditLog,
  type InsertAuditLog,
  type KycApplicant,
  type InsertKycApplicant,
  type Notification,
  type InsertNotification,
  type NotificationPreferences,
  type UpdateNotificationPreferences,
  notificationPreferences,
  twoFactor,
  type TwoFactor,
  type IdempotencyKey,
  type InsertIdempotencyKey,
  type Candle,
} from "@shared/schema";

export interface IStorage {
  ensureUserData(userId: string): Promise<void>;
  seedDemoUserData(userId: string): Promise<void>;

  getBalances(userId: string): Promise<Balance[]>;
  getBalance(userId: string, asset: string): Promise<Balance | undefined>;
  updateBalance(userId: string, asset: string, available: string, locked: string): Promise<Balance>;

  getVaults(userId: string): Promise<Vault[]>;
  getVault(userId: string, type: string): Promise<Vault | undefined>;
  updateVault(userId: string, type: string, balance: string): Promise<Vault>;
  updateVaultGoal(userId: string, type: string, updates: {
    goalName?: string | null;
    goalAmount?: string | null;
    autoSweepPct?: number;
    autoSweepEnabled?: boolean;
  }): Promise<Vault>;

  getStrategies(): Promise<Strategy[]>;
  getStrategy(id: string): Promise<Strategy | undefined>;
  createStrategy(strategy: InsertStrategy): Promise<Strategy>;
  
  getStrategyPerformance(strategyId: string, days?: number): Promise<StrategyPerformance[]>;
  createStrategyPerformance(perf: InsertStrategyPerformance): Promise<StrategyPerformance>;
  seedStrategies(): Promise<void>;

  getPositions(userId: string): Promise<Position[]>;
  getPosition(userId: string, strategyId: string): Promise<Position | undefined>;
  createPosition(position: InsertPosition): Promise<Position>;
  updatePosition(id: string, updates: Partial<Position>): Promise<Position | undefined>;

  getOperations(userId: string, filter?: string, q?: string, cursor?: string, limit?: number): Promise<{ operations: Operation[]; nextCursor?: string }>;
  getOperationsByDate(userId: string, start: Date, end: Date): Promise<Operation[]>;
  getOperation(id: string): Promise<Operation | undefined>;
  createOperation(operation: InsertOperation): Promise<Operation>;
  updateOperation(id: string, updates: Partial<Operation>): Promise<Operation | undefined>;

  getPortfolioSeries(userId: string, days?: number): Promise<PortfolioSeries[]>;
  createPortfolioSeries(series: InsertPortfolioSeries): Promise<PortfolioSeries>;

  getStrategySeries(strategyId: string, days?: number): Promise<StrategySeries[]>;
  createStrategySeries(series: InsertStrategySeries): Promise<StrategySeries>;

  getQuotes(pair: string, days?: number): Promise<Quote[]>;
  getLatestQuote(pair: string): Promise<Quote | undefined>;
  createQuote(quote: InsertQuote): Promise<Quote>;

  getSecuritySettings(userId: string): Promise<SecuritySettings | undefined>;
  updateSecuritySettings(userId: string, updates: Partial<SecuritySettings>): Promise<SecuritySettings>;

  getWhitelistAddresses(userId: string): Promise<WhitelistAddress[]>;
  getWhitelistAddress(id: string): Promise<WhitelistAddress | undefined>;
  createWhitelistAddress(address: InsertWhitelistAddress): Promise<WhitelistAddress>;
  updateWhitelistAddress(id: string, updates: Partial<WhitelistAddress>): Promise<WhitelistAddress | undefined>;
  deleteWhitelistAddress(id: string): Promise<void>;

  getLatestConsent(userId: string, documentType: string): Promise<Consent | undefined>;
  getUserConsents(userId: string): Promise<Consent[]>;
  createConsent(consent: InsertConsent): Promise<Consent>;

  createAuditLog(log: InsertAuditLog): Promise<AuditLog>;
  getAuditLogs(userId: string, limit?: number): Promise<AuditLog[]>;

  // KYC Applicants
  getKycApplicant(userId: string): Promise<KycApplicant | undefined>;
  getKycApplicantByProviderRef(providerRef: string): Promise<KycApplicant | undefined>;
  createKycApplicant(applicant: InsertKycApplicant): Promise<KycApplicant>;
  updateKycApplicant(userId: string, updates: Partial<KycApplicant>): Promise<KycApplicant | undefined>;
  upsertKycApplicant(userId: string, data: Partial<InsertKycApplicant>): Promise<KycApplicant>;

  // Notifications
  getNotifications(userId: string, unreadOnly?: boolean, limit?: number): Promise<Notification[]>;
  getNotification(id: string): Promise<Notification | undefined>;
  getUnreadNotificationCount(userId: string): Promise<number>;
  createNotification(notification: InsertNotification): Promise<Notification>;
  markNotificationRead(id: string): Promise<Notification | undefined>;
  markAllNotificationsRead(userId: string): Promise<void>;

  // Notification Preferences
  getNotificationPreferences(userId: string): Promise<NotificationPreferences>;
  updateNotificationPreferences(userId: string, patch: UpdateNotificationPreferences): Promise<NotificationPreferences>;

  // Two Factor Authentication
  getTwoFactor(userId: string): Promise<TwoFactor | undefined>;
  upsertTwoFactor(userId: string, secretEncrypted: string): Promise<TwoFactor>;
  enableTwoFactor(userId: string): Promise<TwoFactor | undefined>;
  disableTwoFactor(userId: string): Promise<TwoFactor | undefined>;

  // Payout Instructions
  getPayoutInstruction(userId: string, strategyId: string): Promise<PayoutInstruction | undefined>;
  getPayoutInstructions(userId: string): Promise<PayoutInstruction[]>;
  upsertPayoutInstruction(instruction: InsertPayoutInstruction): Promise<PayoutInstruction>;
  getActivePayoutInstructionsByFrequency(frequency: string): Promise<PayoutInstruction[]>;

  // Active whitelist addresses
  getActiveWhitelistAddresses(userId: string): Promise<WhitelistAddress[]>;

  // Redemption Requests
  getRedemptionRequests(userId: string, strategyId?: string): Promise<RedemptionRequest[]>;
  createRedemptionRequest(request: InsertRedemptionRequest): Promise<RedemptionRequest>;
  updateRedemptionRequest(id: string, updates: Partial<RedemptionRequest>): Promise<RedemptionRequest | undefined>;
  getPendingRedemptionsDue(): Promise<RedemptionRequest[]>;

  // All positions (for jobs)
  getAllPositions(): Promise<Position[]>;

  // Idempotency Keys
  getIdempotencyKey(userId: string, key: string, endpoint: string): Promise<IdempotencyKey | undefined>;
  createIdempotencyKey(data: InsertIdempotencyKey): Promise<IdempotencyKey>;
  updateIdempotencyKey(id: string, updates: { operationId?: string | null; responseStatus?: number | null; responseBody?: any }): Promise<void>;

  // Market Candles
  getCandlesFromCache(exchange: string, symbol: string, timeframe: string, startMs: number, endMs: number): Promise<Candle[]>;
  upsertCandles(exchange: string, symbol: string, timeframe: string, candles: Candle[]): Promise<void>;
}

export class DatabaseStorage implements IStorage {
  async ensureUserData(userId: string): Promise<void> {
    // Check if user data already exists
    const existingBalances = await this.getBalances(userId);
    if (existingBalances.length > 0) {
      return; // User data already initialized
    }

    // Initialize default balances
    await db.insert(balances).values([
      { userId, asset: "USDT", available: "0", locked: "0" },
      { userId, asset: "RUB", available: "0", locked: "0" },
    ]).onConflictDoNothing();

    // Initialize default vaults
    await db.insert(vaults).values([
      { userId, type: "principal", asset: "USDT", balance: "0" },
      { userId, type: "profit", asset: "USDT", balance: "0" },
      { userId, type: "taxes", asset: "USDT", balance: "0" },
    ]).onConflictDoNothing();

    // Initialize security settings
    await db.insert(securitySettings).values({
      userId,
      consentAccepted: false,
      kycStatus: "pending",
      twoFactorEnabled: false,
      whitelistEnabled: false,
      addressDelay: 0,
      autoSweepEnabled: false,
    }).onConflictDoNothing();
  }

  async seedDemoUserData(userId: string): Promise<void> {
    // Check if demo data already exists
    const existingPositions = await this.getPositions(userId);
    if (existingPositions.length > 0) {
      return; // Demo data already seeded
    }

    // Get available strategies
    const allStrategies = await this.getStrategies();
    if (allStrategies.length === 0) return;

    // Pick 3 strategies for demo positions
    const selectedStrategies = allStrategies.slice(0, 3);
    const now = new Date();
    const today = now.toISOString().split("T")[0];

    // Investment amounts for each strategy (in minor units - 6 decimals for USDT)
    const investmentAmounts = [
      5000_000000, // 5,000 USDT in Stable Yield
      3000_000000, // 3,000 USDT in Fixed Income Plus
      2000_000000, // 2,000 USDT in Balanced Growth
    ];

    // Create positions with accumulated profits (simulating ~60 days of investing)
    for (let i = 0; i < selectedStrategies.length; i++) {
      const strategy = selectedStrategies[i];
      const principal = investmentAmounts[i];
      // Simulate ~2 months of returns based on strategy tier
      const monthlyReturnBps = strategy.expectedMonthlyRangeBpsMin || 300;
      const daysInvested = 60;
      // Use integer math: profit = principal * bps * days / (30 * 10000)
      const accumulatedProfit = Math.floor((principal * monthlyReturnBps * daysInvested) / (30 * 10000));
      const currentValue = principal + accumulatedProfit;

      // Legacy fields use integer USDT (no decimals), minor fields use 6 decimal places
      const principalUsdt = Math.floor(principal / 1000000);
      const currentValueUsdt = Math.floor(currentValue / 1000000);

      await db.insert(positions).values({
        userId,
        strategyId: strategy.id,
        principal: principalUsdt.toString(),
        currentValue: currentValueUsdt.toString(),
        principalMinor: principal.toString(),
        investedCurrentMinor: currentValue.toString(),
        accruedProfitPayableMinor: accumulatedProfit.toString(),
        lastAccrualDate: today,
      });
    }

    // Generate 90 days of portfolio history
    const startingValue = 8000_000000; // Started with 8,000 USDT invested
    const portfolioData: InsertPortfolioSeries[] = [];
    
    for (let i = 90; i >= 0; i--) {
      const date = new Date(now);
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split("T")[0];
      
      // Simulate gradual growth with some volatility
      const daysSinceStart = 90 - i;
      const baseGrowth = daysSinceStart * 0.003; // ~0.3% daily average
      const noise = (Math.sin(daysSinceStart * 0.5) * 0.02) + (Math.random() - 0.5) * 0.01;
      const growthFactor = 1 + baseGrowth + noise;
      
      // Also simulate deposits at day 30 and day 60
      let additionalDeposits = 0;
      if (daysSinceStart >= 30) additionalDeposits += 1000_000000;
      if (daysSinceStart >= 60) additionalDeposits += 1000_000000;
      
      const value = Math.floor((startingValue + additionalDeposits) * growthFactor);
      
      portfolioData.push({
        userId,
        date: dateStr,
        value: value.toString(),
      });
    }

    if (portfolioData.length > 0) {
      await db.insert(portfolioSeries).values(portfolioData).onConflictDoNothing();
    }

    // Create historical operations using raw insert (need to set createdAt/completedAt)
    const day90 = new Date(now);
    day90.setDate(day90.getDate() - 90);
    const day89 = new Date(now);
    day89.setDate(day89.getDate() - 89);
    const day60 = new Date(now);
    day60.setDate(day60.getDate() - 60);
    const day30 = new Date(now);
    day30.setDate(day30.getDate() - 30);
    const day7 = new Date(now);
    day7.setDate(day7.getDate() - 7);

    // Initial deposit 90 days ago
    await db.insert(operations).values({
      userId,
      type: "DEPOSIT_USDT",
      status: "completed",
      asset: "USDT",
      amount: "8000000000",
      fee: "0",
    }).onConflictDoNothing();

    // Update created_at via SQL for the initial deposit
    await db.execute(sql`UPDATE operations SET created_at = ${day90} WHERE user_id = ${userId} AND type = 'DEPOSIT_USDT' AND amount = '8000000000'`);

    // Initial investments 89 days ago
    for (let i = 0; i < selectedStrategies.length; i++) {
      await db.insert(operations).values({
        userId,
        type: "INVEST",
        status: "completed",
        asset: "USDT",
        amount: investmentAmounts[i].toString(),
        strategyId: selectedStrategies[i].id,
        strategyName: selectedStrategies[i].name,
      });
    }
    await db.execute(sql`UPDATE operations SET created_at = ${day89} WHERE user_id = ${userId} AND type = 'INVEST' AND created_at > ${day89}`);

    // Additional deposits
    await db.insert(operations).values({
      userId,
      type: "DEPOSIT_USDT",
      status: "completed",
      asset: "USDT",
      amount: "1000000000",
      fee: "0",
    });
    await db.execute(sql`UPDATE operations SET created_at = ${day60} WHERE user_id = ${userId} AND type = 'DEPOSIT_USDT' AND amount = '1000000000' AND created_at > ${day60}`);

    await db.insert(operations).values({
      userId,
      type: "DEPOSIT_USDT",
      status: "completed",
      asset: "USDT",
      amount: "1000000000",
      fee: "0",
    });
    await db.execute(sql`UPDATE operations SET created_at = ${day30} WHERE user_id = ${userId} AND type = 'DEPOSIT_USDT' AND amount = '1000000000' AND created_at > ${day30}`);

    // Some profit accrual operations (weekly samples)
    for (let week = 1; week <= 8; week++) {
      const accrualDate = new Date(now);
      accrualDate.setDate(accrualDate.getDate() - (90 - week * 7));
      
      for (let i = 0; i < selectedStrategies.length; i++) {
        const weeklyProfit = Math.floor(investmentAmounts[i] * 0.007);
        const op = await db.insert(operations).values({
          userId,
          type: "PROFIT_ACCRUAL",
          status: "completed",
          asset: "USDT",
          amount: weeklyProfit.toString(),
          strategyId: selectedStrategies[i].id,
          strategyName: selectedStrategies[i].name,
        }).returning();
        if (op[0]) {
          await db.execute(sql`UPDATE operations SET created_at = ${accrualDate} WHERE id = ${op[0].id}`);
        }
      }
    }

    // Recent activity - a small withdrawal
    const withdrawOp = await db.insert(operations).values({
      userId,
      type: "WITHDRAW_USDT",
      status: "completed",
      asset: "USDT",
      amount: "500000000",
      fee: "1000000",
      txHash: "0xdemo" + Math.random().toString(36).substring(2, 15),
    }).returning();
    if (withdrawOp[0]) {
      await db.execute(sql`UPDATE operations SET created_at = ${day7} WHERE id = ${withdrawOp[0].id}`);
    }

    // Update vaults with demo values
    await this.updateVault(userId, "principal", "10000000000"); // 10,000 USDT in principal vault
    await this.updateVault(userId, "profit", "850000000"); // 850 USDT accumulated profit
    await this.updateVault(userId, "taxes", "150000000"); // 150 USDT set aside for taxes
  }

  async getBalances(userId: string): Promise<Balance[]> {
    return db.select().from(balances).where(eq(balances.userId, userId));
  }

  async getBalance(userId: string, asset: string): Promise<Balance | undefined> {
    const [balance] = await db.select().from(balances).where(and(eq(balances.userId, userId), eq(balances.asset, asset)));
    return balance;
  }

  async updateBalance(userId: string, asset: string, available: string, locked: string): Promise<Balance> {
    const existing = await this.getBalance(userId, asset);
    if (existing) {
      const [updated] = await db.update(balances).set({ available, locked, updatedAt: new Date() }).where(eq(balances.id, existing.id)).returning();
      return updated;
    } else {
      const [created] = await db.insert(balances).values({ userId, asset, available, locked }).returning();
      return created;
    }
  }

  async getVaults(userId: string): Promise<Vault[]> {
    return db.select().from(vaults).where(eq(vaults.userId, userId));
  }

  async getVault(userId: string, type: string): Promise<Vault | undefined> {
    const [vault] = await db.select().from(vaults).where(and(eq(vaults.userId, userId), eq(vaults.type, type)));
    return vault;
  }

  async updateVault(userId: string, type: string, balance: string): Promise<Vault> {
    const existing = await this.getVault(userId, type);
    if (existing) {
      const [updated] = await db.update(vaults).set({ balance, updatedAt: new Date() }).where(eq(vaults.id, existing.id)).returning();
      return updated;
    } else {
      const [created] = await db.insert(vaults).values({ userId, type, asset: "USDT", balance }).returning();
      return created;
    }
  }

  async updateVaultGoal(userId: string, type: string, updates: {
    goalName?: string | null;
    goalAmount?: string | null;
    autoSweepPct?: number;
    autoSweepEnabled?: boolean;
  }): Promise<Vault> {
    const existing = await this.getVault(userId, type);
    if (existing) {
      const [updated] = await db.update(vaults).set({ ...updates, updatedAt: new Date() }).where(eq(vaults.id, existing.id)).returning();
      return updated;
    } else {
      const [created] = await db.insert(vaults).values({ userId, type, asset: "USDT", balance: "0", ...updates }).returning();
      return created;
    }
  }

  async getStrategies(): Promise<Strategy[]> {
    return db.select().from(strategies).where(eq(strategies.isActive, true));
  }

  async getStrategy(id: string): Promise<Strategy | undefined> {
    const [strategy] = await db.select().from(strategies).where(eq(strategies.id, id));
    return strategy;
  }

  async createStrategy(strategy: InsertStrategy): Promise<Strategy> {
    const [created] = await db.insert(strategies).values(strategy).returning();
    return created;
  }

  async getStrategyPerformance(strategyId: string, days: number = 90): Promise<StrategyPerformance[]> {
    return db.select().from(strategyPerformance)
      .where(eq(strategyPerformance.strategyId, strategyId))
      .orderBy(strategyPerformance.day)
      .limit(days);
  }

  async createStrategyPerformance(perf: InsertStrategyPerformance): Promise<StrategyPerformance> {
    const [created] = await db.insert(strategyPerformance).values(perf).returning();
    return created;
  }

  async seedStrategies(): Promise<void> {
    const existingStrategies = await this.getStrategies();
    if (existingStrategies.length >= 8) return;

    await db.delete(strategies);
    await db.delete(strategyPerformance);

    const strategyData = [
      { name: "Stable Yield", tier: "LOW", desc: "Conservative stablecoin farming with minimal risk", pairs: ["USDT/USDC", "DAI/USDT"], minBps: 200, maxBps: 300, worst: "-0.8%", dd: "-1.2%" },
      { name: "Fixed Income Plus", tier: "LOW", desc: "Enhanced fixed income with diversified lending", pairs: ["USDT/aUSDC", "USDT/cDAI"], minBps: 250, maxBps: 350, worst: "-1.0%", dd: "-1.5%" },
      { name: "Balanced Growth", tier: "CORE", desc: "Balanced approach mixing stable and volatile assets", pairs: ["BTC/USDT", "ETH/USDT"], minBps: 400, maxBps: 500, worst: "-3.5%", dd: "-8.0%" },
      { name: "DeFi Momentum", tier: "CORE", desc: "Momentum-based DeFi token rotation strategy", pairs: ["UNI/USDT", "AAVE/USDT", "LINK/USDT"], minBps: 450, maxBps: 550, worst: "-4.2%", dd: "-10.0%" },
      { name: "Market Neutral", tier: "CORE", desc: "Long-short strategy targeting absolute returns", pairs: ["BTC/USDT", "ETH/USDT"], minBps: 350, maxBps: 450, worst: "-2.8%", dd: "-6.0%" },
      { name: "Alpha Seeker", tier: "HIGH", desc: "Aggressive alpha generation through arbitrage", pairs: ["BTC/USDT", "ETH/USDT", "SOL/USDT"], minBps: 600, maxBps: 700, worst: "-8.0%", dd: "-18.0%" },
      { name: "Volatility Harvester", tier: "HIGH", desc: "Options-based volatility capture strategy", pairs: ["BTC/USDT", "ETH/USDT"], minBps: 650, maxBps: 750, worst: "-10.0%", dd: "-22.0%" },
      { name: "Moonshot Portfolio", tier: "HIGH", desc: "High-conviction altcoin picks for maximum growth", pairs: ["SOL/USDT", "AVAX/USDT", "DOT/USDT"], minBps: 700, maxBps: 800, worst: "-15.0%", dd: "-35.0%" },
    ];

    const baseAmount = 1000000000; // 1000 USDT in minor units

    for (const s of strategyData) {
      const [strategy] = await db.insert(strategies).values({
        name: s.name,
        description: s.desc,
        riskTier: s.tier,
        baseAsset: "USDT",
        pairsJson: s.pairs,
        expectedMonthlyRangeBpsMin: s.minBps,
        expectedMonthlyRangeBpsMax: s.maxBps,
        feesJson: { management: "0.5%", performance: "10%" },
        termsJson: { profitPayout: s.tier === "LOW" ? "DAILY" : "MONTHLY", principalRedemption: "WEEKLY_WINDOW" },
        minInvestment: "100000000",
        worstMonth: s.worst,
        maxDrawdown: s.dd,
        isActive: true,
      }).returning();

      // Generate 90-day performance series
      const dailyDrift = s.tier === "LOW" ? 0.0008 : s.tier === "CORE" ? 0.0015 : 0.0022;
      const volatility = s.tier === "LOW" ? 0.002 : s.tier === "CORE" ? 0.008 : 0.015;
      
      let equity = baseAmount;
      let btcBenchmark = baseAmount;
      let ethBenchmark = baseAmount;
      
      const today = new Date();
      
      for (let day = 1; day <= 90; day++) {
        const date = new Date(today);
        date.setDate(date.getDate() - (90 - day));
        const dateStr = date.toISOString().split("T")[0];
        
        // Seeded random for deterministic results
        const seed = strategy.id.charCodeAt(0) + day;
        const rand1 = Math.sin(seed * 9999) * 10000;
        const rand2 = Math.sin(seed * 7777) * 10000;
        const random = (rand1 - Math.floor(rand1)) * 2 - 1;
        
        // Add drawdown days for HIGH tier
        const isDrawdownDay = s.tier === "HIGH" && day % 15 === 0;
        const dailyReturn = isDrawdownDay ? -volatility * 2 : dailyDrift + random * volatility;
        
        equity = Math.round(equity * (1 + dailyReturn));
        btcBenchmark = Math.round(btcBenchmark * (1 + 0.001 + (rand2 - Math.floor(rand2)) * 0.015 - 0.0075));
        ethBenchmark = Math.round(ethBenchmark * (1 + 0.0012 + (rand1 - Math.floor(rand1)) * 0.018 - 0.009));
        
        await db.insert(strategyPerformance).values({
          strategyId: strategy.id,
          day,
          date: dateStr,
          equityMinor: equity.toString(),
          benchmarkBtcMinor: btcBenchmark.toString(),
          benchmarkEthMinor: ethBenchmark.toString(),
        });
      }
    }
  }

  async getPositions(userId: string): Promise<Position[]> {
    return db.select().from(positions).where(eq(positions.userId, userId));
  }

  async getPosition(userId: string, strategyId: string): Promise<Position | undefined> {
    const [position] = await db.select().from(positions).where(and(eq(positions.userId, userId), eq(positions.strategyId, strategyId)));
    return position;
  }

  async createPosition(position: InsertPosition): Promise<Position> {
    const [created] = await db.insert(positions).values(position).returning();
    return created;
  }

  async updatePosition(id: string, updates: Partial<Position>): Promise<Position | undefined> {
    const [updated] = await db.update(positions).set({ ...updates, updatedAt: new Date() }).where(eq(positions.id, id)).returning();
    return updated;
  }

  async getOperations(userId: string, filter?: string, q?: string, cursor?: string, limit: number = 50): Promise<{ operations: Operation[]; nextCursor?: string }> {
    // Build WHERE conditions at DB level
    const conditions: ReturnType<typeof eq>[] = [eq(operations.userId, userId)];
    
    // Filter by types
    if (filter && filter !== "all") {
      const types = filter.split(",");
      conditions.push(inArray(operations.type, types));
    }
    
    // Search query - use ilike for text matching
    if (q) {
      const pattern = `%${q}%`;
      conditions.push(
        or(
          ilike(operations.type, pattern),
          ilike(operations.status, pattern),
          ilike(operations.amount, pattern),
          ilike(operations.txHash, pattern),
          ilike(operations.providerRef, pattern),
          ilike(operations.strategyName, pattern)
        )!
      );
    }
    
    const results = await db.select()
      .from(operations)
      .where(and(...conditions))
      .orderBy(desc(operations.createdAt))
      .limit(limit);

    return { operations: results };
  }

  async getOperationsByDate(userId: string, start: Date, end: Date): Promise<Operation[]> {
    return db.select()
      .from(operations)
      .where(and(
        eq(operations.userId, userId),
        gte(operations.createdAt, start),
        lte(operations.createdAt, end)
      ))
      .orderBy(desc(operations.createdAt));
  }

  async getOperation(id: string): Promise<Operation | undefined> {
    const [operation] = await db.select().from(operations).where(eq(operations.id, id));
    return operation;
  }

  async createOperation(operation: InsertOperation): Promise<Operation> {
    const [created] = await db.insert(operations).values(operation).returning();
    return created;
  }

  async updateOperation(id: string, updates: Partial<Operation>): Promise<Operation | undefined> {
    const [updated] = await db.update(operations).set({ ...updates, updatedAt: new Date() }).where(eq(operations.id, id)).returning();
    return updated;
  }

  async getPortfolioSeries(userId: string, days: number = 90): Promise<PortfolioSeries[]> {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    const cutoffStr = cutoff.toISOString().split("T")[0];

    const results = await db.select().from(portfolioSeries).where(and(eq(portfolioSeries.userId, userId), gte(portfolioSeries.date, cutoffStr)));
    return results.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }

  async createPortfolioSeries(series: InsertPortfolioSeries): Promise<PortfolioSeries> {
    const [created] = await db.insert(portfolioSeries).values(series).returning();
    return created;
  }

  async getStrategySeries(strategyId: string, days: number = 90): Promise<StrategySeries[]> {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    const cutoffStr = cutoff.toISOString().split("T")[0];

    const results = await db.select().from(strategySeries).where(and(eq(strategySeries.strategyId, strategyId), gte(strategySeries.date, cutoffStr)));
    return results.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }

  async createStrategySeries(series: InsertStrategySeries): Promise<StrategySeries> {
    const [created] = await db.insert(strategySeries).values(series).returning();
    return created;
  }

  async getQuotes(pair: string, days: number = 90): Promise<Quote[]> {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    const cutoffStr = cutoff.toISOString().split("T")[0];

    const results = await db.select().from(quotes).where(and(eq(quotes.pair, pair), gte(quotes.date, cutoffStr)));
    return results.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }

  async getLatestQuote(pair: string): Promise<Quote | undefined> {
    const [quote] = await db.select().from(quotes).where(eq(quotes.pair, pair)).orderBy(desc(quotes.date)).limit(1);
    return quote;
  }

  async createQuote(quote: InsertQuote): Promise<Quote> {
    const [created] = await db.insert(quotes).values(quote).returning();
    return created;
  }

  async getSecuritySettings(userId: string): Promise<SecuritySettings | undefined> {
    const [settings] = await db.select().from(securitySettings).where(eq(securitySettings.userId, userId));
    return settings;
  }

  async updateSecuritySettings(userId: string, updates: Partial<SecuritySettings>): Promise<SecuritySettings> {
    const existing = await this.getSecuritySettings(userId);
    if (existing) {
      const [updated] = await db.update(securitySettings).set({ ...updates, updatedAt: new Date() }).where(eq(securitySettings.id, existing.id)).returning();
      return updated;
    } else {
      const [created] = await db.insert(securitySettings).values({ userId, ...updates }).returning();
      return created;
    }
  }

  async getWhitelistAddresses(userId: string): Promise<WhitelistAddress[]> {
    return db.select().from(whitelistAddresses).where(eq(whitelistAddresses.userId, userId)).orderBy(desc(whitelistAddresses.createdAt));
  }

  async getWhitelistAddress(id: string): Promise<WhitelistAddress | undefined> {
    const [address] = await db.select().from(whitelistAddresses).where(eq(whitelistAddresses.id, id));
    return address;
  }

  async createWhitelistAddress(address: InsertWhitelistAddress): Promise<WhitelistAddress> {
    const [created] = await db.insert(whitelistAddresses).values(address).returning();
    return created;
  }

  async updateWhitelistAddress(id: string, updates: Partial<WhitelistAddress>): Promise<WhitelistAddress | undefined> {
    const [updated] = await db.update(whitelistAddresses).set(updates).where(eq(whitelistAddresses.id, id)).returning();
    return updated;
  }

  async deleteWhitelistAddress(id: string): Promise<void> {
    await db.delete(whitelistAddresses).where(eq(whitelistAddresses.id, id));
  }

  async getLatestConsent(userId: string, documentType: string): Promise<Consent | undefined> {
    const [consent] = await db.select().from(consents)
      .where(and(eq(consents.userId, userId), eq(consents.documentType, documentType)))
      .orderBy(desc(consents.acceptedAt))
      .limit(1);
    return consent;
  }

  async getUserConsents(userId: string): Promise<Consent[]> {
    return db.select().from(consents)
      .where(eq(consents.userId, userId))
      .orderBy(desc(consents.acceptedAt));
  }

  async createConsent(consent: InsertConsent): Promise<Consent> {
    const [created] = await db.insert(consents).values(consent).returning();
    return created;
  }

  async createAuditLog(log: InsertAuditLog): Promise<AuditLog> {
    const [created] = await db.insert(auditLogs).values(log).returning();
    return created;
  }

  async getAuditLogs(userId: string, limit: number = 100): Promise<AuditLog[]> {
    return db.select().from(auditLogs)
      .where(eq(auditLogs.userId, userId))
      .orderBy(desc(auditLogs.createdAt))
      .limit(limit);
  }

  // KYC Applicants
  async getKycApplicant(userId: string): Promise<KycApplicant | undefined> {
    const [applicant] = await db.select().from(kycApplicants).where(eq(kycApplicants.userId, userId));
    return applicant;
  }

  async getKycApplicantByProviderRef(providerRef: string): Promise<KycApplicant | undefined> {
    const [applicant] = await db.select().from(kycApplicants).where(eq(kycApplicants.providerRef, providerRef));
    return applicant;
  }

  async createKycApplicant(applicant: InsertKycApplicant): Promise<KycApplicant> {
    const [created] = await db.insert(kycApplicants).values(applicant).returning();
    return created;
  }

  async updateKycApplicant(userId: string, updates: Partial<KycApplicant>): Promise<KycApplicant | undefined> {
    const [updated] = await db.update(kycApplicants)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(kycApplicants.userId, userId))
      .returning();
    return updated;
  }

  async upsertKycApplicant(userId: string, data: Partial<InsertKycApplicant>): Promise<KycApplicant> {
    const [result] = await db.insert(kycApplicants)
      .values({ userId, ...data } as InsertKycApplicant)
      .onConflictDoUpdate({
        target: kycApplicants.userId,
        set: { ...data, updatedAt: new Date() }
      })
      .returning();
    return result;
  }

  // Notifications
  async getNotifications(userId: string, unreadOnly: boolean = false, limit: number = 50): Promise<Notification[]> {
    if (unreadOnly) {
      return db.select().from(notifications)
        .where(and(eq(notifications.userId, userId), eq(notifications.isRead, false)))
        .orderBy(desc(notifications.createdAt))
        .limit(limit);
    }
    return db.select().from(notifications)
      .where(eq(notifications.userId, userId))
      .orderBy(desc(notifications.createdAt))
      .limit(limit);
  }

  async getNotification(id: string): Promise<Notification | undefined> {
    const [notification] = await db.select().from(notifications).where(eq(notifications.id, id));
    return notification;
  }

  async getUnreadNotificationCount(userId: string): Promise<number> {
    const result = await db.select().from(notifications)
      .where(and(eq(notifications.userId, userId), eq(notifications.isRead, false)));
    return result.length;
  }

  async createNotification(notification: InsertNotification): Promise<Notification> {
    const [created] = await db.insert(notifications).values(notification).returning();
    return created;
  }

  async markNotificationRead(id: string): Promise<Notification | undefined> {
    const [updated] = await db.update(notifications)
      .set({ isRead: true })
      .where(eq(notifications.id, id))
      .returning();
    return updated;
  }

  async markAllNotificationsRead(userId: string): Promise<void> {
    await db.update(notifications)
      .set({ isRead: true })
      .where(eq(notifications.userId, userId));
  }

  // Notification Preferences
  async getNotificationPreferences(userId: string): Promise<NotificationPreferences> {
    const [existing] = await db.select().from(notificationPreferences)
      .where(eq(notificationPreferences.userId, userId));
    
    if (existing) {
      return existing;
    }

    // Create default preferences for new user
    const [created] = await db.insert(notificationPreferences)
      .values({ userId })
      .returning();
    return created;
  }

  async updateNotificationPreferences(userId: string, patch: UpdateNotificationPreferences): Promise<NotificationPreferences> {
    // Ensure preferences exist first
    await this.getNotificationPreferences(userId);
    
    const [updated] = await db.update(notificationPreferences)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(notificationPreferences.userId, userId))
      .returning();
    return updated;
  }

  // Two Factor Authentication
  async getTwoFactor(userId: string): Promise<TwoFactor | undefined> {
    const [record] = await db.select().from(twoFactor)
      .where(eq(twoFactor.userId, userId));
    return record;
  }

  async upsertTwoFactor(userId: string, secretEncrypted: string): Promise<TwoFactor> {
    const existing = await this.getTwoFactor(userId);
    
    if (existing) {
      const [updated] = await db.update(twoFactor)
        .set({ secretEncrypted, enabled: false, verifiedAt: null, updatedAt: new Date() })
        .where(eq(twoFactor.userId, userId))
        .returning();
      return updated;
    }
    
    const [created] = await db.insert(twoFactor)
      .values({ userId, secretEncrypted, enabled: false })
      .returning();
    return created;
  }

  async enableTwoFactor(userId: string): Promise<TwoFactor | undefined> {
    const [updated] = await db.update(twoFactor)
      .set({ enabled: true, verifiedAt: new Date(), updatedAt: new Date() })
      .where(eq(twoFactor.userId, userId))
      .returning();
    return updated;
  }

  async disableTwoFactor(userId: string): Promise<TwoFactor | undefined> {
    const [updated] = await db.update(twoFactor)
      .set({ enabled: false, updatedAt: new Date() })
      .where(eq(twoFactor.userId, userId))
      .returning();
    return updated;
  }

  // Payout Instructions
  async getPayoutInstruction(userId: string, strategyId: string): Promise<PayoutInstruction | undefined> {
    const [instruction] = await db.select().from(payoutInstructions)
      .where(and(eq(payoutInstructions.userId, userId), eq(payoutInstructions.strategyId, strategyId)));
    return instruction;
  }

  async getPayoutInstructions(userId: string): Promise<PayoutInstruction[]> {
    return db.select().from(payoutInstructions).where(eq(payoutInstructions.userId, userId));
  }

  async upsertPayoutInstruction(instruction: InsertPayoutInstruction): Promise<PayoutInstruction> {
    const existing = await this.getPayoutInstruction(instruction.userId, instruction.strategyId);
    if (existing) {
      const [updated] = await db.update(payoutInstructions)
        .set({ ...instruction, updatedAt: new Date() })
        .where(eq(payoutInstructions.id, existing.id))
        .returning();
      return updated;
    }
    const [created] = await db.insert(payoutInstructions).values(instruction).returning();
    return created;
  }

  async getActivePayoutInstructionsByFrequency(frequency: string): Promise<PayoutInstruction[]> {
    return db.select().from(payoutInstructions)
      .where(and(eq(payoutInstructions.active, true), eq(payoutInstructions.frequency, frequency)));
  }

  // Active whitelist addresses
  async getActiveWhitelistAddresses(userId: string): Promise<WhitelistAddress[]> {
    return db.select().from(whitelistAddresses)
      .where(and(eq(whitelistAddresses.userId, userId), eq(whitelistAddresses.status, AddressStatus.ACTIVE)));
  }

  // Redemption Requests
  async getRedemptionRequests(userId: string, strategyId?: string): Promise<RedemptionRequest[]> {
    if (strategyId) {
      return db.select().from(redemptionRequests)
        .where(and(eq(redemptionRequests.userId, userId), eq(redemptionRequests.strategyId, strategyId)))
        .orderBy(desc(redemptionRequests.createdAt));
    }
    return db.select().from(redemptionRequests)
      .where(eq(redemptionRequests.userId, userId))
      .orderBy(desc(redemptionRequests.createdAt));
  }

  async createRedemptionRequest(request: InsertRedemptionRequest): Promise<RedemptionRequest> {
    const [created] = await db.insert(redemptionRequests).values(request).returning();
    return created;
  }

  async updateRedemptionRequest(id: string, updates: Partial<RedemptionRequest>): Promise<RedemptionRequest | undefined> {
    const [updated] = await db.update(redemptionRequests)
      .set(updates)
      .where(eq(redemptionRequests.id, id))
      .returning();
    return updated;
  }

  async getPendingRedemptionsDue(): Promise<RedemptionRequest[]> {
    const now = new Date();
    return db.select().from(redemptionRequests)
      .where(and(
        eq(redemptionRequests.status, "PENDING"),
        sql`${redemptionRequests.executeAt} <= ${now}`
      ));
  }

  // Get all positions (for job processing)
  async getAllPositions(): Promise<Position[]> {
    return db.select().from(positions);
  }

  // Idempotency Keys
  async getIdempotencyKey(userId: string, key: string, endpoint: string): Promise<IdempotencyKey | undefined> {
    const [result] = await db.select().from(idempotencyKeys)
      .where(and(
        eq(idempotencyKeys.userId, userId), 
        eq(idempotencyKeys.idempotencyKey, key),
        eq(idempotencyKeys.endpoint, endpoint)
      ));
    return result;
  }

  async createIdempotencyKey(data: InsertIdempotencyKey): Promise<IdempotencyKey> {
    const [created] = await db.insert(idempotencyKeys).values(data).returning();
    return created;
  }

  async updateIdempotencyKey(id: string, updates: { operationId?: string | null; responseStatus?: number | null; responseBody?: any }): Promise<void> {
    await db.update(idempotencyKeys).set(updates).where(eq(idempotencyKeys.id, id));
  }

  // Market Candles
  async getCandlesFromCache(
    exchange: string,
    symbol: string,
    timeframe: string,
    startMs: number,
    endMs: number
  ): Promise<Candle[]> {
    const rows = await db.select().from(marketCandles).where(
      and(
        eq(marketCandles.exchange, exchange),
        eq(marketCandles.symbol, symbol),
        eq(marketCandles.timeframe, timeframe),
        gte(marketCandles.ts, startMs),
        lt(marketCandles.ts, endMs)
      )
    );
    return rows.map(dbRowToCandle).sort((a, b) => a.ts - b.ts);
  }

  async upsertCandles(
    exchange: string,
    symbol: string,
    timeframe: string,
    candles: Candle[]
  ): Promise<void> {
    if (candles.length === 0) return;

    const deduped = this.dedupeCandles(candles);
    const BATCH_SIZE = 500;

    for (let i = 0; i < deduped.length; i += BATCH_SIZE) {
      const batch = deduped.slice(i, i + BATCH_SIZE);
      const values = batch.map((c) => ({
        exchange,
        symbol,
        timeframe,
        ts: c.ts,
        open: c.open.toString(),
        high: c.high.toString(),
        low: c.low.toString(),
        close: c.close.toString(),
        volume: c.volume.toString(),
      }));

      await db.insert(marketCandles).values(values).onConflictDoUpdate({
        target: [marketCandles.exchange, marketCandles.symbol, marketCandles.timeframe, marketCandles.ts],
        set: {
          open: sql`excluded.open`,
          high: sql`excluded.high`,
          low: sql`excluded.low`,
          close: sql`excluded.close`,
          volume: sql`excluded.volume`,
        },
      });
    }
  }

  private dedupeCandles(candles: Candle[]): Candle[] {
    const seen = new Map<number, Candle>();
    for (const c of candles) {
      seen.set(c.ts, c);
    }
    return Array.from(seen.values()).sort((a, b) => a.ts - b.ts);
  }

  // ==================== ADMIN RBAC SEED ====================
  async seedAdminRbac(): Promise<void> {
    const { SEED_ROLES, SEED_PERMISSIONS, SEED_ROLE_PERMISSIONS } = await import("@shared/schema");

    // Seed roles
    for (const role of SEED_ROLES) {
      await db.insert(roles).values({
        key: role.key,
        name: role.name,
        description: role.description,
      }).onConflictDoNothing();
    }

    // Seed permissions
    for (const perm of SEED_PERMISSIONS) {
      await db.insert(permissions).values({
        key: perm.key,
        name: perm.name,
        description: perm.description,
      }).onConflictDoNothing();
    }

    // Get all roles and permissions from DB
    const allRoles = await db.select().from(roles);
    const allPerms = await db.select().from(permissions);

    const roleMap = new Map(allRoles.map(r => [r.key, r.id]));
    const permMap = new Map(allPerms.map(p => [p.key, p.id]));

    // Seed role-permission mappings
    for (const [roleKey, permKeys] of Object.entries(SEED_ROLE_PERMISSIONS)) {
      const roleId = roleMap.get(roleKey);
      if (!roleId) continue;

      for (const permKey of permKeys) {
        const permissionId = permMap.get(permKey);
        if (!permissionId) continue;

        await db.insert(rolePermissions).values({
          roleId,
          permissionId,
        }).onConflictDoNothing();
      }
    }
  }
}

class MemoryStorage extends DatabaseStorage {
  private candleCache = new Map<string, Candle[]>();

  private getCandleKey(exchange: string, symbol: string, timeframe: string) {
    return `${exchange}:${symbol}:${timeframe}`;
  }

  async upsertCandles(exchange: string, symbol: string, timeframe: string, candles: Candle[]): Promise<void> {
    const key = this.getCandleKey(exchange, symbol, timeframe);
    const existing = this.candleCache.get(key) ?? [];
    const candleMap = new Map<number, Candle>(existing.map((c) => [c.ts, c]));

    for (const candle of candles) {
      candleMap.set(candle.ts, { ...candle });
    }

    const merged = Array.from(candleMap.values()).sort((a, b) => a.ts - b.ts);
    this.candleCache.set(key, merged);
  }

  async getCandlesFromCache(
    exchange: string,
    symbol: string,
    timeframe: string,
    startMs: number,
    endMs: number
  ): Promise<Candle[]> {
    const key = this.getCandleKey(exchange, symbol, timeframe);
    const candles = this.candleCache.get(key) ?? [];
    return candles.filter((c) => c.ts >= startMs && c.ts < endMs).sort((a, b) => a.ts - b.ts);
  }

}

const useMemoryStorage = process.env.NODE_ENV === "test";

export const storage = useMemoryStorage ? new MemoryStorage() : new DatabaseStorage();
