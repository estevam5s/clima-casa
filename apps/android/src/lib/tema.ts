import { useColorScheme } from 'react-native';

const claro = {
  fundo: '#f6f6f7', cartao: '#ffffff', texto: '#0e0e11', suave: '#6b6b74', borda: '#e3e3e6', muted: '#f0f0f2',
  primaria: '#0f766a', primariaTexto: '#ffffff', frio: '#2563a8', quente: '#c2410c', perigo: '#dc2626', ok: '#16a34a',
};
const escuro = {
  fundo: '#0e0e10', cartao: '#17171a', texto: '#f2f2f3', suave: '#9b9ba3', borda: '#2a2a2e', muted: '#202024',
  primaria: '#26a69a', primariaTexto: '#ffffff', frio: '#60a5fa', quente: '#fb923c', perigo: '#f87171', ok: '#4ade80',
};
export type Tema = typeof claro;
export function useTema(): Tema {
  return useColorScheme() === 'dark' ? escuro : claro;
}
