# Q1F Project Structure Analysis

## 1. Локализация / i18n / Переводы

**Статус: выделенная система i18n НЕ реализована.**

Весь текст вшит хардкодом прямо в компоненты (преимущественно русский язык).
Из инструментов локализации используется только форматирование дат/чисел.

### Файлы с locale-форматированием

| Файл | Использование |
|------|---------------|
| `client/src/components/operations/operation-row.tsx` | `toLocaleTimeString("ru-RU")` |
| `client/src/components/notification-bell.tsx` | `date-fns` с `locale: ru` |
| `client/src/components/live-trade-feed.tsx` | `toLocaleTimeString("ru-RU")` |
| `client/src/pages/analytics.tsx` | `toLocaleDateString("ru-RU")` |

**Вывод:** для добавления мультиязычности потребуется:
- подключить библиотеку (например, `react-i18next`)
- вынести ~200+ хардкодных строк в файлы переводов
- добавить переключатель языка в Settings

---

## 2. Цвета / Тема / Дизайн-токены

```
client/src/
├── pages/q1f/
│   └── tokens.ts                ← ГЛАВНЫЙ файл токенов (Apple-стиль)
│                                   colors, radius, space, font, shadow, transition
├── index.css                    ← CSS-переменные: light/dark (100+ переменных)
│                                   --background, --primary, --success, --danger,
│                                   --chart-1..5, sidebar, shadows
├── tailwind.config.ts           ← Tailwind-тема поверх CSS-переменных
│                                   darkMode: "class"
└── components/
    ├── theme-toggle.tsx         ← UI-переключатель темы
    └── (hooks/)
        └── use-theme.tsx        ← useTheme(): theme / setTheme / toggleTheme
                                    сохраняет в localStorage
```

### Palette из `tokens.ts` (ключевые цвета)

| Токен | Значение | Назначение |
|-------|----------|------------|
| `color.accent` | `#0071E3` | Apple Blue — акцент |
| `color.positive` | `#34C759` | Зелёный — рост |
| `color.negative` | `#FF3B30` | Красный — убыток |
| `color.warning` | `#FF9F0A` | Оранжевый — предупреждение |
| `color.btc` | `#F7931A` | Bitcoin |
| `color.eth` | `#627EEA` | Ethereum |
| `color.usdt` | `#26A17B` | Tether |
| `color.sol` | `#9945FF` | Solana |
| `color.ton` | `#0098EA` | TON |

---

## 3. Компоненты навигации

```
client/src/
├── pages/
│   ├── tg/v2/components/
│   │   └── BottomNav.tsx        ← МОБИЛЬНАЯ навигация (Telegram Mini App)
│   │                               Tabs: overview | strategies | activity | deposit
│   │                               Props: active: TgTabKey, onChange: (tab) => void
│   └── q1f/
│       └── index.tsx            ← ДЕСКТОП-навигация Q1F-приложения
│                                   Tabs: portfolio | exchange | ai | wallet | profile
└── components/
    └── app-shell.tsx            ← САЙДБАР основного веб-приложения
                                    Маршруты: Home, Invest, Wallet, Activity,
                                    Settings, Admin
```

---

## 4. Компоненты экранов

### Home / Dashboard (Главная)

```
client/src/pages/
├── home.tsx                     ← Главный экран: баланс портфеля, графики,
│                                   кнопки (Пополнить / Вывести / Перевести / Инвестировать)
├── dashboard.tsx                ← Admin-дашборд
└── q1f/screens/
    └── portfolio.tsx            ← Экран портфеля Q1F: баланс, график с градиентом,
                                    период (1m/3m/…), активы со sparklines
```

### Wallet (Кошелёк)

```
client/src/pages/
├── wallet/
│   ├── index.tsx                ← "Кошелёк" — балансы (USDT/RUB/крипта),
│   │                               сейфы, кнопки действий
│   └── vaults.tsx               ← Детали сейфов
├── q1f/screens/
│   └── wallet.tsx               ← "Кошелёк" Q1F: крипто-карточки,
│                                   история транзакций
├── deposit/
│   ├── usdt.tsx                 ← Пополнение USDT
│   └── card.tsx                 ← Пополнение картой
└── withdraw.tsx                 ← Вывод средств
```

### Panel / Activity (История операций)

```
client/src/pages/activity/
├── index.tsx                    ← Лента операций (история)
├── events.tsx                   ← События и трейды
└── receipt.tsx                  ← Квитанция по отдельной операции
```

### Investments (Инвестиции)

```
client/src/pages/
├── invest/
│   ├── index.tsx                ← Список стратегий
│   ├── strategy-detail.tsx      ← Детальная карточка стратегии
│   └── confirm.tsx              ← Подтверждение инвестиции
└── q1f/screens/
    └── ai-invest.tsx            ← "AI Инвестиции": 3 стратегии —
                                    Консервативный (+12.4% APY) /
                                    Сбалансированный (+24.8% APY) /
                                    Агрессивный (+47.2% APY)
```

### Settings (Настройки)

```
client/src/pages/
├── settings/
│   ├── index.tsx                ← "Настройки" — главный экран
│   ├── security.tsx             ← 2FA, история входов, сессии
│   ├── profile.tsx              ← Данные пользователя, KYC-статус
│   ├── notifications.tsx        ← Настройки уведомлений
│   └── support.tsx              ← Поддержка
└── q1f/screens/
    └── profile.tsx              ← Профиль Q1F: Платёжные методы,
                                    Уведомления, Безопасность,
                                    Налоговый отчёт, Реферальная программа
```

---

## Сводная таблица

| Категория | Статус | Ключевые файлы |
|-----------|--------|----------------|
| i18n / переводы | Не реализовано | — (хардкод RU) |
| Дизайн-токены | Реализовано | `q1f/tokens.ts`, `index.css`, `tailwind.config.ts` |
| Навигация | Реализовано | `tg/v2/BottomNav.tsx`, `q1f/index.tsx`, `app-shell.tsx` |
| Home / Dashboard | Реализовано | `home.tsx`, `q1f/screens/portfolio.tsx` |
| Wallet | Реализовано | `wallet/index.tsx`, `q1f/screens/wallet.tsx` |
| Investments | Реализовано | `invest/index.tsx`, `q1f/screens/ai-invest.tsx` |
| Settings | Реализовано | `settings/index.tsx` + 4 подстраницы |
| Activity / Panel | Реализовано | `activity/index.tsx`, `events.tsx`, `receipt.tsx` |
