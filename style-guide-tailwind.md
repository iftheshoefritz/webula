# Webula Design System (Tailwind CSS)

A dark, restrained theme for Star Trek CCG deck building tools. Evokes LCARS aesthetics without literal replication—modern, functional, and readable.

---

## Tailwind Configuration

Add this to your `tailwind.config.js`:

```js
/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{js,jsx,ts,tsx,html}'],
  theme: {
    extend: {
      colors: {
        // Backgrounds
        'bg-primary': '#0d0f0d',
        'bg-secondary': '#131713',
        
        // Text
        'text-primary': '#e8e6e3',
        'text-secondary': '#999999',
        'text-tertiary': '#888888',
        'text-muted': '#666666',
        'text-disabled': '#555555',
        
        // Primary Accent (Sage Green)
        'accent': {
          DEFAULT: '#7a9e7a',
          light: '#9cb89c',
          dark: '#4a6a4a',
          darker: '#3a5a3a',
        },
        
        // Category Colors
        'cat': {
          missions: '#7a9e7a',
          dilemmas: '#9e7a7a',
          personnel: '#7a7a9e',
          events: '#9e9a7a',
          equipment: '#7a9a9e',
          ships: '#9a7a9e',
        },
        
        // Stats
        'stat': {
          integrity: '#7a9e7a',
          cunning: '#9e9a7a',
          strength: '#9e7a7a',
        },
        
        // Icon badges
        'icon-badge': '#a9a9c8',
        
        // Skill tags
        'skill-tag': '#c8a8a8',
      },
      
      fontFamily: {
        display: ['Oswald', 'sans-serif'],
        body: ['IBM Plex Sans', 'system-ui', 'sans-serif'],
        mono: ['IBM Plex Mono', 'monospace'],
      },
      
      fontSize: {
        'xxs': ['9px', { lineHeight: '1' }],
        'xs': ['10px', { lineHeight: '1.2' }],
        'sm': ['11px', { lineHeight: '1.5' }],
        'base': ['12px', { lineHeight: '1.5' }],
        'md': ['13px', { lineHeight: '1.5' }],
        'lg': ['14px', { lineHeight: '1.4' }],
        'xl': ['15px', { lineHeight: '1.4' }],
        '2xl': ['22px', { lineHeight: '1.2' }],
        '3xl': ['28px', { lineHeight: '1.1' }],
      },
      
      letterSpacing: {
        'tight': '0.02em',
        'normal': '0.05em',
        'wide': '0.08em',
        'wider': '0.1em',
        'widest': '0.15em',
      },
      
      borderRadius: {
        'sm': '3px',
        'md': '4px',
        'lg': '6px',
        'xl': '8px',
      },
      
      backgroundImage: {
        'gradient-page': 'linear-gradient(180deg, #0d0f0d 0%, #131713 100%)',
        'gradient-button': 'linear-gradient(135deg, #4a6a4a 0%, #3a5a3a 100%)',
        'gradient-bar-green': 'linear-gradient(180deg, #7a9e7a 0%, #4a6a4a 100%)',
        'gradient-bar-amber': 'linear-gradient(180deg, #8a7a5a 0%, #5a4a3a 100%)',
      },
      
      transitionDuration: {
        'fast': '100ms',
        'default': '150ms',
        'slow': '200ms',
        'expand': '300ms',
      },
    },
  },
  plugins: [],
}
```

---

## Base Styles

Add to your global CSS file:

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

@import url('https://fonts.googleapis.com/css2?family=Oswald:wght@400;500&family=IBM+Plex+Sans:wght@400;500&family=IBM+Plex+Mono&display=swap');

@layer base {
  body {
    @apply bg-gradient-page font-body text-text-primary min-h-screen;
  }
}

