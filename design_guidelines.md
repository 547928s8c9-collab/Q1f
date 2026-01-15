# ZEON Fintech Dashboard - Design Guidelines

## Design Approach
**System-Based Approach**: Inspired by Anthropic's design language and Revolut's dashboard structure. Focus on clarity, trust, and calm professionalism appropriate for financial applications.

## Core Design Principles
1. **Calm Confidence**: Premium, minimal aesthetic that builds trust through clarity
2. **Information Hierarchy**: Clear visual separation between critical data (balances, P&L) and secondary information
3. **Predictable Interactions**: Consistent patterns across all financial operations
4. **Data Integrity**: Tabular numerals and precise alignment for all monetary values

## Typography

**Font Family**: 
- Primary: `system-ui, -apple-system, sans-serif`
- Monetary values: Apply `font-variant-numeric: tabular-nums` for alignment

**Type Scale**:
- Display: 32px / 2rem (page titles, portfolio values)
- Heading 1: 24px / 1.5rem (section headers)
- Heading 2: 20px / 1.25rem (card titles, metrics)
- Body Large: 16px / 1rem (primary content)
- Body: 14px / 0.875rem (secondary content, labels)
- Small: 12px / 0.75rem (captions, timestamps)

**Weights**: Regular (400), Medium (500), Semibold (600) for emphasis

## Layout System

**Spacing Primitives** (Tailwind units):
- Micro: 1, 2 (borders, tight spacing)
- Core: 4, 6, 8 (component padding, gaps)
- Section: 12, 16, 24 (card padding, section spacing)

**Container Widths**:
- Dashboard content: `max-w-7xl` with `px-4 md:px-6 lg:px-8`
- Forms/modals: `max-w-lg`
- Charts: Full width within container

**Grid System**:
- Dashboard cards: `grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6`
- Metrics tiles: `grid grid-cols-2 lg:grid-cols-4 gap-4`
- Strategy list: `grid grid-cols-1 md:grid-cols-2 gap-4`

## Component Library

### Navigation
**Desktop Sidebar** (240px fixed):
- Logo at top (32px height)
- Navigation items: 44px height, 16px left padding, icon + label
- Active state: Background surface treatment + accent text
- Subtle divider between sections

**Mobile Bottom Nav** (64px height):
- 5 primary items (Home, Analytics, Invest, Wallet, Settings)
- Icons: 24px centered above 10px labels
- Active state: Accent color icon + text

### Buttons
**Sizes**:
- Primary: min-h-[44px] with px-6
- Secondary: min-h-[40px] with px-4
- Small: min-h-[36px] with px-3

**Icon Sizes**:
- Normal buttons: 18px (w-[18px] h-[18px])
- Small buttons: 16px (w-4 h-4)

**Variants**:
- Primary: Solid accent background, white text
- Secondary: Border with text color, transparent background
- Ghost: No border, text color only
- Danger: Red/warning color for destructive actions

### Cards
**Standard Card**:
- Background: surface color
- Border: 1px border color
- Padding: p-6
- Rounded: rounded-xl
- Shadow: Very subtle or none (maintain calm aesthetic)

**Metric Cards**:
- Label: Small text, muted color, uppercase tracking
- Value: Display size, tabular nums, prominent
- Change indicator: Small pill with +/- and percentage (green/red)

### Forms
**Input Fields**:
- Height: 44px min
- Padding: px-4
- Border: 1px, rounded-lg
- Focus: Ring treatment with accent color
- Labels: 14px, medium weight, mb-2

**Amount Inputs**:
- Right-aligned text with tabular-nums
- Currency prefix/suffix in muted color
- Large, clear typography (16px minimum)

### Charts (Recharts)
**Portfolio/Performance Charts**:
- Line charts with area gradient (subtle, accent color at 20% opacity)
- Stroke: 2px accent color
- Grid: Subtle horizontal lines only
- Tooltip: Card-style with rounded corners, clear typography
- Cursor: Crosshair with vertical line at accent color 50% opacity

**Period Toggles**: 
- Segmented control: 7D / 30D / 90D
- Active: Accent background, white text
- Inactive: Ghost style, muted text

**Sparklines** (Quote Cards):
- 24px height micro charts
- No axes, minimal decoration
- Single color line matching quote trend (positive/negative)

### Data Display
**Balance Display**:
- Amount: Display size, tabular-nums, semibold
- Currency: Small caps, muted, after amount
- Layout: Stack vertically on mobile, inline on desktop

**Transaction Rows**:
- Icon circle (40px) on left with operation type icon
- Title: Medium weight, 14px
- Subtitle/timestamp: Small, muted
- Amount: Right-aligned, tabular-nums, with +/- color coding

### Status Indicators
**Operation Status**:
- Completed: Green dot + text
- Pending: Yellow dot + text  
- Failed: Red dot + text
- Processing: Animated blue dot + text

**Chips/Badges**:
- Rounded-full, px-3, py-1
- Small text (12px)
- Background: Muted surface with colored text

## Responsive Behavior

**Breakpoints**:
- Mobile: < 768px (bottom nav, stacked cards)
- Tablet: 768px - 1024px (sidebar appears, 2-column grids)
- Desktop: > 1024px (full sidebar, 3-column grids)

**Mobile Optimizations**:
- Cards stack to single column
- Charts adjust height to 240px
- Sidebar converts to bottom nav
- Tables convert to card list view

## Accessibility
- Focus rings: 2px ring-offset-2 with accent color on all interactive elements
- Minimum touch target: 44px × 44px
- Color contrast: WCAG AA compliant
- Screen reader labels on all icons-only buttons
- Semantic HTML throughout

## Animation Principles
**Use Sparingly**:
- Page transitions: None (instant for data integrity feel)
- Hover states: Simple color transitions (150ms)
- Loading states: Subtle skeleton screens or spinners
- Chart animations: Brief entry animations (300ms ease-out)

**Never animate**: Balance changes, P&L values (instant updates for trust)

## Images
This is a fintech dashboard with **no hero images**. The application is purely functional with data visualization and UI components. Any imagery would be:
- Strategy/fund logos: 48px circular avatars
- Empty states: Simple illustrations at 200px max width
- Security icons: System icons only

## Critical Financial UX Patterns
1. **Confirmation Screens**: All money operations show summary before confirmation
2. **Receipt Pages**: Detailed operation timeline with copy buttons for IDs/hashes
3. **Error States**: Clear, actionable error messages in red with suggested actions
4. **Loading States**: Skeleton screens for balance/chart areas, spinners for operations
5. **Success Feedback**: Subtle green checkmark with confirmation message