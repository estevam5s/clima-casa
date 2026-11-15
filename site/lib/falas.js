import { MARCA } from './dados.js'

// Falas do vídeo explicativo (legendas e narração). Mudou o texto? Rode `node scripts/gerar-narracao.mjs`.
export const VOZ = { id: '5497e90cdf4440ce9a92b5a5cd393422', nome: 'Narrador de trailer (Fish Audio, voz original)', modelo: 's2.1-pro-free' }
export const FALAS = {
  problema: 'Ar-condicionado split comum não tem Wi-Fi. Ele só obedece ao controle remoto, e alguém precisa estar na sala para ligar.',
  gravar: 'Um transmissor infravermelho Wi-Fi aprende os botões do controle original. Você grava cada botão uma vez, pelo sistema.',
  comandar: 'Depois é só comandar: pelo painel, pelo celular, pelo computador ou pela voz, com a Alexa e o Google.',
  caminho: 'O comando passa pela nuvem, o agente no escritório recebe em cerca de um segundo e o transmissor envia o sinal para o ar.',
  automatizar: 'Com a agenda e as automações, o ar liga antes de a equipe chegar e desliga sozinho no fim do expediente.',
  acompanhar: 'Relatórios mostram horas ligado, consumo e custo de cada aparelho, e a tela de segurança mostra quem acessa e bloqueia ataques.',
  comecar: `Esse é o ${MARCA}. Entre no sistema ou baixe os apps para começar.`,
}
