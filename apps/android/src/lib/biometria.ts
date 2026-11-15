import * as LocalAuthentication from 'expo-local-authentication';

// Bloqueio do app com digital ou rosto. A sessão continua guardada no aparelho; a biometria só libera a tela.
const CHAVE = 'clima-biometria';

export const biometriaLigada = () => localStorage.getItem(CHAVE) === '1';
export const definirBiometria = (v: boolean) => localStorage.setItem(CHAVE, v ? '1' : '0');

export async function biometriaDisponivel(): Promise<{ ok: boolean; nome: string; motivo?: string }> {
  const [hw, cadastrada, tipos] = await Promise.all([
    LocalAuthentication.hasHardwareAsync(), LocalAuthentication.isEnrolledAsync(), LocalAuthentication.supportedAuthenticationTypesAsync(),
  ]);
  const rosto = tipos.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION);
  const nome = rosto && !tipos.includes(LocalAuthentication.AuthenticationType.FINGERPRINT) ? 'reconhecimento facial' : rosto ? 'digital ou rosto' : 'digital';
  if (!hw) return { ok: false, nome, motivo: 'Este aparelho não tem leitor de digital nem reconhecimento facial.' };
  if (!cadastrada) return { ok: false, nome, motivo: 'Cadastre uma digital ou o rosto nas configurações do Android primeiro.' };
  return { ok: true, nome };
}

export async function autenticar(mensagem = 'Desbloquear o Clima Escritório'): Promise<{ ok: boolean; erro?: string }> {
  const r = await LocalAuthentication.authenticateAsync({
    promptMessage: mensagem, cancelLabel: 'Cancelar', promptSubtitle: 'Use a digital, o rosto ou o bloqueio de tela', disableDeviceFallback: false,
  });
  if (r.success) return { ok: true };
  const msgs: Record<string, string> = {
    user_cancel: 'Cancelado.', not_enrolled: 'Nenhuma digital ou rosto cadastrado no aparelho.', lockout: 'Muitas tentativas. Aguarde e tente de novo.',
    not_available: 'Biometria indisponível agora.', authentication_failed: 'Não reconheceu. Tente de novo.',
  };
  return { ok: false, erro: msgs[r.error] || 'Não foi possível confirmar.' };
}
