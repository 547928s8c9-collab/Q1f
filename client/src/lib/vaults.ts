import type { BootstrapResponse } from "@shared/schema";

export type VaultType = "wallet" | "principal" | "profit" | "taxes";

export interface VaultTransferInput {
  fromVault: VaultType;
  toVault: VaultType;
  amount: string;
}

const MINOR_HUNDRED = 100n;

function calculateVaultProgress(balance: string, goalAmount: string | null): number {
  if (!goalAmount) return 0;
  const goalMinor = BigInt(goalAmount);
  if (goalMinor <= 0n) return 0;
  const balanceMinor = BigInt(balance);
  const progress = (balanceMinor * 10000n) / goalMinor;
  return Number(progress) / Number(MINOR_HUNDRED);
}

export function updateBootstrapAfterTransfer(
  bootstrap: BootstrapResponse,
  { fromVault, toVault, amount }: VaultTransferInput,
): BootstrapResponse {
  const delta = BigInt(amount || "0");
  if (delta === 0n) return bootstrap;

  const nextBalances = {
    ...bootstrap.balances,
    USDT: {
      ...bootstrap.balances.USDT,
    },
  };
  const nextVaults = {
    ...bootstrap.vaults,
    principal: { ...bootstrap.vaults.principal },
    profit: { ...bootstrap.vaults.profit },
    taxes: { ...bootstrap.vaults.taxes },
  };

  const adjustWallet = (change: bigint) => {
    nextBalances.USDT.available = (BigInt(nextBalances.USDT.available) + change).toString();
  };

  const adjustVault = (vault: Exclude<VaultType, "wallet">, change: bigint) => {
    const currentVault = nextVaults[vault];
    const nextBalance = (BigInt(currentVault.balance) + change).toString();
    nextVaults[vault] = {
      ...currentVault,
      balance: nextBalance,
      progress: calculateVaultProgress(nextBalance, currentVault.goalAmount),
    };
  };

  if (fromVault === "wallet") {
    adjustWallet(-delta);
    if (toVault !== "wallet") {
      adjustVault(toVault, delta);
    }
  } else if (toVault === "wallet") {
    adjustVault(fromVault, -delta);
    adjustWallet(delta);
  } else {
    adjustVault(fromVault, -delta);
    adjustVault(toVault, delta);
  }

  return {
    ...bootstrap,
    balances: nextBalances,
    vaults: nextVaults,
  };
}
