# Design Guidelines: CRE Prospecting Platform

## Design Approach

**Selected Approach:** Modern B2B SaaS with inspiration from Linear, Attio, and Notion

**Rationale:** This is a professional data tool competing with outdated systems like LexisNexis. The design must emphasize speed, clarity, and modern professionalism while handling dense information elegantly.

**Core Principles:**
- Data clarity over decoration
- Fast visual scanning for brokers
- Professional credibility
- Modern, clean aesthetic that says "we're better than LexisNexis"

---

## Typography

**Font Families:**
- **Primary:** Inter (headings, UI elements, data labels)
- **Secondary:** JetBrains Mono (APNs, IDs, technical data)

**Hierarchy:**
- **Page Titles:** text-3xl font-semibold (Owner name, "Search Properties")
- **Section Headers:** text-xl font-semibold
- **Subsection Headers:** text-base font-semibold
- **Body/Labels:** text-sm font-medium
- **Data Values:** text-sm font-normal
- **Metadata/Helper Text:** text-xs text-gray-500

---

## Layout System

**Spacing Primitives:** Use Tailwind units of **2, 4, 6, and 8** exclusively
- Component padding: p-4 or p-6
- Section spacing: gap-6 or gap-8
- Card spacing: p-6
- Tight elements: gap-2 or gap-4

**Grid System:**
- Main app layout: Fixed sidebar (w-64), full-height content area
- Search results: Full-width responsive table
- Owner dossier: Two-column layout on desktop (2/3 main content, 1/3 sidebar with quick actions)
- Stats/metrics: grid-cols-2 md:grid-cols-4

---

## Component Library

### Navigation
- **Top Bar:** Fixed header with logo, search shortcut, user menu (h-14, border-b)
- **Sidebar:** Fixed left navigation with icon + label menu items, role indicator badge

### Search Interface
- **Search Bar:** Large prominent input (h-12) with search icon, clear button
- **Filter Pills:** Horizontal scrollable chips for quick filters (address, owner, APN toggles)
- **Advanced Search:** Collapsible panel with structured form fields in 2-column grid

### Data Display
- **Results Table:** 
  - Sticky header row with sortable columns
  - Alternating row backgrounds for scanning
  - Row hover state with subtle elevation
  - Expandable rows for quick preview
  - Action buttons (right-aligned): View Dossier, Add to List

- **Dossier Cards:**
  - **Owner Header Card:** Name, type badge, confidence score pill, primary address
  - **Properties List:** Compact cards with address, APN, value, last sale
  - **Contact Info Cards:** Phone/email with confidence indicators (icon + percentage)
  - **LLC Connections:** Network-style visual with connecting lines
  - **Legal Events:** Timeline view with type badges and dates

### Forms
- **Input Fields:** h-10, rounded-lg, border with focus ring
- **Labels:** Above input, text-sm font-medium
- **Validation:** Inline error text below field
- **Search Inputs:** Icon prefix, clear suffix

### Overlays
- **Dossier PDF Preview Modal:** Full-screen overlay with preview + download/email actions
- **Bulk Actions:** Slide-over panel from right
- **Notifications:** Toast in top-right with action buttons

### Status Indicators
- **Confidence Scores:** Circular progress indicators or horizontal bars with percentage
- **Badges:** Rounded-full px-3 py-1 for entity types (LLC, Individual, Trust)
- **Risk Flags:** Alert badges with icon + text (Litigation, Tax Delinquent)

---

## Page-Specific Layouts

### Login Page
- Centered card (max-w-md) with logo, title, Replit Auth buttons
- Clean, minimal, professional

### Search Dashboard
- Prominent hero search bar (top 1/4 of viewport)
- Recent searches below
- Quick stats cards (Total Properties Searched, Dossiers Generated)

### Search Results
- Full-width table with sticky filters bar
- Bulk selection checkboxes
- Pagination footer

### Owner Dossier
- **Header Section:** Full-width banner with owner name, confidence score, action buttons (Export PDF, Add to CRM)
- **Main Content (2/3 width):**
  - Properties owned (expandable table)
  - LLC connections (visual graph)
  - Legal events timeline
- **Sidebar (1/3 width):**
  - Contact information cards
  - Quick actions (Call, Email, Export)
  - AI-suggested outreach snippet
  - Seller intent score with breakdown

---

## Images

No decorative images needed - this is a data-focused application. All visuals should be:
- Icons for entity types, risk indicators, contact methods
- Small profile placeholders for owner photos (optional)
- Visualization graphs for LLC connections and property timelines

---

## Interactions

**Minimal animations:**
- Smooth page transitions (200ms ease)
- Table row hover elevation
- Modal fade-in (150ms)
- Loading states: Skeleton screens for tables/cards
- No distracting animations - prioritize speed and responsiveness