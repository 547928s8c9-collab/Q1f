import {
  type User,
  type InsertUser,
  type Balance,
  type InsertBalance,
  type Vault,
  type InsertVault,
  type Strategy,
  type InsertStrategy,
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
} from "@shared/schema";
import { randomUUID } from "crypto";

export interface IStorage {
  // Users
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  updateUser(id: string, updates: Partial<User>): Promise<User | undefined>;

  // Balances
  getBalances(userId: string): Promise<Balance[]>;
  getBalance(userId: string, asset: string): Promise<Balance | undefined>;
  updateBalance(userId: string, asset: string, available: string, locked: string): Promise<Balance>;

  // Vaults
  getVaults(userId: string): Promise<Vault[]>;
  getVault(userId: string, type: string): Promise<Vault | undefined>;
  updateVault(userId: string, type: string, balance: string): Promise<Vault>;

  // Strategies
  getStrategies(): Promise<Strategy[]>;
  getStrategy(id: string): Promise<Strategy | undefined>;
  createStrategy(strategy: InsertStrategy): Promise<Strategy>;

  // Positions
  getPositions(userId: string): Promise<Position[]>;
  getPosition(userId: string, strategyId: string): Promise<Position | undefined>;
  createPosition(position: InsertPosition): Promise<Position>;
  updatePosition(id: string, updates: Partial<Position>): Promise<Position | undefined>;

  // Operations
  getOperations(userId: string, filter?: string, q?: string, cursor?: string, limit?: number): Promise<{ operations: Operation[]; nextCursor?: string }>;
  getOperation(id: string): Promise<Operation | undefined>;
  createOperation(operation: InsertOperation): Promise<Operation>;
  updateOperation(id: string, updates: Partial<Operation>): Promise<Operation | undefined>;

  // Portfolio Series
  getPortfolioSeries(userId: string, days?: number): Promise<PortfolioSeries[]>;
  createPortfolioSeries(series: InsertPortfolioSeries): Promise<PortfolioSeries>;

  // Strategy Series
  getStrategySeries(strategyId: string, days?: number): Promise<StrategySeries[]>;
  createStrategySeries(series: InsertStrategySeries): Promise<StrategySeries>;

  // Quotes
  getQuotes(pair: string, days?: number): Promise<Quote[]>;
  getLatestQuote(pair: string): Promise<Quote | undefined>;
  createQuote(quote: InsertQuote): Promise<Quote>;

  // Security Settings
  getSecuritySettings(userId: string): Promise<SecuritySettings | undefined>;
  updateSecuritySettings(userId: string, updates: Partial<SecuritySettings>): Promise<SecuritySettings>;

  // Whitelist Addresses
  getWhitelistAddresses(userId: string): Promise<WhitelistAddress[]>;
  getWhitelistAddress(id: string): Promise<WhitelistAddress | undefined>;
  createWhitelistAddress(address: InsertWhitelistAddress): Promise<WhitelistAddress>;
  updateWhitelistAddress(id: string, updates: Partial<WhitelistAddress>): Promise<WhitelistAddress | undefined>;
  deleteWhitelistAddress(id: string): Promise<void>;
}

export class MemStorage implements IStorage {
  private users: Map<string, User> = new Map();
  private balances: Map<string, Balance> = new Map();
  private vaults: Map<string, Vault> = new Map();
  private strategies: Map<string, Strategy> = new Map();
  private positions: Map<string, Position> = new Map();
  private operations: Map<string, Operation> = new Map();
  private portfolioSeries: Map<string, PortfolioSeries> = new Map();
  private strategySeries: Map<string, StrategySeries> = new Map();
  private quotes: Map<string, Quote> = new Map();
  private securitySettings: Map<string, SecuritySettings> = new Map();
  private whitelistAddresses: Map<string, WhitelistAddress> = new Map();

  constructor() {
    this.seedDemoData();
  }

