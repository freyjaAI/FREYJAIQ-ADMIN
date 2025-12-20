# Freyja IQ - CRE Prospecting Platform

## Overview
Freyja IQ is a commercial real estate (CRE) prospecting platform designed to provide brokers and financial professionals with tools to quickly find property ownership information, unmask LLCs, retrieve contact details, and generate AI-powered owner dossiers. The platform aims to modernize CRE prospecting by offering multi-method search, LLC entity resolution, contact information with confidence scoring, seller intent scoring, AI-generated outreach suggestions, and one-click dossier exports.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend
- **Framework**: React with TypeScript, using Vite.
- **UI**: shadcn/ui with Radix UI primitives, Tailwind CSS for styling. Modern B2B SaaS design, Inter font for UI, JetBrains Mono for technical data.
- **Routing**: Wouter.
- **State Management**: TanStack Query for server state, React Context for theme and authentication.
- **Key Pages**: Landing, Dashboard, Search, Owner/Property lists, Owner Dossier, Dossier Export History, User Settings.

### Backend
- **Framework**: Express.js on Node.js with TypeScript.
- **API Design**: RESTful HTTP endpoints for authentication, search, owners, properties, contacts, dossiers, and dashboard analytics.
- **Core Services**: Address normalization, unified dossier generation, multi-platform property scraping, and integrations with various data providers (e.g., HomeHarvest, RealEstateApiProvider, OpenCorporates, USPS).
- **Python Integration**: Utilizes Python scripts for specific tasks like HomeHarvest lookups, address parsing (`usaddress`), OpenCorporates lookups (`opyncorporates`), and USPS validation (`usps-api`).

### Data Storage
- **Database**: PostgreSQL via Drizzle ORM.
- **Schema**: `users`, `sessions`, `owners`, `properties`, `contactInfos`, `legalEvents`, `ownerLlcLinks`, `searchHistory`, `dossierExports`.
- **ORM**: Type-safe queries with Drizzle ORM, Zod schema generation, drizzle-kit for migrations.
- **Data Access**: Repository pattern via `storage.ts`.

### Authentication & Authorization
- **Authentication**: Replit Auth (OpenID Connect) with Passport.js.
- **Session Management**: `connect-pg-simple` for PostgreSQL session storage, HttpOnly cookies.
- **Authorization**: Role-based access control with `isAuthenticated` middleware.

### AI Integration
- **Provider**: OpenAI (via Replit AI Integrations) using GPT-4o-mini.
- **Features**: LLC unmasking, seller intent scoring, outreach suggestions, and contact confidence scoring.
- **Implementation**: Rate limiting and retry logic for AI requests.

### LLC Ownership Chain Resolution
- **Process**: Recursive traversal of LLC ownership chains, detection of privacy protection via registered agents, fallback to Perplexity AI for unmasking, and person name extraction from entity names.
- **Verification**: Extracted persons are verified against property addresses using data from Data Axle/A-Leads.

### Caching Layer
- **Technology**: Redis (with in-memory fallback) for intelligent caching.
- **Strategy**: Tiered TTLs for different data types (e.g., LLC data 24-72 hours, property data 12 hours, contact enrichment 7 days).
- **Admin APIs**: Endpoints for cache statistics and resetting metrics.

### API Usage Tracking & Quotas
- **Purpose**: Centralized tracking and enforcement of hard limits for third-party API usage to prevent excessive costs.
- **Configuration**: Quotas configurable via environment variables (e.g., daily/monthly limits for Data Axle, A-Leads).
- **Admin APIs**: Endpoints for viewing and resetting provider usage statistics.

### Provider Status & Freshness
- **Mechanism**: Dossier API responses include a `sources` array detailing data providers, their status (success, cached, error, stale, fallback), last updated timestamp, and freshness label.
- **UI**: `SourcesStrip` component displays provider chips with status icons, freshness labels, tooltips, and retry options for failed providers.

## External Dependencies

### Core Framework & Build
- React 18, Express, TypeScript, Vite, Wouter, TanStack Query.

### Database & ORM
- PostgreSQL (`DATABASE_URL`), Drizzle ORM, `node-postgres`, `connect-pg-simple`.

### Authentication
- Replit Auth, Passport.js, `openid-client`, `express-session`.

### AI Services
- OpenAI (via Replit AI Integrations), Perplexity Sonar, `p-limit`, `p-retry`.

### Contact & Property Data Providers
- ATTOM, OpenCorporates, Data Axle, A-Leads, Melissa, Google Address Validation, Pacific East/Idicia (DataPrime, FPA, EMA, EMV).

### UI Components & Utilities
- shadcn/ui, Radix UI, Tailwind CSS, Lucide React, `class-variance-authority`, `cmdk`, Zod, `drizzle-zod`, React Hook Form, `date-fns`, `nanoid`, `memoizee`, `clsx`, `tailwind-merge`.

### Development & Environment
- `tsx`, `esbuild`, `@replit/vite-plugin-*`.
- **Required Environment Variables**: `DATABASE_URL`, `SESSION_SECRET`, `AI_INTEGRATIONS_OPENAI_BASE_URL`, `AI_INTEGRATIONS_OPENAI_API_KEY`, `ISSUER_URL`, `REPL_ID`, `GOOGLE_AI_API_KEY`, `USPS_USER_ID`.
- **Optional Environment Variables**: `REDIS_URL`, `PROVIDER_COST_<NAME>`, `PROVIDER_PRIORITY_<NAME>`, `PROVIDER_QUOTA_<NAME>`, and specific `QUOTA_<PROVIDER>_<PERIOD>` for API usage limits.