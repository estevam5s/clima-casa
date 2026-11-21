// Copia o histórico de versões do sistema (backend/app/novidades.json) para o site (lib/versoes.json).
// A página /novidades mostra tudo o que entrou em cada versão, do mesmo arquivo que o modal "O que há de novo" usa.
import fs from 'node:fs'
const raiz = new URL('..', import.meta.url).pathname
const origem = new URL('../backend/app/novidades.json', `file://${raiz}`).pathname
const j = JSON.parse(fs.readFileSync(origem, 'utf8'))
const versoes = j.versoes.map(({ versao, antes, data, titulo, resumo, novo = [], melhorias = [], seguranca = [], correcoes = [] }) => ({ versao, antes, data, titulo, resumo, novo, melhorias, seguranca, correcoes }))
fs.writeFileSync(`${raiz}lib/versoes.json`, JSON.stringify(versoes, null, 1) + '\n')
console.log(`versoes.json: ${versoes.length} versões`)
