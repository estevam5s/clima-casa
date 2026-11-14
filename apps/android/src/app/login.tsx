import { useState } from 'react';
import { KeyboardAvoidingView, Platform, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '@/lib/supabase';
import { api } from '@/lib/api';
import { useTema } from '@/lib/tema';
import { Botao, Texto } from '@/ui/base';

export default function Login() {
  const t = useTema();
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState('');
  const [enviando, setEnviando] = useState(false);

  const entrar = async () => {
    setErro(''); setEnviando(true);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password: senha });
    if (error) {
      setErro(error.message === 'Invalid login credentials' ? 'E-mail ou senha incorretos.' : error.message);
      setEnviando(false); return;
    }
    try { await api.get('/api/sessao'); api.post('/api/sessao/registrar-login').catch(() => {}); }
    catch (e: any) { await supabase.auth.signOut(); setErro(e.message); }
    setEnviando(false);
  };

  const campo = { height: 48, borderRadius: 10, borderWidth: 1, borderColor: t.borda, backgroundColor: t.cartao, color: t.texto, paddingHorizontal: 14, fontSize: 15 };
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.fundo }}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, justifyContent: 'center', padding: 24, gap: 14 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 18 }}>
          <View style={{ width: 34, height: 34, borderRadius: 9, backgroundColor: t.primaria, alignItems: 'center', justifyContent: 'center' }}><Texto cor="#fff" peso="700" tam={18}>*</Texto></View>
          <Texto tam={20} peso="600">Clima Casa</Texto>
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
