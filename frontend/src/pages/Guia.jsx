import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { AirVent, ArrowRight, BookOpen, Check, CircleHelp, Cloud, Hand, Home, KeyRound, Map as MapaIcone, Mic, Music2, Printer, Radio, Search, Smartphone, Speaker, Users, Wifi, Workflow } from 'lucide-react'
import { Cabecalho } from '../components/ui'

// Passo a passo do sistema inteiro: do transmissor no Wi-Fi (Smart Life) até a Alexa (Sinric Pro), outra Alexa,
// Google, mapa e música. Cada passo pode ser marcado como feito (fica salvo neste navegador).
const CAPITULOS = [
  {
    id: 'como-funciona', icone: Workflow, titulo: 'Como o sistema funciona',
    resumo: 'As cinco peças e o caminho que um comando faz até o ar-condicionado.',
    fluxo: ['Você: painel, app ou “Alexa, desligar o ar”', 'Clima Escritório (internet)', 'Agente do Mac (rede do escritório)', 'Transmissor Smart IR', 'Luz infravermelha', 'Ar-condicionado'],
    passos: [
      { t: 'Transmissor infravermelho “Smart IR” (SRW-004)', d: 'Fica no mesmo cômodo do ar, na tomada, e “aperta os botões” do controle remoto por você.' },
      { t: 'App Smart Life (celular)', d: 'Serve para colocar o transmissor no Wi-Fi e para o sistema buscar a chave de segurança dele.' },
      { t: 'Agente do Mac', d: 'Programa que roda sozinho no Mac do escritório. Conversa com o transmissor pela rede local, roda a agenda, as automações, as rotinas de música e mantém a Alexa conectada. O Mac precisa ficar ligado e no mesmo Wi-Fi do transmissor.' },
      { t: 'Painel (este site, app de celular e app de computador)', d: 'Onde você controla tudo, de qualquer lugar.' },
      { t: 'Sinric Pro', d: 'Serviço que liga o sistema à Alexa e ao Google Home.' },
    ],
    dicas: ['O ar não avisa de volta o que está fazendo. Se alguém usar o controle original, o painel continua mostrando o último comando enviado por ele.'],
  },
  {
    id: 'antes', icone: Wifi, titulo: 'Antes de começar',
    resumo: 'O que precisa estar à mão.',
    passos: [
      { t: 'Wi-Fi de 2,4 GHz', d: 'O transmissor não funciona em 5 GHz. Se o roteador junta as duas redes num nome só, separe ou crie uma rede só de 2,4 GHz.' },
      { t: 'Controle remoto original de cada ar, com pilhas boas', d: 'É dele que o sistema copia os botões.' },
      { t: 'Mac do escritório ligado, no mesmo Wi-Fi do transmissor', d: 'Ajustes do Sistema → Bateria/Energia → impedir o repouso automático quando conectado à energia.' },
      { t: 'Celular com Smart Life e Amazon Alexa (ou Google Home)', d: 'Play Store ou App Store.' },
      { t: 'Onde pôr o transmissor', d: 'No mesmo cômodo do ar, com visão direta (infravermelho não atravessa paredes nem móveis), a no máximo 10 m, na tomada pelo cabo USB (5 V).' },
    ],
  },
  {
    id: 'smart-life', icone: Smartphone, titulo: 'App Smart Life: transmissor no Wi-Fi',
    resumo: 'Parear o Smart IR, achar o código do usuário e trocar de rede.',
    passos: [
      { t: 'Instale o Smart Life e crie a conta', d: 'Escolha Brasil como região.' },
      { t: 'Ligue o transmissor e coloque em modo de pareamento', d: 'Segure o botão de reset por 5 a 7 segundos, até o LED azul piscar rápido.' },
      { t: 'Adicione o aparelho', d: 'No Smart Life: + (canto superior) → Adicionar dispositivo → categoria Controle remoto IR (ou deixe o app encontrar sozinho).' },
      { t: 'Escolha a rede de 2,4 GHz e digite a senha', d: 'Aguarde até 2 minutos. Dê um nome claro, como “IR Escritório”, e toque em Concluído.' },
      { t: 'Não configure o ar dentro do Smart Life', d: 'Os botões são gravados aqui no sistema, direto do controle original (capítulo “Gravar os botões”).' },
      { t: 'Anote o seu Código do usuário', d: 'Smart Life → Eu → engrenagem → Conta e segurança → Código do usuário (algo como “Bah8ZRv”).' },
      { t: 'Trocou de Wi-Fi?', d: 'Remova o transmissor no Smart Life (lápis → Remover dispositivo) e pareie de novo com a rede nova. O sistema acha o IP e a chave novos sozinho em até 2 minutos. Os botões gravados continuam valendo.' },
    ],
  },
  {
    id: 'conta-tuya', icone: KeyRound, titulo: 'Ligar a conta Smart Life ao sistema',
    resumo: 'Uma vez só. Permite buscar a chave de cada transmissor, inclusive depois de trocar o Wi-Fi.',
    passos: [
      { t: 'Abra Configurações → Conta Smart Life', d: 'Digite o Código do usuário e clique em Gerar QR Code.', link: ['/configuracoes', 'Abrir Configurações'] },
      { t: 'Escaneie com o Smart Life', d: 'Toque no ícone de leitor (canto superior direito da aba Início ou Eu) e escaneie o QR Code da tela.' },
      { t: 'Confirme no celular', d: 'A tela do painel mostra “Conectada” sozinha.' },
    ],
  },
  {
    id: 'transmissores', icone: Radio, titulo: 'Trazer os transmissores',
    resumo: 'Importar da conta Smart Life e conferir se estão online.',
    passos: [
      { t: 'Abra Transmissores IR', d: 'Clique em Importar todos: vêm todos os transmissores da conta, com IP e chave. Para escolher um por um, use Importar um.', link: ['/transmissores', 'Abrir Transmissores'] },
      { t: 'Confira o ponto verde (online)', d: 'Se estiver cinza, clique em Reconectar agora. Ainda offline? Confira se ele está na tomada e no mesmo Wi-Fi 2,4 GHz do Mac. Procurar na rede mostra o que o Mac enxerga.' },
      { t: 'Um projeto para cada lugar', d: 'Em Projetos crie “Escritório”, “Casa” etc. O seletor no topo do menu escolhe o que as telas mostram.', link: ['/projetos', 'Abrir Projetos'] },
    ],
  },
  {
    id: 'aparelhos', icone: AirVent, titulo: 'Cadastrar o ar-condicionado',
    resumo: 'Nome, transmissor, temperaturas, modos e potência.',
    passos: [
      { t: 'Aparelhos → Adicionar aparelho', d: 'O nome é o que você vai falar para a Alexa: curto e diferente dos outros (“Ar do escritório”, “Ar da reunião”).', link: ['/aparelhos?novo=1', 'Adicionar aparelho'] },
      { t: 'Escolha o projeto, o cômodo e o transmissor do mesmo cômodo', d: 'Um transmissor controla mais de um ar no mesmo cômodo, desde que “enxergue” todos.' },
      { t: 'Temperatura mínima/máxima e os modos que o ar tem', d: 'Frio, quente, ventilar, desumidificar, automático.' },
      { t: 'Potência (W) para estimar o gasto', d: '9.000 BTU ≈ 800 W · 12.000 BTU ≈ 1.100 W · 18.000 BTU ≈ 1.650 W. Na dúvida, 1.000 W.' },
      { t: 'Deixe “Disponível na Alexa” ligado', d: 'Assim ele vai sozinho para o Sinric Pro e aparece na Alexa.' },
    ],
  },
  {
    id: 'botoes', icone: Hand, titulo: 'Gravar os botões do controle (essencial)',
    resumo: 'Sem isso o ar não liga nem desliga por aqui, pela Alexa ou pelo celular.',
    passos: [
      { t: 'Abra o aparelho → Botões gravados', d: 'O Mac precisa estar ligado e na mesma rede do transmissor.', link: ['/aparelhos', 'Abrir Aparelhos'] },
      { t: 'Comece pelo Desligar', d: 'Clique em Gravar na linha “Desligar”. Quando aparecer “Aguardando o sinal” (30 s), aponte o controle para o transmissor a 10–20 cm e aperte desligar uma vez.' },
      { t: 'Grave as temperaturas que você usa', d: 'Na grade Frio, clique numa temperatura (ex.: 23°). Antes, deixe o controle original em frio, 23°, ventilação automática. Clique em Começar a gravar, aponte e aperte qualquer botão (ex.: a seta e volte para 23°).' },
      { t: 'Repita para 3 a 5 temperaturas', d: 'Ex.: 20°, 22°, 23°, 24°, 25°. Se pedir uma não gravada, o sistema usa a mais próxima do mesmo modo e avisa.' },
      { t: 'Outros botões (swing, turbo, luz)', d: 'Gravar botão → Outro botão. Aparecem em “Outros botões” na aba Controle.' },
      { t: 'Teste', d: 'Clique em Desligar e Ligar na tela do aparelho e veja o ar responder.' },
    ],
  },
  {
    id: 'remoto', icone: Cloud, titulo: 'Usar no dia a dia e desligar de longe',
    resumo: 'Painel, cenas, agenda, automações e o controle remoto pela internet.',
    passos: [
      { t: 'Desligar o ar de qualquer lugar', d: 'Pelo painel (app.zynio.com.br), pelo app do celular ou “Alexa, desligar o ar do escritório”. Funciona fora do escritório porque o comando vai pela internet até o Mac de lá. Precisa de: Mac ligado com o agente, transmissor online e o botão Desligar gravado.', link: ['/', 'Abrir o Painel'] },
      { t: 'Desligar daqui a X tempo', d: 'Na tela do aparelho: Desligar automaticamente (30 min, 1 h, 2 h…).' },
      { t: 'Cenas: vários ares com um toque', d: 'Ex.: “Fim do expediente” desliga todos.', link: ['/cenas', 'Abrir Cenas'] },
      { t: 'Agenda: horários fixos', d: 'Ex.: seg a sex, 18:30, desligar todos.', link: ['/agendamentos', 'Abrir Agenda'] },
      { t: 'Automações: regras', d: 'Ex.: quando o ar ligar fora do horário, desligar depois de 2 h.', link: ['/automacoes', 'Abrir Automações'] },
    ],
  },
  {
    id: 'sinric', icone: KeyRound, titulo: 'Sinric Pro: a ponte para a Alexa',
    resumo: 'Conta, credenciais e criação dos ares no Sinric.',
    passos: [
      { t: 'Crie a conta em portal.sinric.pro', d: 'Ou entre na que já existe. Plano gratuito: até 3 aparelhos.' },
      { t: 'Copie as credenciais', d: 'Menu Credenciais: em “Suas chaves de API” copie a Chave API; em “Suas chaves e senhas dos Apps” copie a Chave do App e a Senha do App da mesma linha.' },
      { t: 'Cole em Alexa e Google', d: 'Cole as três, clique em Salvar credenciais e deixe Ativo e Criar automaticamente ligados. Em até 30 s o status fica “Conectado”.', link: ['/integracoes', 'Abrir Alexa e Google'] },
      { t: 'Ares que já existiam', d: 'Em “Aparelhos ainda fora da Alexa”, clique em Criar no Sinric.' },
      { t: 'Criou um aparelho à mão no portal?', d: 'Use o tipo “Window AC Unit” e a mesma Chave do App. Depois, em Dispositivos no Sinric Pro → Carregar, diga a qual ar ele corresponde.' },
    ],
  },
  {
    id: 'alexa', icone: Speaker, titulo: 'Colocar na Alexa (primeira vez)',
    resumo: 'Ativar a skill Sinric Pro no app Amazon Alexa.',
    passos: [
      { t: 'Abra a skill', d: 'Em Alexa e Google, escaneie o QR Code com o celular, ou no app Alexa: Mais → Skills e jogos → busque “Sinric Pro”.', link: ['/integracoes', 'Ver o QR Code'] },
      { t: 'Ativar para uso', d: 'Entre com a mesma conta do portal Sinric e autorize.' },
      { t: 'Descobrir', d: 'Os ares aparecem sozinhos. Se não aparecerem em 1 minuto: “Alexa, descobrir dispositivos”.' },
      { t: 'Teste', d: '“Alexa, desligar o ar do escritório.” Se ela disser que o dispositivo não responde, veja o capítulo de problemas.' },
    ],
  },
  {
    id: 'outra-alexa', icone: Users, titulo: 'Integrar outra Alexa',
    resumo: 'Outra conta Amazon, outro Echo ou trocar de conta.',
    passos: [
      { t: 'Outra conta Amazon (outra pessoa, outro Echo)', d: 'No celular com o app Alexa dessa conta, ative a skill Sinric Pro e entre com a MESMA conta do Sinric. As duas Alexas passam a controlar os mesmos ares. A Amazon exige que o dono de cada conta Alexa faça essa autorização.' },
      { t: 'Só mais um Echo na mesma conta Amazon', d: 'Não precisa fazer nada: todo Echo da conta já enxerga os ares.' },
      { t: 'Trocar a conta do Sinric', d: 'Cole as credenciais da conta nova em Alexa e Google. O sistema cria os ares na conta nova; depois ative a skill com ela em cada Alexa. Na conta antiga, desative a skill.' },
      { t: 'Confira se vai funcionar antes', d: 'Em Alexa e Google, o cartão “Trocar ou adicionar Alexa” verifica credenciais, agente, conexão, aparelhos, limite do plano, nomes repetidos e botões gravados. Com “Começar teste”, fale um comando no Echo novo e a tela avisa quando chegar.', link: ['/integracoes', 'Abrir o diagnóstico'] },
    ],
  },
  {
    id: 'voz', icone: Mic, titulo: 'Comandos de voz e rotinas da Alexa',
    resumo: 'O que falar e como criar frases suas.',
    passos: [
      { t: 'Comandos prontos', d: '“Alexa, ligar/desligar o ar do escritório” · “…colocar em 23 graus” · “…aumentar/diminuir a temperatura” · “…colocar no modo frio” · “…velocidade em 2”. A tela Comandos de voz lista todos, com botão de copiar.', link: ['/comandos-alexa', 'Abrir Comandos de voz'] },
      { t: 'Rotina com frase sua', d: 'App Alexa → Mais → Rotinas → + → Quando: Voz (ex.: “bom dia escritório”) → Adicionar ação → Casa inteligente → escolha o ar. Pode ter vários ares, espera entre eles e até música.' },
      { t: 'Rotina por horário ou localização', d: 'A rotina também começa por horário, nascer/pôr do sol, chegada/saída (localização do celular) ou alarme.' },
    ],
  },
  {
    id: 'google', icone: Home, titulo: 'Google Home',
    resumo: 'Mesmo Sinric, outro assistente.',
    passos: [
      { t: 'No app Google Home', d: '+ → Configurar dispositivo → Funciona com o Google → busque “Sinric Pro” → entre com a mesma conta do Sinric. Os mesmos ares aparecem.' },
    ],
  },
  {
    id: 'mapa', icone: MapaIcone, titulo: 'Mapa do escritório',
    resumo: 'Planta, 3D, loja, cores, equipe, persianas e escrita nos vidros.',
    passos: [
      { t: 'Editar a planta', d: 'Mapa → Editar planta: arraste salas, ares e móveis; clique num item para posição exata (X, Y, largura, giro), cor e modelo. Salvar planta grava tudo.', link: ['/mapa', 'Abrir o Mapa'] },
      { t: 'Loja', d: 'Botão Loja: rack, roteador, TV, impressora, Alexa, quadro, ventilador, móveis… escolha modelo e cor e coloque na planta. Os itens são só do mapa (não compram nem conectam aparelhos).' },
      { t: 'Cores sem entrar na edição', d: 'No 3D, clique num móvel, porta ou dispositivo e escolha a cor (ou qualquer cor no seletor). Para o ar: clique nele → Aparência no 3D; vale para o mapa e para o painel.' },
      { t: 'Equipe', d: 'Cadastre cada pessoa com nome, cargo, posto e expediente. O avatar aparece com nome e cargo durante o expediente (horário de Brasília).' },
      { t: 'Persianas e escrita', d: 'Clique numa janela para abrir/fechar a persiana. Administradores usam “Escrever no vidro” com caneta azul, preta ou vermelha.' },
      { t: 'Andar pelo escritório', d: 'Clique numa pessoa → 1ª ou 3ª pessoa. W A S D andam, arrastar olha, Shift corre, V troca a câmera, Esc sai.' },
    ],
  },
  {
    id: 'musica', icone: Music2, titulo: 'Música com Spotify',
    resumo: 'Conectar o Spotify, tocar nos Echo e criar rotinas.',
    passos: [
      { t: 'Crie o app no Spotify for Developers', d: 'developer.spotify.com/dashboard → Create app → Redirect URI: https://app.zynio.com.br/musica → marque Web API. Em User Management, adicione o e-mail da conta que vai tocar.' },
      { t: 'Cole o Client ID e o Client Secret em Música', d: 'O segredo fica cifrado. Depois clique em Conectar com o Spotify e autorize.', link: ['/musica', 'Abrir Música'] },
      { t: 'Vincule o Spotify na Alexa', d: 'App Alexa → Mais → Configurações → Música e podcasts → Vincular novo serviço → Spotify. Os Echo passam a aparecer como aparelhos em Música.' },
      { t: 'Crie rotinas', d: 'Por horário (ex.: seg a sex 08:30 tocar a playlist do escritório a 25%) ou junto com os ares (ex.: quando o ar da reunião ligar, pausar). Elas rodam no agente do Mac.' },
      { t: 'Premium', d: 'O Spotify só deixa controlar a reprodução (tocar, pausar, volume) com conta Premium.' },
    ],
  },
  {
    id: 'problemas', icone: CircleHelp, titulo: 'Quando algo não funciona',
    resumo: 'Os problemas mais comuns e o que fazer.',
    tabela: [
      ['O ar não reage', 'O botão daquele ajuste foi gravado? O transmissor está online? Tem visão direta do ar? O agente do Mac está online? O Painel mostra um aviso amarelo com o motivo.'],
      ['“Nenhum botão gravado para o modo…”', 'Grave pelo menos uma temperatura nesse modo (capítulo Gravar os botões).'],
      ['A gravação não recebe o sinal', 'Controle a 10–20 cm do transmissor, pilhas boas, aperte depois que a contagem começar; o Mac precisa estar na mesma rede.'],
      ['Transmissor offline', 'Está na tomada? Mesma rede 2,4 GHz do Mac? Use Reconectar agora. Se trocou o Wi-Fi, pareie de novo no Smart Life.'],
      ['Alexa: “o dispositivo não está respondendo”', 'Agente do Mac offline, transmissor offline ou botão não gravado. Veja o Painel e a Atividade.'],
      ['Aparelho não aparece na Alexa', 'Ele está “Disponível na Alexa” e criado no Sinric? Diga “Alexa, descobrir dispositivos”.'],
      ['Portal do Sinric: “signature mismatched”', 'O aparelho foi criado com outra credencial: recrie com a mesma Chave do App.'],
      ['Limite no Sinric', 'Plano gratuito tem 3 aparelhos. Remova os que não usa ou assine um plano.'],
      ['Spotify: “Nenhum aparelho ativo”', 'Abra o Spotify em algum aparelho ou peça “Alexa, toque Spotify” para o Echo aparecer.'],
      ['O painel mostra ligado, mas o ar está desligado', 'Alguém usou o controle original. Envie o comando de novo.'],
    ],
  },
]

