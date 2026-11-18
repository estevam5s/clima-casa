import { useEffect, useMemo, useRef, useState } from 'react'
import { BadgeCheck, Copy, Download, FileText, Image as ImageIcon, Mail, Printer, QrCode } from 'lucide-react'
import { api } from '../../api'
import { Botao, Selo, useToast } from '../ui'

// Ferramentas da marca que geram material de verdade a partir do white label salvo:
// ícones do app (PWA, iPhone, aba), assinatura de e-mail, crachás da equipe, papel timbrado e placas das salas com QR Code.
const esc = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])
const iniciais = (n) => (n || 'CE').split(/\s+/).filter(Boolean).slice(0, 2).map((x) => x[0]).join('').toUpperCase()

function carregarImg(src) { return new Promise((ok) => { if (!src) return ok(null); const i = new Image(); i.onload = () => ok(i); i.onerror = () => ok(null); i.src = src }) }

async function desenharIcone(f, tam, { mascaravel = false, fundo } = {}) {
  const c = document.createElement('canvas'); c.width = c.height = tam
  const g = c.getContext('2d')
  g.fillStyle = fundo || f.cor_primaria
  if (mascaravel) g.fillRect(0, 0, tam, tam); else { g.beginPath(); g.roundRect(0, 0, tam, tam, tam * 0.22); g.fill() }
  const img = await carregarImg(f.logo)
  const area = tam * (mascaravel ? 0.6 : 0.74)   // ícone mascarável: o desenho fica na zona segura (círculo de 80%)
  if (img) {
    const k = Math.min(area / img.width, area / img.height), w = img.width * k, h = img.height * k
    g.drawImage(img, (tam - w) / 2, (tam - h) / 2, w, h)
  } else {
    g.fillStyle = '#fff'; g.font = `700 ${Math.round(area * 0.55)}px system-ui, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'
    g.fillText(iniciais(f.nome_curto || f.nome), tam / 2, tam / 2 + tam * 0.02)
  }
  return c
}

function baixarCanvas(c, nome) { c.toBlob((b) => { const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = nome; a.click(); URL.revokeObjectURL(a.href) }, 'image/png') }

function imprimir(titulo, corpo, css = '') {
  const html = `<!doctype html><html lang="pt-BR"><meta charset="utf-8"><title>${esc(titulo)}</title><style>
    *{box-sizing:border-box}body{margin:0;font-family:system-ui,-apple-system,Segoe UI,sans-serif;color:#18181b}@page{margin:12mm}
    .barra{position:sticky;top:0;background:#f4f4f5;border-bottom:1px solid #e4e4e7;padding:10px 16px;font-size:13px}@media print{.barra{display:none}}${css}</style>
    <div class="barra">Use Ctrl+P (ou Cmd+P) para imprimir ou salvar em PDF.</div>${corpo}</html>`
  const w = window.open(URL.createObjectURL(new Blob([html], { type: 'text/html' })), '_blank')
  if (!w) return false
  return true
}

function Icones({ f }) {
  const [prev, setPrev] = useState([])
  const itens = useMemo(() => [['icone-512.png', 512, {}, 'App instalado (PWA) 512'], ['icone-192.png', 192, {}, 'App instalado (PWA) 192'],
    ['icone-mascaravel-512.png', 512, { mascaravel: true }, 'Android (mascarável)'], ['apple-touch-icon.png', 180, { fundo: f.cor_primaria }, 'iPhone e iPad (180)'], ['favicon-32.png', 32, {}, 'Aba do navegador (32)']], [f.cor_primaria])
  useEffect(() => {
    let vivo = true
    Promise.all(itens.map(([, t, o]) => desenharIcone(f, t, o))).then((cs) => vivo && setPrev(cs.map((c) => c.toDataURL('image/png'))))
    return () => { vivo = false }
  }, [f.logo, f.cor_primaria, f.nome_curto, itens])   // eslint-disable-line react-hooks/exhaustive-deps
  const baixarTodos = async () => { for (const [n, t, o] of itens) { baixarCanvas(await desenharIcone(f, t, o), n); await new Promise((r) => setTimeout(r, 250)) } }
  return (
    <section className="cartao p-5">
      <h3 className="flex items-center gap-2 text-sm font-semibold"><ImageIcon className="h-4 w-4 text-muted-foreground" />Ícones do app</h3>
      <p className="mt-1 text-xs text-muted-foreground">Gerados do logo e da cor principal salvos. Para o ícone instalado mudar, troque os arquivos em <code>frontend/public</code> e publique (o navegador guarda o ícone antigo por um tempo).</p>
      <div className="mt-3 flex flex-wrap items-end gap-4">{itens.map(([n, t, o, r], i) => (
        <figure key={n} className="text-center">
          {prev[i] ? <img src={prev[i]} alt={r} className={`mx-auto border border-border ${o.mascaravel ? 'rounded-full' : 'rounded-lg'}`} style={{ width: Math.min(96, Math.max(32, t / 4)), height: Math.min(96, Math.max(32, t / 4)) }} /> : <span className="block h-12 w-12 rounded-lg bg-muted" />}
          <figcaption className="mt-1 max-w-[7rem] text-[11px] text-muted-foreground">{r}</figcaption>
          <button className="text-[11px] font-medium text-primary underline" onClick={async () => baixarCanvas(await desenharIcone(f, t, o), n)}>Baixar</button>
        </figure>))}
      </div>
      <Botao className="mt-3" tamanho="sm" variante="secundario" icone={Download} onClick={baixarTodos}>Baixar todos</Botao>
    </section>
  )
}

function Assinatura({ f, sessao }) {
  const toast = useToast()
  const [d, setD] = useState({ nome: sessao?.nome || '', cargo: '', telefone: f.suporte_telefone || '', email: '' })
  const logo = `${window.location.origin}/icone-192.png`   // e-mail não mostra imagem embutida: usa o ícone publicado
  const html = `<table cellpadding="0" cellspacing="0" style="font-family:Arial,Helvetica,sans-serif;color:#27272a;font-size:13px;line-height:1.45">
<tr><td style="padding-right:14px;border-right:3px solid ${f.cor_primaria}"><img src="${logo}" width="56" height="56" alt="${esc(f.nome)}" style="display:block;border-radius:10px"></td>
<td style="padding-left:14px"><b style="font-size:15px;color:#18181b">${esc(d.nome || 'Seu nome')}</b><br><span style="color:#52525b">${esc(d.cargo || 'Cargo')}</span><br>
<span style="color:${f.cor_primaria};font-weight:bold">${esc(f.nome)}</span>${d.telefone ? `<br>${esc(d.telefone)}` : ''}${d.email ? `<br><a href="mailto:${esc(d.email)}" style="color:#27272a;text-decoration:none">${esc(d.email)}</a>` : ''}${f.site ? `<br><a href="${esc(f.site)}" style="color:${f.cor_primaria}">${esc(f.site.replace(/^https:\/\//, ''))}</a>` : ''}</td></tr></table>`
  const copiar = async () => {
    try { await navigator.clipboard.write([new ClipboardItem({ 'text/html': new Blob([html], { type: 'text/html' }), 'text/plain': new Blob([`${d.nome}\n${d.cargo}\n${f.nome}`], { type: 'text/plain' }) })]); toast('Assinatura copiada: cole nas configurações do seu e-mail.') }
    catch { toast('O navegador não deixou copiar como formatado: use Baixar.', 'erro') }
  }
  return (
    <section className="cartao p-5">
      <h3 className="flex items-center gap-2 text-sm font-semibold"><Mail className="h-4 w-4 text-muted-foreground" />Assinatura de e-mail</h3>
      <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-4">
        {[['nome', 'Nome'], ['cargo', 'Cargo'], ['telefone', 'Telefone'], ['email', 'E-mail']].map(([k, r]) => <input key={k} className="campo h-9" placeholder={r} aria-label={r} maxLength={80} value={d[k]} onChange={(e) => setD({ ...d, [k]: e.target.value })} />)}
      </div>
      <div className="mt-3 overflow-x-auto rounded-md border border-border bg-white p-4" dangerouslySetInnerHTML={{ __html: html }} /> {/* marca: prévia da assinatura sempre em fundo branco, como no e-mail */}
      <div className="mt-3 flex flex-wrap gap-2">
        <Botao tamanho="sm" icone={Copy} onClick={copiar}>Copiar assinatura</Botao>
        <Botao tamanho="sm" variante="secundario" icone={Download} onClick={() => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([html], { type: 'text/html' })); a.download = 'assinatura.html'; a.click(); URL.revokeObjectURL(a.href) }}>Baixar .html</Botao>
      </div>
    </section>
  )
}

function Impressos({ f }) {
  const toast = useToast()
  const [mapa, setMapa] = useState(null)
  const [projetos, setProjetos] = useState([])
  const [aparelhos, setAparelhos] = useState([])
  const [gerando, setGerando] = useState('')
  useEffect(() => {
    api.get('/api/mapa').then((m) => setMapa(m.mapa || m)).catch(() => {})
    api.get('/api/projetos').then((r) => setProjetos(r.projetos || r || [])).catch(() => {})
    api.get('/api/aparelhos').then((r) => setAparelhos(r.aparelhos || r || [])).catch(() => {})
  }, [])
  const pessoas = mapa?.pessoas || []
  const cabecalho = `<div style="display:flex;align-items:center;gap:12px">${f.logo ? `<img src="${f.logo}" alt="${esc(f.nome)}" style="height:44px">` : `<div style="width:44px;height:44px;border-radius:10px;background:${f.cor_primaria};color:#fff;display:grid;place-items:center;font-weight:700">${esc(iniciais(f.nome_curto))}</div>`}<div><b style="font-size:18px">${esc(f.nome)}</b>${f.slogan ? `<div style="color:#71717a;font-size:12px">${esc(f.slogan)}</div>` : ''}</div></div>`
  const aviso = (ok) => { if (!ok) toast('O navegador bloqueou a nova aba: libere pop-ups para este site.', 'erro') }
  const crachas = () => {
    const salaDe = (p) => projetos.find((x) => String(x.id) === String(p.sala ?? p.projeto_id))?.nome || ''
    const corpo = `<main class="grade">${pessoas.map((p) => `<div class="cracha"><div class="topo" style="background:${f.cor_primaria}">${f.logo ? `<img src="${f.logo}" alt="${esc(f.nome)}">` : `<b>${esc(f.nome_curto)}</b>`}</div>
      <div class="foto" style="border-color:${f.cor_primaria}">${esc(iniciais(p.nome))}</div><h2>${esc(p.nome)}</h2><p>${esc(p.cargo || '')}</p><small>${esc(salaDe(p))}</small>
      <div class="rodape" style="background:${f.cor_destaque}">${esc(f.nome)}</div></div>`).join('')}</main>`
    aviso(imprimir('Crachás da equipe', corpo, `.grade{display:flex;flex-wrap:wrap;gap:8mm;padding:8mm}.cracha{width:54mm;height:86mm;border:1px solid #d4d4d8;border-radius:4mm;overflow:hidden;text-align:center;display:flex;flex-direction:column;align-items:center;break-inside:avoid}
      .topo{width:100%;height:18mm;display:grid;place-items:center;color:#fff}.topo img{max-height:12mm;max-width:40mm;filter:brightness(0) invert(1)}.foto{width:24mm;height:24mm;border-radius:50%;border:2px solid;margin-top:5mm;display:grid;place-items:center;font-size:22px;font-weight:700;color:#3f3f46;background:#f4f4f5}
      h2{font-size:15px;margin:4mm 2mm 1mm}p{margin:0 2mm;font-size:11px;color:#52525b}small{font-size:10px;color:#71717a;margin-top:1mm}.rodape{margin-top:auto;width:100%;color:#fff;font-size:10px;padding:2mm}`))
  }
  const timbrado = () => {
    const corpo = `<div class="folha"><header>${cabecalho}</header><div class="conteudo"></div><footer style="border-color:${f.cor_primaria}">${esc([f.relatorio_rodape, f.site, f.suporte_email, f.suporte_telefone].filter(Boolean).join(' · ') || f.nome)}</footer></div>`
    aviso(imprimir('Papel timbrado', corpo, `.folha{width:210mm;min-height:297mm;margin:auto;padding:16mm;display:flex;flex-direction:column}header{padding-bottom:6mm;border-bottom:2px solid ${f.cor_primaria}}.conteudo{flex:1}footer{border-top:1px solid;padding-top:4mm;font-size:10px;color:#52525b;text-align:center}`))
  }
  const placas = async () => {
    setGerando('placas')
    try {
      const salas = projetos.map((p) => ({ p, ar: aparelhos.find((a) => a.projeto_id === p.id && a.hub_id) || aparelhos.find((a) => a.projeto_id === p.id) })).filter((x) => x.ar)
      const qrs = await Promise.all(salas.map((x) => api.get(`/api/apps/qr?alvo=ar:${x.ar.id}`).then((r) => r.qr).catch(() => '')))
      const corpo = `<main>${salas.map((x, i) => `<section class="placa">${cabecalho}<h1>${esc(x.p.nome)}</h1><p>Controle o ar desta sala pelo celular: aponte a câmera para o código.</p>
        ${qrs[i] ? `<img class="qr" src="${qrs[i]}" alt="QR Code da sala">` : ''}<p class="ar">${esc(x.ar.nome)}</p><p class="rod">${esc(f.nome)} · precisa entrar com a sua conta</p></section>`).join('')}</main>`
      aviso(imprimir('Placas das salas', corpo, `.placa{width:180mm;margin:10mm auto;padding:12mm;border:1px solid #d4d4d8;border-radius:6mm;text-align:center;break-after:page}.placa header{justify-content:center}
        h1{font-size:34px;margin:10mm 0 2mm;color:${f.cor_primaria}}.qr{width:70mm;height:70mm;image-rendering:pixelated;margin:6mm auto;display:block}.ar{font-weight:600}.rod{font-size:11px;color:#71717a}.placa>div{justify-content:center}`))
    } finally { setGerando('') }
  }
  return (
    <section className="cartao p-5">
      <h3 className="flex items-center gap-2 text-sm font-semibold"><Printer className="h-4 w-4 text-muted-foreground" />Impressos com a marca</h3>
      <p className="mt-1 text-xs text-muted-foreground">Abrem numa aba pronta para imprimir ou salvar em PDF, com o logo, as cores e os dados salvos da marca.</p>
      <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
        <button onClick={crachas} disabled={!pessoas.length} className="rounded-md border border-border p-3 text-left hover:bg-muted/40 disabled:opacity-50"><BadgeCheck className="h-4 w-4 text-muted-foreground" /><p className="mt-1 text-sm font-medium">Crachás da equipe</p><p className="text-xs text-muted-foreground">{pessoas.length ? `${pessoas.length} pessoa(s) do mapa` : 'Cadastre a equipe no Mapa'}</p></button>
        <button onClick={timbrado} className="rounded-md border border-border p-3 text-left hover:bg-muted/40"><FileText className="h-4 w-4 text-muted-foreground" /><p className="mt-1 text-sm font-medium">Papel timbrado (A4)</p><p className="text-xs text-muted-foreground">Cabeçalho e rodapé da marca</p></button>
        <button onClick={placas} disabled={!!gerando || !aparelhos.length} className="rounded-md border border-border p-3 text-left hover:bg-muted/40 disabled:opacity-50"><QrCode className="h-4 w-4 text-muted-foreground" /><p className="mt-1 text-sm font-medium">{gerando ? 'Gerando…' : 'Placas das salas'}</p><p className="text-xs text-muted-foreground">QR Code que abre o ar da sala</p></button>
      </div>
      {!f.logo && <p className="mt-2 text-xs text-muted-foreground"><Selo>Dica</Selo> Sem logo enviado, os impressos usam as iniciais do nome curto.</p>}
    </section>
  )
}

export default function MarcaExtras({ f, sessao }) {
  const ref = useRef(null)
  return (
    <div ref={ref} className="mt-6 grid grid-cols-1 gap-6">
      <h2 className="text-base font-semibold">Material da marca</h2>
      <Icones f={f} />
      <Assinatura f={f} sessao={sessao} />
      <Impressos f={f} />
    </div>
  )
}
