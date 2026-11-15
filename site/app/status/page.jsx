import { meta } from '@/lib/seo'
import { BannerPagina } from '@/components/Secoes'
import Status from '@/components/Status'

export const metadata = meta({ titulo: 'Status do sistema', descricao: 'Estado ao vivo do Clima Escritório: sistema, banco de dados, agente do escritório, transmissores e rotinas automáticas.', caminho: '/status', og: 'sistema' })

export default function PaginaStatus() {
  return (
    <>
      <BannerPagina titulo="Status" texto="O estado de cada parte do sistema agora, atualizado a cada 30 segundos." trilha={[{ rotulo: 'Status' }]} />
      <section className="pt-130 pb-90"><div className="container"><Status /></div></section>
    </>
  )
}
