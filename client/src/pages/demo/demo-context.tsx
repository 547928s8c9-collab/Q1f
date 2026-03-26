import { createContext, useContext, useState, useCallback, type ReactNode } from "react";

export type StrategyType = "stable" | "active" | "aggressive";
export type FundingMethod = "card" | "crypto";

export interface DemoState {
  // Step 2: Registration
  phone: string;
  email: string;
  otpVerified: boolean;

  // Step 3: Questionnaire answers
  answers: Record<number, number>;

  // Step 4: Recommended strategy
  strategy: StrategyType | null;

  // Step 5: Funding method
  fundingMethod: FundingMethod | null;

  // Step 6: Deposit amount
  depositAmount: number;
}

interface DemoContextValue {
  state: DemoState;
  setPhone: (phone: string) => void;
  setEmail: (email: string) => void;
  setOtpVerified: (verified: boolean) => void;
  setAnswer: (questionIndex: number, answerIndex: number) => void;
  setStrategy: (strategy: StrategyType) => void;
  setFundingMethod: (method: FundingMethod) => void;
  setDepositAmount: (amount: number) => void;
  reset: () => void;
}

const initialState: DemoState = {
  phone: "",
  email: "",
  otpVerified: false,
  answers: {},
  strategy: null,
  fundingMethod: null,
  depositAmount: 0,
};

const DemoContext = createContext<DemoContextValue | null>(null);

export function DemoProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<DemoState>(initialState);

  const setPhone = useCallback((phone: string) => setState((s) => ({ ...s, phone })), []);
  const setEmail = useCallback((email: string) => setState((s) => ({ ...s, email })), []);
  const setOtpVerified = useCallback((otpVerified: boolean) => setState((s) => ({ ...s, otpVerified })), []);
  const setAnswer = useCallback((questionIndex: number, answerIndex: number) =>
    setState((s) => ({ ...s, answers: { ...s.answers, [questionIndex]: answerIndex } })), []);
  const setStrategy = useCallback((strategy: StrategyType) => setState((s) => ({ ...s, strategy })), []);
  const setFundingMethod = useCallback((method: FundingMethod) => setState((s) => ({ ...s, fundingMethod: method })), []);
  const setDepositAmount = useCallback((amount: number) => setState((s) => ({ ...s, depositAmount: amount })), []);
  const reset = useCallback(() => setState(initialState), []);

  return (
    <DemoContext.Provider
      value={{ state, setPhone, setEmail, setOtpVerified, setAnswer, setStrategy, setFundingMethod, setDepositAmount, reset }}
    >
      {children}
    </DemoContext.Provider>
  );
}

export function useDemo() {
  const ctx = useContext(DemoContext);
  if (!ctx) throw new Error("useDemo must be used within DemoProvider");
  return ctx;
}

// Strategy configuration
export const STRATEGIES = {
  stable: {
    name: "Стабильный",
    emoji: "\u{1F33F}",
    color: "text-green-500",
    bg: "bg-green-500/10",
    border: "border-green-500/30",
    rateMin: 1.8,
    rateMax: 3.6,
    description: "Консервативные инструменты с минимальным риском",
  },
  active: {
    name: "Активный",
    emoji: "\u{1F680}",
    color: "text-blue-500",
    bg: "bg-blue-500/10",
    border: "border-blue-500/30",
    rateMin: 3.0,
    rateMax: 6.5,
    description: "Сбалансированный подход к доходности и риску",
  },
  aggressive: {
    name: "Агрессивный",
    emoji: "\u{26A1}",
    color: "text-orange-500",
    bg: "bg-orange-500/10",
    border: "border-orange-500/30",
    rateMin: 5.0,
    rateMax: 12.0,
    description: "Максимальная доходность при повышенном риске",
  },
} as const;

export function deriveStrategy(answers: Record<number, number>): StrategyType {
  const total = Object.values(answers).reduce((sum, v) => sum + v, 0);
  if (total <= 4) return "stable";
  if (total <= 8) return "active";
  return "aggressive";
}
