import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { Box, Building2, Clock, DoorOpen, Eye, Maximize2, Minimize2, Moon, Pause, Play, RotateCcw, Sun } from 'lucide-react'
import { salasPrivativas } from '../mapaUtil'
import { useMarca } from '../marca'
import { caminho, criarGrade, celulaLivre, livreProxima, montarPredio, visaoLivre } from './predio3d'

// Escritório em 3D montado a partir da mesma planta do mapa 2D (config.mapa):
// paredes com vão de porta e janela, pisos por sala (cor do projeto), mesas com PCs e cadeiras, ares de parede
// com fluxo de ar animado na cor do modo, pessoas animadas (sentadas digitando, andando pelo salão) e sombras.
// 1 unidade da planta = 1 cm. Mapa x → mundo x; mapa y → mundo z.
const S = 0.01
const COR_MODO = { frio: 0x3b82f6, quente: 0xf97316, ventilar: 0x14b8a6, seco: 0xa855f7, auto: 0x22c55e }
const AR_L = 86, AR_A = 22
const PELES = [0xf1c27d, 0xe0ac69, 0xc68642, 0x8d5524, 0xffdbac]
const CABELOS = [0x2b1b12, 0x4a3122, 0x111111, 0x7a5230, 0x6b6b6b]
const ROUPAS = [0x1e3a5f, 0x335c67, 0x6b2737, 0x2f4858, 0x5b5f97, 0x3a5a40, 0x9a6324, 0x264653]

// gerador estável (a mesma planta sempre gera as mesmas pessoas)
function aleatorio(semente) {
  let s = semente >>> 0
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296 }
}

// ponto local (lx, ly) de um elemento girado em torno do próprio centro → coordenada da planta
function girar(e, lx, ly) {
  const t = (e.rot || 0) * Math.PI / 180, cx = e.w / 2, cy = e.h / 2
  const dx = lx - cx, dy = ly - cy
  return [e.x + cx + dx * Math.cos(t) - dy * Math.sin(t), e.y + cy + dx * Math.sin(t) + dy * Math.cos(t)]
}

// Paredes = bordas das salas, unidas (parede compartilhada vira uma só) e cortadas nos vãos de porta e janela.
function paredes(salas, elementos) {
  const H = new Map(), V = new Map()
  const add = (m, k, a, b) => { const r = Math.round(k / 5) * 5; m.set(r, [...(m.get(r) || []), [Math.min(a, b), Math.max(a, b)]]) }
  for (const s of salas) {
    add(H, s.y, s.x, s.x + s.w); add(H, s.y + s.h, s.x, s.x + s.w)
    add(V, s.x, s.y, s.y + s.h); add(V, s.x + s.w, s.y, s.y + s.h)
  }
  const unir = (lista) => lista.sort((a, b) => a[0] - b[0]).reduce((acc, [a, b]) => {
    const u = acc[acc.length - 1]
    if (u && a <= u[1] + 1) u[1] = Math.max(u[1], b); else acc.push([a, b])
    return acc
  }, [])
  const vaos = []   // { horiz, k, a, b, tipo }
  for (const e of elementos) {
    let p1, p2
    if (e.tipo === 'porta') { p1 = girar(e, 0, e.h); p2 = girar(e, e.w, e.h) } else if (e.tipo === 'janela') { p1 = girar(e, 0, e.h / 2); p2 = girar(e, e.w, e.h / 2) } else continue
    const horiz = Math.abs(p1[1] - p2[1]) < Math.abs(p1[0] - p2[0])
    vaos.push(horiz ? { horiz, k: (p1[1] + p2[1]) / 2, a: Math.min(p1[0], p2[0]), b: Math.max(p1[0], p2[0]), tipo: e.tipo }
      : { horiz, k: (p1[0] + p2[0]) / 2, a: Math.min(p1[1], p2[1]), b: Math.max(p1[1], p2[1]), tipo: e.tipo })
  }
  const segs = []
  for (const [mapa, horiz] of [[H, true], [V, false]]) {
    for (const [k, lista] of mapa) {
      for (const [a, b] of unir(lista)) {
        const corte = vaos.filter((v) => v.horiz === horiz && Math.abs(v.k - k) < 16 && v.b > a && v.a < b).sort((x, y) => x.a - y.a)
        let ini = a
        for (const v of corte) {
          if (v.a > ini) segs.push({ horiz, k, a: ini, b: v.a, tipo: 'cheia' })
          segs.push({ horiz, k, a: Math.max(a, v.a), b: Math.min(b, v.b), tipo: v.tipo })
          ini = Math.max(ini, v.b)
        }
        if (ini < b) segs.push({ horiz, k, a: ini, b, tipo: 'cheia' })
      }
    }
  }
  return segs
}

// Pessoa com articulações (ombros, cotovelos, quadris, joelhos, pescoço) para animar. Corpo moldado (tronco torneado,
// mãos, rosto com olhos, sobrancelhas, nariz, orelhas e boca), vários cortes de cabelo, barba, óculos e fone de ouvido.
const CABELO_ESTILOS = ['curto', 'longo', 'coque', 'cacheado', 'raspado', 'lateral']
function pessoa(r, sentada) {
  const g = new THREE.Group()
  const mat = (c, rough = 0.8, metal = 0) => new THREE.MeshStandardMaterial({ color: c, roughness: rough, metalness: metal })
  const corPele = PELES[Math.floor(r() * PELES.length)]
  const pele = new THREE.MeshPhysicalMaterial({ color: corPele, roughness: 0.55, sheen: 0.4, sheenColor: new THREE.Color(0xffd7c2), sheenRoughness: 0.6 })
  const corRoupa = ROUPAS[Math.floor(r() * ROUPAS.length)]
  const roupa = new THREE.MeshPhysicalMaterial({ color: corRoupa, roughness: 0.92, sheen: 0.6, sheenColor: new THREE.Color(corRoupa).offsetHSL(0, 0, 0.2), sheenRoughness: 0.8 })
  const calca = mat(r() > 0.6 ? 0x1f2937 : r() > 0.5 ? 0x334155 : 0x3b4252, 0.85)
  const corCabelo = CABELOS[Math.floor(r() * CABELOS.length)]
  const cabelo = mat(corCabelo, 0.75)
  const sapato = mat(r() > 0.5 ? 0x111111 : 0x3f2a1d, 0.45)
  const escuro = mat(0x111111, 0.3)
  const malha = (geo, m, pai, x = 0, y = 0, z = 0, sombra = true) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.castShadow = sombra; pai.add(o); return o }
  const capsula = (raio, comp, m) => { const x = new THREE.Mesh(new THREE.CapsuleGeometry(raio, comp, 8, 16), m); x.castShadow = true; return x }
  const mangaCurta = r() > 0.55
  // quadril (raiz da pose)
  const quadril = new THREE.Group(); quadril.position.y = sentada ? 0.47 : 0.92; g.add(quadril)
  // tronco torneado: cintura fina, peito e ombros arredondados, achatado na frente
  const perfil = [[0.13, -0.02], [0.155, 0.04], [0.15, 0.14], [0.142, 0.24], [0.158, 0.36], [0.172, 0.46], [0.16, 0.53], [0.11, 0.585], [0.05, 0.6]].map(([x, y]) => new THREE.Vector2(x, y))
  const tronco = malha(new THREE.LatheGeometry(perfil, 28), roupa, quadril); tronco.scale.set(1.12, 1, 0.72)
  const cinto = malha(new THREE.CylinderGeometry(0.133, 0.133, 0.035, 24), escuro, quadril, 0, 0.0, 0); cinto.scale.set(1.12, 1, 0.74)
  const gola = malha(new THREE.TorusGeometry(0.052, 0.014, 8, 20), roupa, quadril, 0, 0.592, 0); gola.rotation.x = Math.PI / 2
  // pescoço e cabeça
  malha(new THREE.CylinderGeometry(0.042, 0.048, 0.09, 14), pele, quadril, 0, 0.63, 0)
  const pescoco = new THREE.Group(); pescoco.position.y = 0.66; quadril.add(pescoco)
  const cabeca = malha(new THREE.SphereGeometry(0.1, 32, 24), pele, pescoco, 0, 0.1, 0.005); cabeca.scale.set(0.9, 1.1, 0.98)
  malha(new THREE.SphereGeometry(0.06, 16, 12), pele, pescoco, 0, 0.045, 0.03).scale.set(1, 0.8, 0.9)   // queixo e mandíbula
  for (const lado of [-1, 1]) {
    malha(new THREE.SphereGeometry(0.022, 12, 10), pele, pescoco, lado * 0.088, 0.1, 0).scale.set(0.45, 1, 0.8)   // orelhas
    malha(new THREE.SphereGeometry(0.012, 12, 10), mat(0xf8fafc, 0.2), pescoco, lado * 0.033, 0.112, 0.088, false)   // olho
    malha(new THREE.SphereGeometry(0.0068, 10, 8), mat(0x1c1917, 0.15), pescoco, lado * 0.033, 0.112, 0.0985, false)   // íris
    const sob = malha(new THREE.BoxGeometry(0.03, 0.006, 0.008), cabelo, pescoco, lado * 0.034, 0.135, 0.094, false); sob.rotation.z = -lado * 0.12
  }
  malha(new THREE.ConeGeometry(0.012, 0.032, 10), pele, pescoco, 0, 0.09, 0.103).rotation.x = Math.PI / 2   // nariz
  malha(new THREE.BoxGeometry(0.03, 0.005, 0.006), mat(0x9f4a4a, 0.5), pescoco, 0, 0.058, 0.093, false)    // boca
  // cabelo
  const estilo = CABELO_ESTILOS[Math.floor(r() * CABELO_ESTILOS.length)]
  const calota = (abertura, raio = 0.108) => { const c = malha(new THREE.SphereGeometry(raio, 32, 20, 0, Math.PI * 2, 0, Math.PI * abertura), cabelo, pescoco, 0, 0.112, -0.004); c.scale.set(0.95, 1.08, 1.02); c.rotation.x = -0.32; return c }
  if (estilo === 'curto') calota(0.5)
  else if (estilo === 'lateral') { const c = calota(0.52); c.rotation.z = 0.12; malha(new THREE.SphereGeometry(0.05, 14, 10), cabelo, pescoco, 0.04, 0.19, 0.05).scale.set(1.4, 0.5, 0.8) }
  else if (estilo === 'raspado') { const c = calota(0.48, 0.103); c.material = mat(corCabelo, 0.95); c.material.transparent = true; c.material.opacity = 0.7 }
  else if (estilo === 'cacheado') { const c = malha(new THREE.IcosahedronGeometry(0.128, 2), cabelo, pescoco, 0, 0.14, -0.012); c.scale.set(1, 0.92, 1); c.material.flatShading = true }
  else if (estilo === 'longo') { calota(0.56); const t = malha(new THREE.CapsuleGeometry(0.085, 0.16, 6, 14), cabelo, pescoco, 0, 0.02, -0.05); t.scale.set(1.1, 1, 0.55) }
  else { calota(0.54); malha(new THREE.SphereGeometry(0.045, 16, 12), cabelo, pescoco, 0, 0.21, -0.07) }   // coque
  if ((estilo === 'curto' || estilo === 'raspado' || estilo === 'lateral') && r() > 0.6) {   // barba
    const b = malha(new THREE.SphereGeometry(0.075, 20, 12, 0, Math.PI * 2, Math.PI * 0.5, Math.PI * 0.4), cabelo, pescoco, 0, 0.085, 0.012); b.scale.set(1.08, 1.05, 1.1)
  }
  if (r() > 0.7) {   // óculos
    const aro = mat(0x18181b, 0.3, 0.4)
    for (const lado of [-1, 1]) malha(new THREE.TorusGeometry(0.019, 0.0028, 8, 20), aro, pescoco, lado * 0.034, 0.112, 0.103, false)
    malha(new THREE.BoxGeometry(0.02, 0.003, 0.003), aro, pescoco, 0, 0.114, 0.105, false)
  }
  if (sentada && r() > 0.72) {   // fone de ouvido
    const arco = malha(new THREE.TorusGeometry(0.105, 0.008, 8, 24, Math.PI), escuro, pescoco, 0, 0.12, 0); arco.rotation.z = 0
    for (const lado of [-1, 1]) malha(new THREE.CylinderGeometry(0.03, 0.03, 0.02, 16), escuro, pescoco, lado * 0.098, 0.1, 0).rotation.z = Math.PI / 2
  }
  // braços com mão
  const bracos = [], pernas = []
  for (const lado of [-1, 1]) {
    const ombro = new THREE.Group(); ombro.position.set(lado * 0.185, 0.52, 0); quadril.add(ombro)
    malha(new THREE.SphereGeometry(0.062, 16, 12), roupa, ombro)
    const braco = capsula(0.05, 0.22, roupa); braco.position.y = -0.14; braco.scale.set(1, 1, 0.92); ombro.add(braco)
    const cotovelo = new THREE.Group(); cotovelo.position.y = -0.29; ombro.add(cotovelo)
    const ante = capsula(0.042, 0.2, mangaCurta ? pele : roupa); ante.position.y = -0.12; cotovelo.add(ante)
    if (!mangaCurta) malha(new THREE.CylinderGeometry(0.037, 0.037, 0.03, 12), pele, cotovelo, 0, -0.245, 0)   // punho
    const mao = malha(new THREE.SphereGeometry(0.038, 14, 10), pele, cotovelo, 0, -0.285, 0.004); mao.scale.set(0.8, 1.15, 0.55)
    malha(new THREE.CapsuleGeometry(0.011, 0.025, 4, 8), pele, cotovelo, lado * -0.024, -0.27, 0.018).rotation.z = lado * 0.6   // polegar
    bracos.push({ ombro, cotovelo })
    const quad = new THREE.Group(); quad.position.set(lado * 0.085, -0.02, 0); quadril.add(quad)
    const coxa = capsula(0.07, 0.3, calca); coxa.position.y = -0.2; coxa.scale.set(1, 1, 1.05); quad.add(coxa)
    const joelho = new THREE.Group(); joelho.position.y = -0.42; quad.add(joelho)
    const canela = capsula(0.058, 0.3, calca); canela.position.y = -0.2; joelho.add(canela)
    const pe = new THREE.Mesh(new RoundedBoxGeometry(0.095, 0.07, 0.24, 3, 0.03), sapato); pe.position.set(0, -0.405, 0.055); pe.castShadow = true; joelho.add(pe)
    malha(new THREE.BoxGeometry(0.1, 0.012, 0.245), mat(0xe7e5e4, 0.6), joelho, 0, -0.44, 0.055, false)   // sola
    pernas.push({ quad, joelho })
  }
  if (sentada) {
    pernas.forEach((p) => { p.quad.rotation.x = -Math.PI / 2; p.joelho.rotation.x = Math.PI / 2 })
    bracos.forEach((b) => { b.ombro.rotation.x = -0.55; b.cotovelo.rotation.x = -0.9 })
  }
  g.userData = { quadril, pescoco, bracos, pernas, fase: r() * 10, sentada }
  return g
}

