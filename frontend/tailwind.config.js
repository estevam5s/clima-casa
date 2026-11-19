/** @type {import('tailwindcss').Config} */
const v = (nome) => `hsl(var(--${nome}) / <alpha-value>)`
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: { sans: ['-apple-system', 'BlinkMacSystemFont', '"Segoe UI"', 'Roboto', 'sans-serif'], mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'] },
      colors: {
        // marca: paleta do Spotify, usada só na tela de Música (de propósito, para ficar com a cara do Spotify)
        sp: {
          preto: '#000000', base: '#121212', cartao: '#181818', topo: '#1b1b1b', aviso: '#1f1f1f', campo: '#242424', 'campo-hover': '#2a2a2a',
          realce: '#282828', verde: '#1ed760', 'verde-hover': '#3be477', texto1: '#d4d4d4', texto2: '#a7a7a7', texto3: '#b3b3b3',
          icone: '#7f7f7f', trilho: '#4d4d4d', curtidas: '#4b2ef0',
        },
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
