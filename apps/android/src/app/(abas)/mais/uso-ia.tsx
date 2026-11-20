import { Stack } from 'expo-router';
import { View } from 'react-native';
import { api } from '@/lib/api';
import { useTema } from '@/lib/tema';
import { Carregando, Cartao, Erro, Tela, Texto, useCarregar } from '@/ui/base';

// Uso do Assistente no método do Claude: sessão de 5 horas (começa na primeira pergunta) e semana de 7 dias.
const quando = (ep?: number) => {
  if (!ep) return 'começa na próxima pergunta';
  const d = new Date(ep * 1000); const h = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  return d.toDateString() === new Date().toDateString() ? `reinicia às ${h}` : `reinicia em ${d.toLocaleDateString('pt-BR')} às ${h}`;
};
const mil = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(1).replace('.', ',')} mi` : n >= 1e3 ? `${Math.round(n / 1e3)} mil` : String(n));

function Barra({ rotulo, j }: { rotulo: string; j: any }) {
  const t = useTema();
  const cor = j.pct >= 90 ? t.perigo : j.pct >= 70 ? '#f59e0b' : t.primaria;
  return (
    <View style={{ gap: 6 }}>
      <Texto peso="600">{rotulo}</Texto>
      <View style={{ height: 10, borderRadius: 5, backgroundColor: t.borda, overflow: 'hidden' }}>
        <View style={{ width: `${j.limite ? j.pct : 0}%`, height: '100%', backgroundColor: cor }} />
      </View>
      <Texto suave tam={12}>{j.limite ? `${j.pct}% usado · ${quando(j.reinicia_em)}` : 'sem limite'} · {mil(j.usado)} de {j.limite ? mil(j.limite) : '∞'} tokens</Texto>
    </View>
  );
}

export default function UsoIa() {
  const { dados, erro, atualizar, atualizando } = useCarregar<any>(() => api.get('/api/ia/uso'));
  return (
    <>
      <Stack.Screen options={{ title: 'Uso da IA', headerLargeTitle: false }} />
      {!dados && !erro ? <Carregando /> : (
        <Tela atualizando={atualizando} aoAtualizar={atualizar}>
          {erro ? <Erro msg={erro} /> : null}
          {dados ? (
            <Cartao style={{ gap: 16 }}>
              {dados.meu.ilimitado ? <Texto suave>Sua conta não tem limite.</Texto> : null}
              <Barra rotulo="Sessão atual (5 horas)" j={dados.meu.sessao} />
              <Barra rotulo="Semana atual (7 dias)" j={dados.meu.semana} />
              <Texto suave tam={12}>A sessão começa na sua primeira pergunta e dura 5 horas; a semana, 7 dias. Vale para o painel, o terminal e o Telegram. O dono define os limites.</Texto>
            </Cartao>
          ) : null}
          {dados?.pessoas?.length ? (
            <Cartao style={{ gap: 8 }}>
              <Texto peso="600">Uso por pessoa</Texto>
              {dados.pessoas.map((p: any) => (
                <Texto key={p.id} tam={13}>{p.nome}: sessão {p.sessao.limite ? `${p.sessao.pct}%` : '∞'} · semana {p.semana.limite ? `${p.semana.pct}%` : '∞'}</Texto>
              ))}
            </Cartao>
          ) : null}
        </Tela>
      )}
    </>
  );
}
