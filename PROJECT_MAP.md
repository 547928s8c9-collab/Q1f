# PROJECT MAP — Q1F Trading Platform

> Framework: **Vite + React 18 + TypeScript** | Router: **Wouter** | Styling: **Tailwind CSS + CSS Variables**

---

## 1. Дерево файлов (`.tsx`, `.ts`, `.css`)

```
client/src/
├── main.tsx                          # React DOM entry point
├── App.tsx                           # Root component, providers, router
├── index.css                         # Global CSS + design tokens (CSS vars)
│
├── contexts/
│   └── page-context.tsx              # PageTitle context
│
├── hooks/
│   ├── use-auth.ts                   # Auth state & methods
│   ├── use-theme.tsx                 # Theme (light/dark) + ThemeProvider
│   ├── use-toast.ts                  # Toast notifications
│   ├── use-page-title.ts             # Page title setter
│   ├── use-live-metrics.ts           # Real-time strategy metrics
│   ├── use-demo-data-seeder.ts       # Demo mode data init
│   ├── use-engine-stream.ts          # WebSocket engine stream
│   ├── use-market-stream.ts          # Market data stream
│   ├── use-live-equity.ts            # Live equity tracking
│   ├── use-trade-toasts.ts           # Trade notification toasts
│   └── use-mobile.ts                 # Mobile breakpoint detection
│
├── lib/
│   ├── utils.ts                      # cn() classname utility
│   ├── queryClient.ts                # React Query client
│   ├── auth-utils.ts                 # Auth helpers
│   ├── design-tokens.ts              # Design system tokens (JS object)
│   ├── money.ts                      # Money formatting & conversion
│   ├── moneyInput.ts                 # Money input parsing
│   ├── finance-labels.ts             # Localized financial terms
│   ├── platform-stats.ts             # Platform statistics / tierDistribution
│   ├── idempotency.ts                # Idempotency key generation
│   ├── smart-start.ts                # Smart start questionnaire logic
│   ├── vaults.ts                     # Vault utilities
│   ├── inbox-map.ts                  # Inbox message mapping
│   ├── performance.ts                # Performance calculations
│   └── demo-seed.ts                  # Demo data seed
│
├── components/
│   ├── app-shell.tsx                 # Main layout (TopBar, Sidebar, MobileNav)
│   ├── theme-toggle.tsx              # Dark/light mode toggle button
│   ├── notification-bell.tsx         # Notification icon
│   ├── global-banner.tsx             # Global announcement banner
│   ├── floating-profit-toast.tsx     # Floating profit notification
│   ├── investment-calculator.tsx     # Investment calculator modal
│   ├── live-quotes-bar.tsx           # Crypto price ticker
│   ├── live-trade-feed.tsx           # Live trade updates
│   ├── proof-of-safety.tsx           # Security badge component
│   │
│   ├── ui/
│   │   ├── accordion.tsx
│   │   ├── alert.tsx
│   │   ├── alert-dialog.tsx
│   │   ├── animated-number.tsx
│   │   ├── animation.ts
│   │   ├── aspect-ratio.tsx
│   │   ├── avatar.tsx
│   │   ├── badge.tsx
│   │   ├── balance-display.tsx
│   │   ├── breadcrumb.tsx
│   │   ├── button.tsx                # ★ Primary CTA component
│   │   ├── calendar.tsx
│   │   ├── card.tsx                  # ★ Card + CardHeader/Content/Footer
│   │   ├── carousel.tsx
│   │   ├── chart.tsx
│   │   ├── checkbox.tsx
│   │   ├── chip.tsx
│   │   ├── collapsible.tsx
│   │   ├── command.tsx
│   │   ├── context-menu.tsx
│   │   ├── copy-button.tsx
│   │   ├── date-picker.tsx
│   │   ├── dialog.tsx                # ★ Modal dialog
│   │   ├── drawer.tsx                # ★ Vaul bottom drawer
│   │   ├── dropdown-menu.tsx
│   │   ├── empty-state.tsx
│   │   ├── form.tsx
│   │   ├── hover-card.tsx
│   │   ├── icon-button.tsx
│   │   ├── input.tsx
│   │   ├── input-otp.tsx
│   │   ├── label.tsx
│   │   ├── live-badge.tsx
│   │   ├── loading-skeleton.tsx
│   │   ├── metric-card.tsx
│   │   ├── money.tsx
│   │   ├── navigation-menu.tsx
│   │   ├── numeric-keypad.tsx
│   │   ├── page-header.tsx
│   │   ├── pagination.tsx
│   │   ├── popover.tsx
│   │   ├── progress.tsx
│   │   ├── quote-card.tsx
│   │   ├── radio-group.tsx
│   │   ├── range-selector.tsx
│   │   ├── resizable.tsx
│   │   ├── scroll-area.tsx
│   │   ├── section-header.tsx
│   │   ├── select.tsx
│   │   ├── separator.tsx
│   │   ├── sheet.tsx                 # ★ Side/bottom sheet modal
│   │   ├── sidebar.tsx
│   │   ├── skeleton.tsx
│   │   ├── slider.tsx
│   │   ├── status-badge.tsx
│   │   ├── switch.tsx
│   │   ├── table.tsx
│   │   ├── textarea.tsx
│   │   ├── toast.tsx
│   │   ├── toaster.tsx
│   │   ├── toggle.tsx
│   │   ├── toggle-group.tsx
│   │   └── tooltip.tsx
│   │
│   ├── admin/
│   │   └── demo-mode-banner.tsx
│   │
│   ├── charts/
│   │   ├── portfolio-chart.tsx       # Recharts area/line chart
│   │   ├── candlestick-chart.tsx     # OHLC candlestick chart
│   │   ├── compare-chart.tsx         # Comparison chart
│   │   ├── sparkline.tsx             # Mini sparkline
│   │   └── period-toggle.tsx         # Time period selector
│   │
│   ├── onboarding/
│   │   ├── gate-guard.tsx            # Auth wall / onboarding guard
│   │   └── onboarding-layout.tsx     # Onboarding page layout wrapper
│   │
│   ├── operations/
│   │   ├── index.ts                  # Barrel export
│   │   ├── action-sheet.tsx          # Base modal (amount → confirm → result)
│   │   ├── deposit-sheet.tsx         # Deposit flow modal
│   │   ├── withdraw-sheet.tsx        # Withdrawal request modal
│   │   ├── transfer-sheet.tsx        # Between-account transfer modal
│   │   ├── invest-sheet.tsx          # Investment allocation modal
│   │   ├── operation-row.tsx         # Transaction list row
│   │   ├── operation-details-sheet.tsx
│   │   ├── operation-filters.tsx
│   │   └── operation-timeline.tsx
│   │
│   ├── security/
│   │   ├── kyc-status-card.tsx
│   │   └── security-setting-row.tsx
│   │
│   ├── strategy/
│   │   ├── tier-card.tsx             # ★ Risk tier card + TIER_META constant
│   │   ├── strategy-card.tsx
│   │   └── strategy-details-sheet.tsx
│   │
│   ├── vault/
│   │   └── vault-card.tsx
│   │
│   └── wallet/
│       ├── balance-card.tsx
│       ├── currency-card.tsx
│       └── vault-summary-card.tsx
│
└── pages/
    ├── home.tsx
    ├── portfolio.tsx
    ├── analytics.tsx
    ├── profile.tsx
    ├── dashboard.tsx
    ├── risk.tsx
    ├── landing.tsx
    ├── not-found.tsx
    ├── inbox.tsx
    ├── statements.tsx
    ├── status.tsx
    ├── withdraw.tsx
    │
    ├── activity/
    │   ├── index.tsx                  # Transaction list
    │   ├── events.tsx                 # Activity events
    │   └── receipt.tsx                # Operation receipt
    │
    ├── admin/
    │   ├── dashboard.tsx
    │   ├── kyc.tsx
    │   ├── withdrawals.tsx
    │   └── management-fees.tsx
    │
    ├── deposit/
    │   ├── usdt.tsx
    │   └── card.tsx
    │
    ├── invest/
    │   ├── index.tsx                  # Strategy listing
    │   ├── strategy-detail.tsx
    │   └── confirm.tsx
    │
    ├── wallet/
    │   ├── index.tsx
    │   └── vaults.tsx
    │
    ├── settings/
    │   ├── index.tsx
    │   ├── profile.tsx
    │   ├── security.tsx
    │   ├── notifications.tsx
    │   └── support.tsx
    │
    ├── onboarding/
    │   ├── index.tsx                  # Welcome
    │   ├── verify.tsx
    │   ├── consent.tsx
    │   ├── kyc.tsx
    │   ├── smart-start.tsx
    │   ├── smart-start-results.tsx
    │   ├── du-declaration.tsx
    │   └── done.tsx
    │
    ├── demo/
    │   ├── demo-context.tsx
    │   ├── demo-layout.tsx
    │   ├── register.tsx
    │   ├── questionnaire.tsx
    │   ├── recommendation.tsx
    │   ├── funding-method.tsx
    │   ├── deposit.tsx
    │   ├── sumsub.tsx                 # Eager-loaded (Sumsub iframe)
    │   └── live-portfolio.tsx
    │
    ├── tg/
    │   ├── index.tsx                  # Legacy Telegram app
    │   └── v2/
    │       ├── App.tsx
    │       ├── index.tsx
    │       ├── components/
    │       │   ├── BottomNav.tsx
    │       │   ├── DepositSheet.tsx
    │       │   ├── SparklineSVG.tsx
    │       │   └── StatusBadge.tsx
    │       └── hooks/
    │           ├── useTelegramSession.ts
    │           └── useTgPolling.ts
    │
    └── q1f/
        ├── index.tsx
        ├── components.tsx
        ├── tokens.ts                  # Deprecated design tokens
        └── screens/
            ├── portfolio.tsx
            ├── wallet.tsx
            ├── exchange.tsx
            ├── ai-invest.tsx
            └── profile.tsx
```