  private seedDemoData() {
    const userId = "demo-user";
    const now = new Date();

    // Create demo user
    this.users.set(userId, {
      id: userId,
      username: "demo",
      password: "demo",
      consentAccepted: true,
      kycStatus: "approved",
      createdAt: now,
    });

    // Create balances
    this.balances.set(`${userId}-USDT`, {
      id: randomUUID(),
      userId,
      asset: "USDT",
      available: "5000000000", // 5000 USDT
      locked: "0",
      updatedAt: now,
    });

    this.balances.set(`${userId}-RUB`, {
      id: randomUUID(),
      userId,
      asset: "RUB",
      available: "15000000", // 150,000 RUB
      locked: "0",
      updatedAt: now,
    });

    // Create vaults
    this.vaults.set(`${userId}-principal`, {
      id: randomUUID(),
      userId,
      type: "principal",
      asset: "USDT",
      balance: "1000000000", // 1000 USDT
      updatedAt: now,
    });

    this.vaults.set(`${userId}-profit`, {
      id: randomUUID(),
      userId,
      type: "profit",
      asset: "USDT",
      balance: "250000000", // 250 USDT
      updatedAt: now,
    });

    this.vaults.set(`${userId}-taxes`, {
      id: randomUUID(),
      userId,
      type: "taxes",
      asset: "USDT",
      balance: "75000000", // 75 USDT
      updatedAt: now,
    });

    // Create strategies
    const strategy1Id = "strategy-momentum";
    const strategy2Id = "strategy-arbitrage";

    this.strategies.set(strategy1Id, {
      id: strategy1Id,
      name: "Momentum Alpha",
      description: "Captures trending moves in major crypto pairs using advanced technical analysis and ML-driven signals.",
      riskLevel: "medium",
      minInvestment: "100000000", // 100 USDT
      expectedReturn: "8.5",
      maxDrawdown: "12",
      winRate: "67",
      fees: "2",
      isActive: true,
      createdAt: now,
    });

    this.strategies.set(strategy2Id, {
      id: strategy2Id,
      name: "Cross-Exchange Arbitrage",
      description: "Low-risk strategy exploiting price inefficiencies across multiple exchanges with minimal exposure.",
      riskLevel: "low",
      minInvestment: "500000000", // 500 USDT
      expectedReturn: "4.2",
      maxDrawdown: "3",
      winRate: "89",
      fees: "1.5",
      isActive: true,
      createdAt: now,
    });

    // Create position
    const positionId = randomUUID();
    this.positions.set(positionId, {
      id: positionId,
      userId,
      strategyId: strategy1Id,
      principal: "2000000000", // 2000 USDT invested
      currentValue: "2150000000", // 2150 USDT current (7.5% gain)
      createdAt: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000),
      updatedAt: now,
    });

    // Create security settings
    this.securitySettings.set(userId, {
      id: randomUUID(),
      userId,
      twoFactorEnabled: false,
      antiPhishingCode: null,
      whitelistEnabled: false,
      addressDelay: 0,
      autoSweepEnabled: false,
      updatedAt: now,
    });

    // Generate portfolio series (90 days)
    let portfolioValue = 5000000000; // Start at 5000 USDT
    for (let i = 89; i >= 0; i--) {
      const date = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
      const dailyChange = (Math.random() - 0.45) * 0.015; // ~4-5% monthly drift upward
      portfolioValue = Math.round(portfolioValue * (1 + dailyChange));

      const seriesId = randomUUID();
      this.portfolioSeries.set(seriesId, {
        id: seriesId,
        userId,
        date: date.toISOString().split("T")[0],
        value: portfolioValue.toString(),
      });
    }

