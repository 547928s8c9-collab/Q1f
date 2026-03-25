export const getToken = (varName: string) =>
  getComputedStyle(document.documentElement).getPropertyValue(varName).trim();

export const tokens = {
  color: {
    bg: "hsl(var(--background))",
    text: "hsl(var(--text))",
    textSecondary: "hsl(var(--text-muted))",
    accent: "hsl(var(--primary))",
    positive: "hsl(var(--success))",
    negative: "hsl(var(--danger))",
    warning: "hsl(var(--warning))",
    border: "hsl(var(--card-border))",
    surface: "hsl(var(--surface))",
    // crypto-specific colors remain hardcoded — they don't change in dark mode
    btc: "#F7931A",
    eth: "#627EEA",
    usdt: "#26A17B",
    sol: "#9945FF",
    ton: "#0098EA",
  },
  radius: { xs: 8, sm: 12, md: 16, lg: 20, xl: 24, pill: 9999 },
  space: { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 24, xxxl: 32, section: 48 },
  font: {
    size: { xs: 11, sm: 13, md: 15, lg: 17, xl: 20, xxl: 24, hero: 34, display: 48 },
    weight: { regular: 400, medium: 500, semibold: 600, bold: 700 },
  },
} as const;