---

## 2. Страницы и компоненты: что рендерит, какие props

### Страницы (pages/)

| Файл | Рендерит | Props |
|------|----------|-------|
| `home.tsx` | Hero с балансом, QuickActions, балансы, стратегии, хранилища | нет (данные через `useQuery /api/bootstrap`) |
| `portfolio.tsx` | HeroSection + InvestmentsSection + PortfolioChart + BalancesSection | нет |
| `analytics.tsx` | Аналитика портфеля (сравнение с BTC/SPY, доходность) | нет |
| `dashboard.tsx` | Дашборд (live-метрики, торги) | нет |
| `risk.tsx` | Риск-профиль | нет |
| `profile.tsx` | Профиль пользователя | нет |
| `inbox.tsx` | Список уведомлений | нет |
| `statements.tsx` | Выгрузка выписок | нет |
| `status.tsx` | Статус платформы | нет |
| `withdraw.tsx` | Страница вывода | нет |
| `landing.tsx` | Лендинг (до авторизации) | нет |
| `not-found.tsx` | 404 | нет |

### Операционные модалки (components/operations/)

| Компонент | Рендерит | Props |
|-----------|----------|-------|
| `ActionSheet` | Базовый 3-шаговый sheet: сумма → подтверждение → результат | `open`, `onClose`, `title`, `steps[]` |
| `DepositSheet` | Форма пополнения (USDT / карта) | `open`, `onClose` |
| `WithdrawSheet` | Форма вывода | `open`, `onClose`, `maxAmount?` |
| `TransferSheet` | Перевод между счетами | `open`, `onClose` |
| `InvestSheet` | Выбор стратегии + сумма инвестирования | `open`, `onClose`, `strategy?` |
| `OperationRow` | Строка транзакции в списке | `operation: Operation` |
| `OperationDetailsSheet` | Детали транзакции | `operation`, `open`, `onClose` |