    // Generate strategy series (normalized to 100)
    [strategy1Id, strategy2Id].forEach((strategyId) => {
      let stratValue = 100;
      for (let i = 89; i >= 0; i--) {
        const date = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
        const dailyChange = (Math.random() - 0.42) * 0.012;
        stratValue = stratValue * (1 + dailyChange);

        const seriesId = randomUUID();
        this.strategySeries.set(seriesId, {
          id: seriesId,
          strategyId,
          date: date.toISOString().split("T")[0],
          value: stratValue.toFixed(2),
        });
      }
    });

    // Generate quote series
    const pairs = [
      { pair: "BTC/USDT", basePrice: 67500, decimals: 2 },
      { pair: "ETH/USDT", basePrice: 3450, decimals: 2 },
      { pair: "USDT/RUB", basePrice: 92.5, decimals: 2 },
    ];

    pairs.forEach(({ pair, basePrice, decimals }) => {
      let price = basePrice;
      for (let i = 89; i >= 0; i--) {
        const date = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
        const dailyChange = (Math.random() - 0.5) * 0.03;
        price = price * (1 + dailyChange);

        const quoteId = randomUUID();
        this.quotes.set(quoteId, {
          id: quoteId,
          pair,
          date: date.toISOString().split("T")[0],
          price: price.toFixed(decimals),
          change24h: (dailyChange * 100).toFixed(2),
        });
      }
    });

    // Generate operations history
    const operationTypes = [
      { type: "DEPOSIT_USDT", status: "completed", asset: "USDT", amount: "1000000000" },
      { type: "DEPOSIT_CARD", status: "completed", asset: "USDT", amount: "500000000" },
      { type: "INVEST", status: "completed", asset: "USDT", amount: "2000000000", strategyId: strategy1Id, strategyName: "Momentum Alpha" },
      { type: "DAILY_PAYOUT", status: "completed", asset: "USDT", amount: "15000000" },
      { type: "DAILY_PAYOUT", status: "completed", asset: "USDT", amount: "18500000" },
      { type: "DAILY_PAYOUT", status: "completed", asset: "USDT", amount: "12300000" },
      { type: "SUBSCRIPTION", status: "completed", asset: "USDT", amount: "9990000" },
      { type: "FX", status: "completed", asset: "USDT", amount: "100000000" },
    ];

