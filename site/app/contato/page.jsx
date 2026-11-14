import { LogIn, MonitorSmartphone, ShieldCheck } from 'lucide-react'
import { BannerPagina, Titulo } from '@/components/Secoes'
import { FormContato } from '@/components/Formularios'
import { APPS_URL, ENTRAR_URL } from '@/lib/dados'

export const metadata = { title: 'Contato', description: 'Mande uma mensagem: ela chega direto na central de notificações do sistema.' }

export default function Contato() {
  return (
    <>
      <BannerPagina titulo="Contato" texto="Sua mensagem chega direto na central de notificações do administrador." trilha={[{ rotulo: 'Contato' }]} />
      <section className="pt-130 pb-90">
        <div className="container">
          <div className="linha">
            <div className="lg-5">
              <div className="mb-50">
                <Titulo sub="Fale com a gente" className="mb-30">Vamos colocar o seu escritório no ponto certo</Titulo>
                <div className="widget pf_fadeup">
                  <div className="info-contato"><span className="ic"><LogIn size={20} strokeWidth={1.5} /></span><div><h5>Já usa?</h5><a href={ENTRAR_URL}>Entrar no sistema</a></div></div>
                  <div className="info-contato"><span className="ic"><MonitorSmartphone size={20} strokeWidth={1.5} /></span><div><h5>Apps</h5><a href={APPS_URL}>Android, macOS, Windows e Linux</a></div></div>
                  <div className="info-contato"><span className="ic"><ShieldCheck size={20} strokeWidth={1.5} /></span><div><h5>Privacidade</h5><p>Usamos seu nome e e-mail só para responder a mensagem.</p></div></div>
                </div>
              </div>
            </div>
            <div className="lg-7"><div className="lateral pf_fadeup"><FormContato /></div></div>
          </div>
        </div>
      </section>
    </>
  )
}
