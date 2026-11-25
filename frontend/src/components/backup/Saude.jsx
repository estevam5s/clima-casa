import { useEffect, useState } from 'react'
import { CheckCircle2, HardDrive, HeartPulse, Lock, RefreshCw, ShieldAlert, XCircle } from 'lucide-react'
import { api } from '../../api'
import { Botao, Interruptor, Modal, useToast } from '../ui'
import { fmtData, fmtMB } from './Avancado'

// Saúde do backup (último, próximo, teste de restauração, cópia fora da nuvem, histórico de tamanho), cópia local no
// computador do agente (regra 3-2-1: 3 cópias, 2 lugares, 1 fora) e cifra com senha do arquivo baixado.
const horas = (h) => (h == null ? '-' : h < 1 ? 'menos de 1 h' : h < 48 ? `${Math.round(h)} h` : `${Math.round(h / 24)} dias`)

export function SaudeBackup({ saude, recarregar }) {
  const toast = useToast()
  const [testando, setTestando] = useState(false)
  if (!saude) return null
  const h = saude.horas_desde
  const tomUltimo = h == null ? 'ruim' : h <= 26 ? 'bom' : h <= 7 * 24 ? 'medio' : 'ruim'
  const cor = { bom: 'text-emerald-600 dark:text-emerald-400', medio: 'text-amber-600 dark:text-amber-400', ruim: 'text-red-600 dark:text-red-400' }
  const t = saude.teste, loc = saude.local_estado
  const max = Math.max(1, ...saude.historico.map((x) => x.tamanho || 0))
  const testar = async () => {
    if (!saude.ultimo) return
    setTestando(true)
    try { const r = await api.post(`/api/backup-sistema/testar/${encodeURIComponent(saude.ultimo.arquivo)}`); toast(r.ok ? `Teste ok: as ${r.tabelas} tabelas do backup seriam restauradas sem erro.` : `Teste falhou: ${r.erros.join('; ')}`, r.ok ? undefined : 'erro'); recarregar() }
    catch (e) { toast(e.message, 'erro') } finally { setTestando(false) }
  }
  return (
    <section className="cartao p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><h2 className="titulo-secao flex items-center gap-2"><HeartPulse className="h-4 w-4 text-primary" />Saúde do backup</h2>
          <p className="mt-1 text-sm text-muted-foreground">O que garante que dá para voltar atrás: backup recente, testado e com cópia fora da nuvem.</p></div>
        <Botao tamanho="sm" variante="secundario" icone={RefreshCw} carregando={testando} disabled={!saude.ultimo} onClick={testar}>Testar a restauração do último</Botao>
      </div>
      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-lg border border-border p-3"><p className="text-xs text-muted-foreground">Último backup</p><p className={`mt-1 text-lg font-semibold ${cor[tomUltimo]}`}>{h == null ? 'nenhum' : `há ${horas(h)}`}</p><p className="truncate text-xs text-muted-foreground">{saude.ultimo ? `${fmtMB(saude.ultimo.tamanho)} · ${saude.ultimo.tipo}` : 'gere o primeiro'}</p></div>
        <div className="rounded-lg border border-border p-3"><p className="text-xs text-muted-foreground">Próximo agendado</p><p className="mt-1 text-lg font-semibold">{saude.proximo ? fmtData(saude.proximo).slice(0, 17) : 'desligado'}</p><p className="text-xs text-muted-foreground">{saude.agenda?.ativo ? `${{ '6h': 'a cada 6 h', '12h': 'a cada 12 h', diario: 'todo dia', semanal: 'toda semana' }[saude.agenda.frequencia]} · ${saude.agenda.retencao === 'gfs' ? '7 diários, 4 semanais, 12 mensais' : `guarda ${saude.agenda.manter}`}` : 'ligue em Backup agendado'}</p></div>
        <div className="rounded-lg border border-border p-3"><p className="text-xs text-muted-foreground">Teste de restauração</p>
          <p className={`mt-1 flex items-center gap-1.5 text-lg font-semibold ${!t ? '' : t.ok ? cor.bom : cor.ruim}`}>{!t ? 'nunca testado' : t.ok ? <><CheckCircle2 className="h-5 w-5" />passou</> : <><XCircle className="h-5 w-5" />falhou</>}</p>
          <p className="truncate text-xs text-muted-foreground">{t ? `${fmtData(t.em)} · ${t.tabelas} tabela(s)` : 'simula sem gravar nada'}</p></div>
        <div className="rounded-lg border border-border p-3"><p className="text-xs text-muted-foreground">Cópia fora da nuvem</p>
          <p className={`mt-1 text-lg font-semibold ${saude.local?.ativo && loc?.arquivos?.length ? cor.bom : saude.local?.ativo ? cor.medio : 'text-muted-foreground'}`}>{saude.local?.ativo ? `${loc?.arquivos?.length || 0} no computador` : 'desligada'}</p>
          <p className="truncate text-xs text-muted-foreground">{saude.local?.ativo && loc ? `${loc.maquina} · ${loc.livre_gb} GB livres` : 'regra 3-2-1: ligue abaixo'}</p></div>
      </div>
      {saude.historico.length > 1 && (
        <div className="mt-4">
          <p className="text-xs text-muted-foreground">Tamanho dos backups ({saude.quantidade} guardados · {fmtMB(saude.total_bytes)} no total)</p>
          <div className="mt-2 flex h-16 items-end gap-[3px]">{saude.historico.map((x) => (
            <span key={x.arquivo} title={`${x.arquivo} · ${fmtMB(x.tamanho)} · ${fmtData(x.criado_em)}`} className={`min-w-[4px] flex-1 rounded-t ${x.tipo === 'agendado' ? 'bg-primary/80' : x.tipo === 'antes de restaurar' ? 'bg-amber-500/70' : 'bg-primary/40'}`} style={{ height: `${Math.max(6, ((x.tamanho || 0) / max) * 100)}%` }} />))}</div>
        </div>
      )}
      {t && !t.ok && <p className="mt-3 flex items-start gap-2 text-sm text-red-600 dark:text-red-400"><ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />{t.erros.join('; ')}</p>}
    </section>
  )
}

