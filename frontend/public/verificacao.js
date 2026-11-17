// Tela "Executando verificação de segurança" (servida pelo middleware antes do site/sistema). Mesmo arquivo em
// frontend/public e site/public.
// 1) Cloudflare Turnstile: o token vai ao servidor, que grava um passe assinado (cookie zv, 12 h) e libera a página.
// 2) Verificação alternativa: se o Turnstile não resolver em 7 s, der erro ou nem carregar (Brave, bloqueadores,
//    instabilidade da Cloudflare), o navegador resolve uma prova de trabalho assinada pelo nosso servidor
//    (GET <endpoint>/desafio → SHA-256 com N bits zero no começo, ~1 s) e manda em { prova }. O que terminar primeiro vale.
(function () {
  var raiz = document.getElementById('verificacao')
  if (!raiz) return
  var chave = raiz.getAttribute('data-chave'), destino = raiz.getAttribute('data-endpoint'), host = raiz.getAttribute('data-host')
  var volta = raiz.getAttribute('data-volta') || '/'
  if (volta.charAt(0) !== '/' || volta.charAt(1) === '/') volta = '/'   // só caminhos do próprio site
  var caixa = document.getElementById('caixa'), status = document.getElementById('status'), erro = document.getElementById('erro')
  var resolvido = false, alternativaRodando = false
  function mostrarErro(msg) {
    if (!erro.hidden || resolvido) return
    erro.textContent = msg; erro.hidden = false
    var b = document.createElement('button'); b.textContent = 'Tentar de novo'; b.onclick = function () { location.reload() }
    erro.appendChild(document.createElement('br')); erro.appendChild(b)
  }
  function avisar(msg) { status.textContent = msg; status.hidden = false }
  function enviar(corpo) {
    if (resolvido) return Promise.resolve()
    return fetch(destino, { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify(corpo) })
      .then(function (r) { if (!r.ok) throw new Error(); return r.json() })
      .then(function () {
        if (resolvido) return
        resolvido = true
        caixa.hidden = true
        avisar('Verificação bem-sucedida. Esperando a resposta de ' + host + '…')
        setTimeout(function () { location.replace(volta) }, 600)
      })
  }

  // ---- verificação alternativa (prova de trabalho) ----
  function zerosNoComeco(bytes, bits) {
    for (var i = 0; i < bits; i++) if ((bytes[i >> 3] >> (7 - (i & 7))) & 1) return false
    return true
  }
  function alternativa() {
    if (resolvido || alternativaRodando) return
    if (!(window.crypto && crypto.subtle && window.TextEncoder)) { mostrarErro('Este navegador não consegue fazer a verificação. Atualize o navegador.'); return }
    alternativaRodando = true
    avisar('A Cloudflare está demorando. Fazendo uma verificação alternativa…')
    var cod = new TextEncoder()
    fetch(destino + '/desafio', { credentials: 'include', cache: 'no-store' })
      .then(function (r) { if (!r.ok) throw new Error(); return r.json() })
      .then(function (d) {
        var LOTE = 1024
        function lote(base) {
          if (resolvido) return null
          if (base > 50000000) throw new Error()
          var pedidos = []
          for (var i = 0; i < LOTE; i++) pedidos.push(crypto.subtle.digest('SHA-256', cod.encode(d.desafio + ':' + (base + i))))
          return Promise.all(pedidos).then(function (hs) {
            for (var i = 0; i < hs.length; i++) if (zerosNoComeco(new Uint8Array(hs[i]), d.bits)) return base + i
            return lote(base + LOTE)
          })
        }
        return Promise.resolve(lote(0)).then(function (nonce) {
          if (nonce === null || resolvido) return
          return enviar({ prova: { desafio: d.desafio, bits: d.bits, exp: d.exp, assinatura: d.assinatura, nonce: nonce } })
        })
      })
      .catch(function () { alternativaRodando = false; mostrarErro('Não conseguimos confirmar a verificação.') })
  }

  // ---- Cloudflare Turnstile ----
  var plano = setTimeout(alternativa, 7000)   // sem resposta em 7 s: segue pela alternativa (o Turnstile continua valendo)
  window.aoCarregarTurnstile = function () {
    window.turnstile.render(caixa, {
      sitekey: chave, theme: 'dark', language: 'pt-br', appearance: 'always', action: 'acesso', retry: 'auto',
      callback: function (token) {
        clearTimeout(plano)
        enviar({ turnstile: token }).catch(function () { alternativa() })
      },
      'error-callback': function () { clearTimeout(plano); alternativa() },
      'timeout-callback': function () { alternativa() },
      'expired-callback': function () { if (!resolvido) location.reload() },
    })
  }
  var s = document.createElement('script')
  s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit&onload=aoCarregarTurnstile'
  s.async = true
  s.onerror = function () { clearTimeout(plano); alternativa() }
  document.head.appendChild(s)
})()
