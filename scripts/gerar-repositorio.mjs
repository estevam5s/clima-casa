#!/usr/bin/env node
// Gera backend/app/repositorio.json (commits, arquivos, linguagens, versões, README) e publica os pacotes do
// código-fonte (zip e tar.gz do último commit e de cada release) no Storage privado do Supabase (bucket
// "codigo-fonte"). A tela /apps lê esse JSON pela API e baixa os pacotes por link assinado de 2 minutos.
// Rodado pelo publicar-vercel.sh. Precisa de git e, para as releases, do gh logado.
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const RAIZ = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..')
const REPO = 'estevam5s/clima-casa'
const BUCKET = 'codigo-fonte'
const git = (...a) => execFileSync('git', a, { cwd: RAIZ, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
const gh = (...a) => { try { return execFileSync('gh', a, { cwd: RAIZ, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 }) } catch { return null } }
const env = Object.fromEntries(fs.readFileSync(path.join(RAIZ, '.env'), 'utf8').split('\n').filter((l) => /^[A-Z_]+=/.test(l)).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]))

// ---- commits (com arquivos alterados e linhas +/-) ----
const SEP = '\u001e', FIM = '\u001f'
const bruto = git('log', '--no-merges', `--format=${SEP}%H${FIM}%P${FIM}%an${FIM}%at${FIM}%s${FIM}%b${FIM}`, '--numstat')
const commits = bruto.split(SEP).filter(Boolean).map((bloco) => {
  const [sha, pais, autor, quando, titulo, corpo, resto] = bloco.split(FIM)
  const arquivos = (resto || '').trim().split('\n').filter(Boolean).map((l) => {
    const [a, r, ...p] = l.split('\t')
    return { caminho: p.join('\t'), mais: a === '-' ? 0 : +a, menos: r === '-' ? 0 : +r, binario: a === '-' }
  })
  const linhasCorpo = (corpo || '').trim().split('\n')
  const coautores = linhasCorpo.filter((l) => /^Co-Authored-By:/i.test(l)).map((l) => l.replace(/^Co-Authored-By:\s*/i, '').replace(/\s*<.*>$/, ''))
  return {
    sha, curto: sha.slice(0, 7), pais: pais.split(' ').filter(Boolean), autor, quando: +quando, titulo,
    corpo: linhasCorpo.filter((l) => !/^Co-Authored-By:/i.test(l)).join('\n').trim(), coautores,
    mais: arquivos.reduce((s, f) => s + f.mais, 0), menos: arquivos.reduce((s, f) => s + f.menos, 0),
    arquivos: arquivos.slice(0, 200), total_arquivos: arquivos.length,
  }
})

// ---- árvore de arquivos e linguagens ----
const LING = { '.py': ['Python', '#3572A5'], '.jsx': ['JavaScript', '#f1e05a'], '.js': ['JavaScript', '#f1e05a'], '.mjs': ['JavaScript', '#f1e05a'], '.ts': ['TypeScript', '#3178c6'], '.tsx': ['TypeScript', '#3178c6'], '.css': ['CSS', '#563d7c'], '.html': ['HTML', '#e34c26'], '.sql': ['PLpgSQL', '#336790'], '.sh': ['Shell', '#89e051'], '.md': ['Markdown', '#083fa1'], '.json': ['JSON', '#292929'] }
const arvore = git('ls-tree', '-r', '-l', 'HEAD').trim().split('\n').map((l) => {
  const [meta, caminho] = l.split('\t'); const tam = +meta.trim().split(/\s+/)[3] || 0
  return { caminho, tamanho: tam }
})
const ling = {}
for (const f of arvore) { const l = LING[path.extname(f.caminho)]; if (l && !['Markdown', 'JSON'].includes(l[0])) { ling[l[0]] ??= { bytes: 0, cor: l[1] }; ling[l[0]].bytes += f.tamanho } }
// último commit de cada pasta/arquivo da raiz (como a lista do GitHub)
const raiz = [...new Set(arvore.map((f) => f.caminho.split('/')[0]))]
const ultimoDe = Object.fromEntries(raiz.map((p) => {
  const [sha, quando, titulo] = git('log', '-1', '--format=%h%x1f%at%x1f%s', '--', p).trim().split('\x1f')
  return [p, { sha, quando: +quando, titulo }]
}))

