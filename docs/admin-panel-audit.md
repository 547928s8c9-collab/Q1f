# Документация админ-панели для редизайна

## 1. Скриншоты экранов

> Скриншоты необходимо сделать вручную. Ниже — список всех экранов и состояний, которые нужно заскриншотить.

### Экраны для скриншотов:

| # | Экран | URL | Состояния |
|---|-------|-----|-----------|
| 1 | **Dashboard** | `/admin/dashboard` | С данными, пустое состояние |
| 2 | **KYC — список** | `/admin/kyc` | Все фильтры: ALL, NOT_STARTED, IN_REVIEW, APPROVED, NEEDS_ACTION, REJECTED, ON_HOLD; пустой список; поиск |
| 3 | **KYC — карточка заявителя** | `/admin/kyc` (sheet) | Детали заявки, кнопки решений |
| 4 | **KYC — модалка решения** | `/admin/kyc` (dialog) | Approve, Needs Action, On Hold, Reject с полем причины |
| 5 | **Withdrawals — список** | `/admin/withdrawals` | Все фильтры: ALL, PENDING, APPROVED, PROCESSING, COMPLETED, FAILED, REJECTED, CANCELLED; пустой список; поиск |
| 6 | **Withdrawals — карточка** | `/admin/withdrawals` (sheet) | Детали вывода, risk flags, pending actions |
| 7 | **Withdrawals — действия** | `/admin/withdrawals` (dialogs) | REVIEW, REQUEST_APPROVAL, APPROVE, REJECT (с причиной), MARK_PROCESSING, MARK_COMPLETED (с tx hash), MARK_FAILED (с error) |
| 8 | **Management Fees** | `/admin/management-fees` | Таблица с тремя тарифами, редактирование |

---

## 2. Карта навигации

```
/admin
├── /admin/dashboard                    ← Главная страница админки
│   ├── KPI-карточки (users, active, AUM, pending withdrawals)
│   ├── ActionCard → /admin/kyc         ("KYC на рассмотрении")
│   ├── ActionCard → /admin/withdrawals ("Выводы ожидают")
│   ├── Таблица "Последние пользователи"
│   ├── Activity feed
│   └── Таблица "Активные инвестиции"
│
├── /admin/kyc                          ← Управление KYC
│   ├── Список заявителей (поиск + фильтр по статусу)
│   ├── [Sheet] Детали заявителя
│   └── [Dialog] Принятие решения
│
├── /admin/withdrawals                  ← Управление выводами
│   ├── Список запросов (поиск + фильтр по статусу)
│   ├── [Sheet] Детали вывода
│   └── [Dialog] Действия (review → approve/reject → process → complete)
│
└── /admin/management-fees              ← Настройка комиссий
    └── Таблица тарифов (Stable / Active / Aggressive)
```

### Проблемы навигации:
- **Нет админ-сайдбара** — переход между разделами только через dashboard или прямой URL
- **Нет breadcrumbs** — пользователь не видит текущую позицию
- **Management Fees недоступен с dashboard** — только по прямой ссылке
- **Нет индикатора админ-раздела** в основном навигационном меню

---

## 3. Стек и структура проекта

### Стек

| Слой | Технология |
|------|-----------|
| **Frontend** | React 18.3 (SPA) |
| **Роутинг** | Wouter 3.3 |
| **UI-библиотека** | Shadcn/ui + Radix UI |
| **Стили** | Tailwind CSS 3.4 |
| **State management** | TanStack React Query 5.60 (серверный стейт) |
| **Формы** | React Hook Form 7.55 + Zod |
| **Анимации** | Framer Motion 11 |
| **Иконки** | Lucide React, React Icons |
| **Тёмная тема** | next-themes |
| **Сборка** | Vite 7.3 |
| **Backend** | Express.js 4.21 (Node.js) |
| **ORM** | Drizzle ORM 0.39 |
| **БД** | PostgreSQL |
| **Авторизация** | Passport.js + express-session + JWT |
| **2FA** | otplib (TOTP) |
| **Тесты** | Vitest (unit) + Playwright (e2e) |
| **Язык** | TypeScript 5.6 (strict) |
| **Реалтайм** | WebSocket (ws) |

### Структура папок

