import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useLocation } from "wouter";

type TierKey = "stable" | "active" | "aggressive";

const TIERS: Record<TierKey, { label: string; rate: number; activeClass: string; valueColor: string }> = {
  stable: {
    label: "Стабильный",
    rate: 0.075,
    activeClass: "bg-positive text-white border-positive",
    valueColor: "text-positive",
  },
  active: {
    label: "Активный",
    rate: 0.16,
    activeClass: "bg-primary text-white border-primary",
    valueColor: "text-primary",
  },
  aggressive: {
    label: "Агрессивный",
    rate: 0.32,
    activeClass: "bg-negative text-white border-negative",
    valueColor: "text-negative",
  },
};

function compound(principal: number, rate: number, months: number): number {
  return principal * Math.pow(1 + rate, months);
}

function fmt(value: number): string {
  return value.toLocaleString("ru-RU", { maximumFractionDigits: 0 });
}

export function InvestmentCalculator() {
  const [amount, setAmount] = useState("1000");
  const [tier, setTier] = useState<TierKey>("active");
  const [, navigate] = useLocation();

  const principal = parseFloat(amount) || 0;
  const valid = principal >= 100;
  const rate = TIERS[tier].rate;

  const after1 = compound(principal, rate, 1);
  const after3 = compound(principal, rate, 3);
  const after6 = compound(principal, rate, 6);
  const monthly = after1 - principal;

  return (
    <Card className="mt-8">
      <CardHeader>
        <CardTitle className="text-xl font-semibold">Посчитай свой доход</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">

        {/* Amount input */}
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-muted-foreground">
            Сумма инвестиции
          </label>
          <div className="relative">
            <Input
              type="number"
              min={100}
              placeholder="1000"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="pr-16"
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground font-medium pointer-events-none">
              USDT
            </span>
          </div>
          {amount && !valid && (
            <p className="text-xs text-negative">Минимальная сумма — 100 USDT</p>
          )}
        </div>

        {/* Tier selector */}
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-muted-foreground">Стратегия</label>
          <div className="grid grid-cols-3 gap-2">
            {(Object.keys(TIERS) as TierKey[]).map((key) => (
              <button
                key={key}
                onClick={() => setTier(key)}
                className={cn(
                  "py-2 px-3 rounded-lg border text-sm font-medium transition-all",
                  tier === key
                    ? TIERS[key].activeClass
                    : "border-border text-muted-foreground hover:border-primary/50 hover:text-foreground"
                )}
              >
                {TIERS[key].label}
              </button>
            ))}
          </div>
        </div>

        {/* Results */}
        <div className="rounded-xl bg-muted/40 border border-border p-4 space-y-3">
          {[
            { label: "Через 1 месяц", value: after1 },
            { label: "Через 3 месяца", value: after3 },
            { label: "Через 6 месяцев", value: after6 },
          ].map(({ label, value }) => (
            <div key={label} className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">{label}</span>
              <span className={cn("text-sm font-semibold tabular-nums", TIERS[tier].valueColor)}>
                {valid ? `~$${fmt(value)}` : "—"}
              </span>
            </div>
          ))}
          <div className="border-t border-border pt-3 flex items-center justify-between">
            <span className="text-sm font-medium">Ежемесячный доход</span>
            <span className={cn("text-base font-bold tabular-nums", TIERS[tier].valueColor)}>
              {valid ? `~$${fmt(monthly)}` : "—"}
            </span>
          </div>
        </div>

        {/* Disclaimer */}
        <p className="text-xs text-muted-foreground leading-relaxed">
          Расчёт основан на исторической доходности стратегии.
          <br />
          Не является гарантией будущих результатов.
        </p>

        {/* CTA */}
        <Button className="w-full" onClick={() => navigate("/invest")}>
          Начать инвестировать →
        </Button>
      </CardContent>
    </Card>
  );
}
