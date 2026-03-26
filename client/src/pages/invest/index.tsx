import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { InvestSheet } from "@/components/operations/invest-sheet";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { useSetPageTitle } from "@/hooks/use-page-title";
import { TrendingUp, ChevronRight } from "lucide-react";
import { type Strategy, type BootstrapResponse } from "@shared/schema";

// ─── Strategy definitions per spec ───────────────────────────────────────────

interface StrategyDef {
  key: "stable" | "active" | "aggressive";
  tierKey: "LOW" | "CORE" | "HIGH";
  name: string;
  emoji: string;
  color: string;
  returnMin: number;
  returnMax: number;
  badge: string;
  tagline: string;
}

const STRATEGIES: StrategyDef[] = [
  {
    key: "stable",
    tierKey: "LOW",
    name: "Стабильный",
    emoji: "🛡️",
    color: "#34C759",
    returnMin: 1.8,
    returnMax: 3.6,
    badge: "Популярный",
    tagline: "Спокойный рост каждый месяц",
  },
  {
    key: "active",
    tierKey: "CORE",
    name: "Активный",
    emoji: "📈",
    color: "#007AFF",
    returnMin: 3.0,
    returnMax: 6.5,
    badge: "Рекомендуем",
    tagline: "Уверенный рост с умным ботом",
  },
  {
    key: "aggressive",
    tierKey: "HIGH",
    name: "Агрессивный",
    emoji: "🚀",
    color: "#FF9500",
    returnMin: 5.0,
    returnMax: 12.0,
    badge: "Макс. доход",
    tagline: "Максимум от каждого доллара",
  },
];

const DEPOSIT_OPTIONS = [
  { label: "500", value: 500 },
  { label: "1K", value: 1000 },
  { label: "5K", value: 5000 },
  { label: "10K", value: 10000 },
];

// ─── Ease-out-quart helper ──────────────────────────────────────────────────

function easeOutQuart(t: number): number {
  return 1 - Math.pow(1 - t, 4);
}

// ─── Animated number hook ───────────────────────────────────────────────────