// ---- releases (gh) ----
let releases = []
const rel = gh('api', `repos/${REPO}/releases?per_page=30`)
if (rel) {
  releases = JSON.parse(rel).map((r) => ({
    tag: r.tag_name, nome: r.name, publicado_em: r.published_at, rascunho: r.draft, pre: r.prerelease, corpo: r.body || '',
    alvo: r.target_commitish, arquivos: (r.assets || []).map((a) => ({ nome: a.name, tamanho: a.size, downloads: a.download_count })),
  }))
  for (const r of releases) {
    const ref = gh('api', `repos/${REPO}/commits/${r.tag}`, '--jq', '.sha')
    r.sha = ref ? ref.trim() : null
  }
}

// ---- pacotes do código-fonte no Storage ----
const SUPA = env.SUPABASE_URL, CHAVE = env.SUPABASE_SECRET_KEY
const cab = { apikey: CHAVE, Authorization: `Bearer ${CHAVE}` }
async function garantirBucket() {
  const r = await fetch(`${SUPA}/storage/v1/bucket/${BUCKET}`, { headers: cab })
  if (r.ok) return
  const c = await fetch(`${SUPA}/storage/v1/bucket`, { method: 'POST', headers: { ...cab, 'Content-Type': 'application/json' }, body: JSON.stringify({ id: BUCKET, name: BUCKET, public: false, file_size_limit: 52428800 }) })
  if (!c.ok) throw new Error(`bucket: ${c.status} ${await c.text()}`)
}
async function subir(nome, arquivo, tipo) {
  const corpo = fs.readFileSync(arquivo)
  const r = await fetch(`${SUPA}/storage/v1/object/${BUCKET}/${nome}`, { method: 'POST', headers: { ...cab, 'Content-Type': tipo, 'x-upsert': 'true' }, body: corpo })
  if (!r.ok) throw new Error(`upload ${nome}: ${r.status} ${await r.text()}`)
  return { tamanho: corpo.length, sha256: createHash('sha256').update(corpo).digest('hex') }
}
const pacotes = []
const versao = JSON.parse(fs.readFileSync(path.join(RAIZ, 'backend/app/versao_apps.json'), 'utf8')).android?.versao || '0.0.0'
const head = commits[0]
const alvos = [{ rotulo: `v${versao} (último commit)`, ref: head.sha, nome: `clima-casa-${versao}-${head.curto}`, atual: true },
  ...releases.filter((r) => r.sha && !r.rascunho).map((r) => ({ rotulo: r.tag, ref: r.sha, nome: `clima-casa-${r.tag}`, atual: false }))]
if (SUPA && CHAVE && !process.argv.includes('--sem-pacotes')) {
  await garantirBucket()
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-src-'))
  for (const a of alvos) {
    for (const [fmt, ext, tipo] of [['zip', 'zip', 'application/zip'], ['tar.gz', 'tar.gz', 'application/gzip']]) {
      const arq = path.join(tmp, `${a.nome}.${ext}`)
      git('archive', `--format=${fmt}`, `--prefix=${a.nome}/`, '-o', arq, a.ref)
      const info = await subir(`${a.nome}.${ext}`, arq, tipo)
      pacotes.push({ rotulo: a.rotulo, sha: a.ref.slice(0, 7), atual: a.atual, formato: fmt, arquivo: `${a.nome}.${ext}`, ...info })
    }
  }
  fs.rmSync(tmp, { recursive: true, force: true })
}

const saida = {
  repositorio: REPO, privado: true, ramo: git('rev-parse', '--abbrev-ref', 'HEAD').trim(), versao,
  gerado_em: Math.floor(Date.now() / 1000), total_commits: commits.length,
  readme: fs.readFileSync(path.join(RAIZ, 'README.md'), 'utf8').slice(0, 60000),
  linguagens: Object.entries(ling).map(([nome, v]) => ({ nome, ...v })).sort((a, b) => b.bytes - a.bytes),
  raiz: raiz.map((p) => ({ nome: p, pasta: arvore.some((f) => f.caminho.startsWith(`${p}/`)), ultimo: ultimoDe[p] })).sort((a, b) => (b.pasta - a.pasta) || a.nome.localeCompare(b.nome)),
  arquivos: arvore, commits, releases, pacotes,
}
fs.writeFileSync(path.join(RAIZ, 'backend/app/repositorio.json'), JSON.stringify(saida))
console.log(`repositorio.json: ${commits.length} commits, ${arvore.length} arquivos, ${releases.length} releases, ${pacotes.length} pacotes`)
