// Conteúdo das telas dos monitores no mapa 3D. Cada posto tem uma semente própria, então duas telas nunca mostram a
// mesma coisa; o "papel" vem da sala (Devs → código, Analistas → planilha, Diretor/Deison/Fabio → e-mail e agenda,
// Bancada → terminal, Reunião → slides, salão → um pouco de tudo). Tudo é fictício e genérico: nenhum dado real.
// Desenho em canvas 256×144; o Mapa3D redesenha só os monitores perto da câmera (~2 por segundo) e o do avatar controlado.

export const ROTULO_PAPEL = {
  codigo: 'escrevendo código', planilha: 'numa planilha', email: 'lendo e-mails', agenda: 'organizando a agenda',
  terminal: 'acompanhando o terminal', painel: 'olhando um painel de indicadores', slides: 'montando uma apresentação', bloqueio: 'tela bloqueada',
}

export function papelDaSala(nome = '', semente = 0) {
  const n = nome.toLowerCase()
  if (/dev/.test(n)) return 'codigo'
  if (/analist/.test(n)) return semente % 3 === 0 ? 'painel' : 'planilha'
  if (/diretor|deison|fabio|subsec/.test(n)) return semente % 2 ? 'agenda' : 'email'
  if (/bancada|t[eé]cnic/.test(n)) return 'terminal'
  if (/reuni/.test(n)) return 'slides'
  return ['codigo', 'planilha', 'email', 'painel', 'terminal'][semente % 5]
}

export const sementeDe = (txt) => { let h = 2166136261; for (const c of String(txt)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619) } return h >>> 0 }

const aleat = (s) => () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296 }

const CODIGO = [
  ['def', ' calcular_consumo(ar, horas):'], ['', '    potencia = ar.potencia_w / 1000'], ['', '    total = potencia * horas'],
  ['return', ' round(total, 2)'], ['', ''], ['class', ' Relatorio:'], ['', '    def __init__(self, periodo):'],
  ['', '        self.periodo = periodo'], ['', '        self.linhas = []'], ['', ''], ['for', ' item in pedidos:'],
  ['if', ' item.status == "pendente":'], ['', '        fila.append(item)'], ['const', ' total = itens.reduce((s, i) => s + i.valor, 0)'],
  ['import', ' { useState } from "react"'], ['export', ' function Resumo({ dados }) {'], ['', '  return <Tabela linhas={dados} />'],
]
const ASSUNTOS = ['Reunião de alinhamento', 'Relatório mensal', 'Pedido de compra', 'Agenda da semana', 'Ofício recebido', 'Revisão do contrato',
  'Convite: apresentação', 'Atualização do projeto', 'Ata da reunião', 'Solicitação de acesso', 'Orçamento aprovado', 'Lembrete: prazo']
const REMETENTES = ['Coordenação', 'Financeiro', 'Gabinete', 'Suporte', 'Compras', 'Jurídico', 'RH', 'Protocolo']
const LOGS = ['backup concluído', 'ping 10.0.0.1 ok', 'serviço reiniciado', 'disco 62% usado', 'atualização instalada', 'certificado válido',
  'fila vazia', 'switch porta 12 up', 'impressora online', 'cópia sincronizada', 'teste de rede ok', 'antivírus atualizado']

