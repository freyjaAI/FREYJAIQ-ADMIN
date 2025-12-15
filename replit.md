# Freyja IQ - CRE Prospecting Platform

## Overview

Freyja IQ is a modern commercial real estate (CRE) prospecting platform designed to compete with legacy systems like LexisNexis. The platform enables brokers and financial professionals to quickly search for property ownership information, unmask LLCs, find contact details, and generate comprehensive owner dossiers with AI-powered insights.

The application provides:
- Multi-method property/owner search (address, name, APN)
- LLC entity resolution and ownership unmasking
- Contact information with confidence scoring
- Seller intent scoring for lead prioritization
- AI-generated outreach suggestions
- One-click dossier exports

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture

**Framework**: React with TypeScript, using Vite as the build tool

**UI Component System**: 
- shadcn/ui component library with Radix UI primitives
- Tailwind CSS for styling with custom design system
- Theme support (light/dark mode) via context provider
- Design philosophy: Modern B2B SaaS inspired by Linear, Attio, and Notion
- Typography: Inter for UI, JetBrains Mono for technical data
- Spacing primitives: Tailwind units (2, 4, 6, 8)

**Routing**: Wouter for lightweight client-side routing

**State Management**:
- TanStack Query (React Query) for server state and caching
- React Context for theme and authentication state
- No global state management library (Redux/Zustand) - relies on server state

**Key Pages**:
- Landing page (unauthenticated)
- Dashboard with stats and recent searches
- Search interface with multi-type queries
- Owner and property list views
- Owner dossier detail page with AI insights
- Dossier export history
- User settings

### Backend Architecture

**Framework**: Express.js on Node.js with TypeScript

**API Design**: RESTful HTTP endpoints
- `/api/auth/*` - Authentication routes
- `/api/search` - Property/owner search
- `/api/owners/*` - Owner CRUD and relationships
- `/api/properties/*` - Property data
- `/api/contacts/*` - Contact information
- `/api/dossiers/*` - Dossier generation and exports
- `/api/dashboard/stats` - Analytics

**Server Structure**:
- `server/index.ts` - Express app setup and middleware
- `server/routes.ts` - API route definitions
- `server/storage.ts` - Data access layer abstraction
- `server/db.ts` - Database connection setup
- `server/openai.ts` - AI integration for scoring and suggestions
- `server/static.ts` - Static file serving
- `server/vite.ts` - Vite dev server integration
- `server/addressNormalizer.ts` - Universal address normalization for provider compatibility
- `server/dossierService.ts` - Unified dossier generation with entity resolution
- `server/providers/HomeHarvestProvider.ts` - Property data fallback via Realtor.com
- `server/providers/AddressParserProvider.ts` - Address parsing via usaddress Python library
- `server/providers/RealEstateApiProvider.ts` - Skip Engine API for property skip tracing with bulk support
- `server/providers/MultiPlatformPropertyProvider.ts` - Multi-platform property scraper with Walk Score integration
- `server/python/homeharvest_lookup.py` - Python script for HomeHarvest library integration
- `server/python/address_parser.py` - Python script for address parsing and entity name normalization
- `server/python/opencorporates_lookup.py` - Python script for OpenCorporates lookups via opyncorporates wrapper
- `server/providers/OpenCorporatesPythonProvider.ts` - Node.js provider for OpenCorporates Python integration
- `server/python/usps_lookup.py` - Python script for USPS address validation via usps-api wrapper
- `server/providers/USPSProvider.ts` - Node.js provider for USPS address validation and standardization

**Build Process**: Custom esbuild-based bundling with allowlist for specific dependencies to optimize cold starts

### Data Storage

**Database**: PostgreSQL via Drizzle ORM

**Schema Design** (defined in `shared/schema.ts`):
- `users` - User accounts (required for Replit Auth)
- `sessions` - Session storage (required for Replit Auth)
- `owners` - Individual or entity owners with metadata
  - Fields: name, type (individual/entity), addresses, tax IDs, risk flags, seller intent score
- `properties` - Real estate properties
  - Fields: address, APN, property type, assessed value, sale history
- `contactInfos` - Phone numbers and emails with confidence scores
- `legalEvents` - Liens, judgments, bankruptcies, lawsuits
- `ownerLlcLinks` - Relationships between owners and LLCs
- `searchHistory` - User search tracking
- `dossierExports` - Generated dossier metadata

**ORM Features**:
- Type-safe queries with Drizzle ORM
- Zod schema generation for validation
- Migration support via drizzle-kit

**Data Access Pattern**: Repository pattern via `storage.ts` interface for abstraction

### Authentication & Authorization

**Authentication Provider**: Replit Auth (OpenID Connect)
- Configured in `server/replitAuth.ts`
- Uses Passport.js with OpenID Client strategy
- Session management via connect-pg-simple (PostgreSQL session store)
- Session TTL: 7 days

**Session Configuration**:
- HttpOnly cookies for security
- Secure flag enabled
- Session secret from environment variable

**Authorization**:
- Role-based access control (broker, admin roles)
- User role stored in `users.role` field
- Protected routes use `isAuthenticated` middleware

