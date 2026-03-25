# UI/UX Refactoring Map

## 1. Design Tokens — `client/src/pages/q1f/tokens.ts`

```ts
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
    white: "#FFFFFF",
    accentShadow: "rgba(0,113,227,0.3)",
    secondaryHover: "rgba(0,0,0,0.06)",
    ghostHover: "rgba(0,0,0,0.04)",
    dangerHover: "#FF453A",
    darkSurface2: "#2C2C2E",
    accentDecorative: "rgba(0,113,227,0.12)",
    positiveDecorative: "rgba(52,199,89,0.08)",
    onDark50: "rgba(255,255,255,0.5)",
    onDark40: "rgba(255,255,255,0.4)",
    avatarGradient: "#5AC8FA",
  },
  radius: { xs: 8, sm: 12, md: 16, lg: 20, xl: 24, pill: 9999 },
  space: { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 24, xxxl: 32, section: 48 },
  font: {
    family: '-apple-system, BlinkMacSystemFont, "SF Pro Display", ...',
    size: { xs: 11, sm: 13, md: 15, lg: 17, xl: 20, xxl: 24, hero: 34, display: 48 },
    weight: { regular: 400, medium: 500, semibold: 600, bold: 700 },
  },
  shadow: { sm, md, lg, xl },
  transition: { fast: "150ms", normal: "250ms", slow: "400ms", spring: "500ms" },
};
```

Light-only. Inline-styles. No dark mode support. Parallel to CSS variables system.

---

## 2. CSS Variables — `client/src/index.css`

### Light (`:root`)

| Variable | Value (HSL) | Hex equivalent |
|---|---|---|
| `--background` | `0 0% 100%` | `#FFFFFF` |
| `--foreground` | `0 0% 12%` | `#1F1F1F` |
| `--primary` | `211 100% 45%` | `#0071E3` |
| `--surface` | `0 0% 100%` | `#FFFFFF` |
| `--surface2` | `240 5% 96%` | `#F4F4F6` |
| `--text` | `0 0% 12%` | `#1F1F1F` |
| `--text-muted` | `240 2% 53%` | `#868688` |
| `--text-tertiary` | `240 2% 68%` | `#ADADAF` |
| `--card` | `0 0% 100%` | `#FFFFFF` |
| `--card-border` | `0 0% 94%` | `#F0F0F0` |
| `--success` | `142 71% 49%` | `#34C759` |
| `--warning` | `37 100% 52%` | `#FF9F0A` |
| `--danger` | `4 100% 60%` | `#FF3B30` |
| `--destructive` | `4 100% 60%` | `#FF3B30` |
| `--input` | `0 0% 80%` | `#CCCCCC` |
| `--ring` | `211 100% 45%` | `#0071E3` |
| `--sidebar` | `240 20% 99%` | `#FCFCFD` |
| `--sidebar-primary` | `211 100% 45%` | `#0071E3` |

### Dark (`.dark`)

| Variable | Value (HSL) | Hex equivalent |
|---|---|---|
| `--background` | `0 0% 0%` | `#000000` |
| `--foreground` | `240 5% 96%` | `#F4F4F6` |
| `--primary` | `211 100% 50%` | `#0A84FF` |
| `--surface` | `0 0% 0%` | `#000000` |
| `--surface2` | `0 0% 11%` | `#1C1C1C` |
| `--text` | `240 5% 96%` | `#F4F4F6` |
| `--text-muted` | `240 2% 60%` | `#999999` |
| `--card` | `0 0% 11%` | `#1C1C1C` |
| `--sidebar` | `0 0% 11%` | `#1C1C1C` |

### Additional systems

- `--elevate-1/2` overlay brightness
- `--shadow-2xs` through `--shadow-2xl` (7 levels)
- `--chart-1..5` chart palette
- `--font-sans/serif/mono`
- Opaque border fallback system (`--*-border`)
- Custom animations: `priceFlashUp`, `priceFlashDown`, `tradeSlideIn`
- Utility layers: `.space-section`, `.space-card`, `.space-compact`, `.font-money`, `.scrollbar-thin`

---

## 3. BottomNav (TG v2) — `client/src/pages/tg/v2/components/BottomNav.tsx`

```ts
type TgTabKey = "overview" | "strategies" | "activity" | "deposit";

const tabs = [
  { key: "overview",   label: "Overview" },
  { key: "strategies", label: "Strategies" },
  { key: "activity",   label: "Activity" },
  { key: "deposit",    label: "Пополнить", icon: PlusCircle },
];
```

Fixed bottom, `backdrop-blur`, tailwind classes. Mixed locale: EN labels + one RU ("Пополнить").

---

## 4. Q1F Navigation — `client/src/pages/q1f/index.tsx`

```ts
type ScreenId = "portfolio" | "exchange" | "ai" | "wallet" | "profile";

const navItems = [
  { id: "portfolio", icon: "home",    label: "Главная" },
  { id: "exchange",  icon: "swap",    label: "Обмен" },
  { id: "ai",        icon: "sparkle", label: "AI Инвест" },
  { id: "wallet",    icon: "wallet",  label: "Кошелёк" },
  { id: "profile",   icon: "user",    label: "Профиль" },
];
```

Three responsive layouts:
- **Desktop** (>=1024px): sidebar 240px + content max-width 800px
- **Tablet** (>=640px): centered max-width 640px + bottom nav
- **Mobile** (<640px): max-width 430px + iOS status bar mock + bottom nav (h=84px)

Uses `tokens.ts` inline styles exclusively. Does NOT use tailwind or CSS variables.

---

## 5. App Shell Sidebar — `client/src/components/app-shell.tsx`