```
Q1f/
├── client/src/
│   ├── App.tsx                    # Роутинг
│   ├── pages/
│   │   ├── admin/
│   │   │   ├── dashboard.tsx      # 449 строк
│   │   │   ├── kyc.tsx            # 418 строк
│   │   │   ├── withdrawals.tsx    # 797 строк
│   │   │   └── management-fees.tsx # 280 строк
│   │   ├── portfolio/
│   │   ├── invest/
│   │   ├── wallet/
│   │   ├── deposit/
│   │   ├── settings/
│   │   ├── onboarding/
│   │   └── ...
│   ├── components/
│   │   ├── ui/                    # Shadcn/ui (25+ компонентов)
│   │   ├── admin/
│   │   │   └── demo-mode-banner.tsx
│   │   └── ...
│   ├── hooks/
│   │   ├── use-auth.ts
│   │   └── ...
│   └── lib/
│       ├── queryClient.ts
│       └── ...
│
├── server/
│   ├── admin/
│   │   ├── router.ts              # Все админ-роуты (~2000 строк)
│   │   ├── audit.ts               # Аудит-лог
│   │   └── middleware/
│   │       ├── adminAuth.ts       # Аутентификация
│   │       └── rbac.ts            # RBAC-авторизация
│   ├── routes.ts                  # Основные роуты
│   ├── storage.ts                 # Data access layer
│   ├── middleware/
│   ├── services/
│   └── ...
│
└── shared/
    ├── schema.ts                  # Drizzle-схема БД (~73KB)
    ├── admin/
    │   └── dto.ts                 # Типы и Zod-схемы для админки
    └── ...
```

---

## 4. Список API-эндпоинтов

### Ядро

| Метод | Эндпоинт | Описание | Пермишн |
|-------|----------|----------|---------|
| GET | `/api/admin/me` | Данные текущего админа (роли, права) | — (auth only) |
| GET | `/api/admin/overview` | Метрики для dashboard | `users.read` |
| GET | `/api/admin/health/engine` | Статус движка | `config.read` |
| GET | `/api/admin/market/status` | Статус рынка | `config.read` |

### Пользователи

| Метод | Эндпоинт | Описание | Пермишн |
|-------|----------|----------|---------|
| GET | `/api/admin/users` | Список пользователей (pagination, search, sort) | `users.read` |
| GET | `/api/admin/users/:id` | Детали пользователя | `users.read` |
| POST | `/api/admin/users/:id/block` | Блокировка (idempotent) | `users.update` |
| POST | `/api/admin/users/:id/unblock` | Разблокировка (idempotent) | `users.update` |

### Операции

| Метод | Эндпоинт | Описание | Пермишн |
|-------|----------|----------|---------|
| GET | `/api/admin/operations` | Список операций | `money.read` |
| GET | `/api/admin/operations/:id` | Детали операции | `money.read` |

### Inbox

| Метод | Эндпоинт | Описание | Пермишн |
|-------|----------|----------|---------|
| GET | `/api/admin/inbox` | Входящие сообщения | `inbox.read` |

### Инциденты

| Метод | Эндпоинт | Описание | Пермишн |
|-------|----------|----------|---------|
| GET | `/api/admin/incidents` | Список инцидентов | `incidents.read` |
| GET | `/api/admin/incidents/:id` | Детали инцидента | `incidents.read` |
| POST | `/api/admin/incidents` | Создать инцидент (idempotent) | `incidents.publish` |
| PATCH | `/api/admin/incidents/:id` | Обновить инцидент (idempotent) | `incidents.publish` |

### KYC

| Метод | Эндпоинт | Описание | Пермишн |
|-------|----------|----------|---------|
| GET | `/api/admin/kyc/applicants` | Список заявителей (search, filter, sort) | `kyc.read` |
| GET | `/api/admin/kyc/applicants/:id` | Детали заявителя + allowed transitions | `kyc.read` |
| POST | `/api/admin/kyc/applicants/:id/decision` | Решение (APPROVED/REJECTED/NEEDS_ACTION/ON_HOLD) | `kyc.review` |

### Выводы (Withdrawals)

