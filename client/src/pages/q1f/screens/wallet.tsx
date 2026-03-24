import { t } from "../tokens";
import { Card, Icon, Button } from "../components";

const txs = [
  { type: "in" as const, label: "Получено BTC", amount: "+0.025 BTC", fiat: "$2 421", time: "Сегодня, 14:32" },
  { type: "out" as const, label: "Отправлено USDT", amount: "-500 USDT", fiat: "$500", time: "Вчера, 09:15" },
  { type: "swap" as const, label: "Обмен ETH → BTC", amount: "+0.1 BTC", fiat: "$9 684", time: "22 Мар, 18:45" },
  { type: "ai" as const, label: "AI стратегия: вывод", amount: "+$842.60", fiat: "", time: "20 Мар, 12:00" },
];

const typeIcons: Record<string, string> = { in: "arrowDown", out: "arrowUp", swap: "swap", ai: "sparkle" };

export function WalletScreen() {
  const typeColors: Record<string, string> = {
    in: t.color.positive,
    out: t.color.text,
    swap: t.color.accent,
    ai: t.color.accent,
  };

  return (
    <div style={{ padding: t.space.xl }}>
      <h2 style={{ fontSize: t.font.size.xxl, fontWeight: t.font.weight.bold, margin: `0 0 ${t.space.xxl}px`, letterSpacing: -0.5 }}>
        Кошелёк
      </h2>

      <div style={{ display: "flex", gap: t.space.md, marginBottom: t.space.xxxl, overflowX: "auto" }}>
        {[
          { label: "Крипто", value: "$8 616.03", sub: "4 актива" },
          { label: "AI-портфель", value: "$4 231.60", sub: "+24.8% доход" },
        ].map((b) => (
          <Card key={b.label} style={{ flex: "0 0 calc(50% - 6px)", minWidth: 140 }}>
            <p style={{ margin: 0, fontSize: t.font.size.sm, color: t.color.textSecondary, fontWeight: t.font.weight.medium }}>
              {b.label}
            </p>
            <p
              data-testid={`text-balance-${b.label}`}
              style={{ margin: "6px 0 2px", fontSize: t.font.size.xl, fontWeight: t.font.weight.bold, letterSpacing: -0.3 }}
            >
              {b.value}
            </p>
            <p style={{ margin: 0, fontSize: t.font.size.xs, color: t.color.textTertiary }}>{b.sub}</p>
          </Card>
        ))}
      </div>

      <Card
        style={{
          marginBottom: t.space.xxxl,
          background: t.color.bgSecondary,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <p style={{ margin: 0, fontSize: t.font.size.sm, color: t.color.textSecondary, fontWeight: t.font.weight.medium }}>
              BTC адрес для пополнения
            </p>
            <p
              data-testid="text-btc-address"
              style={{ margin: "4px 0 0", fontSize: t.font.size.sm, fontFamily: "monospace", color: t.color.text, letterSpacing: 0.5 }}
            >
              bc1q...x7f4k
            </p>
          </div>
          <Button variant="secondary" size="sm" icon="copy">
            Копировать
          </Button>
        </div>
      </Card>

      <h3 style={{ fontSize: t.font.size.xl, fontWeight: t.font.weight.semibold, margin: `0 0 ${t.space.lg}px`, letterSpacing: -0.3 }}>
        История
      </h3>

      <div style={{ display: "flex", flexDirection: "column" }}>
        {txs.map((tx, i) => (
          <div
            key={i}
            data-testid={`tx-row-${i}`}
            style={{
              display: "flex",
              alignItems: "center",
              gap: t.space.lg,
              padding: `${t.space.lg}px 0`,
              borderBottom: i < txs.length - 1 ? `1px solid ${t.color.border}` : "none",
            }}
          >
            <div
              style={{
                width: 40,
                height: 40,
                borderRadius: t.radius.pill,
                background: t.color.bgSecondary,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              <Icon name={typeIcons[tx.type]} size={18} color={typeColors[tx.type]} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ margin: 0, fontSize: t.font.size.md, fontWeight: t.font.weight.medium }}>{tx.label}</p>
              <p style={{ margin: "2px 0 0", fontSize: t.font.size.sm, color: t.color.textTertiary }}>{tx.time}</p>
            </div>
            <div style={{ textAlign: "right", flexShrink: 0 }}>
              <p
                style={{
                  margin: 0,
                  fontSize: t.font.size.md,
                  fontWeight: t.font.weight.semibold,
                  letterSpacing: -0.2,
                  color: tx.type === "in" || tx.type === "ai" ? t.color.positive : t.color.text,
                }}
              >
                {tx.amount}
              </p>
              {tx.fiat && (
                <p style={{ margin: "2px 0 0", fontSize: t.font.size.sm, color: t.color.textTertiary }}>{tx.fiat}</p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
