// Gera os banners de compartilhamento (Open Graph / Twitter) em public/og/*.jpg, 1200x630, a partir de
// scripts/og-modelo.html e das capturas reais em public/telas. Rodar depois de mudar textos ou telas:
//   node scripts/gerar-og.mjs   (precisa do Chrome for Testing do Playwright instalado)
import fs from 'fs'
import path from 'path'
import { fileURLToPath, pathToFileURL } from 'url'

const aqui = path.dirname(fileURLToPath(import.meta.url))
const raiz = path.resolve(aqui, '..')
const codigo = fs.readFileSync(path.join(raiz, 'lib/dados.js'), 'utf8')
const D = await import('data:text/javascript,' + encodeURIComponent(codigo))
const { chromium } = await import(process.env.PLAYWRIGHT_CORE || 'playwright-core')
const exe = process.env.CHROME_TESTE || path.join(process.env.HOME, 'Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing')
const tela = (img) => pathToFileURL(path.join(raiz, 'public/telas', img)).href

const lista = [
  { arq: 'inicio', tag: 'Ar-condicionado inteligente', titulo: 'O ar do escritório no ponto certo, antes de você chegar', desc: 'Controle por infravermelho pelo painel, celular, Alexa e Google, com agenda, automações e relatórios de consumo.', img: 'painel.jpg' },
  { arq: 'sobre', tag: 'Sobre o sistema', titulo: 'Ar-condicionado comum, comandado como se fosse inteligente', desc: 'Um painel só para todos os ares do escritório, com voz, agenda, relatórios e segurança.', img: 'painel.jpg' },
  { arq: 'funcionalidades', tag: 'Funcionalidades', titulo: 'Tudo que o ar do escritório precisa em um painel só', desc: 'Infravermelho, Alexa e Google, agenda, automações, relatórios, segurança com mapa 3D e apps.', img: 'relatorios.jpg' },
  { arq: 'telas', tag: 'Telas do sistema', titulo: 'Capturas reais do painel em funcionamento', desc: 'Painel em 3D, segurança com globo, relatórios, notificações, apps e mais.', img: 'seguranca.jpg' },
  { arq: 'novidades', tag: 'Novidades', titulo: 'O que mudou em cada versão do sistema', desc: 'Notificações, segurança com globo 3D, white label, firewall, relatórios exportáveis e mais.', img: 'notificacoes.jpg' },
  { arq: 'faq', tag: 'Perguntas frequentes', titulo: 'Respostas diretas antes de colocar no escritório', desc: 'O que o sistema faz, o que precisa comprar e como funciona com a Alexa e o Google.', img: 'aparelho.jpg' },
  { arq: 'contato', tag: 'Contato', titulo: 'Vamos colocar o seu escritório no ponto certo', desc: 'Mande sua mensagem: ela chega direto na central de notificações do administrador.', img: 'comandos-voz.jpg' },
  { arq: 'sistema', tag: 'Painel do administrador', titulo: 'Entre no painel do Clima Escritório', desc: 'Controle os ares, a agenda, os relatórios e a segurança. Acesso só para quem tem conta.', img: 'painel.jpg', dominio: 'app.zynio.com.br', itens: 'Acesso restrito a quem tem conta' },
  ...D.FUNCIONALIDADES.map((f) => ({ arq: `funcionalidade-${f.slug}`, tag: 'Funcionalidade', titulo: f.titulo, desc: f.resumo, img: `${f.tela}.jpg` })),
  ...D.TELAS.map((t) => ({ arq: `tela-${t.slug}`, tag: 'Tela do sistema', titulo: t.titulo, desc: t.resumo, img: t.img })),
  ...D.NOVIDADES.map((n) => ({ arq: `novidade-${n.slug}`, tag: `Novidade · ${n.data.split('-').reverse().join('/')}`, titulo: n.titulo, desc: n.resumo, img: n.img })),
]

const b = await chromium.launch({ executablePath: exe })
const p = await b.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 })
await p.goto(pathToFileURL(path.join(aqui, 'og-modelo.html')).href, { waitUntil: 'networkidle' })
await p.evaluate(() => document.fonts.ready)
for (const item of lista) {
  await p.evaluate((d) => window.preencher(d), { ...item, img: tela(item.img) })
  await p.waitForTimeout(150)
  const destino = path.join(raiz, 'public/og', `${item.arq}.jpg`)
  await p.screenshot({ path: destino, type: 'jpeg', quality: 84 })
  console.log(`${item.arq}.jpg ${(fs.statSync(destino).size / 1024).toFixed(0)} KB`)
}
await b.close()
