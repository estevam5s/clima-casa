import { meta } from '@/lib/seo'
import PaginaCamadas from '@/components/PaginaCamadas'
import { SISTEMA_URL } from '@/lib/dados'

export const metadata = meta({ titulo: 'Mapa 3D do escritório', descricao: 'O andar do escritório em 3D, com cada sala, cada ar e o estado ao vivo, dentro de um prédio de 11 andares numa cidade viva.', caminho: '/mapa-3d', og: 'sobre' })

const CAMADAS = [
  ['Map', 'Cada sala, cada ar', 'A planta vira 3D com as salas (projetos), os ares na posição real e a cor de cada um conforme o modo: frio, quente, ventilar ou desligado.'],
  ['MousePointerClick', 'Clique e controle', 'Clicar num ar abre o controle dele. Persianas, luzes, portas e a cafeteira também respondem no mapa.'],
  ['Building2', 'Prédio e cidade', 'O escritório fica no 9º andar de um prédio de 11 andares, com elevador, recepção no térreo e uma cidade em volta com trânsito e sinaleiras.'],
  ['CloudSun', 'Tempo de verdade', 'A previsão real deixa o céu nublado, com chuva ou trovoada, e o dia e a noite seguem o pôr do sol do dia.'],
  ['Users', 'Equipe no expediente', 'Quem está no horário aparece no seu posto; dá para controlar um avatar, sentar, pegar um café e andar pelas ruas.'],
  ['Car', 'Veículos com física', 'Carros e moto com câmbio, controle de estabilidade e nitro, dirigíveis pelas ruas. O mapa também é multijogador.'],
]
const LISTA = [
  'Modelos 3D próprios na biblioteca de Avatares: pessoas, pets, monitores, computadores e veículos.',
  'Estúdio para criar pessoas e pets com acessórios e animações, sem programar.',
  'Funciona no navegador do computador e do celular, sem instalar nada.',
  'Os modelos pesados entram depois do escritório aparecer, para não travar a tela.',
]

export default function Pagina() {
  return <PaginaCamadas titulo="Mapa 3D" texto="O escritório inteiro numa tela: salas, ares, pessoas e a cidade em volta." trilha={[{ rotulo: 'Mapa 3D' }]}
    sub="Visual" chamada="Veja o escritório, não uma lista" camadas={CAMADAS} imagem={{ src: '/telas/painel.jpg', alt: 'Painel com o escritório em 3D' }}
    subLista="Mais" tituloLista="Feito para usar todo dia" lista={LISTA} botoes={[{ rotulo: 'Abrir o mapa', href: `${SISTEMA_URL}/mapa`, externo: true }, { rotulo: 'Todas as telas', href: '/telas' }]} />
}