| Метод | Эндпоинт | Описание | Пермишн |
|-------|----------|----------|---------|
| GET | `/api/admin/withdrawals` | Список выводов (search, filter, sort) | `withdrawals.read` |
| GET | `/api/admin/withdrawals/:id` | Детали вывода + risk assessment | `withdrawals.read` |
| POST | `/api/admin/withdrawals/:id/review` | Ревью (idempotent) | `withdrawals.approve` |
| POST | `/api/admin/withdrawals/:id/request-approval` | Запрос 4-eyes approval (idempotent) | `withdrawals.approve` |
| POST | `/api/admin/withdrawals/:id/reject` | Отклонить с причиной (idempotent) | `withdrawals.approve` |
| POST | `/api/admin/withdrawals/:id/process` | Processing/Completed/Failed (idempotent) | `withdrawals.manage` |
| POST | `/api/admin/pending-actions/:id/approve` | Второй approval (4-eyes) | `withdrawals.approve` |

### Конфигурация

| Метод | Эндпоинт | Описание | Пермишн |
|-------|----------|----------|---------|
| GET | `/api/admin/management-fees` | Текущие комиссии | `config.read` |
| PUT | `/api/admin/management-fees` | Обновить комиссии | `config.write` |
| POST | `/api/admin/strategies/calibrate` | Калибровка стратегий | `config.write` |

### Dev-only

| Метод | Эндпоинт | Описание | Пермишн |
|-------|----------|----------|---------|
| POST | `/api/admin/demo/seed` | Заполнить демо-данные | `super_admin` |

---

## 5. Роли и права доступа

### Архитектура RBAC

```
adminUsers ──M:N──► adminUserRoles ──M:N──► roles
                                              │
                                              ▼
                                        rolePermissions ──M:N──► permissions
```

### Все пермишны

| Пермишн | Описание | Где используется |
|---------|----------|-----------------|
| `users.read` | Просмотр пользователей и overview | Dashboard, Users |
| `users.update` | Блокировка/разблокировка | Users |
| `money.read` | Просмотр операций | Operations |
| `config.read` | Просмотр конфигурации, здоровья | Health, Market, Fees |
| `config.write` | Изменение конфигурации | Fees, Calibration |
| `inbox.read` | Просмотр inbox | Inbox |
| `incidents.read` | Просмотр инцидентов | Incidents |
| `incidents.publish` | Создание/обновление инцидентов | Incidents |
| `kyc.read` | Просмотр KYC заявок | KYC list/detail |
| `kyc.review` | Принятие решений по KYC | KYC decisions |
| `withdrawals.read` | Просмотр выводов | Withdrawals list/detail |
| `withdrawals.approve` | Одобрение/отклонение выводов | Withdrawal review |
| `withdrawals.manage` | Управление процессингом | Withdrawal processing |
| `super_admin` | Полный доступ + dev функции | Demo seed |

### Стек middleware (каждый запрос):

```
ensureRequestId → adminAuth → loadPermissions → requirePermission("...") → handler
```

1. **ensureRequestId** — добавляет request ID для аудита
2. **adminAuth** — проверяет аутентификацию + статус `isActive` в таблице `adminUsers`
3. **loadPermissions** — загружает роли и пермишны (кэш 60 сек)
4. **requirePermission** — проверяет наличие конкретных пермишнов

### Дополнительные механизмы безопасности:

- **2FA (TOTP)** — опциональная двухфакторная аутентификация через otplib
- **4-eyes principle** — для критичных операций (withdrawals) требуется approval второго админа
- **Idempotency-Key** — все мутирующие операции идемпотентны
- **Audit Log** — все действия записываются (`actorAdminUserId`, `actionType`, `targetType`, `targetId`, `before/after JSON`, `reason`)
- **User blocking** — админ может заблокировать пользователя, что возвращает 403 при любом запросе

---

## Резюме для дизайнера

### Текущие экраны: 4 страницы
- Dashboard (KPI + quick actions)
- KYC management (list → detail sheet → decision dialog)
- Withdrawals management (list → detail sheet → action dialogs, 4-eyes flow)
- Management Fees (editable table)

### Бэкенд-функционал без UI (готов к реализации):
- Управление пользователями (список, блокировка) — API есть, страницы нет
- Операции (список, детали) — API есть, страницы нет
- Инциденты (CRUD) — API есть, страницы нет
- Inbox — API есть, страницы нет
- Health/Market status — API есть, страницы нет
- Калибровка стратегий — API есть, страницы нет
