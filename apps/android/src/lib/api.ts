import { supabase } from './supabase';

export const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'https://app.zynio.com.br';

export class ErroApi extends Error {
  status: number;
  constructor(status: number, msg: string) { super(msg); this.status = status; }
}

async function chamar<T = any>(metodo: string, caminho: string, corpo?: unknown): Promise<T> {
  const { data } = await supabase.auth.getSession();
  const headers: Record<string, string> = {};
  if (data.session) headers.Authorization = `Bearer ${data.session.access_token}`;
  if (corpo !== undefined) headers['Content-Type'] = 'application/json';
  let r: Response;
  try {
    r = await fetch(API_URL + caminho, { method: metodo, headers, body: corpo === undefined ? undefined : JSON.stringify(corpo) });
  } catch {
    throw new ErroApi(0, 'Sem conexão com o Clima Casa. Confira a internet.');
  }
  const texto = await r.text();
  let json: any = null;
  try { json = texto ? JSON.parse(texto) : null; } catch { /* não-JSON */ }
  if (!r.ok) throw new ErroApi(r.status, (typeof json?.detail === 'string' && json.detail) || `Erro ${r.status}`);
  return json as T;
}

export const api = {
  get: <T = any>(c: string) => chamar<T>('GET', c),
  post: <T = any>(c: string, b: unknown = {}) => chamar<T>('POST', c, b),
  put: <T = any>(c: string, b: unknown) => chamar<T>('PUT', c, b),
  del: <T = any>(c: string) => chamar<T>('DELETE', c),
};

export const MODOS: Record<string, string> = { frio: 'Frio', quente: 'Quente', ventilar: 'Ventilar', seco: 'Desumidificar', auto: 'Automático' };
export const VENTILACAO: Record<string, string> = { auto: 'Automática', baixa: 'Baixa', media: 'Média', alta: 'Alta' };
export const DIAS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

export function haQuanto(ts?: number | null) {
  if (!ts) return 'nunca';
  const s = Math.round(Date.now() / 1000 - ts);
  if (s < 45) return 'agora';
  if (s < 3600) return `há ${Math.round(s / 60)} min`;
  if (s < 86400) return `há ${Math.round(s / 3600)} h`;
  return `há ${Math.round(s / 86400)} d`;
}

export function rotuloOrigem(o: string) {
  if (o.startsWith('agenda:')) return `Agenda · ${o.slice(7)}`;
  if (o.startsWith('cena:')) return `Cena · ${o.slice(5)}`;
  return ({ painel: 'Painel', alexa: 'Alexa', sistema: 'Sistema', agente: 'Agente do Mac', sinric: 'Sinric Pro' } as Record<string, string>)[o] ?? o;
}
