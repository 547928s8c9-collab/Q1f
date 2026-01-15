import { db } from "./db";
import { eq } from "drizzle-orm";
import {
  users,
  balances,
  vaults,
  strategies,
  positions,
  operations,
  portfolioSeries,
  strategySeries,
  quotes,
  securitySettings,
} from "@shared/schema";

const DEMO_USER_ID = "demo-user";

async function seed() {
  console.log("Seeding database...");

  const now = new Date();

  // Clear existing data for clean seed
  await db.delete(portfolioSeries);
  await db.delete(strategySeries);
  await db.delete(quotes);
  await db.delete(operations);
  await db.delete(positions);
  await db.delete(balances);
  await db.delete(vaults);
  await db.delete(securitySettings);
  await db.delete(strategies);
  await db.delete(users);

  // Create demo user
  await db.insert(users).values({
    id: DEMO_USER_ID,
    username: "demo",
    password: "demo",
    consentAccepted: true,
    kycStatus: "approved",
  });

  // Create balances
  await db.insert(balances).values([
    { userId: DEMO_USER_ID, asset: "USDT", available: "5000000000", locked: "0" },
    { userId: DEMO_USER_ID, asset: "RUB", available: "15000000", locked: "0" },
  ]);

  // Create vaults
  await db.insert(vaults).values([
    { userId: DEMO_USER_ID, type: "principal", asset: "USDT", balance: "1000000000" },
    { userId: DEMO_USER_ID, type: "profit", asset: "USDT", balance: "250000000" },
    { userId: DEMO_USER_ID, type: "taxes", asset: "USDT", balance: "75000000" },
  ]);

  // Create strategies
  const strategyMomentum = "strategy-momentum";
  const strategyArbitrage = "strategy-arbitrage";

  await db.insert(strategies).values([
    {
      id: strategyMomentum,
      name: "Momentum Alpha",
      description: "Captures trending moves in major crypto pairs using advanced technical analysis and ML-driven signals.",
      riskLevel: "medium",
      minInvestment: "100000000",
      expectedReturn: "8.5",
      maxDrawdown: "12",
      winRate: "67",
      fees: "2",
      isActive: true,
    },
    {
      id: strategyArbitrage,
      name: "Cross-Exchange Arbitrage",
      description: "Low-risk strategy exploiting price inefficiencies across multiple exchanges with minimal exposure.",
      riskLevel: "low",
      minInvestment: "500000000",
      expectedReturn: "4.2",
      maxDrawdown: "3",
      winRate: "89",
      fees: "1.5",
      isActive: true,
    },
  ]);

  // Create position
  await db.insert(positions).values({
    userId: DEMO_USER_ID,
    strategyId: strategyMomentum,
    principal: "2000000000",
    currentValue: "2150000000",
  });

  // Create security settings
  await db.insert(securitySettings).values({
    userId: DEMO_USER_ID,
    twoFactorEnabled: false,
    whitelistEnabled: false,
    addressDelay: 0,
    autoSweepEnabled: false,
  });

  // Generate portfolio series (90 days)
  let portfolioValue = 5000000000;
  const portfolioData = [];
  for (let i = 89; i >= 0; i--) {
    const date = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
    const dailyChange = (Math.random() - 0.45) * 0.015;
    portfolioValue = Math.round(portfolioValue * (1 + dailyChange));
    portfolioData.push({
      userId: DEMO_USER_ID,
      date: date.toISOString().split("T")[0],
      value: portfolioValue.toString(),
    });
  }
  await db.insert(portfolioSeries).values(portfolioData);

  // Generate strategy series
  for (const strategyId of [strategyMomentum, strategyArbitrage]) {
    let stratValue = 100;
    const stratData = [];
    for (let i = 89; i >= 0; i--) {
      const date = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
      const dailyChange = (Math.random() - 0.42) * 0.012;
      stratValue = stratValue * (1 + dailyChange);
      stratData.push({
        strategyId,
        date: date.toISOString().split("T")[0],
        value: stratValue.toFixed(2),
      });
    }
    await db.insert(strategySeries).values(stratData);
  }

  // Generate quote series
  const pairs = [
    { pair: "BTC/USDT", basePrice: 67500 },
    { pair: "ETH/USDT", basePrice: 3450 },
    { pair: "USDT/RUB", basePrice: 92.5 },
  ];

  for (const { pair, basePrice } of pairs) {
    let price = basePrice;
    const quoteData = [];
    for (let i = 89; i >= 0; i--) {
      const date = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
      const dailyChange = (Math.random() - 0.5) * 0.03;
      price = price * (1 + dailyChange);
      quoteData.push({
        pair,
        date: date.toISOString().split("T")[0],
        price: price.toFixed(2),
        change24h: (dailyChange * 100).toFixed(2),
      });
    }
    await db.insert(quotes).values(quoteData);
  }

  // Generate operations history
  const operationsData = [
    { type: "DEPOSIT_USDT", status: "completed", asset: "USDT", amount: "1000000000", daysAgo: 14 },
    { type: "DEPOSIT_CARD", status: "completed", asset: "USDT", amount: "500000000", daysAgo: 12 },
    { type: "INVEST", status: "completed", asset: "USDT", amount: "2000000000", strategyId: strategyMomentum, strategyName: "Momentum Alpha", daysAgo: 10 },
    { type: "DAILY_PAYOUT", status: "completed", asset: "USDT", amount: "15000000", daysAgo: 8 },
    { type: "DAILY_PAYOUT", status: "completed", asset: "USDT", amount: "18500000", daysAgo: 6 },
    { type: "DAILY_PAYOUT", status: "completed", asset: "USDT", amount: "12300000", daysAgo: 4 },
    { type: "SUBSCRIPTION", status: "completed", asset: "USDT", amount: "9990000", daysAgo: 2 },
    { type: "VAULT_TRANSFER", status: "completed", asset: "USDT", amount: "100000000", fromVault: "wallet", toVault: "principal", daysAgo: 1 },
  ];

  for (const op of operationsData) {
    const createdAt = new Date(now.getTime() - op.daysAgo * 24 * 60 * 60 * 1000);
    await db.insert(operations).values({
      userId: DEMO_USER_ID,
      type: op.type,
      status: op.status,
      asset: op.asset || null,
      amount: op.amount || null,
      fee: "0",
      txHash: op.type.includes("DEPOSIT") ? `0x${crypto.randomUUID().replace(/-/g, "")}` : null,
      providerRef: null,
      strategyId: op.strategyId || null,
      strategyName: op.strategyName || null,
      fromVault: op.fromVault || null,
      toVault: op.toVault || null,
      metadata: null,
      reason: null,
      createdAt,
      updatedAt: createdAt,
    });
  }

  console.log("Seeding complete!");
}

seed().catch(console.error);
