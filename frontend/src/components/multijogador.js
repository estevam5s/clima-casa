import { supabase } from '../supabase'
import { api } from '../api'

// Mapa 3D multijogador pelo Supabase Realtime (canal PRIVADO "mapa-escritorio"): só usuários ativos do sistema entram
// (política em realtime.messages + public.mapa_usuario_ativo()). Cada um manda a própria posição ~8 vezes por segundo
// (a pé ou dirigindo, qual carro, altitude) e recebe a dos outros. Presença diz quem está no mapa agora.
// Nada passa pelo backend nem fica gravado: é só o estado de agora.
//
// conectar({ aoMudar }) → { enviar(estado), outros: Map(id → estado com recebido_em), fechar(), eu }
export async function conectarMultijogador({ aoMudar } = {}) {
  const sb = await supabase()
  const { data } = await sb.auth.getSession()
  const sess = data.session
  if (!sess) return null
  let nome = sess.user.email?.split('@')[0] || 'Pessoa'
  try { const s = await api.get('/api/sessao'); nome = s.nome || s.usuario?.nome || nome } catch { /* fica o do e-mail */ }
  const eu = { id: sess.user.id, nome: String(nome).split(' ').slice(0, 2).join(' ') }
  try {   // teste local: duas abas com a mesma conta viram duas pessoas (só com o modo de depuração do 3D ligado)
    if (localStorage.getItem('clima-debug-3d') === '1' && localStorage.getItem('clima-mp-id')) { eu.id = localStorage.getItem('clima-mp-id'); eu.nome += ' (teste)' }
  } catch { /* sem armazenamento */ }
  await sb.realtime.setAuth(sess.access_token)
  const outros = new Map()
  const canal = sb.channel('mapa-escritorio', { config: { private: true, broadcast: { self: false }, presence: { key: eu.id } } })
  const avisar = () => aoMudar?.(outros)
  canal.on('broadcast', { event: 'pos' }, ({ payload }) => {
    if (!payload?.id || payload.id === eu.id) return
    outros.set(payload.id, { ...(outros.get(payload.id) || {}), ...payload, recebido_em: performance.now() })
  })
  canal.on('presence', { event: 'leave' }, ({ key }) => { if (outros.delete(key)) avisar() })
  canal.on('presence', { event: 'sync' }, avisar)
  let pronto = false
  canal.subscribe((st) => { if (st === 'SUBSCRIBED') { pronto = true; canal.track({ nome: eu.nome, desde: Date.now() }) } })
  let ult = 0
  return {
    eu, outros,
    // no máximo ~8 por segundo; quem não manda nada há 6 s some da tela de quem recebe
    enviar(estado) {
      const agora = performance.now()
      if (!pronto || agora - ult < 120) return
      ult = agora
      canal.send({ type: 'broadcast', event: 'pos', payload: { id: eu.id, nome: eu.nome, ...estado } })
    },
    pessoas: () => Object.values(canal.presenceState() || {}).flat().map((p) => p.nome),
    fechar() { try { canal.untrack(); sb.removeChannel(canal) } catch { /* já fechado */ } },
  }
}
