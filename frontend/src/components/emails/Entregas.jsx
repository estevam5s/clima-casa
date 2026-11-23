import { useState } from 'react'
import { ShieldAlert, Unlock } from 'lucide-react'
import { api } from '../../api'
import { Aviso, Botao, Carregando, FaixaMetricas, Vazio, confirmar, useDados, useToast } from '../ui'

// E-mails → Entregas: números de entrega por período e por modelo, e a lista de bloqueio (quem devolveu ou marcou como
// spam não recebe mais nada até ser liberado: insistir derruba a reputação do domínio no Outlook e no Gmail).
const NOME = { recuperar_senha: 'Recuperar senha', boas_vindas: 'Boas-vindas', senha_alterada: 'Senha alterada', senha_redefinida: 'Senha redefinida', acesso_novo: 'Acesso novo',
  alerta: 'Alerta', teste: 'Teste', relatorio: 'Relatório', treinamento: 'Treinamento', newsletter: 'Newsletter' }

export default function Entregas() {
  const toast = useToast()
  const [dias, setDias] = useState(30)
  const { dados: e, erro } = useDados(() => api.get(`/api/email/estatisticas?dias=${dias}`), [dias])
  const { dados: sup, recarregar } = useDados(() => api.get('/api/email/supressao'))
  const liberar = async (email) => {
    if (!await confirmar(`Liberar ${email}? Ele volta a receber os e-mails do sistema. Faça isso só se o endereço estiver certo e a caixa funcionando.`)) return
    try { await api.post('/api/email/supressao/liberar', { email }); toast('Endereço liberado.'); recarregar() } catch (x) { toast(x.message, 'erro') }
  }
  if (erro) return <Aviso>{erro}</Aviso>
  if (!e) return <Carregando />
  const max = Math.max(1, ...e.por_dia.map((d) => d.n))
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-1" role="group" aria-label="Período">{[7, 30, 90, 365].map((n) => (
        <button key={n} onClick={() => setDias(n)} aria-pressed={dias === n} className={`h-8 rounded-md border px-2.5 text-xs ${dias === n ? 'border-primary bg-primary/10 font-medium' : 'border-border hover:bg-muted'}`}>{n === 365 ? '1 ano' : `${n} dias`}</button>))}</div>
      <FaixaMetricas itens={[
        { rotulo: 'Enviados', valor: e.total, dica: `nos últimos ${e.dias} dias` },
        { rotulo: 'Entregues', valor: `${e.taxa_entrega}%`, dica: 'chegaram à caixa (entregue, aberto ou clicado)', tom: e.taxa_entrega >= 95 || !e.total ? 'bom' : 'ruim' },
        { rotulo: 'Abertos', valor: `${e.taxa_abertura}%`, dica: 'quem abriu (muitos leitores bloqueiam a medição)' },
        { rotulo: 'Devolvidos ou spam', valor: `${e.taxa_devolucao}%`, dica: 'acima de 2% começa a prejudicar a entrega', tom: e.taxa_devolucao > 2 ? 'ruim' : 'bom' },
      ]} />
      {e.por_dia.length > 0 && (
        <section className="cartao p-4">
          <p className="mb-3 text-sm font-medium">Envios por dia</p>
          <div className="flex h-28 items-end gap-1" role="img" aria-label="Envios por dia">{e.por_dia.map((d) => (
            <div key={d.dia} className="min-w-0 flex-1 rounded-t bg-primary/70" style={{ height: `${(d.n / max) * 100}%` }} title={`${d.dia.split('-').reverse().join('/')}: ${d.n}`} />))}</div>
        </section>
      )}
      <section className="cartao overflow-x-auto p-4">
        <p className="mb-2 text-sm font-medium">Por modelo de e-mail</p>
        {e.por_tipo.length ? <table className="w-full min-w-[30rem] text-sm"><thead className="text-left text-xs text-muted-foreground"><tr><th className="py-1.5">Modelo</th><th className="text-right">Enviados</th><th className="text-right">Entregues</th><th className="text-right">Abertos</th><th className="text-right">Devolvidos</th></tr></thead>
          <tbody className="divide-y divide-border">{e.por_tipo.map((t) => <tr key={t.tipo}><td className="py-1.5">{NOME[t.tipo] || t.tipo}</td><td className="text-right tabular">{t.enviados}</td><td className="text-right tabular">{t.entregues}</td><td className="text-right tabular">{t.abertos}</td><td className={`text-right tabular ${t.devolvidos ? 'text-red-600' : ''}`}>{t.devolvidos}</td></tr>)}</tbody></table>
          : <p className="text-sm text-muted-foreground">Nenhum e-mail no período.</p>}
      </section>
      <section className="cartao p-4">
        <p className="flex items-center gap-2 text-sm font-medium"><ShieldAlert className="h-4 w-4" />Lista de bloqueio</p>
        <p className="mt-1 text-xs text-muted-foreground">Quem devolveu um e-mail (endereço que não existe, caixa cheia) ou marcou como spam não recebe mais nada do sistema. Os provedores rebaixam quem insiste, e aí os e-mails de todo mundo vão para o spam.</p>
        {!sup ? <Carregando /> : !sup.enderecos.length ? <Vazio titulo="Ninguém bloqueado" texto="Nenhum endereço devolveu ou marcou spam no último envio." /> : (
          <ul className="mt-3 divide-y divide-border text-sm">{sup.enderecos.map((s) => (
            <li key={s.email} className="flex flex-wrap items-center gap-3 py-2">
              <span className="min-w-0 flex-1"><b className="block truncate font-medium">{s.email}</b><span className="text-xs text-muted-foreground">{s.motivo} · {new Date(s.em * 1000).toLocaleString('pt-BR')} · {NOME[s.tipo] || s.tipo}</span></span>
              <Botao tamanho="sm" variante="secundario" icone={Unlock} onClick={() => liberar(s.email)}>Liberar</Botao>
            </li>))}</ul>
        )}
      </section>
    </div>
  )
}
