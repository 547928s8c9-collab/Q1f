import { useState } from "react";
import { t, cryptoData } from "../tokens";
import { Card, Badge, Icon, TabBar, CryptoIcon, Sparkline, Button } from "../components";

export function PortfolioScreen() {
  const [period, setPeriod] = useState("1m");

  return (
    <div style={{ padding: t.space.xl }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: t.space.xxl }}>
        <div>
          <p style={{ fontSize: t.font.size.sm, color: t.color.textSecondary, margin: 0, letterSpacing: -0.1 }}>
            Общий баланс
          </p>
          <h1
            data-testid="text-total-balance"
            style={{ fontSize: t.font.size.display, fontWeight: t.font.weight.bold, margin: "4px 0 0", letterSpacing: -1.5 }}
          >
            $12 847<span style={{ fontSize: t.font.size.xxl, color: t.color.textTertiary }}>.63</span>
          </h1>
        </div>
        <Badge variant="positive" style={{ fontSize: t.font.size.md, padding: "6px 14px" }}>
          <Icon name="arrowUp" size={14} color={t.color.positive} strokeWidth={2.5} /> +8.42%
        </Badge>
      </div>

      <Card style={{ marginBottom: t.space.xxl, padding: 0, overflow: "hidden" }}>
        <div style={{ height: 180, background: `linear-gradient(180deg, ${t.color.accentLight} 0%, transparent 100%)` }}>
          <svg width="100%" height="100%" viewBox="0 0 400 180" preserveAspectRatio="none">
            <defs>
              <linearGradient id="q1fChartGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={t.color.accent} stopOpacity="0.15" />
                <stop offset="100%" stopColor={t.color.accent} stopOpacity="0" />
              </linearGradient>
            </defs>
            <path
              d="M0,140 C40,130 60,120 100,100 C140,80 160,90 200,70 C240,50 260,60 300,40 C340,20 360,25 400,15 L400,180 L0,180 Z"
              fill="url(#q1fChartGrad)"
            />
            <path
              d="M0,140 C40,130 60,120 100,100 C140,80 160,90 200,70 C240,50 260,60 300,40 C340,20 360,25 400,15"
              fill="none"
              stroke={t.color.accent}
              strokeWidth="2.5"
            />
            <circle cx="400" cy="15" r="5" fill={t.color.accent} />
            <circle cx="400" cy="15" r="8" fill={t.color.accent} opacity="0.2" />
          </svg>
        </div>
        <div style={{ padding: `${t.space.lg}px ${t.space.xl}px` }}>
          <TabBar
            tabs={[
              { id: "1d", label: "1Д" },
              { id: "1w", label: "1Н" },
              { id: "1m", label: "1М" },
              { id: "3m", label: "3М" },
              { id: "1y", label: "1Г" },
              { id: "all", label: "Все" },
            ]}
            active={period}
            onChange={setPeriod}
          />
        </div>
      </Card>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: t.space.sm, marginBottom: t.space.xxxl }}>
        {[
          { icon: "plus", label: "Купить" },
          { icon: "swap", label: "Обменять" },
          { icon: "arrowUp", label: "Отправить" },
          { icon: "scan", label: "Получить" },
        ].map((action) => (
          <div
            key={action.label}
            data-testid={`action-${action.icon}`}
            style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: t.space.sm, cursor: "pointer", transition: `all ${t.transition.fast}` }}
          >
            <div
              style={{
                width: 52,
                height: 52,
                borderRadius: t.radius.md,
                background: t.color.accentLight,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                transition: `all ${t.transition.fast}`,
              }}
            >
              <Icon name={action.icon} size={22} color={t.color.accent} />
            </div>
            <span style={{ fontSize: t.font.size.xs, color: t.color.textSecondary, fontWeight: t.font.weight.medium }}>
              {action.label}
            </span>
          </div>
        ))}
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: t.space.lg }}>
        <h3 style={{ fontSize: t.font.size.xl, fontWeight: t.font.weight.semibold, margin: 0, letterSpacing: -0.3 }}>
          Активы
        </h3>
        <Button
          data-testid="link-all-assets"
          variant="ghost"
          size="sm"
        >
          Все →
        </Button>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
        {cryptoData.map((crypto) => {
          const isPositive = crypto.change.startsWith("+");
          return (
            <div
              key={crypto.symbol}
              data-testid={`asset-row-${crypto.symbol}`}
              style={{
                display: "flex",
                alignItems: "center",
                gap: t.space.lg,
                padding: `${t.space.lg}px 0`,
                borderBottom: `1px solid ${t.color.border}`,
                cursor: "pointer",
                minHeight: 44,
                transition: `background ${t.transition.fast}`,
              }}
            >
              <CryptoIcon symbol={crypto.symbol} color={crypto.color} />
              <div style={{ flex: 1 }}>
                <p style={{ margin: 0, fontWeight: t.font.weight.semibold, fontSize: t.font.size.md }}>{crypto.name}</p>
                <p style={{ margin: "2px 0 0", fontSize: t.font.size.sm, color: t.color.textSecondary }}>{crypto.symbol}</p>
              </div>
              <Sparkline positive={isPositive} />
              <div style={{ textAlign: "right", minWidth: 80 }}>
                <p style={{ margin: 0, fontWeight: t.font.weight.semibold, fontSize: t.font.size.md }}>${crypto.price}</p>
                <p
                  style={{
                    margin: "2px 0 0",
                    fontSize: t.font.size.sm,
                    color: isPositive ? t.color.positive : t.color.negative,
                    fontWeight: t.font.weight.medium,
                  }}
                >
                  {crypto.change}%
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
