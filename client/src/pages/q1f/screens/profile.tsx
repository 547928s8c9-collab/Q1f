import { t } from "../tokens";
import { Card, Badge, Icon } from "../components";

const menuItems = [
  { icon: "wallet", label: "Платёжные методы", sub: "Visa •••• 4821" },
  { icon: "bell", label: "Уведомления", sub: "Включены" },
  { icon: "shield", label: "Безопасность", sub: "2FA включён" },
  { icon: "chart", label: "Налоговый отчёт", sub: "Скачать за 2025" },
  { icon: "user", label: "Реферальная программа", sub: "3 приглашённых" },
];

export function ProfileScreen() {
  return (
    <div style={{ padding: t.space.xl }}>
      <div style={{ display: "flex", alignItems: "center", gap: t.space.lg, marginBottom: t.space.xxxl }}>
        <div
          data-testid="img-avatar"
          style={{
            width: 64,
            height: 64,
            borderRadius: 32,
            background: `linear-gradient(135deg, ${t.color.accent}, #5AC8FA)`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#FFF",
            fontSize: 26,
            fontWeight: t.font.weight.bold,
            flexShrink: 0,
          }}
        >
          A
        </div>
        <div>
          <h2
            data-testid="text-username"
            style={{ margin: 0, fontSize: t.font.size.xl, fontWeight: t.font.weight.bold, letterSpacing: -0.3 }}
          >
            Алексей
          </h2>
          <p style={{ margin: "2px 0 0", fontSize: t.font.size.sm, color: t.color.textSecondary }}>alexey@q1f.io</p>
        </div>
      </div>

      <Card style={{ marginBottom: t.space.xxl, display: "flex", alignItems: "center", gap: t.space.lg }}>
        <div
          style={{
            width: 44,
            height: 44,
            borderRadius: t.radius.sm,
            background: t.color.positiveLight,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          <Icon name="shield" size={22} color={t.color.positive} />
        </div>
        <div style={{ flex: 1 }}>
          <p style={{ margin: 0, fontSize: t.font.size.md, fontWeight: t.font.weight.semibold }}>Аккаунт верифицирован</p>
          <p style={{ margin: "2px 0 0", fontSize: t.font.size.sm, color: t.color.textSecondary }}>Полный доступ ко всем функциям</p>
        </div>
        <Badge variant="positive">KYC ✓</Badge>
      </Card>

      <div style={{ display: "flex", flexDirection: "column" }}>
        {menuItems.map((item, i) => (
          <div
            key={i}
            data-testid={`menu-item-${item.icon}`}
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
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: t.radius.xs,
                background: t.color.bgSecondary,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              <Icon name={item.icon} size={18} color={t.color.textSecondary} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ margin: 0, fontSize: t.font.size.md, fontWeight: t.font.weight.medium }}>{item.label}</p>
              <p style={{ margin: "2px 0 0", fontSize: t.font.size.sm, color: t.color.textTertiary }}>{item.sub}</p>
            </div>
            <Icon name="chevronRight" size={18} color={t.color.textTertiary} />
          </div>
        ))}
      </div>

      <div style={{ marginTop: t.space.section }}>
        <p style={{ textAlign: "center", fontSize: t.font.size.xs, color: t.color.textTertiary, letterSpacing: -0.1 }}>
          Q1F v1.0 · ОсОО «СтандартБизнесКонсалт» · Лицензия ВА №0001
        </p>
      </div>
    </div>
  );
}
