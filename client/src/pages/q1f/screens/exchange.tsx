import { useState } from "react";
import { t } from "../tokens";
import { Card, TabBar, Icon, CryptoIcon, Button } from "../components";

export function ExchangeScreen() {
  const [mode, setMode] = useState("buy");
  const [amount] = useState("500");

  return (
    <div style={{ padding: t.space.xl }}>
      <h2 style={{ fontSize: t.font.size.xxl, fontWeight: t.font.weight.bold, margin: `0 0 ${t.space.xxl}px`, letterSpacing: -0.5 }}>
        Обмен
      </h2>

      <TabBar
        tabs={[
          { id: "buy", label: "Купить" },
          { id: "sell", label: "Продать" },
        ]}
        active={mode}
        onChange={setMode}
      />

      <div style={{ marginTop: t.space.xxl }}>
        <Card style={{ marginBottom: t.space.sm, padding: t.space.xl }}>
          <p style={{ fontSize: t.font.size.sm, color: t.color.textSecondary, margin: `0 0 ${t.space.sm}px` }}>
            {mode === "buy" ? "Вы платите" : "Вы продаёте"}
          </p>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span
              data-testid="input-amount"
              style={{ fontSize: t.font.size.hero, fontWeight: t.font.weight.bold, letterSpacing: -1 }}
            >
              {amount || "0"}
            </span>
            <div
              data-testid="button-currency-from"
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                background: t.color.bgSecondary,
                borderRadius: t.radius.pill,
                padding: "8px 14px",
                cursor: "pointer",
                minHeight: 44,
                transition: `all ${t.transition.fast}`,
              }}
            >
              {mode === "buy" ? (
                <>
                  <span style={{ fontSize: t.font.size.lg }}>🇰🇬</span>
                  <span style={{ fontWeight: t.font.weight.semibold, fontSize: t.font.size.md }}>KGS</span>
                </>
              ) : (
                <>
                  <CryptoIcon symbol="BTC" color={t.color.btc} size={24} />
                  <span style={{ fontWeight: t.font.weight.semibold, fontSize: t.font.size.md }}>BTC</span>
                </>
              )}
              <Icon name="chevronRight" size={16} color={t.color.textSecondary} />
            </div>
          </div>
          <p style={{ fontSize: t.font.size.sm, color: t.color.textTertiary, margin: `${t.space.sm}px 0 0` }}>
            Баланс: 45 200 KGS
          </p>
        </Card>

        <div style={{ display: "flex", justifyContent: "center", margin: "-12px 0", position: "relative", zIndex: 1 }}>
          <div
            data-testid="button-swap-direction"
            style={{
              width: 44,
              height: 44,
              borderRadius: t.radius.pill,
              background: t.color.surface,
              border: `2px solid ${t.color.border}`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              boxShadow: t.shadow.sm,
              transition: `all ${t.transition.fast}`,
            }}
          >
            <Icon name="swap" size={18} color={t.color.textSecondary} />
          </div>
        </div>

        <Card style={{ marginTop: -t.space.sm, padding: t.space.xl }}>
          <p style={{ fontSize: t.font.size.sm, color: t.color.textSecondary, margin: `0 0 ${t.space.sm}px` }}>
            Вы получите
          </p>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span
              data-testid="text-receive-amount"
              style={{ fontSize: t.font.size.hero, fontWeight: t.font.weight.bold, letterSpacing: -1, color: t.color.textSecondary }}
            >
              ≈ 0.00516
            </span>
            <div
              data-testid="button-currency-to"
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                background: t.color.bgSecondary,
                borderRadius: t.radius.pill,
                padding: "8px 14px",
                cursor: "pointer",
                minHeight: 44,
                transition: `all ${t.transition.fast}`,
              }}
            >
              {mode === "buy" ? (
                <>
                  <CryptoIcon symbol="BTC" color={t.color.btc} size={24} />
                  <span style={{ fontWeight: t.font.weight.semibold, fontSize: t.font.size.md }}>BTC</span>
                </>
              ) : (
                <>
                  <span style={{ fontSize: t.font.size.lg }}>🇰🇬</span>
                  <span style={{ fontWeight: t.font.weight.semibold, fontSize: t.font.size.md }}>KGS</span>
                </>
              )}
              <Icon name="chevronRight" size={16} color={t.color.textSecondary} />
            </div>
          </div>
        </Card>

        <div style={{ padding: `${t.space.lg}px 0`, display: "flex", flexDirection: "column", gap: t.space.md, marginTop: t.space.lg }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: t.font.size.md }}>
            <span style={{ color: t.color.textSecondary }}>Курс</span>
            <span style={{ color: t.color.text, fontWeight: t.font.weight.medium }}>1 BTC = 96 842 KGS</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: t.font.size.md }}>
            <span style={{ color: t.color.textSecondary }}>Комиссия</span>
            <span style={{ color: t.color.text, fontWeight: t.font.weight.medium }}>0.5%</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: t.font.size.md }}>
            <span style={{ color: t.color.textSecondary }}>Провайдер</span>
            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <Icon name="shield" size={14} color={t.color.positive} />
              <span style={{ color: t.color.text, fontWeight: t.font.weight.medium }}>Q1F • лицензия ВА</span>
            </div>
          </div>
        </div>

        <Button variant="primary" size="lg" fullWidth>
          {mode === "buy" ? "Купить BTC" : "Продать BTC"}
        </Button>
      </div>
    </div>
  );
}
