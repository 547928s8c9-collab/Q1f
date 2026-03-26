import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { NumericKeypad } from "@/components/ui/numeric-keypad";
import { Loader2, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { DemoLayout } from "./demo-layout";
import { useDemo, STRATEGIES } from "./demo-context";

type Phase = "input" | "processing" | "done";

export default function DemoDeposit() {
  const [, navigate] = useLocation();
  const { state, setDepositAmount } = useDemo();

  // Navigation guard: require strategy selection
  useEffect(() => {
    if (!state.strategy) {
      navigate("/demo/register", { replace: true });
    }
  }, [state.strategy, navigate]);
  const [amount, setAmount] = useState("1000");
  const [phase, setPhase] = useState<Phase>("input");

  const strategy = state.strategy ? STRATEGIES[state.strategy] : STRATEGIES.active;

  const handleDigit = (d: string) => {
    setAmount((prev) => {
      if (prev === "0") return d;
      if (prev.length >= 8) return prev;
      return prev + d;
    });
  };

  const handleDecimal = () => {
    if (!amount.includes(".")) setAmount((prev) => prev + ".");
  };

  const handleBackspace = () => {
    setAmount((prev) => (prev.length <= 1 ? "0" : prev.slice(0, -1)));
  };

  const numericAmount = parseFloat(amount) || 0;

  const handleConfirm = () => {
    setDepositAmount(numericAmount);
    setPhase("processing");
  };

  useEffect(() => {
    if (phase !== "processing") return;
    const timer = setTimeout(() => setPhase("done"), 2000);
    return () => clearTimeout(timer);
  }, [phase]);

  if (phase === "processing") {
    return (
      <DemoLayout>
        <div className="flex-1 flex flex-col items-center justify-center gap-4 text-center">
          <Loader2 className="h-12 w-12 animate-spin text-primary" />
          <h2 className="text-lg font-semibold">Обрабатываем пополнение</h2>
          <p className="text-sm text-muted-foreground">
            ${numericAmount.toLocaleString("en-US", { minimumFractionDigits: 2 })}
          </p>
        </div>
      </DemoLayout>
    );
  }

  if (phase === "done") {
    return (
      <DemoLayout>
        <div className="flex-1 flex flex-col items-center justify-center gap-4 text-center">
          <CheckCircle2 className="h-16 w-16 text-green-500 animate-in zoom-in-50 duration-300" />
          <h2 className="text-xl font-semibold">Счёт пополнен!</h2>
          <p className="text-sm text-muted-foreground">
            ${numericAmount.toLocaleString("en-US", { minimumFractionDigits: 2 })} зачислено на баланс
          </p>
          <Button size="lg" onClick={() => navigate("/demo/portfolio")}>
            Смотреть портфель
          </Button>
        </div>
      </DemoLayout>
    );
  }

  return (
    <DemoLayout>
      <div className="flex-1 flex flex-col">
        {/* Amount display */}
        <div className="flex-1 flex flex-col items-center justify-center gap-2">
          <p className="text-xs text-muted-foreground uppercase tracking-wide">Сумма пополнения</p>
          <div className="text-4xl font-bold tracking-tight">
            ${amount}
          </div>
          <div className={cn("text-xs px-2 py-0.5 rounded-full", strategy.bg, strategy.color)}>
            {strategy.emoji} {strategy.name} &middot; {strategy.rateMin}–{strategy.rateMax}% / мес
          </div>
        </div>

        {/* Quick amounts */}
        <div className="flex gap-2 mb-4">
          {[100, 500, 1000, 5000].map((v) => (
            <Button
              key={v}
              variant="outline"
              size="sm"
              className="flex-1 text-xs"
              onClick={() => setAmount(String(v))}
            >
              ${v}
            </Button>
          ))}
        </div>

        {/* Keypad */}
        <NumericKeypad
          onDigit={handleDigit}
          onDecimal={handleDecimal}
          onBackspace={handleBackspace}
          className="mb-4"
        />

        <Button
          className="w-full"
          size="lg"
          disabled={numericAmount <= 0}
          onClick={handleConfirm}
        >
          Пополнить ${numericAmount > 0 ? numericAmount.toLocaleString("en-US") : "0"}
        </Button>
      </div>
    </DemoLayout>
  );
}