export function CopiaLocal({ saude, aoMudar }) {
  const toast = useToast()
  const [f, setF] = useState({ ativo: false, manter: 10 })
  useEffect(() => { if (saude?.local) setF(saude.local) }, [saude])
  const salvar = async (x) => { try { await api.put('/api/backup-sistema/local', x); toast(x.ativo ? 'Ligada: o computador do agente baixa os backups em até 5 min.' : 'Cópia local desligada.'); aoMudar() } catch (e) { toast(e.message, 'erro') } }
  const loc = saude?.local_estado
  return (
    <section className="cartao p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><h2 className="titulo-secao flex items-center gap-2"><HardDrive className="h-4 w-4 text-primary" />Cópia fora da nuvem (computador do agente)</h2>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">O computador do agente no comando guarda uma cópia dos backups no próprio disco (pasta data/backups). Se o Supabase ficar fora do ar ou a conta for perdida, o backup continua no escritório. Cada arquivo é baixado uma vez só.</p></div>
        <Interruptor ligado={!!f.ativo} onChange={(v) => { setF({ ...f, ativo: v }); salvar({ ...f, ativo: v }) }} rotulo="Cópia local" />
      </div>
      <div className="mt-3 flex flex-wrap items-end gap-3">
        <label className="text-sm"><span className="rotulo">Guardar os últimos</span><input type="number" min={1} max={60} className="campo w-28" value={f.manter} onChange={(e) => setF({ ...f, manter: Number(e.target.value) })} /></label>
        <Botao tamanho="sm" variante="secundario" onClick={() => salvar(f)}>Salvar</Botao>
      </div>
      {f.ativo && (loc ? (
        <div className="mt-4 text-sm">
          <p>{loc.maquina} · <span className="font-mono text-xs">{loc.pasta}</span> · {loc.livre_gb} GB livres · conferido {fmtData(loc.em)}</p>
          {loc.erros?.length > 0 && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{loc.erros.join('; ')}</p>}
          <ul className="mt-2 grid grid-cols-1 gap-1 sm:grid-cols-2">{(loc.arquivos || []).map((a) => <li key={a.nome} className="flex justify-between gap-2 rounded border border-border px-2 py-1 text-xs"><span className="truncate font-mono">{a.nome}</span><span className="text-muted-foreground">{fmtMB(a.tamanho)}</span></li>)}</ul>
        </div>
      ) : <p className="mt-3 text-sm text-muted-foreground">Aguardando o agente (até 5 min). Precisa de um agente atualizado ligado.</p>)}
    </section>
  )
}

