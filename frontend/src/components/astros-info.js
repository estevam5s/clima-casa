// Ficha de cada astro do modo universo: dados físicos, um pouco de história e curiosidades.
// Valores médios arredondados (fontes públicas da NASA e da UAI). "Terras" = em relação à Terra.
export const GRUPOS_ASTROS = [
  ['Estrela', ['sol']],
  ['Planetas', ['mercurio', 'venus', 'terra', 'marte', 'jupiter', 'saturno', 'urano', 'netuno']],
  ['Planetas anões', ['ceres', 'plutao']],
  ['Luas', ['lua', 'fobos', 'io', 'europa', 'ganimedes', 'calisto', 'tita', 'tritao']],
  ['Pequenos corpos', ['cinturao', 'cometa']],
  ['Além do Sistema Solar', ['pleiades', 'orion', 'andromeda', 'magalhaes']],
]

export const COR_ASTRO = {
  sol: '#fbbf24', mercurio: '#a8a29e', venus: '#fde68a', terra: '#3b82f6', lua: '#cbd5e1', marte: '#f97316', ceres: '#9ca3af',
  jupiter: '#d6b38a', io: '#facc15', europa: '#e7e5e4', ganimedes: '#a8a29e', calisto: '#78716c', saturno: '#e9d7a5', tita: '#f59e0b',
  urano: '#67e8f9', netuno: '#3b82f6', tritao: '#fda4af', plutao: '#d6c2a8', fobos: '#78716c', cinturao: '#a1a1aa', cometa: '#a5f3fc',
  andromeda: '#c4b5fd', magalhaes: '#bfdbfe', orion: '#f9a8d4', pleiades: '#93c5fd',
}

