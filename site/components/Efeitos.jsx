'use client'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { ScrollSmoother } from 'gsap/ScrollSmoother'
import { SplitText } from 'gsap/SplitText'

if (typeof window !== 'undefined') gsap.registerPlugin(ScrollTrigger, ScrollSmoother, SplitText)
const useIsoLayout = typeof window !== 'undefined' ? useLayoutEffect : useEffect

// Pré-carregamento: anel girando com o ícone, some 0,5 s depois do carregamento.
function PreCarga() {
  const [some, setSome] = useState(false)
  const [fora, setFora] = useState(false)
  useEffect(() => {
    const fim = () => setTimeout(() => { setSome(true); setTimeout(() => setFora(true), 500) }, 500)
    if (document.readyState === 'complete') fim()
    else window.addEventListener('load', fim, { once: true })
  }, [])
  if (fora) return null
  return <div className={`pre-carga ${some ? 'some' : ''}`} aria-hidden="true"><div className="anel" /><img src="/icone.svg" alt="" /></div>
}

/*
  Efeitos do modelo, reproduzidos com GSAP:
  - ScrollSmoother: rolagem suave (smooth 1, effects, smoothTouch 0.1)
  - .text-anm: letras entram da direita (x 40, opacidade 0, stagger 0.01, atraso 0.5, power2.out) ao chegar a 85% da tela
  - .split: letras sobem (yPercent 100, stagger 0.065, back.out) a 50% da tela
  - .pf_fadeup: sobe 70 px aparecendo (1 s), uma vez
  - .pf_zoomIn: de 0.8 para 1 aparecendo (1 s, power2.out), uma vez
  - .contar: número conta até o alvo em 4 s quando fica todo visível
*/
export default function Efeitos({ children }) {
  const caminho = usePathname()
  const suave = useRef(null)

  useIsoLayout(() => {
    const calmo = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (!calmo && !suave.current) {
      suave.current = ScrollSmoother.create({ wrapper: '#smooth-wrapper', content: '#smooth-content', smooth: 1, effects: true, smoothTouch: 0.1 })
    }
    // "voltar ao topo" e âncoras internas passam pelo ScrollSmoother
    const clique = (e) => {
      const a = e.target.closest('a[href^="#"]')
      if (!a) return
      e.preventDefault()
      const alvo = a.getAttribute('href') === '#topo' ? 0 : document.querySelector(a.getAttribute('href'))
      if (suave.current) suave.current.scrollTo(alvo, true)
      else window.scrollTo({ top: alvo === 0 ? 0 : alvo?.offsetTop || 0, behavior: 'smooth' })
    }
    document.addEventListener('click', clique)
    return () => document.removeEventListener('click', clique)
  }, [])

  useIsoLayout(() => {
    suave.current?.scrollTop(0)
    window.scrollTo(0, 0)
    const calmo = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const divisoes = []
    let ctx
    const iniciar = () => {
      ctx = gsap.context(() => {
        if (calmo) { gsap.set('.pf_fadeup, .pf_zoomIn', { autoAlpha: 1 }); return }
        document.querySelectorAll('.text-anm').forEach((el) => {
          const s = new SplitText(el, { type: 'chars, words' }); divisoes.push(s)
          gsap.from(s.chars, { duration: 1, delay: 0.5, x: 40, autoAlpha: 0, stagger: 0.01, ease: 'power2.out', scrollTrigger: { trigger: el, start: 'top 85%' } })
        })
        document.querySelectorAll('.split').forEach((el) => {
          const s = new SplitText(el, { type: 'chars' }); divisoes.push(s)
          gsap.from(s.chars, { yPercent: 100, stagger: 0.065, ease: 'back.out', duration: 1, scrollTrigger: { trigger: el, start: 'top 50%' } })
        })
        gsap.utils.toArray('.pf_fadeup').forEach((el) => {
          const anim = gsap.fromTo(el, { autoAlpha: 0, y: 70 }, { duration: 1, autoAlpha: 1, y: 0 })
          ScrollTrigger.create({ trigger: el, animation: anim, toggleActions: 'play none none none', once: true })
        })
        gsap.utils.toArray('.pf_zoomIn').forEach((el) => {
          gsap.fromTo(el, { scale: 0.8, autoAlpha: 0 }, { scale: 1, autoAlpha: 1, duration: 1, ease: 'power2.out', scrollTrigger: { trigger: el, toggleActions: 'play none none none', once: true } })
        })
      })
      ScrollTrigger.refresh()
    }
    const pronto = document.fonts?.ready || Promise.resolve()
    let vivo = true
    pronto.then(() => vivo && iniciar())

    const observador = new IntersectionObserver((itens) => {
      itens.forEach((it) => {
        if (!it.isIntersecting) return
        const el = it.target
        observador.unobserve(el)
        const alvo = Number(el.dataset.alvo) || 0
        if (calmo) { el.textContent = alvo; return }
        const obj = { v: 0 }
        gsap.to(obj, { v: alvo, duration: 4, ease: 'power1.out', onUpdate: () => { el.textContent = Math.round(obj.v) } })
      })
    }, { threshold: 1 })
    document.querySelectorAll('.contar').forEach((el) => observador.observe(el))

    return () => { vivo = false; observador.disconnect(); divisoes.forEach((s) => s.revert()); ctx?.revert() }
  }, [caminho])

  return (
    <>
      <PreCarga />
      <div id="smooth-wrapper">
        <div id="smooth-content">
          <span id="topo" />
          {children}
        </div>
      </div>
    </>
  )
}
