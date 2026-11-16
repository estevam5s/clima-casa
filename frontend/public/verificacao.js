// Tela "Executando verificação de segurança" (servida pelo middleware antes do site/sistema).
// Carrega o Cloudflare Turnstile, manda o token ao servidor, que grava um passe assinado (cookie) e libera a página.
(function () {
  var raiz = document.getElementById('verificacao')
  if (!raiz) return
  var chave = raiz.getAttribute('data-chave'), destino = raiz.getAttribute('data-endpoint'), host = raiz.getAttribute('data-host')
  var volta = raiz.getAttribute('data-volta') || '/'
  if (volta.charAt(0) !== '/' || volta.charAt(1) === '/') volta = '/'   // só caminhos do próprio site
  var caixa = document.getElementById('caixa'), status = document.getElementById('status'), erro = document.getElementById('erro')
  function mostrarErro(msg) {
    if (!erro.hidden) return
    erro.textContent = msg; erro.hidden = false
    var b = document.createElement('button'); b.textContent = 'Tentar de novo'; b.onclick = function () { location.reload() }
    erro.appendChild(document.createElement('br')); erro.appendChild(b)
  }
  function enviar(token) {
    fetch(destino, { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ turnstile: token }) })
      .then(function (r) { if (!r.ok) throw new Error(); return r.json() })
      .then(function () {
        caixa.hidden = true
        status.textContent = 'Verificação bem-sucedida. Esperando a resposta de ' + host + '…'
        status.hidden = false
        setTimeout(function () { location.replace(volta) }, 600)
      })
      .catch(function () { mostrarErro('Não conseguimos confirmar a verificação.') })
  }
  // Vigia: se a Cloudflare não devolver nada em 20 s, reinicia o widget uma vez; se travar de novo, oferece tentar de novo
  // (antes a tela ficava em "Verificando…" para sempre quando o desafio emperrava).
  var vigia = null, reinicios = 0, widget = null, resolvido = false
  function armarVigia() {
    clearTimeout(vigia)
    vigia = setTimeout(function () {
      if (resolvido) return
      if (reinicios < 1 && window.turnstile && widget !== null) { reinicios++; window.turnstile.reset(widget); armarVigia(); return }
      mostrarErro('A verificação da Cloudflare está demorando mais que o normal.')
    }, 20000)
  }
  window.aoCarregarTurnstile = function () {
    widget = window.turnstile.render(caixa, {
      sitekey: chave, theme: 'dark', language: 'pt-br', appearance: 'always', action: 'acesso', retry: 'auto',
      callback: function (token) { resolvido = true; clearTimeout(vigia); enviar(token) },
      'error-callback': function () { clearTimeout(vigia); mostrarErro('A verificação da Cloudflare não respondeu.') },
      'timeout-callback': function () { armarVigia() },
      'before-interactive-callback': function () { clearTimeout(vigia) },   // pediu clique: espera a pessoa
      'expired-callback': function () { location.reload() },
    })
    armarVigia()
  }
  var s = document.createElement('script')
  s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit&onload=aoCarregarTurnstile'
  s.async = true
  s.onerror = function () { mostrarErro('Não foi possível carregar a verificação da Cloudflare. Confira a internet.') }
  document.head.appendChild(s)
})()
