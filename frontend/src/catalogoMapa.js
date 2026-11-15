import { AirVent, Armchair, Archive, Box, Camera, Columns2, Coffee, Droplets, Fan, Laptop, Leaf, Monitor, Presentation, Printer, Projector, Refrigerator, Router, Server, Speaker, Table2, Wind, Zap } from 'lucide-react'

// Catálogo da "loja" do mapa: itens que entram na planta (não é compra; é o que aparece no escritório em 3D).
// w/h = tamanho na planta (cm); modelos e cores mudam o desenho 3D.
export const CORES_ITEM = [
  ['#f8fafc', 'Branco'], ['#18181b', 'Preto'], ['#9ca3af', 'Prata'], ['#e7dcc6', 'Bege'], ['#7a4a2a', 'Madeira'],
  ['#0f766a', 'Verde'], ['#1d4ed8', 'Azul'], ['#b91c1c', 'Vermelho'], ['#475569', 'Grafite'],
]
export const CATALOGO = [
  { tipo: 'rack', nome: 'Rack de servidores', grupo: 'Rede e servidores', icone: Server, w: 60, h: 100, modelos: ['42U fechado', '24U fechado', '42U aberto'], cor: '#18181b', desc: 'Rack 19" com servidores, switch, patch panel e nobreak, com LEDs de atividade.' },
  { tipo: 'roteador', nome: 'Roteador Wi‑Fi', grupo: 'Rede e servidores', icone: Router, w: 30, h: 20, modelos: ['De parede', 'De mesa', 'Mesh (torre)'], cor: '#18181b', desc: 'Roteador com antenas e luz de status.' },
  { tipo: 'nobreak', nome: 'Nobreak', grupo: 'Rede e servidores', icone: Zap, w: 25, h: 45, modelos: ['Torre 1,5 kVA', 'Torre 3 kVA'], cor: '#18181b', desc: 'Nobreak de piso com visor de carga.' },
  { tipo: 'monitor', nome: 'TV de parede', grupo: 'Telas e som', icone: Monitor, w: 104, h: 6, modelos: ['32"', '43"', '47"', '55"', '65"'], cor: '#18181b', desc: 'TV 16:9 presa na parede, com painel da empresa na tela.' },
  { tipo: 'projetor', nome: 'Projetor de teto', grupo: 'Telas e som', icone: Projector, w: 35, h: 30, modelos: ['Teto'], cor: '#f8fafc', desc: 'Projetor preso no teto com feixe de luz quando ligado.' },
  { tipo: 'alexa', nome: 'Caixa inteligente (Alexa)', grupo: 'Telas e som', icone: Speaker, w: 20, h: 20, modelos: ['Esfera', 'Cilindro', 'Com tela'], cor: '#475569', desc: 'Caixa de voz com anel de luz; fica sobre um apoio.' },
  { tipo: 'quadro', nome: 'Quadro branco', grupo: 'Telas e som', icone: Presentation, w: 120, h: 6, modelos: ['120 × 90', '180 × 120'], cor: '#f8fafc', desc: 'Quadro de parede com moldura de alumínio.' },
  { tipo: 'impressora', nome: 'Impressora', grupo: 'Escritório', icone: Printer, w: 60, h: 55, modelos: ['Laser multifuncional (piso)', 'Jato de tinta (mesa)'], cor: '#e5e7eb', desc: 'Multifuncional com bandejas e painel.' },
  { tipo: 'camera', nome: 'Câmera de segurança', grupo: 'Escritório', icone: Camera, w: 16, h: 16, modelos: ['Dome (teto)', 'Bullet (parede)'], cor: '#f8fafc', desc: 'Câmera com LED de gravação.' },
  { tipo: 'ventilador', nome: 'Ventilador de coluna', grupo: 'Conforto', icone: Fan, w: 40, h: 40, modelos: ['Coluna'], cor: '#18181b', desc: 'Hélice gira quando ligado.' },
  { tipo: 'purificador', nome: 'Purificador de ar', grupo: 'Conforto', icone: Wind, w: 30, h: 30, modelos: ['Torre'], cor: '#f8fafc', desc: 'Torre com anel de luz da qualidade do ar.' },
  { tipo: 'bebedouro', nome: 'Bebedouro', grupo: 'Copa', icone: Droplets, w: 35, h: 35, modelos: ['Galão 20 L'], cor: '#f8fafc', desc: 'Bebedouro de coluna com galão azul.' },
  { tipo: 'frigobar', nome: 'Frigobar', grupo: 'Copa', icone: Refrigerator, w: 50, h: 50, modelos: ['85 L'], cor: '#f8fafc', desc: 'Frigobar com puxador.' },
  { tipo: 'armario', nome: 'Balcão com cafeteira', grupo: 'Copa', icone: Coffee, w: 90, h: 40, modelos: ['Balcão'], cor: '#7a4a2a', desc: 'Balcão de madeira com cafeteira.' },
  { tipo: 'estacao', nome: 'Mesa individual', grupo: 'Móveis', icone: Laptop, w: 120, h: 70, modelos: ['Executiva'], cor: '#8a6440', desc: 'Mesa com monitor, teclado, gaveteiro e cadeira.' },
  { tipo: 'mesa', nome: 'Fileira de mesas', grupo: 'Móveis', icone: Table2, w: 170, h: 470, modelos: ['Plataforma'], cor: '#e7e5e4', desc: 'Bancada contínua com postos dos dois lados.' },
  { tipo: 'bancada', nome: 'Bancada técnica', grupo: 'Móveis', icone: Columns2, w: 240, h: 70, modelos: ['Encostada na parede'], cor: '#8a6440', desc: 'Um posto a cada 1,2 m com monitor, teclado e mouse.' },
  { tipo: 'gaveteiro', nome: 'Gaveteiro etiquetado', grupo: 'Móveis', icone: Archive, w: 180, h: 50, modelos: ['30 gavetas'], cor: '#7a4a2a', desc: 'Armário de gavetas com etiquetas de material de TI.' },
  { tipo: 'cadeira', nome: 'Cadeira', grupo: 'Móveis', icone: Armchair, w: 50, h: 50, modelos: ['Giratória'], cor: '#334155', desc: 'Cadeira de escritório avulsa.' },
  { tipo: 'sofa', nome: 'Sofá', grupo: 'Móveis', icone: Box, w: 160, h: 60, modelos: ['3 lugares'], cor: '#334155', desc: 'Sofá para espera ou descanso.' },
  { tipo: 'planta', nome: 'Planta', grupo: 'Móveis', icone: Leaf, w: 34, h: 34, modelos: ['Vaso'], cor: '#78716c', desc: 'Vaso com planta.' },
  { tipo: 'ar_previsto', nome: 'Ar previsto', grupo: 'Ar-condicionado', icone: AirVent, w: 86, h: 22, modelos: ['Split hi-wall', 'Cassete', 'Piso-teto'], cor: '#f8fafc', desc: 'Lugar reservado para um ar (ainda não cadastrado).' },
]
export const ITEM = Object.fromEntries(CATALOGO.map((c) => [c.tipo, c]))
// tamanho da TV pelo modelo (polegadas → largura em cm)
export const larguraTV = (m) => Math.round((parseInt(m, 10) || 47) * 2.54 * 0.87)
export const MODELOS_AR = [['split', 'Split hi-wall'], ['cassete', 'Cassete (teto)'], ['piso_teto', 'Piso-teto'], ['janela', 'De janela']]
export const CORES_AR = [['#f8fafc', 'Branco'], ['#18181b', 'Preto'], ['#9ca3af', 'Prata'], ['#e7dcc6', 'Bege']]
