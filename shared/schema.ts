import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, boolean, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Export auth models (users, sessions tables)
export * from "./models/auth";

// ==================== BALANCES ====================
// Amounts stored as string of integer minor units
export const balances = pgTable("balances", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  asset: text("asset").notNull(), // RUB, USDT
  available: text("available").notNull().default("0"), // minor units as string
  locked: text("locked").notNull().default("0"),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertBalanceSchema = createInsertSchema(balances).omit({ id: true, updatedAt: true });
export type InsertBalance = z.infer<typeof insertBalanceSchema>;
export type Balance = typeof balances.$inferSelect;

// ==================== VAULTS ====================
export const vaults = pgTable("vaults", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  type: text("type").notNull(), // principal, profit, taxes
  asset: text("asset").notNull().default("USDT"),
  balance: text("balance").notNull().default("0"),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertVaultSchema = createInsertSchema(vaults).omit({ id: true, updatedAt: true });
export type InsertVault = z.infer<typeof insertVaultSchema>;
export type Vault = typeof vaults.$inferSelect;

// ==================== STRATEGIES ====================
export const strategies = pgTable("strategies", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  description: text("description"),
  riskTier: text("risk_tier").notNull(), // LOW, CORE, HIGH
  baseAsset: text("base_asset").notNull().default("USDT"),
  pairsJson: jsonb("pairs_json"), // e.g., ["BTC/USDT", "ETH/USDT"]
  expectedMonthlyRangeBpsMin: integer("expected_monthly_range_bps_min"), // basis points min
  expectedMonthlyRangeBpsMax: integer("expected_monthly_range_bps_max"), // basis points max
  feesJson: jsonb("fees_json"), // { management: "0.5%", performance: "10%" }
  termsJson: jsonb("terms_json"), // { profitPayout: "DAILY", principalRedemption: "WEEKLY_WINDOW" }
  minInvestment: text("min_investment").notNull().default("100000000"), // 100 USDT minor units
  worstMonth: text("worst_month"), // worst monthly return percentage
  maxDrawdown: text("max_drawdown"), // max drawdown percentage
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertStrategySchema = createInsertSchema(strategies).omit({ id: true, createdAt: true });
export type InsertStrategy = z.infer<typeof insertStrategySchema>;
export type Strategy = typeof strategies.$inferSelect;

// ==================== STRATEGY PERFORMANCE ====================
export const strategyPerformance = pgTable("strategy_performance", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  strategyId: varchar("strategy_id").notNull(),
  day: integer("day").notNull(), // day number 1-90
  date: text("date").notNull(), // RFC3339 date
  equityMinor: text("equity_minor").notNull(), // strategy equity in minor units (starts at 1000 USDT = 1000000000)
  benchmarkBtcMinor: text("benchmark_btc_minor"), // BTC benchmark normalized
  benchmarkEthMinor: text("benchmark_eth_minor"), // ETH benchmark normalized
});

export const insertStrategyPerformanceSchema = createInsertSchema(strategyPerformance).omit({ id: true });
export type InsertStrategyPerformance = z.infer<typeof insertStrategyPerformanceSchema>;
export type StrategyPerformance = typeof strategyPerformance.$inferSelect;

// ==================== POSITIONS ====================
export const positions = pgTable("positions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  strategyId: varchar("strategy_id").notNull(),
  principal: text("principal").notNull().default("0"), // legacy field (keep for compatibility)
  currentValue: text("current_value").notNull().default("0"), // legacy field
  principalMinor: text("principal_minor").notNull().default("0"), // original invested amount
  investedCurrentMinor: text("invested_current_minor").notNull().default("0"), // current value including gains/losses
  accruedProfitPayableMinor: text("accrued_profit_payable_minor").notNull().default("0"), // profit available for payout
  lastAccrualDate: text("last_accrual_date"), // last date accrual was processed
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertPositionSchema = createInsertSchema(positions).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertPosition = z.infer<typeof insertPositionSchema>;
export type Position = typeof positions.$inferSelect;

// ==================== REDEMPTION REQUESTS ====================
export const RedemptionStatus = {
  PENDING: "PENDING",
  EXECUTED: "EXECUTED",
  CANCELLED: "CANCELLED",
} as const;

export type RedemptionStatusType = typeof RedemptionStatus[keyof typeof RedemptionStatus];

export const redemptionRequests = pgTable("redemption_requests", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  strategyId: varchar("strategy_id").notNull(),
  amountMinor: text("amount_minor"), // null means ALL principal
  requestedAt: timestamp("requested_at").defaultNow(),
  executeAt: timestamp("execute_at").notNull(), // next weekly window
  status: text("status").notNull().default("PENDING"), // PENDING, EXECUTED, CANCELLED
  executedAmountMinor: text("executed_amount_minor"), // actual amount redeemed
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertRedemptionRequestSchema = createInsertSchema(redemptionRequests).omit({ id: true, createdAt: true });
export type InsertRedemptionRequest = z.infer<typeof insertRedemptionRequestSchema>;
export type RedemptionRequest = typeof redemptionRequests.$inferSelect;

// ==================== OPERATIONS ====================
// All money actions create operation records
export const operations = pgTable("operations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  type: text("type").notNull(), // DEPOSIT_USDT, DEPOSIT_CARD, WITHDRAW_USDT, INVEST, DAILY_PAYOUT, FX, SUBSCRIPTION, KYC, VAULT_TRANSFER
  status: text("status").notNull(), // pending, processing, completed, failed, cancelled
  asset: text("asset"),
  amount: text("amount"), // minor units as string
  fee: text("fee").default("0"),
  txHash: text("tx_hash"),
  providerRef: text("provider_ref"),
  strategyId: varchar("strategy_id"),
  strategyName: text("strategy_name"),
  fromVault: text("from_vault"),
  toVault: text("to_vault"),
  metadata: jsonb("metadata"),
  reason: text("reason"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertOperationSchema = createInsertSchema(operations).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertOperation = z.infer<typeof insertOperationSchema>;
export type Operation = typeof operations.$inferSelect;

// ==================== PORTFOLIO SERIES ====================
export const portfolioSeries = pgTable("portfolio_series", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  date: text("date").notNull(), // RFC3339 date
  value: text("value").notNull(), // USDT minor units
});

export const insertPortfolioSeriesSchema = createInsertSchema(portfolioSeries).omit({ id: true });
export type InsertPortfolioSeries = z.infer<typeof insertPortfolioSeriesSchema>;
export type PortfolioSeries = typeof portfolioSeries.$inferSelect;

// ==================== STRATEGY SERIES ====================
export const strategySeries = pgTable("strategy_series", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  strategyId: varchar("strategy_id").notNull(),
  date: text("date").notNull(),
  value: text("value").notNull(), // normalized to 100
});

export const insertStrategySeriesSchema = createInsertSchema(strategySeries).omit({ id: true });
export type InsertStrategySeries = z.infer<typeof insertStrategySeriesSchema>;
export type StrategySeries = typeof strategySeries.$inferSelect;

// ==================== QUOTES ====================
export const quotes = pgTable("quotes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  pair: text("pair").notNull(), // BTC/USDT, ETH/USDT, USDT/RUB
  date: text("date").notNull(),
  price: text("price").notNull(), // minor units
  change24h: text("change_24h"),
});

export const insertQuoteSchema = createInsertSchema(quotes).omit({ id: true });
export type InsertQuote = z.infer<typeof insertQuoteSchema>;
export type Quote = typeof quotes.$inferSelect;

// ==================== SECURITY SETTINGS ====================
export const securitySettings = pgTable("security_settings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().unique(),
  contactVerified: boolean("contact_verified").default(false),
  consentAccepted: boolean("consent_accepted").default(false),
  kycStatus: text("kyc_status").default("pending"), // pending, approved, rejected
  twoFactorEnabled: boolean("two_factor_enabled").default(false),
  antiPhishingCode: text("anti_phishing_code"),
  whitelistEnabled: boolean("whitelist_enabled").default(false),
  addressDelay: integer("address_delay").default(0), // 0 or 24 hours
  autoSweepEnabled: boolean("auto_sweep_enabled").default(false),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertSecuritySettingsSchema = createInsertSchema(securitySettings).omit({ id: true, updatedAt: true });
export type InsertSecuritySettings = z.infer<typeof insertSecuritySettingsSchema>;
export type SecuritySettings = typeof securitySettings.$inferSelect;

// ==================== WHITELIST ADDRESSES ====================
export const AddressStatus = {
  PENDING_ACTIVATION: "PENDING_ACTIVATION",
  ACTIVE: "ACTIVE",
  DISABLED: "DISABLED",
} as const;

export type AddressStatusType = typeof AddressStatus[keyof typeof AddressStatus];

export const whitelistAddresses = pgTable("whitelist_addresses", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  address: text("address").notNull(),
  label: text("label"),
  network: text("network").default("TRC20"),
  status: text("status").default("PENDING_ACTIVATION"), // PENDING_ACTIVATION, ACTIVE, DISABLED
  activatesAt: timestamp("activates_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertWhitelistAddressSchema = createInsertSchema(whitelistAddresses).omit({ id: true, createdAt: true });
export type InsertWhitelistAddress = z.infer<typeof insertWhitelistAddressSchema>;
export type WhitelistAddress = typeof whitelistAddresses.$inferSelect;

// ==================== PAYOUT INSTRUCTIONS ====================
export const PayoutFrequency = {
  DAILY: "DAILY",
  MONTHLY: "MONTHLY",
} as const;

export type PayoutFrequencyType = typeof PayoutFrequency[keyof typeof PayoutFrequency];

export const payoutInstructions = pgTable("payout_instructions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  strategyId: varchar("strategy_id").notNull(),
  frequency: text("frequency").notNull().default("MONTHLY"), // DAILY or MONTHLY
  addressId: varchar("address_id"), // references whitelist address
  minPayoutMinor: text("min_payout_minor").notNull().default("10000000"), // 10 USDT in minor units
  active: boolean("active").default(false),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertPayoutInstructionSchema = createInsertSchema(payoutInstructions).omit({ id: true, updatedAt: true });
export type InsertPayoutInstruction = z.infer<typeof insertPayoutInstructionSchema>;
export type PayoutInstruction = typeof payoutInstructions.$inferSelect;

// ==================== CONSENTS ====================
// Versioned consent records with audit trail
export const consents = pgTable("consents", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  version: text("version").notNull(), // e.g., "1.0", "2.0"
  documentType: text("document_type").notNull(), // "terms", "privacy", "combined"
  docHash: text("doc_hash").notNull(), // SHA-256 hash of document content
  acceptedAt: timestamp("accepted_at").defaultNow(),
  ip: text("ip"),
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertConsentSchema = createInsertSchema(consents).omit({ id: true, createdAt: true });
export type InsertConsent = z.infer<typeof insertConsentSchema>;
export type Consent = typeof consents.$inferSelect;

// ==================== AUDIT LOGS ====================
// General purpose audit log for compliance tracking
export const auditLogs = pgTable("audit_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id"),
  event: text("event").notNull(), // CONSENT_ACCEPTED, LOGIN, LOGOUT, KYC_STARTED, etc.
  resourceType: text("resource_type"), // consent, user, operation, etc.
  resourceId: varchar("resource_id"),
  details: jsonb("details"),
  ip: text("ip"),
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertAuditLogSchema = createInsertSchema(auditLogs).omit({ id: true, createdAt: true });
export type InsertAuditLog = z.infer<typeof insertAuditLogSchema>;
export type AuditLog = typeof auditLogs.$inferSelect;

// ==================== KYC APPLICANTS ====================
// KYC state machine with full status tracking
export const KycStatus = {
  NOT_STARTED: "NOT_STARTED",
  IN_REVIEW: "IN_REVIEW",
  APPROVED: "APPROVED",
  NEEDS_ACTION: "NEEDS_ACTION",
  REJECTED: "REJECTED",
  ON_HOLD: "ON_HOLD",
} as const;

export type KycStatusType = typeof KycStatus[keyof typeof KycStatus];

export const kycApplicants = pgTable("kyc_applicants", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().unique(),
  status: text("status").notNull().default("NOT_STARTED"), // KycStatus values
  level: text("level").default("basic"), // basic, advanced
  providerRef: text("provider_ref"), // Sumsub applicant ID
  riskLevel: text("risk_level"), // low, medium, high
  pepFlag: boolean("pep_flag").default(false), // Politically Exposed Person
  rejectionReason: text("rejection_reason"),
  needsActionReason: text("needs_action_reason"),
  submittedAt: timestamp("submitted_at"),
  reviewedAt: timestamp("reviewed_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertKycApplicantSchema = createInsertSchema(kycApplicants).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertKycApplicant = z.infer<typeof insertKycApplicantSchema>;
export type KycApplicant = typeof kycApplicants.$inferSelect;

// KYC Status DTO for API responses
export interface KycStatusDTO {
  status: KycStatusType;
  level: string | null;
  providerRef: string | null;
  submittedAt: string | null;
  reviewedAt: string | null;
  rejectionReason: string | null;
  needsActionReason: string | null;
  allowedTransitions: KycStatusType[];
}

// KYC state transition map
export const KycTransitions: Record<KycStatusType, KycStatusType[]> = {
  NOT_STARTED: ["IN_REVIEW"],
  IN_REVIEW: ["APPROVED", "NEEDS_ACTION", "REJECTED", "ON_HOLD"],
  APPROVED: [], // Terminal state
  NEEDS_ACTION: ["IN_REVIEW"], // User resubmits
  REJECTED: [], // Terminal state (may allow appeal later)
  ON_HOLD: ["IN_REVIEW", "REJECTED"], // Manual review
};

// ==================== NOTIFICATIONS ====================
export const notifications = pgTable("notifications", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  type: text("type").notNull(), // operation, security, kyc, system
  title: text("title").notNull(),
  message: text("message").notNull(),
  resourceType: text("resource_type"), // operation, kyc, security
  resourceId: varchar("resource_id"),
  isRead: boolean("is_read").default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertNotificationSchema = createInsertSchema(notifications).omit({ id: true, createdAt: true });
export type InsertNotification = z.infer<typeof insertNotificationSchema>;
export type Notification = typeof notifications.$inferSelect;

// Consent status response type
export interface ConsentStatusResponse {
  hasAccepted: boolean;
  currentVersion: string;
  requiredVersion: string;
  needsReaccept: boolean;
  lastAcceptedAt: string | null;
  documentHash: string;
}

// ==================== API TYPES ====================
export const OperationType = {
  DEPOSIT_USDT: "DEPOSIT_USDT",
  DEPOSIT_CARD: "DEPOSIT_CARD",
  WITHDRAW_USDT: "WITHDRAW_USDT",
  INVEST: "INVEST",
  DAILY_PAYOUT: "DAILY_PAYOUT",
  PROFIT_ACCRUAL: "PROFIT_ACCRUAL",
  PROFIT_PAYOUT: "PROFIT_PAYOUT",
  PRINCIPAL_REDEEM_EXECUTED: "PRINCIPAL_REDEEM_EXECUTED",
  FX: "FX",
  SUBSCRIPTION: "SUBSCRIPTION",
  KYC: "KYC",
  VAULT_TRANSFER: "VAULT_TRANSFER",
} as const;

export const OperationStatus = {
  PENDING: "pending",
  PROCESSING: "processing",
  COMPLETED: "completed",
  FAILED: "failed",
  CANCELLED: "cancelled",
} as const;

// Onboarding stages
export type OnboardingStage = "welcome" | "verify" | "consent" | "kyc" | "done";

// Bootstrap response type
export interface BootstrapResponse {
  user: {
    id: string;
    email: string | null;
    firstName: string | null;
    lastName: string | null;
    profileImageUrl: string | null;
  };
  onboarding: {
    stage: OnboardingStage;
    contactVerified: boolean;
    consentAccepted: boolean;
    kycStatus: string;
  };
  consent: {
    hasAccepted: boolean;
    currentVersion: string | null;
    requiredVersion: string;
    needsReaccept: boolean;
    lastAcceptedAt: string | null;
  };
  gate: {
    consentRequired: boolean;
    kycRequired: boolean;
    canDeposit: boolean;
    canInvest: boolean;
    canWithdraw: boolean;
    reasons: string[];
  };
  balances: {
    RUB: { available: string; locked: string };
    USDT: { available: string; locked: string };
  };
  invested: {
    current: string;
    principal: string;
  };
  vaults: {
    principal: string;
    profit: string;
    taxes: string;
  };
  portfolioSeries: Array<{ date: string; value: string }>;
  quotes: {
    "BTC/USDT": { price: string; change24h: string; series: Array<{ date: string; price: string }> };
    "ETH/USDT": { price: string; change24h: string; series: Array<{ date: string; price: string }> };
    "USDT/RUB": { price: string; change24h: string; series: Array<{ date: string; price: string }> };
  };
  security: SecuritySettings;
  config: {
    depositAddress: string;
    networkFee: string;
    minWithdrawal: string;
    minDeposit: string;
  };
}

// Operation copy mapping
export interface OperationCopy {
  title: string;
  subtitle: string;
  eta?: string;
  reason?: string;
}

export function getOperationCopy(type: string, status: string, metadata?: any): OperationCopy {
  const copyMap: Record<string, Record<string, OperationCopy>> = {
    DEPOSIT_USDT: {
      pending: { title: "USDT Deposit", subtitle: "Waiting for confirmation", eta: "~10 minutes" },
      processing: { title: "USDT Deposit", subtitle: "Processing on network", eta: "~5 minutes" },
      completed: { title: "USDT Deposit", subtitle: "Credited to wallet" },
      failed: { title: "USDT Deposit", subtitle: "Failed", reason: "Transaction not found" },
    },
    DEPOSIT_CARD: {
      pending: { title: "Card Deposit", subtitle: "Processing payment", eta: "~2 minutes" },
      processing: { title: "Card Deposit", subtitle: "Converting to USDT" },
      completed: { title: "Card Deposit", subtitle: "Credited to wallet" },
      failed: { title: "Card Deposit", subtitle: "Payment declined" },
    },
    WITHDRAW_USDT: {
      pending: { title: "USDT Withdrawal", subtitle: "Awaiting approval", eta: "~30 minutes" },
      processing: { title: "USDT Withdrawal", subtitle: "Broadcasting to network", eta: "~10 minutes" },
      completed: { title: "USDT Withdrawal", subtitle: "Sent successfully" },
      failed: { title: "USDT Withdrawal", subtitle: "Withdrawal failed" },
    },
    INVEST: {
      pending: { title: "Investment", subtitle: "Processing allocation" },
      completed: { title: "Investment", subtitle: `Invested in ${metadata?.strategyName || "strategy"}` },
      failed: { title: "Investment", subtitle: "Allocation failed" },
    },
    DAILY_PAYOUT: {
      pending: { title: "Daily Payout", subtitle: "Calculating returns" },
      completed: { title: "Daily Payout", subtitle: "Profit credited" },
    },
    FX: {
      pending: { title: "Currency Exchange", subtitle: "Processing conversion" },
      completed: { title: "Currency Exchange", subtitle: "Conversion complete" },
      failed: { title: "Currency Exchange", subtitle: "Conversion failed" },
    },
    SUBSCRIPTION: {
      pending: { title: "Subscription Fee", subtitle: "Processing" },
      completed: { title: "Subscription Fee", subtitle: "Payment complete" },
    },
    KYC: {
      pending: { title: "Identity Verification", subtitle: "Under review", eta: "~24 hours" },
      completed: { title: "Identity Verification", subtitle: "Approved" },
      failed: { title: "Identity Verification", subtitle: "Rejected" },
    },
    VAULT_TRANSFER: {
      pending: { title: "Vault Transfer", subtitle: "Processing" },
      completed: { title: "Vault Transfer", subtitle: "Transfer complete" },
    },
  };

  return copyMap[type]?.[status] || { title: type, subtitle: status };
}

// Money formatting utilities
export const ASSET_DECIMALS: Record<string, number> = {
  RUB: 2,
  USDT: 6,
};

export function formatMoney(minorUnits: string, asset: string): string {
  const decimals = ASSET_DECIMALS[asset] || 2;
  const value = BigInt(minorUnits || "0");
  const divisor = BigInt(10 ** decimals);
  const whole = value / divisor;
  const fraction = value % divisor;
  const fractionStr = fraction.toString().padStart(decimals, "0");
  
  // Format with appropriate decimal places
  const displayDecimals = asset === "USDT" ? 2 : decimals;
  const truncatedFraction = fractionStr.slice(0, displayDecimals);
  
  return `${whole.toLocaleString()}.${truncatedFraction}`;
}

export function parseMoney(value: string, asset: string): string {
  const decimals = ASSET_DECIMALS[asset] || 2;
  const parts = value.replace(/,/g, "").split(".");
  const whole = parts[0] || "0";
  const fraction = (parts[1] || "").padEnd(decimals, "0").slice(0, decimals);
  return (BigInt(whole) * BigInt(10 ** decimals) + BigInt(fraction)).toString();
}
