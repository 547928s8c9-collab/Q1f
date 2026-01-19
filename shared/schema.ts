import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, boolean, timestamp, jsonb, uniqueIndex, bigint, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Export auth models (users, sessions tables)
export * from "./models/auth";
// Import users for FK references
import { users } from "./models/auth";

// ==================== BALANCES ====================
// Amounts stored as string of integer minor units
export const balances = pgTable("balances", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
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
  userId: varchar("user_id").notNull().references(() => users.id),
  type: text("type").notNull(), // principal, profit, taxes
  asset: text("asset").notNull().default("USDT"),
  balance: text("balance").notNull().default("0"),
  goalName: text("goal_name"), // e.g., "Emergency Fund", "Tax Reserve"
  goalAmount: text("goal_amount"), // target in minor units
  autoSweepPct: integer("auto_sweep_pct").default(0), // 0-100
  autoSweepEnabled: boolean("auto_sweep_enabled").default(false),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertVaultSchema = createInsertSchema(vaults).omit({ id: true, updatedAt: true });
export type InsertVault = z.infer<typeof insertVaultSchema>;
export type Vault = typeof vaults.$inferSelect;

// Vault goal update schema
export const updateVaultGoalSchema = z.object({
  type: z.enum(["principal", "profit", "taxes"]),
  goalName: z.string().max(50).optional().nullable().transform(v => v === "" ? null : v),
  goalAmount: z.string().regex(/^\d+$/, "Must be a valid amount in minor units").optional().nullable().transform(v => v === "" ? null : v),
  autoSweepPct: z.number().int().min(0).max(100).default(0),
  autoSweepEnabled: z.boolean().default(false),
});
export type UpdateVaultGoal = z.infer<typeof updateVaultGoalSchema>;

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

// ==================== STRATEGY PROFILES ====================
export const strategyProfiles = pgTable("strategy_profiles", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  slug: text("slug").notNull(),
  displayName: text("display_name").notNull(),
  symbol: text("symbol").notNull(),
  timeframe: text("timeframe").notNull(),
  description: text("description"),
  riskLevel: text("risk_level").notNull(),
  tags: jsonb("tags"),
  defaultConfig: jsonb("default_config").notNull(),
  configSchema: jsonb("config_schema"),
  isEnabled: boolean("is_enabled").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  uniqueIndex("strategy_profiles_slug_idx").on(table.slug),
]);

export const insertStrategyProfileSchema = createInsertSchema(strategyProfiles).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertStrategyProfile = z.infer<typeof insertStrategyProfileSchema>;
export type StrategyProfile = typeof strategyProfiles.$inferSelect;

// ==================== STRATEGY PERFORMANCE ====================
export const strategyPerformance = pgTable("strategy_performance", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  strategyId: varchar("strategy_id").notNull().references(() => strategies.id),
  day: integer("day").notNull(), // day number 1-90
  date: text("date").notNull(), // RFC3339 date
  equityMinor: text("equity_minor").notNull(), // strategy equity in minor units (starts at 1000 USDT = 1000000000)
  benchmarkBtcMinor: text("benchmark_btc_minor"), // BTC benchmark normalized
  benchmarkEthMinor: text("benchmark_eth_minor"), // ETH benchmark normalized
});

export const insertStrategyPerformanceSchema = createInsertSchema(strategyPerformance).omit({ id: true });
export type InsertStrategyPerformance = z.infer<typeof insertStrategyPerformanceSchema>;
export type StrategyPerformance = typeof strategyPerformance.$inferSelect;

// ==================== SIM TRADING ====================
export const simPositions = pgTable("sim_positions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  strategyId: varchar("strategy_id").notNull().references(() => strategies.id),
  profileSlug: text("profile_slug").notNull(),
  symbol: text("symbol").notNull(),
  timeframe: text("timeframe").notNull(),
  status: text("status").notNull().default("ACTIVE"),
  cashMinor: text("cash_minor").notNull().default("0"),
  positionSide: text("position_side").notNull().default("FLAT"),
  positionQty: text("position_qty").notNull().default("0"),
  positionEntryPrice: text("position_entry_price").notNull().default("0"),
  positionEntryTs: bigint("position_entry_ts", { mode: "number" }),
  equityMinor: text("equity_minor").notNull().default("0"),
  peakEquityMinor: text("peak_equity_minor").notNull().default("0"),
  lastCandleTs: bigint("last_candle_ts", { mode: "number" }),
  lastSnapshotTs: bigint("last_snapshot_ts", { mode: "number" }),
  driftBpsMonthly: integer("drift_bps_monthly").notNull().default(0),
  driftScale: text("drift_scale").notNull().default("1"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  uniqueIndex("sim_positions_strategy_idx").on(table.strategyId),
]);

export const insertSimPositionSchema = createInsertSchema(simPositions).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertSimPosition = z.infer<typeof insertSimPositionSchema>;
export type SimPosition = typeof simPositions.$inferSelect;

