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

## Dossier Visual System

**Utility Classes (defined in index.css):**

| Class | Purpose | Tailwind Equivalent |
|-------|---------|---------------------|
| `.dossier-card` | Container for dossier sections | `bg-card rounded-md border border-card-border p-6` |
| `.dossier-card-compact` | Tighter container variant | `bg-card rounded-md border border-card-border p-4` |
| `.dossier-section-title` | Section headings | `text-base font-semibold text-foreground flex items-center gap-2` |
| `.dossier-subsection-title` | Subsection headings | `text-sm font-medium text-foreground` |
| `.dossier-label` | Field labels | `text-xs font-medium text-muted-foreground uppercase tracking-wide` |
| `.dossier-value` | Data values | `text-sm font-normal text-foreground` |
| `.dossier-value-emphasis` | Important values | `text-sm font-medium text-foreground` |
| `.dossier-mono` | Technical data (APNs, IDs) | `font-mono text-sm text-muted-foreground` |
| `.dossier-meta` | Timestamps, sources | `text-xs text-muted-foreground` |
| `.dossier-grid` | 2-column layout | `grid grid-cols-1 sm:grid-cols-2 gap-4` |
| `.dossier-stat` | Key-value display | `flex flex-col gap-1` |
| `.dossier-divider` | Section separator | `border-t border-border my-4` |

**Usage Pattern:**
```tsx
<div className="dossier-card">
  <h2 className="dossier-section-title">
    <Icon className="h-4 w-4" />
    Section Title
  </h2>
  <div className="dossier-grid mt-4">
    <div className="dossier-stat">
      <span className="dossier-label">Field Name</span>
      <span className="dossier-value">Value</span>
    </div>
  </div>
</div>
```

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

---

## UI Assessment (December 2024)

### Page-by-Page Analysis

#### 1. Landing Page (`landing.tsx`)
**Visual Consistency:** ✅ Good
- Clean hero section with proper text hierarchy
- Consistent Card usage for feature grid
- Proper use of `text-primary` for brand accents
- Stats section uses balanced grid layout

**Enrichment Actions:** N/A (marketing page)

**Data Flow:** N/A (marketing page)

**Issues/Opportunities:**
- "See How It Works" button has no action - consider linking to a demo or scroll anchor
- Could add testimonials or social proof section

---

#### 2. Search Page (`search.tsx`)
**Visual Consistency:** ✅ Good
- SearchBar prominently placed in Card
- Clear separation between "Saved Owners" (local) and "Property Records" (external)
- Uses Database/Globe icons to differentiate data sources
- Proper Badge usage for result counts

**Enrichment Actions:** ✅ Clear
- External search runs automatically with local search
- Import buttons on external results are clear with ArrowRight icon
- Loading states show descriptive messages about data providers

**Data Flow:** ⚠️ Needs Improvement
- After importing, user navigates to owner dossier - this is good
- Missing: No clear indication of what happens after import (enrichment status)
- LLC imports could show clearer connection to properties

**Issues/Opportunities:**
- Consider adding a "Quick View" preview before full import
- Show estimated enrichment time or cost before import
- Add filter for "already imported" vs "new" results

---

#### 3. Properties Page (`properties.tsx`)
**Visual Consistency:** ✅ Good
- Clean filter bar with search, type filter, and sort
- Uses PropertyCard component consistently
- Good empty state with helpful message

**Enrichment Actions:** ⚠️ Limited
- No enrichment actions visible from properties list
- Properties are view-only from this page

**Data Flow:** ⚠️ Partial
- PropertyCard shows owner link when available
- Missing: Visual indicator of which properties have enriched owner data
- No way to bulk enrich or navigate to owner from here

**Issues/Opportunities:**
- Add "View Owner" quick action on each property card
- Show owner name inline on property card
- Add bulk selection for multi-property operations

---

#### 4. Dossiers Page (`dossiers.tsx`)
**Visual Consistency:** ✅ Good
- Clean list view with hover-elevate on cards
- Consistent icon usage (FileText for dossiers)
- Good date formatting

**Enrichment Actions:** ⚠️ Limited
- Only "View" and "Download" actions available
- No re-export or regenerate option

**Data Flow:** ✅ Good
- Direct link to owner dossier from each export
- Shows owner name and export format clearly

