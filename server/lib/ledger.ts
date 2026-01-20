import type { Balance, Operation, Position, Vault } from "@shared/schema";

type VaultTotals = Record<string, bigint>;

export interface LedgerTotals {
  walletAvailableMinor: bigint;
  vaultsMinor: VaultTotals;
  allocatedMinor: bigint;
  pnlMinor: bigint;
}

export interface HoldingsTotals {
  walletAvailableMinor: bigint;
  vaultsMinor: VaultTotals;
  availableMinor: bigint;
  allocatedMinor: bigint;
  pnlMinor: bigint;
  equityMinor: bigint;
}

export interface ReconciliationIssue {
  code: string;
  message: string;
  expectedMinor?: string;
  actualMinor?: string;
  deltaMinor?: string;
}

export interface ReconciliationResult {
  userId: string;
  ledger: LedgerTotals;
  holdings: HoldingsTotals;
  issues: ReconciliationIssue[];
  ok: boolean;
}

function toMinor(value?: string | null): bigint {
  if (!value) return 0n;
  try {
    return BigInt(value);
  } catch {
    return 0n;
  }
}

function addVaultDelta(vaults: VaultTotals, key: string | null | undefined, delta: bigint): void {
  if (!key) return;
  vaults[key] = (vaults[key] ?? 0n) + delta;
}

function getOperationFee(op: Operation): bigint {
  const fee = toMinor(op.fee);
  if (fee !== 0n) return fee;
  if (op.metadata && typeof op.metadata === "object" && "refundedFee" in op.metadata) {
    return toMinor((op.metadata as { refundedFee?: string }).refundedFee);
  }
  return 0n;
}

function shouldIncludeInLedger(op: Operation): boolean {
  if (op.asset && op.asset !== "USDT") return false;
  const status = (op.status || "").toLowerCase();
  return status === "pending" || status === "processing" || status === "completed" || status === "";
}

export function computeLedgerTotals(operations: Operation[]): LedgerTotals {
  const totals: LedgerTotals = {
    walletAvailableMinor: 0n,
    vaultsMinor: {},
    allocatedMinor: 0n,
    pnlMinor: 0n,
  };

  for (const op of operations) {
    if (!shouldIncludeInLedger(op)) continue;
    const amount = toMinor(op.amount);
    const fee = getOperationFee(op);

    switch (op.type) {
      case "DEPOSIT_USDT":
      case "DEPOSIT_CARD":
        totals.walletAvailableMinor += amount;
        break;
      case "WITHDRAW_USDT":
        totals.walletAvailableMinor -= amount + fee;
        break;
      case "WITHDRAW_REFUND":
        totals.walletAvailableMinor += amount + fee;
        break;
      case "INVEST":
        totals.walletAvailableMinor -= amount;
        totals.allocatedMinor += amount;
        break;
      case "VAULT_TRANSFER":
        if (op.fromVault === "wallet") {
          totals.walletAvailableMinor -= amount;
          addVaultDelta(totals.vaultsMinor, op.toVault, amount);
        } else if (op.toVault === "wallet") {
          totals.walletAvailableMinor += amount;
          addVaultDelta(totals.vaultsMinor, op.fromVault, -amount);
        } else {
          addVaultDelta(totals.vaultsMinor, op.fromVault, -amount);
          addVaultDelta(totals.vaultsMinor, op.toVault, amount);
        }
        break;
      case "PROFIT_ACCRUAL":
        totals.pnlMinor += amount;
        break;
      default:
        break;
    }
  }

  return totals;
}

export function computeHoldingsTotals(params: {
  balances: Balance[];
  vaults: Vault[];
  positions: Position[];
}): HoldingsTotals {
  const walletAvailableMinor = params.balances
    .filter((balance) => balance.asset === "USDT")
    .reduce((sum, balance) => sum + toMinor(balance.available), 0n);

  const vaultsMinor = params.vaults
    .filter((vault) => vault.asset === "USDT")
    .reduce<VaultTotals>((acc, vault) => {
      acc[vault.type] = (acc[vault.type] ?? 0n) + toMinor(vault.balance);
      return acc;
    }, {});

  const availableMinor = walletAvailableMinor + Object.values(vaultsMinor).reduce((sum, value) => sum + value, 0n);

  let allocatedMinor = 0n;
  let pnlMinor = 0n;

  for (const position of params.positions) {
    const principal = toMinor(position.principalMinor || position.principal);
    const invested = toMinor(position.investedCurrentMinor || position.currentValue || position.principalMinor || position.principal);
    allocatedMinor += principal;
    pnlMinor += invested - principal;
  }

  const equityMinor = availableMinor + allocatedMinor + pnlMinor;

  return {
    walletAvailableMinor,
    vaultsMinor,
    availableMinor,
    allocatedMinor,
    pnlMinor,
    equityMinor,
  };
}

