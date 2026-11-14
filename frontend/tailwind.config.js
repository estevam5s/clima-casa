/** @type {import('tailwindcss').Config} */
const v = (nome) => `hsl(var(--${nome}) / <alpha-value>)`
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: { sans: ['-apple-system', 'BlinkMacSystemFont', '"Segoe UI"', 'Roboto', 'sans-serif'], mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'] },
      colors: {
        background: v('background'), foreground: v('foreground'),
        card: v('card'), muted: v('muted'), 'muted-foreground': v('muted-foreground'),
        border: v('border'), primary: v('primary'), 'primary-foreground': v('primary-foreground'),
        accent: v('accent'), sidebar: v('sidebar'),
        marca: { 50: '#effaf8', 100: '#d6f1ec', 500: '#14917f', 600: '#0f766a', 700: '#0d5f56' },
        frio: '#2563a8', quente: '#c2410c',
      },
      boxShadow: { suave: '0 1px 2px 0 rgb(0 0 0 / 0.04), 0 1px 3px 0 rgb(0 0 0 / 0.03)' },
    },
  },
  plugins: [],
}
