import { useState, type CSSProperties, type ReactNode } from "react";
import { t, cryptoData, resetBtn } from "./tokens";

interface IconProps {
  name: string;
  size?: number;
  color?: string;
  strokeWidth?: number;
}

export function Icon({ name, size = 22, color = t.color.text, strokeWidth = 1.8 }: IconProps) {
  const icons: Record<string, ReactNode> = {
    home: <><path d="M3 12l9-8 9 8" /><path d="M5 10v10a1 1 0 001 1h3a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1h3a1 1 0 001-1V10" /></>,
    chart: <><path d="M3 3v18h18" /><path d="M7 16l4-4 4 4 5-7" /></>,
    wallet: <><rect x="2" y="6" width="20" height="14" rx="2" /><path d="M2 10h20" /><circle cx="16" cy="14" r="1.5" /></>,
    sparkle: <><path d="M12 2l2 6 6 2-6 2-2 6-2-6-6-2 6-2z" /></>,
    user: <><circle cx="12" cy="8" r="4" /><path d="M4 21v-1a6 6 0 0112 0v1" /></>,
    bell: <><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 01-3.46 0" /></>,
    arrowUp: <><path d="M12 19V5" /><path d="M5 12l7-7 7 7" /></>,
    arrowDown: <><path d="M12 5v14" /><path d="M19 12l-7 7-7-7" /></>,
    arrowRight: <><path d="M5 12h14" /><path d="M12 5l7 7-7 7" /></>,
    plus: <><path d="M12 5v14" /><path d="M5 12h14" /></>,
    scan: <><path d="M7 3H5a2 2 0 00-2 2v2" /><path d="M17 3h2a2 2 0 012 2v2" /><path d="M7 21H5a2 2 0 01-2-2v-2" /><path d="M17 21h2a2 2 0 002-2v-2" /></>,
    shield: <><path d="M12 2l8 4v6c0 5.25-3.5 9.74-8 11-4.5-1.26-8-5.75-8-11V6l8-4z" /><path d="M9 12l2 2 4-4" /></>,
    swap: <><path d="M7 3l-4 4 4 4" /><path d="M3 7h14" /><path d="M17 21l4-4-4-4" /><path d="M21 17H7" /></>,
    chevronRight: <><path d="M9 18l6-6-6-6" /></>,
    copy: <><rect x="8" y="8" width="12" height="12" rx="2" /><path d="M4 16V4a2 2 0 012-2h12" /></>,
    search: <><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.35-4.35" /></>,
  };
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
      {icons[name]}
    </svg>
  );
}

interface CardProps {
  children: ReactNode;
  style?: CSSProperties;
  padding?: number;
  onClick?: () => void;
  hoverable?: boolean;
}

export function Card({ children, style, padding = t.space.xl, onClick, hoverable }: CardProps) {
  const [hovered, setHovered] = useState(false);
  return (
    <div
      data-testid="card"
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: t.color.surface,
        borderRadius: t.radius.lg,
        padding,
        boxShadow: hovered && hoverable ? t.shadow.md : t.shadow.sm,
        transition: `all ${t.transition.normal}`,
        cursor: onClick ? "pointer" : "default",
        transform: hovered && hoverable ? "translateY(-1px)" : "none",
        ...style,
      }}
    >
      {children}
    </div>
  );
}

interface BadgeProps {
  children: ReactNode;
  variant?: "default" | "positive" | "negative" | "accent";
  style?: CSSProperties;
}

export function Badge({ children, variant = "default", style }: BadgeProps) {
  const variants = {
    default: { bg: t.color.bgSecondary, color: t.color.textSecondary },
    positive: { bg: t.color.positiveLight, color: t.color.positive },
    negative: { bg: t.color.negativeLight, color: t.color.negative },
    accent: { bg: t.color.accentLight, color: t.color.accent },
  };
  const v = variants[variant];
  return (
    <span
      data-testid="badge"
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        padding: "4px 10px",
        borderRadius: t.radius.pill,
        background: v.bg,
        color: v.color,
        fontSize: t.font.size.sm,
        fontWeight: t.font.weight.medium,
        letterSpacing: -0.1,
        ...style,
      }}
    >
      {children}
    </span>
  );
}