export const INFO_ASTROS = {
  sol: {
    nome: 'Sol', tipo: 'Estrela anã amarela (G2V)',
    dados: [['Diâmetro', '1.392.700 km (109 Terras)'], ['Massa', '333 mil Terras'], ['Gravidade na superfície', '274 m/s²'], ['Rotação', '≈ 25 dias no equador, 35 nos polos'],
      ['Temperatura', '≈ 5.500 °C na superfície, 15 milhões °C no núcleo'], ['Idade', '≈ 4,6 bilhões de anos'], ['Distância da Terra', '149,6 milhões de km (1 UA)']],
    historia: 'Nasceu do colapso de uma nuvem de gás e poeira há cerca de 4,6 bilhões de anos; o que sobrou do disco formou os planetas. Em 1610 os primeiros telescópios mostraram as manchas solares, a prova de que o Sol gira. O observatório SOHO vigia a estrela sem parar desde 1995 e a sonda Parker Solar Probe, lançada em 2018, já passou mais perto dele do que qualquer outro objeto feito por pessoas.',
    curiosidades: ['A luz dele leva cerca de 8 minutos e 20 segundos para chegar até aqui.', 'Concentra 99,86% de toda a massa do Sistema Solar.', 'Funde 600 milhões de toneladas de hidrogênio por segundo.'],
  },
  mercurio: {
    nome: 'Mercúrio', tipo: 'Planeta rochoso',
    dados: [['Diâmetro', '4.879 km'], ['Massa', '0,055 Terra'], ['Gravidade', '3,7 m/s²'], ['Dia solar', '176 dias terrestres'], ['Ano', '88 dias'], ['Temperatura', '−173 °C a 427 °C'], ['Luas', 'nenhuma'], ['Distância do Sol', '57,9 milhões de km (0,39 UA)']],
    historia: 'Conhecido desde a Antiguidade e batizado com o nome do mensageiro dos deuses romanos, por ser o planeta que anda mais rápido no céu. A Mariner 10 o visitou em 1974 e 1975, a MESSENGER o orbitou de 2011 a 2015 e a missão europeia e japonesa BepiColombo está a caminho.',
    curiosidades: ['Mesmo sendo o mais perto do Sol, tem gelo de água no fundo de crateras polares que nunca recebem luz.', 'Não tem atmosfera para segurar o calor: a noite chega a −173 °C.'],
  },
  venus: {
    nome: 'Vênus', tipo: 'Planeta rochoso',
    dados: [['Diâmetro', '12.104 km'], ['Massa', '0,815 Terra'], ['Gravidade', '8,87 m/s²'], ['Rotação', '243 dias, ao contrário dos outros'], ['Ano', '225 dias'], ['Temperatura', '≈ 464 °C'], ['Atmosfera', '96% gás carbônico, pressão 92 vezes a da Terra'], ['Distância do Sol', '108,2 milhões de km (0,72 UA)']],
    historia: 'É o astro mais brilhante do céu depois do Sol e da Lua, chamado de estrela-d\'alva ou estrela da tarde. A soviética Venera 7 foi, em 1970, a primeira nave a transmitir dados da superfície de outro planeta, e a Venera 13 mandou as primeiras fotos coloridas de lá em 1982. A Magellan mapeou o planeta inteiro por radar entre 1990 e 1994.',
    curiosidades: ['É mais quente que Mercúrio por causa do efeito estufa extremo.', 'O dia de Vênus é mais longo que o ano dele.'],
  },
  terra: {
    nome: 'Terra', tipo: 'Planeta rochoso · onde ficam os acessos ao sistema',
    dados: [['Diâmetro', '12.742 km'], ['Massa', '5,97 × 10²⁴ kg'], ['Gravidade', '9,81 m/s²'], ['Dia', '24 h (23 h 56 min em relação às estrelas)'], ['Ano', '365,25 dias'], ['Temperatura média', '≈ 15 °C'], ['Luas', '1'], ['Distância do Sol', '149,6 milhões de km (1 UA)']],
    historia: 'Formou-se há cerca de 4,54 bilhões de anos e tem sinais de vida há pelo menos 3,5 bilhões. A tripulação da Apollo 17 tirou em 1972 a famosa foto da Terra inteira iluminada. Neste globo, o dia e a noite seguem a posição real do Sol agora, e cada ponto é um acesso ao sistema.',
    curiosidades: ['É o único lugar conhecido com água líquida estável na superfície e com vida.', 'O campo magnético desvia o vento solar e cria as auroras.'],
  },
  lua: {
    nome: 'Lua', tipo: 'Satélite natural da Terra',
    dados: [['Diâmetro', '3.474 km'], ['Massa', '0,0123 Terra'], ['Gravidade', '1,62 m/s²'], ['Órbita e rotação', '27,3 dias (sempre a mesma face para nós)'], ['Temperatura', '−173 °C a 127 °C'], ['Distância da Terra', '384.400 km']],
    historia: 'A explicação mais aceita é que nasceu dos destroços de uma colisão entre a Terra jovem e um corpo do tamanho de Marte. A Luna 2 foi o primeiro objeto humano a chegar lá, em 1959. Em 20 de julho de 1969 a Apollo 11 pousou e, até 1972, doze pessoas caminharam na superfície. O programa Artemis prepara a volta de astronautas.',
    curiosidades: ['Afasta-se da Terra cerca de 3,8 cm por ano.', 'A fase mostrada aqui é a real de hoje.'],
  },
  fobos: {
    nome: 'Fobos', tipo: 'Lua de Marte',
    dados: [['Tamanho', '≈ 27 × 22 × 18 km'], ['Órbita', '7 h 39 min'], ['Distância de Marte', '≈ 6.000 km da superfície']],
    historia: 'Descoberta por Asaph Hall em 1877, junto com Deimos. O nome vem do grego e quer dizer medo.',
    curiosidades: ['Está caindo devagar em direção a Marte e deve se partir num anel em algumas dezenas de milhões de anos.'],
  },
  marte: {
    nome: 'Marte', tipo: 'Planeta rochoso',
    dados: [['Diâmetro', '6.779 km'], ['Massa', '0,107 Terra'], ['Gravidade', '3,71 m/s²'], ['Dia', '24 h 37 min'], ['Ano', '687 dias'], ['Temperatura média', '≈ −63 °C'], ['Luas', 'Fobos e Deimos'], ['Distância do Sol', '227,9 milhões de km (1,52 UA)']],
    historia: 'A cor avermelhada vem do óxido de ferro do solo. A Mariner 4 fez as primeiras fotos de perto em 1965 e a Viking 1 pousou em 1976. Depois vieram os jipes-robôs Sojourner, Spirit, Opportunity, Curiosity e Perseverance; com este último foi o pequeno helicóptero Ingenuity, que em 2021 fez o primeiro voo motorizado em outro planeta.',
    curiosidades: ['O Monte Olimpo tem cerca de 22 km de altura, o maior vulcão conhecido.', 'O cânion Valles Marineris se estenderia de costa a costa nos Estados Unidos.'],
  },
  ceres: {
    nome: 'Ceres', tipo: 'Planeta anão no cinturão de asteroides',
    dados: [['Diâmetro', '≈ 940 km'], ['Gravidade', '0,28 m/s²'], ['Dia', '9 h 4 min'], ['Ano', '4,6 anos'], ['Distância do Sol', '≈ 413 milhões de km (2,77 UA)']],
    historia: 'Encontrado pelo astrônomo Giuseppe Piazzi na noite de 1º de janeiro de 1801. Foi chamado de planeta, depois de asteroide e, desde 2006, de planeta anão. A sonda Dawn o orbitou de 2015 a 2018.',
    curiosidades: ['As manchas brilhantes da cratera Occator são depósitos de sais deixados por água salgada que subiu do interior.'],
  },
  cinturao: {
    nome: 'Cinturão de asteroides', tipo: 'Região entre Marte e Júpiter (ilustração fora de escala)',
    dados: [['Distância do Sol', '2,2 a 3,2 UA'], ['Massa total', '≈ 3% da massa da Lua'], ['Maiores corpos', 'Ceres, Vesta, Palas e Hígia']],
    historia: 'Diferente dos filmes, os asteroides ficam muito longe uns dos outros: as sondas que atravessaram o cinturão nunca precisaram desviar de nada.',
    curiosidades: ['Metade da massa do cinturão está em só quatro corpos.', 'A gravidade de Júpiter impediu que esse material formasse um planeta.'],
  },
  jupiter: {
    nome: 'Júpiter', tipo: 'Gigante gasoso',
    dados: [['Diâmetro', '139.820 km (11 Terras)'], ['Massa', '318 Terras'], ['Gravidade', '24,8 m/s²'], ['Dia', '9 h 56 min'], ['Ano', '11,9 anos'], ['Temperatura', '≈ −110 °C no topo das nuvens'], ['Luas', '95 confirmadas'], ['Distância do Sol', '778,5 milhões de km (5,2 UA)']],
    historia: 'Em 1610 Galileu viu quatro luas girando em volta dele, um dos argumentos de que nem tudo girava em torno da Terra. Pioneer 10 e Voyager passaram por lá nos anos 1970, a Galileo o orbitou de 1995 a 2003 e a Juno o estuda desde 2016.',
    curiosidades: ['A Grande Mancha Vermelha é uma tempestade maior que a Terra, observada há mais de 190 anos.', 'Tem mais que o dobro da massa de todos os outros planetas somados.'],
  },
  io: { nome: 'Io', tipo: 'Lua de Júpiter', dados: [['Diâmetro', '3.643 km'], ['Órbita', '1,8 dia']], historia: 'Uma das quatro luas vistas por Galileu em 1610.', curiosidades: ['É o lugar com mais vulcões ativos do Sistema Solar, aquecido pela maré gravitacional de Júpiter.'] },
  europa: { nome: 'Europa', tipo: 'Lua de Júpiter', dados: [['Diâmetro', '3.122 km'], ['Órbita', '3,6 dias']], historia: 'Também descoberta por Galileu. A sonda Europa Clipper, lançada em 2024, vai estudá-la de perto.', curiosidades: ['Esconde um oceano de água salgada sob a crosta de gelo, com mais água que todos os oceanos da Terra.'] },
  ganimedes: { nome: 'Ganimedes', tipo: 'Lua de Júpiter', dados: [['Diâmetro', '5.268 km'], ['Órbita', '7,2 dias']], historia: 'A missão europeia JUICE, lançada em 2023, vai entrar na órbita dela na próxima década.', curiosidades: ['É a maior lua do Sistema Solar, maior que o planeta Mercúrio.', 'É a única lua com campo magnético próprio.'] },
  calisto: { nome: 'Calisto', tipo: 'Lua de Júpiter', dados: [['Diâmetro', '4.821 km'], ['Órbita', '16,7 dias']], historia: 'A quarta lua de Galileu e a mais distante das quatro.', curiosidades: ['Tem uma das superfícies mais cheias de crateras já vistas.'] },
  saturno: {
    nome: 'Saturno', tipo: 'Gigante gasoso com anéis',
    dados: [['Diâmetro', '116.460 km'], ['Massa', '95 Terras'], ['Gravidade', '10,4 m/s²'], ['Dia', '10 h 33 min'], ['Ano', '29,4 anos'], ['Temperatura', '≈ −140 °C'], ['Luas', '146 confirmadas'], ['Distância do Sol', '1,43 bilhão de km (9,5 UA)']],
    historia: 'Galileu viu os anéis em 1610 mas achou que fossem duas luas grudadas. Christiaan Huygens explicou em 1655 que eram anéis e, no mesmo ano, descobriu Titã. A Cassini orbitou o planeta de 2004 a 2017 e levou a sonda Huygens, que pousou em Titã em 2005.',
    curiosidades: ['A densidade média é menor que a da água.', 'Os anéis têm cerca de 280 mil km de diâmetro, mas na maior parte só dezenas de metros de espessura.'],
  },
  tita: { nome: 'Titã', tipo: 'Lua de Saturno', dados: [['Diâmetro', '5.150 km'], ['Órbita', '16 dias'], ['Atmosfera', 'nitrogênio, mais densa que a da Terra']], historia: 'Descoberta por Huygens em 1655. A NASA prepara o drone Dragonfly para voar por lá.', curiosidades: ['É o único lugar além da Terra com lagos e mares na superfície, só que de metano e etano.'] },
  urano: {
    nome: 'Urano', tipo: 'Gigante de gelo',
    dados: [['Diâmetro', '50.724 km'], ['Massa', '14,5 Terras'], ['Gravidade', '8,7 m/s²'], ['Dia', '17 h 14 min'], ['Ano', '84 anos'], ['Temperatura', '≈ −195 °C'], ['Luas', '28 conhecidas'], ['Distância do Sol', '2,87 bilhões de km (19,2 UA)']],
    historia: 'William Herschel o encontrou em 1781, o primeiro planeta descoberto com um telescópio. A única visita foi a passagem da Voyager 2, em 1986.',
    curiosidades: ['Gira praticamente deitado: o eixo é inclinado cerca de 98°.', 'Cada polo passa uns 42 anos de dia seguidos de 42 anos de noite.'],
  },
  netuno: {
    nome: 'Netuno', tipo: 'Gigante de gelo',
    dados: [['Diâmetro', '49.244 km'], ['Massa', '17,1 Terras'], ['Gravidade', '11,2 m/s²'], ['Dia', '16 h 6 min'], ['Ano', '164,8 anos'], ['Temperatura', '≈ −200 °C'], ['Luas', '16 conhecidas'], ['Distância do Sol', '4,5 bilhões de km (30,1 UA)']],
    historia: 'Foi achado primeiro no papel: Urbain Le Verrier calculou onde deveria estar um planeta que puxava Urano, e Johann Galle o viu nesse ponto em 23 de setembro de 1846. A Voyager 2 passou por lá em 1989.',
    curiosidades: ['Tem os ventos mais rápidos do Sistema Solar, perto de 2.100 km/h.', 'Completou a primeira volta em torno do Sol desde a descoberta só em 2011.'],
  },
  tritao: { nome: 'Tritão', tipo: 'Lua de Netuno', dados: [['Diâmetro', '2.707 km'], ['Órbita', '5,9 dias, no sentido contrário à rotação de Netuno']], historia: 'Descoberta por William Lassell em 1846, 17 dias depois do próprio Netuno.', curiosidades: ['Provavelmente foi capturada do Cinturão de Kuiper.', 'A Voyager 2 viu gêiseres de nitrogênio na superfície.'] },
  plutao: {
    nome: 'Plutão', tipo: 'Planeta anão do Cinturão de Kuiper',
    dados: [['Diâmetro', '2.377 km'], ['Massa', '0,0022 Terra'], ['Gravidade', '0,62 m/s²'], ['Dia', '6,4 dias'], ['Ano', '248 anos'], ['Temperatura', '≈ −230 °C'], ['Luas', '5 (a maior é Caronte)'], ['Distância do Sol', '5,9 bilhões de km (39,5 UA)']],
    historia: 'Clyde Tombaugh o descobriu em 1930, e o nome foi sugerido por uma menina inglesa de 11 anos. Em 2006 a União Astronômica Internacional o reclassificou como planeta anão. Em 14 de julho de 2015 a New Horizons passou por ele e revelou uma planície de gelo em forma de coração.',
    curiosidades: ['Caronte tem metade do tamanho de Plutão: os dois giram em torno de um ponto entre eles.'],
  },
  cometa: {
    nome: 'Cometa', tipo: 'Bola de gelo e poeira (ilustração)',
    dados: [['Núcleo', 'de centenas de metros a dezenas de km'], ['Cauda', 'pode passar de 100 milhões de km'], ['Origem', 'Cinturão de Kuiper e Nuvem de Oort']],
    historia: 'O Halley foi o primeiro cometa com volta prevista: Edmond Halley calculou que ele voltaria em 1758, e voltou. A próxima passagem é em 2061. A sonda Rosetta acompanhou o cometa 67P de 2014 a 2016 e o módulo Philae pousou nele.',
    curiosidades: ['A cauda sempre aponta para longe do Sol, empurrada pelo vento solar, como aqui.'],
  },
  pleiades: { nome: 'Plêiades', tipo: 'Aglomerado de estrelas (M45)', dados: [['Distância', '≈ 444 anos-luz'], ['Idade', '≈ 100 milhões de anos']], historia: 'Conhecido por muitos povos: no Brasil, os tupis chamavam o grupo de Eixu e usavam a época em que aparecia no céu para marcar o calendário.', curiosidades: ['Dá para ver de seis a sete estrelas a olho nu, mas o aglomerado tem mais de mil.'] },
  orion: { nome: 'Nebulosa de Órion', tipo: 'Berçário de estrelas (M42)', dados: [['Distância', '≈ 1.344 anos-luz'], ['Tamanho', '≈ 24 anos-luz']], historia: 'Fica na "espada" de Órion, logo abaixo das Três Marias, e é visível a olho nu como uma mancha difusa.', curiosidades: ['É a região de formação de estrelas grandes mais perto da Terra.'] },
  andromeda: { nome: 'Galáxia de Andrômeda', tipo: 'Galáxia espiral (M31)', dados: [['Distância', '≈ 2,5 milhões de anos-luz'], ['Estrelas', '≈ 1 trilhão']], historia: 'Em 1923 Edwin Hubble mediu a distância dela e provou que era uma galáxia separada da nossa, mudando o tamanho do Universo que conhecíamos.', curiosidades: ['É o objeto mais distante que dá para ver a olho nu.', 'Deve se fundir com a Via Láctea daqui a uns 4 a 5 bilhões de anos.'] },
  magalhaes: { nome: 'Nuvens de Magalhães', tipo: 'Galáxias anãs vizinhas', dados: [['Distância', '≈ 160 mil e 200 mil anos-luz']], historia: 'Bem visíveis no céu do hemisfério sul, foram registradas pelos navegantes da expedição de Fernão de Magalhães, de onde vem o nome.', curiosidades: ['Orbitam a Via Láctea e um dia devem ser absorvidas por ela.'] },
}
