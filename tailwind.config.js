/** @type {import('tailwindcss').Config} */
module.exports = {
  purge: ['./app/**/*.{js,ts,jsx,tsx}', './src/components/**/*.{js,ts,jsx,tsx}', './src/app/**/*.{js,ts,jsx,tsx}'],
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
