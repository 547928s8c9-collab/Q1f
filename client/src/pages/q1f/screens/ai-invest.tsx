import { t } from "../tokens";
import { Card, Badge, Icon, Button } from "../components";

const strategies = [
  { name: "Conservative", nameRu: "Консервативный", apy: "+12.4%", risk: "Низкий", color: t.color.positive, allocation: "BTC 70% • ETH 30%", desc: "Накопление + ребалансировка" },
  { name: "Balanced", nameRu: "Сбалансированный", apy: "+24.8%", risk: "Средний", color: t.color.accent, allocation: "BTC 50% • ETH 30% • SOL 20%", desc: "Трендовая стратегия" },
  { name: "Aggressive", nameRu: "Агрессивный", apy: "+47.2%", risk: "Высокий", color: t.color.warning, allocation: "BTC 40% • ETH 30% • SOL 30%", desc: "Импульсная + сетка" },
];

export function AIInvestScreen() {
  return (
    <div style={{ padding: t.space.xl }}>
      <div style={{ marginBottom: t.space.xxxl }}>
        <div style={{ display: "flex", alignItems: "center", gap: t.space.sm, marginBottom: t.space.sm }}>
          <Icon name="sparkle" size={20} color={t.color.accent} />
          <h2 style={{ fontSize: t.font.size.xxl, fontWeight: t.font.weight.bold, margin: 0, letterSpacing: -0.5 }}>
            AI Инвестиции
          </h2>
        </div>
        <p style={{ fontSize: t.font.size.md, color: t.color.textSecondary, margin: 0, letterSpacing: -0.1 }}>
          Доверительное управление на базе AI-алгоритмов
        </p>
      </div>

      <Card
        style={{
          marginBottom: t.space.xxl,
          background: `linear-gradient(135deg, ${t.color.text} 0%, #2C2C2E 100%)`,
          color: "#FFF",
          position: "relative",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            position: "absolute",
            top: -40,
            right: -40,
            width: 120,
            height: 120,
            borderRadius: 60,
            background: "rgba(0,113,227,0.12)",
          }}
        />
        <div
          style={{
            position: "absolute",
            bottom: -20,
            right: 40,
            width: 80,
            height: 80,
            borderRadius: 40,
            background: "rgba(52,199,89,0.08)",
          }}
        />

        <p style={{ fontSize: t.font.size.sm, color: "rgba(255,255,255,0.5)", margin: `0 0 ${t.space.sm}px` }}>
          Ваш AI-портфель
        </p>
        <div style={{ display: "flex", alignItems: "baseline", gap: t.space.sm, marginBottom: t.space.xl }}>
          <span data-testid="text-ai-balance" style={{ fontSize: t.font.size.hero, fontWeight: t.font.weight.bold, letterSpacing: -1 }}>
            $4 231<span style={{ color: "rgba(255,255,255,0.5)" }}>.60</span>
          </span>
          <Badge variant="positive" style={{ background: t.color.positiveLight }}>+$842.60</Badge>
        </div>
        <div style={{ display: "flex", gap: t.space.xxxl }}>
          <div>
            <p style={{ fontSize: t.font.size.xs, color: "rgba(255,255,255,0.4)", margin: 0 }}>Доходность</p>
            <p style={{ fontSize: t.font.size.lg, fontWeight: t.font.weight.semibold, margin: "4px 0 0" }}>+24.8%</p>
          </div>
          <div>
            <p style={{ fontSize: t.font.size.xs, color: "rgba(255,255,255,0.4)", margin: 0 }}>Стратегия</p>
            <p style={{ fontSize: t.font.size.lg, fontWeight: t.font.weight.semibold, margin: "4px 0 0" }}>Сбалансированная</p>
          </div>
          <div>
            <p style={{ fontSize: t.font.size.xs, color: "rgba(255,255,255,0.4)", margin: 0 }}>Срок</p>
            <p style={{ fontSize: t.font.size.lg, fontWeight: t.font.weight.semibold, margin: "4px 0 0" }}>3 мес</p>
          </div>
        </div>
      </Card>

      <h3 style={{ fontSize: t.font.size.xl, fontWeight: t.font.weight.semibold, margin: `0 0 ${t.space.lg}px`, letterSpacing: -0.3 }}>
        Стратегии
      </h3>

      <div style={{ display: "flex", flexDirection: "column", gap: t.space.md }}>
        {strategies.map((s) => (
          <Card key={s.name} hoverable padding={t.space.xl}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: t.space.md }}>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: t.space.sm, marginBottom: t.space.xs }}>
                  <div style={{ width: 8, height: 8, borderRadius: 4, background: s.color }} />
                  <h4
                    data-testid={`strategy-name-${s.name}`}
                    style={{ margin: 0, fontSize: t.font.size.lg, fontWeight: t.font.weight.semibold, letterSpacing: -0.2 }}
                  >
                    {s.nameRu}
                  </h4>
                </div>
                <p style={{ margin: 0, fontSize: t.font.size.sm, color: t.color.textSecondary }}>{s.desc}</p>
              </div>
              <div style={{ textAlign: "right" }}>
                <p style={{ margin: 0, fontSize: t.font.size.xl, fontWeight: t.font.weight.bold, color: t.color.positive, letterSpacing: -0.3 }}>
                  {s.apy}
                </p>
                <p style={{ margin: "2px 0 0", fontSize: t.font.size.xs, color: t.color.textTertiary }}>годовых</p>
              </div>
            </div>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: `${t.space.sm}px ${t.space.md}px`,
                background: t.color.bgSecondary,
                borderRadius: t.radius.sm,
                fontSize: t.font.size.sm,
              }}
            >
              <span style={{ color: t.color.textSecondary }}>{s.allocation}</span>
              <Badge variant={s.risk === "Низкий" ? "positive" : s.risk === "Средний" ? "accent" : "negative"}>
                {s.risk} риск
              </Badge>
            </div>
          </Card>
        ))}
      </div>

      <div style={{ marginTop: t.space.xxl }}>
        <Button variant="primary" size="lg" fullWidth icon="sparkle">
          Начать инвестировать
        </Button>
      </div>
    </div>
  );
}
