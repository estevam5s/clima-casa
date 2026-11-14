// Aplica o tema antes da página desenhar (evita piscar o tema errado). Externo por causa da CSP.
(function () {
  try {
    var escolha = localStorage.getItem('clima-tema') || 'sistema'
    var escuro = escolha === 'escuro' || (escolha === 'sistema' && window.matchMedia('(prefers-color-scheme: dark)').matches)
    document.documentElement.classList.toggle('dark', escuro)
    document.documentElement.style.colorScheme = escuro ? 'dark' : 'light'
  } catch (e) { /* sem storage: fica o padrão */ }
})()