    operationTypes.forEach((op, i) => {
      const opId = randomUUID();
      const createdAt = new Date(now.getTime() - (operationTypes.length - i) * 2 * 24 * 60 * 60 * 1000);
      this.operations.set(opId, {
        id: opId,
        userId,
        type: op.type,
        status: op.status,
        asset: op.asset,
        amount: op.amount,
        fee: "0",
        txHash: op.type.includes("DEPOSIT") ? `0x${randomUUID().replace(/-/g, "")}` : null,
        providerRef: null,
        strategyId: op.strategyId || null,
        strategyName: op.strategyName || null,
        fromVault: null,
        toVault: null,
        metadata: null,
        reason: null,
        createdAt,
        updatedAt: createdAt,
      });
    });
  }

  // User methods
  async getUser(id: string): Promise<User | undefined> {
    return this.users.get(id);
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find((user) => user.username === username);
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const id = randomUUID();
    const user: User = { ...insertUser, id, consentAccepted: false, kycStatus: "pending", createdAt: new Date() };
    this.users.set(id, user);
    return user;
  }

  async updateUser(id: string, updates: Partial<User>): Promise<User | undefined> {
    const user = this.users.get(id);
    if (!user) return undefined;
    const updated = { ...user, ...updates };
    this.users.set(id, updated);
    return updated;
  }

  // Balance methods
  async getBalances(userId: string): Promise<Balance[]> {
    return Array.from(this.balances.values()).filter((b) => b.userId === userId);
  }

  async getBalance(userId: string, asset: string): Promise<Balance | undefined> {
    return this.balances.get(`${userId}-${asset}`);
  }

  async updateBalance(userId: string, asset: string, available: string, locked: string): Promise<Balance> {
    const key = `${userId}-${asset}`;
    let balance = this.balances.get(key);
    if (!balance) {
      balance = { id: randomUUID(), userId, asset, available, locked, updatedAt: new Date() };
    } else {
      balance = { ...balance, available, locked, updatedAt: new Date() };
    }
    this.balances.set(key, balance);
    return balance;
  }

  // Vault methods
  async getVaults(userId: string): Promise<Vault[]> {
    return Array.from(this.vaults.values()).filter((v) => v.userId === userId);
  }

  async getVault(userId: string, type: string): Promise<Vault | undefined> {
    return this.vaults.get(`${userId}-${type}`);
  }

  async updateVault(userId: string, type: string, balance: string): Promise<Vault> {
    const key = `${userId}-${type}`;
    let vault = this.vaults.get(key);
    if (!vault) {
      vault = { id: randomUUID(), userId, type, asset: "USDT", balance, updatedAt: new Date() };
    } else {
      vault = { ...vault, balance, updatedAt: new Date() };
    }
    this.vaults.set(key, vault);
    return vault;
  }

  // Strategy methods
  async getStrategies(): Promise<Strategy[]> {
    return Array.from(this.strategies.values()).filter((s) => s.isActive);
  }

  async getStrategy(id: string): Promise<Strategy | undefined> {
    return this.strategies.get(id);
  }

  async createStrategy(strategy: InsertStrategy): Promise<Strategy> {
    const id = randomUUID();
    const newStrategy: Strategy = { ...strategy, id, createdAt: new Date() };
    this.strategies.set(id, newStrategy);
    return newStrategy;
  }

  // Position methods
  async getPositions(userId: string): Promise<Position[]> {
    return Array.from(this.positions.values()).filter((p) => p.userId === userId);
  }

  async getPosition(userId: string, strategyId: string): Promise<Position | undefined> {
    return Array.from(this.positions.values()).find((p) => p.userId === userId && p.strategyId === strategyId);
  }

  async createPosition(position: InsertPosition): Promise<Position> {
    const id = randomUUID();
    const newPosition: Position = { ...position, id, createdAt: new Date(), updatedAt: new Date() };
    this.positions.set(id, newPosition);
    return newPosition;
  }

  async updatePosition(id: string, updates: Partial<Position>): Promise<Position | undefined> {
    const position = this.positions.get(id);
    if (!position) return undefined;
    const updated = { ...position, ...updates, updatedAt: new Date() };
    this.positions.set(id, updated);
    return updated;
  }

  // Operation methods
  async getOperations(userId: string, filter?: string, q?: string, cursor?: string, limit: number = 50): Promise<{ operations: Operation[]; nextCursor?: string }> {
    let ops = Array.from(this.operations.values())
      .filter((o) => o.userId === userId)
      .sort((a, b) => new Date(b.createdAt!).getTime() - new Date(a.createdAt!).getTime());

    if (filter && filter !== "all") {
      const types = filter.split(",");
      ops = ops.filter((o) => types.includes(o.type));
    }

    if (q) {
      const query = q.toLowerCase();
      ops = ops.filter((o) =>
        o.type.toLowerCase().includes(query) ||
        o.status.toLowerCase().includes(query) ||
        o.amount?.includes(query) ||
        o.txHash?.toLowerCase().includes(query) ||
        o.providerRef?.toLowerCase().includes(query) ||
        o.strategyName?.toLowerCase().includes(query)
      );
    }

    return { operations: ops.slice(0, limit) };
  }

  async getOperation(id: string): Promise<Operation | undefined> {
    return this.operations.get(id);
  }

  async createOperation(operation: InsertOperation): Promise<Operation> {
    const id = randomUUID();
    const newOp: Operation = { ...operation, id, createdAt: new Date(), updatedAt: new Date() };
    this.operations.set(id, newOp);
    return newOp;
  }

  async updateOperation(id: string, updates: Partial<Operation>): Promise<Operation | undefined> {
    const operation = this.operations.get(id);
    if (!operation) return undefined;
    const updated = { ...operation, ...updates, updatedAt: new Date() };
    this.operations.set(id, updated);
    return updated;
  }

  // Portfolio Series methods
  async getPortfolioSeries(userId: string, days: number = 90): Promise<PortfolioSeries[]> {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);

    return Array.from(this.portfolioSeries.values())
      .filter((s) => s.userId === userId && new Date(s.date) >= cutoff)
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }

  async createPortfolioSeries(series: InsertPortfolioSeries): Promise<PortfolioSeries> {
    const id = randomUUID();
    const newSeries: PortfolioSeries = { ...series, id };
    this.portfolioSeries.set(id, newSeries);
    return newSeries;
  }

  // Strategy Series methods
  async getStrategySeries(strategyId: string, days: number = 90): Promise<StrategySeries[]> {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);

    return Array.from(this.strategySeries.values())
      .filter((s) => s.strategyId === strategyId && new Date(s.date) >= cutoff)
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }

  async createStrategySeries(series: InsertStrategySeries): Promise<StrategySeries> {
    const id = randomUUID();
    const newSeries: StrategySeries = { ...series, id };
    this.strategySeries.set(id, newSeries);
    return newSeries;
  }

  // Quote methods
  async getQuotes(pair: string, days: number = 90): Promise<Quote[]> {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);

    return Array.from(this.quotes.values())
      .filter((q) => q.pair === pair && new Date(q.date) >= cutoff)
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }

  async getLatestQuote(pair: string): Promise<Quote | undefined> {
    const quotes = await this.getQuotes(pair, 1);
    return quotes[quotes.length - 1];
  }

  async createQuote(quote: InsertQuote): Promise<Quote> {
    const id = randomUUID();
    const newQuote: Quote = { ...quote, id };
    this.quotes.set(id, newQuote);
    return newQuote;
  }

  // Security Settings methods
  async getSecuritySettings(userId: string): Promise<SecuritySettings | undefined> {
    return this.securitySettings.get(userId);
  }

  async updateSecuritySettings(userId: string, updates: Partial<SecuritySettings>): Promise<SecuritySettings> {
    let settings = this.securitySettings.get(userId);
    if (!settings) {
      settings = {
        id: randomUUID(),
        userId,
        twoFactorEnabled: false,
        antiPhishingCode: null,
        whitelistEnabled: false,
        addressDelay: 0,
        autoSweepEnabled: false,
        updatedAt: new Date(),
      };
    }
    const updated = { ...settings, ...updates, updatedAt: new Date() };
    this.securitySettings.set(userId, updated);
    return updated;
  }

  // Whitelist Address methods
  async getWhitelistAddresses(userId: string): Promise<WhitelistAddress[]> {
    return Array.from(this.whitelistAddresses.values())
      .filter((a) => a.userId === userId)
      .sort((a, b) => new Date(b.createdAt!).getTime() - new Date(a.createdAt!).getTime());
  }

  async getWhitelistAddress(id: string): Promise<WhitelistAddress | undefined> {
    return this.whitelistAddresses.get(id);
  }

  async createWhitelistAddress(address: InsertWhitelistAddress): Promise<WhitelistAddress> {
    const id = randomUUID();
    const newAddress: WhitelistAddress = { ...address, id, createdAt: new Date() };
    this.whitelistAddresses.set(id, newAddress);
    return newAddress;
  }

  async updateWhitelistAddress(id: string, updates: Partial<WhitelistAddress>): Promise<WhitelistAddress | undefined> {
    const address = this.whitelistAddresses.get(id);
    if (!address) return undefined;
    const updated = { ...address, ...updates };
    this.whitelistAddresses.set(id, updated);
    return updated;
  }

  async deleteWhitelistAddress(id: string): Promise<void> {
    this.whitelistAddresses.delete(id);
  }
}

export const storage = new MemStorage();
