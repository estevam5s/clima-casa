import { Stack, router } from 'expo-router';
import * as Linking from 'expo-linking';
import * as Updates from 'expo-updates';
import { useEffect, useState } from 'react';
import { Alert, Switch, View } from 'react-native';
import { autenticar, biometriaDisponivel, biometriaLigada, definirBiometria } from '@/lib/biometria';
import { procurarAtualizacao, versaoApp } from '@/lib/atualizacao';
import { useClima } from '@/lib/contexto';
import { useTema } from '@/lib/tema';
import { Cartao, Linha, Tela, Texto } from '@/ui/base';

const ITENS: [string, string, string][] = [
  ['Assistente de IA', 'Converse e peça: ligar, desligar, timer, diagnóstico', '/mais/ia'],
  ['Automações', 'Regras que agem sozinhas, inclusive pela Alexa', '/mais/automacoes'],
  ['Agenda', 'Horários automáticos', '/mais/agenda'],
  ['Atividade', 'Histórico de todos os comandos', '/mais/atividade'],
  ['Alertas', 'Avisos das rotinas do Supabase', '/mais/alertas'],
  ['Projetos', 'Casa, escritório e outros lugares', '/mais/projetos'],
  ['Transmissores IR', 'SRW-004 e status na rede', '/mais/transmissores'],
  ['Alexa e Google Home', 'Sinric Pro e como conectar outra Alexa', '/mais/integracoes'],
  ['Supabase', 'Rotinas automáticas, banco e backups', '/mais/supabase'],
  ['Notificações', 'Avisos do sistema, marcar como lida', '/mais/notificacoes'],
  ['Luzes e interruptores', 'Acender, apagar, brilho e cada tecla', '/mais/dispositivos?tipo=luz'],
  ['Persianas', 'Abrir, parar e fechar', '/mais/dispositivos?tipo=persiana'],
  ['Cafeteira', 'Ligar e desligar', '/mais/dispositivos?tipo=cafeteira'],
  ['Fechadura', 'Estado da porta', '/mais/dispositivos?tipo=fechadura'],
  ['Música', 'Spotify: tocar, pausar e onde tocar', '/mais/musica'],
  ['Mensagens e Kanban', 'Quem escreveu pelo site, por etapa', '/mais/mensagens'],
  ['Segurança', 'Firewall e o bot do Telegram', '/mais/seguranca'],
  ['Novidades', 'O que mudou em cada versão', '/mais/novidades'],
  ['Bugs', 'Problemas encontrados, procurar e autoteste dos cadastros', '/mais/bugs'],
  ['Uso da IA', 'Limite da sessão de 5 horas e da semana', '/mais/uso-ia'],
];

export default function Mais() {
  const { sessao, sair } = useClima();
  const t = useTema();
  const [bio, setBio] = useState(biometriaLigada());
  const [bioInfo, setBioInfo] = useState<{ ok: boolean; nome: string; motivo?: string } | null>(null);
  const [procurando, setProcurando] = useState(false);
  useEffect(() => { biometriaDisponivel().then(setBioInfo).catch(() => {}); }, []);
  const mudarBio = async (v: boolean) => {
    if (v) {
      if (!bioInfo?.ok) { Alert.alert('Biometria', bioInfo?.motivo || 'Biometria indisponível.'); return; }
      const r = await autenticar('Confirme para ativar a biometria');
      if (!r.ok) { if (r.erro && r.erro !== 'Cancelado.') Alert.alert('Biometria', r.erro); return; }
    }
    definirBiometria(v); setBio(v);
  };
  const procurar = async () => {
    setProcurando(true);
    try {
      const r = await procurarAtualizacao();
      if (r.pelaRede) Alert.alert('Atualização baixada', 'Reinicie para usar as melhorias.', [{ text: 'Depois' }, { text: 'Reiniciar', onPress: () => Updates.reloadAsync() }]);
      else if (r.apk) Alert.alert(`Versão ${r.apk.versao} disponível`, r.apk.notas.join('\n') || 'Há uma versão nova do app.', [{ text: 'Depois' }, { text: 'Baixar', onPress: () => Linking.openURL(r.apk!.url) }]);
      else Alert.alert('Tudo em dia', `Você já está na versão mais recente (${versaoApp()}).`);
    } finally { setProcurando(false); }
  };
  return (
    <>
      <Stack.Screen options={{ title: 'Mais' }} />
      <Tela>
        <Cartao style={{ paddingVertical: 4 }}>
          {ITENS.map(([t, d, rota], i) => (
            <View key={rota} style={i === 0 ? { marginTop: -1 } : undefined}>
              <Linha onPress={() => router.push(rota as any)}>
                <View style={{ flex: 1 }}><Texto peso="500">{t}</Texto><Texto suave tam={12}>{d}</Texto></View>
                <Texto suave>›</Texto>
              </Linha>
            </View>
          ))}
        </Cartao>
        <Cartao>
          <Texto suave tam={12}>Segurança</Texto>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 }}>
            <View style={{ flex: 1 }}>
              <Texto peso="500">Entrar com biometria</Texto>
              <Texto suave tam={12}>{bioInfo?.ok ? `Pede ${bioInfo.nome} ao abrir o app e ao voltar depois de 1 minuto` : bioInfo?.motivo || 'Conferindo o aparelho…'}</Texto>
            </View>
            <Switch value={bio} onValueChange={mudarBio} trackColor={{ true: t.primaria, false: t.borda }} />
          </View>
        </Cartao>
        <Cartao>
          <Texto suave tam={12}>Sobre o app</Texto>
          <Linha onPress={procurar}>
            <View style={{ flex: 1 }}>
              <Texto peso="500">{procurando ? 'Procurando…' : 'Procurar atualização'}</Texto>
              <Texto suave tam={12}>Versão {versaoApp()}{Updates.updateId ? ` · pacote ${Updates.updateId.slice(0, 8)}` : ''} · as melhorias chegam sozinhas pela internet</Texto>
            </View>
          </Linha>
        </Cartao>
        <Cartao>
          <Texto suave tam={12}>Conectado como</Texto>
          <Texto peso="500">{sessao?.user.email}</Texto>
          <Linha onPress={() => Alert.alert('Sair', 'Deseja sair da conta?', [{ text: 'Cancelar', style: 'cancel' }, { text: 'Sair', style: 'destructive', onPress: sair }])}>
            <Texto cor="#dc2626" peso="500">Sair</Texto>
          </Linha>
        </Cartao>
      </Tela>
    </>
  );
}
