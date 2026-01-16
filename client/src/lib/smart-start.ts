export type RiskProfile = "conservative" | "balanced" | "aggressive";
export type TimeHorizon = "short" | "medium" | "long";
export type InvestmentGoal = "preservation" | "growth" | "income";

export interface SmartStartAnswers {
  riskProfile: RiskProfile;
  timeHorizon: TimeHorizon;
  investmentGoal: InvestmentGoal;
}

export interface StrategyRecommendation {
  strategyName: string;
  allocation: number;
  riskTier: "LOW" | "CORE" | "HIGH";
  reason: string;
}

export interface SmartStartResult {
  recommendations: StrategyRecommendation[];
  suggestedDeposit: number;
  riskScore: number;
  profile: string;
}

const STORAGE_KEY = "zeon_smart_start";

export function saveSmartStartAnswers(answers: SmartStartAnswers): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    ...answers,
    timestamp: new Date().toISOString(),
  }));
}

export function getSmartStartAnswers(): SmartStartAnswers | null {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (!stored) return null;
  try {
    return JSON.parse(stored);
  } catch {
    return null;
  }
}

export function clearSmartStartAnswers(): void {
  localStorage.removeItem(STORAGE_KEY);
}

export function calculateRecommendations(answers: SmartStartAnswers): SmartStartResult {
  const { riskProfile, timeHorizon, investmentGoal } = answers;

  let riskScore = 0;
  if (riskProfile === "conservative") riskScore += 1;
  else if (riskProfile === "balanced") riskScore += 2;
  else riskScore += 3;

  if (timeHorizon === "short") riskScore += 0;
  else if (timeHorizon === "medium") riskScore += 1;
  else riskScore += 2;

  if (investmentGoal === "preservation") riskScore += 0;
  else if (investmentGoal === "income") riskScore += 1;
  else riskScore += 2;

  const recommendations: StrategyRecommendation[] = [];
  let suggestedDeposit = 500;
  let profile = "Balanced Investor";

  if (riskScore <= 2) {
    profile = "Conservative Investor";
    suggestedDeposit = 1000;
    recommendations.push(
      { strategyName: "Stable Yield", allocation: 50, riskTier: "LOW", reason: "Low-risk stablecoin farming for steady returns" },
      { strategyName: "Fixed Income Plus", allocation: 30, riskTier: "LOW", reason: "Diversified lending for enhanced yield" },
      { strategyName: "Market Neutral", allocation: 20, riskTier: "CORE", reason: "Small allocation for market-independent returns" },
    );
  } else if (riskScore <= 4) {
    profile = "Balanced Investor";
    suggestedDeposit = 500;
    recommendations.push(
      { strategyName: "Fixed Income Plus", allocation: 25, riskTier: "LOW", reason: "Stable base with predictable returns" },
      { strategyName: "Balanced Growth", allocation: 35, riskTier: "CORE", reason: "Core holding for balanced exposure" },
      { strategyName: "DeFi Momentum", allocation: 25, riskTier: "CORE", reason: "Momentum strategy for active returns" },
      { strategyName: "Alpha Seeker", allocation: 15, riskTier: "HIGH", reason: "Small high-risk allocation for upside" },
    );
  } else if (riskScore <= 5) {
    profile = "Growth Investor";
    suggestedDeposit = 300;
    recommendations.push(
      { strategyName: "Balanced Growth", allocation: 25, riskTier: "CORE", reason: "Balanced core for stability" },
      { strategyName: "DeFi Momentum", allocation: 30, riskTier: "CORE", reason: "Active DeFi exposure for growth" },
      { strategyName: "Alpha Seeker", allocation: 25, riskTier: "HIGH", reason: "Aggressive arbitrage opportunities" },
      { strategyName: "Volatility Harvester", allocation: 20, riskTier: "HIGH", reason: "Options-based volatility capture" },
    );
  } else {
    profile = "Aggressive Investor";
    suggestedDeposit = 200;
    recommendations.push(
      { strategyName: "DeFi Momentum", allocation: 20, riskTier: "CORE", reason: "Active rotation for solid returns" },
      { strategyName: "Alpha Seeker", allocation: 30, riskTier: "HIGH", reason: "Maximum alpha generation" },
      { strategyName: "Volatility Harvester", allocation: 25, riskTier: "HIGH", reason: "High volatility capture potential" },
      { strategyName: "Moonshot Portfolio", allocation: 25, riskTier: "HIGH", reason: "High-conviction altcoin picks" },
    );
  }

  return {
    recommendations,
    suggestedDeposit,
    riskScore,
    profile,
  };
}

export const questions = {
  riskProfile: {
    question: "How would you describe your risk tolerance?",
    options: [
      { value: "conservative", label: "Conservative", description: "I prefer stability over high returns" },
      { value: "balanced", label: "Balanced", description: "I can accept some volatility for better returns" },
      { value: "aggressive", label: "Aggressive", description: "I'm comfortable with high volatility for maximum growth" },
    ],
  },
  timeHorizon: {
    question: "What's your investment time horizon?",
    options: [
      { value: "short", label: "Short-term", description: "Less than 6 months" },
      { value: "medium", label: "Medium-term", description: "6 months to 2 years" },
      { value: "long", label: "Long-term", description: "More than 2 years" },
    ],
  },
  investmentGoal: {
    question: "What's your primary investment goal?",
    options: [
      { value: "preservation", label: "Capital Preservation", description: "Protect my capital from loss" },
      { value: "income", label: "Regular Income", description: "Generate steady passive income" },
      { value: "growth", label: "Maximum Growth", description: "Grow my capital as much as possible" },
    ],
  },
};
