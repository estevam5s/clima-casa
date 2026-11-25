import { useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { Link } from 'react-router-dom'
import { ListTodo, AirVent, ArrowRight, Bell, Bot, Bug, Cpu, Crown, PersonStanding, Send, ShieldCheck, BookOpen, Check, CircleHelp, Cloud, DoorClosed, Globe, Hand, Home, KeyRound, Link2, ListChecks, Lightbulb, Map as MapaIcone, Mic, Monitor, Music2, FileDown, Printer, Radio, Search, Smartphone, Speaker, Users, Wifi, Workflow } from 'lucide-react'
import { api } from '../api'
import { Botao, Cabecalho, useToast } from '../components/ui'

// Passo a passo do sistema inteiro: do transmissor no Wi-Fi (Smart Life) até a Alexa (Sinric Pro), outra Alexa,
// Google, mapa e música. Cada passo pode ser marcado como feito (fica salvo neste navegador).
const CAPITULOS = [
  {
    id: 'como-funciona', icone: Workflow, titulo: 'Como o sistema funciona',
    resumo: 'As cinco peças e o caminho que um comando faz até o ar-condicionado.',
    fluxo: ['Você: painel, app ou “Alexa, desligar o ar”', 'Clima Escritório (internet)', 'Agente do escritório (Mac, PC ou Raspberry Pi)', 'Transmissor Smart IR', 'Luz infravermelha', 'Ar-condicionado'],
    passos: [
      { t: 'Transmissor infravermelho “Smart IR” (SRW-004)', d: 'Fica no mesmo cômodo do ar, na tomada, e “aperta os botões” do controle remoto por você.' },
      { t: 'App Smart Life (celular)', d: 'Serve para colocar o transmissor no Wi-Fi e para o sistema buscar a chave de segurança dele.' },
      { t: 'Agente do escritório', d: 'Programa que roda sozinho num computador da rede do escritório: Mac, PC com Windows, Linux ou um Raspberry Pi ligado 24 horas. Conversa com o transmissor pela rede local, roda a agenda, as automações, as rotinas de música e mantém a Alexa conectada. Pode haver vários: um fica no comando e os outros esperam.' },
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
      { t: 'Um computador do escritório ligado, na mesma rede do transmissor', d: 'Mac, PC ou Raspberry Pi com o agente. No Mac: Ajustes do Sistema → Bateria/Energia → impedir o repouso automático quando conectado à energia. O Raspberry Pi já vem preparado para ficar ligado direto.' },
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
      { t: 'Confira o ponto verde (online)', d: 'Se estiver cinza, clique em Reconectar agora. Ainda offline? Confira se ele está na tomada e na mesma rede do agente. Procurar na rede mostra o que o agente enxerga.' },
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
      { t: 'Abra o aparelho → Botões gravados', d: 'Um computador com o agente precisa estar ligado na rede do escritório (Infra → Agentes: “enxerga” os transmissores).', link: ['/aparelhos', 'Abrir Aparelhos'] },
      { t: 'O que vale é o visor do controle', d: 'O controle de ar guarda o estado e, a cada botão, manda tudo junto (ligado ou desligado, modo, temperatura, ventilação). O ar pode estar ligado ou desligado: o que importa é o que o visor do controle mostra.' },
      { t: 'Comece pelo Desligar', d: 'Deixe o visor do controle aceso (ligado). Clique em Gravar → Desligar → Começar a gravar e, em até 30 s, aperte uma vez o liga/desliga a 10–20 cm do transmissor. Ar Gree: só isso basta; depois use Controle Gree → Gerar.' },
      { t: 'Grave as temperaturas que você usa', d: 'Para gravar Frio 23°: deixe o controle ligado em frio 24°, escolha Frio 23° na tela, clique em Começar a gravar e aperte a seta de baixar uma vez. O controle manda o ajuste completo já em 23°.' },
      { t: 'Repita para 3 a 5 temperaturas', d: 'Ex.: 20°, 22°, 23°, 24°, 25°. Se pedir uma não gravada, o sistema usa a mais próxima do mesmo modo e avisa.' },
      { t: 'Outros botões (swing, turbo, luz)', d: 'Gravar botão → Outro botão. Aparecem em “Outros botões” na aba Controle.' },
      { t: 'Teste', d: 'Clique em Desligar e Ligar na tela do aparelho e veja o ar responder.' },
    ],
  },
  {
    id: 'remoto', icone: Cloud, titulo: 'Usar no dia a dia e desligar de longe',
    resumo: 'Painel, cenas, agenda, automações e o controle remoto pela internet.',
    passos: [
      { t: 'Desligar o ar de qualquer lugar', d: 'Pelo painel (app.zynio.com.br), pelo app do celular ou “Alexa, desligar o ar do escritório”. Funciona fora do escritório porque o comando vai pela internet até o agente de lá. Precisa de: um agente ligado no escritório, transmissor online e o botão Desligar gravado.', link: ['/', 'Abrir o Painel'] },
      { t: 'Desligar daqui a X tempo', d: 'Na tela do aparelho: Desligar automaticamente (30 min, 1 h, 2 h…).' },
      { t: 'Cenas: vários ares com um toque', d: 'Ex.: “Fim do expediente” desliga todos.', link: ['/cenas', 'Abrir Cenas'] },
      { t: 'Agenda: horários fixos', d: 'Ex.: seg a sex, 18:30, desligar todos.', link: ['/agendamentos', 'Abrir Agenda'] },
      { t: 'Automações: regras', d: 'Ex.: quando o ar ligar fora do horário, desligar depois de 2 h.', link: ['/automacoes', 'Abrir Automações'] },
    ],
  },
  {
    id: 'windows', icone: Monitor, titulo: 'Agente em outro computador (Windows, Mac, Linux, Raspberry Pi, Docker)',
    resumo: 'Um PC que fica no escritório assume os comandos quando o Mac vai embora, sem perder nada.',
    passos: [
      { t: 'Por que precisa', d: 'O transmissor só recebe comandos pela rede do escritório. Quem manda é o agente, que precisa estar num computador ligado LÁ. O Windows de casa não serve para isso; um PC que fica no escritório, sim.' },
      { t: 'Escolha o PC do escritório', d: 'Um computador de 64 bits que fique sempre ligado, na mesma rede do transmissor: PC ou servidor Windows, Mac, Linux (Debian, Ubuntu, Fedora, RHEL, openSUSE, Arch), Raspberry Pi 3B, 4 ou 5 com o sistema de 64 bits ou um servidor Linux com Docker. Em Infra → Agentes, gere o código e escolha a aba do seu computador: cada uma mostra o comando. A rede precisa liberar a saída HTTPS (443) e a porta 6543 do banco; o quadro da tela diz o que pedir à TI. Arduino, ESP32 e ESP8266 não rodam o agente.' },
      { t: 'Gere o código de instalação', d: 'No painel: Infra → Agentes → “Gerar código de instalação” (só o dono). Vale 30 minutos e serve uma vez. As chaves do sistema vão cifradas: só o código decifra, lá no PC.', link: ['/infra', 'Abrir Infra'] },
      { t: 'Cole o comando no PC, como administrador', d: 'No PC do escritório: menu Iniciar → PowerShell → botão direito → Executar como administrador. Copie o comando que o painel mostra e cole. Ele baixa o sistema, instala o Python, recebe as chaves e cria o serviço que liga junto com o Windows (não precisa ninguém logado). Leva de 3 a 8 minutos.' },
      { t: 'Deixe a rede como Privada', d: 'Configurações do Windows → Rede e Internet → propriedades do Wi-Fi → Perfil de rede: Privada. Em rede Pública o Windows bloqueia a busca do transmissor.' },
      { t: 'Escolha quem fica no comando', d: 'Infra → Agentes mostra os computadores e quantos transmissores cada um enxerga. “Preferir este” deixa um no comando (dono ou admin). Quem não enxerga os transmissores passa o comando sozinho para quem enxerga, e o preferido retoma quando volta ao escritório.' },
      { t: 'Vá para casa', d: 'Feche o Mac e leve. O PC assume sozinho em até 1 minuto (o Mac fora do escritório não enxerga os transmissores e passa o comando). Aparelhos, botões gravados, Alexa, agenda, automações e música continuam iguais: tudo fica no banco (Supabase), não no computador.' },
      { t: 'Em casa, no Windows', d: 'Use o painel no navegador (app.zynio.com.br) ou o app de Windows (Baixar apps). Ligar, desligar e o resto funcionam porque o PC do escritório está no comando.' },
      { t: 'Manutenção', d: 'Atualizar o PC: gere um código novo e rode o mesmo comando. Ver se está rodando: C:\\ClimaEscritorio\\ar-controle\\instalar-windows.ps1 status. Sem internet no PC: copie a pasta e o .env por pendrive e rode o instalar-windows.ps1. Linux/Raspberry Pi: sudo ./instalar-linux.sh.' },
    ],
    dicas: ['Os dois podem ficar instalados para sempre: só um é o principal por vez, e o outro assume se ele sumir. Não dá conflito.'],
  },
  {
    id: 'varios-ares', icone: Radio, titulo: 'Um transmissor para vários ares (salão aberto e zonas)',
    resumo: 'Um transmissor no teto atende até ~6 ares à vista. Ares do mesmo modelo obedecem juntos: o sistema trata o grupo como uma zona, no painel e na Alexa.',
    passos: [
      { t: 'Onde colocar o transmissor', d: 'No teto ou no alto da parede, no meio do ambiente, com visão direta do receptor de cada ar (o cantinho do painel do ar onde você aponta o controle). Alcance bom: até 8 a 10 metros. Infravermelho não atravessa parede, divisória, porta fechada nem luminária: um ar em outra sala precisa do próprio transmissor.' },
      { t: 'Cadastre cada ar no mesmo transmissor', d: 'Transmissores → no cartão do transmissor, “Adicionar ar a este transmissor”. O transmissor e o projeto já vêm escolhidos; dê um nome que você falaria para a Alexa (ex.: “Ar da janela”). Um ar pode ser de outro projeto e usar o mesmo transmissor.', link: ['/transmissores', 'Abrir Transmissores'] },
      { t: 'Botões do primeiro ar', d: 'Grave o Desligar dele (Aparelhos → o ar → Botões gravados → Desligar). Se o controle for Gree, use “Controle Gree: gerar todos os botões”: Conferir, Testar (o ar tem que apitar e ir para 24°) e Gerar. Se não for Gree, grave à mão os ajustes mais usados.' },
      { t: 'Ares do mesmo modelo: copie', d: 'No segundo ar, em Botões gravados → “Copiar de outro ar”, escolha o primeiro. Mesmo controle remoto = mesmos sinais, não precisa gravar de novo.' },
      { t: 'Entenda: ares iguais obedecem juntos (zona)', d: 'O sinal infravermelho não tem endereço. Ares do mesmo modelo à vista do mesmo transmissor recebem o mesmo sinal e mudam todos juntos: mandar ligar o do Diretor liga os cinco do salão. Nenhum software separa isso. O sistema trata o grupo como uma ZONA: no cartão do transmissor aparece "Ligar zona", "Desligar zona" e a temperatura da zona, e o painel, o mapa e a Alexa mostram todos os ares da zona mudando.' },
      { t: 'Confirme com o teste de interferência', d: 'Transmissores → no cartão, "Testar interferência". Com alguém no salão, o sistema manda o sinal de um ar por vez e você marca quais apitaram. Ao gravar, as zonas passam a seguir o que aconteceu de verdade (um ar longe ou atrás de parede sai da zona).', link: ['/transmissores', 'Abrir Transmissores'] },
      { t: 'Zona na Alexa', d: 'Integrações → "Zonas na Alexa" → "Organizar na Alexa": a zona vira UM aparelho com um nome só (ex.: "Ar do salão"). A tela mostra antes o que muda no Sinric e pede confirmação. Cada zona gasta um dispositivo do Sinric (a conta comporta 9).', link: ['/integracoes', 'Abrir Integrações'] },
      { t: 'Um transmissor só para instalar sala por sala', d: 'No cartão do transmissor, “Levar para o próximo ar”: escolha o ar (ou cadastre um novo, com a sala), toque em “Levar o transmissor para este ar” e ele passa a atender SÓ esse ar. O ar anterior fica sem transmissor, com os botões guardados, e nenhum comando sai para ele por engano (não há interferência). Depois copie os botões de um ar igual (Gree) ou grave, teste (Ligar Frio 24° e Desligar, sem mudar o estado salvo) e vá para o “Próximo ar”.', link: ['/transmissores', 'Abrir Transmissores'] },
      { t: 'Levou o transmissor para outro lugar?', d: 'No cartão do transmissor, "Ares deste transmissor (planejar ou mover)": desmarque os ares que ficaram para trás. Eles ficam sem transmissor (os botões continuam salvos) e nenhum comando sai para eles por engano. Um ar sem transmissor só volta a obedecer quando um transmissor for instalado na sala dele.' },
      { t: 'Ligar ou desligar todos de uma vez', d: 'No cartão do transmissor, “Ligar todos” e “Desligar todos” mandam um ar por vez (cerca de 1 segundo entre eles), porque o transmissor só manda um sinal de cada vez. Quem respondeu junto não recebe o sinal de novo.' },
      { t: 'Teste com alguém olhando os ares', d: 'Mande Ligar para um ar e veja se só ele (ou o grupo esperado) apitou. Depois Desligar. Se um ar não reage, mude a posição do transmissor ou aproxime-o.' },
    ],
    dicas: ['Recomendado: até 6 ares por transmissor num salão aberto. Acima disso, a tela avisa para conferir se todos estão à vista.', 'Para comandar um ar sozinho num salão com ares iguais, só um transmissor dedicado, colado no ar e virado para ele; mesmo assim o sinal pode refletir no teto. O teste de interferência mostra se funcionou.', 'Modelos diferentes no mesmo ambiente funcionam separados no mesmo transmissor, porque cada um só entende o sinal do próprio controle.', 'Cenas e automações funcionam igual: cada ar segue o próprio estado.'],
  },
  {
    id: 'sala-transmissor', icone: DoorClosed, titulo: 'Um transmissor por sala (sem um ar mexer no outro)',
    resumo: 'Infravermelho não tem endereço: sala fechada que deve obedecer sozinha precisa do seu transmissor.',
    passos: [
      { t: 'Por que', d: 'O transmissor manda o sinal para todo lado. Ares iguais (mesmo modelo) que o sinal alcança obedecem juntos, e parede ou porta fechada bloqueia o sinal. Tirar um ar da zona na tela não separa os ares de verdade.' },
      { t: 'Veja como está', d: 'Transmissores → Salas e transmissores mostra cada sala com transmissor próprio, dividindo com outra ou sem nenhum. Em Projetos, cada cartão tem o mesmo selo.', link: ['/transmissores', 'Abrir Transmissores'] },
      { t: 'Pareie o transmissor novo', d: 'No Smart Life (Wi-Fi 2,4 GHz do escritório). Modelos só Bluetooth ou Zigbee não funcionam.' },
      { t: 'Importe escolhendo a sala', d: 'Transmissores → Importar um → escolha a sala onde ele vai ficar → Importar. O sistema descobre sozinho o protocolo certo do aparelho.' },
      { t: 'Ponha o ar da sala nele', d: 'No cartão do transmissor → Ares deste transmissor (ou no cadastro do ar, que sugere o transmissor da sala).' },
      { t: 'Confirme', d: 'Transmissores → Testar interferência, com alguém em cada sala: o sistema manda o sinal de um ar por vez e grava quem apitou.' },
      { t: 'Removeu por engano?', d: 'Importe o mesmo transmissor de novo em até 30 dias: ele volta com o nome, a sala e os ares de antes.' },
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
      { t: 'Andar pelo escritório', d: 'Clique numa pessoa → 1ª ou 3ª pessoa. W A S D andam, arrastar olha, Shift corre, V troca a câmera, F senta, Esc sai.' },
      { t: 'Tomar um café', d: 'Controlando a pessoa, vá até a cafeteira da copa e aperte C (ou o botão Café): ela faz o café e sai com a xícara. C de novo dá um gole; parada, ela bebe sozinha.' },
      { t: 'Sair do prédio e andar pela cidade', d: 'Perto da porta do elevador aperte R para descer ao térreo, passe pela porta automática e ande pelas ruas, calçadas, praças e pelo terminal. Os prédios e casas das quadras não deixam passar.' },
      { t: 'De noite', d: 'O botão Noite (ou a hora real) acende salas, corredor e copa. Com as luzes cadastradas em Iluminação, a sala com a lâmpada apagada fica escura no 3D.' },
      { t: 'O hall do andar', d: 'Do lado da porta de entrada, virados para a avenida: o elevador de três portas à esquerda da porta e a copa à direita. Do outro lado do corredor, em frente à copa, ficam os banheiros masculino, feminino e acessível, e no canto do andar a sala multiuso. O corredor tem a faixa escura no piso.' },
      { t: 'Qual elevador pegar', d: 'A primeira porta (à esquerda) atende só os andares pares; a do meio e a terceira, só os ímpares. Todas param no térreo. Perto das portas, R chama o carro que para no andar do escritório.' },
      { t: 'Café com tudo à mão', d: 'As cafeteiras ficam de frente para quem chega, com açúcar, cápsulas de vários sabores, xícaras e mexedores ao lado.' },
    ],
  },
  {
    id: 'musica', icone: Music2, titulo: 'Música com Spotify',
    resumo: 'Conectar o Spotify, tocar nos Echo e criar rotinas.',
    passos: [
      { t: 'Crie o app no Spotify for Developers', d: 'developer.spotify.com/dashboard → Create app → Redirect URI: https://app.zynio.com.br/musica → marque Web API. Em User Management, adicione o e-mail da conta que vai tocar.' },
      { t: 'Cole o Client ID e o Client Secret em Música', d: 'O segredo fica cifrado. Depois clique em Conectar com o Spotify e autorize.', link: ['/musica', 'Abrir Música'] },
      { t: 'Vincule o Spotify na Alexa', d: 'App Alexa → Mais → Configurações → Música e podcasts → Vincular novo serviço → Spotify. Os Echo passam a aparecer como aparelhos em Música.' },
      { t: 'Crie rotinas', d: 'Por horário (ex.: seg a sex 08:30 tocar a playlist do escritório a 25%) ou junto com os ares (ex.: quando o ar da reunião ligar, pausar). Elas rodam no agente do escritório.' },
      { t: 'Premium', d: 'O Spotify só deixa controlar a reprodução (tocar, pausar, volume) com conta Premium.' },
    ],
  },
  {
    id: 'dominio', icone: Globe, titulo: 'Domínio e e-mails do zynio.com.br',
    resumo: 'Cloudflare no painel: DNS, endereços @zynio.com.br, DNSSEC e anti-robô, pela tela Infra.',
    passos: [
      { t: 'Crie o token da Cloudflare (uma vez)', d: 'Em Infra → Cloudflare → Token está a lista exata de permissões. Crie o token em dash.cloudflare.com → My Profile → API Tokens, cole no arquivo .env do computador do agente (CLOUDFLARE_API_TOKEN=…) e atualize o agente. O token nunca vai para a nuvem.', link: ['/infra', 'Abrir Infra'] },
      { t: 'Confira a saúde do domínio', d: 'Infra → Visão geral confere ao vivo o site e o app na Vercel, os registros do Resend, o SPF, o DMARC, o recebimento de e-mails e o DNSSEC. Cada item que falha diz o que fazer.' },
      { t: 'Endereços de e-mail', d: 'Infra → Cloudflare → E-mails: crie endereços como comercial@zynio.com.br, ligue e desligue, escolha para onde encaminham e o que fazer com endereços desconhecidos (pega-tudo). Um destino novo precisa clicar no link de confirmação que a Cloudflare manda.' },
      { t: 'Responder como contato@', d: 'Os endereços só recebem. Para responder como contato@zynio.com.br, no Gmail: Configurações → Contas → Enviar e-mail como → servidor smtp.resend.com, porta 465, usuário resend, senha = chave do Resend.' },
      { t: 'Registros DNS', d: 'Infra → Cloudflare → DNS lista tudo com “serve para”. Os registros com cadeado sustentam o site, o app ou os e-mails: para mudar, o painel pede para digitar o nome. O proxy laranja fica bloqueado nos endereços da Vercel (quebraria o certificado).' },
      { t: 'DNSSEC (recomendado)', d: 'Infra → Cloudflare → Segurança → Ligar DNSSEC. Depois copie os quatro campos do DS e cole no Registro.br (domínio → DNSSEC). Só vale depois desse passo.' },
    ],
    dicas: ['Exportar zona (em DNS) baixa o arquivo com todos os registros: bom guardar uma cópia antes de mudanças grandes.', 'O tráfego do site não passa pela Cloudflare (tudo em “DNS only”); por isso não há cache, WAF ou gráficos de visitas lá: esses números ficam na aba Vercel.'],
  },
  {
    id: 'site', icone: Globe, titulo: 'Site: idiomas, acessos, SEO e newsletter',
    resumo: 'O site zynio.com.br em 6 idiomas, quem acessa o site e o sistema, o SEO das páginas e as campanhas de e-mail.',
    passos: [
      { t: 'Idiomas do site', d: 'Idiomas do site → Buscar textos do site (depois de cada publicação do site) → Traduzir com IA em cada idioma. Revise o que quiser: o que você corrige à mão a IA não muda mais. Desligar um idioma tira ele do seletor do site.', link: ['/idiomas', 'Abrir Idiomas do site'] },
      { t: 'Textos novos vistos no site', d: 'Mensagens que só aparecem depois de uma ação (por exemplo, ao enviar um formulário) chegam como "textos novos vistos no site". Inclua os que são do site e descarte o resto.' },
      { t: 'Acessos', d: 'Acessos e SEO mostra quem está online, visitantes, rotas e cliques mais usados, países e cidades, aparelhos e de onde vêm as visitas, para o site e para o sistema. Não guardamos IP nem o que se digita.', link: ['/analise', 'Abrir Acessos e SEO'] },
      { t: 'Desempenho e SEO', d: 'Desempenho mostra os Web Vitals medidos em quem usa (p75 por rota) e, no sistema, o tempo das chamadas da API. SEO → Auditar agora confere título, descrição, H1, imagens e idiomas de cada página; Medir chama o PageSpeed do Google.' },
      { t: 'Newsletter', d: 'E-mails → Newsletter: Nova campanha (ou Gerar com IA a partir das últimas versões), escolha o modelo, monte os blocos, veja a prévia no computador e no celular, mande um teste e envie ou agende. Só recebe quem confirmou a inscrição.', link: ['/emails?aba=newsletter', 'Abrir a Newsletter'] },
    ],
    dicas: ['Agendadas saem pelo agente do escritório: com nenhum agente ligado, a campanha espera.', 'O formulário Assinar do rodapé do site manda um e-mail de confirmação; sem o clique, a pessoa não entra na lista.'],
  },
  {
    id: 'luzes', icone: Lightbulb, titulo: 'Iluminação',
    resumo: 'Luzes de cada sala: acender, apagar, brilho, ao anoitecer e quando a porta é destrancada.',
    passos: [
      { t: 'Cadastre as luzes', d: 'Iluminação → Cadastrar uma luz por sala (ou Cadastrar luz). Sem aparelho conectado, nada é enviado.', link: ['/luzes', 'Abrir Iluminação'] },
      { t: 'Conecte o aparelho', d: 'Lâmpada, painel, fita de LED ou interruptor de parede da Smart Life (mesma conta), ou uma placa própria (Arduino/ESP com relé). No cartão da luz → Conectar.' },
      { t: 'Automações', d: 'Automações e histórico → Acender ao anoitecer (pelo pôr do sol real de cada dia, até a hora escolhida) e Acender quando a porta for destrancada à noite. Cada uma age uma vez por dia: se alguém apagar na mão, não acende de novo.' },
      { t: 'Horários fixos', d: 'Na mesma janela: acender, apagar ou mudar o brilho em horários e dias da semana.' },
    ],
  },
  {
    id: 'notificacoes', icone: Bell, titulo: 'Notificações e relatórios por e-mail',
    resumo: 'Central com histórico, filtros e ações em lote; relatório enviado por e-mail ao gerar.',
    passos: [
      { t: 'Central de notificações', d: 'Menu Notificações (com o contador): busca, filtros por tipo e período, arquivar e restaurar, marcar várias de uma vez e exportar CSV. O sino no topo continua para o dia a dia.', link: ['/notificacoes', 'Abrir Notificações'] },
      { t: 'Relatório por e-mail', d: 'Relatórios → Exportar: com “Ao baixar, enviar também para o meu e-mail” marcado, o arquivo vai anexo para o seu e-mail. “Só enviar por e-mail” manda o PDF sem baixar. Só vai para e-mails de usuários do sistema.', link: ['/relatorios', 'Abrir Relatórios'] },
      { t: 'Atalhos', d: 'Botão Atalhos no topo: áreas mais usadas a um clique e Backup agora (dono e administradores).' },
    ],
  },
  {
    id: 'raspberry', icone: Cpu, titulo: 'Raspberry Pi: agente ligado 24 horas',
    resumo: 'Um Raspberry Pi no escritório deixa os comandos funcionando dia e noite, mesmo com os computadores desligados.',
    passos: [
      { t: 'Preparar o cartão (no Mac do dono)', d: 'Com o cartão microSD no leitor, rode ./scripts/preparar-cartao-raspberry.sh: grava o Raspberry Pi OS Lite 64-bit, configura o Wi-Fi 2,4 GHz do escritório e deixa o agente para instalar sozinho.' },
      { t: 'Ligar no escritório', d: 'Cartão no Raspberry, fonte na tomada, perto do roteador. Em 10 a 20 minutos ele configura a rede, atualiza e instala o agente.' },
      { t: 'Torná-lo o principal', d: 'Infra → Agentes: o "clima-agente" aparece; clique em Preferir este. Ele precisa enxergar os transmissores.', link: ['/infra?aba=agentes', 'Abrir Agentes'] },
      { t: 'Já vem preparado para 24/7', d: 'Reinicia sozinho se travar (watchdog), Wi-Fi sem economia de energia, atualizações de segurança automáticas e registros com tamanho limitado.' },
      { t: 'Desligar um ar de longe', d: 'Com o Raspberry no comando, qualquer pessoa autorizada desliga os ares de qualquer lugar: painel, apps, Alexa, Telegram ou clima-ia.' },
    ],
  },
  {
    id: 'telegram', icone: Send, titulo: 'Bot do Telegram',
    resumo: 'Ares, cenas, luzes, notificações e resumo pelo Telegram, com as suas permissões.',
    passos: [
      { t: 'Vincular', d: 'Integrações → Telegram → Gerar código → Abrir no Telegram (o código vale 10 minutos e uma vez só).', link: ['/telegram', 'Abrir Telegram'] },
      { t: 'Usar', d: 'No @zynio_bot: /menu mostra o estado e os atalhos; Todos os comandos navega pelas 16 categorias (264 comandos). /usar NOME escolhe o ar atual e aí /23, /frio, /mais, /desligar agem nele. /buscar palavra acha um comando; /avisos sim recebe avisos importantes. Ou escreva normalmente: a IA entende.' },
      { t: 'Segurança', d: 'O bot só responde a quem vinculou o Telegram e age com as permissões da pessoa. Ações em lote pedem confirmação. Perdeu o celular? Desvincule na mesma tela.' },
    ],
  },
  {
    id: 'bugs', icone: Bug, titulo: 'Bugs: relatar e corrigir com IA',
    resumo: 'Relate o que não funciona; o sistema também encontra problemas sozinho e gera o prompt para a IA corrigir.',
    passos: [
      { t: 'Relatar', d: 'Bugs → Relatar bug: título, o que aconteceu e os passos. A tela, o navegador e os últimos erros vão junto, sem dados pessoais.', link: ['/bugs', 'Abrir Bugs'] },
      { t: 'O que o sistema encontra sozinho', d: 'Erros nas telas, erros internos do servidor, falhas repetidas na Atividade e na fila, rotas sem permissão, transmissor com problema e agente parado (procura de hora em hora).' },
      { t: 'Corrigir', d: 'Abra o bug, copie o "Prompt para a IA corrigir" e cole no clima-ia (terminal) ou no Claude Code, na pasta do projeto. Depois marque como Corrigido.' },
    ],
  },
  {
    id: 'tarefas', icone: ListTodo, titulo: 'Tarefas da equipe (e GitHub Projects)',
    resumo: 'Organize o trabalho em projetos, como no Asana: lista, quadro, calendário, cronograma e painel.',
    passos: [
      { t: 'Criar um projeto', d: 'Tarefas → Novo projeto: nome, cor e as seções iniciais (Quadro, Sprint, Correções ou Lista simples). As seções viram as colunas do quadro.', link: ['/tarefas', 'Abrir Tarefas'] },
      { t: 'Criar e organizar tarefas', d: 'Adicionar tarefa no fim de cada seção (Enter cria e já abre a próxima). Clique numa tarefa para dar responsável, prazo, prioridade, etiquetas, subtarefas e comentários. Arraste entre seções na Lista ou no Quadro.' },
      { t: 'Acompanhar', d: 'Minhas tarefas junta o que está com você (atrasadas, hoje, próximos 7 dias). Calendário e Cronograma usam o início e o prazo; o Painel mostra o que está aberto por seção, pessoa e prioridade.' },
      { t: 'GitHub Projects (opcional)', d: 'O dono conecta um token que só mexe em Projects (botão GitHub). Depois, ligue o projeto a um Project do GitHub e use Sincronizar: o Status de lá vira a seção daqui, e tarefa nova daqui vira rascunho lá. Apagar aqui não apaga lá.' },
    ],
  },
  {
    id: 'ia', icone: Bot, titulo: 'Agente de IA no terminal (clima-ia)',
    resumo: 'Converse com o sistema no terminal: estado dos ares, perguntas sobre o código e comandos com confirmação.',
    passos: [
      { t: 'Instalar', d: 'Na pasta do projeto: ./agente-ia/instalar.sh (precisa do .env com NVIDIA_API_KEY). Depois, em qualquer terminal: clima-ia.' },
      { t: 'Perguntar', d: 'Ex.: "quais ares estão ligados?", "por que o transmissor dos Devs falhou?", "onde fica a lógica do pôr do sol?". Ele consulta o estado real e o código.' },
      { t: 'Agir com confirmação', d: 'Ligar, desligar, executar cena, editar arquivo ou rodar comando: ele mostra o que vai fazer e só faz depois do seu "s".' },
      { t: 'Segurança', d: 'Segredos são mascarados antes de qualquer envio; ele não lê o .env nem as credenciais e o banco é só leitura.' },
    ],
  },
  {
    id: 'seg-relatorio', icone: ShieldCheck, titulo: 'Relatórios oficiais e por e-mail',
    resumo: 'Relatórios de uso e de segurança no modelo da Prefeitura, baixados ou enviados por e-mail.',
    passos: [
      { t: 'Relatório de uso', d: 'Relatórios → Exportar → modelo Prefeitura (brasão e cabeçalho oficial) ou Moderno.', link: ['/relatorios', 'Abrir Relatórios'] },
      { t: 'Relatório de segurança', d: 'Segurança → Relatório → modelo Prefeitura: postura, IPs, países, rotas atacadas, bloqueios e recomendações, com assinaturas.', link: ['/seguranca', 'Abrir Segurança'] },
      { t: 'Por e-mail', d: 'Deixe marcado "Ao baixar, enviar também para o meu e-mail" ou use "Só enviar por e-mail". Só vai para e-mails de usuários do sistema.' },
      { t: 'Este guia em PDF', d: 'No topo do Passo a passo: PDF (modelo da Prefeitura).' },
    ],
  },
  {
    id: 'uso', icone: Users, titulo: 'Usuários e uso do sistema',
    resumo: 'Quem tem acesso a quê e quanto tempo cada pessoa usa cada tela.',
    passos: [
      { t: 'Contas e acessos', d: 'Configurações → Usuários → Contas e acessos: crie contas, escolha o nível (dono, administrador, operador…), os projetos e os ares de cada pessoa. As permissões valem no servidor, não só na tela.', link: ['/configuracoes?aba=usuarios', 'Abrir Usuários'] },
      { t: 'Uso do sistema', d: 'Na mesma aba, Uso do sistema mostra em 7, 30 ou 90 dias: tempo de uso por dia, telas mais usadas, quem mais usa (clique na pessoa para ver as telas e os dias dela), os caminhos de uma tela para outra e o mapa de calor pessoa × tela.', link: ['/configuracoes?aba=usuarios&ver=uso', 'Abrir Uso do sistema'] },
      { t: 'Como o tempo é contado', d: 'Só com a aba do sistema visível e alguém mexendo: depois de 5 minutos parado, o relógio para. Não guarda nada do que foi digitado, só quanto tempo cada tela ficou aberta.' },
      { t: 'Os seus dados', d: 'Cada pessoa baixa uma cópia dos próprios dados (inclusive o tempo de uso) em Configurações → Segurança. Ao apagar uma conta, o tempo de uso dela é apagado junto.' },
    ],
  },
  {
    id: 'placa', icone: Cpu, titulo: 'Placa própria (Arduino ou ESP) no lugar de um aparelho Smart Life',
    resumo: 'Para cafeteira, persiana ou fechadura sem aparelho compatível: uma placa com relé faz o papel.',
    passos: [
      { t: 'Escolha a placa', d: 'Arduino UNO R4 WiFi, GIGA R1 WiFi, Opta WiFi, Portenta H7, Nano 33 IoT, MKR WiFi 1010, Nano ESP32, ESP32 ou ESP8266, com um módulo de relé.' },
      { t: 'Gere o código', d: 'Na tela do aparelho (Cafeteira, Persianas ou Fechadura) → Código da placa própria. O sistema gera o programa completo e um token só daquela placa (aparece uma vez).', link: ['/cafeteira', 'Abrir Cafeteira'] },
      { t: 'Grave pelo Arduino IDE', d: 'Preencha o nome e a senha do Wi-Fi no começo do código e envie para a placa. Ela busca os comandos no servidor a cada 3 s, pela internet do escritório, sem abrir porta nenhuma.' },
      { t: 'O que a placa não faz', d: 'Ela não substitui o agente: o agente é um programa em Python com banco de dados, e Arduino ou ESP não rodam isso. Para o agente ligado 24 horas, use um Raspberry Pi (capítulo Raspberry Pi).' },
    ],
  },
  {
    id: 'dono', icone: Crown, titulo: 'Transferir o posto de dono',
    resumo: 'Só o dono passa o posto para outra pessoa; o novo dono pode transferir de novo.',
    passos: [
      { t: 'Onde', d: 'Configurações → Usuários → a coroa na linha da pessoa.', link: ['/configuracoes?aba=usuarios', 'Abrir Usuários'] },
      { t: 'Confirmar', d: 'Digite o e-mail do novo dono, a sua senha e passe pela verificação anti-robô. Você vira administrador; os dois recebem e-mail.' },
    ],
  },
  {
    id: 'avatares', icone: PersonStanding, titulo: 'Avatares 3D e Blender',
    resumo: 'Crie personagens no Estúdio, use no mapa e abra no Blender.',
    passos: [
      { t: 'Criar', d: 'Avatares → Estúdio: pessoa, cão ou gato, com cores, roupa e animações.', link: ['/avatares', 'Abrir Avatares'] },
      { t: 'Abrir no Blender', d: 'Baixe o .glb e use Arquivo → Importar → glTF 2.0. Ele chega como um personagem com esqueleto (armature), uma malha e as animações no esqueleto (Dope Sheet → Action Editor).' },
      { t: 'Trazer do Blender', d: 'Arquivo → Exportar → glTF 2.0 (.glb, texturas embutidas) e Avatares → Importar.' },
      { t: 'Editar a aparência', d: 'Avatares → Editar aparência: matiz, saturação, brilho, contraste e tingir; Recolorir região (clique na calça, camisa ou carroceria); Pincel; material (fosco, metal, brilho próprio); forma (escala, largura, altura). Salvar guarda uma versão nova e o original fica para Voltar ao original.', link: ['/avatares', 'Abrir Avatares'] },
      { t: 'Carros nas ruas', d: 'Num avatar do tipo Veículo: Nas ruas do mapa 3D → Colocar nas ruas e ajuste a física (massa, potência, aderência, freios, câmbio, tração).' },
      { t: 'Dirigir', d: 'No mapa, controle uma pessoa, desça ao térreo, saia do prédio e aperte E perto do carro. W acelera, S freia (parado engata a ré), A/D vira, Espaço é o freio de mão, Shift o nitro, C troca a câmera, H buzina, R desvira e E sai. O câmbio é automático e o controle de estabilidade segura a derrapagem. No Roadster elétrico, T liga os propulsores: Espaço sobe, X desce. Perto de um carro do trânsito ou de um estacionamento, E pega ele.' },
      { t: 'Jogar junto', d: 'Quem abrir o mapa ao mesmo tempo aparece para os outros, com o nome em cima, andando ou dirigindo (o selo roxo mostra quem está no mapa). Só usuários do sistema entram.' },
    ],
  },
  {
    id: 'problemas', icone: CircleHelp, titulo: 'Quando algo não funciona',
    resumo: 'Os problemas mais comuns e o que fazer.',
    tabela: [
      ['O ar não reage', 'O botão daquele ajuste foi gravado? O transmissor está online? Tem visão direta do ar? O agente do escritório está online (Infra → Agentes)? O Painel mostra um aviso amarelo com o motivo.'],
      ['“Nenhum botão gravado para o modo…”', 'Grave pelo menos uma temperatura nesse modo (capítulo Gravar os botões).'],
      ['A gravação não recebe o sinal', 'Controle a 10–20 cm do transmissor, pilhas boas, aperte depois que a contagem começar; o agente precisa estar na mesma rede.'],
      ['Transmissor offline', 'Está na tomada? Mesma rede 2,4 GHz do agente? Use Reconectar agora. Se trocou o Wi-Fi, pareie de novo no Smart Life.'],
      ['Alexa: “o dispositivo não está respondendo”', 'Agente do escritório offline, transmissor offline ou botão não gravado. Veja o Painel e a Atividade.'],
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
  const toast = useToast()
  const [feitos, setFeitos] = useState(lerFeitos)
  const [busca, setBusca] = useState('')
  const [ativo, setAtivo] = useState(CAPITULOS[0].id)
  const [soFalta, setSoFalta] = useState(false)
  const parado = useReducedMotion()
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
  // PDF no modelo oficial da Prefeitura (brasão, cabeçalho, capítulos numerados, página X de Y), gerado no servidor
  const [gerandoPdf, setGerandoPdf] = useState(false)
  const baixarPdf = async () => {
    setGerandoPdf(true)
    try {
      const capitulos = CAPITULOS.map((c) => ({ titulo: c.titulo, resumo: c.resumo || '',
        passos: [...(c.passos || []).map((p) => ({ t: p.t, d: p.d || '' })), ...(c.tabela || []).map((l) => ({ t: String(l[0]), d: l.slice(1).join(' · ') }))].slice(0, 40) }))
      await api.baixar('/api/guia/pdf', { capitulos })
    } catch (e) { toast(e.message, 'erro') } finally { setGerandoPdf(false) }
  }
  // /guia#capitulo (links de outras telas) abre direto no capítulo
  useEffect(() => { const h = decodeURIComponent(window.location.hash.slice(1)); if (h) setTimeout(() => ir(h), 150) }, [])

  const capFeito = (c) => (c.passos || []).length > 0 && (c.passos || []).every((_, k) => feitos.has(`${c.id}:${k}`))
  const capsFeitos = CAPITULOS.filter(capFeito).length
  const proximo = CAPITULOS.find((c) => (c.passos || []).length && !capFeito(c))
  const marcarCapitulo = (c, valor) => setFeitos((s0) => {
    const n = new Set(s0); (c.passos || []).forEach((_, k) => (valor ? n.add(`${c.id}:${k}`) : n.delete(`${c.id}:${k}`)))
    try { localStorage.setItem(CHAVE, JSON.stringify([...n])) } catch { /* sem armazenamento */ }
    return n
  })
  const copiarLink = (id) => { navigator.clipboard?.writeText(`${window.location.origin}/guia#${id}`); toast('Link do capítulo copiado.') }
  const visiveis = soFalta ? filtrados.filter((c) => !capFeito(c)) : filtrados
  const pct = total ? feitosN / total : 0
  const R = 26, C = 2 * Math.PI * R

  return (
    <div>
      <Cabecalho titulo="Passo a passo" descricao="Do transmissor no Wi-Fi até a Alexa, outra Alexa, o Sinric Pro, o Smart Life, o mapa e a música. Marque cada passo conforme for fazendo."
        acoes={<>
          <Botao icone={FileDown} carregando={gerandoPdf} onClick={baixarPdf} className="print:hidden">{gerandoPdf ? 'Gerando…' : 'PDF (modelo da Prefeitura)'}</Botao>
          <Botao variante="secundario" icone={Printer} onClick={() => window.print()} className="print:hidden">Imprimir</Botao>
        </>} />

      {/* resumo do progresso: anel, números e o próximo capítulo que falta */}
      <section className="cartao mb-6 grid gap-5 p-5 md:grid-cols-[auto_minmax(0,1fr)_auto] md:items-center print:hidden">
        <div className="flex items-center gap-4">
          <svg viewBox="0 0 64 64" className="h-16 w-16 shrink-0 -rotate-90" aria-hidden>
            <circle cx="32" cy="32" r={R} fill="none" stroke="hsl(var(--muted))" strokeWidth="6" />
            <motion.circle cx="32" cy="32" r={R} fill="none" stroke="hsl(var(--primary))" strokeWidth="6" strokeLinecap="round" strokeDasharray={C}
              initial={false} animate={{ strokeDashoffset: C * (1 - pct) }} transition={{ duration: 0.8, ease: 'easeOut' }} />
          </svg>
          <div>
            <p className="text-2xl font-semibold leading-none tabular">{Math.round(pct * 100)}%</p>
            <p className="mt-1 text-xs text-muted-foreground">{feitosN} de {total} passos · {capsFeitos} de {CAPITULOS.length} capítulos</p>
          </div>
        </div>
        <label className="relative min-w-0"><Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
          <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar no guia (ex.: outra Alexa, Wi-Fi, Spotify, elevador)" className="campo h-10 pl-9" aria-label="Buscar no guia" /></label>
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={() => setSoFalta((v) => !v)} aria-pressed={soFalta}
            className={`inline-flex h-10 items-center gap-2 rounded-lg border px-3 text-sm transition-colors ${soFalta ? 'border-primary bg-primary/10 font-medium' : 'border-border text-muted-foreground hover:bg-muted hover:text-foreground'}`}>
            <ListChecks className="h-4 w-4" />Só o que falta</button>
          {proximo && <Botao variante="secundario" onClick={() => ir(proximo.id)}>Continuar: {proximo.titulo.length > 22 ? `${proximo.titulo.slice(0, 22)}…` : proximo.titulo}</Botao>}
        </div>
      </section>

      <select value={ativo} onChange={(e) => ir(e.target.value)} className="campo mb-4 h-10 lg:hidden print:hidden" aria-label="Ir para o capítulo">
        {CAPITULOS.map((c, i) => <option key={c.id} value={c.id}>{String(i + 1).padStart(2, '0')}. {c.titulo}{capFeito(c) ? ' (feito)' : ''}</option>)}
      </select>
      <div className="grid gap-10 lg:grid-cols-[250px_minmax(0,1fr)]">
        <nav className="rolagem-fina sticky top-20 hidden max-h-[calc(100dvh-6rem)] self-start overflow-auto pr-1 lg:block print:hidden" aria-label="Capítulos">
          <ol className="relative space-y-0.5 border-l border-border text-sm">
            {CAPITULOS.map((c, i) => {
              const n = (c.passos || []).length, f = (c.passos || []).filter((_, k) => feitos.has(`${c.id}:${k}`)).length
              return (
                <li key={c.id}>
                  <button onClick={() => ir(c.id)} aria-current={ativo === c.id ? 'true' : undefined}
                    className={`group relative -ml-px flex w-full flex-col gap-1 py-1.5 pl-4 pr-2 text-left transition-colors ${ativo === c.id ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'}`}>
                    {ativo === c.id && <motion.span layoutId="guia-ativo" className="absolute inset-y-0 left-0 w-0.5 bg-primary" transition={{ type: 'spring', bounce: 0.15, duration: 0.4 }} />}
                    <span className="flex items-center gap-2">
                      <span className="w-5 shrink-0 font-mono text-[11px] tabular opacity-70">{String(i + 1).padStart(2, '0')}</span>
                      <span className={`flex-1 truncate ${ativo === c.id ? 'font-medium' : ''}`}>{c.titulo}</span>
                      {n > 0 && f === n && <Check className="h-3.5 w-3.5 shrink-0 text-emerald-500" />}
                    </span>
                    {n > 0 && f > 0 && f < n && <span className="ml-7 block h-0.5 overflow-hidden rounded-full bg-muted"><span className="block h-full bg-primary/70" style={{ width: `${(f / n) * 100}%` }} /></span>}
                  </button>
                </li>
              )
            })}
          </ol>
        </nav>
        <div className="min-w-0 space-y-12">
          {!visiveis.length && <p className="text-sm text-muted-foreground">{busca ? `Nada encontrado para “${busca}”.` : 'Tudo feito por aqui.'}</p>}
          {visiveis.map((c) => {
            const idx = CAPITULOS.findIndex((x) => x.id === c.id)
            const nP = (CAPITULOS[idx].passos || []).length, fP = (CAPITULOS[idx].passos || []).filter((_, k) => feitos.has(`${c.id}:${k}`)).length
            const seguinte = CAPITULOS[idx + 1]
            return (
              <motion.section key={c.id} id={c.id} data-capitulo className="scroll-mt-20 break-inside-avoid"
                initial={parado ? false : { opacity: 0, y: 14 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: '-60px' }} transition={{ duration: 0.35 }}>
                <header className="mb-5 flex items-start gap-4">
                  <span className="select-none font-mono text-3xl font-semibold leading-none tracking-tight text-muted-foreground/40 tabular">{String(idx + 1).padStart(2, '0')}</span>
                  <div className="min-w-0 flex-1">
                    <h2 className="text-xl font-semibold tracking-tight">{c.titulo}</h2>
                    <p className="mt-0.5 text-sm text-muted-foreground">{c.resumo}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1 print:hidden">
                    {nP > 0 && <span className={`rounded-md px-2 py-0.5 text-xs tabular ${fP === nP ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400' : 'bg-muted text-muted-foreground'}`}>{fP}/{nP}</span>}
                    <button onClick={() => copiarLink(c.id)} className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground" aria-label={`Copiar link do capítulo ${c.titulo}`} title="Copiar link"><Link2 className="h-4 w-4" /></button>
                  </div>
                </header>
                {c.fluxo && (
                  <ol className="relative mb-6 grid gap-2 sm:grid-cols-3 xl:grid-cols-6">
                    {c.fluxo.map((f, i) => (
                      <motion.li key={f} initial={parado ? false : { opacity: 0, y: 8 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.07 }}
                        className="relative rounded-lg border border-border bg-card px-3 py-2.5 text-xs">
                        <span className="mb-1 block font-mono text-[10px] text-muted-foreground">{i + 1}</span>{f}
                        {i < c.fluxo.length - 1 && <ArrowRight className="absolute -right-2.5 top-1/2 z-10 hidden h-4 w-4 -translate-y-1/2 rounded-full bg-background text-primary xl:block" />}
                      </motion.li>
                    ))}
                  </ol>
                )}
                {c.passos?.length > 0 && (
                  <ol className="relative space-y-1 before:absolute before:bottom-4 before:left-[15px] before:top-4 before:w-px before:bg-border">
                    {c.passos.map((p) => {
                      const i = CAPITULOS[idx].passos.indexOf(p), k = `${c.id}:${i}`, feito = feitos.has(k)
                      return (
                        <li key={k} className="group relative flex gap-4 rounded-lg py-2.5 pr-3">
                          <button onClick={() => alternar(k)} aria-pressed={feito} aria-label={feito ? `Desmarcar: ${p.t}` : `Marcar como feito: ${p.t}`}
                            className={`relative z-10 mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-xs font-semibold tabular transition-colors ${feito ? 'border-transparent bg-emerald-500 text-white' : 'border-border bg-background text-muted-foreground hover:border-primary hover:text-foreground'}`}>
                            <AnimatePresence mode="wait" initial={false}>
                              {feito ? <motion.span key="ok" initial={{ scale: 0.4, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.4, opacity: 0 }} transition={{ type: 'spring', bounce: 0.5, duration: 0.35 }}><Check className="h-4 w-4" /></motion.span>
                                : <motion.span key="n" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>{i + 1}</motion.span>}
                            </AnimatePresence>
                          </button>
                          <div className="min-w-0 flex-1 pt-1">
                            <p className={`text-sm font-medium transition-colors ${feito ? 'text-muted-foreground line-through decoration-muted-foreground/50' : ''}`}>{p.t}</p>
                            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{p.d}</p>
                            {p.link && <Link to={p.link[0]} className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline print:hidden">{p.link[1]}<ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5" /></Link>}
                          </div>
                        </li>
                      )
                    })}
                  </ol>
                )}
                {c.tabela?.length > 0 && (
                  <div className="cartao overflow-x-auto">
                    <table className="w-full min-w-[520px] text-sm"><thead className="bg-muted/50 text-left text-xs text-muted-foreground"><tr><th className="px-4 py-2 font-medium">Problema</th><th className="px-4 py-2 font-medium">O que fazer</th></tr></thead>
                      <tbody className="divide-y divide-border">{c.tabela.map(([a, b]) => <tr key={a} className="hover:bg-muted/30"><td className="w-2/5 px-4 py-2.5 align-top font-medium">{a}</td><td className="px-4 py-2.5 text-muted-foreground">{b}</td></tr>)}</tbody></table>
                  </div>
                )}
                {c.dicas?.map((d) => <p key={d} className="mt-4 border-l-2 border-amber-500/70 bg-amber-500/5 py-2 pl-3 pr-3 text-sm text-muted-foreground">{d}</p>)}
                <footer className="mt-5 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3 print:hidden">
                  {nP > 0 ? <button onClick={() => marcarCapitulo(CAPITULOS[idx], fP < nP)} className="text-xs font-medium text-muted-foreground hover:text-foreground">{fP < nP ? 'Marcar o capítulo inteiro como feito' : 'Desmarcar o capítulo'}</button> : <span />}
                  {seguinte && <button onClick={() => ir(seguinte.id)} className="group inline-flex items-center gap-1.5 text-sm font-medium text-primary">Próximo: {seguinte.titulo}<ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" /></button>}
                </footer>
              </motion.section>
            )
          })}
          <p className="flex items-center gap-2 text-xs text-muted-foreground"><BookOpen className="h-3.5 w-3.5" />O manual completo também está em docs/MANUAL.md no repositório.</p>
        </div>
      </div>
    </div>
  )
}
