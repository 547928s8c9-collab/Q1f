export type FeeType = "profit" | "aum";
export type BillingCycle = "monthly" | "on_withdrawal";

export interface TierFeeConfig {
  feeType: FeeType;
  feePercent: number;
  billingCycle: BillingCycle;
}

export interface ManagementFeeConfig {
  tiers: {
    stable: TierFeeConfig;
    active: TierFeeConfig;
    aggressive: TierFeeConfig;
  };
  updatedAt: string;
}

const DEFAULT_CONFIG: ManagementFeeConfig = {
  tiers: {
    stable:     { feeType: "profit", feePercent: 15, billingCycle: "monthly" },
    active:     { feeType: "profit", feePercent: 20, billingCycle: "monthly" },
    aggressive: { feeType: "profit", feePercent: 25, billingCycle: "monthly" },
  },
  updatedAt: new Date().toISOString(),
};

let _config: ManagementFeeConfig = {
  ...DEFAULT_CONFIG,
  tiers: { ...DEFAULT_CONFIG.tiers },
};

export function getManagementFeeConfig(): ManagementFeeConfig {
  return _config;
}

export function setManagementFeeConfig(tiers: ManagementFeeConfig["tiers"]): ManagementFeeConfig {
  _config = { tiers, updatedAt: new Date().toISOString() };
  return _config;
}
