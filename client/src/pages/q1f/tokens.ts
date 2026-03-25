// DEPRECATED: Use @/lib/design-tokens instead. This file will be removed.
// Colors here are light-only and don't support dark mode.
export const t = {
  color: {
    bg: "#FFFFFF",
    bgSecondary: "#F5F5F7",
    bgTertiary: "#FBFBFD",
    surface: "#FFFFFF",
    surfaceHover: "rgba(0,0,0,0.03)",
    text: "#1D1D1F",
    textSecondary: "#86868B",
    textTertiary: "#AEAEB2",
    accent: "#0071E3",
    accentHover: "#0077ED",
    accentLight: "rgba(0,113,227,0.08)",
    positive: "#34C759",
    positiveLight: "rgba(52,199,89,0.1)",
    negative: "#FF3B30",
    negativeLight: "rgba(255,59,48,0.1)",
    warning: "#FF9F0A",
    border: "rgba(0,0,0,0.06)",
    borderStrong: "rgba(0,0,0,0.12)",
    glass: "rgba(255,255,255,0.72)",
    overlay: "rgba(0,0,0,0.4)",
    btc: "#F7931A",
    eth: "#627EEA",
    usdt: "#26A17B",
    sol: "#9945FF",
    ton: "#0098EA",
    // Interaction tokens
    white: "#FFFFFF",
    accentShadow: "rgba(0,113,227,0.3)",
    secondaryHover: "rgba(0,0,0,0.06)",
    ghostHover: "rgba(0,0,0,0.04)",
    dangerHover: "#FF453A",
    // Dark surface tokens (for dark gradient cards)
    darkSurface2: "#2C2C2E",
    accentDecorative: "rgba(0,113,227,0.12)",
    positiveDecorative: "rgba(52,199,89,0.08)",
    onDark50: "rgba(255,255,255,0.5)",
    onDark40: "rgba(255,255,255,0.4)",
    // Avatar gradient
    avatarGradient: "#5AC8FA",
  },
  radius: { xs: 8, sm: 12, md: 16, lg: 20, xl: 24, pill: 9999 },
  space: { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 24, xxxl: 32, section: 48 },
  font: {
    family: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", "Helvetica Neue", Helvetica, Arial, sans-serif',
    size: { xs: 11, sm: 13, md: 15, lg: 17, xl: 20, xxl: 24, hero: 34, display: 48 },
    weight: { regular: 400, medium: 500, semibold: 600, bold: 700 },
  },
  shadow: {
    sm: "0 1px 3px rgba(0,0,0,0.04), 0 1px 2px rgba(0,0,0,0.06)",
    md: "0 4px 12px rgba(0,0,0,0.06), 0 1px 3px rgba(0,0,0,0.04)",
    lg: "0 8px 30px rgba(0,0,0,0.08), 0 2px 8px rgba(0,0,0,0.04)",
    xl: "0 20px 60px rgba(0,0,0,0.1), 0 4px 16px rgba(0,0,0,0.04)",
  },
  transition: {
    fast: "150ms cubic-bezier(0.25, 0.1, 0.25, 1)",
    normal: "250ms cubic-bezier(0.25, 0.1, 0.25, 1)",
    slow: "400ms cubic-bezier(0.25, 0.1, 0.25, 1)",
    spring: "500ms cubic-bezier(0.34, 1.56, 0.64, 1)",
  },
} as const;

export const cryptoData = [
  { symbol: "BTC", name: "Bitcoin", price: "96 842", change: "+2.34", icon: "₿", color: "#F7931A" },
  { symbol: "ETH", name: "Ethereum", price: "3 412", change: "+1.87", icon: "Ξ", color: "#627EEA" },
  { symbol: "USDT", name: "Tether", price: "1.00", change: "+0.01", icon: "₮", color: "#26A17B" },
  { symbol: "SOL", name: "Solana", price: "178.52", change: "-0.94", icon: "◎", color: "#9945FF" },
  { symbol: "TON", name: "Toncoin", price: "5.83", change: "+4.12", icon: "◆", color: "#0098EA" },
] as const;

export const resetBtn: Record<string, string | number> = {
  border: "none",
  background: "none",
  cursor: "pointer",
  padding: "0",
  fontFamily: "inherit",
  WebkitFontSmoothing: "antialiased",
};