### Компоненты стратегий (components/strategy/)

| Компонент | Рендерит | Props |
|-----------|----------|-------|
| `TierCard` | Карточка риск-тира (LOW/CORE/HIGH) с доходностью и sparkline | `tier: "LOW"\|"CORE"\|"HIGH"`, `strategies: Strategy[]`, `onClick?` |
| `StrategyCard` | Карточка отдельной стратегии | `strategy: Strategy`, `onClick?` |
| `StrategyDetailsSheet` | Sheet с деталями стратегии | `strategy: Strategy`, `open`, `onClose` |

### Чарты (components/charts/)

| Компонент | Рендерит | Props |
|-----------|----------|-------|
| `PortfolioChart` | Area/Line chart (Recharts), BTC + SPY сравнение | `period: string`, `data?` |
| `CandlestickChart` | OHLC свечной график | `data: OHLC[]`, `height?` |
| `CompareChart` | Сравнительный chart | `data`, `lines: LineConfig[]` |
| `Sparkline` | SVG мини-график | `data: number[]`, `color?`, `width?`, `height?` |
| `PeriodToggle` | Переключатель периода (1D/1W/1M/3M/1Y) | `value`, `onChange` |

---

## 3. Роутинг: URL → компонент

### Публичные маршруты

| URL | Компонент | Файл |
|-----|-----------|------|
| `/` (неаутентифицирован) | `Landing` | `pages/landing.tsx` |
| `/demo` | `DemoRouter` | lazy |
| `/demo/register` | `DemoRegister` | `pages/demo/register.tsx` |
| `/demo/questionnaire` | `DemoQuestionnaire` | `pages/demo/questionnaire.tsx` |
| `/demo/recommendation` | `DemoRecommendation` | `pages/demo/recommendation.tsx` |
| `/demo/funding-method` | `DemoFundingMethod` | `pages/demo/funding-method.tsx` |
| `/demo/deposit` | `DemoDeposit` | `pages/demo/deposit.tsx` |
| `/demo/sumsub` | `DemoSumsub` | `pages/demo/sumsub.tsx` *(eager)* |
| `/demo/live-portfolio` | `DemoLivePortfolio` | `pages/demo/live-portfolio.tsx` |
| `/tg`, `/tg/v2`, `/telegram` | `TelegramMiniAppV2` | `pages/tg/v2/index.tsx` |
| `/tg/legacy` | `TelegramMiniAppLegacy` | `pages/tg/index.tsx` |
| `/q1f` | `Q1FApp` | `pages/q1f/index.tsx` |

