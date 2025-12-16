# Design Guidelines: CRE Prospecting Platform

## Design Approach

**Selected Approach:** Premium AI Tech Company aesthetic inspired by Linear, Vercel, and Anthropic

**Rationale:** This is a professional data tool competing with outdated systems like LexisNexis. The design emphasizes a sophisticated, dark-first aesthetic that conveys cutting-edge AI technology while handling dense information elegantly.

**Core Principles:**
- Data clarity over decoration
- Fast visual scanning for brokers
- Professional credibility with AI-tech sophistication
- Premium dark mode by default with high-contrast readability
- Subtle gradient backgrounds for depth and modernity

## Theme & Color System

**Default Theme:** Dark mode (default preference)

**Color Palette:**
- **Background:** Very dark near-black (#0a0a0f / HSL: 240 33% 4%)
- **Card/Surface:** Slightly lighter dark (#18181b / HSL: 240 6% 10%)
- **Text Primary:** High contrast white (#fafafa / HSL: 0 0% 98%)
- **Text Secondary:** Muted gray (#a1a1aa / HSL: 240 4% 65%)
- **Primary Accent:** Electric blue (#2563eb / HSL: 217 91% 60%) - use sparingly
- **AI Accent (Purple):** #8b5cf6 (HSL: 258 90% 66%) - for AI-powered features
- **AI Secondary (Cyan):** #06b6d4 (HSL: 187 94% 43%) - for enrichment/scoring

**Gradient Backgrounds:**
- Landing/Dashboard: `linear-gradient(135deg, #0a0a0f 0%, #1a1a2e 100%)`
- Use `.bg-gradient-premium` utility class
- Subtle grid pattern overlay for depth (`.bg-grid-pattern`)

**AI Feature Styling:**
- Use `.ai-glow` for subtle glow effect on AI-related elements
- Purple/cyan reserved for AI enrichment, scoring, and suggestions
- Gradient text for hero headings: `from-primary via-ai to-ai-secondary`

**Light Mode:**
- Maintains same color tokens with appropriate light values
- AI accents remain vibrant but work on white backgrounds

---

## Typography

**Font Families:**
- **Primary:** Inter (imported via Google Fonts) - modern, highly legible
- **Monospace:** JetBrains Mono (APNs, IDs, technical data)

**Font Loading:**
```css
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
```

**Hierarchy Utility Classes:**
- `.heading-1` - Page titles: `text-4xl font-bold tracking-tight`
- `.heading-2` - Section headers: `text-2xl font-semibold tracking-tight`
- `.heading-3` - Subsection headers: `text-xl font-semibold`
- `.heading-4` - Card/component titles: `text-lg font-semibold`
- `.body-dense` - Dense body text: `text-sm font-normal leading-relaxed`
- `.label-uppercase` - Category labels: `text-xs font-medium uppercase tracking-wide`
- `.mono-data` - Technical data: `font-mono text-sm`

**Body Text Rendering:**
```css
body {
  font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  text-rendering: optimizeLegibility;
}
```

**Usage Guidelines:**
- Use bold (`font-bold`) for H1 page titles for maximum impact
- Use semibold (`font-semibold`) for section/subsection headers
- Use `tracking-tight` on larger headings for tighter letter-spacing
- Body text should be `text-sm` for information-dense interfaces
- Labels use `uppercase tracking-wide` sparingly for categorization

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

### Search Interface (Command Palette Style)
- **Search Bar:** Premium command palette inspired by Linear/Raycast
  - Large size: `h-16` (64px) with backdrop blur
  - Glow effect on focus: `.search-glow` utility class
  - Keyboard shortcut hint: `⌘K` (Mac) or `Ctrl+K` (Windows)
  - Smooth focus transition with animated border
  - Search icon changes color on focus (muted → primary)
- **Filter Pills:** Horizontal scrollable chips for quick filters (address, owner, APN toggles)
- **Advanced Search:** Collapsible panel with structured form fields in 2-column grid

**Search Glow CSS:**
```css
.search-glow {
  box-shadow: 0 0 0 1px hsl(var(--primary) / 0.3),
              0 8px 32px hsl(var(--primary) / 0.15),
              0 4px 16px hsl(var(--ai-accent) / 0.1);
}
```

### Glassmorphism Cards
Modern glass-card effect for premium feel. Two variants available:

**Interactive Cards (`.glass-card`):**
- Backdrop blur effect (12px)
- Semi-transparent background
- Subtle border with low opacity
- Hover state with border glow, lift effect, and shadow
- Use for feature cards, stat cards, clickable elements

**Static Cards (`.glass-card-static`):**
- Same glass effect without hover interactions
- Use for non-interactive containers

**CSS:**
```css
.glass-card {
  background: hsl(var(--card) / 0.8);
  backdrop-filter: blur(12px);
  border: 1px solid hsl(var(--border) / 0.3);
  border-radius: 16px;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.glass-card:hover {
  border-color: hsl(var(--primary) / 0.4);
  transform: translateY(-2px);
  box-shadow: 0 12px 48px hsl(0 0% 0% / 0.4);
}
```

### Refined Button System
Premium button styles with subtle animations:

**Primary Button (default variant):**
- Gradient background (primary blue range)
- Glow shadow effect
- Lift on hover (-1px translateY)
- Enhanced shadow on hover
- Use for main CTAs like "Run Full Enrichment", "Sign In"

**Ghost Button (ghost variant):**
- Transparent background
- No visible border by default
- Border appears on hover
- Subtle muted background on hover
- Use for secondary actions like "Export PDF", "Refresh Data"

**Outline Button (outline variant):**
- Transparent background with subtle border
- Border highlights to primary on hover
- Use for alternative actions

**Best Practices:**
- Always pair ghost/outline buttons with icons + text
- Use `size="lg"` for hero CTAs
- Primary buttons should be used sparingly (1-2 per view)

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

**Usage Patterns:**

Option 1: With shadcn Card (preferred for complex sections):
```tsx
<Card data-testid="card-example">
  <CardHeader>
    <CardTitle className="dossier-section-title">
      <Icon className="h-4 w-4" />
      Section Title
    </CardTitle>
  </CardHeader>
  <CardContent>
    <div className="dossier-grid">
      <div className="dossier-stat">
        <span className="dossier-label">Field Name</span>
        <span className="dossier-value">Value</span>
      </div>
    </div>
  </CardContent>
</Card>
```

Option 2: Standalone dossier-card (for simple sections without Card header):
```tsx
<div className="dossier-card">
  <div className="dossier-grid">
    <div className="dossier-stat">
      <span className="dossier-label">Field Name</span>
      <span className="dossier-value">Value</span>
    </div>
  </div>
</div>
```

**Note:** Do not combine `dossier-card` class with shadcn `<Card>` - they both provide padding/border styling. Use the typography utilities (`.dossier-label`, `.dossier-value`, `.dossier-mono`) with shadcn Card components.

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

## Enrichment Pipeline System

### Pipeline Overview

The enrichment pipeline is a 7-step sequential process that enriches owner/entity data from multiple providers. There is **one primary way to trigger enrichment**: the "Run Full Enrichment" button in the `EnrichmentPipelineBar` component.

### Enrichment Steps (in order)

| Step | ID | Label | Description | Providers |
|------|-----|-------|-------------|-----------|
| 1 | `address` | Address Validation | Standardize and validate addresses | USPS, Melissa, Google Address |
| 2 | `property` | Property Data | Lookup property details and valuations | ATTOM, HomeHarvest |
| 3 | `llc_chain` | LLC Chain Resolution | Trace ownership through LLC structures | OpenCorporates, Gemini, Perplexity |
| 4 | `principals` | Principal Discovery | Identify owners/officers from LLCs | OpenCorporates |
| 5 | `contacts` | Contact Enrichment | Find phone numbers and email addresses | Melissa, Data Axle, Pacific East, A-Leads |
| 6 | `franchise` | Franchise Detection | Determine corporate vs franchised locations | AI Analysis |
| 7 | `ai_summary` | AI Summary & Scoring | Generate outreach suggestions and scoring | OpenAI |

### Step Status Values

| Status | Visual | Description |
|--------|--------|-------------|
| `idle` | Gray circle | Not yet started |
| `running` | Spinning loader | Currently executing |
| `done` | Green checkmark | Completed successfully |
| `error` | Red alert icon | Failed (may retry) |
| `skipped` | Gray skip icon | Intentionally skipped |

### UI Components

**EnrichmentPipelineBar** (`client/src/components/enrichment-pipeline-bar.tsx`)
- Primary enrichment trigger with "Run Full Enrichment" button
- Displays step-by-step progress with animated chips
- Shows change summary (new contacts, principals, etc.) after completion
- Announces status changes via ARIA live region for accessibility

**TargetedEnrichmentDropdown** (`client/src/components/targeted-enrichment-dropdown.tsx`)
- Secondary enrichment control for re-running specific phases
- Available targets: `contacts`, `ownership`, `franchise`, `property`
- Useful for refreshing stale data without full re-enrichment

### Usage Pattern

```tsx
// Main dossier pages should include the pipeline bar at top
<EnrichmentPipelineBar
  entityId={ownerId}
  entityName={owner.name}
  entityType="entity" // or "individual" | "property"
  onEnrichmentComplete={() => refetch()}
/>

// Targeted enrichment for specific sections
<TargetedEnrichmentDropdown
  entityId={ownerId}
  entityType="entity"
  targets={["contacts"]}
  onEnrichmentComplete={() => refetch()}
/>
```

---

## Provider Status & Freshness Tracking

### SourcesStrip Component

Displays data provenance with status chips showing which providers contributed data.

**Status Icons:**
| Status | Icon | Color | Meaning |
|--------|------|-------|---------|
| `success` | CheckCircle | Emerald | Fresh data retrieved |
| `cached` | Database | Sky | Using cached data |
| `stale` | Clock | Amber | Data may be outdated |
| `fallback` | Clock | Orange | Used as fallback source |
| `error` | AlertCircle | Red | Provider failed |

**Freshness Labels:**
- `fresh` - Retrieved within last hour
- `2h`, `6h`, `12h` - Hours since last update
- `1d`, `2d`, `3d` - Days since last update
- `1w+` - More than a week old

```tsx
<SourcesStrip 
  sources={dossier.sources}
  onRetry={(target) => targetedEnrich(target)}
  isRetrying={isRetrying}
/>
```

---

## Visual System

### Color Palette

**Primary:** Blue (HSL 217 91% 35%) - Used for primary actions, active states
**Secondary:** Muted blue-gray - Used for secondary content, badges
**Destructive:** Red (HSL 0 84% 42%) - Used for errors, risk flags
**Muted:** Light gray - Used for labels, metadata

### Typography Hierarchy

| Element | Classes | Usage |
|---------|---------|-------|
| Page Title | `text-2xl font-semibold` | Owner/entity name headers |
| Section Title | `text-base font-semibold` + icon | Card headers |
| Subsection | `text-sm font-medium` | Within-card groupings |
| Labels | `text-xs text-muted-foreground uppercase tracking-wide` | Field names |
| Values | `text-sm text-foreground` | Data display |
| Technical | `font-mono text-sm text-muted-foreground` | APNs, IDs, numbers |
| Metadata | `text-xs text-muted-foreground` | Timestamps, sources |

### Card Pattern

All dossier sections use the shadcn Card component with consistent structure:

```tsx
<Card role="region" aria-labelledby="section-id">
  <CardHeader className="pb-3">
    <CardTitle id="section-id" className="text-base flex items-center gap-2">
      <Icon className="h-4 w-4" aria-hidden="true" />
      Section Title
      <Badge variant="secondary" className="text-xs">count</Badge>
    </CardTitle>
  </CardHeader>
  <CardContent className="space-y-4">
    {/* Content */}
  </CardContent>
</Card>
```

**Key Rules:**
- Icons are `h-4 w-4` in headers
- Badge counts are `variant="secondary"` with `text-xs`
- CardHeader uses `pb-3` for tighter spacing
- CardContent uses `space-y-4` for section spacing
- Add `role="region"` and `aria-labelledby` for accessibility

---

## Component Usage Rules

### Buttons

| Variant | When to Use |
|---------|------------|
| `default` (primary) | Primary actions: "Run Full Enrichment", "Export PDF" |
| `outline` | Secondary actions: "Refresh Data", navigation |
| `ghost` | Tertiary actions: icon buttons, menu items |
| `destructive` | Dangerous actions: delete, remove |

**Size Rules:**
- `default` - Standard buttons with text
- `sm` - Compact contexts, inline actions
- `icon` - Icon-only buttons (use `size="icon"`, never set custom h/w)

**Accessibility:**
- Always include `data-testid` for testing
- Add `aria-label` for icon-only buttons
- Disable during loading with spinner icon

### Toasts

Use the `useToast` hook for notifications:

```tsx
const { toast } = useToast();

// Success
toast({
  title: "Enrichment complete",
  description: `Found ${newContacts} new contacts`,
});

// Error
toast({
  title: "Enrichment failed",
  description: error.message,
  variant: "destructive",
});
```

**Toast Guidelines:**
- Keep titles under 5 words
- Descriptions should be actionable when possible
- Use `variant="destructive"` only for actual errors
- Auto-dismiss after 5 seconds (default)

### Badges

| Variant | Usage |
|---------|-------|
| `default` | Active/positive status (Active, Verified) |
| `secondary` | Counts, neutral info |
| `outline` | Provider chips, tags |
| `destructive` | Risk flags, errors |

**Provider Chips (SourcesStrip):**
- Use `outline` variant as base
- Add status icons inline
- Show freshness label when relevant
- Error chips get `border-destructive/50`

---

## Micro-Interactions

### Animation Guidelines

- Use framer-motion for transitions
- Duration: 200-300ms for UI, 400-500ms for content
- Easing: `ease-out` for enters, `ease-in` for exits

**Available Animation Components:**

```tsx
// Fade in on mount
<FadeIn>{content}</FadeIn>

// Staggered list items
<StaggerContainer>
  {items.map(item => <StaggerItem key={item.id}>{item}</StaggerItem>)}
</StaggerContainer>

// Highlight when data changes
<HighlightOnUpdate updateKey={dataVersion}>
  {content}
</HighlightOnUpdate>
```

### Loading States

- Use `Skeleton` component for placeholder content
- Match skeleton dimensions to actual content
- Group related skeletons (e.g., `ContactsSectionSkeleton`)

---

## Accessibility Requirements

### ARIA Patterns

- Cards use `role="region"` with `aria-labelledby` pointing to CardTitle id
- Decorative icons include `aria-hidden="true"`
- Interactive elements have descriptive `aria-label`
- Live regions announce enrichment progress

### Keyboard Navigation

- Skip-to-content link in header (visible on focus)
- Tab order follows visual order
- Focus indicators use `ring-2 ring-ring ring-offset-2`
- All interactive elements are focusable

### Screen Reader Support

- Enrichment status changes announced via `aria-live="polite"`
- Counts and badges provide context in element labels
- Error states have clear error messages

---

### Priority Improvements

1. **Data Flow Gap:** LLC Dossier needs links to associated properties and parent owners
2. **Enrichment Visibility:** Properties page should show enrichment status indicators
3. **Page Consolidation:** Clarify relationship between owner-dossier and unified-dossier
4. **Bulk Operations:** Add bulk enrichment/export on list pages
5. **Landing CTA:** "See How It Works" button needs functionality