// ---------- cifra com senha (no navegador: AES-256-GCM, chave por PBKDF2 com 310 mil voltas) ----------
const CAB = new TextEncoder().encode('CLIMABK1')
async function chave(senha, sal) {
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(senha), 'PBKDF2', false, ['deriveKey'])
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt: sal, iterations: 310000, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'])
}
export async function cifrar(buf, senha) {
  const sal = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12))
  const c = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await chave(senha, sal), buf))
  const out = new Uint8Array(CAB.length + 28 + c.length); out.set(CAB); out.set(sal, 8); out.set(iv, 24); out.set(c, 36)
  return out
}
export const ehCifrado = (u8) => u8.length > 36 && CAB.every((b, i) => u8[i] === b)
export async function decifrar(u8, senha) {
  try { return new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: u8.slice(24, 36) }, await chave(senha, u8.slice(8, 24)), u8.slice(36))) }
  catch { throw new Error('Senha errada (ou arquivo alterado).') }
}

export function BaixarCifrado({ arquivo, fechar }) {
  const toast = useToast()
  const [s1, setS1] = useState(''), [s2, setS2] = useState('')
  const [indo, setIndo] = useState(false)
  const ir = async () => {
    setIndo(true)
    try {
      const { url } = await api.get(`/api/backup-sistema/baixar/${encodeURIComponent(arquivo)}`)
      const buf = await (await fetch(url)).arrayBuffer()
      const out = await cifrar(buf, s1)
      const u = URL.createObjectURL(new Blob([out], { type: 'application/octet-stream' }))
      Object.assign(document.createElement('a'), { href: u, download: `${arquivo}.cifrado` }).click(); setTimeout(() => URL.revokeObjectURL(u), 3000)
      toast('Baixado cifrado. Guarde a senha: sem ela o arquivo não abre.'); fechar()
    } catch (e) { toast(e.message, 'erro') } finally { setIndo(false) }
  }
  const forte = s1.length >= 12
  return (
    <Modal aberto titulo="Baixar cifrado com senha" onFechar={fechar}>
      <div className="space-y-3 text-sm">
        <p className="text-muted-foreground">O arquivo é cifrado aqui no navegador (AES-256) antes de salvar. Para restaurar, envie o <b>.cifrado</b> em Restaurar e digite a mesma senha. Ninguém recupera a senha: nem o sistema.</p>
        <p className="font-mono text-xs">{arquivo}</p>
        <input type="password" autoComplete="new-password" className="campo" placeholder="Senha (12 caracteres ou mais)" value={s1} onChange={(e) => setS1(e.target.value)} aria-label="Senha" />
        <input type="password" autoComplete="new-password" className="campo" placeholder="Repita a senha" value={s2} onChange={(e) => setS2(e.target.value)} aria-label="Repita a senha" />
        {s1 && !forte && <p className="text-xs text-amber-600">Use pelo menos 12 caracteres.</p>}
        {s2 && s1 !== s2 && <p className="text-xs text-red-600">As senhas não batem.</p>}
        <div className="flex justify-end gap-2"><Botao variante="secundario" onClick={fechar}>Cancelar</Botao><Botao icone={Lock} carregando={indo} disabled={!forte || s1 !== s2} onClick={ir}>Cifrar e baixar</Botao></div>
      </div>
    </Modal>
  )
}

export function PedirSenha({ nome, aoConfirmar, fechar }) {
  const [s, setS] = useState('')
  return (
    <Modal aberto titulo="Backup cifrado" onFechar={fechar}>
      <form className="space-y-3 text-sm" onSubmit={(e) => { e.preventDefault(); aoConfirmar(s) }}>
        <p className="text-muted-foreground"><span className="font-mono text-xs">{nome}</span> está cifrado. Digite a senha usada ao baixar: ele é aberto aqui no navegador e só depois enviado.</p>
        <input autoFocus type="password" autoComplete="off" className="campo" value={s} onChange={(e) => setS(e.target.value)} aria-label="Senha do backup" />
        <div className="flex justify-end gap-2"><Botao type="button" variante="secundario" onClick={fechar}>Cancelar</Botao><Botao type="submit" icone={Lock} disabled={!s}>Abrir e enviar</Botao></div>
      </form>
    </Modal>
  )
}
