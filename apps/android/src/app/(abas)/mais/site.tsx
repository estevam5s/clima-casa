import { Stack } from 'expo-router';
import * as Linking from 'expo-linking';
import { useState } from 'react';
import { View } from 'react-native';
import { api } from '@/lib/api';
import { Botao, Carregando, Cartao, Chip, Erro, Tela, Texto, Titulo, useCarregar } from '@/ui/base';

// Site e acessos (dono/admin): quem acessa o site e o sistema, Web Vitals, idiomas do site e a newsletter.
// A edição completa (traduções, campanhas) fica no painel web: os botões abrem a tela certa.
const VITAIS: [string, string][] = [['LCP', 'Maior elemento'], ['INP', 'Resposta ao toque'], ['CLS', 'Estabilidade'], ['TTFB', 'Servidor']];
const fmt = (k: string, v?: number | null) => (v == null ? '-' : k === 'CLS' ? v.toFixed(2) : v >= 1000 ? `${(v / 1000).toFixed(1)} s` : `${Math.round(v)} ms`);

export default function Site() {
  const [origem, setOrigem] = useState<'site' | 'sistema'>('site');
  const [dias, setDias] = useState(7);
  const r = useCarregar<any>(() => api.get(`/api/analise/resumo?origem=${origem}&dias=${dias}`), [origem, dias]);
  const id = useCarregar<any>(() => api.get('/api/idiomas'));
  const nw = useCarregar<any>(() => api.get('/api/newsletter'));
  const d = r.dados, t = d?.totais;
  return (
    <>
      <Stack.Screen options={{ title: 'Site e acessos', headerLargeTitle: false }} />
      {!d && !r.erro ? <Carregando /> : (
        <Tela atualizando={r.atualizando} aoAtualizar={() => { r.atualizar(); id.atualizar(); nw.atualizar(); }}>
          {r.erro ? <Erro msg={r.erro} /> : null}
          <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
            <Chip rotulo="Site" ativo={origem === 'site'} onPress={() => setOrigem('site')} />
            <Chip rotulo="Sistema" ativo={origem === 'sistema'} onPress={() => setOrigem('sistema')} />
            {[1, 7, 30].map((n) => <Chip key={n} rotulo={n === 1 ? 'Hoje' : `${n} dias`} ativo={dias === n} onPress={() => setDias(n)} />)}
          </View>
          {t ? (
            <Cartao style={{ gap: 8 }}>
              <Titulo>Acessos</Titulo>
              <Texto><Texto peso="700">{t.online}</Texto> online agora · <Texto peso="700">{t.visitantes}</Texto> visitantes · <Texto peso="700">{t.paginas}</Texto> páginas</Texto>
              <Texto suave tam={13}>{t.sessoes} sessões · {t.cliques} cliques · rejeição {t.rejeicao}%</Texto>
            </Cartao>
          ) : null}
          {d?.rotas?.length ? (
            <Cartao style={{ gap: 4 }}>
              <Titulo>Rotas mais vistas</Titulo>
              {d.rotas.slice(0, 8).map((x: any) => <Texto key={x.rota} tam={13}>{x.rota} · {x.paginas}</Texto>)}
            </Cartao>
          ) : null}
          {d?.cliques?.length ? (
            <Cartao style={{ gap: 4 }}>
              <Titulo>Cliques mais feitos</Titulo>
              {d.cliques.slice(0, 8).map((x: any, i: number) => <Texto key={i} tam={13}>{x.nome} · {x.n}</Texto>)}
            </Cartao>
          ) : null}
          {d?.cidades?.length ? (
            <Cartao style={{ gap: 4 }}>
              <Titulo>Cidades</Titulo>
              {d.cidades.slice(0, 8).map((x: any) => <Texto key={`${x.cidade}${x.pais}`} tam={13}>{x.cidade}, {x.regiao} · {x.pais} · {x.sessoes}</Texto>)}
            </Cartao>
          ) : null}
          {d ? (
            <Cartao style={{ gap: 4 }}>
              <Titulo>Desempenho (p75)</Titulo>
              {VITAIS.map(([k, n]) => <Texto key={k} tam={13}>{k} · {n}: <Texto peso="600" tam={13}>{fmt(k, d.vitais?.[k]?.p75)}</Texto>{d.vitais?.[k]?.nota ? ` (${d.vitais[k].nota})` : ''}</Texto>)}
              {d.recomendacoes?.slice(0, 4).map((x: any, i: number) => <Texto key={i} suave tam={12}>• {x.titulo}</Texto>)}
            </Cartao>
          ) : null}
          {id.dados ? (
            <Cartao style={{ gap: 4 }}>
              <Titulo>Idiomas do site</Titulo>
              {id.dados.idiomas.map((x: any) => <Texto key={x.codigo} tam={13}>{x.nome}: {x.cobertura}%{x.codigo !== 'pt' && !x.ativo ? ' (desligado)' : ''}</Texto>)}
              <Botao pequeno variante="secundario" titulo="Revisar no painel" onPress={() => Linking.openURL('https://app.zynio.com.br/idiomas')} />
            </Cartao>
          ) : null}
          {nw.dados ? (
            <Cartao style={{ gap: 4 }}>
              <Titulo>Newsletter</Titulo>
              <Texto tam={13}>{nw.dados.contagem.ativos} inscritos ativos · {nw.dados.contagem.pendentes} aguardando confirmação</Texto>
              <Botao pequeno variante="secundario" titulo="Campanhas no painel" onPress={() => Linking.openURL('https://app.zynio.com.br/emails?aba=newsletter')} />
            </Cartao>
          ) : null}
        </Tela>
      )}
    </>
  );
}
