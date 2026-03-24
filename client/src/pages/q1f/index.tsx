import { useState, type ReactNode } from "react";
import { t, resetBtn } from "./tokens";
import { Icon } from "./components";
import { PortfolioScreen } from "./screens/portfolio";
import { ExchangeScreen } from "./screens/exchange";
import { AIInvestScreen } from "./screens/ai-invest";
import { WalletScreen } from "./screens/wallet";
import { ProfileScreen } from "./screens/profile";

type ScreenId = "portfolio" | "exchange" | "ai" | "wallet" | "profile";

const navItems: { id: ScreenId; icon: string; label: string }[] = [
  { id: "portfolio", icon: "home", label: "Главная" },
  { id: "exchange", icon: "swap", label: "Обмен" },
  { id: "ai", icon: "sparkle", label: "AI Инвест" },
  { id: "wallet", icon: "wallet", label: "Кошелёк" },
  { id: "profile", icon: "user", label: "Профиль" },
];

const screens: Record<ScreenId, ReactNode> = {
  portfolio: <PortfolioScreen />,
  exchange: <ExchangeScreen />,
  ai: <AIInvestScreen />,
  wallet: <WalletScreen />,
  profile: <ProfileScreen />,
};

export default function Q1FApp() {
  const [screen, setScreen] = useState<ScreenId>("portfolio");

  return (
    <div
      style={{
        fontFamily: t.font.family,
        background: t.color.bg,
        minHeight: "100vh",
        maxWidth: 430,
        margin: "0 auto",
        position: "relative",
        color: t.color.text,
        WebkitFontSmoothing: "antialiased",
        overflowX: "hidden",
      }}
    >
      <div
        style={{
          height: 44,
          display: "flex",
          alignItems: "flex-end",
          justifyContent: "space-between",
          padding: "0 20px 8px",
          background: t.color.bg,
          position: "sticky",
          top: 0,
          zIndex: 10,
        }}
      >
        <span style={{ fontSize: t.font.size.sm, fontWeight: t.font.weight.semibold }}>9:41</span>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <svg width="16" height="12" viewBox="0 0 16 12" fill={t.color.text}>
            <rect x="0" y="8" width="3" height="4" rx="0.5" />
            <rect x="4" y="5" width="3" height="7" rx="0.5" />
            <rect x="8" y="2" width="3" height="10" rx="0.5" />
            <rect x="12" y="0" width="3" height="12" rx="0.5" />
          </svg>
          <svg width="15" height="11" viewBox="0 0 15 11" fill="none" stroke={t.color.text} strokeWidth="1.2">
            <path d="M1 8.5C3.5 4 11.5 4 14 8.5" />
            <path d="M3.5 6.5C5.5 4 9.5 4 11.5 6.5" />
            <circle cx="7.5" cy="9.5" r="1" fill={t.color.text} stroke="none" />
          </svg>
          <svg width="25" height="12" viewBox="0 0 25 12" fill="none">
            <rect x="0.5" y="0.5" width="21" height="11" rx="2" stroke={t.color.text} strokeWidth="1" />
            <rect x="2" y="2" width="14" height="8" rx="1" fill={t.color.positive} />
            <rect x="22.5" y="4" width="2" height="4" rx="0.5" fill={t.color.text} />
          </svg>
        </div>
      </div>

      <div style={{ paddingBottom: 100 }}>
        {screens[screen]}
      </div>

      <div
        data-testid="bottom-nav"
        style={{
          position: "fixed",
          bottom: 0,
          left: "50%",
          transform: "translateX(-50%)",
          width: "100%",
          maxWidth: 430,
          height: 84,
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-around",
          paddingTop: 8,
          background: t.color.glass,
          backdropFilter: "blur(20px)",
          WebkitBackdropFilter: "blur(20px)",
          borderTop: `0.5px solid ${t.color.border}`,
          zIndex: 100,
        }}
      >
        {navItems.map((item) => {
          const isActive = screen === item.id;
          return (
            <button
              key={item.id}
              data-testid={`nav-${item.id}`}
              onClick={() => setScreen(item.id)}
              style={{
                ...resetBtn,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 2,
                minWidth: 60,
                minHeight: 44,
                paddingTop: 4,
                transition: `all ${t.transition.fast}`,
              }}
            >
              <Icon
                name={item.icon}
                size={24}
                color={isActive ? t.color.accent : t.color.textTertiary}
                strokeWidth={isActive ? 2 : 1.5}
              />
              <span
                style={{
                  fontSize: t.font.size.xs,
                  fontWeight: isActive ? t.font.weight.semibold : t.font.weight.medium,
                  color: isActive ? t.color.accent : t.color.textTertiary,
                  letterSpacing: 0,
                }}
              >
                {item.label}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