### Онбординг (после логина, до завершения KYC)

| URL | Компонент | Файл |
|-----|-----------|------|
| `/onboarding` | `OnboardingWelcome` | `pages/onboarding/index.tsx` |
| `/onboarding/verify` | `OnboardingVerify` | `pages/onboarding/verify.tsx` |
| `/onboarding/consent` | `OnboardingConsent` | `pages/onboarding/consent.tsx` |
| `/onboarding/kyc` | `OnboardingKyc` | `pages/onboarding/kyc.tsx` |
| `/onboarding/smart-start` | `SmartStart` | `pages/onboarding/smart-start.tsx` |
| `/onboarding/smart-start/results` | `SmartStartResults` | `pages/onboarding/smart-start-results.tsx` |
| `/onboarding/du-declaration` | `DuDeclaration` | `pages/onboarding/du-declaration.tsx` |
| `/onboarding/done` | `OnboardingDone` | `pages/onboarding/done.tsx` |

### Защищённые маршруты (аутентифицированный пользователь)

| URL | Компонент | Файл |
|-----|-----------|------|
| `/` | `Portfolio` | `pages/portfolio.tsx` |
| `/strategies`, `/invest` | `InvestPage` | `pages/invest/index.tsx` |
| `/invest/:id` | `StrategyDetail` | `pages/invest/strategy-detail.tsx` |
| `/invest/:id/confirm` | `InvestConfirm` | `pages/invest/confirm.tsx` |
| `/portfolio` | `Portfolio` | `pages/portfolio.tsx` |
| `/dashboard` | `Dashboard` | `pages/dashboard.tsx` |
| `/analytics` | `Analytics` | `pages/analytics.tsx` |
| `/risk` | `Risk` | `pages/risk.tsx` |
| `/profile` | `ProfilePage` | `pages/profile.tsx` |
| `/wallet` | `Wallet` | `pages/wallet/index.tsx` |
| `/wallet/vaults` | `Vaults` | `pages/wallet/vaults.tsx` |
| `/deposit/usdt` | `DepositUSDT` | `pages/deposit/usdt.tsx` |
| `/deposit/card` | `DepositCard` | `pages/deposit/card.tsx` |
| `/withdraw` | `Withdraw` | `pages/withdraw.tsx` |
| `/activity` | `ActivityEvents` | `pages/activity/events.tsx` |
| `/activity/transactions` | `Activity` | `pages/activity/index.tsx` |
| `/activity/:operationId` | `Receipt` | `pages/activity/receipt.tsx` |
| `/settings` | `Settings` | `pages/settings/index.tsx` |
| `/settings/security` | `SecuritySettings` | `pages/settings/security.tsx` |
| `/settings/profile` | `SettingsProfile` | `pages/settings/profile.tsx` |
| `/settings/notifications` | `SettingsNotifications` | `pages/settings/notifications.tsx` |
| `/settings/support` | `SettingsSupport` | `pages/settings/support.tsx` |
| `/statements` | `Statements` | `pages/statements.tsx` |
| `/inbox` | `Inbox` | `pages/inbox.tsx` |
| `/status` | `StatusPage` | `pages/status.tsx` |
| `/admin` | `AdminDashboard` | `pages/admin/dashboard.tsx` |
| `/admin/dashboard` | `AdminDashboard` | `pages/admin/dashboard.tsx` |
| `/admin/kyc` | `AdminKyc` | `pages/admin/kyc.tsx` |
| `/admin/withdrawals` | `AdminWithdrawals` | `pages/admin/withdrawals.tsx` |
| `/admin/management-fees` | `AdminManagementFees` | `pages/admin/management-fees.tsx` |

