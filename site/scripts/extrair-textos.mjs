// Gera public/i18n/textos.json: todos os textos em português que o site mostra (com as páginas onde aparecem).
// O painel (Idiomas do site → Buscar textos do site) lê esse arquivo e manda traduzir o que é novo.
// Roda na publicação (publicar.sh): compila o site, sobe em http://localhost:3199, abre cada página do sitemap no
// Google Chrome sem janela e chama o mesmo coletor do motor de tradução (lib/i18n.js → coletarChaves).
// Precisa do Google Chrome instalado (ou CHROME=/caminho/do/chrome). SEM_BUILD=1 reaproveita o .next existente.
import { spawn, execSync } from 'node:child_process'
import fs from 'node:fs'

const raiz = new URL('..', import.meta.url).pathname
const PORTA = 3199
const BASE = `http://localhost:${PORTA}`
const chrome = process.env.CHROME || ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome', '/usr/bin/chromium'].find((c) => fs.existsSync(c))
if (!chrome) { console.log('extrair-textos: Google Chrome não encontrado; a lista de textos continua a mesma.'); process.exit(0) }
let pw
try { pw = await import('playwright-core') } catch { console.log('extrair-textos: falta o playwright-core (npm install em site/); a lista de textos continua a mesma.'); process.exit(0) }

if (process.env.SEM_BUILD !== '1') execSync('npx next build', { cwd: raiz, stdio: 'inherit', env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' } })
const srv = spawn('npx', ['next', 'start', '-p', String(PORTA)], { cwd: raiz, stdio: 'ignore', detached: true })
const parar = () => { try { process.kill(-srv.pid) } catch { /* já saiu */ } }
process.on('exit', parar)
for (let i = 0; i < 60; i++) { try { if ((await fetch(BASE)).ok) break } catch { /* subindo */ } await new Promise((r) => setTimeout(r, 1000)) }

const sitemap = await (await fetch(`${BASE}/sitemap.xml`)).text()
const rotas = [...new Set([...sitemap.matchAll(/<loc>https?:\/\/[^/<]+([^<]*)<\/loc>/g)].map((m) => m[1] || '/'))].map((r) => r.split('?')[0] || '/')
const unicas = [...new Set(rotas), '/rota-que-nao-existe']
const nav = await pw.chromium.launch({ executablePath: chrome, headless: true })
const ctx = await nav.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' })
await ctx.addInitScript(() => { try { localStorage.setItem('zynio-idioma', 'pt') } catch { /* sem armazenamento */ } })
const p = await ctx.newPage()
const mapa = new Map()
for (const r of unicas) {
  try {
    await p.goto(BASE + r, { waitUntil: 'load', timeout: 30000 })
    await p.waitForFunction(() => window.__zynioI18n, null, { timeout: 15000 })
    await p.waitForTimeout(1200)
    const chaves = await p.evaluate(() => window.__zynioI18n.coletar())
    for (const c of chaves) { if (!mapa.has(c)) mapa.set(c, new Set()); mapa.get(c).add(r === '/rota-que-nao-existe' ? '404' : r) }
    process.stdout.write(`\r${unicas.indexOf(r) + 1}/${unicas.length} páginas · ${mapa.size} textos   `)
  } catch (e) { console.log(`\nfalhou ${r}: ${String(e.message).slice(0, 100)}`) }
}
await nav.close()
parar()
// textos que só aparecem logado no sistema ou depois de uma ação (o navegador sem login não vê)
const EXTRAS = ["ENTRAR NO SISTEMA", "ABRIR O PAINEL", "ENTRAR", "Entrar no sistema", "Fazer login", "Entrar no painel", "Fazer login no painel", "Enviando", "Enviando…", "Quase lá: abra o e-mail que acabamos de mandar e confirme a inscrição.", "Mensagem enviada. O administrador vê na central de notificações do sistema.", "Não foi possível enviar agora. Tente de novo em instantes.", "Inscrição confirmada.", "Você vai receber as próximas novidades. Sair é um clique em qualquer e-mail.", "Esse link não vale mais.", "Peça a inscrição de novo no formulário abaixo.", "Pronto, você saiu da lista.", "Não enviamos mais nada. Se mudar de ideia, é só assinar de novo.", "Cancelar a inscrição na newsletter?", "Você deixa de receber as novidades por e-mail.", "Não deu para cancelar por este link. Responda a qualquer e-mail da newsletter pedindo para sair.", "Cancelando", "Cancelar inscrição", "Nenhuma versão com esse filtro.", "Limpar busca"]
for (const e of EXTRAS) if (!mapa.has(e)) mapa.set(e, new Set(['(dinâmico)']))
const textos = [...mapa].map(([texto, rs]) => ({ texto, rotas: [...rs].slice(0, 20) })).sort((a, b) => a.texto.localeCompare(b.texto))
fs.mkdirSync(`${raiz}public/i18n`, { recursive: true })
fs.writeFileSync(`${raiz}public/i18n/textos.json`, JSON.stringify({ gerado_em: new Date().toISOString(), paginas: unicas.length, textos }) + '\n')
console.log(`\ntextos.json: ${textos.length} textos de ${unicas.length} páginas`)
process.exit(0)