```ts
const navItems: NavItem[] = [
  { href: "/",          label: "Главная",     icon: Home },
  { href: "/dashboard", label: "Панель",      icon: LayoutDashboard },
  { href: "/wallet",    label: "Кошелёк",     icon: Wallet },
  { href: "/invest",    label: "Инвестиции",  icon: TrendingUp },
  { href: "/activity",  label: "Активность",  icon: Activity },
  { href: "/settings",  label: "Настройки",   icon: Settings },
];
```

Uses `wouter` router, shadcn `<Sidebar>`, lucide-react icons, tailwind + CSS variables.
Includes `ForceMobileProvider` to toggle mobile/desktop view.
Brand label: "ZEON".

---

## 6. i18n / Localization

**No i18n system exists.** No i18next, react-intl, or similar library.

All UI strings are **hardcoded in Russian** across the codebase.

Only `locale` usage is `date-fns/locale/ru` in 3 files:
- `client/src/pages/inbox.tsx` — `formatDistanceToNow`
- `client/src/pages/dashboard.tsx` — `formatDistanceToNow`
- `client/src/components/notification-bell.tsx` — `formatDistanceToNow`

TG v2 has **mixed EN+RU** labels (Overview / Strategies / Activity / Пополнить).

---

## 7. "Pending" as KYC Status — 3 locations

| File | Line | Usage |
|---|---|---|
| `components/security/kyc-status-card.tsx` | 14 | Type definition: `"not_started" \| "pending" \| "in_review" \| "approved" \| "needs_action" \| "rejected" \| "on_hold"` |
| `components/ui/status-badge.tsx` | 10 | UI label: `label: "Pending"` (English in otherwise Russian UI) |
| `components/global-banner.tsx` | 63 | Condition: `if (kycStatus === "not_started" \|\| kycStatus === "pending")` |

---

## 8. PnL / ROI / Drawdown / Risk Labels

### Risk tiers `"LOW" | "CORE" | "HIGH"`

Defined with **duplication** across 3 files:

**`components/strategy/tier-card.tsx:36-70`** (canonical `TIER_META`):
```ts
LOW  → name: "Стабильный",  chipVariant: "success", icon: Shield
CORE → name: "Активный",    chipVariant: "warning", icon: TrendingUp
HIGH → name: "Агрессивный",  chipVariant: "danger",  icon: Zap
```

**`pages/invest/strategy-detail.tsx:53-57`** (duplicate `riskConfig`):
```ts
LOW  → label: "Низкий риск",  color: "bg-positive/10 text-positive"
CORE → label: "Средний риск",  color: "bg-warning/10 text-warning"
HIGH → label: "Высокий риск", color: "bg-negative/10 text-negative"
```

**`components/strategy/strategy-card.tsx:22-26`** (duplicate `riskConfig`):
```ts
LOW  → label: "Низкий риск",  chipVariant: "success"
CORE → label: "Средний риск",  chipVariant: "warning"
HIGH → label: "Высокий риск", chipVariant: "danger"
```

**`pages/home.tsx:333-335`** (inline):
```ts
LOW  → "bg-positive/10 text-positive"
CORE → "bg-warning/10 text-warning"
HIGH → "bg-negative/10 text-negative"
```

**`pages/tg/v2/App.tsx:25`**: `const RISK_FILTERS = ["ALL", "LOW", "CORE", "HIGH"]`

### PnL / ROI labels (hardcoded)

| File | Labels |
|---|---|
| `pages/dashboard.tsx:193,216,431,437` | "PnL за 30д", "ROI за 30д" |
| `pages/tg/v2/App.tsx:352,470,509,521` | "ROI 30d", "PnL" |
| `components/strategy/strategy-card.tsx:117,123` | "PnL", "ROI 30д" |
| `components/strategy/tier-card.tsx:303` | "PnL" |

### Drawdown labels (hardcoded)

| File | Labels |
|---|---|
| `pages/onboarding/du-declaration.tsx:18-33` | "Максимальная просадка: до 5/10/15/25%" |
| `pages/dashboard.tsx:233,452` | "Макс. просадка", "Макс. просадка 30д" |
| `pages/invest/strategy-detail.tsx:1035,1133` | "Текущая просадка", "Макс. просадка" |
| `components/strategy/strategy-details-sheet.tsx:156` | "Макс. просадка" |
| `components/strategy/tier-card.tsx:64,189` | "крупным просадкам", "Макс. просадка" |

---

## Key Issues for Refactoring

### 1. Two parallel design systems
`tokens.ts` (inline styles, light-only) vs CSS variables + tailwind (light+dark).
Q1F screens use `tokens.ts`; App Shell and all other pages use CSS vars.
**Action**: Unify into CSS variables system, remove `tokens.ts` or generate it from CSS vars.

### 2. Three separate navigations with different tab sets
| System | Tabs | Routing |
|---|---|---|
| Q1F (`pages/q1f/index.tsx`) | portfolio, exchange, ai, wallet, profile | `useState` screen switching |
| App Shell (`components/app-shell.tsx`) | /, /dashboard, /wallet, /invest, /activity, /settings | `wouter` URL routing |
| TG v2 (`pages/tg/v2/components/BottomNav.tsx`) | overview, strategies, activity, deposit | `useState` tab switching |

**Action**: Consolidate navigation config into a single source.

### 3. No i18n system
All strings hardcoded. Mixed RU/EN in TG v2. "Pending" in English in status-badge.
**Action**: Introduce i18n library or at minimum extract strings to constants.

### 4. Duplicated riskConfig in 4 files
`tier-card.tsx` has canonical `TIER_META`. Three other files duplicate subsets.
**Action**: Single source of truth in `tier-card.tsx`, import everywhere else.

### 5. KYC "Pending" displayed in English
`status-badge.tsx` shows "Pending" while all other UI is Russian.
**Action**: Localize to "На рассмотрении" or similar.