---

## 4. Общие UI-компоненты

### Кнопки

| Компонент | Файл | Варианты | Где используется |
|-----------|------|----------|-----------------|
| `Button` | `components/ui/button.tsx` | `default`, `destructive`, `outline`, `secondary`, `ghost` / `sm`, `default`, `lg`, `icon` | Повсеместно: все страницы, все модалки |
| `IconButton` | `components/ui/icon-button.tsx` | — | AppShell, NotificationBell, ThemeToggle |

### Карточки

| Компонент | Файл | Где используется |
|-----------|------|-----------------|
| `Card` + `CardHeader/Content/Footer` | `components/ui/card.tsx` | Portfolio, Home, Invest, Settings, Admin |
| `MetricCard` | `components/ui/metric-card.tsx` | Dashboard, Analytics |
| `QuoteCard` | `components/ui/quote-card.tsx` | Home (live quotes) |
| `TierCard` | `components/strategy/tier-card.tsx` | `pages/invest/index.tsx`, `pages/home.tsx` |
| `StrategyCard` | `components/strategy/strategy-card.tsx` | `pages/invest/index.tsx` |
| `VaultCard` | `components/vault/vault-card.tsx` | `pages/wallet/vaults.tsx` |
| `BalanceCard` | `components/wallet/balance-card.tsx` | `pages/wallet/index.tsx`, `pages/home.tsx` |
| `CurrencyCard` | `components/wallet/currency-card.tsx` | `pages/wallet/index.tsx` |

### Модалки / Sheets / Drawers

| Компонент | Файл | Где используется |
|-----------|------|-----------------|
| `Dialog` | `components/ui/dialog.tsx` | Глобально (Radix-based) |
| `Sheet` | `components/ui/sheet.tsx` | DepositSheet, WithdrawSheet, InvestSheet |
| `Drawer` | `components/ui/drawer.tsx` | Мобильные bottom-sheet'ы |
| `AlertDialog` | `components/ui/alert-dialog.tsx` | Подтверждения destructive-действий |
| `DepositSheet` | `components/operations/deposit-sheet.tsx` | `pages/home.tsx`, `pages/wallet/index.tsx` |
| `WithdrawSheet` | `components/operations/withdraw-sheet.tsx` | `pages/home.tsx`, `pages/wallet/index.tsx` |
| `TransferSheet` | `components/operations/transfer-sheet.tsx` | `pages/wallet/index.tsx` |
| `InvestSheet` | `components/operations/invest-sheet.tsx` | `pages/home.tsx`, `pages/invest/index.tsx` |
| `StrategyDetailsSheet` | `components/strategy/strategy-details-sheet.tsx` | `pages/invest/index.tsx` |
| `OperationDetailsSheet` | `components/operations/operation-details-sheet.tsx` | `pages/activity/index.tsx` |

