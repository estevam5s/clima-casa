import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { Box, Building2, Clock, CloudRain, DoorOpen, Eye, MapPinned, Maximize2, Minimize2, Moon, Pause, PenLine, Play, RotateCcw, Sun } from 'lucide-react'
import { api } from '../api'
import { BarraControle, CartaoMapa, RascunhoEscrita } from './CartoesMapa3D'
import { animarDispositivos, montarDispositivo } from './dispositivos3d'
import { ITEM } from '../catalogoMapa'
import { horaBR, noExpediente } from '../mapaUtil'
import { salasPrivativas } from '../mapaUtil'
import { useMarca } from '../marca'
import { TIPOS_TRANSITO, caminho, carro as carroTransito, criarGrade, celulaLivre, livreProxima, montarPredio, visaoLivre } from './predio3d'
import { ELEV, montarElevador, montarTerreo } from './elevador3d'
import MiniMapa from './MiniMapa'
import PainelCarro from './PainelCarro'
import { colisorCidade, criarMarcas, criarSom, criarVeiculo } from './veiculo3d'
import { conectarMultijogador } from './multijogador'
import { cafeteiraVermelha, montarBanheiro, montarCozinha, xicara } from './copa3d'
import { caixaReal, carregarAvatar } from './avatares/AvatarViewer'
import { clone as clonarComOssos } from 'three/examples/jsm/utils/SkeletonUtils.js'
const VistaIlha3D = lazy(() => import('./VistaIlha3D'))
import { ROTULO_PAPEL, desenharTela, papelDaSala, sementeDe } from './telas3d'

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
    vaos.push(horiz ? { horiz, k: (p1[1] + p2[1]) / 2, a: Math.min(p1[0], p2[0]), b: Math.max(p1[0], p2[0]), tipo: e.tipo, el: e }
      : { horiz, k: (p1[0] + p2[0]) / 2, a: Math.min(p1[1], p2[1]), b: Math.max(p1[1], p2[1]), tipo: e.tipo, el: e })
  }
  const segs = []
  for (const [mapa, horiz] of [[H, true], [V, false]]) {
    for (const [k, lista] of mapa) {
      for (const [a, b] of unir(lista)) {
        const corte = vaos.filter((v) => v.horiz === horiz && Math.abs(v.k - k) < 16 && v.b > a && v.a < b).sort((x, y) => x.a - y.a)
        let ini = a
        for (const v of corte) {
          if (v.a > ini) segs.push({ horiz, k, a: ini, b: v.a, tipo: 'cheia' })
          segs.push({ horiz, k, a: Math.max(a, v.a), b: Math.min(b, v.b), tipo: v.tipo, el: v.el })
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
const CABELO_ESTILOS = ['curto', 'longo', 'coque', 'cacheado', 'raspado', 'lateral', 'careca', 'rabo']
// texturas em tons de cinza (multiplicam a cor do material): trama de tecido, sarja do jeans e fios de cabelo
const TEX = {}
function texTrama(tipo) {
  if (TEX[tipo]) return TEX[tipo]
  const c = document.createElement('canvas'); c.width = c.height = 128
  const g = c.getContext('2d'), rr = aleatorio(tipo.length * 131)
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, 128, 128)
  if (tipo === 'cabelo') {
    for (let i = 0; i < 900; i++) { const x = rr() * 128, y = rr() * 128, l = 10 + rr() * 30, v = 170 + Math.floor(rr() * 85); g.strokeStyle = `rgb(${v},${v},${v})`; g.lineWidth = 0.8; g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + (rr() - 0.5) * 6, y + l / 2, x + (rr() - 0.5) * 4, y + l); g.stroke() }
  } else if (tipo === 'jeans') {
    for (let y = 0; y < 128; y += 2) for (let x = 0; x < 128; x += 2) { const v = ((x + y) % 8 < 4 ? 222 : 196) + Math.floor(rr() * 26); g.fillStyle = `rgb(${v},${v},${v})`; g.fillRect(x, y, 2, 2) }
  } else {
    for (let y = 0; y < 128; y++) for (let x = 0; x < 128; x += 1) { if ((x + y) % 2) continue; const v = 228 + Math.floor(rr() * 27) - ((x % 4 === 0 || y % 4 === 0) ? 12 : 0); g.fillStyle = `rgb(${v},${v},${v})`; g.fillRect(x, y, 1, 1) }
  }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.repeat.set(tipo === 'cabelo' ? 2 : 3, tipo === 'cabelo' ? 2 : 3)
  TEX[tipo] = t
  return t
}
// ap (opcional) = aparência cadastrada: pele, cabelo, cor_cabelo, roupa, calca, sapato, traje, corpo, oculos, barba, cracha.
// Sem ap, sorteia tudo pelo r() da cena (o mesmo escritório sempre com as mesmas pessoas).
function pessoa(r, sentada, ap = null) {
  const g = new THREE.Group()
  const mat = (c, rough = 0.8, metal = 0) => new THREE.MeshStandardMaterial({ color: c, roughness: rough, metalness: metal })
  const hex = (v, lista) => (v ? new THREE.Color(v).getHex() : lista[Math.floor(r() * lista.length)])
  const sorte = (k) => r() > k
  const corPele = hex(ap?.pele, PELES)
  const pele = new THREE.MeshPhysicalMaterial({ color: corPele, roughness: 0.55, sheen: 0.4, sheenColor: new THREE.Color(0xffd7c2), sheenRoughness: 0.6 })
  const corRoupa = hex(ap?.roupa, ROUPAS)
  const traje = ap?.traje || ['camisa', 'camiseta', 'social', 'blusa', 'camisa'][Math.floor(r() * 5)]
  const corpoB = ap ? ap.corpo === 'b' : sorte(0.5)
  const roupa = new THREE.MeshPhysicalMaterial({ color: corRoupa, map: texTrama('tecido'), roughness: 0.92, sheen: 0.6, sheenColor: new THREE.Color(corRoupa).offsetHSL(0, 0, 0.2), sheenRoughness: 0.8 })
  const corCalca = ap?.calca ? new THREE.Color(ap.calca).getHex() : (r() > 0.6 ? 0x1f2937 : r() > 0.5 ? 0x334155 : r() > 0.4 ? 0x2c4a6e : 0x3b4252)
  const jeans = new THREE.Color(corCalca).getHSL({}).h > 0.55 && new THREE.Color(corCalca).getHSL({}).h < 0.7   // azulado: jeans
  const calca = new THREE.MeshStandardMaterial({ color: corCalca, map: texTrama(jeans ? 'jeans' : 'tecido'), roughness: 0.88 })
  const corCabelo = hex(ap?.cor_cabelo, CABELOS)
  const cabelo = new THREE.MeshStandardMaterial({ color: corCabelo, map: texTrama('cabelo'), roughness: 0.62, metalness: 0.02 })
  const sapato = mat(ap?.sapato ? new THREE.Color(ap.sapato).getHex() : (r() > 0.5 ? 0x111111 : 0x3f2a1d), 0.45)
  const escuro = mat(0x111111, 0.3)
  const malha = (geo, m, pai, x = 0, y = 0, z = 0, sombra = true) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.castShadow = sombra; pai.add(o); return o }
  const capsula = (raio, comp, m) => { const x = new THREE.Mesh(new THREE.CapsuleGeometry(raio, comp, 8, 16), m); x.castShadow = true; return x }
  const mangaCurta = traje === 'camiseta' || (traje === 'blusa' && sorte(0.5))
  const saia = traje === 'saia'
  const ombroL = corpoB ? 0.165 : 0.185, quadrilL = corpoB ? 1.2 : 1.12
  // quadril (raiz da pose)
  const quadril = new THREE.Group(); quadril.position.y = sentada ? 0.47 : 0.92; g.add(quadril)
  // tronco torneado: cintura fina, peito e ombros arredondados, achatado na frente (corpo B: ombros estreitos, quadril largo)
  const perfil = (corpoB
    ? [[0.14, -0.02], [0.16, 0.04], [0.14, 0.14], [0.125, 0.24], [0.15, 0.36], [0.158, 0.44], [0.148, 0.52], [0.1, 0.585], [0.05, 0.6]]
    : [[0.13, -0.02], [0.155, 0.04], [0.15, 0.14], [0.142, 0.24], [0.158, 0.36], [0.172, 0.46], [0.16, 0.53], [0.11, 0.585], [0.05, 0.6]]).map(([x, y]) => new THREE.Vector2(x, y))
  const tronco = malha(new THREE.LatheGeometry(perfil, 28), roupa, quadril); tronco.scale.set(quadrilL, 1, 0.72)
  if (!saia) { const cinto = malha(new THREE.CylinderGeometry(0.133, 0.133, 0.035, 24), escuro, quadril, 0, 0.0, 0); cinto.scale.set(quadrilL, 1, 0.74); malha(new THREE.BoxGeometry(0.035, 0.028, 0.01), mat(0xd4d4d8, 0.3, 0.8), quadril, 0, 0, 0.1, false) }
  const gola = malha(new THREE.TorusGeometry(0.052, 0.014, 8, 20), traje === 'social' ? mat(0xf8fafc, 0.7) : roupa, quadril, 0, 0.592, 0); gola.rotation.x = Math.PI / 2
  if (traje === 'social') {
    // paletó aberto por cima da camisa branca, com lapelas e gravata
    const paleto = new THREE.MeshPhysicalMaterial({ color: corRoupa, roughness: 0.75, sheen: 0.3 })
    tronco.material = mat(0xf8fafc, 0.7)
    for (const lado of [-1, 1]) {
      const aba = malha(new THREE.BoxGeometry(0.1, 0.5, 0.2), paleto, quadril, lado * 0.105, 0.29, -0.005); aba.scale.set(1, 1, 1)
      const lap = malha(new THREE.BoxGeometry(0.035, 0.2, 0.012), paleto, quadril, lado * 0.06, 0.47, 0.105); lap.rotation.z = lado * 0.35
    }
    malha(new THREE.BoxGeometry(0.31, 0.5, 0.06), paleto, quadril, 0, 0.29, -0.085)
    const gravata = malha(new THREE.BoxGeometry(0.035, 0.3, 0.01), mat(sorte(0.5) ? 0x7f1d1d : 0x1e3a8a, 0.6), quadril, 0, 0.42, 0.106); gravata.scale.set(1, 1, 1)
    malha(new THREE.BoxGeometry(0.04, 0.035, 0.015), gravata.material, quadril, 0, 0.565, 0.1)
  } else if (traje === 'camisa') {
    for (let i = 0; i < 4; i++) malha(new THREE.SphereGeometry(0.006, 6, 4), mat(0xf5f5f4, 0.4), quadril, 0, 0.12 + i * 0.12, 0.108, false)   // botões
    malha(new THREE.BoxGeometry(0.004, 0.5, 0.004), mat(new THREE.Color(corRoupa).offsetHSL(0, 0, -0.12).getHex()), quadril, 0, 0.3, 0.107, false)   // carcela
  }
  if (saia) {
    const sa = malha(new THREE.CylinderGeometry(0.15, 0.2, 0.36, 24, 1, true), calca, quadril, 0, -0.17, 0); sa.scale.set(1.12, 1, 0.8); sa.material.side = THREE.DoubleSide
  }
  // crachá no cordão
  if (ap ? ap.cracha !== false : sorte(0.55)) {
    const cordao = malha(new THREE.TorusGeometry(0.075, 0.004, 6, 24, Math.PI), mat(0x0f766a, 0.6), quadril, 0, 0.56, 0.06, false); cordao.rotation.z = Math.PI
    const c = malha(new THREE.BoxGeometry(0.055, 0.075, 0.004), mat(0xffffff, 0.5), quadril, 0, 0.41, 0.112, false)
    malha(new THREE.BoxGeometry(0.045, 0.012, 0.002), mat(0x0f766a, 0.5), c, 0, 0.026, 0.003, false)
  }
  // pescoço e cabeça (com o trapézio descendo do pescoço para os ombros, por baixo da roupa)
  malha(new THREE.CylinderGeometry(0.042, 0.05, 0.09, 16), pele, quadril, 0, 0.63, 0)
  const trap = malha(new THREE.SphereGeometry(0.1, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.5), traje === 'social' ? new THREE.MeshPhysicalMaterial({ color: corRoupa, roughness: 0.75 }) : roupa, quadril, 0, 0.545, -0.005); trap.scale.set(corpoB ? 1.45 : 1.65, 0.5, 0.75)
  const pescoco = new THREE.Group(); pescoco.position.y = 0.66; quadril.add(pescoco)
  const cabeca = malha(new THREE.SphereGeometry(0.1, 32, 24), pele, pescoco, 0, 0.1, 0.005); cabeca.scale.set(corpoB ? 0.86 : 0.9, 1.1, 0.98)
  malha(new THREE.SphereGeometry(0.06, 16, 12), pele, pescoco, 0, 0.045, 0.03).scale.set(corpoB ? 0.9 : 1, 0.8, 0.9)   // queixo e mandíbula
  const olhos = []
  for (const lado of [-1, 1]) {
    malha(new THREE.SphereGeometry(0.022, 12, 10), pele, pescoco, lado * 0.088, 0.1, 0).scale.set(0.45, 1, 0.8)   // orelhas
    const o = malha(new THREE.SphereGeometry(0.012, 12, 10), mat(0xf8fafc, 0.2), pescoco, lado * 0.033, 0.112, 0.088, false)   // olho
    malha(new THREE.SphereGeometry(0.0068, 10, 8), mat(0x3b2a1a, 0.15), pescoco, lado * 0.033, 0.112, 0.0985, false)   // íris
    malha(new THREE.SphereGeometry(0.0035, 8, 6), mat(0x050505, 0.1), pescoco, lado * 0.033, 0.112, 0.1035, false)   // pupila
    const palp = malha(new THREE.SphereGeometry(0.0128, 12, 6, 0, Math.PI * 2, 0, Math.PI * 0.42), pele, pescoco, lado * 0.033, 0.1125, 0.088, false); palp.rotation.x = 0.35
    olhos.push(palp, o)
    const sob = malha(new THREE.CapsuleGeometry(0.0045, 0.026, 4, 8), mat(corCabelo, 0.9), pescoco, lado * 0.035, 0.136, 0.094, false); sob.rotation.z = Math.PI / 2 - lado * 0.16; sob.scale.set(1, 1, 0.6)
    malha(new THREE.SphereGeometry(0.018, 10, 8), mat(new THREE.Color(corPele).offsetHSL(0, 0.08, -0.03).getHex(), 0.6), pescoco, lado * 0.05, 0.075, 0.08, false).scale.set(1, 0.6, 0.3)   // bochecha
  }
  malha(new THREE.ConeGeometry(0.012, 0.032, 10), pele, pescoco, 0, 0.09, 0.103).rotation.x = Math.PI / 2   // nariz
  // boca: lábio de cima e de baixo, e o sulco entre o nariz e a boca
  const corLabio = mat(corpoB ? 0xb4535b : new THREE.Color(corPele).offsetHSL(-0.02, 0.1, -0.12).getHex(), 0.45)
  const lab1 = malha(new THREE.CapsuleGeometry(0.0055, 0.022, 4, 8), corLabio, pescoco, 0, 0.061, 0.093, false); lab1.rotation.z = Math.PI / 2; lab1.scale.set(1, 1, 0.55)
  const lab2 = malha(new THREE.CapsuleGeometry(0.0062, 0.018, 4, 8), corLabio, pescoco, 0, 0.0535, 0.091, false); lab2.rotation.z = Math.PI / 2; lab2.scale.set(1, 1, 0.6)
  malha(new THREE.BoxGeometry(0.008, 0.012, 0.004), mat(new THREE.Color(corPele).offsetHSL(0, 0, -0.04).getHex(), 0.6), pescoco, 0, 0.074, 0.098, false)
  // cabelo
  const estilo = ap?.cabelo && CABELO_ESTILOS.includes(ap.cabelo) ? ap.cabelo : CABELO_ESTILOS[Math.floor(r() * 6)]
  const calota = (abertura, raio = 0.108) => { const c = malha(new THREE.SphereGeometry(raio, 32, 20, 0, Math.PI * 2, 0, Math.PI * abertura), cabelo, pescoco, 0, 0.112, -0.004); c.scale.set(0.95, 1.08, 1.02); c.rotation.x = -0.32; return c }
  const franja = (lado = 0) => { const f = malha(new THREE.SphereGeometry(0.06, 16, 8, 0, Math.PI * 2, 0, Math.PI * 0.5), cabelo, pescoco, lado * 0.02, 0.19, 0.06); f.scale.set(1.5, 0.35, 0.7); f.rotation.x = 0.55; f.rotation.z = lado * 0.25 }
  if (estilo === 'curto') { calota(0.5); franja() }
  else if (estilo === 'lateral') { const c = calota(0.52); c.rotation.z = 0.12; franja(1); malha(new THREE.SphereGeometry(0.05, 14, 10), cabelo, pescoco, 0.04, 0.19, 0.05).scale.set(1.4, 0.5, 0.8) }
  else if (estilo === 'raspado') { const c = calota(0.48, 0.103); c.material = mat(corCabelo, 0.95); c.material.transparent = true; c.material.opacity = 0.7 }
  else if (estilo === 'cacheado') { const c = malha(new THREE.IcosahedronGeometry(0.128, 2), cabelo, pescoco, 0, 0.14, -0.012); c.scale.set(1, 0.92, 1); c.material.flatShading = true }
  else if (estilo === 'longo') { calota(0.56); franja(-1); const t = malha(new THREE.CapsuleGeometry(0.085, 0.16, 6, 14), cabelo, pescoco, 0, 0.02, -0.05); t.scale.set(1.1, 1, 0.55) }
  else if (estilo === 'rabo') { calota(0.55); const t = malha(new THREE.CapsuleGeometry(0.03, 0.14, 6, 10), cabelo, pescoco, 0, 0.08, -0.12); t.rotation.x = 0.4; malha(new THREE.TorusGeometry(0.03, 0.008, 6, 12), escuro, pescoco, 0, 0.16, -0.1) }
  else if (estilo === 'coque') { calota(0.54); malha(new THREE.SphereGeometry(0.045, 16, 12), cabelo, pescoco, 0, 0.21, -0.07) }
  if (ap ? ap.barba : (estilo === 'curto' || estilo === 'raspado' || estilo === 'lateral' || estilo === 'careca') && sorte(0.6)) {   // barba
    const b = malha(new THREE.SphereGeometry(0.075, 20, 12, 0, Math.PI * 2, Math.PI * 0.5, Math.PI * 0.4), cabelo, pescoco, 0, 0.085, 0.012); b.scale.set(1.08, 1.05, 1.1)
  }
  if (ap ? ap.oculos : sorte(0.7)) {   // óculos
    const aro = mat(0x18181b, 0.3, 0.4)
    for (const lado of [-1, 1]) {
      malha(new THREE.TorusGeometry(0.019, 0.0028, 8, 20), aro, pescoco, lado * 0.034, 0.112, 0.103, false)
      const haste = malha(new THREE.BoxGeometry(0.003, 0.003, 0.09), aro, pescoco, lado * 0.053, 0.114, 0.06, false); haste.rotation.y = lado * 0.1
    }
    malha(new THREE.BoxGeometry(0.02, 0.003, 0.003), aro, pescoco, 0, 0.114, 0.105, false)
  }
  if (sentada && !ap && sorte(0.72)) {   // fone de ouvido
    const arco = malha(new THREE.TorusGeometry(0.105, 0.008, 8, 24, Math.PI), escuro, pescoco, 0, 0.12, 0); arco.rotation.z = 0
    for (const lado of [-1, 1]) malha(new THREE.CylinderGeometry(0.03, 0.03, 0.02, 16), escuro, pescoco, lado * 0.098, 0.1, 0).rotation.z = Math.PI / 2
  }
  // braços com mão e dedos
  const bracos = [], pernas = []
  const manga = traje === 'social' ? new THREE.MeshPhysicalMaterial({ color: corRoupa, roughness: 0.75 }) : roupa
  for (const lado of [-1, 1]) {
    const ombro = new THREE.Group(); ombro.position.set(lado * ombroL, 0.52, 0); quadril.add(ombro)
    malha(new THREE.SphereGeometry(corpoB ? 0.055 : 0.062, 16, 12), manga, ombro)
    const braco = capsula(corpoB ? 0.044 : 0.05, 0.22, manga); braco.position.y = -0.14; braco.scale.set(1, 1, 0.92); ombro.add(braco)
    const cotovelo = new THREE.Group(); cotovelo.position.y = -0.29; ombro.add(cotovelo)
    const ante = capsula(corpoB ? 0.037 : 0.042, 0.2, mangaCurta ? pele : manga); ante.position.y = -0.12; cotovelo.add(ante)
    if (!mangaCurta) malha(new THREE.CylinderGeometry(0.037, 0.037, 0.03, 12), traje === 'social' ? mat(0xf8fafc, 0.7) : pele, cotovelo, 0, -0.245, 0)   // punho
    if (lado < 0 && (ap ? true : sorte(0.5))) malha(new THREE.CylinderGeometry(0.04, 0.04, 0.02, 14), mat(0x27272a, 0.3, 0.6), cotovelo, 0, -0.225, 0, false)   // relógio
    const mao = malha(new THREE.SphereGeometry(0.038, 14, 10), pele, cotovelo, 0, -0.285, 0.004); mao.scale.set(0.8, 1.15, 0.55)
    for (let k = 0; k < 4; k++) malha(new THREE.CapsuleGeometry(0.0075, 0.03, 3, 6), pele, cotovelo, -0.018 + k * 0.012, -0.325, 0.006, false)   // dedos
    malha(new THREE.CapsuleGeometry(0.011, 0.025, 4, 8), pele, cotovelo, lado * -0.024, -0.27, 0.018).rotation.z = lado * 0.6   // polegar
    let celular = null, cafe = null
    if (lado < 0) { cafe = xicara(); cafe.position.set(0.01, -0.33, 0.04); cafe.rotation.x = -0.15; cafe.visible = false; cotovelo.add(cafe) }
    if (lado > 0) { celular = malha(new THREE.BoxGeometry(0.038, 0.075, 0.008), mat(0x111827, 0.3, 0.3), cotovelo, 0, -0.31, 0.03, false); celular.rotation.x = -1.1; celular.visible = false
      malha(new THREE.PlaneGeometry(0.032, 0.066), new THREE.MeshStandardMaterial({ color: 0x0b1220, emissive: 0x3b82f6, emissiveIntensity: 0.6 }), celular, 0, 0, 0.0045, false) }
    bracos.push({ ombro, cotovelo, celular, cafe })
    const quad = new THREE.Group(); quad.position.set(lado * 0.085, -0.02, 0); quadril.add(quad)
    const coxa = capsula(corpoB ? 0.066 : 0.07, 0.3, saia ? pele : calca); coxa.position.y = -0.2; coxa.scale.set(1, 1, 1.05); quad.add(coxa)
    const joelho = new THREE.Group(); joelho.position.y = -0.42; quad.add(joelho)
    const canela = capsula(corpoB ? 0.05 : 0.058, 0.3, saia ? pele : calca); canela.position.y = -0.2; joelho.add(canela)
    const tornozelo = new THREE.Group(); tornozelo.position.y = -0.39; joelho.add(tornozelo)
    const pe = new THREE.Mesh(new RoundedBoxGeometry(corpoB ? 0.085 : 0.095, 0.07, corpoB ? 0.22 : 0.24, 3, 0.03), sapato); pe.position.set(0, -0.015, 0.055); pe.castShadow = true; tornozelo.add(pe)
    malha(new THREE.BoxGeometry(corpoB ? 0.09 : 0.1, 0.012, corpoB ? 0.225 : 0.245), mat(0xe7e5e4, 0.6), tornozelo, 0, -0.05, 0.055, false)   // sola
    malha(new THREE.BoxGeometry(0.05, 0.004, 0.06), mat(0xf5f5f4, 0.7), tornozelo, 0, 0.022, 0.09, false)   // cadarço
    pernas.push({ quad, joelho, tornozelo })
  }
  if (sentada) {
    pernas.forEach((p) => { p.quad.rotation.x = -Math.PI / 2; p.joelho.rotation.x = Math.PI / 2 })
    bracos.forEach((b) => { b.ombro.rotation.x = -0.55; b.cotovelo.rotation.x = -0.9 })
  }
  g.userData = { quadril, pescoco, bracos, pernas, olhos, fase: r() * 10, sentada, ap: { pele: `#${new THREE.Color(corPele).getHexString()}`, cabelo: estilo, cor_cabelo: `#${new THREE.Color(corCabelo).getHexString()}`, roupa: `#${new THREE.Color(corRoupa).getHexString()}`, calca: `#${new THREE.Color(corCalca).getHexString()}`, sapato: `#${sapato.color.getHexString()}`, traje, corpo: corpoB ? 'b' : 'a', oculos: !!(ap?.oculos), barba: !!(ap?.barba), cracha: ap ? ap.cracha !== false : true } }
  return g
}

// senta (pose de digitar) e levanta: o avatar controlado usa as duas
function sentarPose(p) {
  const u = p.userData
  u.sentada = true
  u.pernas.forEach((q) => { q.quad.rotation.x = -Math.PI / 2; q.joelho.rotation.x = Math.PI / 2; q.quad.rotation.z = 0; if (q.tornozelo) q.tornozelo.rotation.x = 0 })
  u.bracos.forEach((b) => { b.ombro.rotation.x = -0.55; b.cotovelo.rotation.x = -0.9; if (b.celular) b.celular.visible = false })
  u.quadril.position.y = 0.47; u.quadril.rotation.z = 0
}

// levanta quem estava sentado (para andar no controle)
function levantar(p) {
  const u = p.userData
  u.sentada = false
  u.pernas.forEach((q) => { q.quad.rotation.x = 0; q.joelho.rotation.x = 0 })
  u.bracos.forEach((b) => { b.ombro.rotation.x = 0; b.cotovelo.rotation.x = -0.2 })
  u.quadril.position.y = 0.92; u.quadril.rotation.x = 0
}

// em cima da moto: pernas abertas e dobradas, mãos no guidão, tronco inclinado para a frente
function poseMoto(p) {
  const u = p.userData
  u.sentada = true
  u.pernas.forEach((q, i) => { q.quad.rotation.x = -1.15; q.joelho.rotation.x = 1.5; q.quad.rotation.z = (i ? -1 : 1) * 0.28; if (q.tornozelo) q.tornozelo.rotation.x = -0.3 })
  u.bracos.forEach((b) => { b.ombro.rotation.x = -1.15; b.cotovelo.rotation.x = -0.35; if (b.celular) b.celular.visible = false })
  u.quadril.position.y = 0.47; u.quadril.rotation.x = 0.32; u.quadril.rotation.z = 0
}

function piscar(p, t) {
  const o = p.userData.olhos; if (!o) return
  const fechado = ((t + p.userData.fase) % 4.2) < 0.12
  for (let i = 0; i < o.length; i += 2) o[i].rotation.x = fechado ? 1.2 : 0.35
}
function animarPessoa(p, t) {
  piscar(p, t)
  const { pescoco, bracos, pernas, fase, sentada, quadril } = p.userData
  if (sentada) {
    // digitando: antebraços batem, cabeça olha a tela e às vezes vira
    const encosta = Math.max(0, Math.sin(t * 0.13 + fase) - 0.85) * 4   // de vez em quando encosta e respira fundo
    bracos.forEach((b, i) => { b.cotovelo.rotation.x = -0.9 + Math.sin(t * 9 + fase + i * 1.7) * 0.07 * (1 - encosta) + (i && Math.sin(t * 0.6 + fase) > 0.6 ? Math.sin(t * 3 + fase) * 0.05 : 0) })
    quadril.rotation.x = -encosta * 0.12
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

// andar com a fase presa à distância percorrida (o pé não escorrega); k = 0 parado, 1 andando.
// Andando: o pé rola do calcanhar à ponta, o quadril sobe e balança, o tronco gira ao contrário das pernas e a
// cabeça fica firme. Parado: respira, troca o peso de perna, olha em volta; com celular, olha a tela.
function animarAndar(p, passo, k, t, celular = false, cafe = false) {
  piscar(p, t)
  const { pescoco, bracos, pernas, quadril, fase } = p.userData
  const c = Math.sin(passo), j = 1 - k
  pernas[0].quad.rotation.x = c * 0.42 * k; pernas[1].quad.rotation.x = -c * 0.42 * k
  pernas[0].joelho.rotation.x = Math.max(0, Math.sin(passo + 1.3)) * 0.75 * k
  pernas[1].joelho.rotation.x = Math.max(0, -Math.sin(passo + 1.3)) * 0.75 * k
  pernas.forEach((pp, i) => { if (pp.tornozelo) pp.tornozelo.rotation.x = (i ? -1 : 1) * Math.sin(passo - 0.6) * 0.28 * k - (pp.joelho.rotation.x * 0.25) })
  // peso de uma perna para a outra quando parado (bem devagar)
  const peso = Math.sin(t * 0.45 + fase) * j
  pernas[0].quad.rotation.z = peso * 0.035; pernas[1].quad.rotation.z = peso * 0.035
  bracos[0].ombro.rotation.x = -c * 0.38 * k + Math.sin(t * 0.9 + fase) * 0.03 * j
  bracos[1].ombro.rotation.x = c * 0.38 * k + Math.sin(t * 0.9 + fase + 1) * 0.03 * j
  bracos[0].ombro.rotation.z = -0.07; bracos[1].ombro.rotation.z = 0.07
  bracos.forEach((b, i) => { b.cotovelo.rotation.x = -0.18 - 0.22 * k - (i ? Math.max(0, c) : Math.max(0, -c)) * 0.18 * k })
  quadril.position.y = 0.92 + Math.abs(Math.cos(passo)) * 0.032 * k + Math.sin(t * 1.6 + fase) * 0.004 * j
  quadril.rotation.y = c * 0.08 * k
  quadril.rotation.z = Math.sin(passo) * 0.035 * k - peso * 0.02
  pescoco.rotation.y = j * Math.sin(t * 0.35 + fase) * 0.5 - quadril.rotation.y * 0.9
  pescoco.rotation.x = 0.05 + Math.abs(Math.cos(passo)) * 0.015 * k
  const xi = bracos[0]?.cafe
  if (xi) {
    xi.visible = !!cafe
    if (cafe) {   // segura a xícara na altura do peito; parado, dá um gole a cada ~4 s (leva à boca e inclina a cabeça)
      const gole = k < 0.05 ? Math.max(0, Math.sin((t + fase) * 1.55)) ** 6 : 0
      bracos[0].ombro.rotation.x = -0.45 - gole * 0.95; bracos[0].cotovelo.rotation.x = -1.45 - gole * 0.55; bracos[0].ombro.rotation.z = -0.25 + gole * 0.12
      xi.rotation.x = -0.15 - gole * 0.9
      pescoco.rotation.x = 0.05 - gole * 0.18
    }
  }
  const cel = bracos[1]?.celular
  if (cel) {
    const usa = celular && k < 0.05
    cel.visible = usa
    if (usa) { bracos[1].ombro.rotation.x = -0.55; bracos[1].cotovelo.rotation.x = -1.35; bracos[1].ombro.rotation.z = 0.2; pescoco.rotation.x = 0.42; pescoco.rotation.y *= 0.2 }
  }
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

// nome e cargo acima da cabeça
function etiquetaPessoa(nome, cargo) {
  const c = document.createElement('canvas'); const g = c.getContext('2d')
  const f1 = '600 44px system-ui, -apple-system, sans-serif', f2 = '400 34px system-ui, -apple-system, sans-serif'
  g.font = f1; const w1 = g.measureText(nome).width; g.font = f2; const w2 = cargo ? g.measureText(cargo).width : 0
  const w = Math.ceil(Math.max(w1, w2)) + 48, h = cargo ? 118 : 76
  c.width = w; c.height = h
  g.fillStyle = 'rgba(15,23,42,0.85)'; g.beginPath(); g.roundRect(0, 0, w, h, 22); g.fill()
  g.fillStyle = '#0f766a'; g.fillRect(0, 18, 7, h - 36)
  g.textBaseline = 'middle'; g.font = f1; g.fillStyle = '#ffffff'; g.fillText(nome, 24, 40)
  if (cargo) { g.font = f2; g.fillStyle = '#94a3b8'; g.fillText(cargo, 24, 86) }
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }))
  sp.scale.set(w / 76 * 0.24, h / 76 * 0.24, 1); sp.renderOrder = 10
  return sp
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

export default function Mapa3D({ mapa, ares, projetos, filtro = 'todos', selecionado, aoSelecionar, compacto = false, comPredio = !compacto, acoes = null, perm = {}, extra = null }) {
  const { marca } = useMarca()
  const ref = useRef(null)
  const rotulosRef = useRef(null)
  const estado = useRef({})
  const [girando, setGirando] = useState(compacto && !window.matchMedia('(prefers-reduced-motion: reduce)').matches)
  const [paredesAltas, setParedesAltas] = useState(true)
  const [ilha, setIlha] = useState(false)   // vista da Ilha de Santa Catarina de cima (o prédio para de desenhar enquanto isso)
  const fecharIlha = useMemo(() => () => setIlha(false), [])
  useEffect(() => { estado.current.naIlha = ilha }, [ilha])
  const [pronto, setPronto] = useState(false)
  const [hora, setHora] = useState('agora')   // agora | dia | noite
  // tempo no 3D: previsão real (Open-Meteo pelo backend) ou pré-visualização escolhida
  const [clima, setClima] = useState(null)
  const [tempoVista, setTempoVista] = useState('agora')   // agora | limpo | nublado | chuva | trovoada
  const [verPrevisao, setVerPrevisao] = useState(() => typeof window === 'undefined' || window.innerWidth > 640)
  const tempoRef = useRef({ tipo: 'limpo', nuvens: 0 })
  useEffect(() => {
    if (!comPredio) return undefined
    let vivo = true
    const buscar = () => api.get('/api/clima-externo').then((c) => { if (vivo && c?.disponivel) setClima(c) }).catch(() => {})
    buscar()
    const id = setInterval(buscar, 10 * 60 * 1000)
    return () => { vivo = false; clearInterval(id) }
  }, [comPredio])
  useEffect(() => {
    tempoRef.current = { tipo: tempoVista === 'agora' ? clima?.tipo || 'limpo' : tempoVista, nuvens: clima?.nuvens ?? 0 }
    const E = estado.current
    E.predio?.definirTempo?.(tempoRef.current.tipo, tempoRef.current.nuvens)
    if (E.cena?.fog && E.foFar0) { const nev = tempoRef.current.tipo === 'neblina', ch = ['chuva', 'trovoada'].includes(tempoRef.current.tipo); E.cena.fog.near = nev ? 25 : ch ? 70 : E.foNear0; E.cena.fog.far = nev ? 120 : ch ? 220 : E.foFar0 }
  }, [clima, tempoVista])
  const [relogio, setRelogio] = useState(() => Math.floor(horaBrasilia() * 4))  // muda a cada 15 min
  const [aberto, setAberto] = useState(!comPredio)   // prédio fechado: clicar abre o andar do escritório
  // cartões do 3D (janela, item, pessoa, escrita), modo de escrever no vidro e controle de avatar
  const [cartao, setCartao] = useState(null)
  const [controle, setControle] = useState(null)
  const [online, setOnline] = useState([])   // quem está no mapa agora (multijogador)
  // multijogador: um canal por aba enquanto o mapa com o prédio está aberto
  useEffect(() => {
    if (!comPredio) return undefined
    let vivo = true, m = null
    conectarMultijogador({ aoMudar: () => { if (vivo && m) setOnline(m.pessoas()) } })
      .then((x) => { if (!vivo) { x?.fechar(); return } m = x; if (estado.current) estado.current.mp = x; if (x) setOnline(x.pessoas()) })
      .catch(() => { /* sem Realtime: joga sozinho */ })
    return () => { vivo = false; m?.fechar(); if (estado.current) estado.current.mp = null }
  }, [comPredio])
  const [nivel, setNivel] = useState('andar')       // 'andar' (escritório) ou 'terreo' (recepção, pelo elevador)
  const [viagem, setViagem] = useState(null)        // elevador andando: { andar, seta, destino }
  const [escrevendo, setEscrevendo] = useState(false)
  const [rascunhoEsc, setRascunhoEsc] = useState(null)
  const [ocupado, setOcupado] = useState(false)
  // luzes reais (tela Iluminação): sala com a lâmpada apagada fica escura no 3D; sem lâmpada cadastrada, acende à noite
  useEffect(() => {
    let vivo = true
    const ler = () => api.get('/api/dispositivos?tipo=luz').then((r) => {
      if (!vivo) return
      const est = {}
      for (const d of r.dispositivos || []) {
        if (!d.projeto_id || !d.conectado || typeof d.resumo?.ligada !== 'boolean') continue
        est[d.projeto_id] = est[d.projeto_id] === true || d.resumo.ligada   // alguma acesa na sala = sala acesa
      }
      const E = estado.current
      E.estadoLuzes = est
      E.aplicarLuzes?.(est)
    }).catch(() => {})
    ler()
    const t = setInterval(() => { if (!document.hidden) ler() }, 60000)
    return () => { vivo = false; clearInterval(t) }
  }, [])
  useEffect(() => {
    const E = estado.current
    E.abrirCartao = (u) => {
      if (!acoes) return
      if (u?.tipo === 'vidro') { setRascunhoEsc({ id: `esc-${Date.now().toString(36)}`, x: u.x, y: u.y, horiz: u.horiz, lado: u.lado, altura: u.altura, texto: '', cor: 'azul', tamanho: 2, novo: true }); setCartao(null); return }
      setRascunhoEsc(null); setCartao(u)
    }
    E.setControle = setControle
    E.setNivel = setNivel
    E.setViagem = setViagem
    E.escrevendo = escrevendo
  }, [acoes, escrevendo])
  // teclado do controle (não rouba teclas de campos de texto)
  useEffect(() => {
    if (!controle) return undefined
    const campo = () => ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)
    const nome = (e) => (e.key === 'Shift' ? 'shift' : e.key.toLowerCase())
    const baixo = (e) => {
      if (campo()) return
      const c = estado.current.ctrl; if (!c) return
      const k = nome(e)
      const ED = estado.current
      if (ED.dirigindo) {   // dentro do carro: W/S acelera e freia, A/D vira, Espaço freio de mão (voando: sobe), X desce, Shift nitro, T propulsores, C câmera, H buzina, R desvira, E sai
        if (k === 'e' || k === 'escape') { e.preventDefault(); ED.alternarCarro?.(); if (k === 'escape') ED.pararControle?.(); return }
        if (k === 'c') { e.preventDefault(); ED.camCarro?.(); return }
        if (k === 'r') { e.preventDefault(); ED.desvirar?.(); return }
        if (k === 'h') { e.preventDefault(); ED.buzina?.(true); return }
        if (k === 't') { e.preventDefault(); if (!e.repeat) ED.propulsores?.(); return }
        if (['w', 'a', 's', 'd', ' ', 'x', 'shift', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k)) { e.preventDefault(); c.teclas.add(k) }
        return
      }
      if (k === 'e' && ED.alternarCarro?.()) { e.preventDefault(); return }
      if (k === 'escape') { estado.current.pararControle?.(); return }
      if (k === 'v') { estado.current.mudarModo?.(c.modo === '1' ? '3' : '1'); return }
      if (k === 'f') { e.preventDefault(); estado.current.sentar?.(); return }
      if (k === 'c') { e.preventDefault(); estado.current.cafe?.(); return }
      if (k === 'r') { e.preventDefault(); estado.current.irElevador?.(); return }
      if (['w', 'a', 's', 'd', 'q', 'e', 'shift', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k)) { e.preventDefault(); c.teclas.add(k) }
    }
    const cima = (e) => { const k = nome(e); if (k === 'h') estado.current.buzina?.(false); estado.current.ctrl?.teclas.delete(k) }
    const sair = () => estado.current.ctrl?.teclas.clear()
    window.addEventListener('keydown', baixo); window.addEventListener('keyup', cima); window.addEventListener('blur', sair)
    return () => { window.removeEventListener('keydown', baixo); window.removeEventListener('keyup', cima); window.removeEventListener('blur', sair) }
  }, [controle])
  const executar = async (fn) => { setOcupado(true); try { await fn() } finally { setOcupado(false) } }

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
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, compacto ? 1.5 : 2))
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
    // as funções ligadas ao React (barra de controle, cartões, elevador) foram registradas por outro efeito antes deste:
    // recriar o objeto sem elas deixava a barra de controle (e as teclas F/R/C) sem resposta até a tela re-renderizar
    const antes = estado.current || {}
    estado.current = { cena, camera, controles, renderer, setControle: antes.setControle, setNivel: antes.setNivel, setViagem: antes.setViagem,
      abrirCartao: antes.abrirCartao, escrevendo: antes.escrevendo, estadoLuzes: antes.estadoLuzes }
    try { if (localStorage.getItem('clima-debug-3d') === '1') window.__mapa3d = estado }   // só para testes (Playwright): liga à mão no navegador
    catch { /* sem armazenamento */ }
    setPronto(true)
    let quadro
    const relogio = new THREE.Clock()
    const laco = () => {
      quadro = requestAnimationFrame(laco)
      if (document.hidden || estado.current.foraDaTela || estado.current.naIlha) { relogio.getDelta(); return }   // fora da tela não desenha (não pesa na rolagem)
      const dt = Math.min(relogio.getDelta(), 0.05), t = relogio.elapsedTime
      estado.current.tick?.(dt, calmo ? 0 : t)
      if (!estado.current.ctrl) controles.update()
      if (!estado.current.compilando) renderer.render(cena, camera)
      estado.current.rotulos?.()
    }
    laco()
    const ajustar = () => { const w = el.clientWidth, h = el.clientHeight; renderer.setSize(w, h, false); camera.aspect = w / Math.max(1, h); camera.updateProjectionMatrix() }
    ajustar()
    const ro = new ResizeObserver(ajustar); ro.observe(el)
    const io = new IntersectionObserver(([en]) => { estado.current.foraDaTela = !en.isIntersecting }, { rootMargin: '80px' }); io.observe(el)
    return () => {
      cancelAnimationFrame(quadro); ro.disconnect(); io.disconnect(); controles.dispose()
      el.removeChild(renderer.domElement)
      // espera a compilação assíncrona terminar antes de descartar (senão: "reading 'isReady'" do three.js)
      Promise.resolve(estado.current.compilacao).then(() => {
        cena.traverse((o) => { o.geometry?.dispose?.(); if (o.material) [].concat(o.material).forEach((m) => { m.map?.dispose?.(); m.dispose?.() }) })
        renderer.dispose()
      })
    }
  }, [])

  // monta (ou remonta) o escritório quando a planta, os ares ou a altura das paredes mudam
  useEffect(() => {
    const E = estado.current
    if (!E.cena) return undefined
    const { cena, camera, controles, renderer } = E
    const escuro = document.documentElement.classList.contains('dark')
    if (E.mundo) {
      const velho = E.mundo; cena.remove(velho)
      Promise.resolve(E.compilacao).then(() => velho.traverse((o) => { o.geometry?.dispose?.(); if (o.material) [].concat(o.material).forEach((m) => { m.map?.dispose?.(); m.dispose?.() }) }))
    }
    const mundo = new THREE.Group(); E.mundo = mundo; cena.add(mundo)
    const salas = projetos.filter((p) => mapa.salas[p.id]).map((p) => ({ ...mapa.salas[p.id], p }))
    if (!salas.length) return undefined
    const x0 = Math.min(...salas.map((s) => s.x)), y0 = Math.min(...salas.map((s) => s.y))
    const x1 = Math.max(...salas.map((s) => s.x + s.w)), y1 = Math.max(...salas.map((s) => s.y + s.h))
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2
    let cafeTrocada = false
    const cafesArmario = []
    const cafeteiras = []   // máquinas de café do andar (balcões e a copa): luz e vapor quando alguém faz café
    E.pontoCafe = null
    const W = (mx) => (mx - cx) * S, Z = (my) => (my - cy) * S
    const ALT = paredesAltas ? 2.6 : 1.1
    const r = aleatorio(7)

    // luz pela hora real (ou forçada em Dia/Noite): sol, céu e luz de teto à noite
    const h = hora === 'dia' ? 13 : hora === 'noite' ? 21.5 : horaBrasilia()
    const ceu = ceuDaHora(h)
    E.ceu = ceu
    const fundoCeu = texturaCeu(ceu); cena.background = fundoCeu
    cena.fog = new THREE.Fog(new THREE.Color(ceu.noite ? 0x0b1530 : ceu.crepusculo ? 0xe2a07a : 0xdbe9f6), comPredio ? 120 : 45, comPredio ? 380 : 95)
    E.foNear0 = cena.fog.near; E.foFar0 = cena.fog.far
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
    sol.shadow.mapSize.set(comPredio ? 4096 : compacto ? 1024 : 2048, comPredio ? 4096 : compacto ? 1024 : 2048)
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
      const cor = s.cor_piso ? new THREE.Color(s.cor_piso) : new THREE.Color(0xffffff).lerp(new THREE.Color(s.p.cor || '#0f766a'), 0.12)   // cor do chão escolhida no cartão da sala
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
    const clicaveis = []    // janelas, itens, pessoas e escritas (o clique abre um cartão)
    const vidros = []       // painéis de vidro (onde dá para escrever)
    const obstaculos = []   // retângulos que ninguém atravessa (metros): paredes, mesas, cadeiras, armários
    const bloquear = (x, z, w, d, ry = 0) => obstaculos.push({ x, z, w, d, ry })
    // caixa invisível de clique para móveis (o cartão deixa trocar a cor)
    const alvoItem = (id, x, z, w, d, h, ry = 0, pai = null) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshBasicMaterial({ visible: false }))
      m.position.set(x, h / 2, z); m.rotation.y = ry; m.userData = { tipo: 'item', id }; (pai || mundo).add(m); clicaveis.push(m)
    }
    const vidro = (horiz, k, a, b, ya, yb) => {
      const comp = (b - a) * S, alt = yb - ya
      if (comp <= 0.01 || alt <= 0) return
      const cx2 = horiz ? W((a + b) / 2) : W(k), cz2 = horiz ? Z(k) : Z((a + b) / 2)
      const v = new THREE.Mesh(new THREE.BoxGeometry(horiz ? comp : 0.02, alt, horiz ? 0.02 : comp), matVidroParede)
      v.position.set(cx2, ya + alt / 2, cz2); v.renderOrder = 2; mundo.add(v)
      v.userData = { tipo: 'vidro', horiz, k }; vidros.push(v)
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
      const aberta = Number.isFinite(+sg.el?.aberta) ? +sg.el.aberta / 100 : 0.42
      const baixa = topoV - (topoV - 0.96) * Math.max(0.06, 1 - aberta) - 0.0, hp = Math.max(0.03, topoV - 0.05 - baixa)
      lam(comp + 0.06, 0.06, 0.07, matPersianaCaixa, topoV - 0.02)
      const tela = lam(comp + 0.02, hp, 0.012, matPersiana, baixa + hp / 2); tela.renderOrder = 3
      lam(comp + 0.03, 0.025, 0.035, matPersianaCaixa, baixa)
      lam(0.008, hp + 0.2, 0.008, matPerfil, baixa - 0.1 + hp / 2 + 0.05, comp / 2 - 0.06)
      if (sg.el?.id) {
        const alvoJ = lam(comp, topoV - 0.9, 0.3, new THREE.MeshBasicMaterial({ visible: false }), (0.92 + topoV) / 2)
        alvoJ.userData = { tipo: 'janela', id: sg.el.id }; clicaveis.push(alvoJ)
      }
    }
    // porta de vidro (como as paredes de vidro) nas salas privativas e na bancada; a da Reunião (alvenaria) e as portas com
    // cor escolhida (ex.: a preta do Escritório) continuam sólidas. e.vidro força um ou outro.
    const portaDeVidro = (e) => {
      if (!e) return false
      if (e.vidro != null) return !!e.vidro
      if (e.cor) return false
      const [pcx, pcy] = girar(e, e.w / 2, e.h / 2)
      const sl = salas.filter((s2) => pcx > s2.x - 20 && pcx < s2.x + s2.w + 20 && pcy > s2.y - 20 && pcy < s2.y + s2.h + 20).sort((a2, b2) => a2.w * a2.h - b2.w * b2.h)[0]
      return !(sl && /reuni/i.test(sl.p.nome))
    }
    const batente = (sg) => {
      const matB = portaDeVidro(sg.el) ? matPerfil : matMadeira
      const comp = (sg.b - sg.a) * S, alt = Math.min(2.1, ALT)
      const cx2 = sg.horiz ? W((sg.a + sg.b) / 2) : W(sg.k), cz2 = sg.horiz ? Z(sg.k) : Z((sg.a + sg.b) / 2)
      for (const f of [-0.5, 0.5]) {
        const o = new THREE.Mesh(new THREE.BoxGeometry(sg.horiz ? 0.05 : ESP + 0.04, alt, sg.horiz ? ESP + 0.04 : 0.05), matB)
        o.position.set(cx2 + (sg.horiz ? f * comp : 0), alt / 2, cz2 + (sg.horiz ? 0 : f * comp)); mundo.add(o)
      }
      if (ALT > 2.1) { const o = new THREE.Mesh(new THREE.BoxGeometry(sg.horiz ? comp + 0.05 : ESP + 0.04, 0.05, sg.horiz ? ESP + 0.04 : comp + 0.05), matB); o.position.set(cx2, 2.1, cz2); mundo.add(o) }
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
    // O andar é maior que as salas: MARGEM metros de corredor em volta (com o hall dos elevadores em frente à porta de
    // entrada) até a fachada de vidro. A grade das pessoas vai até a fachada: ninguém sai da laje.
    const andar = Number.isFinite(+mapa.andar) ? +mapa.andar : 9
    const andares = Number.isFinite(+mapa.andares) ? +mapa.andares : 11
    const MARGEM = comPredio ? 4.2 : 0   // corredor largo dos lados (antes 2,5 m: o avatar enroscava)
    const fx0 = W(x0) - 0.35 - MARGEM, fx1 = W(x1) + 0.35 + MARGEM, fz0 = Z(y0) - 0.35 - MARGEM, fz1 = Z(y1) + 0.35 + MARGEM
    E.limitesAndar = comPredio ? [fx0 + 0.32, fz0 + 0.32, fx1 - 0.32, fz1 - 0.32] : null
    // minimapa (estilo jogo): salas com a cor do projeto e o contorno do prédio, em metros do mundo
    E.mini = { salas: salas.map((s) => ({ x0: W(s.x), z0: Z(s.y), x1: W(s.x + s.w), z1: Z(s.y + s.h), cor: s.p.cor || '#0f766a', nome: s.p.nome })),
      predio: [fx0, fz0, fx1, fz1], andar: Number.isFinite(+mapa.andar) ? +mapa.andar : 9 }
    E.elevAndar = null; E.elevInfo = null; E.elevTerreo = null; E.trocarNivel = null   // a cena é refeita: nada da anterior
    E.cidadeRuas = null
    const predio = comPredio ? montarPredio({ bx0: fx0, bx1: fx1, bz0: fz0, bz1: fz1, entrada, nome: marca?.nome || '', noite: ceu.noite, r, andar, andares }) : null
    if (predio) {
      E.cidadeRuas = predio.cidade
      mundo.add(predio.grupo); predio.aplicar(E.aberto ? 1 : 0); predio.tick(0, 0)
      chao.position.y = -predio.yA - 0.02; calcada.visible = false
      // piso do corredor (porcelanato) por baixo das salas
      const texC = texturaPiso('porcelanato', 0xd6d3d1); texC.repeat.set((fx1 - fx0) / 1.2, (fz1 - fz0) / 1.2)
      const corredor = new THREE.Mesh(new THREE.PlaneGeometry(fx1 - fx0, fz1 - fz0), new THREE.MeshStandardMaterial({ color: escuro ? 0xa8a29e : 0xeeece9, map: texC, roughness: 0.35 }))
      corredor.rotation.x = -Math.PI / 2; corredor.position.set((fx0 + fx1) / 2, -0.004, (fz0 + fz1) / 2); corredor.receiveShadow = true; mundo.add(corredor)
      // fachada do andar: guarda-corpo de vidro com montantes (aparece com o andar aberto; fechado, a torre já cobre)
      const fachada = new THREE.Group(); mundo.add(fachada); E.fachadaAndar = fachada
      const altF = 1.1   // guarda-corpo de vidro: mostra o limite sem tapar a vista de cima (quem segura as pessoas é a grade)
      const matF = new THREE.MeshStandardMaterial({ color: 0x9cc3e0, roughness: 0.05, metalness: 0.2, transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide })
      const matM = new THREE.MeshStandardMaterial({ color: 0x64748b, roughness: 0.4, metalness: 0.5 })
      const ladosF = [[true, fz0 + 0.06, fx0, fx1], [true, fz1 - 0.06, fx0, fx1], [false, fx0 + 0.06, fz0, fz1], [false, fx1 - 0.06, fz0, fz1]]
      const montantes = []
      for (const [horiz, k, a, b] of ladosF) {
        const v = new THREE.Mesh(new THREE.PlaneGeometry(b - a, altF), matF); v.position.set(horiz ? (a + b) / 2 : k, altF / 2, horiz ? k : (a + b) / 2); if (!horiz) v.rotation.y = Math.PI / 2; fachada.add(v)
        for (const y of [0.05, altF - 0.04]) { const t = new THREE.Mesh(new THREE.BoxGeometry(horiz ? b - a : 0.08, 0.08, horiz ? 0.08 : b - a), matM); t.position.set(horiz ? (a + b) / 2 : k, y, horiz ? k : (a + b) / 2); fachada.add(t) }
        const n = Math.max(1, Math.round((b - a) / 1.5))
        for (let i = 0; i <= n; i++) montantes.push(horiz ? [a + (i * (b - a)) / n, k] : [k, a + (i * (b - a)) / n])
      }
      const im = new THREE.InstancedMesh(new THREE.BoxGeometry(0.06, altF, 0.06), matM, montantes.length)
      const m4 = new THREE.Matrix4(); montantes.forEach(([x, z], i) => { m4.makeTranslation(x, altF / 2, z); im.setMatrixAt(i, m4) }); fachada.add(im)
      // elevadores: núcleo encostado na parede de fora, ao lado da porta de entrada e saindo para o corredor, com as
      // portas viradas para o mesmo lado da porta. Funciona: chama, entra, escolhe o andar (térreo ou o escritório).
      if (entrada && !compacto) {
        const n = { sul: [0, 1], norte: [0, -1], leste: [1, 0], oeste: [-1, 0] }[entrada.lado]
        const t = [Math.abs(n[1]), Math.abs(n[0])]   // ao longo da parede
        const sobra = (s) => s > 0 ? (n[0] ? fz1 - entrada.z : fx1 - entrada.x) : (n[0] ? entrada.z - fz0 : entrada.x - fx0)
        // posição do elevador: mapa.elevador = { lado: 1 | -1, distancia: m do meio da porta ao meio do núcleo } (Editar planta)
        const cfgE = mapa.elevador || {}
        const COZ = { L: 3.6, D: 2.8 }, BAN = { L: 3.2, D: 2.8 }
        const lado = cfgE.lado === 1 || cfgE.lado === -1 ? cfgE.lado : sobra(1) >= sobra(-1) ? 1 : -1
        // parede do escritório (não a laje): até onde dá para encostar as salas do corredor
        const parede = n[0] ? [Z(y0), Z(y1)] : [W(x0), W(x1)], cPorta = n[0] ? entrada.z : entrada.x
        const ateFim = (sg) => (sg > 0 ? parede[1] - cPorta : cPorta - parede[0]) - 0.2
        const alPadrao = 0.75 + COZ.L + 0.3 + ELEV.larg / 2   // a copa cabe entre a porta e o elevador
        const al = Math.max(0.55 + 0.4 + ELEV.larg / 2, Math.min(Number(cfgE.distancia) || alPadrao, Math.max(1.5, ateFim(lado) - ELEV.larg / 2)))
        const ox = entrada.x + t[0] * lado * al + n[0] * (ESP / 2 + 0.02), oz = entrada.z + t[1] * lado * al + n[1] * (ESP / 2 + 0.02)
        const el = montarElevador({ rotuloAndar: String(andar), escuro })
        el.grupo.position.set(ox, 0, oz); el.grupo.rotation.y = Math.atan2(n[0], n[1]); mundo.add(el.grupo)
        const fr = ELEV.prof
        bloquear(ox + n[0] * fr / 2, oz + n[1] * fr / 2, n[0] ? fr : ELEV.larg, n[0] ? ELEV.larg : fr)
        // pontos de cada carro no mundo: frente (onde se chama) e meio da cabine
        const mundoDe = (u, v) => { const vv = new THREE.Vector3(u, 0, v); el.grupo.updateMatrixWorld(true); el.grupo.localToWorld(vv); return [vv.x, vv.z] }
        E.elevAndar = { el, nivel: 'andar', yBase: 0, frenteYaw: Math.atan2(n[0], n[1]),
          carros: el.carros.map((c) => ({ c, frente: mundoDe(c.cx, fr + 0.75), cabine: mundoDe(c.cx, 0.85), porta: mundoDe(c.cx, fr + 0.2) })) }
        E.elevInfo = { ox, oz, n, lado, andar, al }
        // copa (cozinha) do lado da porta e banheiro do outro lado do elevador; sem espaço, vão para o outro lado da porta
        const rot = Math.atan2(n[0], n[1])
        const salaCorredor = (montar, cfg, dist, sg) => {
          const r2 = montar({ ...cfg, ALT: Math.max(ALT, 2.4), matParede, matVidro: matVidroParede, ligada: true })
          r2.grupo.position.set(entrada.x + t[0] * sg * dist + n[0] * (ESP / 2 + 0.02), 0, entrada.z + t[1] * sg * dist + n[1] * (ESP / 2 + 0.02))
          r2.grupo.rotation.y = rot; mundo.add(r2.grupo); r2.grupo.updateMatrixWorld(true)
          const vv = new THREE.Vector3()
          for (const o of r2.obst) { vv.set(o.u, 0, o.v); r2.grupo.localToWorld(vv); bloquear(vv.x, vv.z, o.w, o.d, rot) }
          return r2
        }
        const livreDaPorta = al - ELEV.larg / 2 - 0.75
        const cozDist = livreDaPorta >= COZ.L + 0.1 ? 0.75 + COZ.L / 2 : 0.75 + COZ.L / 2
        const cozLado = livreDaPorta >= COZ.L + 0.1 ? lado : -lado
        const banDistLado = al + ELEV.larg / 2 + 0.3 + BAN.L / 2
        const banNoLado = banDistLado + BAN.L / 2 <= ateFim(lado)
        if (cozDist + COZ.L / 2 <= ateFim(cozLado)) {
          const coz = salaCorredor(montarCozinha, COZ, cozDist, cozLado)
          cafeteiras.push(coz.cafeteira)
          const pc = new THREE.Vector3(coz.pontos.cafe.u, 0, coz.pontos.cafe.v); coz.grupo.localToWorld(pc)
          const pm = new THREE.Vector3(-0.45, 1.0, 0.35); coz.grupo.localToWorld(pm)
          E.pontoCafe = { x: pc.x, z: pc.z, olhar: [pm.x, pm.z], maquina: coz.cafeteira }
        }
        const banDist = banNoLado ? banDistLado : (cozLado === -lado ? 0.75 + COZ.L + 0.3 + BAN.L / 2 : 0.75 + BAN.L / 2)
        if (banDist + BAN.L / 2 <= ateFim(banNoLado ? lado : -lado)) salaCorredor(montarBanheiro, BAN, banDist, banNoLado ? lado : -lado)
      }
      // placa do andar do escritório, visível com o prédio fechado
      const pl = etiqueta(`${marca?.nome || 'Escritório'} · ${andar}º andar`, '#ffffff', 'rgba(15,118,106,0.92)')
      pl.position.set(fx1 + 2.5, 2, fz1 + 2.5); pl.scale.multiplyScalar(7); mundo.add(pl); E.placaAndar = pl
    }
    E.predio = predio
    if (predio) {   // tempo atual (previsão ou pré-visualização) no prédio recém-montado
      predio.definirTempo(tempoRef.current.tipo, tempoRef.current.nuvens)
      const nev = tempoRef.current.tipo === 'neblina', ch = ['chuva', 'trovoada'].includes(tempoRef.current.tipo)
      if (nev || ch) { cena.fog.near = nev ? 25 : 70; cena.fog.far = nev ? 120 : 220 }
    }
    // luz de teto: painéis acesos (fortes à noite) e luz de verdade em cada sala e no corredor à noite.
    // Desde o three r155 a intensidade é física (candela): o 1,6 de antes quase não iluminava e o andar ficava escuro.
    // Cada sala guarda as suas luzes em E.luzSala[projeto]: quando a lâmpada real (Iluminação) está apagada, a sala apaga.
    const paineis = []
    const noiteOuTarde = ceu.noite || ceu.crepusculo
    const brilhoPainel = ceu.noite ? 1.8 : ceu.crepusculo ? 1.0 : 0.35
    const intensSala = ceu.noite ? 9 : 4
    E.luzSala = {}
    if (ALT > 2) for (const s of salas) {
      const matSala = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff4dc, emissiveIntensity: brilhoPainel })   // só a face de baixo: de cima não aparece
      const nx = Math.max(1, Math.round((s.w * S) / 2.6)), nz = Math.max(1, Math.round((s.h * S) / 2.6))
      for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) {
        const pn = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.6), matSala)
        pn.rotation.x = Math.PI / 2; pn.position.set(W(s.x + (s.w * (i + 0.5)) / nx), ALT - 0.015, Z(s.y + (s.h * (j + 0.5)) / nz)); mundo.add(pn)
      }
      const reg = { mat: matSala, brilho: brilhoPainel, luzes: [], intens: intensSala }
      if (noiteOuTarde) {
        // sala grande ganha duas luzes (uma em cada metade) para não ficar com o fundo escuro
        const grande = Math.max(s.w, s.h) * S > 9
        const pontos = grande ? (s.w >= s.h ? [[s.x + s.w * 0.27, s.y + s.h / 2], [s.x + s.w * 0.73, s.y + s.h / 2]] : [[s.x + s.w / 2, s.y + s.h * 0.27], [s.x + s.w / 2, s.y + s.h * 0.73]]) : [[s.x + s.w / 2, s.y + s.h / 2]]
        for (const [px, py] of pontos) {
          const l = new THREE.PointLight(0xffe7c2, intensSala, Math.max(s.w, s.h) * S * (grande ? 0.75 : 1.2), 1.2)
          l.position.set(W(px), ALT - 0.3, Z(py)); mundo.add(l); paineis.push(l); reg.luzes.push(l)
        }
      }
      E.luzSala[s.p.id] = reg
    }
    // corredor, hall e copa: uma luz no meio de cada lado do anel em volta das salas (só com o prédio, à noite)
    if (noiteOuTarde && comPredio && ALT > 2) {
      const cx = (W(x0) + W(x1)) / 2, cz = (Z(y0) + Z(y1)) / 2, m = 0.35 + MARGEM / 2
      const lados = [[cx, Z(y0) - m], [cx, Z(y1) + m], [W(x0) - m, cz], [W(x1) + m, cz]]
      E.luzCorredor = lados.map(([lx, lz]) => {
        const l = new THREE.PointLight(0xfff1dc, ceu.noite ? 7 : 3, Math.max(W(x1) - W(x0), Z(y1) - Z(y0)) * 0.8, 1.2)
        l.position.set(lx, ALT - 0.3, lz); mundo.add(l); paineis.push(l); return l
      })
    }
    // luz real apagada → sala escura (painéis quase sem brilho, sem luz); acesa ou sem lâmpada cadastrada → acesa
    E.aplicarLuzes = (estados) => {
      for (const [pid, reg] of Object.entries(E.luzSala || {})) {
        const acesa = estados?.[pid] !== false
        reg.mat.emissiveIntensity = acesa ? reg.brilho : 0.05
        reg.luzes.forEach((l) => { l.intensity = acesa ? reg.intens : 0 })
      }
    }
    if (E.estadoLuzes) E.aplicarLuzes(E.estadoLuzes)
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
    const assentos = []   // lugares: { g, posto, comPessoa, nome }; as pessoas entram depois (cadastradas primeiro)
    const pecas = []      // monitor/teclado/mouse/PC de cada posto (modelos da biblioteca, instanciados depois)
    const estacao = (pai, x, z, ry, comPessoa, nome, semMesa = false, posto = null, cor = null) => {
      const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = ry; pai.add(g)
      if (!semMesa) {
        // mesa individual: tampo de madeira, laterais em painel, painel frontal e gaveteiro
        const tampo = new THREE.Mesh(new RoundedBoxGeometry(1.3, 0.045, 0.72, 3, 0.012), cor ? new THREE.MeshStandardMaterial({ color: cor, roughness: 0.55 }) : matTampo); tampo.position.y = 0.745; tampo.castShadow = tampo.receiveShadow = true; g.add(tampo)
        for (const px of [-0.62, 0.62]) caixa(0.04, 0.72, 0.68, matGaveteiro, px, 0.36, 0, 0, g)
        caixa(1.2, 0.42, 0.025, matGaveteiro, 0, 0.5, -0.33, 0, g)
        caixa(0.4, 0.56, 0.55, matGaveteiro, -0.38, 0.29, -0.02, 0, g)
        for (const y of [0.16, 0.34, 0.5]) caixa(0.12, 0.012, 0.012, matPerfil, -0.38, y, 0.26, 0, g)
        caixa(0.21, 0.004, 0.3, new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.9 }), -0.42, 0.77, 0.05, 0.15, g)   // papéis
        caixa(0.08, 0.1, 0.08, new THREE.MeshStandardMaterial({ color: 0xe5e7eb, roughness: 0.4 }), 0.52, 0.82, -0.18, 0, g)   // caneca
      } else {
        caixa(0.36, 0.008, 0.26, new THREE.MeshStandardMaterial({ color: 0x27272a, roughness: 0.9 }), 0.32, 0.765, 0.08, 0, g)   // mouse pad
      }
      const mo = caixa(0.06, 0.03, 0.1, matPreto, 0.32, 0.785, 0.08, 0, g)   // mouse
      const bez = caixa(0.6, 0.36, 0.03, matPreto, 0, 1.06, -0.22, 0, g)
      const tela = caixa(0.56, 0.32, 0.005, matTela, 0, 1.06, -0.203, 0, g); tela.castShadow = false
      const pe = caixa(0.05, 0.14, 0.05, matPreto, 0, 0.83, -0.24, 0, g)
      const tec = caixa(0.42, 0.015, 0.14, matPreto, 0, 0.77, 0.05, 0, g)
      // lugares dos modelos da biblioteca (monitor, teclado, mouse e PC): trocam as caixas quando carregam
      pecas.push({ g, y: 0.7675, monitor: [0, -0.22, [bez, pe], tela], teclado: [0, 0.05, [tec]], mouse: [0.32, 0.08, [mo]], gabinete: semMesa ? null : [0.42, -0.1, [], 0] })
      cadeira(g, 0, 0.55, Math.PI)
      assentos.push({ g, posto, comPessoa, nome, x: 0, z: 0.5, ry: Math.PI, tela })
      return g
    }
    const NAO_PESSOA = /^(sala\s+)?(bancada|reuni|escrit|sem nome|apoio|t[eé]cnica)/i
    const dispositivos = []
    const MOVEIS_APOIO = ['estacao', 'mesa', 'bancada', 'armario', 'gaveteiro']
    const sobreMovel = (e) => { const [mx, my] = girar(e, e.w / 2, e.h / 2); return mapa.elementos.some((o) => o !== e && MOVEIS_APOIO.includes(o.tipo) && mx > o.x && mx < o.x + o.w && my > o.y && my < o.y + o.h) }
    const TIPOS_DISP = ['rack', 'roteador', 'impressora', 'nobreak', 'projetor', 'camera', 'alexa', 'ventilador', 'purificador', 'bebedouro', 'frigobar', 'cadeira', 'quadro']
    for (const e of mapa.elementos) {
      if (e.tipo === 'personagem') continue   // pets e mascotes: montados depois da grade (andam por ela)
      const [mx, my] = girar(e, e.w / 2, e.h / 2)
      const x = W(mx), z = Z(my), ry = -(e.rot || 0) * Math.PI / 180
      const w = e.w * S, d = e.h * S
      if (TIPOS_DISP.includes(e.tipo)) {
        const dsp = montarDispositivo({ ...e, modelo: e.modelo || ITEM[e.tipo]?.modelos?.[0] || '' }, { x, z, ry, w, d, ALT, noite: ceu.noite, sobreMovel: sobreMovel(e) })
        mundo.add(dsp.g); dispositivos.push(dsp); clicaveis.push(dsp.hit)
        if (!['projetor', 'camera', 'quadro', 'roteador'].includes(e.tipo) || (e.tipo === 'roteador' && !/parede/i.test(e.modelo || 'parede'))) bloquear(x, z, Math.max(w, 0.3), Math.max(d, 0.3), ry)
        continue
      }
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
        alvoItem(e.id, 0, 0, comp, prof, 0.8, 0, g)
        for (let i = 0; i < n; i++) {
          const ax = -longo / 2 + longo * (i + 0.5) / n
          estacao(g, ax, -meio, Math.PI, r() > 0.35, null, true, `${e.id}:${i}:a`)
          estacao(g, ax, meio, 0, r() > 0.45, null, true, `${e.id}:${i}:b`)
        }
      } else if (e.tipo === 'estacao') {
        // mesa individual com a pessoa (rot 0 = olhando para o "norte" da planta); etiqueta com o nome da sala-pessoa
        const sala = salas.find((s) => mx > s.x && mx < s.x + s.w && my > s.y && my < s.y + s.h)
        const nome = e.rotulo || (sala && /^sala\s+(.+)/i.test(sala.p.nome.trim()) && !NAO_PESSOA.test(sala.p.nome.trim()) ? sala.p.nome.trim().replace(/^sala\s+/i, '') : null)
        estacao(mundo, x, z, ry, true, nome, false, e.id, e.cor || null)
        alvoItem(e.id, x, z, 1.32, 0.74, 0.8, ry)
        bloquear(x + Math.sin(ry) * 0.2, z + Math.cos(ry) * 0.2, 1.36, 1.25, ry)
      } else if (e.tipo === 'bancada') {
        // bancada técnica encostada na parede: um posto a cada ~1,2 m, cada um com monitor, teclado, mouse e cadeira.
        // rot 0 = quem senta fica do lado de baixo da planta, olhando para a parede de cima (vertical: olha para a esquerda)
        const vertical = d > w * 1.2, longo = vertical ? d : w, prof = Math.max(0.55, vertical ? w : d)
        const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = ry + (vertical ? Math.PI / 2 : 0); mundo.add(g)
        const tampo = new THREE.Mesh(new RoundedBoxGeometry(longo, 0.045, prof, 3, 0.012), e.cor ? new THREE.MeshStandardMaterial({ color: e.cor, roughness: 0.55 }) : matTampo); tampo.position.y = 0.745; tampo.castShadow = tampo.receiveShadow = true; g.add(tampo)
        for (const px of [-longo / 2 + 0.03, longo / 2 - 0.03]) caixa(0.04, 0.72, prof - 0.04, matGaveteiro, px, 0.36, 0, 0, g)
        caixa(longo - 0.08, 0.36, 0.025, matGaveteiro, 0, 0.53, -prof / 2 + 0.03, 0, g)
        caixa(longo - 0.1, 0.04, 0.06, matPreto, 0, 0.68, -prof / 2 + 0.1, 0, g)   // calha de cabos
        const n = Math.max(1, Math.round(longo / 1.2))
        for (let i = 0; i < n; i++) {
          const ax = -longo / 2 + longo * (i + 0.5) / n, fz = -prof / 2 + 0.16
          const bez = caixa(0.6, 0.36, 0.03, matPreto, ax, 1.07, fz, 0, g)
          const tela = caixa(0.56, 0.32, 0.005, matTela, ax, 1.07, fz + 0.017, 0, g); tela.castShadow = false
          const pe = caixa(0.05, 0.16, 0.05, matPreto, ax, 0.84, fz - 0.02, 0, g), pb = caixa(0.22, 0.012, 0.16, matPreto, ax, 0.774, fz - 0.01, 0, g)
          const tec = caixa(0.42, 0.015, 0.14, matPreto, ax - 0.04, 0.775, fz + 0.3, 0, g)   // teclado
          caixa(0.24, 0.004, 0.2, new THREE.MeshStandardMaterial({ color: 0x27272a, roughness: 0.9 }), ax + 0.33, 0.769, fz + 0.3, 0, g)   // mouse pad
          const mo = caixa(0.06, 0.03, 0.1, matPreto, ax + 0.33, 0.786, fz + 0.3, 0, g)   // mouse
          pecas.push({ g, y: 0.7675, monitor: [ax, fz, [bez, pe, pb], tela], teclado: [ax - 0.04, fz + 0.3, [tec]], mouse: [ax + 0.33, fz + 0.3, [mo]], gabinete: [ax + 0.42, fz + 0.05, [], 0] })
          cadeira(g, ax, prof / 2 + 0.25, Math.PI)
          assentos.push({ g, posto: `${e.id}:${i}`, comPessoa: i === 0 && r() > 0.3, nome: null, x: ax, z: prof / 2 + 0.2, ry: Math.PI, tela })
        }
        alvoItem(e.id, 0, 0, longo, prof, 0.8, 0, g)
        const th = g.rotation.y; bloquear(x + Math.sin(th) * 0.3, z + Math.cos(th) * 0.3, longo + 0.06, prof + 0.6, th)
      } else if (e.tipo === 'gaveteiro') {
        // armário marrom de gavetas etiquetadas (material de TI); rot 0 = frente para baixo da planta (vertical: para a direita)
        const vertical = d > w * 1.2, longo = vertical ? d : w, prof = Math.max(0.35, vertical ? w : d), alt = 1.3
        const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = ry + (vertical ? Math.PI / 2 : 0); mundo.add(g)
        caixa(longo, alt, prof, e.cor ? new THREE.MeshStandardMaterial({ color: e.cor, roughness: 0.65 }) : matArmario, 0, alt / 2 + 0.06, 0, 0, g)
        caixa(longo - 0.04, 0.06, prof - 0.04, matPreto, 0, 0.03, 0, 0, g)   // rodapé
        caixa(longo + 0.03, 0.03, prof + 0.03, matArmarioTopo, 0, alt + 0.075, 0, 0, g)
        const frente = new THREE.Mesh(new THREE.PlaneGeometry(longo - 0.03, alt - 0.03), new THREE.MeshStandardMaterial({ map: texGavetas(longo, alt), roughness: 0.6 }))
        frente.position.set(0, alt / 2 + 0.06, prof / 2 + 0.002); g.add(frente)
        alvoItem(e.id, 0, 0, longo, prof, alt + 0.1, 0, g)
        bloquear(x, z, w, d, ry)
      } else if (e.tipo === 'armario') {
        bloquear(x, z, w, d, ry)
        caixa(w, 1.0, d, e.cor ? new THREE.MeshStandardMaterial({ color: e.cor, roughness: 0.6 }) : matMadeira, x, 0.5, z, ry)
        caixa(w * 0.95, 0.03, d * 0.95, matMesa, x, 1.015, z, ry)
        const cf = cafeteiraVermelha({ ligada: e.ligado !== false }); cf.g.position.set(x, 1.03, z); cf.g.rotation.y = ry; mundo.add(cf.g); cafeteiras.push(cf)   // cafeteira de cápsulas
        cafesArmario.push({ x, z, w, d, ry, maquina: cf })   // dá para fazer café encostado em qualquer lado livre do armário
        alvoItem(e.id, x, z, w, d, 1.1, ry)
      } else if (e.tipo === 'sofa') {
        bloquear(x, z, w, d, ry)
        const mSofa = e.cor ? new THREE.MeshStandardMaterial({ color: e.cor, roughness: 0.8 }) : matCadeira; caixa(w, 0.42, d, mSofa, x, 0.21, z, ry); caixa(w, 0.4, 0.18, mSofa, x, 0.6, z, ry); alvoItem(e.id, x, z, w, d, 0.8, ry)
      } else if (e.tipo === 'coluna') {
        // pilar de concreto redondo, com base e capitel (vai do chão ao teto)
        const rr = Math.max(0.12, Math.min(w, d) / 2)
        bloquear(x, z, rr * 2, rr * 2)
        const matCol = e.cor ? new THREE.MeshStandardMaterial({ color: e.cor, roughness: 0.75 }) : new THREE.MeshStandardMaterial({ color: escuro ? 0xa8a29e : 0xe7e5e4, roughness: 0.8 })
        const col = new THREE.Mesh(new THREE.CylinderGeometry(rr, rr, ALT, 32), matCol); col.position.set(x, ALT / 2, z); col.castShadow = col.receiveShadow = true; mundo.add(col)
        for (const [yy, hh] of [[0.05, 0.1], [ALT - 0.05, 0.1]]) { const anel = new THREE.Mesh(new THREE.CylinderGeometry(rr + 0.035, rr + 0.035, hh, 32), matCol); anel.position.set(x, yy, z); anel.castShadow = true; mundo.add(anel) }
        alvoItem(e.id, x, z, rr * 2, rr * 2, ALT, 0)
      } else if (e.tipo === 'parede') {
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
        const tela = new THREE.Mesh(new THREE.PlaneGeometry(larg * 0.965, alt * 0.94), e.ligado === false ? new THREE.MeshStandardMaterial({ color: 0x05070a, roughness: 0.15, metalness: 0.3 }) : new THREE.MeshStandardMaterial({ map: texTela, emissiveMap: texTela, emissive: 0xffffff, emissiveIntensity: ceu.noite ? 0.9 : 0.55, roughness: 0.25 }))
        const alvoTv = new THREE.Mesh(new THREE.BoxGeometry(larg, alt, 0.2), new THREE.MeshBasicMaterial({ visible: false })); alvoTv.position.set(0, 1.55, 0); alvoTv.userData = { tipo: 'item', id: e.id }; g.add(alvoTv); clicaveis.push(alvoTv)
        tela.position.set(0, 1.55, 0.0135); g.add(tela)
        const led = new THREE.Mesh(new THREE.SphereGeometry(0.006, 8, 6), new THREE.MeshBasicMaterial({ color: 0x22c55e })); led.position.set(larg * 0.45, 1.55 - alt * 0.49, 0.015); g.add(led)
      } else if (e.tipo === 'porta') {
        // folha presa na dobradiça (canto local 0,h): aberta fica quase encostada na parede; fechada fica no vão e
        // ninguém passa (aberta >= 50 = aberta; o cartão da porta e o da sala abrem e fecham)
        const [hx, hy] = girar(e, 0, e.h), [fx, fy] = girar(e, e.w, e.h)
        const ang = Math.atan2(fy - hy, fx - hx)
        const abertaP = (Number.isFinite(+e.aberta) ? +e.aberta : 50) >= 50
        const folha = new THREE.Group(); folha.position.set(W(hx), 0, Z(hy)); folha.rotation.y = -ang + (abertaP ? 1.5 : 0); mundo.add(folha)
        // porta de vidro (como as paredes de vidro) nas salas privativas e na bancada; a da Reunião (alvenaria) e as
        // portas com cor escolhida (ex.: a preta do Escritório) continuam sólidas. e.vidro força um ou outro.
        const deVidro = portaDeVidro(e)
        const matFolha = e.cor ? new THREE.MeshStandardMaterial({ color: e.cor, roughness: 0.45 }) : matMadeira
        if (deVidro) {
          const Lp = e.w * S * 0.95
          const vid = new THREE.Mesh(new THREE.BoxGeometry(Lp - 0.08, 1.97, 0.012), matVidroParede); vid.position.set(Lp / 2, 1.025, 0); vid.renderOrder = 3; folha.add(vid)
          for (const [w2, h2, x2, y2] of [[0.04, 2.05, 0.02, 1.025], [0.04, 2.05, Lp - 0.02, 1.025], [Lp, 0.04, Lp / 2, 2.03], [Lp, 0.06, Lp / 2, 0.03]]) caixa(w2, h2, 0.045, matPerfil, x2, y2, 0, 0, folha)
          caixa(0.025, 0.7, 0.025, matPerfil, Lp - 0.1, 1.05, 0.04, 0, folha); caixa(0.025, 0.7, 0.025, matPerfil, Lp - 0.1, 1.05, -0.04, 0, folha)   // puxador vertical
        } else {
          caixa(e.w * S * 0.95, 2.05, 0.04, matFolha, e.w * S * 0.475, 1.025, 0, 0, folha)
          // almofadas da folha (relevo)
          for (const lz of [-0.022, 0.022]) for (const [py, ph] of [[0.62, 0.9], [1.55, 0.7]]) caixa(e.w * S * 0.7, ph, 0.006, matFolha, e.w * S * 0.475, py, lz, 0, folha)
        }
        if (!deVidro) for (const lz of [-0.035, 0.035]) {
          const maca = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.03, 12), matPerfil); maca.rotation.x = Math.PI / 2; maca.position.set(e.w * S * 0.85, 1.0, lz); folha.add(maca)
          const alav = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.02, 0.02), matPerfil); alav.position.set(e.w * S * 0.8, 1.0, lz * 1.4); folha.add(alav)
        }
        alvoItem(e.id, e.w * S * 0.475, 0, e.w * S * 0.95, 0.12, 2.05, 0, folha)
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
        // mesa branca no eixo mais comprido da sala, com uma cadeira a cada 0,75 m dos dois lados e uma em cada cabeceira
        const mx = W(s.x + s.w * 0.5), mz = Z(s.y + s.h * 0.5)
        const deitada = s.w >= s.h, longoS = (deitada ? s.w : s.h) * S, curtoS = (deitada ? s.h : s.w) * S
        const comp = Math.max(2.4, Math.min(longoS - 3.4, 5.5)), larg = Math.max(0.9, Math.min(curtoS - 2.4, 1.2))   // sobra ≥ 1 m dos lados para passar
        const gm = new THREE.Group(); gm.position.set(mx, 0, mz); gm.rotation.y = deitada ? 0 : Math.PI / 2; mundo.add(gm)
        const matBrancoM = new THREE.MeshStandardMaterial({ color: 0xfafafa, roughness: 0.3 })
        const mesa = new THREE.Mesh(new RoundedBoxGeometry(comp, 0.05, larg, 3, 0.02), matBrancoM); mesa.position.y = 0.75; mesa.castShadow = mesa.receiveShadow = true; gm.add(mesa)
        for (const px of [-comp / 2 + 0.6, comp / 2 - 0.6]) { caixa(0.1, 0.72, larg * 0.55, matPreto, px, 0.37, 0, 0, gm); caixa(0.12, 0.02, larg * 0.75, matPreto, px, 0.01, 0, 0, gm) }
        const nLado = Math.max(3, Math.floor((comp - 0.3) / 0.75))
        for (let i = 0; i < nLado; i++) {
          const ax = -comp / 2 + comp * (i + 0.5) / nLado
          cadeira(gm, ax, -larg / 2 - 0.35, 0); cadeira(gm, ax, larg / 2 + 0.35, Math.PI)
        }
        cadeira(gm, -comp / 2 - 0.4, 0, Math.PI / 2); cadeira(gm, comp / 2 + 0.4, 0, -Math.PI / 2)
        bloquear(mx, mz, comp + 0.3, larg + 0.3, gm.rotation.y)   // só o tampo: dá para andar entre as cadeiras
        continue
      }
      const pessoaNome = /^sala\s+(.+)/i.test(nomeSala) && !NAO_PESSOA.test(nomeSala) ? nomeSala.replace(/^sala\s+/i, '') : null
      const vertical = s.h > s.w
      const ex = W(s.x + s.w * (vertical ? 0.5 : 0.62)), ez = Z(s.y + s.h * 0.42)
      estacao(mundo, ex, ez, Math.PI, true, pessoaNome, false, `sala-${s.p.id}`)
      bloquear(ex, ez - 0.2, 1.36, 1.25)
    }

    // cores da sala (cartão da sala no 3D): cadeiras e tampos de mesa ganham a cor da sala onde estão; item com cor
    // própria (escolhida no cartão do item) continua com a dele
    if (salas.some((s) => s.cor_cadeira || s.cor_mesa)) {
      const porSala = new Map()
      const matCor = (base, cor) => { const k = `${base.uuid}${cor}`; if (!porSala.has(k)) { const m = base.clone(); m.color = new THREE.Color(cor); porSala.set(k, m) } return porSala.get(k) }
      const vw = new THREE.Vector3()
      mundo.updateMatrixWorld(true)
      mundo.traverse((o) => {
        if (!o.isMesh) return
        const campo = o.material === matCadeira ? 'cor_cadeira' : (o.material === matTampo || o.material === matMesa) ? 'cor_mesa' : null
        if (!campo) return
        o.getWorldPosition(vw)
        const px = vw.x / S + cx, py = vw.z / S + cy
        const sl = salas.filter((x) => px > x.x && px < x.x + x.w && py > x.y && py < x.y + x.h).sort((a, b) => a.w * a.h - b.w * b.h)[0]
        if (sl?.[campo]) o.material = matCor(o.material, sl[campo])
      })
    }

    // pessoas nos lugares: primeiro a equipe cadastrada que está no expediente agora (no posto dela, ou num lugar
    // da sala dela), depois gente sem cadastro nos lugares que já tinham alguém. Posto de alguém da equipe que
    // está fora do expediente fica vazio.
    const equipe = mapa.pessoas || []
    const agoraBR = horaBR()
    const presentes = equipe.filter((pp) => noExpediente(pp, agoraBR))
    const reservados = new Set(equipe.map((pp) => pp.posto).filter(Boolean))
    mundo.updateMatrixWorld(true)
    const vv = new THREE.Vector3()
    for (const a of assentos) {
      vv.set(a.x, 0, a.z); a.g.localToWorld(vv); a.wx = vv.x; a.wz = vv.z
      const px = vv.x / S + cx, py = vv.z / S + cy
      a.sala = salas.find((sl) => px > sl.x && px < sl.x + sl.w && py > sl.y && py < sl.y + sl.h)?.p.id
    }
    // monitores: cada posto com o próprio conteúdo (semente do posto) conforme a sala (telas3d.js); vazio = tela bloqueada
    const telas = []
    if (!compacto) assentos.forEach((a, i) => {
      if (!a.tela) return
      const sem = sementeDe(a.posto || `posto-${i}`)
      a.papel = papelDaSala(salas.find((sl) => sl.p.id === a.sala)?.p.nome || '', sem)
      const cv = document.createElement('canvas'); cv.width = 256; cv.height = 144
      const tx = new THREE.CanvasTexture(cv); tx.colorSpace = THREE.SRGBColorSpace
      a.tela.material = new THREE.MeshStandardMaterial({ map: tx, emissiveMap: tx, emissive: 0xffffff, emissiveIntensity: ceu.noite ? 0.85 : 0.6, roughness: 0.3 })
      const tw = new THREE.Vector3(); a.tela.getWorldPosition(tw)
      telas.push({ a, cv, g: cv.getContext('2d'), tx, sem, pos: tw, ult: -9 })
    })
    E.telas = telas
    // modelos da biblioteca nos postos (Avatares → mapa_modelos): cada tipo vira UMA malha instanciada (uma chamada de
    // desenho para todos os monitores, outra para os teclados…); as caixas desenhadas somem quando o modelo chega.
    // Ajuste de cada modelo: girar para a posição de uso e o tamanho real (largura do monitor, comprimento do mouse…)
    const MODELO_POSTO = {
      monitor: { medida: 'x', tam: 0.62 }, teclado: { medida: 'x', tam: 0.44 },
      mouse: { medida: 'z', tam: 0.115, rx: -Math.PI / 2 }, gabinete: { medida: 'y', tam: 0.46, ry: Math.PI / 2 },
    }
    const mundoPecas = mundo
    Object.entries(MODELO_POSTO).forEach(([tipo, cfgM]) => {
      const id = mapa.modelos?.[tipo], lista = pecas.filter((p) => p[tipo])
      if (!id || !lista.length) return
      carregarAvatar(id).then((gl) => {
        if (estado.current?.mundo !== mundoPecas) return
        let malha = null; gl.scene.updateMatrixWorld(true); gl.scene.traverse((o) => { if (o.isMesh && !malha) malha = o })
        if (!malha) return
        const geo = malha.geometry.clone(); geo.applyMatrix4(malha.matrixWorld)
        if (cfgM.rx) geo.rotateX(cfgM.rx)
        if (cfgM.ry) geo.rotateY(cfgM.ry)
        geo.computeBoundingBox()
        const bb = geo.boundingBox, tam = bb.getSize(new THREE.Vector3())
        const k = cfgM.tam / Math.max(1e-4, tam[cfgM.medida])
        geo.translate(-(bb.min.x + bb.max.x) / 2, -bb.min.y, -(bb.min.z + bb.max.z) / 2); geo.scale(k, k, k); geo.computeBoundingBox()
        const im = new THREE.InstancedMesh(geo, malha.material, lista.length); im.castShadow = true; im.receiveShadow = true
        // painel do monitor: vértices da parte de cima (sem o pé) dão a moldura onde fica a tela com o conteúdo
        let painel = null
        if (tipo === 'monitor') {
          const pos = geo.attributes.position, H = geo.boundingBox.max.y, pb = new THREE.Box3()
          for (let i = 0; i < pos.count; i++) if (pos.getY(i) > H * 0.42) pb.expandByPoint(new THREE.Vector3(pos.getX(i), pos.getY(i), pos.getZ(i)))
          painel = { cx: (pb.min.x + pb.max.x) / 2, cy: (pb.min.y + pb.max.y) / 2, w: pb.max.x - pb.min.x, h: pb.max.y - pb.min.y, fz: pb.max.z }
        }
        const inv = new THREE.Matrix4().copy(mundoPecas.matrixWorld).invert(), m4 = new THREE.Matrix4(), loc = new THREE.Matrix4()
        lista.forEach((p, i) => {
          const [x, z, esconder, yy] = p[tipo]
          p.g.updateMatrixWorld(true)
          loc.makeTranslation(x, yy ?? p.y, z)
          m4.multiplyMatrices(inv, p.g.matrixWorld).multiply(loc); im.setMatrixAt(i, m4)
          esconder.forEach((o) => { o.visible = false })
          const tela = p[tipo][3]
          if (painel && tela?.isMesh) {   // a tela com o conteúdo do posto vai para a frente do painel do modelo
            tela.position.set(x + painel.cx, p.y + painel.cy, z + painel.fz + 0.004)
            tela.scale.set((painel.w * 0.93) / 0.56, (painel.h * 0.9) / 0.32, 1)
          }
        })
        im.instanceMatrix.needsUpdate = true; im.computeBoundingSphere(); im.frustumCulled = false; mundoPecas.add(im)   // espalhados pelo andar: sem descarte por esfera
      }).catch(() => { /* modelo apagado da biblioteca: ficam as caixas */ })
    })
    const ocupado = new Map(), semLugar = []
    for (const pp of presentes) {
      let a = pp.posto ? assentos.find((x) => x.posto === pp.posto && !ocupado.has(x)) : null
      if (!a && pp.sala) a = assentos.find((x) => String(x.sala) === String(pp.sala) && !ocupado.has(x) && !reservados.has(x.posto))
      if (a) ocupado.set(a, pp); else semLugar.push(pp)
    }
    const avatares = []   // { av, info, label }
    const alvoPessoa = (av, info, sentada) => {
      const hb = new THREE.Mesh(new THREE.BoxGeometry(0.6, sentada ? 1.35 : 1.8, 0.6), new THREE.MeshBasicMaterial({ visible: false }))
      hb.position.y = sentada ? 0.7 : 0.9; hb.userData = info; av.add(hb); clicaveis.push(hb)
    }
    const salasDaEquipe = new Set(equipe.map((pp) => String(pp.sala)).filter(Boolean))
    for (const a of assentos) {
      const pp = ocupado.get(a)
      if (!pp && (!a.comPessoa || reservados.has(a.posto) || salasDaEquipe.has(String(a.sala)))) continue
      const av = pessoa(r, true, pp?.aparencia || null)
      av.position.set(a.x, 0, a.z); av.rotation.y = a.ry; a.g.add(av); pessoas.push(av); a.ocupante = av
      const info = pp ? { tipo: 'pessoa', id: pp.id } : { tipo: 'generico', posto: a.posto || '', sala: a.sala ? String(a.sala) : '', ap: av.userData.ap }
      let label = null
      if (pp) { label = etiquetaPessoa(pp.nome, pp.cargo); label.position.set(a.x, 1.78, a.z); a.g.add(label) }
      else if (a.nome) { label = etiqueta(a.nome); label.position.set(a.x, 1.75, a.z); a.g.add(label) }
      alvoPessoa(av, info, true); avatares.push({ av, info, label })
    }

    // gente andando: rota por A* numa grade de 10 cm (paredes, mesas, cadeiras e portas viram obstáculo), desviando
    // umas das outras pela direita, parando um pouco em cada destino e voltando a andar
    const dentroDeSala = (x, z) => salas.some((s) => x > W(s.x) - 0.12 && x < W(s.x + s.w) + 0.12 && z > Z(s.y) - 0.12 && z < Z(s.y + s.h) + 0.12)
    const LA = E.limitesAndar   // com o prédio: o corredor também é chão (até a fachada de vidro)
    const livreAndar = LA ? (x, z) => dentroDeSala(x, z) || (x > LA[0] && x < LA[2] && z > LA[1] && z < LA[3]) : dentroDeSala
    const grade = LA ? criarGrade(LA[0], LA[1], LA[2], LA[3], obstaculos, livreAndar, 0.22, compacto ? 0.2 : 0.1)
      : criarGrade(W(x0) - 0.3, Z(y0) - 0.3, W(x1) + 0.3, Z(y1) + 0.3, obstaculos, dentroDeSala, 0.22, compacto ? 0.2 : 0.1)   // no painel, grade mais grossa (monta 4x mais rápido)
    E.grade = grade
    const salao = [...salas].sort((a, b) => b.w * b.h - a.w * a.h)[0]
    const pontoLivre = (s) => {
      for (let k = 0; k < 40; k++) { const x = W(s.x + 30 + Math.random() * (s.w - 60)), z = Z(s.y + 30 + Math.random() * (s.h - 60)); if (celulaLivre(grade, x, z)) return [x, z] }
      return null
    }
    const andarilhos = []
    const novoDestino = (a) => {
      if (a.G) {   // térreo: ponto livre qualquer da recepção
        const alvo = a.ponto(), rota = alvo && caminho(a.G, [a.p.position.x, a.p.position.z], alvo)
        if (rota && rota.length > 1) { a.rota = rota; a.i = 1; a.estado = 'andando'; a.preso = 0 } else { a.estado = 'parado'; a.espera = 2 }
        return
      }
      if (E.pontoCafe && !a.comCafe && Math.random() < 0.22) {   // vai à copa fazer um café
        const rota = caminho(grade, [a.p.position.x, a.p.position.z], [E.pontoCafe.x, E.pontoCafe.z])
        if (rota && rota.length > 1) { a.rota = rota; a.i = 1; a.estado = 'andando'; a.preso = 0; a.indoCafe = true; return }
      }
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
      andarilhos.push({ p, vel: 0.95 + r() * 0.35, estado: 'parado', espera: 0.4 + i * 0.8, rota: null, i: 0, passo: r() * 6, preso: 0, celular: r() > 0.55 })
      const info = { tipo: 'generico', posto: '', sala: '', ap: p.userData.ap }
      alvoPessoa(p, info, false); avatares.push({ av: p, info, label: null })
    }
    for (const pp of semLugar) {   // equipe sem lugar livre: anda pelo escritório
      const sl = salas.find((x) => String(x.p.id) === String(pp.sala)) || salao
      const ini = sl && pontoLivre(sl)
      if (!ini) continue
      const p = pessoa(r, false, pp.aparencia); p.position.set(ini[0], 0, ini[1]); mundo.add(p)
      const label = etiquetaPessoa(pp.nome, pp.cargo); label.position.y = 2.0; p.add(label)
      andarilhos.push({ p, vel: 1.05, estado: 'parado', espera: 1, rota: null, i: 0, passo: 0, preso: 0 })
      const info = { tipo: 'pessoa', id: pp.id }
      alvoPessoa(p, info, false); avatares.push({ av: p, info, label })
    }
    E.avatares = avatares
    // avatares 3D importados (GLB): a pessoa com avatar_id troca o boneco desenhado pelo modelo, com as animações do
    // arquivo (parado / andando / sentado). Carrega depois da cena: até chegar, fica o boneco do sistema.
    const glbs = []
    E.glbs = glbs
    for (const it of avatares) {
      const pp = it.info.tipo === 'pessoa' && equipe.find((x) => x.id === it.info.id)
      if (!pp?.avatar_id) continue
      carregarAvatar(pp.avatar_id).then((gltf) => {
        if (E.mundo !== mundo) return   // o andar foi remontado enquanto o arquivo baixava
        const modelo = clonarComOssos(gltf.scene)
        const bb = caixaReal(modelo), alt = bb.getSize(new THREE.Vector3()).y || 1.7
        const kk = gltf.meta?.escala_real ? 1 : 1.72 / alt   // feito no Estúdio: já vem na altura certa da pessoa
        modelo.scale.setScalar(kk); modelo.position.y = -bb.min.y * kk
        modelo.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true } })
        it.av.traverse((o) => { if (o.isMesh && o.material?.visible !== false && !o.userData?.tipo) o.visible = false })   // esconde o boneco (o alvo de clique continua)
        it.av.add(modelo)
        const mixer = new THREE.AnimationMixer(modelo)
        const porNome = (palavras) => gltf.animations.find((c) => palavras.some((w) => c.name.toLowerCase().includes(w)))
        const clips = { parado: porNome(['idle', 'parado', 'stand', 'breath']) || gltf.animations[0], andando: porNome(['walk', 'andar']), sentado: porNome(['sit', 'sentad', 'seat']) }
        const g = { it, mixer, clips, atual: null, ult: it.av.getWorldPosition(new THREE.Vector3()), vel: 0, modelo, y0: modelo.position.y }
        const tocar = (nome) => {
          const clip = clips[nome] || clips.parado
          if (!clip || g.atual?.getClip() === clip) return
          const nova = mixer.clipAction(clip); nova.reset().play()
          if (g.atual) g.atual.crossFadeTo(nova, 0.3, false)
          g.atual = nova
        }
        g.tocar = tocar; tocar(it.av.userData.sentada ? 'sentado' : 'parado'); glbs.push(g)
      }).catch(() => { /* sem o arquivo, fica o boneco desenhado */ })
    }

    // personagens do escritório (pets, mascotes, pessoas extras da aba "No escritório" em /avatares): ficam perto do
    // ponto escolhido, parados ou passeando pela grade de colisão; dormem ou sentam quando o arquivo tem esses clips
    const personagens = []
    E.personagens = personagens
    for (const e of mapa.elementos.filter((x) => x.tipo === 'personagem' && x.avatar_id)) {
      const casa = [W(e.x + (e.w || 40) / 2), Z(e.y + (e.h || 40) / 2)]
      if (!celulaLivre(grade, casa[0], casa[1])) {   // ponto em cima de mesa ou parede: vai para o chão livre mais perto
        const cel = livreProxima(grade, casa[0], casa[1], 30)
        if (cel) { casa[0] = grade.bx0 + (cel[0] + 0.5) * grade.C; casa[1] = grade.bz0 + (cel[1] + 0.5) * grade.C }
      }
      carregarAvatar(e.avatar_id).then((gltf) => {
        if (E.mundo !== mundo) return
        const modelo = clonarComOssos(gltf.scene)
        const bb = caixaReal(modelo), alt = bb.getSize(new THREE.Vector3()).y || 1
        const k = gltf.meta?.escala_real ? 1 : 1.72 / alt
        modelo.scale.setScalar(k); modelo.position.y = -bb.min.y * k
        modelo.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true } })
        const pet0 = gltf.meta?.especie && gltf.meta.especie !== 'pessoa'
        if (!pet0) {
          // pessoa da aba "No escritório": vira um avatar como os outros (anda pelo andar, clicar → Controlar). O boneco
          // desenhado fica invisível por baixo (é ele que anda e senta); o modelo vai junto
          const p = pessoa(r, false); p.position.set(casa[0], 0, casa[1]); p.rotation.y = Math.random() * Math.PI * 2; mundo.add(p)
          p.traverse((o) => { if (o.isMesh) o.visible = false })
          p.add(modelo)
          andarilhos.push({ p, vel: 0.9, estado: 'parado', espera: 2 + Math.random() * 4, rota: null, i: 0, passo: 0, preso: 0 })
          const info = { tipo: 'generico', posto: '', sala: '', ap: p.userData.ap, nome: gltf.meta?.nome || 'Personagem' }
          alvoPessoa(p, info, false); avatares.push({ av: p, info, label: null })
          const mixerP = new THREE.AnimationMixer(modelo)
          const porNomeP = (w) => gltf.animations.find((c) => w.some((x) => c.name.toLowerCase().includes(x)))
          const clipsP = { parado: porNomeP(['idle', 'parado', 'stand']) || gltf.animations[0], andando: porNomeP(['walk', 'andar']), sentado: porNomeP(['sit', 'sentad', 'seat']) }
          const gP = { it: { av: p }, mixer: mixerP, clips: clipsP, atual: null, ult: p.getWorldPosition(new THREE.Vector3()), vel: 0, modelo, y0: modelo.position.y }
          gP.tocar = (nome) => { const c = clipsP[nome] || clipsP.parado; if (!c || gP.atual?.getClip() === c) return; const a = mixerP.clipAction(c); a.reset().play(); if (gP.atual) gP.atual.crossFadeTo(a, 0.3, false); gP.atual = a }
          glbs.push(gP)
          return
        }
        const g0 = new THREE.Group(); g0.position.set(casa[0], 0, casa[1]); g0.rotation.y = Math.random() * Math.PI * 2; g0.add(modelo); mundo.add(g0)
        const mixer = new THREE.AnimationMixer(modelo)
        const porNome = (w) => gltf.animations.find((c) => w.some((x) => c.name.toLowerCase().includes(x)))
        const clips = { parado: porNome(['idle', 'parado', 'stand']) || gltf.animations[0], andando: porNome(['walk', 'andar']), descanso: porNome(['sleep', 'sit', 'sentad']) }
        const pet = gltf.meta?.especie && gltf.meta.especie !== 'pessoa'
        const P = { g: g0, mixer, clips, casa, passear: e.passear !== false, estado: 'parado', espera: 2 + Math.random() * 4, rota: null, i: 0, vel: pet ? 0.5 : 0.9, atual: null }
        P.tocar = (nome) => { const c = clips[nome] || clips.parado; if (!c || P.atual?.getClip() === c) return; const a = mixer.clipAction(c); a.reset().play(); if (P.atual) P.atual.crossFadeTo(a, 0.3, false); P.atual = a }
        P.tocar('parado'); personagens.push(P)
      }).catch(() => { /* avatar apagado ou sem acesso: não aparece */ })
    }
    const moverPersonagem = (P, dt) => {
      if (P.estado === 'parado' || P.estado === 'descanso') {
        P.espera -= dt
        if (P.espera > 0) return
        if (!P.passear) { P.espera = 8; return }
        if (P.clips.descanso && Math.random() < 0.25 && P.estado !== 'descanso') { P.estado = 'descanso'; P.espera = 8 + Math.random() * 10; P.tocar('descanso'); return }
        for (let k = 0; k < 10; k++) {
          const ang = Math.random() * Math.PI * 2, r = 0.4 + Math.random() * 1.6
          const alvo = [P.casa[0] + Math.cos(ang) * r, P.casa[1] + Math.sin(ang) * r]
          if (!celulaLivre(E.grade, alvo[0], alvo[1])) continue
          const rota = caminho(E.grade, [P.g.position.x, P.g.position.z], alvo)
          if (rota && rota.length > 1) { P.rota = rota; P.i = 1; P.estado = 'andando'; P.tocar('andando'); return }
        }
        P.estado = 'parado'; P.espera = 3; P.tocar('parado'); return
      }
      const alvo = P.rota[P.i]
      const dx = alvo[0] - P.g.position.x, dz = alvo[1] - P.g.position.z, dist = Math.hypot(dx, dz)
      if (dist < 0.05) { P.i++; if (P.i >= P.rota.length) { P.estado = 'parado'; P.espera = 3 + Math.random() * 7; P.tocar('parado') } return }
      const passo = Math.min(dist, P.vel * dt)
      P.g.position.x += dx / dist * passo; P.g.position.z += dz / dist * passo
      const ang = Math.atan2(dx, dz); let d = ang - P.g.rotation.y; d = Math.atan2(Math.sin(d), Math.cos(d)); P.g.rotation.y += d * Math.min(1, dt * 6)
    }
    E.moverPersonagem = moverPersonagem

    // térreo (recepção do prédio): montado escondido dentro do pódio, no chão da rua (y = -yA). O elevador leva o
    // avatar controlado até lá e de volta. Tem grade de colisão própria, recepcionista, segurança e gente andando.
    E.gradeAtiva = grade; E.nivel = 'andar'; E.yBase = 0; E.elevTerreo = null; E.terreo = null; E.viagem = null
    E.setNivel?.('andar')
    const genteT = { recep: null, guarda: null, andam: [] }
    if (predio && E.elevAndar && E.elevInfo) {
      const P0 = predio.podio, yT = -predio.yA
      const { ox, oz, n } = E.elevInfo
      const horizE = P0.entrada === 'norte' || P0.entrada === 'sul'
      const portaP = horizE ? [P0.centroEntrada, P0.entrada === 'norte' ? P0.bz0 : P0.bz1] : [P0.entrada === 'oeste' ? P0.bx0 : P0.bx1, P0.centroEntrada]
      const frenteEl = [ox + n[0] * ELEV.prof, oz + n[1] * ELEV.prof]
      const u = horizE ? frenteEl[0] - portaP[0] : frenteEl[1] - portaP[1]
      const v = horizE ? Math.abs(frenteEl[1] - portaP[1]) : Math.abs(frenteEl[0] - portaP[0])
      const T = montarTerreo({ podio: P0, yT, elev: { u, v, andar }, marca: marca?.nome || '', noite: ceu.noite, pisoTex: texturaPiso('porcelanato', 0xe7e5e4), r })
      mundo.add(T.grupo)
      const elT = montarElevador({ rotuloAndar: 'T', escuro })
      elT.grupo.position.set(ox, 0, oz); elT.grupo.rotation.y = Math.atan2(n[0], n[1]); T.grupo.add(elT.grupo)
      const obT = [...T.obst, { x: ox + n[0] * ELEV.prof / 2, z: oz + n[1] * ELEV.prof / 2, w: n[0] ? ELEV.prof : ELEV.larg, d: n[0] ? ELEV.larg : ELEV.prof, ry: 0 }]
      const L = T.limites, LF = T.limitesFora
      // grade do térreo: recepção + calçada em volta (sai pela porta automática). Célula de 20 cm: a de 10 cm deixava o
      // caminho dos figurantes pesado e o térreo engasgava
      const gradeT = criarGrade(LF[0], LF[1], LF[2], LF[3], [...obT, ...T.paredes], () => true, 0.22, 0.2)
      E.terreo = T
      E.elevTerreo = { el: elT, nivel: 'terreo', yBase: yT, carros: elT.carros.map((c, i) => ({ c, frente: E.elevAndar.carros[i].frente, cabine: E.elevAndar.carros[i].cabine, porta: E.elevAndar.carros[i].porta })) }
      // recepcionista sentada atrás do balcão, segurança em pé perto das catracas, duas pessoas andando
      const rec = pessoa(r, true); cadeira(T.grupo, T.posRecep.x, T.posRecep.z, T.ryFrente + Math.PI)
      rec.position.set(T.posRecep.x, 0, T.posRecep.z); rec.rotation.y = T.ryFrente; T.grupo.add(rec); genteT.recep = rec
      const [gx, gz] = T.em(u + (u > 0 ? -1 : 1) * 3.2, Math.max(3.2, v - 2.6) - 0.9)
      const guarda = pessoa(r, false, { pele: '', cabelo: 'raspado', cor_cabelo: '#111111', roupa: '#111827', calca: '#111827', sapato: '#0a0a0a', traje: 'social', corpo: 'a', oculos: false, barba: false, cracha: true })
      guarda.position.set(gx, 0, gz); guarda.rotation.y = T.ryFrente; T.grupo.add(guarda); genteT.guarda = guarda
      const pontoT = () => { for (let k = 0; k < 30; k++) { const x = L[0] + 1 + Math.random() * (L[2] - L[0] - 2), z = L[1] + 1 + Math.random() * (L[3] - L[1] - 2); if (celulaLivre(gradeT, x, z)) return [x, z] } return null }
      for (let i = 0; i < 2; i++) {
        const ini = pontoT(); if (!ini) break
        const p2 = pessoa(r, false); p2.position.set(ini[0], 0, ini[1]); T.grupo.add(p2)
        genteT.andam.push({ p: p2, vel: 1.0 + r() * 0.3, estado: 'parado', espera: 1 + i * 2, rota: null, i: 0, passo: 0, preso: 0, G: gradeT, ponto: pontoT, lista: genteT.andam, celular: r() > 0.4 })
      }
      // veículos nas ruas (avatares da espécie veículo, Avatares → Nas ruas do mapa): estacionados onde foram deixados
      // ou numa vaga perto do prédio; dirigíveis com física (veiculo3d.js)
      const grupoCarros = new THREE.Group(); grupoCarros.name = 'carros'; mundo.add(grupoCarros); E.grupoCarros = grupoCarros
      E.veiculos = []
      const cidC = predio.cidade
      if (cidC) { const marcas = criarMarcas(); grupoCarros.add(marcas.malha); E.marcas = marcas }
      // colisão do carro dirigido: lotes e prédio da cidade + trânsito andando + os outros veículos parados
      const colideFixo = cidC ? colisorCidade(cidC) : null
      const tr = predio?.transito
      E.colideCarro = colideFixo && ((x, z, psi, L, W) => {
        const fixo = colideFixo(x, z, psi, L, W)
        if (fixo) return fixo
        const extra = [], quem = []
        for (const o of tr?.lista() || []) { if (Math.hypot(o.x - x, o.z - z) < 16) { const ca = Math.abs(Math.cos(o.psi)) > 0.5, hl = o.comp / 2, hw = o.W / 2; extra.push(ca ? [o.x - hw, o.z - hl, o.x + hw, o.z + hl] : [o.x - hl, o.z - hw, o.x + hl, o.z + hw]); quem.push(o) } }
        for (const o of E.outros?.carros() || []) { if (Math.hypot(o.x - x, o.z - z) < 16) { const ca = Math.abs(Math.cos(o.psi)) > 0.5, hl = o.L / 2, hw = o.W / 2; extra.push(ca ? [o.x - hw, o.z - hl, o.x + hw, o.z + hl] : [o.x - hl, o.z - hw, o.x + hl, o.z + hw]) } }
        for (const v of E.veiculos || []) { if (v === E.dirigindo?.ref) continue; const S = v.veh.S; if (S.y > 1 || Math.hypot(S.x - x, S.z - z) > 14) continue; const ca = Math.abs(Math.cos(S.psi)) > 0.5, hl = v.veh.dims.L / 2, hw = v.veh.dims.W / 2; extra.push(ca ? [S.x - hw, S.z - hl, S.x + hw, S.z + hl] : [S.x - hl, S.z - hw, S.x + hl, S.z + hw]) }
        const r2 = extra.length ? colisorCidade({ obstaculos: extra })(x, z, psi, L, W) : null
        if (r2 && quem.length) {   // bateu num carro do trânsito: ele para e balança (mais forte quanto mais rápido)
          const S = E.dirigindo?.veh.S, o = quem.sort((a, b) => Math.hypot(a.x - x, a.z - z) - Math.hypot(b.x - x, b.z - z))[0]
          if (S && Math.abs(S.vx) > 1.5) tr.bater(o.c, Math.abs(S.vx) / 6)
        }
        return r2
      })
      // trânsito e estacionamentos com os carros da biblioteca (versões leves): cada veículo do trânsito vira um deles
      E.frota = []
      const leves = mapa.modelos?.leves || {}
      const frotaCfg = (mapa.veiculos || []).filter((v) => leves[v.avatar_id])
      if (tr && frotaCfg.length) {
        const mundoF = mundo
        Promise.all(frotaCfg.map((v) => carregarAvatar(leves[v.avatar_id]).then((gl) => ({ v, gl })).catch(() => null))).then((lst) => {
          if (estado.current?.mundo !== mundoF) return
          const prontos = lst.filter(Boolean).map(({ v, gl }) => {
            // geometria única, frente em +z → normaliza para o comprimento real, base no chão e frente em +x (trânsito)
            let malha = null; gl.scene.updateMatrixWorld(true); gl.scene.traverse((o) => { if (o.isMesh && !malha) malha = o })
            if (!malha) return null
            const geo = malha.geometry.clone(); geo.applyMatrix4(malha.matrixWorld); geo.computeBoundingBox()
            const bb = geo.boundingBox, tam = bb.getSize(new THREE.Vector3())
            if (tam.x > tam.z * 1.2) geo.rotateY(Math.PI / 2)
            geo.computeBoundingBox()
            const b2 = geo.boundingBox, t2 = b2.getSize(new THREE.Vector3())
            const Lr = v.fisica?.comprimento > 0 ? v.fisica.comprimento : t2.z < 2 ? 4.5 : t2.z
            const k = Lr / t2.z
            geo.translate(-(b2.min.x + b2.max.x) / 2, -b2.min.y, -(b2.min.z + b2.max.z) / 2); geo.scale(k, k, k); geo.rotateY(Math.PI / 2)
            return { v, gl, geo, mat: malha.material, L: Lr, W: t2.x * k }
          }).filter(Boolean)
          E.frota = prontos
          const moto = prontos.find((f) => f.v.fisica?.duasRodas), onibus = prontos.find((f) => f.L >= 8)
          const carros = prontos.filter((f) => f !== moto && f !== onibus)
          tr.vestir((c, i) => {
            const f = c.tipo === 'moto' ? moto : c.tipo === 'onibus' ? onibus : carros[i % Math.max(1, carros.length)]
            if (!f) return null
            const m = new THREE.Mesh(f.geo, f.mat); m.castShadow = true; m.receiveShadow = true
            return { grupo: m, comp: f.L, W: f.W, frota: f }
          })
          if (carros.length) tr.estacionados?.trocar(carros.map((f) => ({ geo: f.geo, mat: f.mat, f })))
        })
      }
      if (cidC && (mapa.veiculos || []).length) {
        const colide = colisorCidade(cidC)
        const vagas = []   // em volta da calçada do prédio, paralelas ao meio-fio, sem bater em lote
        for (const d of [3.2, 6.5, 10]) {
          const lados = [[LF[0], LF[1] - d, LF[2], LF[1] - d, Math.PI / 2], [LF[0], LF[3] + d, LF[2], LF[3] + d, Math.PI / 2], [LF[0] - d, LF[1], LF[0] - d, LF[3], 0], [LF[2] + d, LF[1], LF[2] + d, LF[3], 0]]
          for (const [x0, z0, x1, z1, psi] of lados) {
            const comp = Math.hypot(x1 - x0, z1 - z0)
            for (let s = 4; s < comp - 4; s += 6.5) { const x = x0 + ((x1 - x0) * s) / comp, z = z0 + ((z1 - z0) * s) / comp; if (!colide(x, z, psi, 4.8, 2.2)) vagas.push([x, z, psi]) }
          }
          if (vagas.length >= mapa.veiculos.length * 2 + 4) break
        }
        const mundoAtual = mundo
        const mediosV = mapa.modelos?.medios || {}
        mapa.veiculos.forEach((vc, i) => {
          // versão média (25 mil triângulos, textura 1024): bonita de perto e rápida de montar; o modelo completo (120 mil)
          // travava a tela ao separar as rodas na hora de entrar
          carregarAvatar(mediosV[vc.avatar_id] || vc.avatar_id).then((gltf) => {
            if (estado.current?.mundo !== mundoAtual) return   // a cena foi refeita enquanto baixava
            const veh = criarVeiculo(clonarComOssos(gltf.scene), vc.fisica || {})
            let x = vc.x, z = vc.z, psi = vc.rot || 0
            const livreDeOutros = (px, pz, L) => (E.veiculos || []).every((o) => Math.hypot(o.veh.S.x - px, o.veh.S.z - pz) > (o.veh.dims.L + L) / 2 + 0.6)
            if (x == null || z == null || colide(x, z, psi, veh.dims.L, veh.dims.W) || !livreDeOutros(x, z, veh.dims.L)) {
              // vaga livre que caiba o comprimento dele (o ônibus ocupa várias) e sem outro veículo em cima
              const v = [...vagas.slice(i), ...vagas.slice(0, i)].find(([vx, vz, vp]) => !colide(vx, vz, vp, veh.dims.L, veh.dims.W) && livreDeOutros(vx, vz, veh.dims.L))
              if (!v) return
              ;[x, z, psi] = v
            }
            veh.colocar(x, z, psi); veh.atualizar(0, null, yT); grupoCarros.add(veh.raiz)
            E.veiculos.push({ cfg: vc, veh, colide: E.colideCarro || colide, yT, nome: vc.nome || gltf.meta?.nome || 'Carro' })
          }).catch(() => { /* veículo apagado da biblioteca: fica fora das ruas */ })
        })
      }
      // trocar de nível: o térreo esconde o andar (móveis, pessoas, rótulos) e o andar volta ao subir
      const ocultos = []
      E.trocarNivel = (nivel) => {
        const c = E.ctrl
        if (nivel === 'terreo' && E.nivel !== 'terreo') {
          // esconde o andar, mas não o sol, o céu e o chão da cidade: na rua (fora da recepção) ficava tudo preto
          const fica = (o) => o === predio.grupo || o === T.grupo || o === c?.av || o === chao || o === E.grupoCarros || (o.isLight && !o.isPointLight) || (o.isObject3D && sol && o === sol.target)
          for (const o of mundo.children) if (!fica(o) && o.visible) { o.visible = false; ocultos.push(o) }
          T.grupo.visible = true
          E.gradeAtiva = gradeT; E.nivel = 'terreo'; E.yBase = yT
        } else if (nivel === 'andar' && E.nivel !== 'andar') {
          ocultos.forEach((o) => { o.visible = true }); ocultos.length = 0
          T.grupo.visible = false
          E.gradeAtiva = grade; E.nivel = 'andar'; E.yBase = 0
        }
        if (c) c.av.position.y = E.yBase
        E.setNivel?.(E.nivel)
      }
    }
    telas.forEach((x) => { desenharTela(x.g, x.a.ocupante ? x.a.papel : 'bloqueio', x.sem, 0); x.tx.needsUpdate = true })   // primeiro desenho de todas

    // escritas de caneta nos vidros (texto à mão, legível do lado de quem escreveu)
    const CORES_CANETA = { azul: '#1d4ed8', preto: '#111827', vermelho: '#dc2626' }
    for (const es of mapa.escritas || []) {
      const tam = [0, 0.06, 0.09, 0.13, 0.19][es.tamanho || 2]
      const cv = document.createElement('canvas'); const g2 = cv.getContext('2d')
      const fonte = '600 64px "Bradley Hand", "Segoe Print", "Chalkboard SE", "Comic Sans MS", cursive'
      const linhas = String(es.texto).split('\n').slice(0, 6)
      g2.font = fonte
      cv.width = Math.ceil(Math.max(...linhas.map((l) => g2.measureText(l).width)) + 28); cv.height = linhas.length * 82 + 18
      g2.font = fonte; g2.fillStyle = CORES_CANETA[es.cor] || CORES_CANETA.azul; g2.textBaseline = 'top'
      g2.shadowColor = g2.fillStyle; g2.shadowBlur = 1.5
      linhas.forEach((l, i) => g2.fillText(l, 14, 10 + i * 82))
      const tx = new THREE.CanvasTexture(cv); tx.colorSpace = THREE.SRGBColorSpace; tx.anisotropy = 4
      const alt = tam * (cv.height / 82), larg = alt * cv.width / cv.height
      const m = new THREE.Mesh(new THREE.PlaneGeometry(larg, alt), new THREE.MeshBasicMaterial({ map: tx, transparent: true, depthWrite: false, side: THREE.DoubleSide }))
      m.position.set(W(es.x) + (es.horiz ? 0 : es.lado * 0.014), Math.min(es.altura || 1.45, ALT - alt / 2 - 0.05), Z(es.y) + (es.horiz ? es.lado * 0.014 : 0))
      m.rotation.y = es.horiz ? (es.lado >= 0 ? 0 : Math.PI) : (es.lado >= 0 ? Math.PI / 2 : -Math.PI / 2)
      m.renderOrder = 4; m.userData = { tipo: 'escrita', id: es.id }; mundo.add(m); clicaveis.push(m)
    }
    const moverAndarilho = (a, dt, t) => {
      const P = a.p.position
      const comXicara = a.comCafe > t
      if (a.estado === 'parado') {
        a.espera -= dt
        if (a.fazendoCafe) {   // de frente para a máquina enquanto o café passa; depois pega a xícara
          const pc = E.pontoCafe
          if (pc) { let dif = Math.atan2(pc.olhar[0] - a.p.position.x, pc.olhar[1] - a.p.position.z) - a.p.rotation.y; dif = Math.atan2(Math.sin(dif), Math.cos(dif)); a.p.rotation.y += dif * Math.min(1, dt * 5) }
          if (a.espera <= 0) { a.fazendoCafe = false; a.comCafe = t + 35 + Math.random() * 25; if (pc?.maquina) pc.maquina.fazendo = false; a.espera = 2 + Math.random() * 3; a.estado = 'parado'; return }
          animarAndar(a.p, a.passo, 0, t, false, false); return
        }
        if (a.espera <= 0) novoDestino(a)
        animarAndar(a.p, a.passo, 0, t, a.celular && !comXicara, comXicara); return
      }
      const [tx, tz] = a.rota[a.i]
      let dx = tx - P.x, dz = tz - P.z
      const dist = Math.hypot(dx, dz)
      if (dist < 0.12) {
        a.i++
        if (a.i >= a.rota.length) {
          a.estado = 'parado'; a.espera = 2 + Math.random() * 6
          if (a.indoCafe) { a.indoCafe = false; a.fazendoCafe = true; a.espera = 6; if (E.pontoCafe?.maquina) E.pontoCafe.maquina.fazendo = true }
        }
        animarAndar(a.p, a.passo, 0.5, t, false, comXicara); return
      }
      dx /= dist; dz /= dist
      let fator = 1, sx = 0, sz = 0
      for (const o of a.lista || andarilhos) {
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
      const G = a.G || grade
      if (!celulaLivre(G, nx, nz)) { if (celulaLivre(G, nx, P.z)) nz = P.z; else if (celulaLivre(G, P.x, nz)) nx = P.x; else { nx = P.x; nz = P.z } }
      const andou = Math.hypot(nx - P.x, nz - P.z)
      P.x = nx; P.z = nz
      a.preso = andou < passo * 0.25 ? a.preso + dt : 0
      if (a.preso > 2.5) { a.preso = 0; novoDestino(a) }
      let dif = Math.atan2(vx, vz) - a.p.rotation.y; dif = Math.atan2(Math.sin(dif), Math.cos(dif))
      a.p.rotation.y += dif * Math.min(1, dt * 8)
      a.passo += (andou / 0.68) * Math.PI
      animarAndar(a.p, a.passo, Math.min(1, andou / Math.max(1e-4, a.vel * dt)), t, false, comXicara)
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
      // modelo: split (parede), cassete (teto, um pouco para dentro da sala), piso-teto (largo, rente ao teto) ou de janela
      const modelo = (pos.modelo || 'split').toLowerCase().replace(/[^a-z_]/g, '').replace('splithiwall', 'split').replace('pisoteto', 'piso_teto')
      const corAr = pos.cor ? new THREE.Color(pos.cor).getHex() : 0xf8fafc
      const geo = modelo === 'cassete' ? new RoundedBoxGeometry(0.84, 0.06, 0.84, 3, 0.02) : modelo === 'piso_teto' ? new RoundedBoxGeometry(1.3, 0.24, 0.62, 4, 0.05) : modelo === 'janela' ? new RoundedBoxGeometry(0.62, 0.42, 0.5, 3, 0.03) : geoAr
      const yAr = modelo === 'cassete' ? ALT - 0.03 : modelo === 'piso_teto' ? ALT - 0.14 : modelo === 'janela' ? Math.min(1.55, ALT - 0.3) : Math.max(0.9, ALT - 0.38)
      const dentro = modelo === 'cassete' ? 1.3 : modelo === 'piso_teto' ? 0.24 : modelo === 'janela' ? 0.05 : 0
      g.position.set(W(mx) + dir.x * dentro, yAr, Z(my) + dir.z * dentro); g.rotation.y = -rot
      const corpo = new THREE.Mesh(geo, previsto ? new THREE.MeshStandardMaterial({ color: 0x94a3b8, transparent: true, opacity: 0.28 }) : new THREE.MeshStandardMaterial({ color: corAr, roughness: 0.35, metalness: pos.cor === '#9ca3af' ? 0.5 : 0.05 }))
      corpo.castShadow = !previsto; g.add(corpo)
      if (previsto) {
        g.add(new THREE.LineSegments(new THREE.EdgesGeometry(geo), new THREE.LineBasicMaterial({ color: 0x64748b })))
      } else {
        const corLed = a.ligado ? COR_MODO[a.modo] : 0x64748b
        if (modelo === 'cassete') {
          for (let i = 0; i < 4; i++) { const sl = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.005, 0.06), matPreto); const q = new THREE.Group(); q.rotation.y = (i * Math.PI) / 2; sl.position.set(0, -0.031, 0.33); q.add(sl); g.add(q) }
          const gr = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.004, 0.42), new THREE.MeshStandardMaterial({ color: new THREE.Color(corAr).offsetHSL(0, 0, -0.08), roughness: 0.8 })); gr.position.y = -0.031; g.add(gr)
          const led = new THREE.Mesh(new THREE.SphereGeometry(0.012, 10, 10), new THREE.MeshBasicMaterial({ color: corLed })); led.position.set(0.36, -0.035, 0.36); g.add(led)
        } else if (modelo === 'piso_teto') {
          const aba = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.04, 0.06), matPreto); aba.position.set(0, -0.08, 0.3); aba.rotation.x = 0.5; g.add(aba)
          const led = new THREE.Mesh(new THREE.SphereGeometry(0.013, 10, 10), new THREE.MeshBasicMaterial({ color: corLed })); led.position.set(0.55, 0.02, 0.312); g.add(led)
        } else if (modelo === 'janela') {
          for (let i = 0; i < 7; i++) { const f = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.012, 0.01), matPreto); f.position.set(0, 0.12 - i * 0.03, 0.252); g.add(f) }
          const painel = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.24, 0.01), matPreto); painel.position.set(0.24, -0.05, 0.252); g.add(painel)
          const led = new THREE.Mesh(new THREE.SphereGeometry(0.01, 10, 10), new THREE.MeshBasicMaterial({ color: corLed })); led.position.set(0.24, 0.1, 0.26); g.add(led)
        } else {
          const grade = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.03, 0.02), matPreto); grade.position.set(0, -0.1, 0.105); g.add(grade)
          const aleta = new THREE.Mesh(new THREE.BoxGeometry(0.78, 0.008, 0.05), new THREE.MeshStandardMaterial({ color: corAr, roughness: 0.4 })); aleta.position.set(0, -0.125, 0.12); aleta.rotation.x = a.ligado ? 0.7 : 0.05; g.add(aleta)
          const visor = new THREE.Mesh(new THREE.PlaneGeometry(0.07, 0.03), a.ligado ? new THREE.MeshBasicMaterial({ color: 0x7dd3fc }) : new THREE.MeshBasicMaterial({ color: 0x1f2937 })); visor.position.set(0.3, 0.03, 0.112); g.add(visor)
          const led = new THREE.Mesh(new THREE.SphereGeometry(0.014, 10, 10), new THREE.MeshBasicMaterial({ color: corLed })); led.position.set(0.36, 0.06, 0.112); g.add(led)
        }
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
    for (const e of mapa.elementos) if (e.tipo === 'ar_previsto' && !consumidos.includes(e.id)) montarAr({ x: e.x, y: e.y, rot: e.rot, modelo: ({ 'Cassete': 'cassete', 'Piso-teto': 'piso_teto' })[e.modelo] || 'split' }, e.id, true)

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

    // controle de um avatar: 1ª pessoa (câmera nos olhos) ou 3ª pessoa (câmera atrás do ombro). WASD/setas andam,
    // Q/E ou arrastar giram, Shift corre, V troca a câmera, Esc sai. Colide com paredes e móveis pela mesma grade.
    const pararControle = () => {
      const c = E.ctrl
      if (!c) return
      if (E.transicao) { E.transicao = null; c.av.scale.y = 1; c.av.visible = true }   // largou no meio de entrar/sair do carro
      if (E.dirigindo) sairDoCarro(true)
      if (c.fazendoAte && (E.cafeAtual || E.pontoCafe)?.maquina) (E.cafeAtual || E.pontoCafe).maquina.fazendo = false   // largou no meio do café
      if (E.viagem) { E.viagem = null; E.setViagem?.(null) }
      if (E.nivel === 'terreo') {   // largou no térreo: a pessoa sobe e fica na frente do elevador do andar
        E.trocarNivel?.('andar')
        const k = E.elevAndar?.carros[0]; if (k) c.av.position.set(k.frente[0], 0, k.frente[1])
        E.elevAndar?.carros.forEach((x) => { x.c.alvo = 0 }); E.elevTerreo?.carros.forEach((x) => { x.c.alvo = 0 })
      }
      E.ctrl = null
      c.av.userData.pescoco.visible = true
      if (c.label) c.label.visible = true
      if (c.assento) pessoas.push(c.av)   // largou sentado: continua trabalhando
      else andarilhos.push({ p: c.av, vel: 1, estado: 'parado', espera: 3, rota: null, i: 0, passo: c.passo, preso: 0 })
      camera.position.copy(c.camPos); controles.target.copy(c.camAlvo); controles.enabled = true
      E.setControle?.(null)
    }
    const iniciarControle = (info, modo) => {
      if (E.ctrl) pararControle()
      const it = avatares.find((x) => x.info === info || (info.tipo === 'pessoa' && x.info.tipo === 'pessoa' && x.info.id === info.id))
      if (!it) { E.setControle?.(null); return }
      const av = it.av
      const ai = andarilhos.findIndex((a) => a.p === av)
      if (ai >= 0) andarilhos.splice(ai, 1)
      const pi = pessoas.indexOf(av)
      if (pi >= 0) pessoas.splice(pi, 1)
      const assentoAtual = assentos.find((a) => a.ocupante === av)
      if (assentoAtual && av.userData.sentada) {   // já está sentado: assume sentado, trabalhando (F levanta)
        const q = new THREE.Quaternion(); av.getWorldQuaternion(q)
        const yawS = new THREE.Euler().setFromQuaternion(q, 'YXZ').y
        E.ctrl = { av, label: it.label, modo, yaw: yawS, pitch: -0.25, teclas: new Set(), passo: 0, camPos: camera.position.clone(), camAlvo: controles.target.clone(), info: it.info, assento: assentoAtual }
        controles.enabled = false
        E.setControle?.({ modo, info: it.info, sentado: true })
        return
      }
      if (av.parent !== mundo) mundo.attach(av)
      const sentadoAntes = av.userData.sentada
      const yaw = Math.atan2(Math.sin(av.rotation.y), Math.cos(av.rotation.y)) + (sentadoAntes ? Math.PI : 0)   // levanta e vira para a sala
      av.rotation.set(0, yaw, 0)
      if (sentadoAntes) {
        levantar(av)
        // sai da cadeira para o lugar livre mais perto
        const P = av.position
        const cel = livreProxima(grade, P.x + Math.sin(yaw) * 0.45, P.z + Math.cos(yaw) * 0.45, 15)
        if (cel) { P.x = grade.bx0 + (cel[0] + 0.5) * grade.C; P.z = grade.bz0 + (cel[1] + 0.5) * grade.C }
      }
      if (assentoAtual) assentoAtual.ocupante = null
      E.ctrl = { av, label: it.label, modo, yaw, pitch: -0.08, teclas: new Set(), passo: 0, camPos: camera.position.clone(), camAlvo: controles.target.clone(), info: it.info }
      controles.enabled = false
      E.setControle?.({ modo, info: it.info, sentado: false })
    }
    // F (ou o botão): senta na cadeira livre mais perto (até 1,4 m) e começa a trabalhar; de novo, levanta
    E.sentar = () => {
      const c = E.ctrl
      if (!c) return
      const av = c.av
      if (c.assento) {
        const a = c.assento; a.ocupante = null; c.assento = null
        mundo.attach(av); levantar(av)
        const yaw = c.yaw + Math.PI   // vira de costas para a mesa e sai da cadeira
        av.rotation.set(0, yaw, 0); c.yaw = yaw; c.pitch = -0.08
        const P = av.position, cel = livreProxima(grade, P.x + Math.sin(yaw) * 0.5, P.z + Math.cos(yaw) * 0.5, 15)
        if (cel) { P.x = grade.bx0 + (cel[0] + 0.5) * grade.C; P.z = grade.bz0 + (cel[1] + 0.5) * grade.C }
        E.setControle?.({ modo: c.modo, info: c.info, sentado: false })
        return
      }
      const P = av.position
      if (E.nivel === 'terreo') { E.setControle?.({ modo: c.modo, info: c.info, sentado: false, elevador: c.pertoElev ? E.nivel : null, aviso: 'No térreo não há mesa de trabalho: suba ao escritório pelo elevador.' }); return }
      let melhor = null, dm = 1.4
      for (const a of assentos) { if (a.ocupante) continue; const d = Math.hypot(a.wx - P.x, a.wz - P.z); if (d < dm) { dm = d; melhor = a } }
      if (!melhor) { E.setControle?.({ modo: c.modo, info: c.info, sentado: false, aviso: 'Chegue perto de uma cadeira livre (até 1,4 m) para sentar.' }); return }
      melhor.g.add(av); av.position.set(melhor.x, 0, melhor.z); av.rotation.set(0, melhor.ry, 0); sentarPose(av)
      melhor.ocupante = av; c.assento = melhor
      const q = new THREE.Quaternion(); av.updateMatrixWorld(true); av.getWorldQuaternion(q)
      c.yaw = new THREE.Euler().setFromQuaternion(q, 'YXZ').y; c.pitch = -0.25
      E.setControle?.({ modo: c.modo, info: c.info, sentado: true })
    }
    // C (ou o botão): perto da cafeteira da copa, faz um café (a máquina trabalha uns segundos) e sai com a xícara;
    // com a xícara, C dá um gole na hora (parado, ele também bebe de vez em quando); o café acaba depois de ~90 s
    E.cafe = () => {
      const c = E.ctrl
      if (!c || E.viagem) return
      const t = E.tAgora || 0, aviso = (texto) => E.setControle?.({ modo: c.modo, info: c.info, sentado: !!c.assento, aviso: texto })
      if (c.assento) { aviso('Levante (F) para ir até a copa tomar café.'); return }
      if (c.fazendoAte > t) return
      if (c.cafeAte > t) {   // gole agora: a curva do gole atinge o pico neste instante
        c.av.userData.fase = Math.PI / 2 / 1.55 - t
        return
      }
      const P = c.av.position
      if (E.nivel === 'terreo') { aviso('As cafeteiras ficam no andar do escritório (suba pelo elevador).'); return }
      // a máquina mais perto: a da copa (até 1,6 m do ponto de café) ou a de cima de um armário (até 1 m da borda dele)
      let pc = null, dm = Infinity
      if (E.pontoCafe) { const d0 = Math.hypot(E.pontoCafe.x - P.x, E.pontoCafe.z - P.z); if (d0 <= 1.6) { pc = E.pontoCafe; dm = d0 } }
      for (const a of cafesArmario) {
        const cs = Math.cos(a.ry), sn = Math.sin(a.ry), dx = P.x - a.x, dz = P.z - a.z
        const u = dx * cs - dz * sn, v = dx * sn + dz * cs   // no sistema do armário
        const d1 = Math.hypot(Math.max(0, Math.abs(u) - a.w / 2), Math.max(0, Math.abs(v) - a.d / 2))
        if (d1 <= 1 && d1 < dm) { dm = d1; pc = { x: P.x, z: P.z, olhar: [a.x, a.z], maquina: a.maquina } }
      }
      if (!pc) { aviso(cafesArmario.length ? 'Encoste numa cafeteira (copa ou armário, até 1 m) e aperte C.' : 'Vá até a cafeteira da copa e aperte C.'); return }
      E.cafeAtual = pc
      c.yaw = Math.atan2(pc.olhar[0] - P.x, pc.olhar[1] - P.z)
      c.fazendoAte = t + 5
      if (pc.maquina) pc.maquina.fazendo = true
      aviso('Fazendo o café…')
    }
    const vSent = new THREE.Vector3()
    const nivelElev = () => (E.nivel === 'terreo' ? E.elevTerreo : E.elevAndar)
    const ROT_ANDAR = (v) => (v === 0 ? 'T' : String(v))
    // vai de elevador para o outro nível (térreo ⇄ andar do escritório), pelo carro mais perto
    E.irElevador = () => {
      const c = E.ctrl, lv = nivelElev()
      if (!c || !lv || E.viagem || c.assento) return
      const P = c.av.position
      let i = 0, dm = Infinity
      lv.carros.forEach((k, j) => { const d = Math.hypot(k.frente[0] - P.x, k.frente[1] - P.z); if (d < dm) { dm = d; i = j } })
      const destino = E.nivel === 'terreo' ? 'andar' : 'terreo'
      lv.el.chamar(true)
      E.viagem = { fase: 'abrir', t: 0, i, lv, destino, de: null, trocou: false, andares: destino === 'terreo' ? Array.from({ length: andar + 1 }, (_, k) => andar - k) : Array.from({ length: andar + 1 }, (_, k) => k) }
      E.setControle?.({ modo: c.modo, info: c.info, sentado: false, elevador: null, viajando: true })
    }
    const angSuave = (a, b, k) => { let d = b - a; d = Math.atan2(Math.sin(d), Math.cos(d)); return a + d * k }
    const passoViagem = (dt, t) => {
      const v = E.viagem, c = E.ctrl, av = c.av, P = av.position
      v.t += dt
      const car = v.lv.carros[v.i], frenteYaw = E.elevAndar.frenteYaw
      if (v.fase === 'abrir') {
        car.c.alvo = 1; animarAndar(av, c.passo, 0, t)
        if (car.c.aberto > 0.97) { v.fase = 'entrar'; v.t = 0; v.de = [P.x, P.z]; v.lv.el.chamar(false) }
      } else if (v.fase === 'entrar' || v.fase === 'sair') {
        const [a, b] = v.fase === 'entrar' ? [v.de, car.cabine] : [car.cabine, car.frente]
        const dur = Math.max(0.6, Math.hypot(b[0] - a[0], b[1] - a[1]) / 1.2), k = Math.min(1, v.t / dur)
        const nx = a[0] + (b[0] - a[0]) * k, nz = a[1] + (b[1] - a[1]) * k
        const andou = Math.hypot(nx - P.x, nz - P.z); P.x = nx; P.z = nz
        const rumo = Math.atan2(b[0] - a[0], b[1] - a[1])
        c.yaw = v.fase === 'entrar' ? (k < 0.75 ? rumo : angSuave(rumo, frenteYaw, (k - 0.75) / 0.25)) : frenteYaw
        av.rotation.y = c.yaw; c.passo += (andou / 0.68) * Math.PI
        animarAndar(av, c.passo, k < 1 ? 1 : 0, t)
        if (k >= 1) {
          if (v.fase === 'entrar') { v.fase = 'fechar'; v.t = 0 }
          else { const fim = car; setTimeout(() => { fim.c.alvo = 0 }, 1200); E.viagem = null; E.setControle?.({ modo: c.modo, info: c.info, sentado: false, elevador: E.nivel }); c.pertoElev = true; return }
        }
      } else if (v.fase === 'fechar') {
        car.c.alvo = 0; animarAndar(av, c.passo, 0, t)
        if (car.c.aberto < 0.03) { v.fase = 'viajar'; v.t = 0 }
      } else if (v.fase === 'viajar') {
        const DUR = 2.8, k = Math.min(1, v.t / DUR)
        const idx = Math.min(v.andares.length - 1, Math.floor(k * v.andares.length)), at = v.andares[idx]
        const seta = v.destino === 'terreo' ? '↓' : '↑'
        v.lv.carros[v.i].c.display.desenhar(ROT_ANDAR(at), seta)
        E.setViagem?.({ andar: ROT_ANDAR(at), seta, destino: v.destino === 'terreo' ? 'Térreo' : `${andar}º andar` })
        if (k > 0.5 && !v.trocou) {
          v.trocou = true
          E.trocarNivel?.(v.destino)
          v.lv = nivelElev()
          P.set(v.lv.carros[v.i].cabine[0], E.yBase, v.lv.carros[v.i].cabine[1])
        }
        animarAndar(av, c.passo, 0, t)
        if (k >= 1) {
          E.setViagem?.(null)
          E.elevAndar.carros[v.i].c.display.desenhar(String(andar)); E.elevTerreo.carros[v.i].c.display.desenhar('T')
          v.fase = 'abrir2'; v.t = 0
        }
      } else if (v.fase === 'abrir2') {
        car.c.alvo = 1; animarAndar(av, c.passo, 0, t)
        if (car.c.aberto > 0.97) { v.fase = 'sair'; v.t = 0 }
      }
      // câmera de cinema durante a viagem: do corredor, olhando para dentro da cabine
      const yB = E.yBase || 0, cab = v.lv.carros[v.i].cabine, fr = v.lv.carros[v.i].frente
      const ex = fr[0] + (fr[0] - cab[0]) * 1.4, ez = fr[1] + (fr[1] - cab[1]) * 1.4
      camera.position.lerp(new THREE.Vector3(ex, yB + 1.75, ez), Math.min(1, dt * 4))
      camera.lookAt(cab[0], yB + 1.2, cab[1])
    }
    // ---------------- dirigir um veículo ----------------
    const vCam = new THREE.Vector3(), vOlho = new THREE.Vector3()
    const dirigir = (dt, c) => {
      const D = E.dirigindo, veh = D.veh, k = c.teclas
      veh.ent.acel = k.has('w') || k.has('arrowup') ? 1 : 0
      veh.ent.freio = k.has('s') || k.has('arrowdown') ? 1 : 0
      veh.ent.dir = (k.has('a') || k.has('arrowleft') ? 1 : 0) - (k.has('d') || k.has('arrowright') ? 1 : 0)
      const noAr = veh.S.voando || veh.S.y > 0.01
      veh.ent.mao = k.has(' ') && !noAr
      veh.ent.subir = k.has(' ') && noAr
      veh.ent.descer = k.has('x')
      veh.ent.nitro = k.has('shift')
      veh.atualizar(dt, D.colide, D.yT)
      const S = veh.S, h = veh.hud()
      if (D.paiAv) { c.posMapa = c.posMapa || new THREE.Vector3(); c.posMapa.set(S.x, D.yT, S.z) } else c.av.position.set(S.x, D.yT, S.z)
      c.yaw = S.psi   // o minimapa e a legenda seguem o carro
      if (predio?.transito) predio.transito.moveis[0] = S.y < 2 ? { x: S.x, z: S.z, r: veh.dims.W / 2 } : null
      if (E.marcas && S.y < 0.05 && h.kmh > 6 && (h.deslize > 0.2 || S.travou || S.girandoRe || h.abs)) for (const p of veh.rodasTraseiras()) E.marcas.marcar(p, S.psi, D.yT)
      D.som?.atualizar(h, veh.ent.acel)
      if (S.batida > 0.12 && !D.bateu) { D.som?.batida(S.batida); D.bateu = true } else if (S.batida < 0.04) D.bateu = false
      E.hudCarro = { ...h, nome: D.nome, cam: D.cam, roubado: !!D.cfg?.roubado }
      const fx = Math.sin(S.psi), fz = Math.cos(S.psi), { L, H } = veh.dims, yC = D.yT + S.y
      if (D.cam === 'capo') {
        vCam.set(S.x + fx * L * 0.12, yC + H * 0.82, S.z + fz * L * 0.12); camera.position.copy(vCam)
        camera.lookAt(S.x + fx * 30, yC + H * 0.7 - S.pitch * 20, S.z + fz * 30)
      } else if (D.cam === 'cima') {
        vCam.set(S.x - fx * 4, yC + 26, S.z - fz * 4); camera.position.lerp(vCam, Math.min(1, dt * 4)); camera.lookAt(S.x, yC, S.z)
      } else {   // perseguição: atrás e acima, afasta com a velocidade e olha um pouco à frente
        const v = Math.abs(S.vx), dist = Math.max(6, L * 1.35) + v * 0.06, alt = H * 1.6 + v * 0.015 + (S.voando ? 1.5 : 0)
        // a câmera segue a direção do movimento (não a da carroceria): na derrapagem dá para ver o carro de lado
        const mov = v > 2 ? Math.atan2(S.vx * fx + S.vy * Math.cos(S.psi), S.vx * fz - S.vy * Math.sin(S.psi)) : S.psi
        D.camPsi = D.camPsi == null ? S.psi : D.camPsi + Math.atan2(Math.sin(mov - D.camPsi), Math.cos(mov - D.camPsi)) * Math.min(1, dt * 3.2)
        vCam.set(S.x - Math.sin(D.camPsi) * dist, yC + alt, S.z - Math.cos(D.camPsi) * dist)
        camera.position.lerp(vCam, Math.min(1, dt * 6))
        vOlho.set(S.x + fx * 3, yC + H * 0.6, S.z + fz * 3); camera.lookAt(vOlho)
      }
    }
    const salvarVaga = (D) => {
      if (D.cfg?.roubado) return   // carro pego na rua: fica onde parou só nesta visita
      const S = D.veh.S, rot = Math.atan2(Math.sin(S.psi), Math.cos(S.psi))
      D.cfg.x = S.x; D.cfg.z = S.z; D.cfg.rot = rot
      api.post(`/api/mapa/veiculos/${D.cfg.id}/posicao`, { x: +S.x.toFixed(2), z: +S.z.toFixed(2), rot: +rot.toFixed(3) }).catch(() => { /* sem permissão: fica só nesta visita */ })
    }
    const sairDoCarro = (forcar = false) => {
      const c = E.ctrl, D = E.dirigindo
      if (!c || !D) return false
      const S = D.veh.S
      if (!forcar && (Math.abs(S.vx) > 2.5 || S.y > 0.5)) { E.setControle?.({ modo: c.modo, info: c.info, sentado: false, dirigindo: D.nome, aviso: S.y > 0.5 ? 'Pouse antes de sair (X desce).' : 'Pare o carro para sair (S freia).' }); return true }
      if (S.voando) D.veh.propulsores()
      if (D.paiAv) { D.paiAv.attach(c.av); c.av.rotation.set(0, 0, 0); levantar(c.av); c.av.userData.quadril.rotation.x = 0; c.av.userData.pernas.forEach((q) => { q.quad.rotation.z = 0 }) }
      if (predio?.transito) predio.transito.moveis[0] = null
      // sai pela porta do motorista (esquerda); se estiver bloqueada, pela outra ou por trás
      const { L, W } = D.veh.dims, lx = Math.cos(S.psi), lz = -Math.sin(S.psi), fx = Math.sin(S.psi), fz = Math.cos(S.psi)
      const opc = [[lx * (W / 2 + 0.7), lz * (W / 2 + 0.7)], [-lx * (W / 2 + 0.7), -lz * (W / 2 + 0.7)], [-fx * (L / 2 + 0.8), -fz * (L / 2 + 0.8)], [fx * (L / 2 + 0.8), fz * (L / 2 + 0.8)]]
      const cid = E.cidadeRuas, livreRua = (x, z) => !cid || (!cid.obstaculos.some((o) => x > o[0] - 0.3 && x < o[2] + 0.3 && z > o[1] - 0.3 && z < o[3] + 0.3))
      const [dx, dz] = opc.find(([a, b]) => livreRua(S.x + a, S.z + b)) || opc[0]
      D.veh.ent.acel = D.veh.ent.freio = D.veh.ent.dir = 0; D.veh.ent.mao = true
      c.av.position.set(S.x + lx * W * 0.18, D.yT, S.z + lz * W * 0.18); c.av.visible = true; c.av.scale.y = 0.7; c.yaw = S.psi
      if (!forcar) E.transicao = { fase: 'sair', t: 0, item: D.ref || D, porta: [S.x + dx, S.z + dz] }
      else c.av.position.set(S.x + dx, D.yT, S.z + dz)
      D.som?.buzinar(false); D.som?.fechar(); E.dirigindo = null; E.hudCarro = null; c.teclas.clear()
      salvarVaga(D)
      if (!forcar) E.setControle?.({ modo: c.modo, info: c.info, sentado: false, carro: D.nome, aviso: 'Carro estacionado aqui. E perto dele entra de novo.' })
      return true
    }
    E.alternarCarro = () => {
      const c = E.ctrl
      if (!c || c.assento || E.viagem) return false
      if (E.transicao) return true   // já entrando ou saindo
      if (E.dirigindo) return sairDoCarro(false)
      if (E.nivel !== 'terreo') return false
      const P = c.av.position
      let v = (E.veiculos || []).map((x) => ({ x, d: Math.hypot(x.veh.S.x - P.x, x.veh.S.z - P.z) })).sort((a, b) => a.d - b.d)[0]
      if (!v || v.d > Math.max(3.2, v.x.veh.dims.L * 0.75)) {
        const novo = pegarDaRua(P)   // nenhum da biblioteca perto: pega um do trânsito ou do estacionamento
        if (!novo) return false
        v = { x: novo }
      }
      // como no jogo: corre até a porta do motorista, abaixa, entra e só então assume o volante
      const item = v.x
      c.teclas.clear()
      E.transicao = { fase: 'ir', t: 0, item, fim: () => {
        item.veh.ent.mao = false; item.veh.ent.freio = 0; item.veh.S.re = false
        E.dirigindo = { ...item, ref: item, cam: 'perseguicao', som: criarSom(), camPsi: null }
        c.av.visible = false; c.av.scale.y = 1; if (c.label) c.label.visible = false
        if (item.veh.F.duasRodas) {   // moto: a pessoa vai sentada em cima, inclinando junto nas curvas
          const corpo = item.veh.raiz.children[0], { H, L } = item.veh.dims
          E.dirigindo.paiAv = c.av.parent; corpo.add(c.av)
          c.av.position.set(0, Math.max(0.2, H * 0.55 - 0.47), -L * 0.06); c.av.rotation.set(0, 0, 0); poseMoto(c.av); c.av.visible = true
        }
        E.setControle?.({ modo: c.modo, info: c.info, sentado: false, dirigindo: item.nome, voar: !!item.veh.F.voar, aviso: item.cfg?.roubado ? `Você pegou ${item.nome} da rua. Ele fica onde você deixar (só nesta visita).` : undefined })
        const completo = item.cfg?.avatar && mapa.modelos?.medios?.[item.cfg.avatar]
        if (completo) carregarAvatar(completo).then((gl) => {   // carro pego na rua: troca a versão leve pela média (a física continua igual)
          if (E.dirigindo?.ref !== item || item.veh.completo) return
          const velho = item.veh, nv = criarVeiculo(clonarComOssos(gl.scene), velho.F)
          Object.assign(nv.S, velho.S); Object.assign(nv.ent, velho.ent); nv.completo = true
          nv.atualizar(0, null, item.yT); velho.raiz.parent?.add(nv.raiz); velho.raiz.removeFromParent()
          item.veh = nv; E.dirigindo.veh = nv; item.completo = null
          if (E.dirigindo.paiAv) { const av = c.av, pos = av.position.clone(); nv.raiz.children[0].add(av); av.position.copy(pos) }
        }).catch(() => { /* segue com a versão leve */ })
      } }
      return true
    }
    // pessoa que sai correndo do carro roubado (some depois de alguns segundos)
    E.fugitivos = []
    const fugir = (x, z, psi, W, yT) => {
      const p = pessoa(Math.random, false); const lx = Math.cos(psi), lz = -Math.sin(psi)
      p.position.set(x + lx * (W / 2 + 0.4), yT, z + lz * (W / 2 + 0.4)); E.grupoCarros.add(p)
      const ang = Math.atan2(lx, lz) + (Math.random() - 0.5) * 0.8
      E.fugitivos.push({ p, dx: Math.sin(ang), dz: Math.cos(ang), t: 5, passo: 0 })
    }
    // entrar e sair do carro (posição da porta do motorista e do banco), chamado pelo moverControle; devolve o quanto andou
    const passoTransicao = (dt, c) => {
      const T = E.transicao, P = c.av.position, S = T.item.veh.S, { L, W } = T.item.veh.dims
      if (T.fase !== 'sair') {   // carro andando (pego do trânsito): freia sozinho; parado, fica no freio de mão
        const ve = T.item.veh, anda = Math.abs(ve.S.vx) > 0.5   // (segurar o freio parado engataria a ré e o carro iria embora)
        ve.ent.acel = 0; ve.ent.dir = 0; ve.ent.freio = anda ? 1 : 0; ve.ent.mao = !anda; ve.S.re = false
        if (anda || ve.S.y > 0) ve.atualizar(dt, T.item.colide, T.item.yT)
      }
      const lx = Math.cos(S.psi), lz = -Math.sin(S.psi), fx = Math.sin(S.psi), fz = Math.cos(S.psi)
      const porta = T.porta || [S.x + lx * (W / 2 + 0.45) + fx * L * 0.06, S.z + lz * (W / 2 + 0.45) + fz * L * 0.06]
      const banco = [S.x + lx * W * 0.18, S.z + lz * W * 0.18]
      T.t += dt
      const suave = (k) => k * k * (3 - 2 * k)
      if (T.fase === 'ir') {
        const dx = porta[0] - P.x, dz = porta[1] - P.z, d = Math.hypot(dx, dz)
        if (d < 0.12 || T.t > 4) { T.fase = 'entrar'; T.t = 0; return 0 }
        const passo = Math.min(d, 3.4 * dt); P.x += (dx / d) * passo; P.z += (dz / d) * passo; c.yaw = Math.atan2(dx, dz)
        return passo
      }
      const k = suave(Math.min(1, T.t / (T.fase === 'entrar' ? 0.75 : 0.6)))
      if (T.fase === 'entrar') {
        c.yaw = Math.atan2(-lx, -lz) + (S.psi - Math.atan2(-lx, -lz)) * k
        P.x = porta[0] + (banco[0] - porta[0]) * k; P.z = porta[1] + (banco[1] - porta[1]) * k
        c.av.scale.y = 1 - 0.3 * k
        if (k >= 1) { E.transicao = null; T.fim() }
        return 0
      }
      // sair: do banco para a porta, levantando
      c.av.visible = true
      P.x = banco[0] + (porta[0] - banco[0]) * k; P.z = banco[1] + (porta[1] - banco[1]) * k
      c.av.scale.y = 0.7 + 0.3 * k; c.yaw = S.psi
      if (k >= 1) { c.av.scale.y = 1; E.transicao = null; T.fim?.() }
      return 0
    }
    // veículo do trânsito ou de um estacionamento perto da pessoa (até 3,5 m): sai da rua e vira dirigível com a física
    // do tipo dele; o motorista some (ilustração: ninguém se machuca) e o carro continua na velocidade em que estava
    const NOMES_TIPO = { sedan: 'Sedã', suv: 'SUV', van: 'Van', picape: 'Picape', onibus: 'Ônibus', moto: 'Moto' }
    const perto = (P) => {
      const tr = predio?.transito
      if (!tr) return null
      let m = null
      for (const o of tr.lista()) { const d = Math.hypot(o.x - P.x, o.z - P.z) - o.comp / 2; if (d < 3.5 && (!m || d < m.d)) m = { d, o, de: 'transito' } }
      for (const p of tr.estacionados?.lista() || []) { const d = Math.hypot(p.x - P.x, p.z - P.z) - 2.1; if (d < 3.5 && (!m || d < m.d)) m = { d, o: p, de: 'parado' } }
      return m
    }
    const frotaDe = (m) => (m.de === 'transito' ? m.o.frota : (E.frota || []).filter((f) => f.L < 8 && !f.v.fisica?.duasRodas)[m.o.mi ?? -1])
    E.pertoDaRua = (P) => {
      const m = perto(P); if (!m) return null
      const f = frotaDe(m), nome = f ? f.v.nome : (m.de === 'parado' ? 'Sedã' : NOMES_TIPO[m.o.tipo] || 'Carro')
      return m.de === 'parado' ? `${nome} estacionado` : `${nome} do trânsito`
    }
    const pegarDaRua = (P) => {
      const m = perto(P)
      if (!m || !E.colideCarro) return null
      const tr = predio.transito, yT = -predio.yA
      let cor, tipo, x, z, psi, vel = 0
      if (m.de === 'transito') {
        tr.tirar(m.o.c); tipo = m.o.tipo; x = m.o.x; z = m.o.z; psi = m.o.psi; vel = Math.max(0, m.o.c.vel)
        cor = m.o.c.g.children[0]?.material?.color?.getHex?.() ?? 0xd4d4d8
      } else {
        const p = tr.estacionados.tirar(m.o.i); if (!p) return null
        tipo = 'sedan'; x = p.x; z = p.z; psi = p.psi; cor = p.cor
      }
      const f = frotaDe(m)
      let veh, nome
      if (f) {   // carro da biblioteca (versão leve): a física é a mesma do modelo completo
        veh = criarVeiculo(clonarComOssos(f.gl.scene), { nitro: 1, ...(f.v.fisica || {}), voar: f.v.fisica?.duasRodas || f.L >= 8 ? 0 : 1, comprimento: f.L })
        nome = f.v.nome
      } else {
        const modelo = carroTransito(cor, tipo).g
        const rodasDoModelo = []; modelo.traverse((o) => { if (o.isMesh && o.geometry?.type === 'CylinderGeometry' && o.rotation.x !== 0) rodasDoModelo.push(o) })
        if (tipo !== 'moto') rodasDoModelo.forEach((o) => o.removeFromParent())   // as rodas passam a ser as da física
        const T = TIPOS_TRANSITO[tipo] || TIPOS_TRANSITO.sedan
        veh = criarVeiculo(modelo, { ...T.fisica, inverter: 1, comprimento: T.L, esc: 1, nitro: 1, voar: tipo === 'moto' || tipo === 'onibus' ? 0 : 1 })
        nome = NOMES_TIPO[tipo] || 'Carro'
      }
      veh.colocar(x, z, psi); veh.S.vx = vel; veh.atualizar(0, null, yT); E.grupoCarros.add(veh.raiz)
      if (m.de === 'transito') fugir(x, z, psi, veh.dims.W, yT)   // o motorista sai correndo
      const item = { cfg: { id: null, roubado: true, avatar: f?.v.avatar_id || null }, veh, colide: E.colideCarro, yT, nome }
      E.veiculos.push(item)
      return item
    }
    E.propulsores = () => {
      const D = E.dirigindo, c = E.ctrl
      if (!D || !c) return
      const r = D.veh.propulsores()
      E.setControle?.({ modo: c.modo, info: c.info, sentado: false, dirigindo: D.nome, voar: !!D.veh.F.voar,
        aviso: r == null ? 'Este veículo não tem propulsores.' : r ? 'Propulsores ligados: Espaço sobe, X desce, W acelera, A/D vira. T de novo desliga (no ar, ele cai).' : 'Propulsores desligados.' })
    }
    E.camCarro = () => { const D = E.dirigindo; if (D) D.cam = { perseguicao: 'capo', capo: 'cima', cima: 'perseguicao' }[D.cam] }
    E.buzina = (on) => E.dirigindo?.som?.buzinar(on)
    E.desvirar = () => { const D = E.dirigindo; if (!D) return; const S = D.veh.S; D.veh.colocar(S.x, S.z, S.psi) }
    // ---------------- multijogador: manda a minha posição e desenha os outros ----------------
    const remotos = new Map()   // id → { p, rot, carro: { chave, veh }, alvo }
    E.remotos = remotos
    E.outros = { carros: () => [...remotos.values()].filter((r) => r.carro?.veh && r.alvo?.carro && r.alvo.nivel === E.nivel).map((r) => { const S = r.carro.veh.S; return { x: S.x, z: S.z, psi: S.psi, L: r.carro.veh.dims.L, W: r.carro.veh.dims.W } }) }
    const angLerp = (a, b, k) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * k
    const sincronizarRemotos = (dt, t) => {
      const mp = E.mp
      if (!mp) return
      const c = E.ctrl
      if (c && !E.viagem) {
        const D = E.dirigindo, P = c.av.position
        mp.enviar(D ? { nivel: E.nivel, x: +D.veh.S.x.toFixed(2), z: +D.veh.S.z.toFixed(2), y: P.y, yaw: c.yaw,
          carro: { av: D.cfg?.avatar_id || D.cfg?.avatar || null, nome: D.nome, L: D.veh.dims.L, x: +D.veh.S.x.toFixed(2), z: +D.veh.S.z.toFixed(2), alt: +D.veh.S.y.toFixed(2), psi: +D.veh.S.psi.toFixed(3), pitch: +D.veh.S.pitch.toFixed(3), roll: +D.veh.S.roll.toFixed(3), kmh: D.veh.hud().kmh } }
          : { nivel: E.nivel, x: +P.x.toFixed(2), z: +P.z.toFixed(2), y: +P.y.toFixed(2), yaw: +c.yaw.toFixed(3), sent: !!c.assento, esc: c.av.scale.y < 0.95 })
      }
      const agora = performance.now()
      for (const [id, o] of mp.outros) {
        let r = remotos.get(id)
        if (agora - o.recebido_em > 6000) { if (r) { r.p.removeFromParent(); r.carro?.veh.raiz.removeFromParent(); remotos.delete(id) } mp.outros.delete(id); continue }
        if (!r) {   // figura com aparência sorteada pelo id (sempre a mesma para a mesma pessoa) e o nome em cima
          let h = 0; for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0
          const p = pessoa(aleatorio(h), false); const rot = etiqueta(o.nome || 'Pessoa', '#ffffff', 'rgba(124,58,237,0.9)'); rot.position.y = 2.15; p.add(rot)
          p.position.set(o.x, o.y || 0, o.z); E.grupoCarros?.add(p) || mundo.add(p)
          r = { p, rot, passo: 0 }; remotos.set(id, r)
        }
        r.alvo = o
        const visivel = o.nivel === E.nivel
        // carro: monta o modelo (biblioteca) uma vez por carro e só mexe a pose
        const chave = o.carro ? `${o.carro.av || 'sedan'}` : null
        if (chave !== (r.carro?.chave || null)) {
          r.carro?.veh?.raiz.removeFromParent(); r.carro = chave ? { chave, veh: null } : null
          if (chave) {
            const montar = (modelo, fis) => { if (r.carro?.chave !== chave) return; const veh = criarVeiculo(modelo, fis); r.carro.veh = veh; veh.colocar(o.carro.x, o.carro.z, o.carro.psi); veh.atualizar(0, null, -(predio?.yA || 0)); E.grupoCarros?.add(veh.raiz) }
            if (o.carro.av) carregarAvatar(o.carro.av).then((gl) => montar(clonarComOssos(gl.scene), { ...((mapa.veiculos || []).find((v) => v.avatar_id === o.carro.av)?.fisica || {}), comprimento: o.carro.L })).catch(() => { /* sem o modelo */ })
            else { const m2 = carroTransito(0x9ca3af, 'sedan').g; montar(m2, { inverter: 1, comprimento: o.carro.L || 4.2 }) }
          }
        }
        if (r.carro?.veh) {
          const S = r.carro.veh.S, k = Math.min(1, dt * 10)
          S.x += (o.carro.x - S.x) * k; S.z += (o.carro.z - S.z) * k; S.psi = angLerp(S.psi, o.carro.psi, k); S.y += (o.carro.alt - S.y) * k
          S.pitch = o.carro.pitch; S.roll = o.carro.roll; S.voando = o.carro.alt > 0.3
          r.carro.veh.atualizar(0, null, -(predio?.yA || 0)); r.carro.veh.raiz.visible = visivel
          r.p.visible = false
          continue
        }
        const k = Math.min(1, dt * 10), ax = r.p.position.x, az = r.p.position.z
        r.p.position.x += (o.x - ax) * k; r.p.position.z += (o.z - az) * k; r.p.position.y = o.y || 0
        r.p.rotation.y = angLerp(r.p.rotation.y, o.yaw || 0, k)
        const andou = Math.hypot(r.p.position.x - ax, r.p.position.z - az)
        r.passo += (andou / 0.68) * Math.PI
        r.p.scale.y = o.esc ? 0.7 : 1
        animarAndar(r.p, r.passo, Math.min(1, andou / Math.max(1e-4, 1.35 * dt)), t)
        r.p.visible = visivel
      }
    }
    const moverControle = (dt, t) => {
      const c = E.ctrl, av = c.av, P = av.position
      E.tAgora = t
      if (c.fazendoAte && t >= c.fazendoAte) {   // café pronto: sai da máquina com a xícara
        c.fazendoAte = 0; c.cafeAte = t + 90
        if ((E.cafeAtual || E.pontoCafe)?.maquina) (E.cafeAtual || E.pontoCafe).maquina.fazendo = false
        av.userData.fase = Math.PI / 2 / 1.55 - t - 1.2   // primeiro gole logo depois
        E.setControle?.({ modo: c.modo, info: c.info, sentado: false, aviso: 'Café pronto. C dá um gole; parado, ele bebe sozinho.' })
      }
      if (c.cafeAte && t >= c.cafeAte) { c.cafeAte = 0; E.setControle?.({ modo: c.modo, info: c.info, sentado: !!c.assento, aviso: 'O café acabou.' }) }
      const k = c.fazendoAte ? new Set() : c.teclas   // fazendo café: fica parado na máquina
      if (E.viagem) { passoViagem(dt, t); return }
      if (E.dirigindo) { dirigir(dt, c); return }
      if (E.transicao) c.teclas.clear()   // entrando ou saindo do carro: as teclas esperam
      if (c.assento) {   // sentado trabalhando: digita; câmera da cabeça (1ª) ou por cima do ombro (3ª), olhando o monitor
        animarPessoa(av, t)
        av.getWorldPosition(vSent)
        const fx = Math.sin(c.yaw), fz = Math.cos(c.yaw)
        if (c.modo === '1') {
          av.userData.pescoco.visible = false; if (c.label) c.label.visible = false
          camera.position.set(vSent.x + fx * 0.12, 1.22, vSent.z + fz * 0.12)
        } else {
          av.userData.pescoco.visible = true; if (c.label) c.label.visible = true
          camera.position.lerp(new THREE.Vector3(vSent.x - fx * 0.85 + fz * 0.35, 1.62, vSent.z - fz * 0.85 - fx * 0.35), Math.min(1, dt * 6))
        }
        camera.lookAt(vSent.x + fx * 0.75, 1.04, vSent.z + fz * 0.75)
        return
      }
      if (k.has('q') || k.has('arrowleft')) c.yaw += dt * 2
      if (k.has('e') || k.has('arrowright')) c.yaw -= dt * 2
      let f = 0, lat = 0
      if (k.has('w') || k.has('arrowup')) f += 1
      if (k.has('s') || k.has('arrowdown')) f -= 1
      if (k.has('a')) lat += 1
      if (k.has('d')) lat -= 1
      const fx = Math.sin(c.yaw), fz = Math.cos(c.yaw)
      let mx = fx * f + fz * lat, mz = fz * f - fx * lat
      const n = Math.hypot(mx, mz)
      let andou = E.transicao ? passoTransicao(dt, c) : 0
      if (E.dirigindo) return   // acabou de entrar no carro neste quadro: o resto (aviso de carro perto) não pode sobrescrever o estado
      const vel = k.has('shift') ? 2.7 : 1.35
      if (n > 0) {
        mx /= n; mz /= n
        const passo = vel * (f < 0 && !lat ? 0.6 : 1) * dt
        let nx = P.x + mx * passo, nz = P.z + mz * passo
        const G = E.gradeAtiva || grade
        // térreo: dentro da calçada do prédio vale a grade (portas, catracas, balcão); fora dela a pessoa anda livre pelas
        // ruas, calçadas, praças e pelo terminal, desviando dos lotes construídos (uma grade da cidade inteira travaria)
        const LF = E.terreo?.limitesFora, cid = E.cidadeRuas
        const naRua = (x, z) => E.nivel === 'terreo' && LF && cid && !(x >= LF[0] && x <= LF[2] && z >= LF[1] && z <= LF[3])
        const livre = (x, z) => {
          if (!naRua(x, z)) return celulaLivre(G, x, z)
          const L = cid.limite, m = 0.3
          if (L && (x < L[0] || x > L[2] || z < L[1] || z > L[3])) return false
          const [p0, q0, p1, q1] = cid.podio
          if (x > p0 && x < p1 && z > q0 && z < q1) return false
          for (const v of E.veiculos || []) {   // carro estacionado: contorna a caixa dele
            const S = v.veh.S, dx = x - S.x, dz = z - S.z, sp = Math.sin(S.psi), cp = Math.cos(S.psi)
            if (Math.abs(dx * sp + dz * cp) < v.veh.dims.L / 2 + 0.2 && Math.abs(dx * cp - dz * sp) < v.veh.dims.W / 2 + 0.2) return false
          }
          return !cid.obstaculos.some((o) => x > o[0] - m && x < o[2] + m && z > o[1] - m && z < o[3] + m)
        }
        if (!livre(nx, nz)) { if (livre(nx, P.z)) nz = P.z; else if (livre(P.x, nz)) nx = P.x; else { nx = P.x; nz = P.z } }
        andou = Math.hypot(nx - P.x, nz - P.z); P.x = nx; P.z = nz
      }
      // perto de um carro (térreo): a barra mostra "Entrar no carro (E)"
      if (predio?.transito) predio.transito.moveis[0] = E.nivel === 'terreo' ? { x: P.x, z: P.z, r: 0.4 } : null
      if (E.nivel === 'terreo') {
        const pc = (E.veiculos || []).find((v) => Math.hypot(v.veh.S.x - P.x, v.veh.S.z - P.z) < Math.max(3.2, v.veh.dims.L * 0.75))
        const nomeC = pc?.nome || E.pertoDaRua?.(P) || null
        if (nomeC !== (c.pertoCarro || null)) { c.pertoCarro = nomeC; E.setControle?.({ modo: c.modo, info: c.info, sentado: false, elevador: c.pertoElev ? E.nivel : null, carro: nomeC }) }
      }
      // perto da porta de um elevador: a barra mostra o botão para descer/subir
      const lv = nivelElev()
      if (lv) {
        const perto = lv.carros.some((x) => Math.hypot(x.frente[0] - P.x, x.frente[1] - P.z) < 1.5)
        if (perto !== !!c.pertoElev) { c.pertoElev = perto; E.setControle?.({ modo: c.modo, info: c.info, sentado: false, elevador: perto ? E.nivel : null, carro: c.pertoCarro || null }) }
      }
      av.rotation.y = c.yaw
      c.passo += (andou / 0.68) * Math.PI * (f < 0 ? -1 : 1)
      animarAndar(av, c.passo, Math.min(1, andou / Math.max(1e-4, 1.35 * dt)), t, false, c.cafeAte > t)
      const cp = Math.cos(c.pitch), sp = Math.sin(c.pitch), yB = E.yBase || 0
      if (c.modo === '1') {
        av.userData.pescoco.visible = false
        if (c.label) c.label.visible = false
        camera.position.set(P.x + fx * 0.1, yB + 1.63, P.z + fz * 0.1)
        camera.lookAt(camera.position.x + fx * cp, yB + 1.63 + sp, camera.position.z + fz * cp)
      } else {
        av.userData.pescoco.visible = true
        if (c.label) c.label.visible = true
        const dist = 2.4, alt = 1.75 - sp * 1.6
        const desejo = new THREE.Vector3(P.x - fx * dist * cp, yB + Math.max(0.5, alt), P.z - fz * dist * cp)
        camera.position.lerp(desejo, Math.min(1, dt * 8))
        camera.lookAt(P.x + fx * 0.6, yB + 1.35, P.z + fz * 0.6)
      }
    }
    E.iniciarControle = iniciarControle; E.pararControle = pararControle
    E.mudarModo = (m) => { if (E.ctrl) { E.ctrl.modo = m; E.setControle?.({ modo: m, info: E.ctrl.info, sentado: !!E.ctrl.assento }) } }
    if (E.ctrlPendente) { const pend = E.ctrlPendente; E.ctrlPendente = null; iniciarControle(pend.info, pend.modo) }

    // animação
    E.tick = (dt, t) => {
      pessoas.forEach((p) => animarPessoa(p, t))
      if (E.telas?.length) {
        const cam = camera.position, ativo = E.ctrl?.assento
        const perto = E.telas.filter((x) => x.a === ativo || x.pos.distanceToSquared(cam) < 64)
          .sort((a, b) => a.pos.distanceToSquared(cam) - b.pos.distanceToSquared(cam)).slice(0, 6)
        for (const x of perto) {
          const vivo = x.a === ativo
          if (t - x.ult < (vivo ? 0.2 : 0.5)) continue
          x.ult = t
          desenharTela(x.g, x.a.ocupante ? x.a.papel : 'bloqueio', x.sem, t, vivo)
          x.tx.needsUpdate = true
        }
      }
      arvores.forEach((a) => { a.copa.rotation.z = Math.sin(t * 0.9 + a.fase) * 0.035; a.copa.rotation.x = Math.cos(t * 0.7 + a.fase) * 0.025 })
      climas.forEach((c) => { c.m.material.opacity = 0.42 + Math.sin(t * 1.3 + c.fase) * 0.18 })
      matTela.emissiveIntensity = (ceu.noite ? 0.7 : 0.35) + Math.sin(t * 7) * 0.03 + (Math.sin(t * 0.37) > 0.97 ? 0.25 : 0)
      andarilhos.forEach((a) => moverAndarilho(a, dt, t))
      animarDispositivos(dispositivos, dt, t)
      if (E.ctrl) moverControle(dt, t)
      sincronizarRemotos(dt, t)
      // plano de corte perto da câmera: 10 cm de perto (avatar, dentro do andar); 60 cm com a câmera longe (prédio de
      // fora), o que dá ~6x mais precisão de profundidade e acaba com o pisca-pisca de superfícies próximas
      const nearAlvo = E.ctrl || camera.position.distanceTo(controles.target) < 35 ? 0.1 : 0.6
      if (camera.near !== nearAlvo) { camera.near = nearAlvo; camera.updateProjectionMatrix() }
      E.elevAndar?.el.tick(dt); E.elevTerreo?.el.tick(dt)
      cafeteiras.forEach((c) => c.animar(t, !!c.fazendo))
      if (!cafeTrocada && mapa.modelos?.cafeteira && cafeteiras.length) {   // cafeteira da biblioteca no lugar do desenho
        cafeTrocada = true
        const mundoC = mundo
        carregarAvatar(mapa.modelos.cafeteira).then((gl) => { if (estado.current?.mundo === mundoC) cafeteiras.forEach((c) => c.trocar?.(clonarComOssos(gl.scene))) }).catch(() => { /* fica o desenho */ })
      }
      if (E.fugitivos?.length) E.fugitivos = E.fugitivos.filter((f) => {
        f.t -= dt; f.passo += dt * 9; f.p.position.x += f.dx * 4.2 * dt; f.p.position.z += f.dz * 4.2 * dt; f.p.rotation.y = Math.atan2(f.dx, f.dz)
        animarAndar(f.p, f.passo, 1, t)
        if (f.t <= 0) { f.p.removeFromParent(); return false }
        return true
      })
      for (const P of E.personagens || []) { if (E.nivel !== 'terreo') E.moverPersonagem(P, dt); P.mixer.update(dt) }
      for (const g of E.glbs || []) {   // avatares GLB: animação pelo movimento (andando × parado) ou sentado na mesa
        const pos = g.it.av.getWorldPosition(new THREE.Vector3())
        const v = dt > 0 ? pos.distanceTo(g.ult) / dt : 0
        g.vel = g.vel * 0.85 + v * 0.15; g.ult.copy(pos)
        const sentado = g.it.av.userData.sentada || (E.ctrl?.av === g.it.av && E.ctrl.assento)
        g.tocar(sentado ? 'sentado' : g.vel > 0.25 ? 'andando' : 'parado')
        g.mixer.update(dt)
        if (g.modelo && !g.clips.andando) {   // modelo sem esqueleto/animação: balanço do passo (sobe, desce e gira de leve)
          g.fase = (g.fase || 0) + dt * g.vel * 7
          const k = Math.min(1, g.vel / 1.2)
          g.modelo.position.y = g.y0 + Math.abs(Math.sin(g.fase)) * 0.045 * k
          g.modelo.rotation.z = Math.sin(g.fase) * 0.05 * k; g.modelo.rotation.x = 0.06 * k
        }
      }
      if (E.nivel === 'terreo') {
        E.terreo?.tickPorta(dt, [E.ctrl?.av.position, ...genteT.andam.map((a) => a.p.position)])
        if (genteT.recep) animarPessoa(genteT.recep, t)
        if (genteT.guarda) animarAndar(genteT.guarda, 0, 0, t)
        genteT.andam.forEach((a) => moverAndarilho(a, dt, t))
      }
      predio?.tick(dt, t)
      if (predio) {
        const alvoK = E.aberto && E.nivel !== 'terreo' ? 1 : 0   // no térreo o prédio fica inteiro: dá para sair e olhar
        if (Math.abs(predio.k - alvoK) > 0.001) predio.aplicar(THREE.MathUtils.clamp(predio.k + Math.sign(alvoK - predio.k) * dt / 1.4, 0, 1))
        if (E.placaAndar) E.placaAndar.visible = predio.k < 0.05
        if (E.fachadaAndar) E.fachadaAndar.visible = predio.k > 0.6
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
    if (!E.enquadrado) enquadrar()   // remontar (persiana, escrita, pessoa) não tira a câmera do lugar
    E.enquadrar = enquadrar
    // compila os shaders em paralelo (extensão KHR_parallel_shader_compile) antes do primeiro quadro: sem isso a
    // primeira renderização trava a página enquanto o WebGL compila dezenas de materiais
    E.compilando = true
    E.compilacao = renderer.compileAsync(cena, camera).catch(() => {}).finally(() => { E.compilando = false })

    // clique e cursor
    const ray = new THREE.Raycaster(), mouse = new THREE.Vector2()
    const alvos = [...unidades.map((u) => u.alvo), ...clicaveis, ...pisos]
    const alvosEscrita = [...vidros, ...clicaveis.filter((c) => c.userData.tipo === 'escrita')]
    const acerto = (ev) => {
      const b = renderer.domElement.getBoundingClientRect()
      mouse.set(((ev.clientX - b.left) / b.width) * 2 - 1, -((ev.clientY - b.top) / b.height) * 2 + 1)
      ray.setFromCamera(mouse, camera)
      if (predio && !E.aberto) return ray.intersectObjects(predio.alvos, false).length ? { tipo: 'predio' } : null
      const h0 = ray.intersectObjects(E.escrevendo ? alvosEscrita : alvos, false)[0]
      if (!h0) return null
      if (h0.object.userData.tipo === 'vidro') {
        const { horiz, k } = h0.object.userData, pt = h0.point
        return { tipo: 'vidro', horiz, x: Math.round(horiz ? pt.x / S + cx : k), y: Math.round(horiz ? k : pt.z / S + cy), lado: horiz ? (camera.position.z > pt.z ? 1 : -1) : (camera.position.x > pt.x ? 1 : -1), altura: Math.round(THREE.MathUtils.clamp(pt.y, 0.9, 1.8) * 100) / 100 }
      }
      return h0.object.userData
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
        if (E.ctrl) { baixo = null; return }
        if (u?.tipo === 'pessoa' || u?.tipo === 'generico') {   // situação ao vivo (mesmo objeto: o controle acha o avatar por ele)
          const it = (E.avatares || []).find((x) => x.info === u), av = it?.av
          const assento = av && assentos.find((x) => x.ocupante === av)
          u.agora = !av ? '' : assento ? 'trabalhando' : E.ctrl?.av === av ? 'sendo controlada' : 'andando pelo escritório'
          u.tela = assento ? ROTULO_PAPEL[assento.papel] || '' : ''
        }
        if (['janela', 'item', 'pessoa', 'generico', 'escrita', 'vidro'].includes(u?.tipo)) { E.abrirCartao?.(u); baixo = null; return }
        E.abrirCartao?.(u?.tipo === 'sala' ? { tipo: 'sala', id: u.id } : null)   // sala: cartão com cores e porta
        E.aoSelecionar?.(u?.tipo ? u : null)
        if (u?.tipo === 'sala') { const pz = pisos.find((x) => x.userData.id === u.id); if (pz) voar(pz.position.clone(), Math.max(pz.geometry.parameters.width, pz.geometry.parameters.height) * 0.9 + 2) }
        else if (u?.tipo === 'ar') { const un = unidades.find((x) => x.a?.id === u.id); if (un) voar(un.g.position.clone().setY(0.8), 4.5) }
      }
      baixo = null
    }
    const mv = (ev) => {
      if (E.ctrl) {
        if (ev.buttons) { E.ctrl.yaw -= ev.movementX * 0.006; E.ctrl.pitch = THREE.MathUtils.clamp(E.ctrl.pitch - ev.movementY * 0.004, -1.1, 0.7) }
        renderer.domElement.style.cursor = ev.buttons ? 'grabbing' : 'grab'; return
      }
      const u = acerto(ev)
      renderer.domElement.style.cursor = E.escrevendo ? (u?.tipo === 'vidro' || u?.tipo === 'escrita' ? 'text' : 'not-allowed') : ['ar', 'elemento', 'predio', 'janela', 'item', 'pessoa', 'generico', 'escrita'].includes(u?.tipo) ? 'pointer' : 'grab'
    }
    renderer.domElement.addEventListener('pointerdown', pd); renderer.domElement.addEventListener('pointerup', pu); renderer.domElement.addEventListener('pointermove', mv)
    return () => {
      if (E.ctrl) { E.ctrlPendente = { info: E.ctrl.info, modo: E.ctrl.modo }; const c = E.ctrl; E.ctrl = null; camera.position.copy(c.camPos); controles.target.copy(c.camAlvo); controles.enabled = true }
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
      <div ref={rotulosRef} className={`pointer-events-none absolute inset-0 ${nivel === 'terreo' ? 'hidden' : ''}`} />
      {ilha && <Suspense fallback={<div className="absolute inset-0 z-30 grid place-items-center bg-sky-200 text-sm text-slate-700">Montando a ilha…</div>}><VistaIlha3D aoFechar={fecharIlha} /></Suspense>}
      {viagem && (
        <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center bg-black/80" role="status" aria-live="polite">
          <div className="text-center text-white">
            <p className="text-xs uppercase tracking-widest text-white/60">Elevador · indo para {viagem.destino}</p>
            <p className="mt-2 font-mono text-6xl font-semibold tabular-nums text-amber-300"><span className="mr-3 text-4xl">{viagem.seta}</span>{viagem.andar}</p>
          </div>
        </div>
      )}
      {nivel === 'terreo' && !viagem && <p className="pointer-events-none absolute right-3 top-14 z-10 rounded-md bg-black/55 px-2.5 py-1 text-xs text-white">Térreo · recepção do prédio</p>}
      <button onClick={alternarCheia} className={`absolute left-3 top-3 flex overflow-hidden rounded-lg border border-border bg-card/90 font-medium backdrop-blur ${botao}`}
        title={cheia ? 'Sair da tela cheia (Esc)' : 'Expandir o escritório para a tela inteira'} aria-pressed={!!cheia}>
        {cheia ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}{cheia ? 'Reduzir' : 'Expandir'}
      </button>
      <div className="absolute right-3 top-3 flex overflow-hidden rounded-lg border border-border bg-card/90 backdrop-blur" role="group" aria-label="Iluminação">
        {[['agora', Clock, 'Agora'], ['dia', Sun, 'Dia'], ['noite', Moon, 'Noite']].map(([k, I, r], i) => (
          <button key={k} onClick={() => setHora(k)} className={`${botao} ${i ? 'border-l border-border' : ''} ${hora === k ? 'bg-black/5 font-medium dark:bg-white/10' : ''}`} title={k === 'agora' ? 'Luz da hora real (Brasília)' : `Simular ${r.toLowerCase()}`}><I className="h-3.5 w-3.5" />{r}</button>
        ))}
      </div>
      {comPredio && !compacto && !controle && (
        <div className="absolute left-3 top-14 z-[5] w-[min(260px,calc(100%-24px))] rounded-lg border border-border bg-card/90 text-xs backdrop-blur">
          <button onClick={() => setVerPrevisao((v) => !v)} className="flex w-full items-center justify-between gap-2 px-2.5 py-1.5 text-left" aria-expanded={verPrevisao}>
            <span className="flex items-center gap-1.5 font-medium"><CloudRain className="h-3.5 w-3.5" />{clima ? `${clima.cidade || 'Tempo'} · ${Math.round(clima.temperatura)}°, ${clima.condicao}` : 'Previsão do tempo'}</span>
            <span className="text-muted-foreground">{verPrevisao ? 'ocultar' : 'ver'}</span>
          </button>
          {verPrevisao && (
            <div className="border-t border-border px-2.5 pb-2 pt-1.5">
              {clima ? <>
                <div className="flex gap-2 overflow-x-auto pb-1">
                  {(clima.proximas || []).slice(0, 6).map((h) => (
                    <div key={h.hora} className="shrink-0 text-center"><p className="text-muted-foreground">{h.hora}</p><p className="font-medium tabular">{Math.round(h.temperatura)}°</p><p className={`tabular ${h.chuva >= 60 ? 'text-blue-600 dark:text-blue-400' : 'text-muted-foreground'}`}>{h.chuva ?? 0}%</p></div>
                  ))}
                </div>
                <ul className="mt-1 space-y-0.5">
                  {(clima.dias || []).map((d) => <li key={d.data} className="flex justify-between gap-2"><span>{new Date(`${d.data}T12:00`).toLocaleDateString('pt-BR', { weekday: 'short', day: 'numeric' })} · {d.condicao}</span><span className="tabular text-muted-foreground">{Math.round(d.min)}°/{Math.round(d.max)}° · {d.chuva ?? 0}%</span></li>)}
                </ul>
              </> : <p className="text-muted-foreground">Buscando a previsão…</p>}
              <div className="mt-2 flex flex-wrap gap-1" role="group" aria-label="Tempo no 3D">
                {[['agora', 'Agora'], ['limpo', 'Sol'], ['nublado', 'Nublado'], ['chuva', 'Chuva'], ['trovoada', 'Trovoada']].map(([k, rot]) => (
                  <button key={k} onClick={() => setTempoVista(k)} className={`rounded-md border px-1.5 py-0.5 ${tempoVista === k ? 'border-primary bg-primary/10 font-medium' : 'border-border text-muted-foreground hover:bg-muted'}`}>{rot}</button>
                ))}
              </div>
              <p className="mt-1.5 text-[10px] text-muted-foreground">Previsão real (Open-Meteo). Pessoas, carros, animais e o terminal são ilustração.</p>
            </div>
          )}
        </div>
      )}
      <div className="absolute bottom-3 right-3 flex overflow-hidden rounded-lg border border-border bg-card/90 backdrop-blur">
        {comPredio && <button onClick={() => setAberto((v) => !v)} className={`${botao} border-r border-border font-medium`} title={aberto ? 'Fechar e ver o prédio por fora' : 'Abrir o andar do escritório'}>{aberto ? <Building2 className="h-3.5 w-3.5" /> : <DoorOpen className="h-3.5 w-3.5" />}{aberto ? 'Ver prédio' : 'Abrir andar'}</button>}
        <button onClick={() => estado.current.enquadrar?.(false)} className={botao} title="Vista inicial"><RotateCcw className="h-3.5 w-3.5" />Inicial</button>
        <button onClick={() => estado.current.enquadrar?.(true)} className={`${botao} border-l border-border`} title="Ver de cima"><Eye className="h-3.5 w-3.5" />De cima</button>
        {comPredio && <button onClick={() => setIlha(true)} className={`${botao} border-l border-border`} title="Ver a Ilha de Santa Catarina de cima"><MapPinned className="h-3.5 w-3.5" />Ilha</button>}
        <button onClick={() => setParedesAltas((v) => !v)} className={`${botao} border-l border-border`} title="Altura das paredes">{paredesAltas ? <Box className="h-3.5 w-3.5" /> : <Building2 className="h-3.5 w-3.5" />}{paredesAltas ? 'Paredes baixas' : 'Paredes altas'}</button>
        <button onClick={() => setGirando((g) => !g)} className={`${botao} border-l border-border`} title={girando ? 'Parar' : 'Girar'}>{girando ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}{girando ? 'Parar' : 'Girar'}</button>
      </div>
      {acoes && perm.admin && !controle && aberto && (
        <button onClick={() => { setEscrevendo((v) => !v); setCartao(null); setRascunhoEsc(null) }} className={`absolute left-3 top-14 flex overflow-hidden rounded-lg border border-border font-medium backdrop-blur ${botao} ${escrevendo ? 'bg-primary text-primary-foreground hover:bg-primary/90' : 'bg-card/90'}`}
          title="Escrever com caneta nos vidros" aria-pressed={escrevendo}><PenLine className="h-3.5 w-3.5" />{escrevendo ? 'Parar de escrever' : 'Escrever no vidro'}</button>
      )}
      {escrevendo && !rascunhoEsc && <p className="pointer-events-none absolute left-1/2 top-3 z-10 -translate-x-1/2 whitespace-nowrap rounded-md bg-black/55 px-2.5 py-1.5 text-xs text-white">Clique numa parede de vidro para escrever, ou numa escrita para mudar</p>}
      {acoes && <CartaoMapa mapa={mapa} projetos={projetos} cartao={cartao} fechar={() => setCartao(null)} acoes={{ ...acoes, editarEscrita: (es) => { setCartao(null); setRascunhoEsc({ ...es }) } }} perm={perm} ocupado={ocupado} executar={executar}
        controlar={(info, modo) => { setCartao(null); setEscrevendo(false); estado.current.iniciarControle?.(info, modo) }} />}
      {acoes && <RascunhoEscrita mapa={mapa} rascunho={rascunhoEsc} setRascunho={setRascunhoEsc} acoes={acoes} ocupado={ocupado} executar={executar} />}
      {controle && <MiniMapa estado={estado} />}
      {online.length > 1 && (
        <p className="pointer-events-none absolute right-3 top-14 z-10 max-w-[60%] truncate rounded-md bg-violet-600/90 px-2 py-1 text-[11px] font-medium text-white" title={online.join(', ')}>
          No mapa agora: {online.join(', ')}
        </p>
      )}
      {controle?.dirigindo && <PainelCarro estado={estado} propulsores={() => estado.current.propulsores?.()} tecla={(k, on) => { const t = estado.current.ctrl?.teclas; if (t) { if (on) t.add(k); else t.delete(k) } }} />}
      <BarraControle controle={controle} carro={() => estado.current.alternarCarro?.()} camCarro={() => estado.current.camCarro?.()} propulsores={() => estado.current.propulsores?.()} nome={controle?.info?.tipo === 'pessoa' ? ((mapa.pessoas || []).find((p) => p.id === controle.info.id)?.nome || 'Pessoa') : 'Pessoa sem cadastro'}
        mudarModo={(m) => estado.current.mudarModo?.(m)} sair={() => estado.current.pararControle?.()} sentar={() => estado.current.sentar?.()} cafe={() => estado.current.cafe?.()}
        elevador={() => estado.current.irElevador?.()} andar={Number.isFinite(+mapa.andar) ? +mapa.andar : 9} tecla={(k, on) => { const t = estado.current.ctrl?.teclas; if (t) { if (on) t.add(k); else t.delete(k) } }} />
      {extra}
      <p className={`pointer-events-none absolute bottom-3 left-4 text-[11px] text-muted-foreground ${compacto || controle ? 'hidden' : ''}`}>{comPredio && !aberto ? 'Clique no prédio para abrir o andar do escritório' : 'Arraste para girar · role para aproximar · clique numa sala ou num ar para ir até ele'}</p>
    </div>
  )
}