export const simTrades = pgTable("sim_trades", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  strategyId: varchar("strategy_id").notNull().references(() => strategies.id),
  status: text("status").notNull().default("OPEN"),
  entryTs: bigint("entry_ts", { mode: "number" }),
  exitTs: bigint("exit_ts", { mode: "number" }),
  entryPrice: text("entry_price"),
  exitPrice: text("exit_price"),
  qty: text("qty").notNull().default("0"),
  grossPnlMinor: text("gross_pnl_minor").default("0"),
  feesMinor: text("fees_minor").default("0"),
  netPnlMinor: text("net_pnl_minor").default("0"),
  holdBars: integer("hold_bars"),
  reason: text("reason"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("sim_trades_strategy_entry_idx").on(table.strategyId, table.entryTs),
  index("sim_trades_strategy_status_idx").on(table.strategyId, table.status),
]);

export const insertSimTradeSchema = createInsertSchema(simTrades).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertSimTrade = z.infer<typeof insertSimTradeSchema>;
export type SimTrade = typeof simTrades.$inferSelect;

export const simEquitySnapshots = pgTable("sim_equity_snapshots", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  strategyId: varchar("strategy_id").notNull().references(() => strategies.id),
  ts: bigint("ts", { mode: "number" }).notNull(),
  equityMinor: text("equity_minor").notNull(),
  cashMinor: text("cash_minor").notNull(),
  positionValueMinor: text("position_value_minor").notNull(),
  drawdownBps: integer("drawdown_bps").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  uniqueIndex("sim_equity_snapshots_strategy_ts_idx").on(table.strategyId, table.ts),
]);

export const insertSimEquitySnapshotSchema = createInsertSchema(simEquitySnapshots).omit({ id: true, createdAt: true });
export type InsertSimEquitySnapshot = z.infer<typeof insertSimEquitySnapshotSchema>;
export type SimEquitySnapshot = typeof simEquitySnapshots.$inferSelect;

// ==================== POSITIONS ====================
export const positions = pgTable("positions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  strategyId: varchar("strategy_id").notNull().references(() => strategies.id),
  principal: text("principal").notNull().default("0"), // legacy field (keep for compatibility)
  currentValue: text("current_value").notNull().default("0"), // legacy field
  principalMinor: text("principal_minor").notNull().default("0"), // original invested amount
  investedCurrentMinor: text("invested_current_minor").notNull().default("0"), // current value including gains/losses
  accruedProfitPayableMinor: text("accrued_profit_payable_minor").notNull().default("0"), // profit available for payout
  lastAccrualDate: text("last_accrual_date"), // last date accrual was processed
  // Risk controls
  paused: boolean("paused").notNull().default(false),
  ddLimitPct: integer("dd_limit_pct").notNull().default(0), // 0 = no limit, otherwise max drawdown % before auto-pause
  autoPauseEnabled: boolean("auto_pause_enabled").notNull().default(false),
  pausedAt: timestamp("paused_at"),
  pausedReason: text("paused_reason"), // e.g., "manual", "dd_breach"
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
  userId: varchar("user_id").notNull().references(() => users.id),
  strategyId: varchar("strategy_id").notNull().references(() => strategies.id),
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
  userId: varchar("user_id").notNull().references(() => users.id),
  type: text("type").notNull(), // DEPOSIT_USDT, DEPOSIT_CARD, WITHDRAW_USDT, INVEST, DAILY_PAYOUT, FX, SUBSCRIPTION, KYC, VAULT_TRANSFER
  status: text("status").notNull(), // pending, processing, completed, failed, cancelled
  asset: text("asset"),
  amount: text("amount"), // minor units as string
  fee: text("fee").default("0"),
  txHash: text("tx_hash"),
  providerRef: text("provider_ref"),
  strategyId: varchar("strategy_id").references(() => strategies.id),
  strategyName: text("strategy_name"),
  fromVault: text("from_vault"),
  toVault: text("to_vault"),
  metadata: jsonb("metadata"),
  reason: text("reason"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("operations_user_created_idx").on(table.userId, table.createdAt),
  index("operations_user_type_created_idx").on(table.userId, table.type, table.createdAt),
]);

export const insertOperationSchema = createInsertSchema(operations).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertOperation = z.infer<typeof insertOperationSchema>;
export type Operation = typeof operations.$inferSelect;

// ==================== WITHDRAWALS ====================
// Withdrawal requests with admin approval workflow
export const WithdrawalStatus = {
  PENDING_REVIEW: "PENDING_REVIEW",
  PENDING_APPROVAL: "PENDING_APPROVAL",
  PENDING: "PENDING", // legacy, kept for compatibility
  APPROVED: "APPROVED",
  PROCESSING: "PROCESSING",
  COMPLETED: "COMPLETED",
  FAILED: "FAILED",
  REJECTED: "REJECTED",
  CANCELLED: "CANCELLED",
} as const;

export type WithdrawalStatusType = typeof WithdrawalStatus[keyof typeof WithdrawalStatus];

export const withdrawals = pgTable("withdrawals", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  userId: varchar("user_id").notNull().references(() => users.id),
  amountMinor: text("amount_minor").notNull(),
  feeMinor: text("fee_minor").notNull().default("0"),
  currency: text("currency").notNull().default("USDT"),
  address: text("address").notNull(),
  status: text("status").notNull().default("PENDING_REVIEW"),
  operationId: varchar("operation_id").references(() => operations.id), // FK to operations.id (created when user submits)
  riskScore: integer("risk_score"),
  riskFlags: jsonb("risk_flags"), // e.g., ["high_amount", "new_address"]
  lastError: text("last_error"),
  reviewedByAdminId: varchar("reviewed_by_admin_id"), // admin user id who reviewed
  reviewedAt: timestamp("reviewed_at"),
  approvedBy: varchar("approved_by"), // admin user id who approved (must be different from reviewer)
  approvedAt: timestamp("approved_at"),
  rejectedBy: varchar("rejected_by"),
  rejectedAt: timestamp("rejected_at"),
  rejectionReason: text("rejection_reason"),
  processedAt: timestamp("processed_at"),
  completedAt: timestamp("completed_at"),
  txHash: text("tx_hash"), // blockchain transaction hash when completed
}, (table) => [
  index("withdrawals_status_created_idx").on(table.status, table.createdAt),
  index("withdrawals_user_created_idx").on(table.userId, table.createdAt),
  index("withdrawals_operation_idx").on(table.operationId),
]);

