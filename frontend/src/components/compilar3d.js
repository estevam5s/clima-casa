// Compilação de shaders em paralelo, como o renderer.compileAsync do three.js 0.170, mas à prova de descarte:
// se um material for descartado (dispose) enquanto compila, o original quebra com
// "Cannot read properties of undefined (reading 'isReady')" (bug #10 e #17 da área de Bugs). Aqui ele só sai da lista.
export function compilarSeguro(renderer, cena, camera, alvo = null) {
  let materiais
  // alvo: a cena principal (dá as luzes) quando se compila só um objeto novo, ainda escondido
  try { materiais = alvo ? renderer.compile(cena, camera, alvo) : renderer.compile(cena, camera) } catch { return Promise.resolve() }
  if (!materiais?.forEach) return Promise.resolve()
  const paralelo = renderer.extensions?.get?.('KHR_parallel_shader_compile') != null
  return new Promise((pronto) => {
    let tentativas = 0
    const conferir = () => {
      materiais.forEach((m) => {
        const prog = renderer.properties.get(m)?.currentProgram
        try { if (!prog || prog.isReady()) materiais.delete(m) } catch { materiais.delete(m) }
      })
      // no máximo ~20 s esperando (placa de vídeo lenta): depois disso desenha assim mesmo
      if (materiais.size === 0 || ++tentativas > 2000) { pronto(cena); return }
      setTimeout(conferir, 10)
    }
    if (paralelo) conferir(); else requestAnimationFrame(conferir)
  })
}