### Прочие общие компоненты

| Компонент | Файл | Где используется |
|-----------|------|-----------------|
| `Badge` | `components/ui/badge.tsx` | TierCard, StrategyCard, OperationRow |
| `Chip` | `components/ui/chip.tsx` | TierCard, StrategyCard |
| `Skeleton` | `components/ui/skeleton.tsx` | Везде как loading state |
| `EmptyState` | `components/ui/empty-state.tsx` | Activity, Invest, Inbox |
| `StatusBadge` | `components/ui/status-badge.tsx` | OperationRow, Receipt |
| `LiveBadge` | `components/ui/live-badge.tsx` | Dashboard, LiveQuotesBar |
| `Toast/Toaster` | `components/ui/toast.tsx`, `toaster.tsx` | App.tsx (глобально) |
| `Tooltip` | `components/ui/tooltip.tsx` | Глобально (TooltipProvider в App.tsx) |
| `Separator` | `components/ui/separator.tsx` | Settings, Profile |
| `PageHeader` | `components/ui/page-header.tsx` | Все страницы |
| `SectionHeader` | `components/ui/section-header.tsx` | Home, Portfolio, Invest |

---

## 5. Дизайн-токены

### CSS-переменные (`:root` / `.dark`) — `client/src/index.css`

#### Цвета

```css
/* Фон и текст */
--background          /* белый (light) / чёрный (dark) */
--foreground          /* тёмный текст / светлый текст */
--muted               /* приглушённый фон */
--muted-foreground    /* приглушённый текст */

/* Компонентные */
--card                /* фон карточки */
--card-foreground
--border              /* границы */
--input               /* фон инпутов */
--ring                /* focus ring */

/* Семантические */
--primary: #0071E3    /* Apple Blue — основной акцент */
--secondary
--accent
--destructive
--success:  #34C759   /* зелёный */
--warning:  #FF9F0A   /* оранжевый */
--danger:   #FF3B30   /* красный */

/* Поверхности */
--surface             /* фон surface-элементов */
--surface-2
--sidebar             /* фон сайдбара */
```

#### Тени

```css
--shadow-sm   --shadow-md   --shadow-lg
--shadow-xl   --shadow-2xl
```

#### Шрифты

```css
--font-sans   /* SF Pro / system-ui / sans-serif */
--font-serif
--font-mono
```

### JS-токены — `client/src/lib/design-tokens.ts`

```ts
tokens = {
  color: {
    bg, text, textSecondary,
    accent,           // primary blue
    positive,         // profit green
    negative,         // loss red
    warning,          // orange
    border, surface,
    btc, eth, usdt, sol, ton   // crypto brand colors
  },
  radius: {
    xs: 8, sm: 12, md: 16, lg: 20, xl: 24, pill: 9999
  },
  space: {
    xs: 4, sm: 8, md: 12, lg: 16,
    xl: 20, xxl: 24, xxxl: 32, section: 48
  },
  font: {
    size: {
      xs: 11, sm: 13, md: 15, lg: 17,
      xl: 20, xxl: 24, hero: 34, display: 48
    },
    weight: { regular: 400, medium: 500, semibold: 600, bold: 700 }
  }
}
```

> Функция `getToken(varName)` — runtime-доступ к CSS-переменным.

### Tailwind-расширения — `tailwind.config.ts`

```ts
theme.extend = {
  borderRadius: { lg: '1.25rem', md: '1rem', sm: '0.75rem' },
  colors: {
    primary: { DEFAULT, foreground },
    secondary, muted, accent, destructive,
    success, warning, danger,
    surface: { DEFAULT, 2 },
    sidebar: { DEFAULT, foreground, border, accent, ... },
    chart: { '1' .. '5' }
  },
  fontFamily: { sans, serif, mono },
  animation: { 'accordion-down', 'accordion-up' }
}
```

### Утилитарные CSS-классы (`index.css`)

