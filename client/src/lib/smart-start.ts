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
  let profile = "Сбалансированный инвестор";

  if (riskScore <= 2) {
    profile = "Консервативный инвестор";
    suggestedDeposit = 1000;
    recommendations.push(
      { strategyName: "Stable Yield", allocation: 50, riskTier: "LOW", reason: "Низкорисковый стейблкоин-фарминг для стабильного дохода" },
      { strategyName: "Fixed Income Plus", allocation: 30, riskTier: "LOW", reason: "Диверсифицированное кредитование для повышенной доходности" },
      { strategyName: "Market Neutral", allocation: 20, riskTier: "CORE", reason: "Небольшая аллокация для рыночно-нейтральной доходности" },
    );
  } else if (riskScore <= 4) {
    profile = "Сбалансированный инвестор";
    suggestedDeposit = 500;
    recommendations.push(
      { strategyName: "Fixed Income Plus", allocation: 25, riskTier: "LOW", reason: "Стабильная база с предсказуемой доходностью" },
      { strategyName: "Balanced Growth", allocation: 35, riskTier: "CORE", reason: "Основной актив для сбалансированной экспозиции" },
      { strategyName: "DeFi Momentum", allocation: 25, riskTier: "CORE", reason: "Моментум-стратегия для активной доходности" },
      { strategyName: "Alpha Seeker", allocation: 15, riskTier: "HIGH", reason: "Небольшая высокорисковая аллокация для роста" },
    );
  } else if (riskScore <= 5) {
    profile = "Инвестор роста";
    suggestedDeposit = 300;
    recommendations.push(
      { strategyName: "Balanced Growth", allocation: 25, riskTier: "CORE", reason: "Сбалансированная основа для стабильности" },
      { strategyName: "DeFi Momentum", allocation: 30, riskTier: "CORE", reason: "Активная DeFi-экспозиция для роста" },
      { strategyName: "Alpha Seeker", allocation: 25, riskTier: "HIGH", reason: "Агрессивные арбитражные возможности" },
      { strategyName: "Volatility Harvester", allocation: 20, riskTier: "HIGH", reason: "Захват волатильности через опционы" },
    );
  } else {
    profile = "Агрессивный инвестор";
    suggestedDeposit = 200;
    recommendations.push(
      { strategyName: "DeFi Momentum", allocation: 20, riskTier: "CORE", reason: "Активная ротация для стабильной доходности" },
      { strategyName: "Alpha Seeker", allocation: 30, riskTier: "HIGH", reason: "Максимальная генерация альфы" },
      { strategyName: "Volatility Harvester", allocation: 25, riskTier: "HIGH", reason: "Высокий потенциал захвата волатильности" },
      { strategyName: "Moonshot Portfolio", allocation: 25, riskTier: "HIGH", reason: "Высокоубежденные альткоин-выборки" },
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
    question: "Как вы оцениваете свою толерантность к риску?",
    options: [
      { value: "conservative", label: "Стабильный",  description: "Я предпочитаю стабильность высокой доходности" },
      { value: "balanced",     label: "Активный",    description: "Я допускаю некоторую волатильность ради лучшей доходности" },
      { value: "aggressive",   label: "Агрессивный", description: "Мне комфортна высокая волатильность ради максимального роста" },
    ],
  },
  timeHorizon: {
    question: "Каков ваш горизонт инвестирования?",
    options: [
      { value: "short", label: "Краткосрочный", description: "Менее 6 месяцев" },
      { value: "medium", label: "Среднесрочный", description: "От 6 месяцев до 2 лет" },
      { value: "long", label: "Долгосрочный", description: "Более 2 лет" },
    ],
  },
  investmentGoal: {
    question: "Какова ваша основная инвестиционная цель?",
    options: [
      { value: "preservation", label: "Сохранение капитала", description: "Защитить капитал от потерь" },
      { value: "income", label: "Регулярный доход", description: "Получать стабильный пассивный доход" },
      { value: "growth", label: "Максимальный рост", description: "Увеличить капитал максимально" },
    ],
  },
};
