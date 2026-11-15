import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { Ban, Check, Lock, Plus, RefreshCw, ShieldCheck, Trash2, UserCheck } from 'lucide-react'
import { api, dataHora, haQuanto } from '../../api'
import { Aviso, Botao, Carregando, FaixaMetricas, Interruptor, Selo, useToast } from '../ui'

const TIPOS = { login_falhou: 'Login falhou', login_ok: 'Login', login_negado: 'Login sem permissão', auth_negado: 'Acesso negado',
  scanner: 'Ferramenta de ataque', rate_limit: 'Excesso de requisições', ip_bloqueado_auto: 'IP bloqueado sozinho', pais_bloqueado: 'País bloqueado' }
const PRAZOS = [['60', '1 hora'], ['1440', '24 horas'], ['10080', '7 dias'], ['43200', '30 dias'], ['', 'Permanente']]

export default function PainelSeguranca() {
  const [dados, setDados] = useState(null)
  const [ips, setIps] = useState([])
  const [eventos, setEventos] = useState([])
  const [filtro, setFiltro] = useState('')
  const [cfg, setCfg] = useState(null)
  const [novo, setNovo] = useState({ alvo: '', tipo: 'bloqueado', motivo: '', minutos: '1440' })
  const [erro, setErro] = useState('')
  const toast = useToast()

  const carregar = async () => {
    try {
      const [d, l, e] = await Promise.all([api.get('/api/seguranca'), api.get('/api/seguranca/ips'), api.get(`/api/seguranca/eventos?limite=200${filtro ? `&tipo=${filtro}` : ''}`)])
      setDados(d); setCfg(d.config); setIps(l); setEventos(e)
    } catch (err) { setErro(err.message) }
  }
  useEffect(() => { carregar() }, [filtro]) // eslint-disable-line react-hooks/exhaustive-deps

  if (erro) return <Aviso>{erro}</Aviso>
  if (!dados || !cfg) return <Carregando />
  const ev = dados.eventos_24h
  const ataques = (ev.scanner || 0) + (ev.rate_limit || 0) + (ev.pais_bloqueado || 0)

  const adicionar = async (e) => {
    e.preventDefault()
    try {
      await api.post('/api/seguranca/ips', { ...novo, minutos: novo.minutos ? +novo.minutos : null })
      toast(novo.tipo === 'bloqueado' ? `${novo.alvo} bloqueado.` : `${novo.alvo} liberado.`)
      setNovo({ ...novo, alvo: '', motivo: '' }); carregar()
    } catch (err) { toast(err.message, 'erro') }
  }
  const permitirMeuIp = async () => {
    try { await api.post('/api/seguranca/ips', { alvo: dados.meu_ip, tipo: 'permitido', motivo: 'IP do administrador', minutos: null }); toast('Seu IP nunca será bloqueado.'); carregar() }
    catch (err) { toast(err.message, 'erro') }
  }
  const salvarCfg = async () => {
    try { setCfg(await api.put('/api/seguranca', cfg)); toast('Regras de segurança salvas.') } catch (err) { toast(err.message, 'erro') }
  }
  const setC = (k) => (v) => setCfg((c) => ({ ...c, [k]: v?.target ? (v.target.type === 'number' ? +v.target.value : v.target.value) : v }))
  const meuPermitido = ips.some((i) => i.tipo === 'permitido' && i.alvo === dados.meu_ip)

  return (
    <div className="space-y-6">
      <FaixaMetricas itens={[
        { rotulo: 'Firewall', valor: cfg.ativo ? 'Ativo' : 'Desligado', tom: cfg.ativo ? 'bom' : 'ruim', dica: `${dados.camadas.length} camadas de proteção` },
        { rotulo: 'IPs bloqueados agora', valor: dados.bloqueados, dica: `${dados.permitidos} na lista de permitidos` },
        { rotulo: 'Ataques barrados (24 h)', valor: ataques, tom: ataques ? 'ruim' : 'bom', dica: `${ev.auth_negado || 0} acessos negados` },
        { rotulo: 'Logins (24 h)', valor: ev.login_ok || 0, dica: `${ev.login_falhou || 0} tentativa(s) com senha errada`, tom: ev.login_falhou ? 'ruim' : '' },
      ]} />

      <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
        <div className="space-y-6">
          <section className="cartao p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="titulo-secao">Seu acesso</h3>
                <p className="text-xs text-muted-foreground">IP {dados.meu_ip}{dados.meu_pais ? ` · ${dados.meu_pais}` : ''}</p>
              </div>
              {meuPermitido ? <Selo cor="verde"><Check className="h-3 w-3" /> Na lista de permitidos</Selo>
                : <Botao tamanho="sm" variante="secundario" icone={UserCheck} onClick={permitirMeuIp}>Nunca bloquear meu IP</Botao>}
            </div>
          </section>

          <section className="cartao p-5">
            <h3 className="titulo-secao">Bloquear ou liberar IP</h3>
            <p className="mb-4 text-xs text-muted-foreground">Aceita um IP (203.0.113.7) ou uma faixa CIDR (203.0.113.0/24). Liberados nunca são bloqueados.</p>
            <form onSubmit={adicionar} className="grid gap-3 md:grid-cols-[1.4fr_1fr_1fr_1.4fr_auto]">
              <input className="campo font-mono" placeholder="IP ou CIDR" value={novo.alvo} onChange={(e) => setNovo({ ...novo, alvo: e.target.value })} required aria-label="IP" />
              <select className="campo" value={novo.tipo} onChange={(e) => setNovo({ ...novo, tipo: e.target.value })} aria-label="Ação"><option value="bloqueado">Bloquear</option><option value="permitido">Liberar</option></select>
              <select className="campo" value={novo.minutos} onChange={(e) => setNovo({ ...novo, minutos: e.target.value })} aria-label="Prazo">{PRAZOS.map(([v, r]) => <option key={r} value={v}>{r}</option>)}</select>
              <input className="campo" placeholder="Motivo (opcional)" value={novo.motivo} onChange={(e) => setNovo({ ...novo, motivo: e.target.value })} aria-label="Motivo" />
              <Botao type="submit" icone={Plus}>Adicionar</Botao>
            </form>
            <div className="mt-5 divide-y divide-border">
              {ips.length === 0 && <p className="py-4 text-sm text-muted-foreground">Nenhum IP na lista.</p>}
              {ips.map((i) => (
                <motion.div key={i.id} layout className="flex flex-wrap items-center gap-3 py-2.5 text-sm">
                  {i.tipo === 'bloqueado' ? <Ban className="h-4 w-4 text-red-600" /> : <ShieldCheck className="h-4 w-4 text-emerald-600" />}
                  <span className="font-mono">{i.alvo}</span>
                  {i.automatico ? <Selo cor="ambar">automático · {i.ocorrencias}x</Selo> : <Selo>{i.tipo === 'bloqueado' ? 'manual' : 'permitido'}</Selo>}
                  <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">{i.motivo}</span>
                  <span className="text-xs text-muted-foreground">{i.expira_em ? `até ${dataHora(i.expira_em)}` : 'permanente'}</span>
                  <button className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-red-600" onClick={async () => { await api.del(`/api/seguranca/ips/${i.id}`); carregar() }} aria-label="Remover"><Trash2 className="h-4 w-4" /></button>
                </motion.div>
              ))}
            </div>
          </section>

          <section className="cartao">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-3.5">
              <h3 className="titulo-secao">Eventos de segurança</h3>
              <div className="flex gap-2">
                <select className="campo h-9 w-auto" value={filtro} onChange={(e) => setFiltro(e.target.value)} aria-label="Tipo"><option value="">Todos</option>{Object.entries(TIPOS).map(([k, r]) => <option key={k} value={k}>{r}</option>)}</select>
                <Botao tamanho="sm" variante="secundario" icone={RefreshCw} onClick={carregar}>Atualizar</Botao>
              </div>
            </div>
            <div className="max-h-[420px] overflow-auto">
              <table className="tabela w-full min-w-[640px]">
                <thead><tr><th>Quando</th><th>IP</th><th>Evento</th><th>Rota</th><th>Detalhe</th></tr></thead>
                <tbody>
                  {eventos.length === 0 && <tr><td colSpan={5} className="py-6 text-center text-muted-foreground">Nenhum evento.</td></tr>}
                  {eventos.map((e) => (
                    <tr key={e.id}>
                      <td className="whitespace-nowrap text-muted-foreground" title={dataHora(e.quando)}>{haQuanto(e.quando)}</td>
                      <td className="font-mono text-xs">{e.ip}{e.pais ? ` · ${e.pais}` : ''}</td>
                      <td>{['login_ok'].includes(e.tipo) ? <Selo cor="verde">{TIPOS[e.tipo]}</Selo> : <Selo cor={['scanner', 'ip_bloqueado_auto'].includes(e.tipo) ? 'vermelho' : 'ambar'}>{TIPOS[e.tipo] || e.tipo}</Selo>}</td>
                      <td className="max-w-[160px] truncate text-xs text-muted-foreground">{e.rota}</td>
                      <td className="max-w-[220px] truncate text-xs text-muted-foreground" title={e.agente}>{e.detalhe}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>

        <aside className="space-y-6">
          <section className="cartao p-5">
            <div className="flex items-center justify-between"><h3 className="titulo-secao">Regras do firewall</h3><Interruptor ligado={cfg.ativo} onChange={setC('ativo')} rotulo="Firewall ativo" /></div>
            <div className="mt-4 space-y-3 text-sm">
              {[['tentativas_login', 'Tentativas de login por e-mail', 3, 20], ['falhas_auth', 'Acessos negados antes de bloquear', 5, 500],
                ['janela_min', 'Janela de contagem (min)', 1, 1440], ['limite_por_minuto', 'Requisições por minuto por IP', 30, 5000]].map(([k, r, mn, mx]) => (
                <label key={k} className="flex items-center justify-between gap-3">{r}<input type="number" min={mn} max={mx} className="campo h-9 w-24" value={cfg[k]} onChange={setC(k)} /></label>
              ))}
              <label className="block">Bloqueio progressivo (min, separados por vírgula)
                <input className="campo mt-1.5 font-mono" value={cfg.bloqueio_progressivo.join(', ')}
                  onChange={(e) => setC('bloqueio_progressivo')(e.target.value.split(',').map((x) => parseInt(x, 10)).filter((x) => x > 0))} /></label>
              <label className="flex items-center justify-between">Detectar ferramentas de ataque<Interruptor ligado={cfg.detectar_scanners} onChange={setC('detectar_scanners')} rotulo="Detectar scanners" /></label>
              <label className="flex items-center justify-between gap-3">Rajada máxima por IP (requisições em 10 s)<input type="number" min={10} max={2000} className="campo h-9 w-24" value={cfg.rajada_10s} onChange={setC('rajada_10s')} /></label>
              <label className="flex items-center justify-between gap-3">Bloquear servidores de nuvem sem login<Interruptor ligado={cfg.bloquear_nuvem} onChange={setC('bloquear_nuvem')} rotulo="Bloquear nuvem" /></label>
              <div className="rounded-lg border border-red-500/25 bg-red-500/5 p-3">
                <label className="flex items-center justify-between font-medium">Escudo anti-DDoS automático<Interruptor ligado={cfg.escudo_auto} onChange={setC('escudo_auto')} rotulo="Escudo automático" /></label>
                <div className="mt-2 space-y-2">
                  {[['ddos_req_seg', 'Liga com (req/s)', 5, 5000], ['ddos_ips_min', 'ou com IPs diferentes por minuto', 10, 100000], ['escudo_minutos', 'Fica ligado por (min)', 5, 1440], ['limite_escudo_por_minuto', 'Limite por IP no escudo (req/min)', 10, 1000]].map(([k, r, mn, mx]) => (
                    <label key={k} className="flex items-center justify-between gap-3 text-xs">{r}<input type="number" min={mn} max={mx} className="campo h-8 w-24" value={cfg[k]} onChange={setC(k)} /></label>
                  ))}
                  <label className="flex items-center justify-between gap-3 text-xs">Ligar junto o modo de ataque da Vercel<Interruptor ligado={cfg.escudo_vercel} onChange={setC('escudo_vercel')} rotulo="Modo de ataque da Vercel" /></label>
                </div>
              </div>
              <label className="flex items-center justify-between">Registrar logins bem-sucedidos<Interruptor ligado={cfg.registrar_logins_ok} onChange={setC('registrar_logins_ok')} rotulo="Registrar logins" /></label>
              <label className="block">Países bloqueados (códigos, ex.: CN, RU)
                <input className="campo mt-1.5 font-mono uppercase" value={cfg.paises_bloqueados.join(', ')} onChange={(e) => setC('paises_bloqueados')(e.target.value.split(',').map((x) => x.trim()))} /></label>
              <label className="block">Só permitir estes países (vazio = todos)
                <input className="campo mt-1.5 font-mono uppercase" value={cfg.paises_permitidos.join(', ')} onChange={(e) => setC('paises_permitidos')(e.target.value.split(',').map((x) => x.trim()))} placeholder="BR" /></label>
              {cfg.paises_permitidos.filter(Boolean).length > 0 && dados.meu_pais && !cfg.paises_permitidos.includes(dados.meu_pais) && <Aviso>Seu país ({dados.meu_pais}) ficaria de fora.</Aviso>}
            </div>
            <Botao className="mt-4 w-full" onClick={salvarCfg}>Salvar regras</Botao>
          </section>

          <section className="cartao p-5">
            <h3 className="flex items-center gap-2 titulo-secao"><Lock className="h-4 w-4" /> Criptografia</h3>
            <p className="mt-2 text-sm">{dados.criptografia.algoritmo} · {dados.criptografia.ativa ? <span className="text-emerald-600 dark:text-emerald-400">ativa</span> : <span className="text-red-600">sem chave</span>}</p>
            <p className="text-xs text-muted-foreground">{dados.criptografia.segredos_cifrados} segredos cifrados no banco (Local Keys e credenciais de integração).</p>
            <ul className="mt-4 space-y-1.5 text-xs">
              {dados.camadas.map((c) => <li key={c} className="flex items-start gap-2"><Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" />{c}</li>)}
            </ul>
          </section>
        </aside>
      </div>
    </div>
  )
}
