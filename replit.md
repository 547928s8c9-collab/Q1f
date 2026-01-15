# ZEON Fintech Dashboard

## Overview

ZEON is a production-grade fintech web dashboard MVP inspired by Revolut's structure with an Anthropic-style minimal design aesthetic. It provides portfolio management, investment strategies, wallet operations, activity tracking, and security settings for digital asset management.

The application handles cryptocurrency and fiat currency operations with USDT and RUB as primary assets, featuring real-time portfolio charts, investment strategy tracking, vault management, and comprehensive transaction history.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Framework**: React 18 with TypeScript
- **Routing**: Wouter (lightweight React router)
- **State Management**: TanStack React Query for server state
- **Styling**: Tailwind CSS with CSS variables for theming (light/dark mode support)
- **UI Components**: shadcn/ui component library with Radix UI primitives
- **Charts**: Recharts for portfolio visualization, sparklines, and comparison charts
- **Build Tool**: Vite with custom plugins for Replit integration

### Backend Architecture
- **Runtime**: Node.js with Express.js
- **Language**: TypeScript with ESM modules
- **API Pattern**: RESTful JSON API with `/api` prefix
- **Development**: Vite dev server with HMR for frontend, tsx for server hot reloading

### Data Storage
- **ORM**: Drizzle ORM with PostgreSQL dialect
- **Database**: PostgreSQL (configured via DATABASE_URL environment variable)
- **Schema Location**: `shared/schema.ts` contains all table definitions
- **Migrations**: Drizzle Kit for schema migrations (`drizzle-kit push`)

### Key Design Decisions

**Money Handling**: All monetary amounts are stored as strings representing integer minor units (never floats). USDT uses 6 decimal places, RUB uses 2 decimal places. This prevents floating-point precision errors in financial calculations.

**Shared Schema**: The `shared/` directory contains schema definitions and types used by both frontend and backend, ensuring type safety across the stack.

**In-Memory Storage Fallback**: The `server/storage.ts` implements an in-memory storage layer that can be used when the database is not available, facilitating development and testing.

**Component Organization**: 
- `client/src/components/ui/` - Reusable shadcn/ui components
- `client/src/components/charts/` - Chart components (portfolio, sparkline, compare)
- `client/src/components/operations/` - Transaction-related components
- `client/src/pages/` - Route-level page components

**Path Aliases**: 
- `@/` maps to `client/src/`
- `@shared/` maps to `shared/`
- `@assets/` maps to `attached_assets/`

## External Dependencies

### Database
- **PostgreSQL**: Primary database via `DATABASE_URL` environment variable
- **Drizzle ORM**: Database access and schema management
- **connect-pg-simple**: PostgreSQL session store for Express

### UI Framework
- **Radix UI**: Headless component primitives (dialog, dropdown, tabs, etc.)
- **shadcn/ui**: Pre-styled component library built on Radix
- **Tailwind CSS**: Utility-first styling
- **Lucide React**: Icon library (18px for normal buttons, 16px for small)

### Data & State
- **TanStack React Query**: Server state management and caching
- **Zod**: Schema validation for API requests and form data
- **drizzle-zod**: Zod schema generation from Drizzle tables

### Charts
- **Recharts**: Charting library for portfolio performance, sparklines, and comparison charts
- **embla-carousel-react**: Carousel functionality

### Development
- **Vite**: Frontend build tool and dev server
- **tsx**: TypeScript execution for server
- **esbuild**: Production bundling for server code