@layer components {
  /* ==================== */
  /* SURFACE STYLES       */
  /* ==================== */
  
  .surface {
    @apply bg-white/[0.02] border border-white/[0.06] rounded-xl;
  }
  
  .surface-hover {
    @apply hover:bg-white/[0.03] transition-colors duration-default;
  }
  
  .surface-selected {
    @apply bg-accent/15 border-accent/40;
  }
  
  .surface-elevated {
    @apply bg-black/30;
  }
  
  /* ==================== */
  /* SECTION HEADER       */
  /* ==================== */
  
  .section-header {
    @apply w-full flex items-center px-4 py-3
           surface-elevated
           border-l-[3px] border-l-accent
           sticky top-0 z-10;
  }
  
  .section-header-title {
    @apply font-display text-xs font-medium uppercase tracking-wide text-text-primary;
  }
  
  .section-header-count {
    @apply text-sm font-mono text-accent ml-2;
  }
  
  .section-header-chevron {
    @apply ml-auto text-xs text-text-disabled transition-transform duration-slow;
  }
  
  .section-header-chevron-open {
    @apply rotate-180;
  }
  
  /* Category border colors */
  .section-header-missions    { @apply border-l-cat-missions; }
  .section-header-dilemmas    { @apply border-l-cat-dilemmas; }
  .section-header-personnel   { @apply border-l-cat-personnel; }
  .section-header-events      { @apply border-l-cat-events; }
  .section-header-equipment   { @apply border-l-cat-equipment; }
  .section-header-ships       { @apply border-l-cat-ships; }
  
  /* ==================== */
  /* CARD TILE            */
  /* ==================== */
  
  .card-tile {
    @apply surface surface-hover p-3.5 cursor-pointer relative;
  }
  
  .card-tile-selected {
    @apply surface-selected;
  }
  
  .card-tile-header {
    @apply flex items-center gap-2 mb-2;
  }
  
  .card-tile-name {
    @apply text-lg font-medium text-text-primary;
  }
  
  .card-tile-subtitle {
    @apply text-base text-text-tertiary italic mb-2.5;
  }
  
  .card-tile-affiliation {
    @apply text-xs text-cat-personnel uppercase tracking-normal font-medium mb-2.5;
  }
  
  .card-tile-skills {
    @apply flex flex-wrap gap-1.5 mb-3;
  }
  
  .card-tile-gametext {
    @apply text-sm text-text-secondary leading-normal
           p-2.5 mb-3
           bg-black/20 rounded-lg
           border-l-2 border-l-accent/30;
  }
  
  .card-tile-stats {
    @apply flex gap-3 pt-2.5 border-t border-white/[0.04];
  }
  
  .card-tile-stat {
    @apply text-center;
  }
  
  .card-tile-stat-label {
    @apply text-xxs text-text-muted uppercase tracking-normal mb-0.5;
  }
  
  .card-tile-stat-value {
    @apply text-lg font-mono font-medium;
  }
  
  .card-tile-stat-integrity { @apply text-stat-integrity; }
  .card-tile-stat-cunning   { @apply text-stat-cunning; }
  .card-tile-stat-strength  { @apply text-stat-strength; }
  
  /* ==================== */
  /* LIST ROW             */
  /* ==================== */
  
  .list-row {
    @apply flex items-center px-4 py-2.5
           border-b border-white/[0.03]
           surface-hover cursor-pointer;
  }
  
  .list-row-qty-controls {
    @apply flex flex-col items-center mr-3 select-none;
  }
  
  .list-row-qty-btn {
    @apply bg-transparent border-none text-text-disabled 
           text-xxs cursor-pointer px-1.5 py-0.5 leading-none
           hover:text-text-muted;
  }
  
  .list-row-qty-value {
    @apply text-md font-mono font-medium min-w-[20px] text-center;
  }
  
  .list-row-info {
    @apply flex-1 min-w-0;
  }
  
  .list-row-name {
    @apply text-md text-text-primary truncate;
  }
  
  .list-row-subtitle {
    @apply text-sm text-text-muted truncate mt-px;
  }
  
  .list-row-code {
    @apply text-xs font-mono text-text-disabled ml-2;
  }
  
  /* ==================== */
  /* BADGES               */
  /* ==================== */
  
  .badge-cost {
    @apply w-[26px] h-[26px] rounded-full
           bg-accent/15 border border-accent/30
           flex items-center justify-center
           text-md font-mono font-medium text-accent-light;
  }
  
  .badge-in-deck {
    @apply absolute top-2.5 right-2.5
           w-[22px] h-[22px] rounded-full
           bg-gradient-button
           flex items-center justify-center
           text-sm font-mono font-medium text-text-primary;
  }
  
  .badge-icon {
    @apply text-xxs px-1.5 py-[3px]
           bg-cat-personnel/20 text-icon-badge
           rounded-sm font-medium tracking-tight;
  }
  
  .badge-skill {
    @apply text-xs px-[7px] py-[3px]
           bg-cat-dilemmas/[0.12] text-skill-tag
           rounded-sm;
  }
  
  /* ==================== */
  /* FILTER CHIPS         */
  /* ==================== */
  
  .filter-chip {
    @apply inline-flex items-center gap-1.5
           text-sm font-mono
           px-2 py-[5px]
           bg-accent/15 border border-accent/30 text-accent-light
           rounded-md;
  }
  
  .filter-chip-remove {
    @apply bg-transparent border-none text-accent 
           cursor-pointer p-0 text-base leading-none
           hover:text-accent-light;
  }
  
  .filter-chip-add {
    @apply text-sm px-2 py-[5px]
           bg-transparent border border-dashed border-white/10 text-text-muted
           rounded-md cursor-pointer
           hover:border-white/20 hover:text-text-tertiary;
  }
  
  /* ==================== */
  /* INPUTS               */
  /* ==================== */
  
  .input {
    @apply w-full
           bg-white/[0.05] border border-white/10 rounded-lg
           px-3.5 py-2.5
           text-lg text-text-primary font-body
           placeholder:text-text-disabled
           focus:outline-none focus:border-accent/40;
  }
  
  .input-search {
    @apply input font-mono pr-10;
  }
  
  .input-search-icon {
    @apply absolute right-3.5 top-1/2 -translate-y-1/2
           text-text-disabled text-base;
  }
  
  /* ==================== */
  /* BUTTONS              */
  /* ==================== */
  
  .btn {
    @apply inline-flex items-center justify-center gap-1.5
           px-4 py-2 rounded-lg
           text-base font-medium
           cursor-pointer
           transition-all duration-default;
  }
  
  .btn-primary {
    @apply btn
           bg-gradient-button border-none text-text-primary
           hover:brightness-110;
  }
  
  .btn-secondary {
    @apply btn
           bg-transparent border border-white/10 text-text-tertiary
           hover:border-white/20 hover:text-text-secondary;
  }
  
  .btn-ghost {
    @apply btn
           bg-transparent border-none text-text-muted
           hover:text-text-tertiary;
  }
  
  .btn-icon {
    @apply w-9 h-9
           bg-white/[0.05] border border-white/[0.08] rounded-lg
           flex items-center justify-center
           text-lg text-text-disabled
           cursor-pointer
           transition-all duration-default
           hover:bg-white/[0.08] hover:text-text-muted;
  }
  
  .btn-icon-active {
    @apply bg-accent/20 text-accent-light border-accent/30;
  }
  
  .btn-icon-sm {
    @apply w-7 h-7 text-base rounded-md;
  }
  
  /* ==================== */
  /* BOTTOM BAR           */
  /* ==================== */
  
  .bottom-bar {
    @apply px-4 py-3
           border-t border-white/[0.06]
           surface-elevated
           flex justify-between items-center
           flex-shrink-0;
  }
  
  .bottom-bar-text {
    @apply text-sm text-text-muted;
  }
  
  .bottom-bar-actions {
    @apply flex gap-2;
  }
  
  /* ==================== */
  /* SYNTAX HELP PANEL    */
  /* ==================== */
  
  .syntax-panel {
    @apply mt-3 p-3
           surface-elevated rounded-xl
           border border-white/[0.04];
  }
  
  .syntax-panel-title {
    @apply text-xs text-text-muted uppercase tracking-wider mb-2.5;
  }
  
  .syntax-panel-list {
    @apply flex flex-col gap-1.5 text-sm font-mono;
  }
  
  .syntax-panel-row {
    @apply flex justify-between items-center;
  }
  
  .syntax-panel-code {
    @apply text-accent-light bg-accent/10 px-1.5 py-0.5 rounded-sm;
  }
  
  .syntax-panel-desc {
    @apply text-text-muted text-xs;
  }
  
  /* ==================== */
  /* LAYOUT               */
  /* ==================== */
  
  .page-container {
    @apply min-h-screen bg-gradient-page font-body text-text-primary
           max-w-[480px] mx-auto
           flex flex-col overflow-hidden;
  }
  
  .page-header {
    @apply px-4 py-4 border-b border-white/[0.06] flex-shrink-0;
  }
  
  .page-scroll {
    @apply flex-1 overflow-y-auto overflow-x-hidden;
  }
  
  .page-scroll-padded {
    @apply page-scroll px-4 py-4;
  }
  
  /* ==================== */
  /* UTILITY CLASSES      */
  /* ==================== */
  
  .border-subtle  { @apply border-white/[0.04]; }
  .border-default { @apply border-white/[0.06]; }
  .border-emphasis { @apply border-white/[0.08]; }
  
  .divider {
    @apply border-t border-white/[0.04] my-3;
  }
  
  .truncate-fade {
    @apply truncate;
    mask-image: linear-gradient(to right, black 90%, transparent);
  }
}
```

---

## Component Examples

### Section Header

```html
<button class="section-header section-header-missions">
  <span class="section-header-title">Missions</span>
  <span class="section-header-count">5</span>
  <span class="section-header-chevron section-header-chevron-open">▾</span>
