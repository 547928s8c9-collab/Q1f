import { db } from "./db";
import { eq, and, desc, gte, or, ilike } from "drizzle-orm";
import {
  balances,
  vaults,
  strategies,
  positions,
  operations,
  portfolioSeries,
  strategySeries,
  quotes,
  securitySettings,
  whitelistAddresses,
  consents,
  auditLogs,
  kycApplicants,
  notifications,
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
  type Consent,
  type InsertConsent,
  type AuditLog,
  type InsertAuditLog,
  type KycApplicant,
  type InsertKycApplicant,
  type Notification,
  type InsertNotification,
} from "@shared/schema";

export interface IStorage {
  ensureUserData(userId: string): Promise<void>;

  getBalances(userId: string): Promise<Balance[]>;
  getBalance(userId: string, asset: string): Promise<Balance | undefined>;
  updateBalance(userId: string, asset: string, available: string, locked: string): Promise<Balance>;

  getVaults(userId: string): Promise<Vault[]>;
  getVault(userId: string, type: string): Promise<Vault | undefined>;
  updateVault(userId: string, type: string, balance: string): Promise<Vault>;

  getStrategies(): Promise<Strategy[]>;
  getStrategy(id: string): Promise<Strategy | undefined>;
  createStrategy(strategy: InsertStrategy): Promise<Strategy>;

  getPositions(userId: string): Promise<Position[]>;
  getPosition(userId: string, strategyId: string): Promise<Position | undefined>;
  createPosition(position: InsertPosition): Promise<Position>;
  updatePosition(id: string, updates: Partial<Position>): Promise<Position | undefined>;

  getOperations(userId: string, filter?: string, q?: string, cursor?: string, limit?: number): Promise<{ operations: Operation[]; nextCursor?: string }>;
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

  // Notifications
  getNotifications(userId: string, unreadOnly?: boolean, limit?: number): Promise<Notification[]>;
  getUnreadNotificationCount(userId: string): Promise<number>;
  createNotification(notification: InsertNotification): Promise<Notification>;
  markNotificationRead(id: string): Promise<Notification | undefined>;
  markAllNotificationsRead(userId: string): Promise<void>;
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
    let query = db.select().from(operations).where(eq(operations.userId, userId)).orderBy(desc(operations.createdAt)).limit(limit);
    
    const results = await query;
    
    let filtered = results;
    if (filter && filter !== "all") {
      const types = filter.split(",");
      filtered = filtered.filter((o) => types.includes(o.type));
    }
    
    if (q) {
      const query = q.toLowerCase();
      filtered = filtered.filter((o) =>
        o.type.toLowerCase().includes(query) ||
        o.status.toLowerCase().includes(query) ||
        o.amount?.includes(query) ||
        o.txHash?.toLowerCase().includes(query) ||
        o.providerRef?.toLowerCase().includes(query) ||
        o.strategyName?.toLowerCase().includes(query)
      );
    }

    return { operations: filtered };
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
}

export const storage = new DatabaseStorage();
