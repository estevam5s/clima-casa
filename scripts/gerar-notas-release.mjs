#!/usr/bin/env node
// Monta as notas completas de uma release no estilo do README (cabeçalho, selos, sumário, novidades, downloads
// com tamanho e SHA-256, instalação por sistema, requisitos, verificação, commits da versão, estatísticas e links)
// e aplica no GitHub com `gh release edit`.
//   node scripts/gerar-notas-release.mjs v1.2.0            → atualiza a release
//   node scripts/gerar-notas-release.mjs v1.2.0 --mostrar  → só imprime
//   node scripts/gerar-notas-release.mjs --todas           → todas as releases que têm docs/releases/<tag>.md
// O texto das novidades (escrito à mão) fica em docs/releases/<tag>.md.
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const RAIZ = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..')
const REPO = 'estevam5s/clima-casa'
const sh = (cmd, ...a) => execFileSync(cmd, a, { cwd: RAIZ, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
const mb = (b) => `${(b / 1048576).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} MB`

const releases = JSON.parse(sh('gh', 'api', `repos/${REPO}/releases?per_page=50`)).filter((r) => !r.draft)
  .sort((a, b) => new Date(a.published_at) - new Date(b.published_at))
const SISTEMA = {
  'ClimaCasa-android.apk': ['Android', 'Android 8.0 ou mais novo', 'Abra o APK no celular e permita "instalar de fontes desconhecidas" para o navegador ou o gerenciador de arquivos.'],
  'ClimaCasa-mac-apple-silicon.dmg': ['macOS (Apple Silicon)', 'macOS 12+ em Mac M1, M2, M3 ou M4', 'Abra o DMG e arraste para Aplicativos. Na primeira vez: botão direito no app → Abrir (o app não é assinado pela Apple).'],
  'ClimaCasa-mac-intel.dmg': ['macOS (Intel)', 'macOS 12+ em Mac com processador Intel', 'Igual ao Apple Silicon: arraste para Aplicativos e, na primeira vez, botão direito → Abrir.'],
  'ClimaCasa-windows.exe': ['Windows', 'Windows 10 ou 11, 64 bits', 'Execute o instalador. Se o SmartScreen avisar, clique em "Mais informações" → "Executar assim mesmo".'],
  'ClimaCasa-linux-x64.AppImage': ['Linux (x64)', 'Distribuição de 64 bits com glibc 2.28+', '`chmod +x ClimaCasa-linux-x64.AppImage` e execute.'],
  'ClimaCasa-linux-arm64.AppImage': ['Linux (ARM64)', 'Raspberry Pi 4/5 ou outro ARM64', '`chmod +x ClimaCasa-linux-arm64.AppImage` e execute.'],
}

function notas(tag) {
  const i = releases.findIndex((r) => r.tag_name === tag)
  if (i < 0) throw new Error(`release ${tag} não existe`)
  const r = releases[i], anterior = releases[i - 1]
  const versao = tag.replace(/^v/, '')
  const shaAlvo = sh('gh', 'api', `repos/${REPO}/commits/${tag}`, '--jq', '.sha').trim()
  const shaAnt = anterior ? sh('gh', 'api', `repos/${REPO}/commits/${anterior.tag_name}`, '--jq', '.sha').trim() : null
  const faixa = shaAnt ? `${shaAnt}..${shaAlvo}` : shaAlvo
  const commits = sh('git', 'log', '--no-merges', '--format=%h%x1f%ad%x1f%s', '--date=short', faixa).trim().split('\n').filter(Boolean).map((l) => l.split('\x1f'))
  const stat = sh('git', 'diff', '--shortstat', shaAnt || '4b825dc642cb6eb9a060e54bf8d69288fbee4904', shaAlvo).trim()
  const [arqs, mais, menos] = [/(\d+) files? changed/, /(\d+) insertions?/, /(\d+) deletions?/].map((re) => +(stat.match(re)?.[1] || 0))
  const novidades = fs.readFileSync(path.join(RAIZ, 'docs/releases', `${tag}.md`), 'utf8').trim()
  const assets = (r.assets || []).sort((a, b) => Object.keys(SISTEMA).indexOf(a.name) - Object.keys(SISTEMA).indexOf(b.name))
  const data = new Date(r.published_at).toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' })
  const nomeProduto = /Casa/.test(r.name || '') ? 'Clima Casa' : 'Clima Escritório'

  const L = []
  L.push('<div align="center">', '', `<img src="https://raw.githubusercontent.com/${REPO}/${shaAlvo}/frontend/public/icone-512.png" alt="${nomeProduto}" width="96" />`, '',
    `# ${nomeProduto} ${versao}`, '', `**Publicada em ${data}** · commit [\`${shaAlvo.slice(0, 7)}\`](https://github.com/${REPO}/commit/${shaAlvo})` + (anterior ? ` · anterior: [${anterior.tag_name}](https://github.com/${REPO}/releases/tag/${anterior.tag_name})` : ' · primeira versão'), '',
    `![Versão](https://img.shields.io/badge/vers%C3%A3o-${versao}-0f766a?style=for-the-badge)`,
    `![Commits](https://img.shields.io/badge/commits-${commits.length}-334155?style=for-the-badge)`,
    `![Arquivos](https://img.shields.io/badge/arquivos_alterados-${arqs}-334155?style=for-the-badge)`,
    `![Linhas](https://img.shields.io/badge/linhas-%2B${mais}%20%E2%88%92${menos}-334155?style=for-the-badge)`,
    '![Android](https://img.shields.io/badge/Android-3DDC84?style=for-the-badge&logo=android&logoColor=white)',
    '![macOS](https://img.shields.io/badge/macOS-000000?style=for-the-badge&logo=apple&logoColor=white)',
    '![Windows](https://img.shields.io/badge/Windows-0078D4?style=for-the-badge&logo=windows&logoColor=white)',
    '![Linux](https://img.shields.io/badge/Linux-FCC624?style=for-the-badge&logo=linux&logoColor=black)', '',
    '🔗 **Painel:** [app.zynio.com.br](https://app.zynio.com.br) · 🌐 **Site:** [zynio.com.br](https://zynio.com.br) · 📘 **Manual:** [`docs/MANUAL.md`](https://github.com/' + REPO + '/blob/main/docs/MANUAL.md) · 📄 **README:** [visão geral](https://github.com/' + REPO + '#readme)',
    '', '</div>', '', '---', '')
  L.push('## 📑 Sumário', '', '1. [Resumo](#-resumo)', '2. [Destaques](#-destaques)', '3. [Downloads](#-downloads)', '4. [Instalação](#-instalação)', '5. [Verificar o download](#-verificar-o-download)', '6. [Requisitos](#-requisitos)', '7. [Commits desta versão](#-commits-desta-versão)', '8. [Estatísticas](#-estatísticas)', '9. [Links](#-links)', '')
  L.push(novidades, '')
  L.push('## 📦 Downloads', '', '| Sistema | Arquivo | Tamanho | Baixar |', '|---|---|---:|---|')
  for (const a of assets) {
    const s = SISTEMA[a.name] || [a.name]
    L.push(`| ${s[0]} | \`${a.name}\` | ${mb(a.size)} | [baixar](${a.browser_download_url}) |`)
  }
  L.push('', '> O repositório é privado: os links funcionam para quem está logado no GitHub com acesso. No painel, a página **Apps** detecta o seu sistema e oferece o arquivo certo.', '')
  L.push('## 🛠️ Instalação', '')
  for (const a of assets) { const s = SISTEMA[a.name]; if (s) L.push(`- **${s[0]}**: ${s[2]}`) }
  L.push('- **Web/PWA**: abra o painel no navegador e use "Instalar app" (Chrome, Edge) ou "Adicionar à Tela de Início" (Safari).', '', 'Todos usam o mesmo login e controlam os mesmos aparelhos do painel.', '')
  L.push('## 🔏 Verificar o download', '', 'Compare o SHA-256 do arquivo baixado com a tabela:', '', '| Arquivo | SHA-256 |', '|---|---|')
  for (const a of assets) L.push(`| \`${a.name}\` | \`${(a.digest || '').replace('sha256:', '') || 'n/d'}\` |`)
  L.push('', '```bash', '# macOS', 'shasum -a 256 ~/Downloads/ClimaCasa-mac-apple-silicon.dmg', '# Linux / Android (Termux)', 'sha256sum ClimaCasa-linux-x64.AppImage', '# Windows (PowerShell)', 'Get-FileHash $env:USERPROFILE\\Downloads\\ClimaCasa-windows.exe -Algorithm SHA256', '```', '')
  L.push('## 📋 Requisitos', '', '| Sistema | Requisito |', '|---|---|')
  for (const a of assets) { const s = SISTEMA[a.name]; if (s) L.push(`| ${s[0]} | ${s[1]} |`) }
  L.push('| Controle por infravermelho | Transmissor Tuya SRW-004 na mesma rede do agente (Mac) e botões do controle gravados |', '| Alexa / Google Home | Conta do Sinric Pro vinculada (plano gratuito: 3 aparelhos) |', '')
  L.push('## 🧾 Commits desta versão', '', `${commits.length} commit(s)${anterior ? ` desde a ${anterior.tag_name}` : ''}:`, '', '| Commit | Data | Descrição |', '|---|---|---|')
  for (const [h, d, s] of commits) L.push(`| [\`${h}\`](https://github.com/${REPO}/commit/${h}) | ${d.split('-').reverse().join('/')} | ${s.replace(/\|/g, '\\|')} |`)
  L.push('')
  L.push('## 📊 Estatísticas', '', '| Métrica | Valor |', '|---|---:|', `| Commits | ${commits.length} |`, `| Arquivos alterados | ${arqs.toLocaleString('pt-BR')} |`, `| Linhas adicionadas | +${mais.toLocaleString('pt-BR')} |`, `| Linhas removidas | −${menos.toLocaleString('pt-BR')} |`, `| Instaladores | ${assets.length} (${mb(assets.reduce((s, a) => s + a.size, 0))} no total) |`, '')
  L.push('## 🔗 Links', '')
  if (anterior) L.push(`- **Todas as mudanças**: [${anterior.tag_name}...${tag}](https://github.com/${REPO}/compare/${anterior.tag_name}...${tag})`)
  L.push(`- **Código desta versão**: [${tag}](https://github.com/${REPO}/tree/${tag}) · também em **Painel → Apps → Código-fonte**`, `- **Guia do projeto**: [CLAUDE.md](https://github.com/${REPO}/blob/${tag}/CLAUDE.md) · [README.md](https://github.com/${REPO}/blob/${tag}/README.md)`, '- **Suporte**: [zynio.com.br/contato](https://zynio.com.br/contato)', '')
  return L.join('\n')
}

const args = process.argv.slice(2)
const tags = args.includes('--todas') ? releases.map((r) => r.tag_name).filter((t) => fs.existsSync(path.join(RAIZ, 'docs/releases', `${t}.md`))) : args.filter((a) => !a.startsWith('--'))
for (const tag of tags) {
  const texto = notas(tag)
  if (args.includes('--mostrar')) { console.log(texto); continue }
  const arq = path.join(os.tmpdir(), `notas-${tag}.md`)
  fs.writeFileSync(arq, texto)
  sh('gh', 'release', 'edit', tag, '--repo', REPO, '--notes-file', arq)
  fs.rmSync(arq)
  console.log(`${tag}: notas atualizadas (${texto.length} caracteres)`)
}