function animarPessoa(p, t) {
  const { pescoco, bracos, pernas, fase, sentada, quadril } = p.userData
  if (sentada) {
    // digitando: antebraços batem, cabeça olha a tela e às vezes vira
    bracos.forEach((b, i) => { b.cotovelo.rotation.x = -0.9 + Math.sin(t * 9 + fase + i * 1.7) * 0.07 })
    pescoco.rotation.y = Math.sin(t * 0.35 + fase) > 0.93 ? Math.sin(t * 2 + fase) * 0.5 : 0
    pescoco.rotation.x = 0.12 + Math.sin(t * 0.8 + fase) * 0.03
    quadril.position.y = 0.47 + Math.sin(t * 1.6 + fase) * 0.004   // respiração
  } else {
    const c = Math.sin(t * 5.2 + fase)
    pernas[0].quad.rotation.x = c * 0.45; pernas[1].quad.rotation.x = -c * 0.45
    pernas[0].joelho.rotation.x = Math.max(0, -c) * 0.6; pernas[1].joelho.rotation.x = Math.max(0, c) * 0.6
    bracos[0].ombro.rotation.x = -c * 0.4; bracos[1].ombro.rotation.x = c * 0.4
    bracos.forEach((b) => { b.cotovelo.rotation.x = -0.25 })
    quadril.position.y = 0.92 + Math.abs(Math.cos(t * 5.2 + fase)) * 0.025
  }
}

// andar com a fase presa à distância percorrida (o pé não escorrega); k = 0 parado (respira, olha em volta), 1 andando
function animarAndar(p, passo, k, t) {
  const { pescoco, bracos, pernas, quadril, fase } = p.userData
  const c = Math.sin(passo)
  pernas[0].quad.rotation.x = c * 0.42 * k; pernas[1].quad.rotation.x = -c * 0.42 * k
  pernas[0].joelho.rotation.x = Math.max(0, Math.sin(passo + 1.3)) * 0.75 * k
  pernas[1].joelho.rotation.x = Math.max(0, -Math.sin(passo + 1.3)) * 0.75 * k
  bracos[0].ombro.rotation.x = -c * 0.38 * k + Math.sin(t * 0.9 + fase) * 0.03 * (1 - k)
  bracos[1].ombro.rotation.x = c * 0.38 * k + Math.sin(t * 0.9 + fase + 1) * 0.03 * (1 - k)
  bracos[0].ombro.rotation.z = -0.07; bracos[1].ombro.rotation.z = 0.07
  bracos.forEach((b) => { b.cotovelo.rotation.x = -0.18 - 0.2 * k })
  quadril.position.y = 0.92 + Math.abs(Math.cos(passo)) * 0.03 * k + Math.sin(t * 1.6 + fase) * 0.004 * (1 - k)
  quadril.rotation.y = c * 0.07 * k
  pescoco.rotation.y = (1 - k) * Math.sin(t * 0.35 + fase) * 0.55 - quadril.rotation.y
  pescoco.rotation.x = 0.05
}

// ---- luz do dia: hora de Brasília → posição do sol, cor do céu e se é noite ----
function horaBrasilia() {
  const d = new Date(Date.now() - 3 * 3600e3)
  return d.getUTCHours() + d.getUTCMinutes() / 60
}
function ceuDaHora(h) {
  // 0 = meia-noite … 12 = meio-dia; elevação do sol simples (nasce 6h, põe 18h)
  const elev = Math.sin(((h - 6) / 12) * Math.PI)          // >0 de dia
  const noite = elev < -0.05
  const crepusculo = !noite && elev < 0.28
  const az = ((h - 6) / 12) * Math.PI                       // leste → oeste
  return { elev, noite, crepusculo, az, dia: !noite && !crepusculo }
}
function texturaCeu(c) {
  const cv = document.createElement('canvas'); cv.width = 16; cv.height = 256
  const g = cv.getContext('2d'); const gr = g.createLinearGradient(0, 0, 0, 256)
  const [topo, meio, base] = c.noite ? ['#05070f', '#0b1530', '#1c2742'] : c.crepusculo ? ['#2a3a6b', '#e2875a', '#f6c48f'] : ['#5aa0e6', '#9fcaf2', '#e7f1fa']
  gr.addColorStop(0, topo); gr.addColorStop(0.55, meio); gr.addColorStop(1, base)
  g.fillStyle = gr; g.fillRect(0, 0, 16, 256)
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace
  return t
}
// pisos procedurais: madeira (tábuas), carpete (placas) e porcelanato (grade)
function texturaPiso(tipo, base) {
  const cv = document.createElement('canvas'); cv.width = cv.height = 256
  const g = cv.getContext('2d'); const r = aleatorio(tipo.length * 97)
  const cor = new THREE.Color(base)
  const tom = (k) => `#${cor.clone().offsetHSL(0, 0, k).getHexString()}`
  if (tipo === 'madeira') {
    for (let i = 0; i < 8; i++) {
      g.fillStyle = tom((r() - 0.5) * 0.06); g.fillRect(0, i * 32, 256, 32)
      g.strokeStyle = tom(-0.12); g.lineWidth = 1.2; g.beginPath(); g.moveTo(0, i * 32); g.lineTo(256, i * 32); g.stroke()
      const corte = r() * 256; g.beginPath(); g.moveTo(corte, i * 32); g.lineTo(corte, i * 32 + 32); g.stroke()
      g.strokeStyle = tom(-0.04); g.lineWidth = 0.6
      for (let k = 0; k < 3; k++) { g.beginPath(); const y = i * 32 + 6 + r() * 20; g.moveTo(0, y); g.bezierCurveTo(80, y + (r() - 0.5) * 6, 170, y + (r() - 0.5) * 6, 256, y); g.stroke() }
    }
  } else if (tipo === 'carpete') {
    for (let x = 0; x < 4; x++) for (let y = 0; y < 4; y++) {
      g.fillStyle = tom((x + y) % 2 ? -0.025 : 0.02); g.fillRect(x * 64, y * 64, 64, 64)
      for (let k = 0; k < 160; k++) { g.fillStyle = tom((r() - 0.5) * 0.1); g.fillRect(x * 64 + r() * 64, y * 64 + r() * 64, 1.4, 1.4) }
    }
  } else {
    g.fillStyle = tom(0); g.fillRect(0, 0, 256, 256)
    for (let k = 0; k < 600; k++) { g.fillStyle = tom((r() - 0.5) * 0.05); g.fillRect(r() * 256, r() * 256, 2, 2) }
    g.strokeStyle = tom(-0.1); g.lineWidth = 2
    for (let i = 0; i <= 2; i++) { g.beginPath(); g.moveTo(i * 128, 0); g.lineTo(i * 128, 256); g.stroke(); g.beginPath(); g.moveTo(0, i * 128); g.lineTo(256, i * 128); g.stroke() }
  }
  const t = new THREE.CanvasTexture(cv); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4
  return t
}

function etiqueta(texto, cor = '#ffffff', fundo = 'rgba(15,23,42,0.82)') {
  const c = document.createElement('canvas'); const g = c.getContext('2d')
  g.font = '600 44px system-ui, -apple-system, sans-serif'
  const w = Math.ceil(g.measureText(texto).width) + 48
  c.width = w; c.height = 76
  g.font = '600 44px system-ui, -apple-system, sans-serif'
  g.fillStyle = fundo; g.beginPath(); g.roundRect(0, 0, w, 76, 22); g.fill()
  g.fillStyle = cor; g.textBaseline = 'middle'; g.fillText(texto, 24, 40)
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }))
  sp.scale.set(w / 76 * 0.26, 0.26, 1); sp.renderOrder = 10
  return sp
}

