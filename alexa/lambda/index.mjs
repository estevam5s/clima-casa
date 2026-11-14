// Lambda da Skill Smart Home "Clima Casa": repassa cada diretiva da Alexa ao servidor do Clima Casa.
// Variáveis de ambiente: CLIMA_URL (…/alexa/diretiva) e CLIMA_CHAVE (copiadas da tela Alexa do painel).
const URL_CLIMA = process.env.CLIMA_URL
const CHAVE = process.env.CLIMA_CHAVE

function erro(evento, tipo, mensagem) {
  const d = evento.directive || {}
  const ev = {
    header: { namespace: 'Alexa', name: 'ErrorResponse', payloadVersion: '3', messageId: crypto.randomUUID(),
      correlationToken: d.header?.correlationToken },
    payload: { type: tipo, message: mensagem },
  }
  if (d.endpoint) ev.endpoint = { endpointId: d.endpoint.endpointId }
  return { event: ev }
}

export const handler = async (evento) => {
  if (!URL_CLIMA || !CHAVE) return erro(evento, 'INTERNAL_ERROR', 'Lambda sem CLIMA_URL/CLIMA_CHAVE.')
  try {
    const r = await fetch(URL_CLIMA, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Clima-Chave': CHAVE },
      body: JSON.stringify(evento),
      signal: AbortSignal.timeout(7000),
    })
    if (!r.ok) {
      console.log('Clima Casa respondeu', r.status, await r.text())
      return erro(evento, r.status === 403 ? 'INVALID_AUTHORIZATION_CREDENTIAL' : 'ENDPOINT_UNREACHABLE', `Servidor respondeu ${r.status}`)
    }
    return await r.json()
  } catch (e) {
    console.log('Falha ao falar com o Clima Casa:', e.message)
    return erro(evento, 'BRIDGE_UNREACHABLE', 'Servidor do Clima Casa inacessível.')
  }
}
