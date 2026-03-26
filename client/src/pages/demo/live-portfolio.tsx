import { useState, useEffect, useRef, useCallback } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { DemoLayout } from "./demo-layout";
import { useDemo, STRATEGIES } from "./demo-context";

const TICK_INTERVAL = 60; // ms
const SIM_SECONDS_PER_TICK = 1800; // 30 min simulated per tick

function generateTick(
  balance: number,
  monthlyRateMin: number,
  monthlyRateMax: number,
  simSeconds: number,
): number {
  const avgMonthlyRate = (monthlyRateMin + monthlyRateMax) / 2 / 100;
  const secondsInMonth = 30 * 24 * 3600;
  const ratePerSecond = avgMonthlyRate / secondsInMonth;
  const noise = 1 + (Math.random() - 0.45) * 0.0005;
  return balance * (1 + ratePerSecond * simSeconds) * noise;
}

function Sparkline({ data, color }: { data: number[]; color: string }) {
  if (data.length < 2) return null;

  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const width = 320;
  const height = 80;
  const padding = 4;

  const points = data.map((v, i) => {
    const x = padding + (i / (data.length - 1)) * (width - padding * 2);
    const y = height - padding - ((v - min) / range) * (height - padding * 2);
    return `${x},${y}`;
  });

  const lastPoint = points[points.length - 1].split(",");

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-20" preserveAspectRatio="none">
      <defs>
        <linearGradient id="sparkGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.2" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      {/* Fill area */}
      <polygon
        points={`${padding},${height - padding} ${points.join(" ")} ${parseFloat(lastPoint[0])},${height - padding}`}
        fill="url(#sparkGrad)"
      />
      {/* Line */}
      <polyline
        points={points.join(" ")}
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      {/* Pulsing dot */}
      <circle cx={lastPoint[0]} cy={lastPoint[1]} r="4" fill={color}>
        <animate attributeName="r" values="3;5;3" dur="1.5s" repeatCount="indefinite" />
        <animate attributeName="opacity" values="1;0.5;1" dur="1.5s" repeatCount="indefinite" />
      </circle>
    </svg>
  );
}

export default function DemoLivePortfolio() {
  const [, navigate] = useLocation();
  const { state } = useDemo();
  const strategyKey = state.strategy || "active";
  const strategy = STRATEGIES[strategyKey];
  const initialBalance = state.depositAmount || 1000;

  const [balance, setBalance] = useState(initialBalance);
  const [history, setHistory] = useState<number[]>([initialBalance]);
  const [simTime, setSimTime] = useState(0);
  const balanceRef = useRef(initialBalance);

  const tick = useCallback(() => {
    const newBalance = generateTick(
      balanceRef.current,
      strategy.rateMin,
      strategy.rateMax,
      SIM_SECONDS_PER_TICK,
    );
    balanceRef.current = newBalance;
    setBalance(newBalance);
    setHistory((prev) => {
      const next = [...prev, newBalance];
      return next.length > 120 ? next.slice(-120) : next;
    });
    setSimTime((t) => t + SIM_SECONDS_PER_TICK);
  }, [strategy.rateMin, strategy.rateMax]);

  useEffect(() => {
    const interval = setInterval(tick, TICK_INTERVAL);
    return () => clearInterval(interval);
  }, [tick]);

  const profit = balance - initialBalance;
  const profitPct = ((profit / initialBalance) * 100).toFixed(2);
  const simDays = Math.floor(simTime / 86400);
  const simHours = Math.floor((simTime % 86400) / 3600);

  const colorHex =
    strategyKey === "stable" ? "#22c55e" : strategyKey === "active" ? "#3b82f6" : "#f97316";

  return (
    <DemoLayout>
      <div className="flex-1 flex flex-col gap-4">
        {/* Balance */}
        <div className="text-center pt-2">
          <p className="text-xs text-muted-foreground mb-1">Баланс портфеля</p>
          <p className="text-3xl font-bold tracking-tight tabular-nums">
            ${balance.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </p>
          <p className={cn("text-sm font-medium mt-1", profit >= 0 ? "text-green-500" : "text-red-500")}>
            {profit >= 0 ? "+" : ""}
            ${profit.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            {" "}({profitPct}%)
          </p>
        </div>

        {/* Sparkline chart */}
        <Card>
          <CardContent className="p-3">
            <Sparkline data={history} color={colorHex} />
          </CardContent>
        </Card>

        {/* Strategy badge */}
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center text-xl", strategy.bg)}>
              {strategy.emoji}
            </div>
            <div className="flex-1">
              <p className="text-sm font-semibold">{strategy.name}</p>
              <p className="text-xs text-muted-foreground">
                {strategy.rateMin}–{strategy.rateMax}% / мес
              </p>
            </div>
            <div className={cn("px-2 py-0.5 rounded-full text-xs font-medium", strategy.bg, strategy.color)}>
              Активна
            </div>
          </CardContent>
        </Card>

        {/* Bot trading card */}
        <Card className="border-primary/20 bg-primary/5">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="relative">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                <span className="text-lg">{"\u{1F916}"}</span>
              </div>
              <div className="absolute -top-0.5 -right-0.5 w-3 h-3 rounded-full bg-green-500 border-2 border-background animate-pulse" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-semibold">Бот торгует прямо сейчас</p>
              <p className="text-xs text-muted-foreground">
                {simDays > 0 ? `${simDays}д ${simHours}ч` : `${simHours}ч`} симулировано
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Actions */}
        <div className="mt-auto flex gap-3">
          <Button variant="outline" className="flex-1" onClick={() => navigate("/")}>
            На главную
          </Button>
          <Button className="flex-1" onClick={() => navigate("/demo/sumsub")}>
            Начать заново
          </Button>
        </div>
      </div>
    </DemoLayout>
  );
}