</button>
```

### List Row

```html
<div class="list-row">
  <div class="list-row-qty-controls">
    <button class="list-row-qty-btn">▲</button>
    <span class="list-row-qty-value text-cat-missions">1</span>
    <button class="list-row-qty-btn">▼</button>
  </div>
  
  <div class="list-row-info">
    <div class="list-row-name">Vidiia</div>
    <div class="list-row-subtitle">Locus of Infection</div>
  </div>
  
  <span class="list-row-code">63v32</span>
</div>
```

### Filter Chips

```html
<div class="flex flex-wrap gap-1.5">
  <span class="filter-chip">
    name:kira
    <button class="filter-chip-remove">×</button>
  </span>
  <span class="filter-chip">
    icons:cmd
    <button class="filter-chip-remove">×</button>
  </span>
  <button class="filter-chip-add">+ Add filter</button>
</div>
```

### Search Input

```html
<div class="relative">
  <input 
    type="text" 
    class="input-search" 
    placeholder="Search 3,247 cards..."
    value="name:kira icons:cmd"
  />
  <span class="input-search-icon">⌕</span>
</div>
```

### Buttons

```html
<button class="btn-primary">
  <span>+</span> Add to Deck
</button>

<button class="btn-secondary">View Card</button>

<button class="btn-ghost">Close List</button>

