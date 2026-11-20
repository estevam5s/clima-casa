import { Stack } from 'expo-router';
import { api } from '@/lib/api';
import { Carregando, Cartao, Erro, Tela, Texto, useCarregar } from '@/ui/base';

const SECOES: [string, string][] = [['novo', 'Novo'], ['melhorias', 'Melhorias'], ['seguranca', 'Segurança'], ['correcoes', 'Correções']];

export default function Novidades() {
  const { dados, erro, atualizar, atualizando } = useCarregar<any>(() => api.get('/api/novidades'));
  return (
    <>
      <Stack.Screen options={{ title: 'Novidades', headerLargeTitle: false }} />
      {!dados && !erro ? <Carregando /> : (
        <Tela atualizando={atualizando} aoAtualizar={atualizar}>
          {erro ? <Erro msg={erro} /> : null}
          {dados?.versoes?.map((v: any) => (
            <Cartao key={v.versao} style={{ gap: 6 }}>
              <Texto suave tam={12}>Versão {v.versao} · {v.data}</Texto>
              <Texto peso="600">{v.titulo}</Texto>
              {SECOES.filter(([k]) => v[k]?.length).map(([k, r]) => (
                <Texto key={k} tam={13}><Texto peso="600" tam={13}>{r}: </Texto>{v[k].join(' · ')}</Texto>
              ))}
            </Cartao>
          ))}
        </Tela>
      )}
    </>
  );
}