export const insertWithdrawalSchema = createInsertSchema(withdrawals).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertWithdrawal = z.infer<typeof insertWithdrawalSchema>;
export type Withdrawal = typeof withdrawals.$inferSelect;

// ==================== PORTFOLIO SERIES ====================
export const portfolioSeries = pgTable("portfolio_series", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  date: text("date").notNull(), // RFC3339 date
  value: text("value").notNull(), // USDT minor units
});

export const insertPortfolioSeriesSchema = createInsertSchema(portfolioSeries).omit({ id: true });
export type InsertPortfolioSeries = z.infer<typeof insertPortfolioSeriesSchema>;
export type PortfolioSeries = typeof portfolioSeries.$inferSelect;

// ==================== STRATEGY SERIES ====================
export const strategySeries = pgTable("strategy_series", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  strategyId: varchar("strategy_id").notNull().references(() => strategies.id),
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
  userId: varchar("user_id").notNull().unique().references(() => users.id),
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

// ==================== TWO FACTOR AUTHENTICATION ====================
export const twoFactor = pgTable("two_factor", {
  userId: varchar("user_id").primaryKey().references(() => users.id),
  secretEncrypted: text("secret_encrypted").notNull(),
  enabled: boolean("enabled").notNull().default(false),
  verifiedAt: timestamp("verified_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertTwoFactorSchema = createInsertSchema(twoFactor).omit({ createdAt: true, updatedAt: true });
export type InsertTwoFactor = z.infer<typeof insertTwoFactorSchema>;
export type TwoFactor = typeof twoFactor.$inferSelect;

// Zod schemas for 2FA endpoints
export const twoFactorVerifySchema = z.object({
  code: z.string().length(6).regex(/^\d{6}$/, "Code must be 6 digits"),
});
export type TwoFactorVerifyInput = z.infer<typeof twoFactorVerifySchema>;

export const twoFactorDisableSchema = z.object({
  code: z.string().length(6).regex(/^\d{6}$/, "Code must be 6 digits"),
});
export type TwoFactorDisableInput = z.infer<typeof twoFactorDisableSchema>;

// ==================== WHITELIST ADDRESSES ====================
export const AddressStatus = {
  PENDING_ACTIVATION: "PENDING_ACTIVATION",
  ACTIVE: "ACTIVE",
  DISABLED: "DISABLED",
} as const;

export type AddressStatusType = typeof AddressStatus[keyof typeof AddressStatus];

export const whitelistAddresses = pgTable("whitelist_addresses", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  address: text("address").notNull(),
  label: text("label"),
  network: text("network").default("TRC20"),
  status: text("status").default("PENDING_ACTIVATION"), // PENDING_ACTIVATION, ACTIVE, DISABLED
  activatesAt: timestamp("activates_at"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("whitelist_user_created_idx").on(table.userId, table.createdAt),
]);

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
  userId: varchar("user_id").notNull().references(() => users.id),
  strategyId: varchar("strategy_id").notNull().references(() => strategies.id),
  frequency: text("frequency").notNull().default("MONTHLY"), // DAILY or MONTHLY
  addressId: varchar("address_id").references(() => whitelistAddresses.id), // references whitelist address
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
  userId: varchar("user_id").notNull().references(() => users.id),
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
  userId: varchar("user_id").references(() => users.id),
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
  userId: varchar("user_id").notNull().unique().references(() => users.id),
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

// Mapping from KycStatus (uppercase) to securitySettings.kycStatus (lowercase)
// Used to sync applicant status with legacy security settings field
export const KycStatusToSecurityStatus: Record<KycStatusType, string> = {
  NOT_STARTED: "not_started",
  IN_REVIEW: "in_review",
  APPROVED: "approved",
  NEEDS_ACTION: "needs_action",
  REJECTED: "rejected",
  ON_HOLD: "on_hold",
};

// ==================== NOTIFICATIONS ====================
export const notifications = pgTable("notifications", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  type: text("type").notNull(), // operation, security, kyc, system
  title: text("title").notNull(),
  message: text("message").notNull(),
  resourceType: text("resource_type"), // operation, kyc, security
  resourceId: varchar("resource_id"),
  isRead: boolean("is_read").default(false),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("notifications_user_created_idx").on(table.userId, table.createdAt),
]);

export const insertNotificationSchema = createInsertSchema(notifications).omit({ id: true, createdAt: true });
export type InsertNotification = z.infer<typeof insertNotificationSchema>;
export type Notification = typeof notifications.$inferSelect;

// ==================== NOTIFICATION PREFERENCES ====================
export const notificationPreferences = pgTable("notification_preferences", {
  userId: varchar("user_id").primaryKey().references(() => users.id),
  inAppEnabled: boolean("in_app_enabled").notNull().default(true),
  emailEnabled: boolean("email_enabled").notNull().default(false),
  telegramEnabled: boolean("telegram_enabled").notNull().default(false),
  marketingEnabled: boolean("marketing_enabled").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertNotificationPreferencesSchema = createInsertSchema(notificationPreferences).omit({ createdAt: true, updatedAt: true });
export type InsertNotificationPreferences = z.infer<typeof insertNotificationPreferencesSchema>;
export type NotificationPreferences = typeof notificationPreferences.$inferSelect;

export const updateNotificationPreferencesSchema = z.object({
  inAppEnabled: z.boolean().optional(),
  emailEnabled: z.boolean().optional(),
  telegramEnabled: z.boolean().optional(),
  marketingEnabled: z.boolean().optional(),
});
export type UpdateNotificationPreferences = z.infer<typeof updateNotificationPreferencesSchema>;

// ==================== TELEGRAM ACCOUNTS ====================
export const telegramAccounts = pgTable("telegram_accounts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  telegramUserId: varchar("telegram_user_id").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  uniqueIndex("telegram_accounts_user_idx").on(table.userId),
  uniqueIndex("telegram_accounts_telegram_user_idx").on(table.telegramUserId),
]);

export const insertTelegramAccountSchema = createInsertSchema(telegramAccounts).omit({ id: true, createdAt: true });
export type InsertTelegramAccount = z.infer<typeof insertTelegramAccountSchema>;
export type TelegramAccount = typeof telegramAccounts.$inferSelect;

// ==================== IDEMPOTENCY KEYS ====================
export const idempotencyKeys = pgTable("idempotency_keys", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  idempotencyKey: varchar("idempotency_key", { length: 64 }).notNull(),
  endpoint: text("endpoint").notNull(),
  operationId: varchar("operation_id").references(() => operations.id),
  responseStatus: integer("response_status"), // null = pending/in-progress
  responseBody: jsonb("response_body"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  uniqueIndex("idempotency_user_key_endpoint_idx").on(table.userId, table.idempotencyKey, table.endpoint),
]);

export const insertIdempotencyKeySchema = createInsertSchema(idempotencyKeys).omit({ id: true, createdAt: true });
export type InsertIdempotencyKey = z.infer<typeof insertIdempotencyKeySchema>;
export type IdempotencyKey = typeof idempotencyKeys.$inferSelect;

// ==================== MARKET CANDLES ====================
// OHLCV candle data for charting and analytics
// ts = start-of-candle UTC milliseconds
export const marketCandles = pgTable("market_candles", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  exchange: text("exchange").notNull().default("binance_spot"),
  symbol: text("symbol").notNull(), // e.g., "BTCUSDT", "ETHUSDT"
  timeframe: text("timeframe").notNull(), // "15m" | "1h" | "1d"
  ts: bigint("ts", { mode: "number" }).notNull(), // UTC ms, start-of-candle
  open: text("open").notNull(), // stored as string for precision
  high: text("high").notNull(),
  low: text("low").notNull(),
  close: text("close").notNull(),
  volume: text("volume").notNull(),
}, (table) => [
  uniqueIndex("market_candles_unique_idx").on(table.exchange, table.symbol, table.timeframe, table.ts),
  index("market_candles_symbol_tf_ts_idx").on(table.symbol, table.timeframe, table.ts),
]);

export const insertMarketCandleSchema = createInsertSchema(marketCandles).omit({ id: true });
export type InsertMarketCandle = z.infer<typeof insertMarketCandleSchema>;
export type MarketCandle = typeof marketCandles.$inferSelect;

// ==================== MARKET DATA TYPES ====================
// Timeframe validation
export const VALID_TIMEFRAMES = ["15m", "1h", "1d"] as const;
export type Timeframe = typeof VALID_TIMEFRAMES[number];

// Candle DTO (numbers for API consumers)
export interface Candle {
  ts: number;      // start-of-candle UTC ms
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface InvestTrade {
  id: string;
  entryTs: number;
  exitTs: number;
  entryPrice: number;
  exitPrice: number;
  qty: number;
  netPnl: number;
  netPnlPct: number;
  holdBars: number;
  reason: string;
}

export interface InvestMetrics {
  totalTrades: number;
  winRatePct: number;
  netPnl: number;
  netPnlPct: number;
  grossPnl: number;
  fees: number;
  avgHoldBars: number;
  profitFactor: number;
  avgTradePnl: number;
}

// Gap info for data quality reporting
export interface GapInfo {
  startMs: number;
  endMs: number;
  reason: string;
}

// Result from loading candles
export interface LoadCandlesResult {
  candles: Candle[];
  gaps: GapInfo[];
  source: string; // "cache" | "cache+<exchange>"
}

// Helper: convert DB row to Candle DTO
export function dbRowToCandle(row: MarketCandle): Candle {
  return {
    ts: row.ts,
    open: parseFloat(row.open),
    high: parseFloat(row.high),
    low: parseFloat(row.low),
    close: parseFloat(row.close),
    volume: parseFloat(row.volume),
  };
}

// Notification types for inbox
export const NotificationType = {
  TRANSACTION: "transaction",
  KYC: "kyc",
  SECURITY: "security",
  SYSTEM: "system",
} as const;
export type NotificationTypeValue = typeof NotificationType[keyof typeof NotificationType];

// InboxCard DTO for frontend rendering
export interface InboxCard {
  id: string;
  type: NotificationTypeValue;
  title: string;
  message: string;
  isRead: boolean;
  createdAt: string;
  ctaLabel: string | null;
  ctaPath: string | null;
}

// CTA mapping by notification type (handles both legacy "operation" and new "transaction")
export function getNotificationCta(
  type: string,
  resourceType?: string | null,
  resourceId?: string | null
): { label: string | null; path: string | null } {
  switch (type) {
    case NotificationType.TRANSACTION:
    case "operation": // Legacy type alias
      if (resourceId) {
        return { label: "View receipt", path: `/activity/${resourceId}` };
      }
      return { label: "View activity", path: "/activity" };
    case NotificationType.KYC:
      return { label: "Continue verification", path: "/settings/security" };
    case NotificationType.SECURITY:
      return { label: "Review security", path: "/settings/security" };
    case NotificationType.SYSTEM:
      return { label: null, path: null };
    default:
      return { label: null, path: null };
  }
}

// Normalize notification type to standard values
export function normalizeNotificationType(type: string): NotificationTypeValue {
  if (type === "operation") return NotificationType.TRANSACTION;
  if (Object.values(NotificationType).includes(type as NotificationTypeValue)) {
    return type as NotificationTypeValue;
  }
  return NotificationType.SYSTEM; // Default fallback
}

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
  PAYOUT_SETTINGS_CHANGED: "PAYOUT_SETTINGS_CHANGED",
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

// Vault data with goals
export interface VaultData {
  balance: string;
  goalName: string | null;
  goalAmount: string | null;
  autoSweepPct: number;
  autoSweepEnabled: boolean;
  progress: number; // 0-100 percent of goal reached
}

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
    principal: VaultData;
    profit: VaultData;
    taxes: VaultData;
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
    PROFIT_ACCRUAL: {
      pending: { title: "Profit Accrual", subtitle: "Calculating daily returns" },
      completed: { title: "Profit Accrual", subtitle: `Return from ${metadata?.strategyName || "strategy"}` },
    },
    PROFIT_PAYOUT: {
      pending: { title: "Profit Payout", subtitle: "Processing withdrawal" },
      completed: { title: "Profit Payout", subtitle: `Payout from ${metadata?.strategyName || "strategy"}` },
    },
    PRINCIPAL_REDEEM_EXECUTED: {
      pending: { title: "Principal Redemption", subtitle: "Processing" },
      completed: { title: "Principal Redemption", subtitle: `Principal from ${metadata?.strategyName || "strategy"}` },
    },
    PAYOUT_SETTINGS_CHANGED: {
      completed: { title: "Payout Settings", subtitle: `Settings updated for ${metadata?.strategyName || "strategy"}` },
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

// ==================== ADMIN CONSOLE TABLES ====================
// Stage C: RBAC, Audit, Idempotency, 4-Eyes, Inbox, Incidents

// ==================== A) RBAC ====================

// Admin Users - links to users table via userId
export const adminUsers = pgTable("admin_users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(), // FK to users.id
  email: text("email"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  uniqueIndex("admin_users_user_id_idx").on(table.userId),
  index("admin_users_email_idx").on(table.email),
]);

export const insertAdminUserSchema = createInsertSchema(adminUsers).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertAdminUser = z.infer<typeof insertAdminUserSchema>;
export type AdminUser = typeof adminUsers.$inferSelect;

// Roles
export const roles = pgTable("roles", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  key: text("key").notNull().unique(), // e.g., "super_admin", "ops", "compliance"
  name: text("name").notNull(),
  description: text("description"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertRoleSchema = createInsertSchema(roles).omit({ id: true, createdAt: true });
export type InsertRole = z.infer<typeof insertRoleSchema>;
export type Role = typeof roles.$inferSelect;

// Permissions
export const permissions = pgTable("permissions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  key: text("key").notNull().unique(), // e.g., "users.read", "kyc.review"
  name: text("name").notNull(),
  description: text("description"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertPermissionSchema = createInsertSchema(permissions).omit({ id: true, createdAt: true });
export type InsertPermission = z.infer<typeof insertPermissionSchema>;
export type Permission = typeof permissions.$inferSelect;

// Role <-> Permission mapping
export const rolePermissions = pgTable("role_permissions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  roleId: varchar("role_id").notNull(), // FK to roles.id
  permissionId: varchar("permission_id").notNull(), // FK to permissions.id
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  uniqueIndex("role_permissions_unique_idx").on(table.roleId, table.permissionId),
  index("role_permissions_role_id_idx").on(table.roleId),
]);

export type RolePermission = typeof rolePermissions.$inferSelect;

// Admin User <-> Role mapping
export const adminUserRoles = pgTable("admin_user_roles", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  adminUserId: varchar("admin_user_id").notNull(), // FK to admin_users.id
  roleId: varchar("role_id").notNull(), // FK to roles.id
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  uniqueIndex("admin_user_roles_unique_idx").on(table.adminUserId, table.roleId),
  index("admin_user_roles_admin_user_id_idx").on(table.adminUserId),
]);

export type AdminUserRole = typeof adminUserRoles.$inferSelect;

// ==================== B) ADMIN AUDIT LOG ====================
// Separate from existing audit_logs for admin-specific actions
export const AdminAuditOutcome = {
  SUCCESS: "success",
  FAILURE: "failure",
  PARTIAL: "partial",
} as const;

export type AdminAuditOutcomeType = typeof AdminAuditOutcome[keyof typeof AdminAuditOutcome];

export const adminAuditLogs = pgTable("admin_audit_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  createdAt: timestamp("created_at").defaultNow(),
  actorAdminUserId: varchar("actor_admin_user_id").notNull(), // FK to admin_users.id
  requestId: varchar("request_id"),
  ip: text("ip"),
  userAgent: text("user_agent"),
  actionType: text("action_type").notNull(), // e.g., "WITHDRAWAL_APPROVED", "KYC_REJECTED"
  targetType: text("target_type"), // e.g., "operation", "kyc_applicant", "user"
  targetId: varchar("target_id"),
  beforeJson: jsonb("before_json"),
  afterJson: jsonb("after_json"),
  reason: text("reason"),
  outcome: text("outcome").notNull().default("success"), // success, failure, partial
  errorCode: text("error_code"),
}, (table) => [
  index("admin_audit_logs_created_at_idx").on(table.createdAt),
  index("admin_audit_logs_actor_created_idx").on(table.actorAdminUserId, table.createdAt),
  index("admin_audit_logs_target_idx").on(table.targetType, table.targetId),
  index("admin_audit_logs_request_id_idx").on(table.requestId),
]);

export const insertAdminAuditLogSchema = createInsertSchema(adminAuditLogs).omit({ id: true, createdAt: true });
export type InsertAdminAuditLog = z.infer<typeof insertAdminAuditLogSchema>;
export type AdminAuditLog = typeof adminAuditLogs.$inferSelect;

// ==================== ADMIN IDEMPOTENCY KEYS ====================
export const AdminIdempotencyStatus = {
  PENDING: "pending",
  COMPLETED: "completed",
  FAILED: "failed",
} as const;

export type AdminIdempotencyStatusType = typeof AdminIdempotencyStatus[keyof typeof AdminIdempotencyStatus];

export const adminIdempotencyKeys = pgTable("admin_idempotency_keys", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  createdAt: timestamp("created_at").defaultNow(),
  actorAdminUserId: varchar("actor_admin_user_id").notNull(), // FK to admin_users.id
  endpoint: text("endpoint").notNull(),
  idempotencyKey: varchar("idempotency_key", { length: 64 }).notNull(),
  payloadHash: text("payload_hash"),
  responseJson: jsonb("response_json"),
  status: text("status").notNull().default("pending"), // pending, completed, failed
}, (table) => [
  uniqueIndex("admin_idempotency_unique_idx").on(table.actorAdminUserId, table.endpoint, table.idempotencyKey),
  index("admin_idempotency_created_at_idx").on(table.createdAt),
]);

export const insertAdminIdempotencyKeySchema = createInsertSchema(adminIdempotencyKeys).omit({ id: true, createdAt: true });
export type InsertAdminIdempotencyKey = z.infer<typeof insertAdminIdempotencyKeySchema>;
export type AdminIdempotencyKey = typeof adminIdempotencyKeys.$inferSelect;

// ==================== C) MAKER-CHECKER (4-EYES) ====================
export const PendingActionStatus = {
  PENDING: "PENDING",
  APPROVED: "APPROVED",
  REJECTED: "REJECTED",
  CANCELLED: "CANCELLED",
  EXPIRED: "EXPIRED",
} as const;

export type PendingActionStatusType = typeof PendingActionStatus[keyof typeof PendingActionStatus];

export const pendingAdminActions = pgTable("pending_admin_actions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  createdAt: timestamp("created_at").defaultNow(),
  status: text("status").notNull().default("PENDING"), // PENDING, APPROVED, REJECTED, CANCELLED, EXPIRED
  actionType: text("action_type").notNull(), // e.g., "APPROVE_WITHDRAWAL", "CREATE_CORRECTION"
  targetType: text("target_type").notNull(), // e.g., "operation", "user"
  targetId: varchar("target_id").notNull(),
  makerAdminUserId: varchar("maker_admin_user_id").notNull(), // FK to admin_users.id
  checkerAdminUserId: varchar("checker_admin_user_id"), // FK to admin_users.id (who approved/rejected)
  payloadJson: jsonb("payload_json").notNull(),
  reason: text("reason"),
  decisionAt: timestamp("decision_at"),
  expiresAt: timestamp("expires_at"),
}, (table) => [
  index("pending_admin_actions_status_created_idx").on(table.status, table.createdAt),
  index("pending_admin_actions_action_type_created_idx").on(table.actionType, table.createdAt),
  index("pending_admin_actions_target_idx").on(table.targetType, table.targetId),
  index("pending_admin_actions_maker_idx").on(table.makerAdminUserId),
]);

export const insertPendingAdminActionSchema = createInsertSchema(pendingAdminActions).omit({ id: true, createdAt: true });
export type InsertPendingAdminAction = z.infer<typeof insertPendingAdminActionSchema>;
export type PendingAdminAction = typeof pendingAdminActions.$inferSelect;

// ==================== D) OUTBOX / INBOX ====================
// Outbox for async event processing
export const outboxEvents = pgTable("outbox_events", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  createdAt: timestamp("created_at").defaultNow(),
  eventType: text("event_type").notNull(), // e.g., "WITHDRAWAL_APPROVED", "KYC_APPROVED"
  payloadJson: jsonb("payload_json").notNull(),
  actorAdminUserId: varchar("actor_admin_user_id"), // FK to admin_users.id (nullable for system events)
  processedAt: timestamp("processed_at"),
  attempts: integer("attempts").notNull().default(0),
  lastError: text("last_error"),
}, (table) => [
  index("outbox_events_processed_at_idx").on(table.processedAt),
  index("outbox_events_created_at_idx").on(table.createdAt),
  index("outbox_events_event_type_idx").on(table.eventType),
]);

export const insertOutboxEventSchema = createInsertSchema(outboxEvents).omit({ id: true, createdAt: true });
export type InsertOutboxEvent = z.infer<typeof insertOutboxEventSchema>;
export type OutboxEvent = typeof outboxEvents.$inferSelect;

// Admin Inbox Items (work queue)
export const AdminInboxStatus = {
  OPEN: "OPEN",
  IN_PROGRESS: "IN_PROGRESS",
  DONE: "DONE",
  DISMISSED: "DISMISSED",
} as const;

export type AdminInboxStatusType = typeof AdminInboxStatus[keyof typeof AdminInboxStatus];

export const AdminInboxPriority = {
  CRITICAL: "critical",
  HIGH: "high",
  MEDIUM: "medium",
  LOW: "low",
} as const;

export type AdminInboxPriorityType = typeof AdminInboxPriority[keyof typeof AdminInboxPriority];

export const AdminInboxType = {
  WITHDRAWAL_PENDING: "WITHDRAWAL_PENDING",
  KYC_REVIEW: "KYC_REVIEW",
  KYC_ON_HOLD: "KYC_ON_HOLD",
  SIM_FAILED: "SIM_FAILED",
  SWEEP_FAILED: "SWEEP_FAILED",
  INCIDENT_DRAFT: "INCIDENT_DRAFT",
  BALANCE_ASSERTION: "BALANCE_ASSERTION",
  FOUR_EYES_PENDING: "FOUR_EYES_PENDING",
} as const;

export type AdminInboxTypeValue = typeof AdminInboxType[keyof typeof AdminInboxType];

export const adminInboxItems = pgTable("admin_inbox_items", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  createdAt: timestamp("created_at").defaultNow(),
  type: text("type").notNull(), // AdminInboxType values
  priority: text("priority").notNull().default("medium"), // critical, high, medium, low
  status: text("status").notNull().default("OPEN"), // OPEN, IN_PROGRESS, DONE, DISMISSED
  ownerAdminUserId: varchar("owner_admin_user_id"), // FK to admin_users.id (assigned owner)
  nextAction: text("next_action"), // e.g., "Review withdrawal", "Approve KYC"
  entityType: text("entity_type"), // e.g., "operation", "kyc_applicant"
  entityId: varchar("entity_id"),
  userId: varchar("user_id"), // Affected user (for filtering)
  payloadJson: jsonb("payload_json"),
  resolvedAt: timestamp("resolved_at"),
  resolvedByAdminUserId: varchar("resolved_by_admin_user_id"),
}, (table) => [
  index("admin_inbox_status_priority_created_idx").on(table.status, table.priority, table.createdAt),
  index("admin_inbox_owner_status_idx").on(table.ownerAdminUserId, table.status),
  index("admin_inbox_type_status_created_idx").on(table.type, table.status, table.createdAt),
  index("admin_inbox_entity_idx").on(table.entityType, table.entityId),
]);

export const insertAdminInboxItemSchema = createInsertSchema(adminInboxItems).omit({ id: true, createdAt: true });
export type InsertAdminInboxItem = z.infer<typeof insertAdminInboxItemSchema>;
export type AdminInboxItem = typeof adminInboxItems.$inferSelect;

// ==================== E) INCIDENTS / STATUS MESSAGES ====================
export const IncidentStatus = {
  DRAFT: "DRAFT",
  SCHEDULED: "SCHEDULED",
  ACTIVE: "ACTIVE",
  RESOLVED: "RESOLVED",
  CANCELLED: "CANCELLED",
} as const;

export type IncidentStatusType = typeof IncidentStatus[keyof typeof IncidentStatus];

export const IncidentSeverity = {
  INFO: "info",
  WARNING: "warning",
  CRITICAL: "critical",
  MAINTENANCE: "maintenance",
} as const;

export type IncidentSeverityType = typeof IncidentSeverity[keyof typeof IncidentSeverity];

export const incidents = pgTable("incidents", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  status: text("status").notNull().default("DRAFT"), // DRAFT, SCHEDULED, ACTIVE, RESOLVED, CANCELLED
  title: text("title").notNull(),
  message: text("message").notNull(),
  severity: text("severity").notNull().default("info"), // info, warning, critical, maintenance
  startsAt: timestamp("starts_at"),
  endsAt: timestamp("ends_at"),
  createdByAdminUserId: varchar("created_by_admin_user_id").notNull(), // FK to admin_users.id
  resolvedByAdminUserId: varchar("resolved_by_admin_user_id"),
  resolvedAt: timestamp("resolved_at"),
}, (table) => [
  index("incidents_status_starts_at_idx").on(table.status, table.startsAt),
  index("incidents_created_at_idx").on(table.createdAt),
]);

export const insertIncidentSchema = createInsertSchema(incidents).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertIncident = z.infer<typeof insertIncidentSchema>;
export type Incident = typeof incidents.$inferSelect;

// ==================== ADMIN SEED DATA CONSTANTS ====================
// Used by seed scripts to initialize RBAC

export const SEED_ROLES = [
  { key: "super_admin", name: "Super Admin", description: "Full platform access" },
  { key: "ops", name: "Operations", description: "Operations management" },
  { key: "compliance", name: "Compliance", description: "KYC/AML and audit access" },
  { key: "support", name: "Support", description: "User support, read-heavy" },
  { key: "read_only", name: "Read Only", description: "View-only access for auditors" },
] as const;

export const SEED_PERMISSIONS = [
  // Users
  { key: "users.read", name: "View Users", description: "View user profiles and data" },
  { key: "users.write", name: "Modify Users", description: "Modify user settings (non-money)" },
  { key: "users.suspend", name: "Suspend Users", description: "Suspend/unsuspend user accounts" },
  // KYC
  { key: "kyc.read", name: "View KYC", description: "View KYC submissions" },
  { key: "kyc.review", name: "Review KYC", description: "Approve/reject/request-action KYC" },
  // Money
  { key: "money.read", name: "View Operations", description: "View operations ledger" },
  { key: "money.approve_withdrawal", name: "Approve Withdrawals", description: "Approve pending withdrawals" },
  { key: "money.create_correction", name: "Create Corrections", description: "Create correction operations" },
  { key: "money.vault_override", name: "Override Vaults", description: "Override vault settings" },
  // Withdrawals
  { key: "withdrawals.read", name: "View Withdrawals", description: "View withdrawal queue" },
  { key: "withdrawals.approve", name: "Approve Withdrawals", description: "Approve/reject withdrawal requests (4-eyes)" },
  { key: "withdrawals.manage", name: "Manage Withdrawals", description: "Mark withdrawals as processing/completed/failed" },
  // Strategies
  { key: "strategies.read", name: "View Strategies", description: "View strategies" },
  { key: "strategies.pause", name: "Pause Strategies", description: "Pause/resume strategies" },
  { key: "strategies.risk_limits", name: "Modify Risk Limits", description: "Modify risk limits" },
  { key: "strategies.visibility", name: "Strategy Visibility", description: "Change strategy visibility/eligibility" },
  // Sim Sessions
  { key: "sim.read", name: "View Sessions", description: "View simulation sessions" },
  { key: "sim.control", name: "Control Sessions", description: "Start/stop/cancel sessions" },
  // Incidents
  { key: "incidents.read", name: "View Incidents", description: "View incidents" },
  { key: "incidents.publish", name: "Publish Incidents", description: "Create/publish incidents" },
  { key: "incidents.resolve", name: "Resolve Incidents", description: "Resolve incidents" },
  // Exports
  { key: "exports.generate", name: "Generate Exports", description: "Generate CSV/PDF exports" },
  // Audit
  { key: "audit.read", name: "View Audit Logs", description: "View audit logs" },
  // Inbox
  { key: "inbox.read", name: "View Inbox", description: "View admin inbox items" },
  { key: "inbox.manage", name: "Manage Inbox", description: "Assign/resolve inbox items" },
  // Access
  { key: "access.read", name: "View Access", description: "View roles and permissions" },
  { key: "access.manage", name: "Manage Access", description: "Modify roles and permissions" },
  // Config
  { key: "config.read", name: "View Config", description: "View feature flags and settings" },
  { key: "config.write", name: "Modify Config", description: "Modify feature flags and settings" },
] as const;

// Role -> Permission matrix (based on docs/admin/spec.md)
export const SEED_ROLE_PERMISSIONS: Record<string, string[]> = {
  super_admin: [
    "users.read", "users.write", "users.suspend",
    "kyc.read", "kyc.review",
    "money.read", "money.approve_withdrawal", "money.create_correction", "money.vault_override",
    "withdrawals.read", "withdrawals.approve", "withdrawals.manage",
    "strategies.read", "strategies.pause", "strategies.risk_limits", "strategies.visibility",
    "sim.read", "sim.control",
    "incidents.read", "incidents.publish", "incidents.resolve",
    "exports.generate",
    "audit.read",
    "inbox.read", "inbox.manage",
    "access.read", "access.manage",
    "config.read", "config.write",
  ],
  ops: [
    "users.read", "users.write", "users.suspend",
    "kyc.read",
    "money.read", "money.approve_withdrawal", "money.vault_override",
    "withdrawals.read", "withdrawals.approve", "withdrawals.manage",
    "strategies.read", "strategies.pause", "strategies.risk_limits", "strategies.visibility",
    "sim.read", "sim.control",
    "incidents.read", "incidents.publish", "incidents.resolve",
    "exports.generate",
    "audit.read",
    "inbox.read", "inbox.manage",
    "config.read",
  ],
  compliance: [
    "users.read",
    "kyc.read", "kyc.review",
    "money.read",
    "strategies.read",
    "sim.read",
    "incidents.read",
    "exports.generate",
    "audit.read",
  ],
  support: [
    "users.read", "users.write",
    "kyc.read",
    "money.read",
    "strategies.read",
    "sim.read",
    "incidents.read",
  ],
  read_only: [
    "users.read",
    "kyc.read",
    "money.read",
    "strategies.read",
    "sim.read",
    "incidents.read",
    "audit.read",
  ],
};
