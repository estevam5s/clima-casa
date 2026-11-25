import { Stack } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { api, haQuanto } from '@/lib/api';
import { useTema } from '@/lib/tema';
import { Carregando, Cartao, Chip, Erro, Selo, Tela, Texto, Titulo, useCarregar } from '@/ui/base';

// Logs (mesmos de Segurança → Logs no painel, só para dono e admin): o que cada pessoa fez nos ares
// (ligou, desligou, subiu ou baixou a temperatura) e a linha do tempo com atividade, segurança e Telegram.
const ACOES: [string, string][] = [['ligou', 'Ligou'], ['desligou', 'Desligou'], ['subiu', 'Subiu'], ['baixou', 'Baixou']];
const FILTROS: [string, string][] = [['tudo', 'Tudo'], ['ares', 'Só ares'], ['admin', 'Administração'], ['falhas', 'Falhas'], ['seguranca', 'Segurança']];
const ROTULO_AR: Record<string, string> = { ligou: 'Ligou', desligou: 'Desligou', subiu: 'Subiu temp.', baixou: 'Baixou temp.', modo: 'Modo', ventilacao: 'Ventilação', config: 'Configurou' };

export default function Logs() {
  const c = useTema();
  const [dias, setDias] = useState(7);
  const [filtro, setFiltro] = useState('tudo');
  const resumo = useCarregar<any>(() => api.get(`/api/seguranca/logs/resumo?dias=${dias}`), [dias]);
  const q = filtro === 'ares' ? '&fontes=atividade&categoria=ares' : filtro === 'admin' ? '&fontes=atividade&categoria=admin' : filtro === 'falhas' ? '&falhas=true'
    : filtro === 'seguranca' ? '&fontes=seguranca' : '&fontes=atividade,seguranca,telegram,dispositivos';
  const linha = useCarregar<any>(() => api.get(`/api/seguranca/logs?dias=${dias}&limite=120${q}`), [dias, filtro]);
  const atualizar = () => { resumo.atualizar(); linha.atualizar(); };
  const t = resumo.dados?.totais;
  return (
    <>
      <Stack.Screen options={{ title: 'Logs', headerLargeTitle: false }} />
      {!resumo.dados && !resumo.erro ? <Carregando /> : (
        <Tela atualizando={resumo.atualizando || linha.atualizando} aoAtualizar={atualizar}>
          {resumo.erro ? <Erro msg={resumo.erro} /> : null}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            {[1, 7, 30].map((d) => <Chip key={d} rotulo={d === 1 ? '24 h' : `${d} dias`} ativo={dias === d} onPress={() => setDias(d)} />)}
          </View>
          {t ? (
            <Cartao>
              <Texto tam={13}>{t.atividade.total} registros · {t.atividade.ares} nos ares · {t.atividade.falhas} falha(s)</Texto>
              <Texto suave tam={12}>Segurança: {t.seguranca.logins} login(s), {t.seguranca.negados} negado(s), {t.seguranca.ataques} barrado(s) · Telegram {t.telegram.total}</Texto>
            </Cartao>
          ) : null}
          <Titulo sub="Comparado com o estado anterior de cada ar">O que cada pessoa fez</Titulo>
          <Cartao style={{ paddingVertical: 4 }}>
            {(resumo.dados?.pessoas || []).slice(0, 15).map((p: any) => (
              <View key={String(p.id)} style={{ paddingVertical: 9, borderTopWidth: 0.5, borderColor: '#8883' }}>
                <Texto peso="600">{p.nome}</Texto>
                <Texto suave tam={12}>{p.total} comando(s) · {ACOES.map(([k, r]) => `${r} ${p[k] || 0}`).join(' · ')}{p.falhas ? ` · ${p.falhas} falha(s)` : ''}</Texto>
              </View>
            ))}
            {!resumo.dados?.pessoas?.length ? <Texto suave>Nenhum comando nos ares no período.</Texto> : null}
          </Cartao>
          <Titulo>Linha do tempo</Titulo>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            {FILTROS.map(([k, r]) => <Chip key={k} rotulo={r} ativo={filtro === k} onPress={() => setFiltro(k)} />)}
          </View>
          {linha.erro ? <Erro msg={linha.erro} /> : null}
          {!linha.dados ? <Carregando /> : (
            <Cartao style={{ paddingVertical: 4 }}>
              {linha.dados.itens.map((x: any) => (
                <View key={`${x.fonte}-${x.id}`} style={{ flexDirection: 'row', gap: 8, paddingVertical: 9, borderTopWidth: 0.5, borderColor: '#8883' }}>
                  <View style={{ flex: 1 }}>
                    <Texto tam={13}><Texto tam={13} peso="600">{x.quem || x.ip || 'Sistema'}</Texto> {x.acao}</Texto>
                    <Texto suave tam={11}>
                      {haQuanto(x.quando)}{x.aparelho ? ` · ${x.aparelho}` : ''}{x.sala ? ` · ${x.sala}` : ''}
                      {x.acao_ar ? ` · ${ROTULO_AR[x.acao_ar] || x.acao_ar}${x.de != null ? ` ${x.de}°→${x.para}°` : ''}` : ''}
                    </Texto>
                  </View>
                  {!x.ok ? <Selo rotulo="Falhou" tom="erro" /> : null}
                </View>
              ))}
              {!linha.dados.itens.length ? <Texto suave>Nada no período.</Texto> : null}
            </Cartao>
          )}
          <Texto suave tam={11} cor={c.suave}>A pessoa de cada ação é registrada desde a versão 0.6.9 do sistema.</Texto>
        </Tela>
      )}
    </>
  );
}
