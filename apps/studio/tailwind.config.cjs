/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        mono: ['JetBrains Mono', 'ui-monospace', 'monospace'],
      },
      colors: {
        accent: {
          DEFAULT: '#B75FFF', // 0G Purple 1 — lighter brand accent
          muted: '#581C87',   // Tailwind purple-900 — anvil structural
          light: '#CB8AFF',   // 0G Purple 2 — hover state
        },
      },
    },
  },
  plugins: [],
};