export function desenharTela(g, papel, semente, t, ativo = false) {
  const W = 256, H = 144, r = aleat(semente)
  g.textBaseline = 'top'
  if (papel === 'bloqueio') {
    const gr = g.createLinearGradient(0, 0, W, H); gr.addColorStop(0, `hsl(${semente % 360},35%,32%)`); gr.addColorStop(1, `hsl(${(semente / 7) % 360},40%,16%)`)
    g.fillStyle = gr; g.fillRect(0, 0, W, H)
    const d = new Date(); g.fillStyle = '#fff'; g.font = '600 30px system-ui, sans-serif'; g.textAlign = 'center'
    g.fillText(d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }), W / 2, 42)
    g.font = '11px system-ui, sans-serif'; g.fillText(d.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' }), W / 2, 80); g.textAlign = 'left'
    return
  }
  // barra de janela
  const escuro = papel === 'codigo' || papel === 'terminal'
  g.fillStyle = escuro ? '#0f172a' : '#f8fafc'; g.fillRect(0, 0, W, H)
  g.fillStyle = escuro ? '#1e293b' : '#e2e8f0'; g.fillRect(0, 0, W, 12)
  ;['#ef4444', '#f59e0b', '#22c55e'].forEach((c, i) => { g.fillStyle = c; g.beginPath(); g.arc(7 + i * 8, 6, 2.4, 0, 7); g.fill() })
  g.font = '8px system-ui, sans-serif'; g.fillStyle = escuro ? '#94a3b8' : '#475569'
  const passo = Math.floor(t * (ativo ? 3 : 1.2) + (semente % 50))
  if (papel === 'codigo') {
    const arq = ['consumo.py', 'relatorio.py', 'Resumo.jsx', 'fila.js', 'api.ts'][semente % 5]; g.fillText(arq, 40, 2)
    g.font = '8px ui-monospace, Menlo, monospace'
    const ini = semente % CODIGO.length, n = 12, digitadas = passo % (n + 4)
    for (let i = 0; i < Math.min(n, digitadas); i++) {
      const [kw, resto] = CODIGO[(ini + i) % CODIGO.length], y = 16 + i * 10
      g.fillStyle = '#475569'; g.fillText(String(i + 1).padStart(2), 4, y)
      g.fillStyle = '#c084fc'; g.fillText(kw, 20, y)
      g.fillStyle = '#e2e8f0'; g.fillText(resto, 20 + g.measureText(kw).width, y)
    }
    if ((t * 2 | 0) % 2) { g.fillStyle = '#e2e8f0'; g.fillRect(20, 16 + Math.min(n - 1, digitadas) * 10, 4, 8) }
  } else if (papel === 'terminal') {
    g.fillText(`servidor-${(semente % 9) + 1}  ~  monitor`, 40, 2); g.font = '8px ui-monospace, Menlo, monospace'
    for (let i = 0; i < 12; i++) {
      const k = passo + i, rr = aleat(semente + k)
      g.fillStyle = rr() < 0.1 ? '#fbbf24' : '#4ade80'
      g.fillText(`${String(8 + (k % 10)).padStart(2, '0')}:${String(k % 60).padStart(2, '0')}  ${LOGS[(semente + k) % LOGS.length]}`, 4, 16 + i * 10)
    }
  } else if (papel === 'planilha') {
    g.fillText(['Orçamento 2026.xlsx', 'Indicadores.xlsx', 'Contratos.xlsx', 'Estoque.xlsx'][semente % 4], 40, 2)
    const cw = 42, ch = 11
    for (let j = 0; j < 11; j++) for (let i = 0; i < 6; i++) {
      const x = i * cw, y = 14 + j * ch
      g.strokeStyle = '#e2e8f0'; g.strokeRect(x, y, cw, ch)
      if (j === 0) { g.fillStyle = '#dbeafe'; g.fillRect(x, y, cw, ch); g.fillStyle = '#1e3a8a'; g.fillText(['Item', 'Jan', 'Fev', 'Mar', 'Abr', 'Total'][i], x + 3, y + 2) }
      else { g.fillStyle = '#334155'; g.fillText(i === 0 ? `Linha ${j}` : (r() * 9000 + 100).toFixed(0), x + 3, y + 2) }
    }
    const sel = passo % 50; g.strokeStyle = '#16a34a'; g.lineWidth = 1.5; g.strokeRect((1 + (sel % 5)) * cw, 14 + (1 + (sel % 10)) * ch, cw, ch); g.lineWidth = 1
  } else if (papel === 'email' || papel === 'agenda') {
    g.fillText(papel === 'email' ? 'Caixa de entrada' : 'Agenda', 40, 2)
    g.fillStyle = '#eef2ff'; g.fillRect(0, 12, 54, H - 12)
    g.fillStyle = '#3730a3'; ['Entrada', 'Enviados', 'Agenda', 'Tarefas'].forEach((x, i) => g.fillText(x, 6, 18 + i * 12))
    if (papel === 'email') {
      for (let i = 0; i < 9; i++) {
        const k = (semente + i + Math.floor(passo / 6)) % ASSUNTOS.length, y = 16 + i * 14
        g.fillStyle = i === passo % 9 ? '#e0e7ff' : '#fff'; g.fillRect(56, y - 2, W - 58, 13)
        g.fillStyle = '#0f172a'; g.font = `${i < 3 ? '600 ' : ''}8px system-ui, sans-serif`; g.fillText(REMETENTES[(k + semente) % REMETENTES.length], 60, y)
        g.font = '8px system-ui, sans-serif'; g.fillStyle = '#475569'; g.fillText(ASSUNTOS[k], 112, y)
      }
    } else {
      const dias = ['seg', 'ter', 'qua', 'qui', 'sex']
      dias.forEach((d, i) => { g.fillStyle = '#475569'; g.fillText(d, 60 + i * 39, 16) })
      for (let i = 0; i < 7; i++) {
        const dia = Math.floor(r() * 5), y = 28 + Math.floor(r() * 9) * 12
        g.fillStyle = ['#bfdbfe', '#bbf7d0', '#fde68a', '#fecaca'][i % 4]; g.fillRect(58 + dia * 39, y, 36, 18)
        g.fillStyle = '#1e293b'; g.fillText(ASSUNTOS[(semente + i) % ASSUNTOS.length].slice(0, 9), 60 + dia * 39, y + 4)
      }
    }
  } else if (papel === 'painel') {
    g.fillText('Painel de indicadores', 40, 2)
    for (let i = 0; i < 3; i++) { g.fillStyle = '#f1f5f9'; g.fillRect(4 + i * 84, 16, 80, 30); g.fillStyle = '#0f172a'; g.font = '600 13px system-ui, sans-serif'; g.fillText((r() * 900 + 50).toFixed(0), 10 + i * 84, 26); g.font = '8px system-ui, sans-serif' }
    g.strokeStyle = '#2563eb'; g.lineWidth = 1.5; g.beginPath()
    for (let x = 0; x <= 24; x++) { const y = 120 - (Math.sin((x + passo * 0.3 + semente) * 0.5) * 0.5 + 0.5) * 55 - r() * 8; x ? g.lineTo(6 + x * 10, y) : g.moveTo(6, y) }
    g.stroke(); g.lineWidth = 1
  } else if (papel === 'slides') {
    g.fillStyle = '#e2e8f0'; g.fillRect(0, 12, 46, H - 12)
    for (let i = 0; i < 4; i++) { g.fillStyle = i === passo % 4 ? '#93c5fd' : '#fff'; g.fillRect(5, 16 + i * 31, 36, 26) }
    g.fillStyle = '#fff'; g.fillRect(52, 18, 198, 118)
    g.fillStyle = '#0f172a'; g.font = '600 12px system-ui, sans-serif'; g.fillText(['Resultados do trimestre', 'Plano de ação', 'Próximos passos', 'Cronograma'][(semente + passo) % 4], 60, 28)
    g.font = '9px system-ui, sans-serif'; g.fillStyle = '#475569'; for (let i = 0; i < 4; i++) g.fillText(`• ${ASSUNTOS[(semente + i) % ASSUNTOS.length]}`, 62, 52 + i * 16)
  }
}