```css
.elevate-*            /* brightness elevation hover-эффекты */
.tabular-nums         /* выравнивание цифр */
.font-money           /* font-feature-settings для денежных значений */
.space-section        /* padding-top: var(--space-section) */
.space-card           /* padding для карточек */
.space-compact        /* компактный padding */
.price-flash-up       /* анимация роста цены (зелёный flash) */
.price-flash-down     /* анимация падения цены (красный flash) */
.trade-slide-in       /* анимация появления трейда */
.scrollbar-thin       /* кастомный тонкий скроллбар */
```

---

## 6. Зависимости между компонентами

### App.tsx (корень)

```
App.tsx
├── QueryClientProvider (react-query)
├── ThemeProvider (hooks/use-theme)
├── TooltipProvider (ui/tooltip)
├── Toaster (ui/toaster)
├── GateGuard (components/onboarding/gate-guard)
│   └── AppShell (components/app-shell)
│       ├── Sidebar (ui/sidebar)
│       ├── TopBar
│       │   ├── NotificationBell
│       │   └── ThemeToggle
│       ├── GlobalBanner
│       └── <outlet> → страницы
└── Все страницы (lazy loaded)
```

### Граф импортов (ключевые связи)

```
pages/home.tsx
  → components/ui/card
  → components/ui/button
  → components/ui/skeleton
  → components/operations/deposit-sheet
  → components/operations/withdraw-sheet
  → components/operations/invest-sheet
  → components/strategy/tier-card      (TIER_META)
  → components/live-quotes-bar
  → hooks/use-auth
  → @shared/schema

pages/invest/index.tsx
  → components/strategy/tier-card      (TierCard, TIER_META)
  → components/strategy/strategy-card
  → components/strategy/strategy-details-sheet
  → components/operations/invest-sheet
  → components/ui/empty-state
  → components/ui/skeleton
  → hooks/use-auth
  → @shared/schema

pages/portfolio.tsx
  → components/charts/portfolio-chart
  → components/charts/period-toggle
  → components/ui/range-selector
  → components/ui/card
  → components/ui/skeleton
  → hooks/use-auth

components/app-shell.tsx
  → components/ui/sidebar
  → components/ui/button
  → components/ui/avatar
  → components/ui/dropdown-menu
  → components/theme-toggle
  → components/notification-bell
  → components/global-banner
  → hooks/use-auth
  → hooks/use-mobile
  → contexts/page-context

components/operations/action-sheet.tsx  (база для всех операций)
  → components/ui/sheet
  → components/ui/button
  → components/ui/input
  → components/ui/numeric-keypad
  → lib/money

components/strategy/tier-card.tsx
  → components/ui/card
  → components/ui/button
  → components/ui/badge
  → components/ui/chip
  → components/charts/sparkline
  → lib/platform-stats             (tierDistribution)
  → @shared/schema                 (Strategy type)

components/charts/portfolio-chart.tsx
  → recharts
  → components/ui/skeleton
  → lib/money
  → /api/market/spy-prices (fetch)
  → CoinGecko API (BTC prices)
```

### Shared types (`@shared/schema`)

Используются в:
- `pages/portfolio.tsx`, `pages/invest/index.tsx`, `pages/home.tsx`
- `components/strategy/tier-card.tsx`, `strategy-card.tsx`
- `components/operations/*.tsx`
- `hooks/use-auth.ts`

### API endpoints

| Endpoint | Используется в |
|----------|---------------|
| `GET /api/bootstrap` | `pages/home.tsx`, `pages/portfolio.tsx`, `hooks/use-auth.ts` |
| `GET /api/strategies` | `pages/invest/index.tsx` |
| `GET /api/analytics/overview?days=N` | `pages/analytics.tsx` |
| `GET /api/market/spy-prices?days=N` | `components/charts/portfolio-chart.tsx` |
| `POST /api/deposit` | `components/operations/deposit-sheet.tsx` |
| `POST /api/withdraw` | `components/operations/withdraw-sheet.tsx` |
| `POST /api/invest` | `components/operations/invest-sheet.tsx` |
| `POST /api/transfer` | `components/operations/transfer-sheet.tsx` |

---

*Сгенерировано: 2026-03-31*