export default function Mapa3D({ mapa, ares, projetos, filtro = 'todos', selecionado, aoSelecionar, compacto = false, comPredio = !compacto }) {
  const { marca } = useMarca()
  const ref = useRef(null)
  const rotulosRef = useRef(null)
  const estado = useRef({})
  const [girando, setGirando] = useState(compacto && !window.matchMedia('(prefers-reduced-motion: reduce)').matches)
  const [paredesAltas, setParedesAltas] = useState(true)
  const [pronto, setPronto] = useState(false)
  const [hora, setHora] = useState('agora')   // agora | dia | noite
  const [relogio, setRelogio] = useState(() => Math.floor(horaBrasilia() * 4))  // muda a cada 15 min
  const [aberto, setAberto] = useState(!comPredio)   // prédio fechado: clicar abre o andar do escritório
  // tela cheia: Fullscreen API quando o navegador deixa (no iPhone não deixa num div, aí cobre a janela inteira)
  const caixaRef = useRef(null)
  const [cheia, setCheia] = useState(false)
  useEffect(() => {
    const aoMudar = () => { if (!document.fullscreenElement && !document.webkitFullscreenElement) setCheia((v) => (v === 'api' ? false : v)) }
    const esc = (ev) => { if (ev.key === 'Escape') setCheia((v) => (v === 'janela' ? false : v)) }
    document.addEventListener('fullscreenchange', aoMudar); document.addEventListener('webkitfullscreenchange', aoMudar); window.addEventListener('keydown', esc)
    return () => { document.removeEventListener('fullscreenchange', aoMudar); document.removeEventListener('webkitfullscreenchange', aoMudar); window.removeEventListener('keydown', esc) }
  }, [])
  const alternarCheia = async () => {
    const el = caixaRef.current
    if (cheia) {
      if (cheia === 'api') { try { await (document.exitFullscreen || document.webkitExitFullscreen)?.call(document) } catch { /* já saiu */ } }
      setCheia(false); return
    }
    const pedir = el?.requestFullscreen || el?.webkitRequestFullscreen
    if (pedir) { try { await pedir.call(el); setCheia('api'); return } catch { /* cai no modo janela */ } }
    setCheia('janela')
  }
  // só remonta a cena quando algo visível muda (a lista chega nova a cada 10 s, mesmo igual)
  const chave = useMemo(() => JSON.stringify({ m: mapa, a: ares.map((a) => [a.id, a.ligado, a.modo, a.temperatura, a.projeto_id]), p: projetos.map((p) => [p.id, p.nome, p.cor]) }), [mapa, ares, projetos])

  useEffect(() => {
    const el = ref.current
    if (!el) return undefined
    const calmo = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const escuro = document.documentElement.classList.contains('dark')
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05
    el.appendChild(renderer.domElement)
    const cena = new THREE.Scene()
    cena.background = new THREE.Color(escuro ? 0x0b0f14 : 0xeef1f4)
    cena.fog = new THREE.Fog(cena.background, 40, 80)
    const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 200)
    const controles = new OrbitControls(camera, renderer.domElement)
    controles.enableDamping = true; controles.dampingFactor = 0.07
    controles.maxPolarAngle = Math.PI / 2.15; controles.minDistance = 3; controles.maxDistance = 45
    controles.enableZoom = true; controles.zoomToCursor = true
    estado.current = { cena, camera, controles, renderer }
    setPronto(true)
    let quadro
    const relogio = new THREE.Clock()
    const laco = () => {
      quadro = requestAnimationFrame(laco)
      if (document.hidden) return
      const dt = Math.min(relogio.getDelta(), 0.05), t = relogio.elapsedTime
      estado.current.tick?.(dt, calmo ? 0 : t)
      controles.update()
      renderer.render(cena, camera)
      estado.current.rotulos?.()
    }
    laco()
    const ajustar = () => { const w = el.clientWidth, h = el.clientHeight; renderer.setSize(w, h, false); camera.aspect = w / Math.max(1, h); camera.updateProjectionMatrix() }
    ajustar()
    const ro = new ResizeObserver(ajustar); ro.observe(el)
    return () => {
      cancelAnimationFrame(quadro); ro.disconnect(); controles.dispose()
      cena.traverse((o) => { o.geometry?.dispose?.(); if (o.material) [].concat(o.material).forEach((m) => { m.map?.dispose?.(); m.dispose?.() }) })
      renderer.dispose(); el.removeChild(renderer.domElement)
    }
  }, [])

  // monta (ou remonta) o escritório quando a planta, os ares ou a altura das paredes mudam
  useEffect(() => {
    const E = estado.current
    if (!E.cena) return undefined
    const { cena, camera, controles, renderer } = E
    const escuro = document.documentElement.classList.contains('dark')
    E.mundo && (cena.remove(E.mundo), E.mundo.traverse((o) => { o.geometry?.dispose?.(); if (o.material) [].concat(o.material).forEach((m) => { m.map?.dispose?.(); m.dispose?.() }) }))
    const mundo = new THREE.Group(); E.mundo = mundo; cena.add(mundo)
    const salas = projetos.filter((p) => mapa.salas[p.id]).map((p) => ({ ...mapa.salas[p.id], p }))
    if (!salas.length) return undefined
    const x0 = Math.min(...salas.map((s) => s.x)), y0 = Math.min(...salas.map((s) => s.y))
    const x1 = Math.max(...salas.map((s) => s.x + s.w)), y1 = Math.max(...salas.map((s) => s.y + s.h))
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2
    const W = (mx) => (mx - cx) * S, Z = (my) => (my - cy) * S
    const ALT = paredesAltas ? 2.6 : 1.1
    const r = aleatorio(7)

    // luz pela hora real (ou forçada em Dia/Noite): sol, céu e luz de teto à noite
    const h = hora === 'dia' ? 13 : hora === 'noite' ? 21.5 : horaBrasilia()
    const ceu = ceuDaHora(h)
    E.ceu = ceu
    const fundoCeu = texturaCeu(ceu); cena.background = fundoCeu
    cena.fog = new THREE.Fog(new THREE.Color(ceu.noite ? 0x0b1530 : ceu.crepusculo ? 0xe2a07a : 0xdbe9f6), comPredio ? 110 : 45, comPredio ? 300 : 95)
    controles.maxDistance = comPredio ? 170 : 45
    camera.far = comPredio ? 700 : 200; camera.updateProjectionMatrix()
    renderer.toneMappingExposure = ceu.noite ? 0.95 : 1.05
    mundo.add(new THREE.HemisphereLight(ceu.noite ? 0x3b4a7a : 0xffffff, escuro ? 0x1e293b : 0xb7c4cf, ceu.noite ? 0.35 : ceu.crepusculo ? 0.8 : 1.15))
    const sol = new THREE.DirectionalLight(ceu.noite ? 0x9db4ff : ceu.crepusculo ? 0xffb37a : 0xfff4e5, ceu.noite ? 0.35 : ceu.crepusculo ? 1.5 : 2.4)
    const tam = Math.max(x1 - x0, y1 - y0) * S
    const elev = Math.max(0.25, Math.abs(ceu.elev))
    // a sombra cobre só o andar quando ele está aberto; com o prédio fechado, cobre a torre e a rua
    const ajustarSombra = (fechado) => {
      const tamS = fechado ? Math.max(tam * 2.2, 40) : tam
      sol.position.set(Math.cos(ceu.az) * tamS * 0.9, tamS * (0.35 + elev * 0.8) + (fechado ? 30 : 0), Math.sin(ceu.az) * tamS * 0.5 + tamS * 0.3)
      Object.assign(sol.shadow.camera, { left: -tamS, right: tamS, top: tamS, bottom: -tamS, near: 1, far: tamS * 4 + 60 })
      sol.shadow.camera.updateProjectionMatrix()
    }
    sol.castShadow = true
    sol.shadow.mapSize.set(comPredio ? 4096 : 2048, comPredio ? 4096 : 2048)
    ajustarSombra(comPredio && !E.aberto)
    E.ajustarSombra = ajustarSombra
    sol.shadow.bias = -0.0004; sol.shadow.normalBias = 0.02
    mundo.add(sol)

    // terreno e pisos
    const chao = new THREE.Mesh(new THREE.PlaneGeometry(comPredio ? 500 : tam * 4, comPredio ? 500 : tam * 4), new THREE.MeshStandardMaterial({ color: escuro ? 0x111827 : 0xdfe4e8, roughness: 1 }))
    chao.rotation.x = -Math.PI / 2; chao.position.y = -0.02; chao.receiveShadow = true; mundo.add(chao)
    chao.material.color.set(escuro || ceu.noite ? 0x1c2a1f : 0x9cb88e)
    const calcada = new THREE.Mesh(new THREE.PlaneGeometry((x1 - x0) * S + 2.4, (y1 - y0) * S + 2.4), new THREE.MeshStandardMaterial({ color: escuro || ceu.noite ? 0x2a2f36 : 0xc9ccd1, roughness: 0.95 }))
    calcada.rotation.x = -Math.PI / 2; calcada.position.y = -0.01; calcada.receiveShadow = true; mundo.add(calcada)
    // árvores do lado de fora (balançam com o vento)
    const arvores = []
    const matTronco = new THREE.MeshStandardMaterial({ color: 0x6b4f3a, roughness: 0.9 })
    const matCopa = new THREE.MeshStandardMaterial({ color: ceu.noite ? 0x1f3d2b : 0x3f7d4e, roughness: 0.85, flatShading: true })
    const borda = [(x1 - x0) * S / 2 + 2.6, (y1 - y0) * S / 2 + 2.6]
    for (let i = 0; i < (comPredio ? 0 : 14); i++) {
      const lado = i % 4, f = (Math.floor(i / 4) + 0.5 + r() * 0.3) / 4
      const ax = lado < 2 ? (f - 0.5) * borda[0] * 2 : (lado === 2 ? -1 : 1) * borda[0]
      const az = lado < 2 ? (lado === 0 ? -1 : 1) * borda[1] : (f - 0.5) * borda[1] * 2
      const tr = new THREE.Group(); tr.position.set(ax, 0, az); mundo.add(tr)
      const t1 = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.13, 1.2, 8), matTronco); t1.position.y = 0.6; t1.castShadow = true; tr.add(t1)
      const copa = new THREE.Group(); copa.position.y = 1.5; tr.add(copa)
      for (let k = 0; k < 3; k++) { const b = new THREE.Mesh(new THREE.IcosahedronGeometry(0.55 + r() * 0.25, 1), matCopa); b.position.set((r() - 0.5) * 0.5, k * 0.32, (r() - 0.5) * 0.5); b.castShadow = true; copa.add(b) }
      arvores.push({ copa, fase: r() * 6 })
    }
    const pisos = []
    for (const s of salas) {
      const tipoPiso = /reuni|diret/i.test(s.p.nome) ? 'carpete' : s.w * s.h > 300000 ? 'porcelanato' : 'madeira'
      const baseCor = tipoPiso === 'madeira' ? 0xb08a62 : tipoPiso === 'carpete' ? 0x6b7280 : 0xe7e5e4
      const tex = texturaPiso(tipoPiso, baseCor); tex.repeat.set((s.w * S) / (tipoPiso === 'porcelanato' ? 1.6 : 2.2), (s.h * S) / (tipoPiso === 'porcelanato' ? 1.6 : 2.2))
      const cor = new THREE.Color(0xffffff).lerp(new THREE.Color(s.p.cor || '#0f766a'), 0.12)
      if (escuro) cor.multiplyScalar(0.8)
      const piso = new THREE.Mesh(new THREE.PlaneGeometry(s.w * S, s.h * S), new THREE.MeshStandardMaterial({ color: cor, map: tex, roughness: tipoPiso === 'porcelanato' ? 0.35 : 0.8, metalness: tipoPiso === 'porcelanato' ? 0.05 : 0 }))
      piso.rotation.x = -Math.PI / 2; piso.position.set(W(s.x + s.w / 2), 0, Z(s.y + s.h / 2)); piso.receiveShadow = true
      piso.userData = { tipo: 'sala', id: s.p.id }
      mundo.add(piso); pisos.push(piso)
    }

    // paredes
    const matParede = new THREE.MeshStandardMaterial({ color: escuro ? 0xcbd5e1 : 0xfafaf9, roughness: 0.9 })
    const matTopo = new THREE.MeshStandardMaterial({ color: escuro ? 0x0f172a : 0x334155, roughness: 0.6 })
    const matVidro = new THREE.MeshStandardMaterial({ color: 0xa7cbe6, roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.3, depthWrite: false })
    const matMadeira = new THREE.MeshStandardMaterial({ color: 0x9c6b3f, roughness: 0.7 })
    const ESP = 0.12
    const bloco = (horiz, k, a, b, ya, yb, mat, topo = false) => {
      const comp = (b - a) * S, alt = yb - ya
      if (comp <= 0.01 || alt <= 0) return
      const m = new THREE.Mesh(new THREE.BoxGeometry(horiz ? comp : ESP, alt, horiz ? ESP : comp), mat)
      m.position.set(horiz ? W((a + b) / 2) : W(k), ya + alt / 2, horiz ? Z(k) : Z((a + b) / 2))
      m.castShadow = true; m.receiveShadow = true; mundo.add(m)
      if (topo) { const c = new THREE.Mesh(new THREE.BoxGeometry(horiz ? comp : ESP + 0.01, 0.02, horiz ? ESP + 0.01 : comp), matTopo); c.position.copy(m.position); c.position.y = yb + 0.01; mundo.add(c) }
    }
    // Paredes: vidro só na parede da porta de cada sala privativa (a que dá para o salão), menos onde ela for externa.
    // Todo o resto é alvenaria: paredes externas (com a da entrada), laterais entre salas, bancada e reunião.
    // As janelas (da planta e a criada em frente à porta de cada sala) têm peitoril, caixilho e verga.
    const matVidroParede = new THREE.MeshStandardMaterial({ color: escuro ? 0xb6d7ef : 0xe3f2fd, roughness: 0.08, metalness: 0, transparent: true, opacity: escuro ? 0.1 : 0.13, depthWrite: false, side: THREE.DoubleSide })
    const matPerfil = new THREE.MeshStandardMaterial({ color: escuro ? 0x94a3b8 : 0xcbd5e1, roughness: 0.45, metalness: 0.15 })
    const matPeitoril = new THREE.MeshStandardMaterial({ color: 0xd6d3d1, roughness: 0.6 })
    // lâminas da persiana: listras claras com uma fresta quase transparente entre elas (uma textura para todas)
    const texPersiana = (() => {
      const c = document.createElement('canvas'); c.width = 8; c.height = 32
      const g = c.getContext('2d'); g.clearRect(0, 0, 8, 32)
      const gr = g.createLinearGradient(0, 0, 0, 26); gr.addColorStop(0, '#f5f5f4'); gr.addColorStop(1, '#c9c5c0')
      g.fillStyle = gr; g.fillRect(0, 0, 8, 26)
      g.fillStyle = 'rgba(120,113,108,0.25)'; g.fillRect(0, 26, 8, 6)
      const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(1, 26); t.colorSpace = THREE.SRGBColorSpace
      return t
    })()
    const matPersiana = new THREE.MeshStandardMaterial({ map: texPersiana, transparent: true, roughness: 0.7, side: THREE.DoubleSide, depthWrite: false })
    const matPersianaCaixa = new THREE.MeshStandardMaterial({ color: 0xe7e5e4, roughness: 0.5 })
    const obstaculos = []   // retângulos que ninguém atravessa (metros): paredes, mesas, cadeiras, armários
    const bloquear = (x, z, w, d, ry = 0) => obstaculos.push({ x, z, w, d, ry })
    const vidro = (horiz, k, a, b, ya, yb) => {
      const comp = (b - a) * S, alt = yb - ya
      if (comp <= 0.01 || alt <= 0) return
      const cx2 = horiz ? W((a + b) / 2) : W(k), cz2 = horiz ? Z(k) : Z((a + b) / 2)
      const v = new THREE.Mesh(new THREE.BoxGeometry(horiz ? comp : 0.02, alt, horiz ? 0.02 : comp), matVidroParede)
      v.position.set(cx2, ya + alt / 2, cz2); v.renderOrder = 2; mundo.add(v)
      for (const y of [ya + 0.02, yb - 0.02]) { const pf = new THREE.Mesh(new THREE.BoxGeometry(horiz ? comp : 0.05, 0.04, horiz ? 0.05 : comp), matPerfil); pf.position.set(cx2, y, cz2); mundo.add(pf) }
      const n = Math.max(1, Math.round(comp / 1.2))
      for (let i = 0; i <= n; i++) {
        const f = (a + (b - a) * (i / n)) * S
        const m = new THREE.Mesh(new THREE.BoxGeometry(0.035, alt, 0.035), matPerfil)
        m.position.set(horiz ? (f - cx * S) : cx2, ya + alt / 2, horiz ? cz2 : (f - cy * S)); mundo.add(m)
      }
    }
    const janela = (sg) => {
      const comp = (sg.b - sg.a) * S
      const cx2 = sg.horiz ? W((sg.a + sg.b) / 2) : W(sg.k), cz2 = sg.horiz ? Z(sg.k) : Z((sg.a + sg.b) / 2)
      bloco(sg.horiz, sg.k, sg.a, sg.b, 0, Math.min(0.92, ALT), matParede, ALT <= 0.92)
      if (ALT <= 0.92) return
      const topoV = Math.min(2.2, ALT)
      const peca = (w, h, d, m, y, desl = 0) => {
        const o = new THREE.Mesh(new THREE.BoxGeometry(sg.horiz ? w : d, h, sg.horiz ? d : w), m)
        o.position.set(cx2 + (sg.horiz ? desl : 0), y, cz2 + (sg.horiz ? 0 : desl)); mundo.add(o); return o
      }
      peca(comp + 0.04, 0.035, ESP + 0.1, matPeitoril, 0.94)
      peca(comp, topoV - 0.96, 0.015, matVidro, (0.96 + topoV) / 2).renderOrder = 2
      for (const y of [0.975, topoV - 0.02]) peca(comp, 0.04, 0.07, matPerfil, y)
      peca(comp, 0.03, 0.06, matPerfil, 0.96 + (topoV - 0.96) * 0.64)
      for (const f of [-0.5, 0, 0.5]) peca(0.04, topoV - 0.96, 0.07, matPerfil, (0.96 + topoV) / 2, f * (comp - 0.04))
      if (ALT > topoV) bloco(sg.horiz, sg.k, sg.a, sg.b, topoV, ALT, matParede, true)
      // persiana horizontal do lado de dentro, meio abaixada: caixa no alto, lâminas, régua de baixo e cordão
      const dentro = (sg.horiz ? (sg.k < cy ? 1 : -1) : (sg.k < cx ? 1 : -1)) * (ESP / 2 + 0.045)
      const lam = (w, h, d, m, y, desl = 0) => {
        const o = new THREE.Mesh(new THREE.BoxGeometry(sg.horiz ? w : d, h, sg.horiz ? d : w), m)
        o.position.set(cx2 + (sg.horiz ? desl : dentro), y, cz2 + (sg.horiz ? dentro : desl)); mundo.add(o); return o
      }
      const baixa = topoV - (topoV - 0.96) * 0.58, hp = topoV - 0.05 - baixa
      lam(comp + 0.06, 0.06, 0.07, matPersianaCaixa, topoV - 0.02)
      const tela = lam(comp + 0.02, hp, 0.012, matPersiana, baixa + hp / 2); tela.renderOrder = 3
      lam(comp + 0.03, 0.025, 0.035, matPersianaCaixa, baixa)
      lam(0.008, hp + 0.2, 0.008, matPerfil, baixa - 0.1 + hp / 2 + 0.05, comp / 2 - 0.06)
    }
    const batente = (sg) => {
      const comp = (sg.b - sg.a) * S, alt = Math.min(2.1, ALT)
      const cx2 = sg.horiz ? W((sg.a + sg.b) / 2) : W(sg.k), cz2 = sg.horiz ? Z(sg.k) : Z((sg.a + sg.b) / 2)
      for (const f of [-0.5, 0.5]) {
        const o = new THREE.Mesh(new THREE.BoxGeometry(sg.horiz ? 0.05 : ESP + 0.04, alt, sg.horiz ? ESP + 0.04 : 0.05), matMadeira)
        o.position.set(cx2 + (sg.horiz ? f * comp : 0), alt / 2, cz2 + (sg.horiz ? 0 : f * comp)); mundo.add(o)
      }
      if (ALT > 2.1) { const o = new THREE.Mesh(new THREE.BoxGeometry(sg.horiz ? comp + 0.05 : ESP + 0.04, 0.05, sg.horiz ? ESP + 0.04 : comp + 0.05), matMadeira); o.position.set(cx2, 2.1, cz2); mundo.add(o) }
    }
    // paredes cortadas também nas divisas entre salas, para cada trecho saber de que sala é
    const segs = []
    for (const sg of paredes(salas, mapa.elementos)) {
      if (sg.tipo !== 'cheia') { segs.push(sg); continue }
      const pts = [...new Set(salas.flatMap((s) => sg.horiz ? [s.x, s.x + s.w] : [s.y, s.y + s.h]))].filter((c) => c > sg.a + 1 && c < sg.b - 1).sort((a, b) => a - b)
      let ini = sg.a
      for (const c of pts) { segs.push({ ...sg, a: ini, b: c }); ini = c }
      segs.push({ ...sg, a: ini, b: sg.b })
    }
    const externa = (sg) => sg.horiz ? Math.abs(sg.k - y0) < 8 || Math.abs(sg.k - y1) < 8 : Math.abs(sg.k - x0) < 8 || Math.abs(sg.k - x1) < 8
    const privativas = salasPrivativas(mapa, salas.map((s) => s.p))
    // salas dos dois lados de um trecho de parede
    const vizinhas = (sg) => {
      const meio = (sg.a + sg.b) / 2
      return salas.filter((s) => sg.horiz
        ? (Math.abs(sg.k - s.y) < 8 || Math.abs(sg.k - (s.y + s.h)) < 8) && meio > s.x && meio < s.x + s.w
        : (Math.abs(sg.k - s.x) < 8 || Math.abs(sg.k - (s.x + s.w)) < 8) && meio > s.y && meio < s.y + s.h)
    }
    const idsPriv = new Set(privativas.map((v) => v.p.id))
    const maiorSala = [...salas].sort((a, b) => b.w * b.h - a.w * a.h)[0]
    // vidro: (1) parede da porta das salas privativas; (2) divisórias entre duas salas privativas;
    // (3) a parede da bancada que dá para o salão. Nunca nas externas.
    const deVidro = (sg) => {
      if (externa(sg)) return false
      const meio = (sg.a + sg.b) / 2
      const portaPriv = privativas.some(({ s, lado }) => {
        if (lado === 'cima' || lado === 'baixo') return sg.horiz && Math.abs(sg.k - (lado === 'cima' ? s.y : s.y + s.h)) < 8 && meio > s.x && meio < s.x + s.w
        return !sg.horiz && Math.abs(sg.k - (lado === 'esq' ? s.x : s.x + s.w)) < 8 && meio > s.y && meio < s.y + s.h
      })
      if (portaPriv) return true
      const lados = vizinhas(sg)
      if (lados.length === 2 && lados.every((s) => idsPriv.has(s.p.id))) return true
      if (lados.length === 2 && lados.some((s) => s === maiorSala) && lados.some((s) => /bancada/i.test(s.p.nome))) return true
      return false
    }
    let entrada = null
    for (const sg of segs) {
      const vid = deVidro(sg)
      const comp = (sg.b - sg.a) * S
      const cx2 = sg.horiz ? W((sg.a + sg.b) / 2) : W(sg.k), cz2 = sg.horiz ? Z(sg.k) : Z((sg.a + sg.b) / 2)
      if (sg.tipo !== 'porta') bloquear(cx2, cz2, sg.horiz ? comp : ESP, sg.horiz ? ESP : comp)
      if (sg.tipo === 'cheia') { if (vid) vidro(sg.horiz, sg.k, sg.a, sg.b, 0, ALT); else bloco(sg.horiz, sg.k, sg.a, sg.b, 0, ALT, matParede, true) }
      else if (sg.tipo === 'porta') {
        if (ALT > 2.1) { if (vid) vidro(sg.horiz, sg.k, sg.a, sg.b, 2.1, ALT); else bloco(sg.horiz, sg.k, sg.a, sg.b, 2.1, ALT, matParede, true) }
        batente(sg)
        if (externa(sg) && !entrada) entrada = { x: cx2, z: cz2, lado: sg.horiz ? (Math.abs(sg.k - y0) < 8 ? 'norte' : 'sul') : (Math.abs(sg.k - x0) < 8 ? 'oeste' : 'leste') }
      } else janela(sg)
    }

    // prédio em volta (fecha o andar; clicar abre)
    const andar = Number.isFinite(+mapa.andar) ? +mapa.andar : 9
    const predio = comPredio ? montarPredio({ bx0: W(x0) - 0.35, bx1: W(x1) + 0.35, bz0: Z(y0) - 0.35, bz1: Z(y1) + 0.35, entrada, nome: marca?.nome || '', noite: ceu.noite, r, andar }) : null
    if (predio) {
      mundo.add(predio.grupo); predio.aplicar(E.aberto ? 1 : 0); predio.tick(0, 0)
      chao.position.y = -predio.yA - 0.02; calcada.visible = false
      // placa do andar do escritório, visível com o prédio fechado
      const pl = etiqueta(`${marca?.nome || 'Escritório'} · ${andar}º andar`, '#ffffff', 'rgba(15,118,106,0.92)')
      pl.position.set(W(x1) + 3, 2, Z(y1) + 3); pl.scale.multiplyScalar(7); mundo.add(pl); E.placaAndar = pl
    }
    E.predio = predio
    // luz de teto: painéis acesos (fortes à noite) e uma luz por sala
    const paineis = []
    const matPainel = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff4dc, emissiveIntensity: ceu.noite ? 1.6 : ceu.crepusculo ? 0.9 : 0.35 })   // só a face de baixo: de cima não aparece
    if (ALT > 2) for (const s of salas) {
      const nx = Math.max(1, Math.round((s.w * S) / 2.6)), nz = Math.max(1, Math.round((s.h * S) / 2.6))
      for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) {
        const pn = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.6), matPainel)
        pn.rotation.x = Math.PI / 2; pn.position.set(W(s.x + (s.w * (i + 0.5)) / nx), ALT - 0.015, Z(s.y + (s.h * (j + 0.5)) / nz)); mundo.add(pn)
      }
      if (ceu.noite || ceu.crepusculo) {
        const l = new THREE.PointLight(0xffe7c2, ceu.noite ? 1.6 : 0.8, Math.max(s.w, s.h) * S * 1.1, 1.6)
        l.position.set(W(s.x + s.w / 2), ALT - 0.3, Z(s.y + s.h / 2)); mundo.add(l); paineis.push(l)
      }
    }
    if (ceu.noite) matVidro.emissive = new THREE.Color(0xffd89a), matVidro.emissiveIntensity = 0.35

    // móveis e elementos
    const pessoas = []
    const matMesa = new THREE.MeshStandardMaterial({ color: escuro ? 0xd6d3d1 : 0xe7e5e4, roughness: 0.5 })
    const matPreto = new THREE.MeshStandardMaterial({ color: 0x1f2937, roughness: 0.4 })
    const matTela = new THREE.MeshStandardMaterial({ color: 0x0b1220, emissive: 0x2563eb, emissiveIntensity: 0.35, roughness: 0.2 })
    const matCadeira = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.6 })
    // conteúdo da TV: painel com o nome da marca, um gráfico de linha e barras (desenho, não dado real)
    const texTela = (() => {
      const c = document.createElement('canvas'); c.width = 512; c.height = 288
      const g = c.getContext('2d')
      g.fillStyle = '#0b1220'; g.fillRect(0, 0, 512, 288)
      g.fillStyle = '#0f766a'; g.fillRect(0, 0, 512, 34)
      g.fillStyle = '#ffffff'; g.font = '600 18px system-ui, sans-serif'; g.textBaseline = 'middle'; g.fillText(marca?.nome || 'Clima Escritório', 14, 18)
      g.strokeStyle = '#38bdf8'; g.lineWidth = 3; g.beginPath()
      for (let i = 0; i <= 20; i++) { const xx = 20 + i * 15, yy = 150 - Math.sin(i * 0.6) * 30 - i * 2; if (i) g.lineTo(xx, yy); else g.moveTo(xx, yy) }
      g.stroke()
      for (let i = 0; i < 7; i++) { g.fillStyle = i % 2 ? '#14b8a6' : '#3b82f6'; const hh = 30 + ((i * 37) % 70); g.fillRect(350 + i * 20, 250 - hh, 14, hh) }
      g.fillStyle = '#1e293b'; for (let i = 0; i < 3; i++) g.fillRect(20 + i * 104, 200, 94, 60)
      const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace
      return t
    })()
    const caixa = (w, h, d, mat, x, y, z, ry = 0, pai = mundo) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); m.rotation.y = ry; m.castShadow = true; m.receiveShadow = true; pai.add(m); return m
    }
    const cadeira = (pai, x, z, ry) => {
      const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = ry; pai.add(g)
      caixa(0.46, 0.06, 0.46, matCadeira, 0, 0.46, 0, 0, g); caixa(0.46, 0.5, 0.06, matCadeira, 0, 0.74, -0.22, 0, g)
      caixa(0.05, 0.42, 0.05, matPreto, 0, 0.22, 0, 0, g)
      return g
    }
    // estação: mesa + monitor + teclado + cadeira, opcionalmente com alguém sentado
    const matTampo = new THREE.MeshStandardMaterial({ color: 0x8a6440, roughness: 0.55 })
    const matGaveteiro = new THREE.MeshStandardMaterial({ color: escuro ? 0x3f3f46 : 0x52525b, roughness: 0.7 })
    const matArmario = new THREE.MeshStandardMaterial({ color: 0x7a4a2a, roughness: 0.65 })
    const matArmarioTopo = new THREE.MeshStandardMaterial({ color: 0x5c3a21, roughness: 0.55 })
    // frente do armário de gavetas: grade de gavetas em madeira, cada uma com puxador e etiqueta do que guarda
    const GAVETAS = ['Cabos de rede', 'HDMI', 'Fontes', 'Cabos de força', 'USB', 'DisplayPort', 'VGA / DVI', 'Adaptadores',
      'Conectores RJ45', 'Patch cords', 'Teclados', 'Mouses', 'Carregadores', 'Extensões', 'Filtros de linha', 'Pilhas',
      'Memória RAM', 'HDs e SSDs', 'Pen drives', 'Pasta térmica', 'Parafusos', 'Ferramentas', 'Abraçadeiras', 'Fitas',
      'Áudio P2', 'Webcams', 'Headsets', 'Controles IR', 'Etiquetas', 'Diversos']
    const texGavetas = (longo, alt) => {
      const cols = Math.max(3, Math.round(longo / 0.3)), lin = Math.max(3, Math.round(alt / 0.26))
      const c = document.createElement('canvas'); c.width = 1024; c.height = Math.round(1024 * alt / longo)
      const g = c.getContext('2d'), gw = c.width / cols, gh = c.height / lin
      g.fillStyle = '#4a2c17'; g.fillRect(0, 0, c.width, c.height)
      let k = 0
      for (let j = 0; j < lin; j++) for (let i = 0; i < cols; i++) {
        const x0 = i * gw + 3, y0 = j * gh + 3, ww = gw - 6, hh = gh - 6
        const gr = g.createLinearGradient(0, y0, 0, y0 + hh); gr.addColorStop(0, '#9a6538'); gr.addColorStop(1, '#7c4d29')
        g.fillStyle = gr; g.fillRect(x0, y0, ww, hh)
        g.strokeStyle = 'rgba(255,255,255,0.12)'; g.strokeRect(x0 + 1, y0 + 1, ww - 2, hh - 2)
        // etiqueta
        const ew = ww * 0.8, eh = Math.min(hh * 0.3, 30)
        g.fillStyle = '#f8f5ee'; g.fillRect(x0 + (ww - ew) / 2, y0 + hh * 0.14, ew, eh)
        g.fillStyle = '#1c1917'; g.textAlign = 'center'; g.textBaseline = 'middle'
        let fs = Math.floor(eh * 0.62); g.font = `600 ${fs}px system-ui, sans-serif`
        const txt = GAVETAS[k++ % GAVETAS.length]
        while (g.measureText(txt).width > ew - 6 && fs > 8) { fs--; g.font = `600 ${fs}px system-ui, sans-serif` }
        g.fillText(txt, x0 + ww / 2, y0 + hh * 0.14 + eh / 2 + 1)
        // puxador
        g.fillStyle = '#d6d3d1'; g.fillRect(x0 + ww * 0.3, y0 + hh * 0.66, ww * 0.4, Math.max(4, hh * 0.08))
        g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(x0 + ww * 0.3, y0 + hh * 0.66 + Math.max(4, hh * 0.08), ww * 0.4, 2)
      }
      const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4
      return t
    }
    const estacao = (pai, x, z, ry, comPessoa, nome, semMesa = false) => {
      const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = ry; pai.add(g)
      if (!semMesa) {
        // mesa individual: tampo de madeira, laterais em painel, painel frontal e gaveteiro
        const tampo = new THREE.Mesh(new RoundedBoxGeometry(1.3, 0.045, 0.72, 3, 0.012), matTampo); tampo.position.y = 0.745; tampo.castShadow = tampo.receiveShadow = true; g.add(tampo)
        for (const px of [-0.62, 0.62]) caixa(0.04, 0.72, 0.68, matGaveteiro, px, 0.36, 0, 0, g)
        caixa(1.2, 0.42, 0.025, matGaveteiro, 0, 0.5, -0.33, 0, g)
        caixa(0.4, 0.56, 0.55, matGaveteiro, -0.38, 0.29, -0.02, 0, g)
        for (const y of [0.16, 0.34, 0.5]) caixa(0.12, 0.012, 0.012, matPerfil, -0.38, y, 0.26, 0, g)
        caixa(0.21, 0.004, 0.3, new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.9 }), -0.42, 0.77, 0.05, 0.15, g)   // papéis
        caixa(0.08, 0.1, 0.08, new THREE.MeshStandardMaterial({ color: 0xe5e7eb, roughness: 0.4 }), 0.52, 0.82, -0.18, 0, g)   // caneca
        caixa(0.06, 0.03, 0.1, matPreto, 0.32, 0.785, 0.08, 0, g)   // mouse
      } else {
        caixa(0.36, 0.008, 0.26, new THREE.MeshStandardMaterial({ color: 0x27272a, roughness: 0.9 }), 0.32, 0.765, 0.08, 0, g)   // mouse pad
        caixa(0.06, 0.03, 0.1, matPreto, 0.32, 0.785, 0.08, 0, g)   // mouse
      }
      caixa(0.6, 0.36, 0.03, matPreto, 0, 1.06, -0.22, 0, g)
      const tela = caixa(0.56, 0.32, 0.005, matTela, 0, 1.06, -0.203, 0, g); tela.castShadow = false
      caixa(0.05, 0.14, 0.05, matPreto, 0, 0.83, -0.24, 0, g)
      caixa(0.42, 0.015, 0.14, matPreto, 0, 0.77, 0.05, 0, g)
      cadeira(g, 0, 0.55, Math.PI)
      if (comPessoa) {
        const p = pessoa(r, true); p.position.set(0, 0, 0.5); p.rotation.y = Math.PI; g.add(p); pessoas.push(p)
        if (nome) { const et = etiqueta(nome); et.position.set(0, 1.75, 0.5); g.add(et) }
      }
      return g
    }
    const NAO_PESSOA = /^(sala\s+)?(bancada|reuni|escrit|sem nome|apoio|t[eé]cnica)/i
    for (const e of mapa.elementos) {
      const [mx, my] = girar(e, e.w / 2, e.h / 2)
      const x = W(mx), z = Z(my), ry = -(e.rot || 0) * Math.PI / 180
      const w = e.w * S, d = e.h * S
      if (e.tipo === 'mesa') {
        // fileira de estações dos dois lados do eixo mais comprido
        const longo = Math.max(w, d), curto = Math.min(w, d), vertical = d > w
        const n = Math.max(1, Math.floor(longo / 1.25))
        const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = ry + (vertical ? Math.PI / 2 : 0); mundo.add(g)
        // uma bancada só, contínua, com as estações dos dois lados e uma divisória baixa no meio
        const meio = curto / 4 + 0.05, prof = meio * 2 + 0.7, comp = Math.max(longo, 1.3)
        const tampo = new THREE.Mesh(new RoundedBoxGeometry(comp, 0.045, prof, 3, 0.015), matMesa); tampo.position.y = 0.745; tampo.castShadow = tampo.receiveShadow = true; g.add(tampo)
        const borda = new THREE.Mesh(new THREE.BoxGeometry(comp + 0.004, 0.012, prof + 0.004), new THREE.MeshStandardMaterial({ color: 0x9ca3af, roughness: 0.4, metalness: 0.5 })); borda.position.y = 0.718; g.add(borda)
        const nPes = Math.max(2, Math.round(comp / 2.4) + 1)
        for (let i = 0; i < nPes; i++) {   // pés em painel, de um lado ao outro da bancada
          const px = -comp / 2 + 0.06 + (comp - 0.12) * (i / (nPes - 1))
          caixa(0.05, 0.72, prof - 0.12, matPreto, px, 0.36, 0, 0, g)
          caixa(0.07, 0.02, prof - 0.04, matPreto, px, 0.01, 0, 0, g)
        }
        caixa(comp - 0.1, 0.04, 0.06, matPreto, 0, 0.66, 0, 0, g)   // calha de cabos
        const divisoria = new THREE.Mesh(new RoundedBoxGeometry(comp - 0.08, 0.34, 0.035, 2, 0.012), new THREE.MeshStandardMaterial({ color: escuro ? 0x475569 : 0x64748b, roughness: 0.95 }))
        divisoria.position.y = 0.94; divisoria.castShadow = true; g.add(divisoria)
        bloquear(x, z, comp + 0.1, prof + 1.25, g.rotation.y)
        for (let i = 0; i < n; i++) {
          const ax = -longo / 2 + longo * (i + 0.5) / n
          estacao(g, ax, -meio, Math.PI, r() > 0.35, null, true)
          estacao(g, ax, meio, 0, r() > 0.45, null, true)
        }
      } else if (e.tipo === 'estacao') {
        // mesa individual com a pessoa (rot 0 = olhando para o "norte" da planta); etiqueta com o nome da sala-pessoa
        const sala = salas.find((s) => mx > s.x && mx < s.x + s.w && my > s.y && my < s.y + s.h)
        const nome = e.rotulo || (sala && /^sala\s+(.+)/i.test(sala.p.nome.trim()) && !NAO_PESSOA.test(sala.p.nome.trim()) ? sala.p.nome.trim().replace(/^sala\s+/i, '') : null)
        estacao(mundo, x, z, ry, true, nome)
        bloquear(x + Math.sin(ry) * 0.2, z + Math.cos(ry) * 0.2, 1.36, 1.25, ry)
      } else if (e.tipo === 'bancada') {
        // bancada técnica encostada na parede: um posto a cada ~1,2 m, cada um com monitor, teclado, mouse e cadeira.
        // rot 0 = quem senta fica do lado de baixo da planta, olhando para a parede de cima (vertical: olha para a esquerda)
        const vertical = d > w * 1.2, longo = vertical ? d : w, prof = Math.max(0.55, vertical ? w : d)
        const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = ry + (vertical ? Math.PI / 2 : 0); mundo.add(g)
        const tampo = new THREE.Mesh(new RoundedBoxGeometry(longo, 0.045, prof, 3, 0.012), matTampo); tampo.position.y = 0.745; tampo.castShadow = tampo.receiveShadow = true; g.add(tampo)
        for (const px of [-longo / 2 + 0.03, longo / 2 - 0.03]) caixa(0.04, 0.72, prof - 0.04, matGaveteiro, px, 0.36, 0, 0, g)
        caixa(longo - 0.08, 0.36, 0.025, matGaveteiro, 0, 0.53, -prof / 2 + 0.03, 0, g)
        caixa(longo - 0.1, 0.04, 0.06, matPreto, 0, 0.68, -prof / 2 + 0.1, 0, g)   // calha de cabos
        const n = Math.max(1, Math.round(longo / 1.2))
        for (let i = 0; i < n; i++) {
          const ax = -longo / 2 + longo * (i + 0.5) / n, fz = -prof / 2 + 0.16
          caixa(0.6, 0.36, 0.03, matPreto, ax, 1.07, fz, 0, g)
          const tela = caixa(0.56, 0.32, 0.005, matTela, ax, 1.07, fz + 0.017, 0, g); tela.castShadow = false
          caixa(0.05, 0.16, 0.05, matPreto, ax, 0.84, fz - 0.02, 0, g); caixa(0.22, 0.012, 0.16, matPreto, ax, 0.774, fz - 0.01, 0, g)
          caixa(0.42, 0.015, 0.14, matPreto, ax - 0.04, 0.775, fz + 0.3, 0, g)   // teclado
          caixa(0.24, 0.004, 0.2, new THREE.MeshStandardMaterial({ color: 0x27272a, roughness: 0.9 }), ax + 0.33, 0.769, fz + 0.3, 0, g)   // mouse pad
          caixa(0.06, 0.03, 0.1, matPreto, ax + 0.33, 0.786, fz + 0.3, 0, g)   // mouse
          cadeira(g, ax, prof / 2 + 0.25, Math.PI)
          if (i === 0 && r() > 0.3) { const p = pessoa(r, true); p.position.set(ax, 0, prof / 2 + 0.2); p.rotation.y = Math.PI; g.add(p); pessoas.push(p) }
        }
        const th = g.rotation.y; bloquear(x + Math.sin(th) * 0.3, z + Math.cos(th) * 0.3, longo + 0.06, prof + 0.6, th)
      } else if (e.tipo === 'gaveteiro') {
        // armário marrom de gavetas etiquetadas (material de TI); rot 0 = frente para baixo da planta (vertical: para a direita)
        const vertical = d > w * 1.2, longo = vertical ? d : w, prof = Math.max(0.35, vertical ? w : d), alt = 1.3
        const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = ry + (vertical ? Math.PI / 2 : 0); mundo.add(g)
        caixa(longo, alt, prof, matArmario, 0, alt / 2 + 0.06, 0, 0, g)
        caixa(longo - 0.04, 0.06, prof - 0.04, matPreto, 0, 0.03, 0, 0, g)   // rodapé
        caixa(longo + 0.03, 0.03, prof + 0.03, matArmarioTopo, 0, alt + 0.075, 0, 0, g)
        const frente = new THREE.Mesh(new THREE.PlaneGeometry(longo - 0.03, alt - 0.03), new THREE.MeshStandardMaterial({ map: texGavetas(longo, alt), roughness: 0.6 }))
        frente.position.set(0, alt / 2 + 0.06, prof / 2 + 0.002); g.add(frente)
        bloquear(x, z, w, d, ry)
      } else if (e.tipo === 'armario') {
        bloquear(x, z, w, d, ry)
        caixa(w, 1.0, d, matMadeira, x, 0.5, z, ry)
        caixa(w * 0.95, 0.03, d * 0.95, matMesa, x, 1.015, z, ry)
        const cafe = caixa(0.25, 0.32, 0.25, matPreto, x, 1.19, z, ry); cafe.castShadow = true   // cafeteira
      } else if (e.tipo === 'sofa') {
        bloquear(x, z, w, d, ry)
        caixa(w, 0.42, d, matCadeira, x, 0.21, z, ry); caixa(w, 0.4, 0.18, matCadeira, x, 0.6, z, ry)
      } else if (e.tipo === 'coluna' || e.tipo === 'parede') {
        bloquear(x, z, w, d, ry)
        caixa(w, ALT, d, matParede, x, ALT / 2, z, ry)
      } else if (e.tipo === 'parede') {
        caixa(w, ALT, d, matParede, x, ALT / 2, z, ry)
      } else if (e.tipo === 'planta') {
        bloquear(x, z, 0.4, 0.4)
        const vaso = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.12, 0.35, 16), new THREE.MeshStandardMaterial({ color: 0x78716c })); vaso.position.set(x, 0.175, z); vaso.castShadow = true; mundo.add(vaso)
        for (let i = 0; i < 4; i++) { const f = new THREE.Mesh(new THREE.IcosahedronGeometry(0.2 + r() * 0.08, 1), new THREE.MeshStandardMaterial({ color: 0x2f855a, roughness: 0.9, flatShading: true })); f.position.set(x + (r() - 0.5) * 0.2, 0.55 + r() * 0.35, z + (r() - 0.5) * 0.2); f.castShadow = true; mundo.add(f) }
      } else if (e.tipo === 'monitor') {
        // TV/monitor de parede (16:9) com suporte; a tela olha para +y da planta girado por rot (antigo vertical: +x)
        const vertical = d > w, larg = Math.max(w, d), alt = larg * 0.5625
        const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = ry + (vertical ? Math.PI / 2 : 0); mundo.add(g)
        const corpo = new THREE.Mesh(new RoundedBoxGeometry(larg, alt, 0.045, 2, 0.01), matPreto); corpo.position.set(0, 1.55, -0.01); corpo.castShadow = true; g.add(corpo)
        caixa(larg * 0.3, alt * 0.4, 0.03, matPreto, 0, 1.55, -0.045, 0, g)   // suporte de parede
        const tela = new THREE.Mesh(new THREE.PlaneGeometry(larg * 0.965, alt * 0.94), new THREE.MeshStandardMaterial({ map: texTela, emissiveMap: texTela, emissive: 0xffffff, emissiveIntensity: ceu.noite ? 0.9 : 0.55, roughness: 0.25 }))
        tela.position.set(0, 1.55, 0.0135); g.add(tela)
        const led = new THREE.Mesh(new THREE.SphereGeometry(0.006, 8, 6), new THREE.MeshBasicMaterial({ color: 0x22c55e })); led.position.set(larg * 0.45, 1.55 - alt * 0.49, 0.015); g.add(led)
      } else if (e.tipo === 'porta') {
        // folha aberta a ~70° a partir da dobradiça (canto local 0,h)
        const [hx, hy] = girar(e, 0, e.h), [fx, fy] = girar(e, e.w, e.h)
        const ang = Math.atan2(fy - hy, fx - hx)
        const folha = new THREE.Group(); folha.position.set(W(hx), 0, Z(hy)); folha.rotation.y = -ang + 1.45; mundo.add(folha)
        caixa(e.w * S * 0.95, 2.05, 0.04, matMadeira, e.w * S * 0.475, 1.025, 0, 0, folha)
        const maca = new THREE.Mesh(new THREE.SphereGeometry(0.03, 10, 8), matPerfil); maca.position.set(e.w * S * 0.85, 1.0, 0.04); folha.add(maca)
        const L = e.w * S * 0.95, fr = folha.rotation.y
        bloquear(W(hx) + Math.cos(fr) * L / 2, Z(hy) - Math.sin(fr) * L / 2, L, 0.05, fr)
      }
    }

    // salas sem móvel ganham uma mesa de trabalho (com o dono da sala, quando o nome da sala é o de uma pessoa)
    for (const s of salas) {
      const temMovel = mapa.elementos.some((e) => ['mesa', 'bancada', 'sofa', 'estacao', 'gaveteiro'].includes(e.tipo) && (() => { const [a, b] = girar(e, e.w / 2, e.h / 2); return a > s.x && a < s.x + s.w && b > s.y && b < s.y + s.h })())
      if (temMovel) continue
      const nomeSala = s.p.nome.trim()
      if (/reuni/i.test(nomeSala)) {
        const mx = W(s.x + s.w * 0.55), mz = Z(s.y + s.h * 0.5)
        const mesa = new THREE.Mesh(new RoundedBoxGeometry(2.4, 0.05, 1.1, 3, 0.02), matMadeira); mesa.position.set(mx, 0.75, mz); mesa.castShadow = true; mundo.add(mesa)
        caixa(0.08, 0.72, 0.6, matPreto, mx, 0.37, mz)
        for (let i = 0; i < 3; i++) { cadeira(mundo, mx - 0.8 + i * 0.8, mz - 0.85, 0); cadeira(mundo, mx - 0.8 + i * 0.8, mz + 0.85, Math.PI) }
        bloquear(mx, mz, 2.6, 2.3)
        continue
      }
      const pessoaNome = /^sala\s+(.+)/i.test(nomeSala) && !NAO_PESSOA.test(nomeSala) ? nomeSala.replace(/^sala\s+/i, '') : null
      const vertical = s.h > s.w
      const ex = W(s.x + s.w * (vertical ? 0.5 : 0.62)), ez = Z(s.y + s.h * 0.42)
      estacao(mundo, ex, ez, Math.PI, true, pessoaNome)
      bloquear(ex, ez - 0.2, 1.36, 1.25)
    }

    // gente andando: rota por A* numa grade de 10 cm (paredes, mesas, cadeiras e portas viram obstáculo), desviando
    // umas das outras pela direita, parando um pouco em cada destino e voltando a andar
    const dentroDeSala = (x, z) => salas.some((s) => x > W(s.x) - 0.12 && x < W(s.x + s.w) + 0.12 && z > Z(s.y) - 0.12 && z < Z(s.y + s.h) + 0.12)
    const grade = criarGrade(W(x0) - 0.3, Z(y0) - 0.3, W(x1) + 0.3, Z(y1) + 0.3, obstaculos, dentroDeSala, 0.22)
    E.grade = grade
    const salao = [...salas].sort((a, b) => b.w * b.h - a.w * a.h)[0]
    const pontoLivre = (s) => {
      for (let k = 0; k < 40; k++) { const x = W(s.x + 30 + Math.random() * (s.w - 60)), z = Z(s.y + 30 + Math.random() * (s.h - 60)); if (celulaLivre(grade, x, z)) return [x, z] }
      return null
    }
    const andarilhos = []
    const novoDestino = (a) => {
      for (let k = 0; k < 8; k++) {
        const s = Math.random() < 0.55 ? salao : salas[Math.floor(Math.random() * salas.length)]
        const alvo = pontoLivre(s)
        if (!alvo) continue
        const rota = caminho(grade, [a.p.position.x, a.p.position.z], alvo)
        if (rota && rota.length > 1) { a.rota = rota; a.i = 1; a.estado = 'andando'; a.preso = 0; return }
      }
      a.estado = 'parado'; a.espera = 2
    }
    const nAndarilhos = salao && salao.w * salao.h > 300000 ? 6 : 2
    for (let i = 0; i < nAndarilhos && salao; i++) {
      const ini = pontoLivre(salao)
      if (!ini) break
      const p = pessoa(r, false); p.position.set(ini[0], 0, ini[1]); p.rotation.y = r() * Math.PI * 2; mundo.add(p)
      andarilhos.push({ p, vel: 0.95 + r() * 0.35, estado: 'parado', espera: 0.4 + i * 0.8, rota: null, i: 0, passo: r() * 6, preso: 0 })
    }
    const moverAndarilho = (a, dt, t) => {
      const P = a.p.position
      if (a.estado === 'parado') { a.espera -= dt; if (a.espera <= 0) novoDestino(a); animarAndar(a.p, a.passo, 0, t); return }
      const [tx, tz] = a.rota[a.i]
      let dx = tx - P.x, dz = tz - P.z
      const dist = Math.hypot(dx, dz)
      if (dist < 0.12) { a.i++; if (a.i >= a.rota.length) { a.estado = 'parado'; a.espera = 2 + Math.random() * 6 } animarAndar(a.p, a.passo, 0.5, t); return }
      dx /= dist; dz /= dist
      let fator = 1, sx = 0, sz = 0
      for (const o of andarilhos) {
        if (o === a) continue
        const ox = o.p.position.x - P.x, oz = o.p.position.z - P.z, d = Math.hypot(ox, oz)
        if (d > 0.9 || d < 1e-4) continue
        if ((ox * dx + oz * dz) / d > 0.3) { fator = Math.min(fator, Math.max(0.15, (d - 0.45) / 0.45)); sx += -dz * (0.9 - d); sz += dx * (0.9 - d) }
        if (d < 0.5) { sx -= (ox / d) * (0.5 - d) * 2; sz -= (oz / d) * (0.5 - d) * 2 }
      }
      let vx = dx + sx, vz = dz + sz
      const n = Math.hypot(vx, vz) || 1; vx /= n; vz /= n
      const passo = a.vel * fator * dt
      let nx = P.x + vx * passo, nz = P.z + vz * passo
      if (!celulaLivre(grade, nx, nz)) { if (celulaLivre(grade, nx, P.z)) nz = P.z; else if (celulaLivre(grade, P.x, nz)) nx = P.x; else { nx = P.x; nz = P.z } }
      const andou = Math.hypot(nx - P.x, nz - P.z)
      P.x = nx; P.z = nz
      a.preso = andou < passo * 0.25 ? a.preso + dt : 0
      if (a.preso > 2.5) { a.preso = 0; novoDestino(a) }
      let dif = Math.atan2(vx, vz) - a.p.rotation.y; dif = Math.atan2(Math.sin(dif), Math.cos(dif))
      a.p.rotation.y += dif * Math.min(1, dt * 8)
      a.passo += (andou / 0.68) * Math.PI
      animarAndar(a.p, a.passo, Math.min(1, andou / Math.max(1e-4, a.vel * dt)), t)
    }

    // ares-condicionados
    const unidades = []
    const matAr = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.35, metalness: 0.05 })
    const geoAr = new RoundedBoxGeometry(0.9, 0.3, 0.22, 4, 0.06)
    const texPonto = (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'); const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c) })()
    const montarAr = (pos, a, previsto) => {
      const mx = pos.x + AR_L / 2, my = pos.y + AR_A / 2
      const rot = (pos.rot || 0) * Math.PI / 180
      const dir = new THREE.Vector3(-Math.sin(rot), 0, Math.cos(rot))   // saída de ar (local +y da planta)
      const g = new THREE.Group()
      g.position.set(W(mx), Math.max(0.9, ALT - 0.38), Z(my)); g.rotation.y = -rot
      const corpo = new THREE.Mesh(geoAr, previsto ? new THREE.MeshStandardMaterial({ color: 0x94a3b8, transparent: true, opacity: 0.28 }) : matAr.clone())
      corpo.castShadow = !previsto; g.add(corpo)
      if (previsto) {
        g.add(new THREE.LineSegments(new THREE.EdgesGeometry(geoAr), new THREE.LineBasicMaterial({ color: 0x64748b })))
      } else {
        const grade = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.03, 0.02), matPreto); grade.position.set(0, -0.1, 0.105); g.add(grade)
        const led = new THREE.Mesh(new THREE.SphereGeometry(0.014, 10, 10), new THREE.MeshBasicMaterial({ color: a.ligado ? COR_MODO[a.modo] : 0x64748b })); led.position.set(0.36, 0.06, 0.112); g.add(led)
      }
      const alvo = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.6, 0.6), new THREE.MeshBasicMaterial({ visible: false }))
      alvo.userData = previsto ? { tipo: 'elemento', id: a } : { tipo: 'ar', id: a.id }
      g.add(alvo); mundo.add(g)
      const u = { g, corpo, alvo, a, previsto, dir }
      if (!previsto && a.ligado) {
        // fluxo de ar: partículas saindo pela grade, descendo e abrindo em leque
        const N = 140, pos3 = new Float32Array(N * 3), vida = new Float32Array(N)
        const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos3, 3))
        const pts = new THREE.Points(geo, new THREE.PointsMaterial({ size: 0.09, map: texPonto, color: COR_MODO[a.modo] || 0x14b8a6, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending }))
        pts.position.copy(g.position); mundo.add(pts)
        const sem = []
        for (let i = 0; i < N; i++) { vida[i] = Math.random(); sem.push([(Math.random() - 0.5) * 0.8, Math.random()]) }
        u.fluxo = { pts, pos3, vida, sem }
        const luz = new THREE.PointLight(COR_MODO[a.modo] || 0x14b8a6, 0.6, 3.2); luz.position.copy(g.position).add(dir.clone().multiplyScalar(0.6)).setY(g.position.y - 0.5); mundo.add(luz)
        const temp = etiqueta(`${a.temperatura}°`, '#ffffff', `#${new THREE.Color(COR_MODO[a.modo] || 0x14b8a6).getHexString()}`); temp.position.set(0, 0.42, 0); temp.scale.multiplyScalar(0.8); g.add(temp)
      }
      unidades.push(u)
    }
    const consumidos = mapa.consumidos || []
    for (const a of ares) if (a.projeto_id && mapa.ares[a.id]) montarAr(mapa.ares[a.id], a, false)
    for (const e of mapa.elementos) if (e.tipo === 'ar_previsto' && !consumidos.includes(e.id)) montarAr({ x: e.x, y: e.y, rot: e.rot }, e.id, true)

    // "clima" da sala: névoa na cor do modo sobre o piso das salas com ar ligado (frio azul, quente laranja…)
    const climas = []
    for (const s of salas) {
      const lig = ares.filter((a) => a.projeto_id === s.p.id && a.ligado)
      if (!lig.length) continue
      const cv = document.createElement('canvas'); cv.width = cv.height = 128
      const g2 = cv.getContext('2d'); const gr = g2.createRadialGradient(64, 64, 4, 64, 64, 64)
      const c = new THREE.Color(COR_MODO[lig[0].modo] || 0x14b8a6)
      gr.addColorStop(0, `rgba(${c.r * 255},${c.g * 255},${c.b * 255},0.55)`); gr.addColorStop(1, `rgba(${c.r * 255},${c.g * 255},${c.b * 255},0)`)
      g2.fillStyle = gr; g2.fillRect(0, 0, 128, 128)
      const tx = new THREE.CanvasTexture(cv)
      const nv = new THREE.Mesh(new THREE.PlaneGeometry(s.w * S * 0.96, s.h * S * 0.96), new THREE.MeshBasicMaterial({ map: tx, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.6 }))
      nv.rotation.x = -Math.PI / 2; nv.position.set(W(s.x + s.w / 2), 0.03, Z(s.y + s.h / 2)); mundo.add(nv)
      climas.push({ m: nv, fase: r() * 6 })
    }

    // rótulos HTML das salas
    const caixaRot = rotulosRef.current
    caixaRot.innerHTML = ''
    const rot = salas.map((s) => {
      const lista = ares.filter((a) => a.projeto_id === s.p.id)
      const lig = lista.filter((a) => a.ligado).length
      const d = document.createElement('div')
      d.className = 'absolute left-0 top-0 whitespace-nowrap rounded-md border border-black/5 bg-white/90 px-2 py-1 text-[11px] font-semibold text-slate-800 shadow-sm backdrop-blur transition-opacity dark:border-white/10 dark:bg-slate-900/85 dark:text-slate-100'
      d.innerHTML = ''
      const n = document.createElement('span'); n.textContent = s.p.nome; d.appendChild(n)
      const sub = document.createElement('span'); sub.className = 'ml-1.5 font-normal text-slate-500 dark:text-slate-400'
      sub.textContent = lista.length ? `${lig}/${lista.length} ligado(s)` : 'sem ar'; d.appendChild(sub)
      caixaRot.appendChild(d)
      return { d, v: new THREE.Vector3(W(s.x + s.w / 2), ALT + 0.35, Z(s.y + s.h / 2)) }
    })
    const tmp = new THREE.Vector3()
    E.rotulos = () => {
      const w = renderer.domElement.clientWidth, h = renderer.domElement.clientHeight
      rot.forEach(({ d, v }) => {
        tmp.copy(v).project(camera)
        const vis = tmp.z < 1 && Math.abs(tmp.x) < 1.1 && Math.abs(tmp.y) < 1.1
        d.style.transform = `translate(${(tmp.x * 0.5 + 0.5) * w}px, ${(-tmp.y * 0.5 + 0.5) * h}px) translate(-50%, -50%)`
        d.style.opacity = vis && (!predio || predio.k > 0.92) ? '1' : '0'
      })
    }

    // animação
    E.tick = (dt, t) => {
      pessoas.forEach((p) => animarPessoa(p, t))
      arvores.forEach((a) => { a.copa.rotation.z = Math.sin(t * 0.9 + a.fase) * 0.035; a.copa.rotation.x = Math.cos(t * 0.7 + a.fase) * 0.025 })
      climas.forEach((c) => { c.m.material.opacity = 0.42 + Math.sin(t * 1.3 + c.fase) * 0.18 })
      matTela.emissiveIntensity = (ceu.noite ? 0.7 : 0.35) + Math.sin(t * 7) * 0.03 + (Math.sin(t * 0.37) > 0.97 ? 0.25 : 0)
      andarilhos.forEach((a) => moverAndarilho(a, dt, t))
      predio?.tick(dt, t)
      if (predio) {
        const alvoK = E.aberto ? 1 : 0
        if (Math.abs(predio.k - alvoK) > 0.001) predio.aplicar(THREE.MathUtils.clamp(predio.k + Math.sign(alvoK - predio.k) * dt / 1.4, 0, 1))
        if (E.placaAndar) E.placaAndar.visible = predio.k < 0.05
      }
      unidades.forEach((u) => {
        if (u.fluxo) {
          const { pos3, vida, sem } = u.fluxo
          for (let i = 0; i < vida.length; i++) {
            vida[i] += dt * (0.35 + sem[i][1] * 0.25)
            if (vida[i] > 1) vida[i] -= 1
            const k = vida[i], lado = sem[i][0] * (0.4 + k * 1.1)
            const lx = lado, lz = 0.15 + k * 1.8, ly = -0.12 - k * k * 1.4
            // local → mundo (só rotação em y)
            const c = Math.cos(u.g.rotation.y), s = Math.sin(u.g.rotation.y)
            pos3[i * 3] = lx * c + lz * s; pos3[i * 3 + 1] = ly; pos3[i * 3 + 2] = -lx * s + lz * c
          }
          u.fluxo.pts.geometry.attributes.position.needsUpdate = true
          u.fluxo.pts.material.opacity = 0.5 + Math.sin(t * 3) * 0.05
        }
        const sel = E.sel && ((E.sel.tipo === 'ar' && u.a?.id === E.sel.id) || (E.sel.tipo === 'elemento' && u.a === E.sel.id))
        const alvo = sel ? 1.12 + Math.sin(t * 6) * 0.03 : 1
        u.g.scale.setScalar(THREE.MathUtils.lerp(u.g.scale.x, alvo, 0.2))
        if (!u.previsto) u.corpo.material.emissive?.setHex(sel ? 0x0f766a : 0x000000)
      })
      pisos.forEach((p) => { p.material.emissive?.setHex(E.sel?.tipo === 'sala' && E.sel.id === p.userData.id ? 0x0f2f2b : 0x000000) })
      const f = E.filtro || 'todos'
      unidades.forEach((u) => { if (!u.previsto) u.g.visible = f === 'todos' || (f === 'ligados' ? !!u.a.ligado : !u.a.ligado) })
    }

    // câmera enquadrando o prédio
    const enquadrar = (topo = false) => {
      const fechado = predio && !E.aberto
      const alvo = new THREE.Vector3(0, fechado ? -predio.yA + predio.altura * 0.4 : 0, 0)
      const dist = Math.max(x1 - x0, y1 - y0) * S * (topo ? 1.05 : 0.95) * (compacto ? 1.12 : 1)
      const dP = predio ? predio.altura * 1.75 : 0
      const destino = fechado ? (topo ? new THREE.Vector3(0, alvo.y + dP * 1.2, 0.01) : new THREE.Vector3(-dP * 0.6, alvo.y + dP * 0.28, dP * 0.85))
        : topo ? new THREE.Vector3(0, dist * 1.25, 0.01) : new THREE.Vector3(-dist * 0.25, dist * 0.78, dist * 0.78)
      const de = camera.position.clone(), deAlvo = controles.target.clone()
      if (!E.enquadrado) { camera.position.copy(destino); controles.target.copy(alvo); E.enquadrado = true; return }
      let t0 = null
      const passo = (ts) => { t0 ??= ts; const k = Math.min(1, (ts - t0) / 800), e = 1 - Math.pow(1 - k, 3); camera.position.lerpVectors(de, destino, e); controles.target.lerpVectors(deAlvo, alvo, e); if (k < 1) requestAnimationFrame(passo) }
      requestAnimationFrame(passo)
    }
    enquadrar()
    E.enquadrar = enquadrar

    // clique e cursor
    const ray = new THREE.Raycaster(), mouse = new THREE.Vector2()
    const alvos = [...unidades.map((u) => u.alvo), ...pisos]
    const acerto = (ev) => {
      const b = renderer.domElement.getBoundingClientRect()
      mouse.set(((ev.clientX - b.left) / b.width) * 2 - 1, -((ev.clientY - b.top) / b.height) * 2 + 1)
      ray.setFromCamera(mouse, camera)
      if (predio && !E.aberto) return ray.intersectObjects(predio.alvos, false).length ? { tipo: 'predio' } : null
      return ray.intersectObjects(alvos, false)[0]?.object.userData
    }
    let baixo = null
    const pd = (ev) => { baixo = [ev.clientX, ev.clientY] }
    // clique: seleciona e a câmera voa até a sala ou o ar
    const voar = (alvo, dist) => {
      const destino = alvo.clone().add(new THREE.Vector3(-dist * 0.35, dist * 0.85, dist * 0.75))
      const de = camera.position.clone(), deAlvo = controles.target.clone()
      let t0 = null
      const passo = (ts) => { t0 ??= ts; const k = Math.min(1, (ts - t0) / 900), e = 1 - Math.pow(1 - k, 3); camera.position.lerpVectors(de, destino, e); controles.target.lerpVectors(deAlvo, alvo, e); if (k < 1) requestAnimationFrame(passo) }
      requestAnimationFrame(passo)
    }
    const pu = (ev) => {
      if (baixo && Math.hypot(ev.clientX - baixo[0], ev.clientY - baixo[1]) < 5) {
        const u = acerto(ev)
        if (u?.tipo === 'predio') { E.setAberto?.(true); baixo = null; return }
        if (predio && !E.aberto) { baixo = null; return }
        E.aoSelecionar?.(u?.tipo ? u : null)
        if (u?.tipo === 'sala') { const pz = pisos.find((x) => x.userData.id === u.id); if (pz) voar(pz.position.clone(), Math.max(pz.geometry.parameters.width, pz.geometry.parameters.height) * 0.9 + 2) }
        else if (u?.tipo === 'ar') { const un = unidades.find((x) => x.a?.id === u.id); if (un) voar(un.g.position.clone().setY(0.8), 4.5) }
      }
      baixo = null
    }
    const mv = (ev) => { const u = acerto(ev); renderer.domElement.style.cursor = u?.tipo === 'ar' || u?.tipo === 'elemento' || u?.tipo === 'predio' ? 'pointer' : 'grab' }
    renderer.domElement.addEventListener('pointerdown', pd); renderer.domElement.addEventListener('pointerup', pu); renderer.domElement.addEventListener('pointermove', mv)
    return () => {
      renderer.domElement.removeEventListener('pointerdown', pd); renderer.domElement.removeEventListener('pointerup', pu); renderer.domElement.removeEventListener('pointermove', mv)
      texPonto.dispose(); fundoCeu.dispose()
    }
  }, [pronto, chave, paredesAltas, hora, hora === 'agora' ? relogio : 0]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { estado.current.filtro = filtro }, [filtro])
  // abrir/fechar o prédio: a torre sobe e some (no tick), a sombra e a câmera se ajustam
  const primeiraVez = useRef(true)
  useEffect(() => {
    const E = estado.current
    E.aberto = aberto; E.setAberto = setAberto
    if (primeiraVez.current) { primeiraVez.current = false; return }
    E.ajustarSombra?.(!aberto && !!E.predio)
    E.enquadrar?.(false)
  }, [aberto])
  useEffect(() => { const t = setInterval(() => setRelogio(Math.floor(horaBrasilia() * 4)), 60000); return () => clearInterval(t) }, [])

  useEffect(() => { estado.current.sel = selecionado; estado.current.aoSelecionar = aoSelecionar }, [selecionado, aoSelecionar])
  useEffect(() => { const c = estado.current.controles; if (c) { c.autoRotate = girando; c.autoRotateSpeed = 0.6 } }, [girando, pronto])

  const botao = 'flex h-8 items-center gap-1.5 px-2.5 text-xs hover:bg-black/5 dark:hover:bg-white/10'
  return (
    <div ref={caixaRef} className={`w-full overflow-hidden bg-background ${cheia === 'janela' ? 'fixed inset-0 z-[60] h-[100dvh]' : `relative ${cheia ? 'h-full' : compacto ? 'h-full' : 'h-[68vh] min-h-[440px]'}`}`}>
      <div ref={ref} className="h-full w-full touch-none [&>canvas]:h-full [&>canvas]:w-full" role="img" aria-label="Escritório em 3D com as salas, os ares e as pessoas; arraste para girar, role para aproximar" />
      <div ref={rotulosRef} className="pointer-events-none absolute inset-0" />
      <button onClick={alternarCheia} className={`absolute left-3 top-3 flex overflow-hidden rounded-lg border border-border bg-card/90 font-medium backdrop-blur ${botao}`}
        title={cheia ? 'Sair da tela cheia (Esc)' : 'Expandir o escritório para a tela inteira'} aria-pressed={!!cheia}>
        {cheia ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}{cheia ? 'Reduzir' : 'Expandir'}
      </button>
      <div className="absolute right-3 top-3 flex overflow-hidden rounded-lg border border-border bg-card/90 backdrop-blur" role="group" aria-label="Iluminação">
        {[['agora', Clock, 'Agora'], ['dia', Sun, 'Dia'], ['noite', Moon, 'Noite']].map(([k, I, r], i) => (
          <button key={k} onClick={() => setHora(k)} className={`${botao} ${i ? 'border-l border-border' : ''} ${hora === k ? 'bg-black/5 font-medium dark:bg-white/10' : ''}`} title={k === 'agora' ? 'Luz da hora real (Brasília)' : `Simular ${r.toLowerCase()}`}><I className="h-3.5 w-3.5" />{r}</button>
        ))}
      </div>
      <div className="absolute bottom-3 right-3 flex overflow-hidden rounded-lg border border-border bg-card/90 backdrop-blur">
        {comPredio && <button onClick={() => setAberto((v) => !v)} className={`${botao} border-r border-border font-medium`} title={aberto ? 'Fechar e ver o prédio por fora' : 'Abrir o andar do escritório'}>{aberto ? <Building2 className="h-3.5 w-3.5" /> : <DoorOpen className="h-3.5 w-3.5" />}{aberto ? 'Ver prédio' : 'Abrir andar'}</button>}
        <button onClick={() => estado.current.enquadrar?.(false)} className={botao} title="Vista inicial"><RotateCcw className="h-3.5 w-3.5" />Inicial</button>
        <button onClick={() => estado.current.enquadrar?.(true)} className={`${botao} border-l border-border`} title="Ver de cima"><Eye className="h-3.5 w-3.5" />De cima</button>
        <button onClick={() => setParedesAltas((v) => !v)} className={`${botao} border-l border-border`} title="Altura das paredes">{paredesAltas ? <Box className="h-3.5 w-3.5" /> : <Building2 className="h-3.5 w-3.5" />}{paredesAltas ? 'Paredes baixas' : 'Paredes altas'}</button>
        <button onClick={() => setGirando((g) => !g)} className={`${botao} border-l border-border`} title={girando ? 'Parar' : 'Girar'}>{girando ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}{girando ? 'Parar' : 'Girar'}</button>
      </div>
      <p className={`pointer-events-none absolute bottom-3 left-4 text-[11px] text-muted-foreground ${compacto ? 'hidden' : ''}`}>{comPredio && !aberto ? 'Clique no prédio para abrir o andar do escritório' : 'Arraste para girar · role para aproximar · clique numa sala ou num ar para ir até ele'}</p>
    </div>
  )
}
