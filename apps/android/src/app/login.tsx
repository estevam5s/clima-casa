import { useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '@/lib/supabase';
import { api } from '@/lib/api';
import { useTema } from '@/lib/tema';
import { useClima } from '@/lib/contexto';
import { Botao, Texto } from '@/ui/base';

export default function Login() {
  const t = useTema();
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [codigo, setCodigo] = useState('');
  const { sessao, precisa2fa, confirmar2fa, sair } = useClima();
  const conferindo = useRef(false);

  const enviarCodigo = async (c: string) => {
    if (conferindo.current || c.length !== 6) return;
    conferindo.current = true; setErro(''); setEnviando(true);
    try { await confirmar2fa(c); } catch (e: any) { setErro(e.message); setCodigo(''); }
    finally { conferindo.current = false; setEnviando(false); }
  };

  const entrar = async () => {
    setErro(''); setEnviando(true);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password: senha });
    if (error) {
      setErro(error.message === 'Invalid login credentials' ? 'E-mail ou senha incorretos.' : error.message);
      setEnviando(false); return;
    }
    // com Google Authenticator o servidor exige o código antes (a tela muda sozinha para o passo do código)
    const { data: nivel } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (nivel?.nextLevel === 'aal2' && nivel.currentLevel !== 'aal2') { setEnviando(false); return; }
    try { await api.get('/api/sessao'); api.post('/api/sessao/registrar-login').catch(() => {}); }
    catch (e: any) { await supabase.auth.signOut(); setErro(e.message); }
    setEnviando(false);
  };

  const campo = campoBase(t);
  if (sessao && precisa2fa) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: t.fundo }}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, justifyContent: 'center', padding: 24, gap: 14 }}>
          <Texto tam={22} peso="600">Verificação em duas etapas</Texto>
          <Texto suave>Abra o Google Authenticator e digite o código de 6 dígitos. Ele é enviado sozinho ao completar.</Texto>
          <TextInput style={{ ...campoBase(t), height: 60, fontSize: 28, letterSpacing: 10, textAlign: 'center' }} placeholder="000000" placeholderTextColor={t.suave}
            keyboardType="number-pad" autoComplete="one-time-code" textContentType="oneTimeCode" maxLength={6} autoFocus value={codigo}
            onChangeText={(v) => { const n = v.replace(/\D/g, '').slice(0, 6); setCodigo(n); if (n.length === 6) enviarCodigo(n); }} />
          {erro ? <Texto cor={t.perigo}>{erro}</Texto> : null}
          <Botao titulo="Confirmar" onPress={() => enviarCodigo(codigo)} carregando={enviando} desabilitado={codigo.length !== 6} />
          <Botao titulo="Entrar com outra conta" variante="secundario" onPress={() => { setCodigo(''); setErro(''); sair(); }} />
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.fundo }}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, justifyContent: 'center', padding: 24, gap: 14 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 18 }}>
          <View style={{ width: 34, height: 34, borderRadius: 9, backgroundColor: t.primaria, alignItems: 'center', justifyContent: 'center' }}><Texto cor="#fff" peso="700" tam={18}>*</Texto></View>
          <Texto tam={20} peso="600">Clima Escritório</Texto>
        </View>
        <Texto tam={22} peso="600">Entrar</Texto>
        <Texto suave>Acesso restrito ao administrador.</Texto>
        <TextInput style={campo} placeholder="E-mail" placeholderTextColor={t.suave} autoCapitalize="none" keyboardType="email-address"
          autoComplete="email" textContentType="username" value={email} onChangeText={setEmail} />
        <TextInput style={campo} placeholder="Senha" placeholderTextColor={t.suave} secureTextEntry autoComplete="current-password"
          textContentType="password" value={senha} onChangeText={setSenha} onSubmitEditing={entrar} />
        {erro ? <Texto cor={t.perigo}>{erro}</Texto> : null}
        <Botao titulo="Entrar" onPress={entrar} carregando={enviando} desabilitado={!email || !senha} />
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function campoBase(t: ReturnType<typeof useTema>) {
  return { height: 48, borderRadius: 10, borderWidth: 1, borderColor: t.borda, backgroundColor: t.cartao, color: t.texto, paddingHorizontal: 14, fontSize: 15 } as const;
}