interface ButtonProps {
  children: ReactNode;
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md" | "lg";
  icon?: string;
  style?: CSSProperties;
  fullWidth?: boolean;
  onClick?: () => void;
}

export function Button({ children, variant = "primary", size = "md", icon, style, fullWidth, onClick }: ButtonProps) {
  const [hovered, setHovered] = useState(false);
  const variants = {
    primary: {
      bg: hovered ? t.color.accentHover : t.color.accent,
      color: t.color.white,
      shadow: hovered ? `0 4px 12px ${t.color.accentShadow}` : "none",
    },
    secondary: {
      bg: hovered ? t.color.secondaryHover : t.color.bgSecondary,
      color: t.color.text,
      shadow: "none",
    },
    ghost: {
      bg: hovered ? t.color.ghostHover : "transparent",
      color: t.color.accent,
      shadow: "none",
    },
    danger: {
      bg: hovered ? t.color.dangerHover : t.color.negative,
      color: t.color.white,
      shadow: "none",
    },
  };
  const sizes = {
    sm: { padding: "8px 14px", fontSize: t.font.size.sm, radius: t.radius.sm },
    md: { padding: "10px 20px", fontSize: t.font.size.md, radius: t.radius.md },
    lg: { padding: "14px 28px", fontSize: t.font.size.lg, radius: t.radius.md },
  };
  const v = variants[variant];
  const s = sizes[size];
  return (
    <button
      data-testid={`button-${variant}`}
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        ...resetBtn,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        background: v.bg,
        color: v.color,
        padding: s.padding,
        borderRadius: s.radius,
        fontSize: s.fontSize,
        fontWeight: t.font.weight.semibold,
        letterSpacing: -0.2,
        boxShadow: v.shadow,
        transition: `all ${t.transition.fast}`,
        width: fullWidth ? "100%" : "auto",
        minHeight: 44,
        ...style,
      }}
    >
      {icon && <Icon name={icon} size={size === "sm" ? 16 : 18} color={v.color} />}
      {children}
    </button>
  );
}

interface TabBarProps {
  tabs: { id: string; label: string }[];
  active: string;
  onChange: (id: string) => void;
}

export function TabBar({ tabs, active, onChange }: TabBarProps) {
  return (
    <div
      data-testid="tabbar"
      style={{
        display: "flex",
        gap: 4,
        background: t.color.bgSecondary,
        borderRadius: t.radius.sm,
        padding: 3,
      }}
    >
      {tabs.map((tab) => (
        <button
          key={tab.id}
          data-testid={`tab-${tab.id}`}
          onClick={() => onChange(tab.id)}
          style={{
            ...resetBtn,
            padding: "7px 16px",
            borderRadius: t.radius.xs,
            fontSize: t.font.size.sm,
            fontWeight: active === tab.id ? t.font.weight.semibold : t.font.weight.medium,
            color: active === tab.id ? t.color.text : t.color.textSecondary,
            background: active === tab.id ? t.color.surface : "transparent",
            boxShadow: active === tab.id ? t.shadow.sm : "none",
            transition: `all ${t.transition.fast}`,
            letterSpacing: -0.1,
            minHeight: 44,
          }}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

interface CryptoIconProps {
  symbol: string;
  color: string;
  size?: number;
}

export function CryptoIcon({ symbol, color, size = 40 }: CryptoIconProps) {
  const iconChar = cryptoData.find((c) => c.symbol === symbol)?.icon || symbol[0];
  return (
    <div
      data-testid={`crypto-icon-${symbol}`}
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.28,
        background: `linear-gradient(135deg, ${color}, ${color}CC)`,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: t.color.white,
        fontWeight: 700,
        fontSize: size * 0.4,
        flexShrink: 0,
      }}
    >
      {iconChar}
    </div>
  );
}

interface SparklineProps {
  positive: boolean;
  width?: number;
  height?: number;
}

export function Sparkline({ positive, width = 64, height = 28 }: SparklineProps) {
  const points = positive
    ? "0,20 8,18 16,22 24,16 32,14 40,17 48,10 56,8 64,4"
    : "0,8 8,6 16,10 24,14 32,12 40,18 48,16 56,20 64,22";
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      <polyline
        points={points}
        fill="none"
        stroke={positive ? t.color.positive : t.color.negative}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
