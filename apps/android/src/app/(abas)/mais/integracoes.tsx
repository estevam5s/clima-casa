import { Image } from 'expo-image';
import { Stack } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { View } from 'react-native';
import { api, haQuanto } from '@/lib/api';
import { Botao, Carregando, Cartao, Erro, Ponto, Tela, Texto, Titulo, useCarregar } from '@/ui/base';

export default function Integracoes() {
  const { dados, erro, atualizar, atualizando } = useCarregar<any>(() => Promise.all([api.get('/api/sinric'), api.get('/api/sinric/conectar-alexa')]));
  if (!dados && !erro) return <><Stack.Screen options={{ title: 'Alexa e Google', headerLargeTitle: false }} /><Carregando /></>;
  const [cfg, conexao] = dados ?? [{}, null];
  const ag = cfg.agente ?? {};
  return (
    <>
      <Stack.Screen options={{ title: 'Alexa e Google', headerLargeTitle: false }} />
      <Tela atualizando={atualizando} aoAtualizar={atualizar}>
        {erro ? <Erro msg={erro} /> : null}
        <Cartao style={{ gap: 6 }}>
          <Titulo>Sinric Pro</Titulo>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}><Ponto ativo={ag.conectado} />
            <Texto>{ag.conectado ? `Conectado ${haQuanto(ag.desde)} · ${ag.dispositivos?.length ?? 0} aparelho(s)` : 'Desconectado'}</Texto></View>
          <Texto suave tam={12}>Aparelhos novos entram na Alexa sozinhos {cfg.automatico ? '(automático ligado)' : '(automático desligado)'}.</Texto>
        </Cartao>
        <Cartao style={{ gap: 10 }}>
          <Titulo sub="Faça isso no celular que tem o app Alexa da outra conta">Conectar outra Alexa</Titulo>
          <Texto tam={13}>1. Toque em “Abrir skill Sinric Pro”.{'\n'}2. Ative a skill e entre com a conta do Sinric Pro.{'\n'}3. Os aparelhos aparecem sozinhos. Se não, diga “Alexa, descobrir dispositivos”.</Texto>
          {conexao && <Botao titulo="Abrir skill Sinric Pro" onPress={() => WebBrowser.openBrowserAsync(conexao.skill_url)} />}
          {conexao && (
            <View style={{ alignItems: 'center', gap: 6, paddingTop: 6 }}>
              <Image source={{ uri: conexao.qr }} style={{ width: 160, height: 160, borderRadius: 8 }} />
              <Texto suave tam={12}>Ou escaneie este QR Code com outro celular.</Texto>
            </View>
          )}
        </Cartao>
        <Cartao style={{ gap: 6 }}>
          <Titulo>Google Home</Titulo>
          <Texto tam={13}>App Google Home → Adicionar → Funciona com o Google → “Sinric Pro” → entrar com a mesma conta.</Texto>
        </Cartao>
      </Tela>
    </>
  );
}