<button class="btn-icon">⌕</button>

<button class="btn-icon btn-icon-active">⌕</button>

<button class="btn-icon btn-icon-sm">▦</button>
```

### Bottom Action Bar

```html
<div class="bottom-bar">
  <span class="bottom-bar-text">
    Selected: <span class="text-text-primary">Kira Nerys</span>
  </span>
  <div class="bottom-bar-actions">
    <button class="btn-secondary">View Card</button>
    <button class="btn-primary">
      <span>+</span> Add to Deck
    </button>
  </div>
</div>
```

### Syntax Help Panel

```html
<div class="syntax-panel">
  <div class="syntax-panel-title">Search Syntax</div>
  <div class="syntax-panel-list">
    <div class="syntax-panel-row">
      <code class="syntax-panel-code">name:Odo</code>
      <span class="syntax-panel-desc">Card name contains</span>
    </div>
    <div class="syntax-panel-row">
      <code class="syntax-panel-code">strength:8-10</code>
      <span class="syntax-panel-desc">Stat range</span>
    </div>
    <div class="syntax-panel-row">
      <code class="syntax-panel-code">-skills:acquisition</code>
      <span class="syntax-panel-desc">Exclude skill</span>
    </div>
  </div>
</div>
```

### Full Page Layout

```html
<div class="page-container">
  <div class="page-header">
    <!-- Header content -->
  </div>
  
  <div class="page-scroll">
    <!-- Scrollable content -->
  </div>
  
  <div class="bottom-bar">
    <!-- Actions -->
  </div>
</div>
```

---

## Quick Reference: Arbitrary Values

For one-off cases where you need the exact token values inline:

```html
<!-- Backgrounds -->
<div class="bg-[#0d0f0d]">...</div>
<div class="bg-white/[0.02]">...</div>
<div class="bg-[rgba(122,158,122,0.15)]">...</div>

<!-- Borders -->
<div class="border border-white/[0.06]">...</div>
<div class="border-l-[3px] border-l-[#7a9e7a]">...</div>

<!-- Text colors -->
<span class="text-[#e8e6e3]">...</span>
<span class="text-[#9cb89c]">...</span>

<!-- Gradients (use bg-gradient-to-* or arbitrary) -->
<div class="bg-[linear-gradient(135deg,#4a6a4a_0%,#3a5a3a_100%)]">...</div>
```

---

## Google Fonts

Add to your HTML `<head>`:

```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Oswald:wght@400;500&family=IBM+Plex+Sans:wght@400;500&family=IBM+Plex+Mono&display=swap" rel="stylesheet">
```

---

## Accessibility Checklist

- ✅ Text contrast meets WCAG AA on dark backgrounds
- ✅ Interactive elements have visible focus states (add `focus:ring-2 focus:ring-accent/50`)
- ✅ Touch targets ≥36px for buttons
- ✅ Color is not the only indicator (icons + text accompany colors)
- ✅ Reduced motion: wrap animations in `motion-safe:`
