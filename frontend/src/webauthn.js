// Biometria (passkeys / WebAuthn): converte as opções do servidor (base64url) e a resposta do navegador.
import { api } from './api'

const deB64 = (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)), (c) => c.charCodeAt(0))
const paraB64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

export const biometriaDisponivel = () => typeof window !== 'undefined' && !!window.PublicKeyCredential && !!navigator.credentials

export async function temBiometriaNoAparelho() {
  try { return biometriaDisponivel() && await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable() } catch { return false }
}

function erroAmigavel(e) {
  if (e?.name === 'NotAllowedError') return new Error('A biometria foi cancelada ou o tempo acabou.')
  if (e?.name === 'InvalidStateError') return new Error('Este aparelho já está cadastrado na sua conta.')
  if (e?.name === 'SecurityError') return new Error('A biometria só funciona no endereço oficial do sistema (HTTPS).')
  return e
}

// Cadastra a biometria do aparelho na conta logada.
export async function cadastrarBiometria(nome) {
  const { desafio_id: desafioId, opcoes } = await api.post('/api/conta/passkeys/opcoes')
  const publicKey = {
    ...opcoes, challenge: deB64(opcoes.challenge), user: { ...opcoes.user, id: deB64(opcoes.user.id) },
    excludeCredentials: (opcoes.excludeCredentials || []).map((c) => ({ ...c, id: deB64(c.id) })),
  }
  let cred
  try { cred = await navigator.credentials.create({ publicKey }) } catch (e) { throw erroAmigavel(e) }
  const r = cred.response
  const credencial = {
    id: cred.id, rawId: paraB64(cred.rawId), type: cred.type, authenticatorAttachment: cred.authenticatorAttachment,
    response: { clientDataJSON: paraB64(r.clientDataJSON), attestationObject: paraB64(r.attestationObject), transports: r.getTransports ? r.getTransports() : [] },
    clientExtensionResults: cred.getClientExtensionResults?.() || {},
  }
  return api.post('/api/conta/passkeys', { desafio_id: desafioId, credencial, nome })
}

// Entra com a biometria (sem senha): devolve a sessão do Supabase.
export async function entrarComBiometria() {
  const { desafio_id: desafioId, opcoes } = await api.post('/api/auth/passkey/opcoes')
  const publicKey = { ...opcoes, challenge: deB64(opcoes.challenge), allowCredentials: (opcoes.allowCredentials || []).map((c) => ({ ...c, id: deB64(c.id) })) }
  let cred
  try { cred = await navigator.credentials.get({ publicKey }) } catch (e) { throw erroAmigavel(e) }
  const r = cred.response
  const credencial = {
    id: cred.id, rawId: paraB64(cred.rawId), type: cred.type, authenticatorAttachment: cred.authenticatorAttachment,
    response: { clientDataJSON: paraB64(r.clientDataJSON), authenticatorData: paraB64(r.authenticatorData), signature: paraB64(r.signature),
      userHandle: r.userHandle ? paraB64(r.userHandle) : null },
    clientExtensionResults: cred.getClientExtensionResults?.() || {},
  }
  return api.post('/api/auth/passkey/entrar', { desafio_id: desafioId, credencial })
}