export function validateHoldingsInvariants(holdings: HoldingsTotals): ReconciliationIssue[] {
  const issues: ReconciliationIssue[] = [];

  if (holdings.walletAvailableMinor < 0n) {
    issues.push({
      code: "WALLET_NEGATIVE",
      message: "Wallet available balance is negative",
      actualMinor: holdings.walletAvailableMinor.toString(),
    });
  }

  if (holdings.allocatedMinor < 0n) {
    issues.push({
      code: "ALLOCATED_NEGATIVE",
      message: "Allocated principal is negative",
      actualMinor: holdings.allocatedMinor.toString(),
    });
  }

  return issues;
}

export function reconcileUser(params: {
  userId: string;
  operations: Operation[];
  balances: Balance[];
  vaults: Vault[];
  positions: Position[];
}): ReconciliationResult {
  const ledger = computeLedgerTotals(params.operations);
  const holdings = computeHoldingsTotals({
    balances: params.balances,
    vaults: params.vaults,
    positions: params.positions,
  });

  const issues = validateHoldingsInvariants(holdings);

  if (ledger.walletAvailableMinor !== holdings.walletAvailableMinor) {
    const delta = holdings.walletAvailableMinor - ledger.walletAvailableMinor;
    issues.push({
      code: "WALLET_MISMATCH",
      message: "Wallet available balance does not match ledger",
      expectedMinor: ledger.walletAvailableMinor.toString(),
      actualMinor: holdings.walletAvailableMinor.toString(),
      deltaMinor: delta.toString(),
    });
  }

  for (const [vaultType, expected] of Object.entries(ledger.vaultsMinor)) {
    const actual = holdings.vaultsMinor[vaultType] ?? 0n;
    if (actual !== expected) {
      const delta = actual - expected;
      issues.push({
        code: "VAULT_MISMATCH",
        message: `Vault ${vaultType} balance does not match ledger`,
        expectedMinor: expected.toString(),
        actualMinor: actual.toString(),
        deltaMinor: delta.toString(),
      });
    }
  }

  if (ledger.allocatedMinor !== holdings.allocatedMinor) {
    const delta = holdings.allocatedMinor - ledger.allocatedMinor;
    issues.push({
      code: "ALLOCATED_MISMATCH",
      message: "Allocated principal does not match ledger",
      expectedMinor: ledger.allocatedMinor.toString(),
      actualMinor: holdings.allocatedMinor.toString(),
      deltaMinor: delta.toString(),
    });
  }

  if (ledger.pnlMinor !== holdings.pnlMinor) {
    const delta = holdings.pnlMinor - ledger.pnlMinor;
    issues.push({
      code: "PNL_MISMATCH",
      message: "PnL does not match ledger accruals",
      expectedMinor: ledger.pnlMinor.toString(),
      actualMinor: holdings.pnlMinor.toString(),
      deltaMinor: delta.toString(),
    });
  }

  const ledgerEquity = ledger.walletAvailableMinor
    + Object.values(ledger.vaultsMinor).reduce((sum, value) => sum + value, 0n)
    + ledger.allocatedMinor
    + ledger.pnlMinor;

  if (ledgerEquity !== holdings.equityMinor) {
    const delta = holdings.equityMinor - ledgerEquity;
    issues.push({
      code: "EQUITY_MISMATCH",
      message: "Equity does not reconcile (possible double-apply of PnL)",
      expectedMinor: ledgerEquity.toString(),
      actualMinor: holdings.equityMinor.toString(),
      deltaMinor: delta.toString(),
    });
  }

  return {
    userId: params.userId,
    ledger,
    holdings,
    issues,
    ok: issues.length === 0,
  };
}