function useAnimatedValue(target: number, duration = 650): number {
  const [display, setDisplay] = useState(target);
  const prevRef = useRef(target);
  const rafRef = useRef(0);

  const animate = useCallback(
    (from: number, to: number) => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      const start = performance.now();
      const step = (now: number) => {
        const elapsed = now - start;
        const progress = Math.min(elapsed / duration, 1);
        const eased = easeOutQuart(progress);
        setDisplay(from + (to - from) * eased);
        if (progress < 1) {
          rafRef.current = requestAnimationFrame(step);
        }
      };
      rafRef.current = requestAnimationFrame(step);
    },
    [duration],
  );

  useEffect(() => {
    if (prevRef.current !== target) {
      animate(prevRef.current, target);
      prevRef.current = target;
    }
  }, [target, animate]);

  useEffect(() => {
    // Set initial value immediately
    setDisplay(target);
    prevRef.current = target;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  return display;
}

// ─── Sparkline SVG component ────────────────────────────────────────────────

function GrowthSparkline({ color, id }: { color: string; id: string }) {
  // Generate smooth growth curve
  const points = useMemo(() => {
    const pts: { x: number; y: number }[] = [];
    const steps = 50;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      // Exponential growth with slight sinusoidal variation
      const base = Math.pow(t, 0.6);
      const noise = Math.sin(t * Math.PI * 4) * 0.03 * (1 - t * 0.5);
      pts.push({ x: t * 300, y: 80 - (base + noise) * 70 });
    }
    return pts;
  }, []);

  const pathD = points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
    .join(" ");
  const areaD = pathD + ` L 300 80 L 0 80 Z`;

  return (
    <div style={{ width: "100%", height: 100, position: "relative" }}>
      <svg
        viewBox="0 0 300 90"
        preserveAspectRatio="none"
        style={{ width: "100%", height: "100%" }}
      >
        <defs>
          <linearGradient id={`grad-${id}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.25} />
            <stop offset="100%" stopColor={color} stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <path d={areaD} fill={`url(#grad-${id})`} />
        <path d={pathD} fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <div style={{ display: "flex", justifyContent: "space-between", paddingTop: 4 }}>
        <span style={{ fontSize: 11, color: "#8E8E93" }}>Сейчас</span>
        <span style={{ fontSize: 11, color: "#8E8E93" }}>Через год</span>
      </div>
    </div>
  );
}

// ─── Main component ─────────────────────────────────────────────────────────

export default function Invest() {
  useSetPageTitle("Сколько вы заработаете");

  const [activeIndex, setActiveIndex] = useState(1); // Default: Активный (recommended)
  const [deposit, setDeposit] = useState(1000);
  const [investOpen, setInvestOpen] = useState(false);

  const { data: strategies, isLoading, isError } = useQuery<Strategy[]>({
    queryKey: ["/api/strategies"],
    refetchInterval: 15_000,
  });

  const { data: bootstrap } = useQuery<BootstrapResponse>({
    queryKey: ["/api/bootstrap"],
    refetchInterval: 15_000,
  });

  const active = STRATEGIES[activeIndex];
  const others = STRATEGIES.filter((_, i) => i !== activeIndex);

  // Find the actual Strategy object for InvestSheet
  const findStrategyForTier = (tierKey: string): Strategy | undefined => {
    return strategies?.find((s) => s.riskTier === tierKey);
  };

  const selectedDbStrategy = findStrategyForTier(active.tierKey);

  // Simulation values
  const sim3 = Math.round(deposit * Math.pow(1 + active.returnMax / 100, 3));
  const sim6 = Math.round(deposit * Math.pow(1 + active.returnMax / 100, 6));
  const sim12 = Math.round(deposit * Math.pow(1 + active.returnMax / 100, 12));

  const animSim3 = useAnimatedValue(sim3);
  const animSim6 = useAnimatedValue(sim6);
  const animSim12 = useAnimatedValue(sim12);

  const profit3 = Math.round(animSim3 - deposit);
  const profit6 = Math.round(animSim6 - deposit);
  const profit12 = Math.round(animSim12 - deposit);

  const bgTint = `${active.color}0D`; // ~5% opacity

  const handleInvestOpenChange = (open: boolean) => {
    setInvestOpen(open);
  };

  if (isLoading) {
    return (
      <div style={{ padding: 20, fontFamily: "-apple-system, 'SF Pro Display', system-ui, sans-serif" }}>
        <Skeleton className="h-8 w-48 mb-6" />
        <Skeleton className="h-12 w-full rounded-xl mb-6" />
        <Skeleton className="h-96 w-full rounded-3xl mb-4" />
        <Skeleton className="h-20 w-full rounded-2xl mb-3" />
        <Skeleton className="h-20 w-full rounded-2xl" />
      </div>
    );
  }

  if (isError || !strategies || strategies.length === 0) {
    return (
      <div style={{ padding: 20 }}>
        <EmptyState
          icon={TrendingUp}
          title="Нет доступных стратегий"
          description="Загляните позже — скоро появятся инвестиционные возможности."
        />
      </div>
    );
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        backgroundColor: bgTint,
        transition: "background-color 0.5s ease",
        fontFamily: "-apple-system, 'SF Pro Display', system-ui, sans-serif",
        paddingBottom: 120,
      }}
    >
      <div style={{ maxWidth: 480, margin: "0 auto", padding: "20px 16px" }}>

        {/* ── Segmented Control ─────────────────────────────────────── */}
        <div
          style={{
            display: "flex",
            backgroundColor: "#E8E8ED",
            borderRadius: 10,
            padding: 3,
            marginBottom: 24,
            position: "relative",
          }}
        >
          {STRATEGIES.map((s, i) => (
            <button
              key={s.key}
              onClick={() => setActiveIndex(i)}
              style={{
                flex: 1,
                padding: "8px 4px",
                fontSize: 13,
                fontWeight: activeIndex === i ? 600 : 500,
                color: activeIndex === i ? "#1D1D1F" : "#8E8E93",
                backgroundColor: activeIndex === i ? "#FFFFFF" : "transparent",
                border: "none",
                borderRadius: 8,
                cursor: "pointer",
                transition: "all 0.25s ease",
                boxShadow: activeIndex === i
                  ? "0 1px 4px rgba(0,0,0,0.12), 0 1px 2px rgba(0,0,0,0.08)"
                  : "none",
                position: "relative",
                zIndex: activeIndex === i ? 1 : 0,
              }}
              data-testid={`segment-${s.key}`}
            >
              {s.name}
            </button>
          ))}
        </div>

        {/* ── Main Strategy Card ───────────────────────────────────── */}
        <div
          style={{
            backgroundColor: "#FFFFFF",
            borderRadius: 28,
            padding: 24,
            boxShadow: `0 16px 60px ${active.color}1A`,
            marginBottom: 16,
            transition: "box-shadow 0.5s ease",
          }}
          data-testid="main-strategy-card"
        >
          {/* Name + emoji + badge */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
            <span style={{ fontSize: 28 }}>{active.emoji}</span>
            <span style={{ fontSize: 22, fontWeight: 700, color: "#1D1D1F" }}>
              {active.name}
            </span>
            <span
              style={{
                fontSize: 12,
                fontWeight: 600,
                color: active.color,
                backgroundColor: `${active.color}15`,
                padding: "4px 10px",
                borderRadius: 20,
                whiteSpace: "nowrap",
              }}
            >
              {active.badge}
            </span>
          </div>

          {/* Tagline */}
          <p style={{ fontSize: 14, color: "#8E8E93", marginBottom: 20 }}>
            {active.tagline}
          </p>

          {/* Return block */}
          <div
            style={{
              backgroundColor: `${active.color}0A`,
              borderRadius: 20,
              padding: "20px 24px",
              marginBottom: 20,
              textAlign: "center",
            }}
          >
            <p style={{ fontSize: 13, color: "#8E8E93", marginBottom: 8 }}>
              Доходность в месяц
            </p>
            <p
              style={{
                fontSize: 52,
                fontWeight: 900,
                color: active.color,
                lineHeight: 1.1,
                transition: "color 0.3s ease",
              }}
              data-testid="return-max"
            >
              +{active.returnMax}%
            </p>
            <p style={{ fontSize: 14, color: "#8E8E93", marginTop: 8 }}>
              от {active.returnMin}% до {active.returnMax}% — каждый месяц
            </p>
          </div>

          {/* Sparkline */}
          <div style={{ marginBottom: 24 }}>
            <GrowthSparkline key={active.key} color={active.color} id={active.key} />
          </div>

          {/* Deposit picker */}
          <div style={{ marginBottom: 20 }}>
            <p style={{ fontSize: 14, fontWeight: 600, color: "#1D1D1F", marginBottom: 10 }}>
              Сколько вложить?
            </p>
            <div style={{ display: "flex", gap: 8 }}>
              {DEPOSIT_OPTIONS.map((opt) => {
                const isSelected = deposit === opt.value;
                return (
                  <button
                    key={opt.value}
                    onClick={() => setDeposit(opt.value)}
                    style={{
                      flex: 1,
                      padding: "10px 4px",
                      fontSize: 14,
                      fontWeight: 600,
                      color: isSelected ? active.color : "#1D1D1F",
                      backgroundColor: isSelected ? `${active.color}12` : "#F5F5F7",
                      border: isSelected ? `2px solid ${active.color}` : "2px solid transparent",
                      borderRadius: 12,
                      cursor: "pointer",
                      transition: "all 0.25s ease",
                    }}
                    data-testid={`deposit-${opt.value}`}
                  >
                    {opt.label} <span style={{ fontSize: 11, fontWeight: 400, color: "#8E8E93" }}>USDT</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Simulation grid */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr 1fr",
              gap: 12,
              marginBottom: 16,
            }}
          >
            {[
              { label: "3 месяца", amount: animSim3, profit: profit3 },
              { label: "6 месяцев", amount: animSim6, profit: profit6 },
              { label: "1 год", amount: animSim12, profit: profit12 },
            ].map((col) => (
              <div
                key={col.label}
                style={{
                  textAlign: "center",
                  backgroundColor: "#F9F9FB",
                  borderRadius: 14,
                  padding: "14px 8px",
                }}
              >
                <p style={{ fontSize: 11, color: "#8E8E93", marginBottom: 6 }}>
                  {col.label}
                </p>
                <p
                  style={{
                    fontSize: 18,
                    fontWeight: 700,
                    color: active.color,
                    transition: "color 0.3s ease",
                  }}
                >
                  {Math.round(col.amount).toLocaleString("ru-RU")}$
                </p>
                <p
                  style={{
                    fontSize: 12,
                    color: active.color,
                    fontWeight: 500,
                    marginTop: 2,
                    transition: "color 0.3s ease",
                  }}
                >
                  +{col.profit > 0 ? col.profit.toLocaleString("ru-RU") : 0}$
                </p>
              </div>
            ))}
          </div>

          {/* Fine print */}
          <p style={{ fontSize: 11, color: "#C7C7CC", textAlign: "center" }}>
            Расчёт на основе исторической доходности стратегии
          </p>
        </div>

        {/* ── Compact rows (other 2 strategies) ────────────────────── */}
        {others.map((s) => (
          <button
            key={s.key}
            onClick={() => setActiveIndex(STRATEGIES.indexOf(s))}
            style={{
              display: "flex",
              alignItems: "center",
              width: "100%",
              backgroundColor: "#FFFFFF",
              borderRadius: 18,
              padding: "14px 16px",
              marginBottom: 10,
              border: "none",
              cursor: "pointer",
              boxShadow: "0 1px 6px rgba(0,0,0,0.05)",
              textAlign: "left",
              gap: 12,
            }}
            data-testid={`compact-row-${s.key}`}
          >
            {/* Emoji in colored square */}
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: 12,
                backgroundColor: `${s.color}12`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 22,
                flexShrink: 0,
              }}
            >
              {s.emoji}
            </div>

            {/* Name + tagline */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontSize: 15, fontWeight: 600, color: "#1D1D1F", marginBottom: 2 }}>
                {s.name}
              </p>
              <p style={{ fontSize: 12, color: "#8E8E93", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {s.tagline}
              </p>
            </div>

            {/* Return + chevron */}
            <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
              <span style={{ fontSize: 16, fontWeight: 700, color: s.color }}>
                +{s.returnMax}%
              </span>
              <ChevronRight style={{ width: 18, height: 18, color: "#C7C7CC" }} />
            </div>
          </button>
        ))}
      </div>

      {/* ── Sticky CTA ─────────────────────────────────────────────── */}
      <div
        style={{
          position: "fixed",
          bottom: 0,
          left: 0,
          right: 0,
          padding: "12px 16px",
          paddingBottom: "max(12px, env(safe-area-inset-bottom))",
          backgroundColor: "rgba(255,255,255,0.85)",
          backdropFilter: "blur(20px)",
          WebkitBackdropFilter: "blur(20px)",
          zIndex: 50,
        }}
      >
        <button
          onClick={() => setInvestOpen(true)}
          style={{
            width: "100%",
            maxWidth: 480,
            display: "block",
            margin: "0 auto",
            padding: "16px 24px",
            fontSize: 18,
            fontWeight: 700,
            color: "#FFFFFF",
            backgroundColor: active.color,
            border: "none",
            borderRadius: 18,
            cursor: "pointer",
            boxShadow: `0 10px 32px ${active.color}55`,
            transition: "background-color 0.3s ease, box-shadow 0.3s ease",
          }}
          data-testid="cta-invest"
        >
          Начать зарабатывать {active.emoji}
        </button>
      </div>

      <InvestSheet
        open={investOpen}
        onOpenChange={handleInvestOpenChange}
        bootstrap={bootstrap}
        preselectedStrategyId={selectedDbStrategy?.id}
      />
    </div>
  );
}