const CHAVE = 'clima-guia-feito'
const lerFeitos = () => { try { return new Set(JSON.parse(localStorage.getItem(CHAVE) || '[]')) } catch { return new Set() } }

export default function Guia() {
  const [feitos, setFeitos] = useState(lerFeitos)
  const [busca, setBusca] = useState('')
  const [ativo, setAtivo] = useState(CAPITULOS[0].id)
  const alternar = (k) => setFeitos((s) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); try { localStorage.setItem(CHAVE, JSON.stringify([...n])) } catch { /* sem armazenamento */ } return n })
  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase()
    if (!q) return CAPITULOS
    return CAPITULOS.map((c) => ({ ...c, passos: (c.passos || []).filter((p) => `${p.t} ${p.d}`.toLowerCase().includes(q)), tabela: (c.tabela || []).filter((l) => l.join(' ').toLowerCase().includes(q)), _titulo: `${c.titulo} ${c.resumo}`.toLowerCase().includes(q) }))
      .filter((c) => c._titulo || c.passos.length || c.tabela.length)
  }, [busca])
  const total = CAPITULOS.reduce((s, c) => s + (c.passos?.length || 0), 0)
  const feitosN = [...feitos].filter((k) => CAPITULOS.some((c) => (c.passos || []).some((_, i) => `${c.id}:${i}` === k))).length
  useEffect(() => {
    const io = new IntersectionObserver((ent) => { const v = ent.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0]; if (v) setAtivo(v.target.id) }, { rootMargin: '-15% 0px -70% 0px' })
    document.querySelectorAll('[data-capitulo]').forEach((el) => io.observe(el))
    return () => io.disconnect()
  }, [filtrados])
  const ir = (id) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })

  return (
    <div>
      <Cabecalho titulo="Passo a passo" descricao="Do transmissor no Wi-Fi até a Alexa, outra Alexa, o Sinric Pro, o Smart Life, o mapa e a música. Marque cada passo conforme for fazendo."
        acoes={<button onClick={() => window.print()} className="inline-flex h-10 items-center gap-2 rounded-lg border border-border px-4 text-sm font-medium hover:bg-muted print:hidden"><Printer className="h-4 w-4" />Imprimir</button>} />
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center print:hidden">
        <label className="relative flex-1"><Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" /><input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar no guia (ex.: outra Alexa, Wi-Fi, Spotify)" className="campo h-10 pl-9" aria-label="Buscar no guia" /></label>
        <div className="flex items-center gap-3 text-sm">
          <div className="h-2 w-40 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${(feitosN / total) * 100}%` }} /></div>
          <span className="tabular text-muted-foreground">{feitosN} de {total} passos</span>
        </div>
      </div>
      <select value={ativo} onChange={(e) => ir(e.target.value)} className="campo mb-4 h-10 lg:hidden print:hidden" aria-label="Ir para o capítulo">
        {CAPITULOS.map((c, i) => <option key={c.id} value={c.id}>{i + 1}. {c.titulo}</option>)}
      </select>
      <div className="grid gap-8 lg:grid-cols-[230px_1fr]">
        <nav className="sticky top-20 hidden max-h-[calc(100vh-6rem)] self-start overflow-auto lg:block print:hidden" aria-label="Capítulos">
          <ol className="space-y-0.5 text-sm">
            {CAPITULOS.map((c, i) => {
              const n = (c.passos || []).length, f = (c.passos || []).filter((_, k) => feitos.has(`${c.id}:${k}`)).length
              return (
                <li key={c.id}><button onClick={() => ir(c.id)} className={`flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left ${ativo === c.id ? 'bg-muted font-medium' : 'text-muted-foreground hover:text-foreground'}`}>
                  <span className="w-5 shrink-0 tabular text-xs">{i + 1}.</span><span className="flex-1 truncate">{c.titulo}</span>{n > 0 && f === n && <Check className="h-3.5 w-3.5 text-emerald-500" />}
                </button></li>
              )
            })}
          </ol>
        </nav>
        <div className="min-w-0 space-y-8">
          {!filtrados.length && <p className="text-sm text-muted-foreground">Nada encontrado para “{busca}”.</p>}
          {filtrados.map((c) => {
            const I = c.icone, idx = CAPITULOS.findIndex((x) => x.id === c.id)
            return (
              <section key={c.id} id={c.id} data-capitulo className="scroll-mt-20 break-inside-avoid">
                <div className="mb-3 flex items-start gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border"><I className="h-4 w-4" /></span>
                  <div><h2 className="text-lg font-semibold">{idx + 1}. {c.titulo}</h2><p className="text-sm text-muted-foreground">{c.resumo}</p></div>
                </div>
                {c.fluxo && (
                  <ol className="mb-4 flex flex-wrap items-center gap-1.5 text-xs">
                    {c.fluxo.map((f, i) => <li key={f} className="flex items-center gap-1.5"><span className="rounded-md border border-border bg-card px-2 py-1">{f}</span>{i < c.fluxo.length - 1 && <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />}</li>)}
                  </ol>
                )}
                {c.passos?.length > 0 && (
                  <ol className="cartao divide-y divide-border">
                    {c.passos.map((p) => {
                      const i = CAPITULOS[idx].passos.indexOf(p), k = `${c.id}:${i}`, feito = feitos.has(k)
                      return (
                        <li key={k} className="flex gap-3 px-4 py-3">
                          <button onClick={() => alternar(k)} aria-pressed={feito} aria-label={feito ? `Desmarcar: ${p.t}` : `Marcar como feito: ${p.t}`}
                            className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-[11px] font-semibold tabular ${feito ? 'border-transparent bg-emerald-500 text-white' : 'border-border text-muted-foreground hover:bg-muted'}`}>{feito ? <Check className="h-3.5 w-3.5" /> : i + 1}</button>
                          <div className="min-w-0 flex-1">
                            <p className={`text-sm font-medium ${feito ? 'text-muted-foreground line-through' : ''}`}>{p.t}</p>
                            <p className="mt-0.5 text-sm text-muted-foreground">{p.d}</p>
                            {p.link && <Link to={p.link[0]} className="mt-1.5 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline print:hidden">{p.link[1]}<ArrowRight className="h-3 w-3" /></Link>}
                          </div>
                        </li>
                      )
                    })}
                  </ol>
                )}
                {c.tabela?.length > 0 && (
                  <div className="cartao overflow-hidden">
                    <table className="w-full text-sm"><thead className="bg-muted/50 text-left text-xs text-muted-foreground"><tr><th className="px-4 py-2 font-medium">Problema</th><th className="px-4 py-2 font-medium">O que fazer</th></tr></thead>
                      <tbody className="divide-y divide-border">{c.tabela.map(([a, b]) => <tr key={a}><td className="w-2/5 px-4 py-2.5 align-top font-medium">{a}</td><td className="px-4 py-2.5 text-muted-foreground">{b}</td></tr>)}</tbody></table>
                  </div>
                )}
                {c.dicas?.map((d) => <p key={d} className="mt-3 rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">{d}</p>)}
              </section>
            )
          })}
          <p className="flex items-center gap-2 text-xs text-muted-foreground"><BookOpen className="h-3.5 w-3.5" />O manual completo também está em docs/MANUAL.md no repositório.</p>
        </div>
      </div>
    </div>
  )
}
