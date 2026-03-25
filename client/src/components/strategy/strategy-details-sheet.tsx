import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Sparkline } from "@/components/charts/sparkline";
import { TrendingUp, Shield, Zap, AlertTriangle, ChevronDown, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { toMajorUnits } from "@/lib/money";
import { type Strategy, type StrategyPerformance } from "@shared/schema";
import { TIER_META, type RiskTierKey, computeTierStats } from "./tier-card";

interface StrategyDetailsSheetProps {
  strategy: Strategy | null;
  tierKey?: RiskTierKey | null;
  strategies: Strategy[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onInvest?: () => void;
}

const TIER_DESCRIPTIONS: Record<RiskTierKey, string> = {
  LOW: "Защитные стратегии с минимальной волатильностью. Идеально для сохранения капитала с умеренным ростом.",
  CORE: "Сочетание трендовых и контртрендовых стратегий по нескольким активам. Основа сбалансированного портфеля.",
  HIGH: "Стратегии на основе моментума и пробоев, улавливающие быстрые рыночные движения. Подходит инвесторам, готовым к крупным просадкам ради повышенной доходности.",
};

const TIER_ICONS: Record<RiskTierKey, React.ElementType> = {
  LOW: Shield,
  CORE: TrendingUp,
  HIGH: Zap,
};

export function StrategyDetailsSheet({
  strategy,
  tierKey: tierKeyProp,
  strategies,
  open,
  onOpenChange,
  onInvest,
}: StrategyDetailsSheetProps) {
  const [strategiesExpanded, setStrategiesExpanded] = useState(false);

  const tier = tierKeyProp || (strategy?.riskTier || "CORE") as RiskTierKey;
  const meta = TIER_META[tier];
  const Icon = TIER_ICONS[tier];
  const tierStrategies = strategies.filter((s) => s.riskTier === tier);
  const stats = computeTierStats(tierStrategies);

  const { data: performance } = useQuery<StrategyPerformance[]>({
    queryKey: ["/api/strategies", strategy?.id, "performance"],
    enabled: !!strategy?.id && open,
  });

  if (!strategy) return null;

  const minReturn = stats.returnRangeMin;
  const maxReturn = stats.returnRangeMax;
  const minInvestment = toMajorUnits(strategy.minInvestment || "100000000", 6);
  const fees = strategy.feesJson as { management?: string; performance?: string } | null;

  const last30Days = (performance || []).slice(-30);
  const sparklineData = last30Days.map(p => ({
    value: parseFloat(p.equityMinor)
  }));

  const hasSparkline = sparklineData.length > 0;
  const isPositive = hasSparkline
    ? sparklineData[sparklineData.length - 1].value >= sparklineData[0].value
    : true;
  const returnPercent = hasSparkline
    ? ((sparklineData[sparklineData.length - 1].value / sparklineData[0].value - 1) * 100)
    : 0;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="rounded-t-2xl max-h-[90vh] overflow-y-auto" style={{ backgroundColor: "#FFFFFF" }}>
        <SheetHeader className="mb-4">
          <SheetTitle className="sr-only">{meta.name} — Подробности</SheetTitle>
        </SheetHeader>

        {/* Header: Icon + Tier Name + Description */}
        <div className="mb-6">
          <div className="flex items-center gap-3 mb-3">
            <Icon className="w-5 h-5" style={{ color: "#86868B" }} strokeWidth={1.5} />
            <h2 style={{ fontSize: 20, fontWeight: 600, color: "#1D1D1F" }}>{meta.name}</h2>
          </div>
          <p style={{ fontSize: 15, color: "#86868B", lineHeight: 1.5 }}>
            {TIER_DESCRIPTIONS[tier]}
          </p>
        </div>

        {/* Metrics Grid 2x2 */}
        <div className="grid grid-cols-2 gap-3 mb-6">
          <div className="rounded-2xl p-4" style={{ backgroundColor: "#F5F5F7" }}>
            <p style={{ fontSize: 13, color: "#86868B" }} className="mb-1">Доходность</p>
            <p className="tabular-nums" style={{ fontSize: 20, fontWeight: 600, color: "#1D1D1F" }}>
              {minReturn}–{maxReturn}%
              <span style={{ fontSize: 13, fontWeight: 400, color: "#86868B" }}> /мес</span>
            </p>
          </div>
          <div className="rounded-2xl p-4" style={{ backgroundColor: "#F5F5F7" }}>
            <p style={{ fontSize: 13, color: "#86868B" }} className="mb-1">Мин. инвестиция</p>
            <p className="tabular-nums" style={{ fontSize: 20, fontWeight: 600, color: "#1D1D1F" }}>
              {minInvestment.toLocaleString()} <span style={{ fontSize: 13, fontWeight: 400, color: "#86868B" }}>USDT</span>
            </p>
          </div>
          <div className="rounded-2xl p-4" style={{ backgroundColor: "#F5F5F7" }}>
            <p style={{ fontSize: 13, color: "#86868B" }} className="mb-1">Худший месяц</p>
            <p className="tabular-nums" style={{ fontSize: 20, fontWeight: 600, color: "#FF3B30" }}>
              {strategy.worstMonth || "Н/Д"}
            </p>
          </div>
          <div className="rounded-2xl p-4" style={{ backgroundColor: "#F5F5F7" }}>
            <p style={{ fontSize: 13, color: "#86868B" }} className="mb-1">Макс. просадка</p>
            <p className="tabular-nums" style={{ fontSize: 20, fontWeight: 600, color: "#FF3B30" }}>
              {stats.maxDrawdown}
            </p>
          </div>
        </div>

        {/* 30-day sparkline chart */}
        {hasSparkline && (
          <div className="rounded-2xl p-4 mb-6" style={{ backgroundColor: "#F5F5F7" }}>
            <div className="flex items-center justify-between mb-3">
              <span style={{ fontSize: 15, fontWeight: 500, color: "#1D1D1F" }}>Динамика за 30 дней</span>
              <span
                className="tabular-nums font-semibold"
                style={{ fontSize: 15, color: isPositive ? "#34C759" : "#FF3B30" }}
              >
                {isPositive ? "+" : ""}{returnPercent.toFixed(2)}%
              </span>
            </div>
            <Sparkline data={sparklineData} positive={isPositive} height={48} />
          </div>
        )}

        {/* Risk Warning */}
        <div
          className="rounded-2xl p-3 mb-6 flex items-center gap-2"
          style={{ backgroundColor: "rgba(255, 204, 0, 0.08)", border: "1px solid rgba(255, 204, 0, 0.15)" }}
        >
          <AlertTriangle className="w-4 h-4 flex-shrink-0" style={{ color: "#FF9500" }} />
          <p style={{ fontSize: 13, color: "#86868B" }}>
            Капитал подвержен риску. Стоимость инвестиций может как расти, так и снижаться.
          </p>
        </div>

        {/* Fees Section */}
        <div className="mb-6">
          <h3 style={{ fontSize: 13, fontWeight: 600, color: "#86868B", textTransform: "uppercase", letterSpacing: "0.5px" }} className="mb-3">
            Комиссии и условия
          </h3>
          <div className="space-y-2">
            <div className="flex justify-between" style={{ fontSize: 15 }}>
              <span style={{ color: "#86868B" }}>Комиссия за управление</span>
              <span style={{ color: "#1D1D1F", fontWeight: 500 }}>{fees?.management || "0.5%"}</span>
            </div>
            <div className="flex justify-between" style={{ fontSize: 15 }}>
              <span style={{ color: "#86868B" }}>Комиссия за результат</span>
              <span style={{ color: "#1D1D1F", fontWeight: 500 }}>{fees?.performance || "10%"}</span>
            </div>
            <div className="flex justify-between" style={{ fontSize: 15 }}>
              <span style={{ color: "#86868B" }}>Выплата прибыли</span>
              <span style={{ color: "#1D1D1F", fontWeight: 500 }}>Ежедневно / Ежемесячно</span>
            </div>
            <div className="flex justify-between" style={{ fontSize: 15 }}>
              <span style={{ color: "#86868B" }}>Возврат капитала</span>
              <span style={{ color: "#1D1D1F", fontWeight: 500 }}>Еженедельное окно</span>
            </div>
          </div>
        </div>

        {/* Strategies Inside - collapsed by default */}
        {tierStrategies.length > 1 && (
          <div className="mb-6">
            <button
              type="button"
              onClick={() => setStrategiesExpanded(!strategiesExpanded)}
              className="w-full flex items-center justify-between py-3"
              style={{ borderTop: "1px solid rgba(0,0,0,0.06)" }}
              data-testid="toggle-strategies-inside"
            >
              <span style={{ fontSize: 13, fontWeight: 600, color: "#86868B", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                Стратегии внутри · {tierStrategies.length}
              </span>
              {strategiesExpanded ? (
                <ChevronDown className="w-4 h-4" style={{ color: "#86868B" }} />
              ) : (
                <ChevronRight className="w-4 h-4" style={{ color: "#86868B" }} />
              )}
            </button>
            {strategiesExpanded && (
              <div className="space-y-2 mt-2">
                {tierStrategies.map((s) => {
                  const sMin = s.expectedMonthlyRangeBpsMin ? (s.expectedMonthlyRangeBpsMin / 100).toFixed(1) : "0";
                  const sMax = s.expectedMonthlyRangeBpsMax ? (s.expectedMonthlyRangeBpsMax / 100).toFixed(1) : "0";
                  return (
                    <div
                      key={s.id}
                      className="rounded-xl p-3 flex items-center justify-between"
                      style={{ backgroundColor: "#F5F5F7" }}
                    >
                      <div>
                        <p style={{ fontSize: 15, fontWeight: 500, color: "#1D1D1F" }}>{s.name}</p>
                        <p className="tabular-nums" style={{ fontSize: 13, color: "#86868B" }}>
                          {sMin}–{sMax}% /мес
                        </p>
                      </div>
                      <span className="tabular-nums" style={{ fontSize: 13, color: "#86868B" }}>
                        {s.maxDrawdown || ""}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Sticky Invest Button */}
        <div className="sticky bottom-0 pt-3 pb-2" style={{ backgroundColor: "#FFFFFF" }}>
          <Button
            className="w-full font-semibold text-white"
            style={{
              height: 50,
              borderRadius: 12,
              backgroundColor: "hsl(var(--primary))",
              fontSize: 15,
            }}
            onClick={onInvest}
            data-testid="button-invest-sheet"
          >
            Инвестировать
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