**User Flow**:
- OAuth flow via Replit identity provider
- User profile synced to local database on login
- Session persisted in PostgreSQL

### AI Integration

**Provider**: OpenAI (via Replit AI Integrations service)
- Model: GPT-4o-mini
- No API key required - uses Replit credits

**AI Features**:
1. **LLC Unmasking** (`unmaskLlc`) - Resolves LLC ownership to real people
2. **Seller Intent Scoring** (`calculateSellerIntentScore`) - Analyzes property signals to predict seller motivation
3. **Outreach Suggestions** (`generateOutreachSuggestion`) - Creates personalized outreach messaging
4. **Contact Confidence** (`calculateContactConfidence`) - Scores reliability of contact information

**Implementation Details**:
- Rate limiting via p-limit (2 concurrent requests)
- Retry logic via p-retry (3 attempts with exponential backoff)
- Handles rate limit errors specifically
- Async operations with proper error handling

## External Dependencies

### Core Framework Dependencies
- **React 18** - UI framework
- **Express** - Web server
- **TypeScript** - Type safety across full stack
- **Vite** - Build tool and dev server
- **Wouter** - Client-side routing
- **TanStack Query** - Server state management

### Database & ORM
- **PostgreSQL** - Primary database (via `DATABASE_URL` environment variable)
- **Drizzle ORM** - Type-safe database queries
- **node-postgres (pg)** - PostgreSQL client
- **connect-pg-simple** - PostgreSQL session store

### Authentication
- **Replit Auth** - Identity provider (OpenID Connect)
- **Passport.js** - Authentication middleware
- **openid-client** - OIDC client library
- **express-session** - Session management

### AI Services
- **OpenAI** - AI completions (via Replit AI Integrations)
- **Perplexity Sonar** - AI-powered web search for LLC ownership discovery (privacy-protected entity fallback)
- **p-limit** - Concurrency control for AI requests
- **p-retry** - Retry logic with exponential backoff

### Contact Enrichment Data Providers
- **ATTOM** - Property data and ownership information
- **OpenCorporates** - LLC/entity lookup and officer information
- **Data Axle** - People search (v2 API) and business contacts (Places v3)
- **A-Leads** - Skip tracing and professional contact data
- **Melissa** - Address verification and personator API
- **Google Address Validation** - Geocoding and address standardization
- **Pacific East/Idicia** - Enhanced contact enrichment suite:
  - DataPrime: Name/address verification with identity confirmation
  - Forward Phone Append (FPA): Phone number lookup with match scoring
  - Email Append (EMA): Email address discovery with validation status
  - Email Validation (EMV): Email deliverability verification

### UI Component Libraries
- **shadcn/ui** - Component library
- **Radix UI** - Headless UI primitives (20+ components)
- **Tailwind CSS** - Utility-first styling
- **Lucide React** - Icon library
- **class-variance-authority** - Component variants
- **cmdk** - Command palette

### Validation & Forms
- **Zod** - Schema validation
- **drizzle-zod** - Generate Zod schemas from Drizzle
- **React Hook Form** - Form management
- **@hookform/resolvers** - Form validation integration

### Utilities
- **date-fns** - Date manipulation
- **nanoid** - ID generation
- **memoizee** - Function memoization
- **clsx** / **tailwind-merge** - Conditional class names

### Development
- **tsx** - TypeScript execution
- **esbuild** - Production bundling
- **@replit/vite-plugin-*** - Replit-specific dev tools

### Environment Variables Required
- `DATABASE_URL` - PostgreSQL connection string
- `SESSION_SECRET` - Session encryption key
- `AI_INTEGRATIONS_OPENAI_BASE_URL` - Replit AI API base URL
- `AI_INTEGRATIONS_OPENAI_API_KEY` - Replit AI API key
- `ISSUER_URL` - OIDC issuer URL
- `REPL_ID` - Replit application ID
- `GOOGLE_AI_API_KEY` - Google Gemini API key for LLC research
- `USPS_USER_ID` - USPS Web Tools API user ID for address validation (free, register at usps.com/business/web-tools-apis)

### Cost Configuration (optional overrides)
Provider costs and priorities can be tuned via environment variables:
- `PROVIDER_COST_<NAME>` - Override cost per call (e.g., `PROVIDER_COST_GEMINI=0.003`)
- `PROVIDER_PRIORITY_<NAME>` - Override priority order (e.g., `PROVIDER_PRIORITY_OPENCORPORATES=3`)
- `PROVIDER_QUOTA_<NAME>` - Set monthly call quota (e.g., `PROVIDER_QUOTA_ATTOM=1000`)

Available provider names: `gemini`, `opencorporates`, `perplexity`, `attom`, `apify_skip_trace`, `dataaxle`, `melissa`, `pacificeast`, `aleads`, `google_address`, `usps`, `openai`

### Cost Metrics API
- `GET /api/admin/provider-metrics` - Returns provider usage, costs, and cache statistics
  - Tracks calls per provider, estimated costs, cache hit rates
  - Useful for monitoring API spending and optimizing usage