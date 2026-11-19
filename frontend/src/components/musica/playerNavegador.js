import { useEffect, useRef, useState } from 'react'
import { api } from '../../api'

// Web Playback SDK do Spotify: o próprio painel vira um aparelho do Spotify Connect ("Painel Clima · Nome").
// Resolve o caso "não toca nada" quando nenhum celular, computador ou Echo está com o Spotify aberto.
// Exige conta Premium, o escopo "streaming" e um navegador com DRM (Widevine). O token é pedido ao backend
// a cada vez que o SDK precisa (vale 1 h) e nunca é guardado no navegador.
let promessa = null
function carregarSdk() {
  if (window.Spotify) return Promise.resolve(window.Spotify)
  if (!promessa) {
    promessa = new Promise((ok, falha) => {
      window.onSpotifyWebPlaybackSDKReady = () => ok(window.Spotify)
      const s = document.createElement('script')
      s.src = 'https://sdk.scdn.co/spotify-player.js'
      s.async = true
      s.onerror = () => { promessa = null; falha(new Error('Não deu para carregar o player do Spotify (rede ou bloqueador de anúncios).')) }
      document.body.appendChild(s)
    })
  }
  return promessa
}

const SEM_DRM = 'Este navegador não toca o Spotify: falta o suporte a conteúdo protegido (Widevine). No Brave, abra brave://settings/extensions, ligue "Widevine" e reinicie o navegador. No Chrome, Edge e Safari funciona direto.'

export function usePlayerNavegador(ativo, nome, aoMudar) {
  const [st, setSt] = useState({ id: null, pronto: false, erro: '' })
  const player = useRef(null)
  const cb = useRef(aoMudar)
  cb.current = aoMudar
  useEffect(() => {
    if (!ativo) return undefined
    let vivo = true
    let p = null
    const erro = (msg) => vivo && setSt({ id: null, pronto: false, erro: msg })
    carregarSdk().then((Spotify) => {
      if (!vivo) return
      p = new Spotify.Player({
        name: nome,
        volume: 0.6,
        getOAuthToken: (devolver) => api.get('/api/musica/token-player').then((x) => devolver(x.token)).catch((e) => erro(e.message)),
      })
      player.current = p
      p.addListener('ready', ({ device_id: id }) => vivo && setSt({ id, pronto: true, erro: '' }))
      p.addListener('not_ready', () => vivo && setSt((s) => ({ ...s, pronto: false })))
      p.addListener('initialization_error', () => erro(SEM_DRM))
      p.addListener('authentication_error', () => erro('O Spotify não aceitou o login deste player. Clique em "Reconectar" para liberar a reprodução no navegador.'))
      p.addListener('account_error', () => erro('Tocar no navegador exige Spotify Premium.'))
      p.addListener('player_state_changed', () => cb.current?.())
      p.connect().then((ok) => { if (!ok) erro(SEM_DRM) })
    }).catch((e) => erro(e.message))
    return () => { vivo = false; p?.disconnect(); player.current = null }
  }, [ativo, nome])
  // navegadores só liberam áudio depois de um clique: chamar dentro do clique do usuário
  const ativar = () => { try { player.current?.activateElement?.() } catch { /* sem suporte */ } }
  return { ...st, ativar }
}