**Issues/Opportunities:**
- Add "Re-generate" or "Refresh" option for stale dossiers
- Show dossier preview/summary without navigating away
- Add export status (complete, partial, failed)

---

#### 5. Owner Dossier (`owner-dossier.tsx`) - MAIN PAGE
**Visual Consistency:** ✅ Excellent
- Two-column layout matches design spec (2/3 main, 1/3 sidebar)
- Consistent Card/CardHeader/CardContent structure throughout
- Good use of icons to identify section types
- ScoreBadge and RiskBadge components provide visual consistency
- Collapsible sections for dense data

**Enrichment Actions:** ✅ Excellent
- "Run Full Enrichment" button prominent in header
- Clear loading states during enrichment
- Multiple data sources shown (LLC Unmasking, Contact Enrichment, Melissa, Skip Trace)
- Each enrichment section shows "Last updated" timestamp

**Data Flow:** ✅ Excellent - Best Example
- ClickableEntityName allows navigation from officer → their own dossier
- LLC Network card shows connections
- Properties owned section links back to properties
- Legal Events Timeline shows chronological context
- Franchise detection adds business context
- Ownership chain visualization shows multi-level structures

**Issues/Opportunities:**
- Very long page (1986 lines) - could benefit from lazy loading sections
- Consider tabbed interface for different data categories
- Add "Export This Section" for individual cards
- Ownership chain could be interactive (click to expand node)

---

#### 6. LLC Dossier (`llc-dossier.tsx`)
**Visual Consistency:** ✅ Good
- Header shows company name, status badge, jurisdiction
- Two-column grid for company details and officers
- Uses ClickableEntity for officer navigation

**Enrichment Actions:** ✅ Good
- "Run Full Enrichment" button prominent
- "Refresh" button for quick update
- Shows enriched vs non-enriched officers separately

**Data Flow:** ⚠️ Partial
- Officers can navigate to their own dossiers
- Missing: Link to associated properties
- Missing: Parent/child company relationships
- Missing: Link back to owners that own this LLC

**Issues/Opportunities:**
- Add "Properties owned by this LLC" section
- Add "Ultimate Beneficial Owners" section (like owner-dossier has)
- Show registered agent as clickable entity
- Add filing history timeline

---

#### 7. Unified Dossier (`unified-dossier.tsx`)
**Visual Consistency:** ✅ Good
- Clean three-column layout (2 main, 1 sidebar)
- Entity type icons differentiate individuals/entities/properties
- EnrichmentStatusBadge provides clear status indication
- Consistent Card structure

**Enrichment Actions:** ✅ Good
- MetaCard shows enrichment status and "Run Full Enrichment" button
- Shows providers used and last updated
- Status badge (idle/pending/running/complete/failed/stale)

**Data Flow:** ✅ Excellent
- EntityLink component provides consistent navigation to any entity
- OwnershipCard shows full ownership chain with depth levels
- NetworkCard shows relationships (individuals, entities, properties, legal events)
- Holdings show entity → properties relationships clearly

**Issues/Opportunities:**
- This seems to be an alternative/newer version of owner-dossier
- Consider consolidating with owner-dossier or clarifying when each is used
- Add export/PDF generation to match owner-dossier functionality

---

### Cross-Cutting Observations

#### Typography ✅
- Consistent use of text-muted-foreground for labels
- font-mono used for technical data (APNs, IDs)
- Proper heading hierarchy (text-3xl → text-base)

#### Spacing ✅
- Consistent gap-6 between major sections
- Cards use p-4 or pb-3 for headers, consistent content spacing
- No crowding issues

#### Colors ✅
- Primary color used sparingly for emphasis
- Badge variants used correctly (default/secondary/destructive/outline)
- No direct color classes that would break dark mode

#### Icons ✅
- Lucide icons used consistently
- Icons accompany text for scannability
- Size consistent (h-4 w-4 for inline, h-8 w-8 for empty states)

---

### Priority Improvements

1. **Data Flow Gap:** LLC Dossier needs links to associated properties and parent owners
2. **Enrichment Visibility:** Properties page should show enrichment status indicators
3. **Page Consolidation:** Clarify relationship between owner-dossier and unified-dossier
4. **Bulk Operations:** Add bulk enrichment/export on list pages
5. **Landing CTA:** "See How It Works" button needs functionality