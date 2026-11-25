import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { Download, RotateCcw } from 'lucide-react'

// Placas Arduino/ESP em 3D, montadas por código com as medidas reais (mm) de cada uma: placa de circuito com serigrafia,
// microcontrolador, módulo Wi-Fi com blindagem e antena, conectores USB, barras de pinos, botões, LEDs. Gira com o mouse
// e baixa em .glb (abre no Blender: Arquivo → Importar → glTF 2.0). É um modelo ilustrativo da placa, sem logotipos.
const VERDE_ARDUINO = '#0a7e8c', PRETO = '#151a1f'

// x/y em mm a partir do canto superior esquerdo da placa (vista de cima, USB à esquerda)
const MODELOS = {
  uno_r4_wifi: { w: 68.6, h: 53.4, cor: VERDE_ARDUINO, nome: 'UNO R4 WiFi', furos: [[14, 2.5], [15.3, 50.7], [66.1, 7.6], [66.1, 35.5]], comps: [
    ['usbc', -1.5, 8, { lado: 'esq' }], ['jack', -1.8, 40], ['chip', 32, 30, { w: 10, h: 10, t: 1.4, txt: 'RA4M1' }],
    ['modulo', 46, 18, { w: 13.2, h: 16.6, antena: 4, txt: 'ESP32-S3' }], ['matriz', 19, 16, { col: 12, lin: 8 }],
    ['headerF', 18, 1.2, { n: 10 }], ['headerF', 44, 1.2, { n: 8 }], ['headerF', 27, 50.8, { n: 8 }], ['headerF', 50, 50.8, { n: 6 }],
    ['icsp', 62, 27], ['botao', 6, 3, { cor: '#d9d9d9' }], ['qwiic', 4, 22], ['led', 26, 10, { cor: '#22c55e' }], ['led', 26, 12.5, { cor: '#f59e0b' }], ['capacitor', 10, 45], ['capacitor', 14, 45],
    ['regulador', 6, 32]] },
  giga_r1_wifi: { w: 101.6, h: 53.3, cor: PRETO, nome: 'GIGA R1 WiFi', furos: [[14, 2.5], [15.3, 50.7], [66.1, 7.6], [66.1, 35.5], [96.5, 2.5], [90.2, 50.7]], comps: [
    ['usbc', -1.5, 8, { lado: 'esq' }], ['usba', -3, 22], ['jack', -1.8, 41], ['bga', 38, 22, { w: 14, txt: 'STM32H747' }],
    ['modulo', 58, 22, { w: 9, h: 11, antena: 0, txt: '1DX' }], ['ufl', 70, 25], ['audio', 2, 32], ['camera', 52, 40],
    ['headerF', 18, 1.2, { n: 10 }], ['headerF', 44, 1.2, { n: 8 }], ['headerF', 68, 1.2, { n: 8 }], ['headerF', 27, 50.8, { n: 8 }], ['headerF', 50, 50.8, { n: 8 }], ['headerF', 72, 50.8, { n: 8 }],
    ['headerF2', 94, 8, { n: 18 }], ['botao', 8, 2, { cor: '#d9d9d9' }], ['botao', 14, 2, { cor: '#3b82f6' }], ['led', 30, 8, { cor: '#ef4444' }], ['ram', 24, 30]] },
  opta_wifi: { caixa: true, nome: 'Opta WiFi' },
  portenta_h7: { w: 66.04, h: 25.4, cor: PRETO, nome: 'Portenta H7', castelado: true, furos: [], comps: [
    ['usbc', -1.5, 12.7, { lado: 'esq' }], ['bga', 24, 12.7, { w: 12, txt: 'STM32H747' }], ['modulo', 44, 12.7, { w: 9, h: 11, antena: 0, txt: '1DX' }],
    ['ufl', 58, 6], ['ram', 32, 4], ['led', 10, 4, { cor: '#ffffff' }], ['botao', 10, 21, { cor: '#d9d9d9' }], ['bateria', 60, 18]] },
  nano_33_iot: { w: 45, h: 18, cor: VERDE_ARDUINO, nome: 'NANO 33 IoT', furos: [[1.6, 1.6], [43.4, 1.6], [1.6, 16.4], [43.4, 16.4]], comps: [
    ['microusb', -1.2, 9], ['chip', 18, 9, { w: 7, h: 7, t: 1, txt: 'SAMD21' }], ['modulo', 33, 9, { w: 10, h: 14, antena: 3.5, txt: 'NINA-W102', escudo: '#c9ced3' }],
    ['headerM', 7, 1.27, { n: 15 }], ['headerM', 7, 16.73, { n: 15 }], ['botao', 25, 9, { cor: '#e5e7eb', mini: true }], ['led', 10, 5, { cor: '#22c55e' }], ['led', 10, 13, { cor: '#f59e0b' }]] },
  mkr_wifi_1010: { w: 61.5, h: 25, cor: VERDE_ARDUINO, nome: 'MKR WiFi 1010', furos: [[2.5, 2.5], [59, 2.5], [2.5, 22.5], [59, 22.5]], comps: [
    ['microusb', -1.2, 12.5], ['chip', 22, 12.5, { w: 7, h: 7, t: 1, txt: 'SAMD21' }], ['modulo', 44, 12.5, { w: 10, h: 14, antena: 3.5, txt: 'NINA-W102', escudo: '#c9ced3' }],
    ['headerF', 8, 1.3, { n: 14 }], ['headerF', 8, 23.7, { n: 14 }], ['jst', 4, 4], ['botao', 12, 20, { cor: '#e5e7eb', mini: true }], ['led', 12, 6, { cor: '#22c55e' }]] },
  nano_esp32: { w: 45, h: 18, cor: VERDE_ARDUINO, nome: 'NANO ESP32', furos: [[1.6, 1.6], [43.4, 1.6], [1.6, 16.4], [43.4, 16.4]], comps: [
    ['usbc', -1.5, 9, { lado: 'esq' }], ['modulo', 30, 9, { w: 10.4, h: 14.3, antena: 4, txt: 'NORA-W106', escudo: '#c9ced3' }],
    ['headerM', 7, 1.27, { n: 15 }], ['headerM', 7, 16.73, { n: 15 }], ['botao', 14, 9, { cor: '#e5e7eb', mini: true }], ['led', 18, 5, { cor: '#3b82f6' }], ['led', 18, 13, { cor: '#22c55e' }], ['regulador', 12, 13]] },
  esp32: { w: 54.4, h: 27.9, cor: PRETO, nome: 'ESP32-DevKitC', furos: [], comps: [
    ['microusb', -1.2, 13.95], ['modulo', 40, 13.95, { w: 18, h: 25.5, antena: 6, txt: 'ESP32-WROOM-32', escudo: '#c9ced3', vertical: true }],
    ['chip', 12, 13.95, { w: 5, h: 5, t: 1, txt: 'CP2102' }], ['regulador', 8, 6], ['headerM', 4, 1.3, { n: 19 }], ['headerM', 4, 26.6, { n: 19 }],
    ['botao', 6, 22, { cor: '#1f2937', txt: 'EN' }], ['botao', 18, 22, { cor: '#1f2937', txt: 'BOOT' }], ['led', 22, 6, { cor: '#ef4444' }]] },
  esp8266: { w: 49, h: 26, cor: PRETO, nome: 'NodeMCU ESP8266', furos: [[2, 2], [47, 2], [2, 24], [47, 24]], comps: [
    ['microusb', -1.2, 13], ['modulo', 36, 13, { w: 16, h: 24, antena: 6, txt: 'ESP-12E', escudo: '#c9ced3', vertical: true }],
    ['chip', 13, 13, { w: 6, h: 4, t: 1.2, txt: 'CH340' }], ['regulador', 8, 6], ['headerM', 4, 1.3, { n: 15 }], ['headerM', 4, 24.7, { n: 15 }],
    ['botao', 6, 21, { cor: '#1f2937', txt: 'RST' }], ['botao', 18, 21, { cor: '#1f2937', txt: 'FLASH' }]] },
}

const mat = (cor, o = {}) => new THREE.MeshStandardMaterial({ color: cor, roughness: 0.55, metalness: 0, ...o })
const OURO = () => mat('#d8b24a', { metalness: 0.45, roughness: 0.35 })   // metal alto sem mapa de ambiente sai preto
const PRATA = () => mat('#d7dbe0', { metalness: 0.45, roughness: 0.3 })

function texturaPlaca(m) {
  const px = 12, c = document.createElement('canvas')
  c.width = Math.round(m.w * px); c.height = Math.round(m.h * px)
  const g = c.getContext('2d')
  g.fillStyle = m.cor; g.fillRect(0, 0, c.width, c.height)
  // trilhas (cobre sob a máscara: um pouco mais claro)
  const r = (() => { let s = 7; return () => (s = (s * 9301 + 49297) % 233280) / 233280 })()
  g.strokeStyle = 'rgba(255,255,255,0.07)'; g.lineWidth = 0.35 * px
  for (let i = 0; i < 60; i++) {
    let x = r() * c.width, y = r() * c.height
    g.beginPath(); g.moveTo(x, y)
    for (let k = 0; k < 3; k++) { if (r() > 0.5) x += (r() - 0.5) * c.width * 0.4; else y += (r() - 0.5) * c.height * 0.4; g.lineTo(x, y) }
    g.stroke()
  }
  g.fillStyle = 'rgba(255,255,255,0.08)'
  for (let i = 0; i < 140; i++) { g.beginPath(); g.arc(r() * c.width, r() * c.height, 0.35 * px, 0, Math.PI * 2); g.fill() }
  // serigrafia
  g.fillStyle = '#f5f5f5'; g.font = `600 ${3.2 * px}px ui-sans-serif, system-ui`; g.textBaseline = 'alphabetic'
  g.fillText(m.nome, 4 * px, c.height - 4.5 * px)
  g.font = `${1.4 * px}px ui-monospace, monospace`; g.fillStyle = 'rgba(245,245,245,0.85)'
  g.strokeStyle = 'rgba(245,245,245,0.8)'; g.lineWidth = 0.2 * px
  g.strokeRect(0.8 * px, 0.8 * px, c.width - 1.6 * px, c.height - 1.6 * px)
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4
  return t
}

function etiqueta(txt, w, h, fundo = '#1b1b1f', cor = '#d4d4d8') {
  const c = document.createElement('canvas'); c.width = 256; c.height = Math.max(32, Math.round((256 * h) / w))
  const g = c.getContext('2d'); g.fillStyle = fundo; g.fillRect(0, 0, c.width, c.height)
  g.fillStyle = cor; g.font = `600 ${Math.min(c.height * 0.28, 34)}px ui-monospace, monospace`; g.textAlign = 'center'; g.textBaseline = 'middle'
  g.fillText(txt || '', c.width / 2, c.height / 2)
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace
  return t
}

// cada peça recebe (x, y) em mm na placa e devolve um Group com a base em y = 0 (face de cima da placa)
function peca(tipo, o = {}) {
  const g = new THREE.Group()
  const caixa = (w, h, d, m, y = 0) => { const k = new THREE.Mesh(new THREE.BoxGeometry(w, d, h), m); k.position.y = y + d / 2; k.castShadow = true; g.add(k); return k }
  if (tipo === 'chip' || tipo === 'bga' || tipo === 'ram' || tipo === 'regulador') {
    const w = o.w || (tipo === 'ram' ? 8 : tipo === 'regulador' ? 6.5 : 7), h = o.h || (tipo === 'ram' ? 6 : tipo === 'regulador' ? 3.5 : w), t = o.t || (tipo === 'bga' ? 1.6 : 1.1)
    const topo = new THREE.MeshStandardMaterial({ map: etiqueta(o.txt || '', w, h, '#17171b', '#a1a1aa'), roughness: 0.6 })
    const corpo = new THREE.Mesh(new THREE.BoxGeometry(w, t, h), [mat('#1b1b1f'), mat('#1b1b1f'), topo, mat('#1b1b1f'), mat('#1b1b1f'), mat('#1b1b1f')])
    corpo.position.y = t / 2 + 0.15; corpo.castShadow = true; g.add(corpo)
    if (tipo === 'chip') {   // terminais nos 4 lados
      const n = Math.max(4, Math.round(w / 0.8)), pin = OURO()
      for (let s = 0; s < 4; s++) for (let i = 0; i < n; i++) {
        const p = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.15, 0.9), pin)
        const u = -w / 2 + (i + 0.5) * (w / n)
        if (s < 2) { p.position.set(u, 0.1, (s ? 1 : -1) * (h / 2 + 0.35)) } else { p.rotation.y = Math.PI / 2; p.position.set((s === 2 ? 1 : -1) * (w / 2 + 0.35), 0.1, u * (h / w)) }
        g.add(p)
      }
    }
    if (tipo === 'regulador') { const aba = caixa(w * 0.9, 1.5, 0.3, PRATA()); aba.position.z = -h / 2 - 0.6 }
  } else if (tipo === 'modulo') {
    const w = o.w || 13, h = o.h || 16, ant = o.antena || 0
    const base = new THREE.Mesh(new THREE.BoxGeometry(w, 0.8, h), mat('#1f3a2a')); base.position.y = 0.4; g.add(base)
    const lb = o.vertical ? h - ant : h
    const escudo = new THREE.Mesh(new RoundedBoxGeometry(w - 0.8, 2.2, lb - 0.8, 2, 0.3), new THREE.MeshStandardMaterial({ color: '#ffffff', metalness: 0.4, roughness: 0.35, map: etiqueta(o.txt, w, lb, '#cfd3d8', '#3f3f46') }))
    escudo.position.set(0, 0.8 + 1.1, o.vertical ? ant / 2 : 0); escudo.castShadow = true; g.add(escudo)
    if (ant) {   // antena de trilha impressa (zigue-zague dourado na ponta do módulo)
      const pin = OURO()
      for (let i = 0; i < 6; i++) { const l = new THREE.Mesh(new THREE.BoxGeometry(w * 0.8, 0.06, 0.35), pin); l.position.set(0, 0.83, (o.vertical ? -h / 2 + 0.8 : h / 2 - 0.8) + (o.vertical ? 1 : -1) * i * (ant / 7)); g.add(l) }
    }
  } else if (tipo === 'usbc' || tipo === 'microusb' || tipo === 'usba') {
    const [w, d, h] = tipo === 'usbc' ? [8.9, 3.2, 7.4] : tipo === 'microusb' ? [7.5, 2.6, 5.4] : [13.2, 5.8, 14]
    const k = new THREE.Mesh(new RoundedBoxGeometry(h, d, w, 2, tipo === 'usbc' ? 1.2 : 0.4), PRATA()); k.position.set(h / 2 - 1.5, d / 2, 0); k.castShadow = true; g.add(k)
    const boca = new THREE.Mesh(new THREE.BoxGeometry(0.3, d * 0.55, w * 0.7), mat('#09090b')); boca.position.set(-1.62, d / 2, 0); g.add(boca)
  } else if (tipo === 'jack') {
    caixa(14, 9, 11, mat('#111113'))
    const f = new THREE.Mesh(new THREE.CylinderGeometry(3.2, 3.2, 0.5, 24), mat('#050505')); f.rotation.z = Math.PI / 2; f.position.set(-7.1, 6, 0); g.add(f)
  } else if (tipo === 'audio') {
    const k = new THREE.Mesh(new THREE.CylinderGeometry(3, 3, 12, 24), mat('#111113')); k.rotation.z = Math.PI / 2; k.position.set(4, 3, 0); g.add(k)
  } else if (tipo === 'headerF' || tipo === 'headerF2' || tipo === 'icsp') {
    const n = o.n || 3, filas = tipo === 'headerF' ? 1 : 2, passo = 2.54
    const comp = tipo === 'icsp' ? 2 : n
    const corpo = new THREE.Mesh(new THREE.BoxGeometry(tipo === 'headerF2' ? filas * passo : comp * passo, tipo === 'icsp' ? 0.1 : 8.5, tipo === 'headerF2' ? n * passo : (tipo === 'icsp' ? 3 : filas) * passo), mat('#0b0b0d'))
    corpo.position.y = tipo === 'icsp' ? 0.05 : 4.25; corpo.castShadow = true; g.add(corpo)
    const buraco = mat('#000000')
    for (let i = 0; i < (tipo === 'icsp' ? 6 : n * filas); i++) {
      if (tipo === 'icsp') { const p = new THREE.Mesh(new THREE.BoxGeometry(0.64, 6, 0.64), OURO()); p.position.set(((i % 2) - 0.5) * passo, 3, (Math.floor(i / 2) - 1) * passo); g.add(p); continue }
      const b = new THREE.Mesh(new THREE.BoxGeometry(1, 0.1, 1), buraco)
      const a = (i % n) - (n - 1) / 2, f = Math.floor(i / n) - (filas - 1) / 2
      if (tipo === 'headerF2') b.position.set(f * passo, 8.52, a * passo); else b.position.set(a * passo, 8.52, f * passo)
      g.add(b)
    }
  } else if (tipo === 'headerM') {
    const n = o.n || 15, passo = 2.54, pin = OURO()
    for (let i = 0; i < n; i++) {
      const x = (i - (n - 1) / 2) * passo
      const pad = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.85, 0.08, 16), pin); pad.position.set(x, 0.04, 0); g.add(pad)
      const p = new THREE.Mesh(new THREE.BoxGeometry(0.64, 9, 0.64), pin); p.position.set(x, -4.5 - 1.6, 0); g.add(p)
    }
    const espac = new THREE.Mesh(new THREE.BoxGeometry(n * passo, 2.5, 2.5), mat('#0b0b0d')); espac.position.y = -1.6 - 1.25; g.add(espac)
  } else if (tipo === 'botao') {
    caixa(o.mini ? 3 : 6, o.mini ? 2.5 : 6, o.mini ? 1 : 3.4, PRATA())
    const b = new THREE.Mesh(new THREE.CylinderGeometry(o.mini ? 0.8 : 1.75, o.mini ? 0.8 : 1.75, 1, 20), mat(o.cor || '#d9d9d9')); b.position.y = (o.mini ? 1 : 3.4) + 0.5; g.add(b)
  } else if (tipo === 'led') {
    const k = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.6, 0.8), new THREE.MeshStandardMaterial({ color: o.cor, emissive: o.cor, emissiveIntensity: 0.9, transparent: true, opacity: 0.9 })); k.position.y = 0.3; g.add(k)
  } else if (tipo === 'matriz') {
    const em = new THREE.MeshStandardMaterial({ color: '#ff2d2d', emissive: '#ff1a1a', emissiveIntensity: 0.6 })
    for (let i = 0; i < o.col; i++) for (let j = 0; j < o.lin; j++) {
      const k = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.4, 0.55), (i * 3 + j * 5) % 7 < 3 ? em : mat('#f1d7c8')); k.position.set((i - (o.col - 1) / 2) * 2.2, 0.2, (j - (o.lin - 1) / 2) * 2.2); g.add(k)
    }
  } else if (tipo === 'qwiic' || tipo === 'jst') {
    caixa(tipo === 'qwiic' ? 6 : 8, 4.5, 3.4, mat('#f5f5f4'))
  } else if (tipo === 'ufl') {
    const k = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1.2, 20), PRATA()); k.position.y = 0.6; g.add(k)
  } else if (tipo === 'camera') {
    caixa(20, 3, 1.4, mat('#e7e5e4'))
  } else if (tipo === 'capacitor') {
    const k = new THREE.Mesh(new THREE.CylinderGeometry(2.5, 2.5, 7, 24), mat('#1e3a8a')); k.position.y = 3.5; g.add(k)
    const tampa = new THREE.Mesh(new THREE.CylinderGeometry(2.45, 2.45, 0.1, 24), PRATA()); tampa.position.y = 7.02; g.add(tampa)
  } else if (tipo === 'bateria') {
    caixa(5, 3, 1.6, mat('#f5f5f4'))
  }
  return g
}

function montarCaixaOpta() {
  // Opta: caixa para trilho DIN (70 × 90 × 65 mm), bornes verdes em cima e embaixo, LEDs dos 4 relés
  const g = new THREE.Group()
  const corpo = new THREE.Mesh(new RoundedBoxGeometry(70, 65, 90, 4, 3), mat('#e7e5e4', { roughness: 0.7 })); corpo.position.y = 32.5; corpo.castShadow = true; g.add(corpo)
  const frente = new THREE.Mesh(new RoundedBoxGeometry(50, 12, 70, 3, 2), mat('#d6d3d1')); frente.position.y = 69; g.add(frente)
  const tela = new THREE.Mesh(new THREE.PlaneGeometry(40, 60), new THREE.MeshStandardMaterial({ map: etiqueta('OPTA WiFi', 40, 60, '#f5f5f4', '#0a7e8c') }))
  tela.rotation.x = -Math.PI / 2; tela.position.y = 75.05; g.add(tela)
  for (const z of [-40, 40]) for (let i = 0; i < 8; i++) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(7, 10, 8), mat('#15803d')); b.position.set(-26 + i * 7.5, 70, z); g.add(b)
    const p = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.6, 0.5, 12), PRATA()); p.position.set(-26 + i * 7.5, 75.3, z); g.add(p)
  }
  for (let i = 0; i < 4; i++) { const l = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.6, 2.4), new THREE.MeshStandardMaterial({ color: '#22c55e', emissive: '#22c55e', emissiveIntensity: 0.8 })); l.position.set(-12 + i * 8, 75.3, 20); g.add(l) }
  const usb = new THREE.Mesh(new RoundedBoxGeometry(8.9, 3.2, 7.4, 2, 1.2), PRATA()); usb.position.set(0, 75, -20); g.add(usb)
  const trilho = new THREE.Mesh(new THREE.BoxGeometry(110, 7.5, 35), PRATA()); trilho.position.y = -3.75; g.add(trilho)
  return g
}

function montar(id) {
  const m = MODELOS[id]
  const raiz = new THREE.Group()
  if (!m) return raiz
  if (m.caixa) { raiz.add(montarCaixaOpta()); raiz.scale.setScalar(0.01); return raiz }
  const esp = 1.6
  const placa = new THREE.Mesh(new RoundedBoxGeometry(m.w, esp, m.h, 3, 0.6), mat(m.cor))
  placa.position.y = -esp / 2; placa.receiveShadow = true; placa.castShadow = true
  raiz.add(placa)
  // a RoundedBox não aceita material por face: a serigrafia vai num plano rente à face de cima
  const topo = new THREE.Mesh(new THREE.PlaneGeometry(m.w - 0.4, m.h - 0.4), new THREE.MeshStandardMaterial({ map: texturaPlaca(m), roughness: 0.42 }))
  topo.rotation.x = -Math.PI / 2; topo.position.y = 0.01; raiz.add(topo)
  const X = (x) => x - m.w / 2, Z = (y) => y - m.h / 2
  for (const [fx, fy] of m.furos || []) {
    const anel = new THREE.Mesh(new THREE.RingGeometry(1.6, 2.6, 24), OURO()); anel.rotation.x = -Math.PI / 2; anel.position.set(X(fx), 0.02, Z(fy)); raiz.add(anel)
    const f = new THREE.Mesh(new THREE.CircleGeometry(1.6, 24), mat('#050505')); f.rotation.x = -Math.PI / 2; f.position.set(X(fx), 0.03, Z(fy)); raiz.add(f)
  }
  if (m.castelado) for (const z of [-m.h / 2, m.h / 2]) for (let i = 0; i < 26; i++) {
    const c = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, esp + 0.05, 10, 1, false, 0, Math.PI), OURO()); c.position.set(-m.w / 2 + 4 + i * 2.3, -esp / 2, z); c.rotation.y = z > 0 ? Math.PI : 0; raiz.add(c)
  }
  for (const [tipo, x, y, o] of m.comps) { const p = peca(tipo, o || {}); p.position.set(X(x), 0, Z(y)); if (o?.vertical && tipo === 'modulo') p.rotation.y = Math.PI / 2; raiz.add(p) }
  raiz.scale.setScalar(0.01)   // mm → unidades da cena (1 = 10 cm)
  return raiz
}

export default function Placa3D({ placaId, nome }) {
  const ref = useRef(null)
  const estado = useRef(null)
  const [baixando, setBaixando] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el) return undefined
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)); renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.shadowMap.enabled = true; renderer.toneMapping = THREE.ACESFilmicToneMapping
    el.appendChild(renderer.domElement); renderer.domElement.className = 'h-full w-full'
    const cena = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(35, 1, 0.01, 50)
    cena.add(new THREE.HemisphereLight(0xffffff, 0x404048, 1.6))
    const sol = new THREE.DirectionalLight(0xffffff, 2.2); sol.position.set(0.6, 1.4, 0.8); sol.castShadow = true; sol.shadow.mapSize.set(1024, 1024)
    Object.assign(sol.shadow.camera, { left: -1, right: 1, top: 1, bottom: -1 }); cena.add(sol)
    const chao = new THREE.Mesh(new THREE.PlaneGeometry(6, 6), new THREE.ShadowMaterial({ opacity: 0.25 })); chao.rotation.x = -Math.PI / 2; chao.position.y = -0.12; chao.receiveShadow = true; cena.add(chao)
    const modelo = montar(placaId); cena.add(modelo)
    modelo.traverse((o) => { if (o.isMesh) o.castShadow = true })
    const caixa = new THREE.Box3().setFromObject(modelo), tam = caixa.getSize(new THREE.Vector3()), centro = caixa.getCenter(new THREE.Vector3())
    const raio = Math.max(tam.x, tam.z, tam.y) * (MODELOS[placaId]?.caixa ? 1.5 : 0.9)
    const controles = new OrbitControls(camera, renderer.domElement); controles.enableDamping = true; controles.target.copy(centro)
    controles.autoRotate = !window.matchMedia('(prefers-reduced-motion: reduce)').matches; controles.autoRotateSpeed = 1.2
    controles.minDistance = raio * 0.6; controles.maxDistance = raio * 5
    const inicial = () => { camera.position.set(centro.x + raio * 0.9, centro.y + raio * 1.1, centro.z + raio * 1.4); controles.update() }
    inicial()
    const ajustar = () => { const w = el.clientWidth, h = el.clientHeight; renderer.setSize(w, h); camera.aspect = w / Math.max(1, h); camera.updateProjectionMatrix() }
    ajustar(); const ro = new ResizeObserver(ajustar); ro.observe(el)
    let q; const laco = () => { q = requestAnimationFrame(laco); if (document.hidden) return; controles.update(); renderer.render(cena, camera) }; laco()
    renderer.domElement.addEventListener('pointerdown', () => { controles.autoRotate = false })
    estado.current = { modelo, inicial: () => { controles.autoRotate = false; inicial() } }
    return () => {
      cancelAnimationFrame(q); ro.disconnect(); controles.dispose()
      cena.traverse((o) => { o.geometry?.dispose(); [].concat(o.material || []).forEach((m) => { m.map?.dispose(); m.dispose() }) })
      renderer.dispose(); renderer.domElement.remove()
    }
  }, [placaId])
  const baixar = async () => {
    setBaixando(true)
    try {
      const { GLTFExporter } = await import('three/examples/jsm/exporters/GLTFExporter.js')
      const glb = await new GLTFExporter().parseAsync(estado.current.modelo, { binary: true })
      const url = URL.createObjectURL(new Blob([glb], { type: 'model/gltf-binary' }))
      Object.assign(document.createElement('a'), { href: url, download: `placa-${placaId}.glb` }).click()
      setTimeout(() => URL.revokeObjectURL(url), 3000)
    } finally { setBaixando(false) }
  }
  return (
    <div className="relative overflow-hidden rounded-lg border border-border bg-muted/40">
      <div ref={ref} className="h-56 w-full cursor-grab active:cursor-grabbing sm:h-64" aria-label={`Modelo 3D da placa ${nome || ''}`} role="img" />
      <div className="absolute left-2 top-2 rounded-md bg-card/90 px-2 py-0.5 text-xs font-medium">{nome}</div>
      <div className="absolute bottom-2 right-2 flex gap-1">
        <button onClick={() => estado.current?.inicial()} className="inline-flex h-7 items-center gap-1 rounded-md border border-border bg-card/90 px-2 text-xs hover:bg-muted" aria-label="Voltar a vista"><RotateCcw className="h-3.5 w-3.5" /></button>
        <button onClick={baixar} disabled={baixando} className="inline-flex h-7 items-center gap-1 rounded-md border border-border bg-card/90 px-2 text-xs hover:bg-muted disabled:opacity-50"><Download className="h-3.5 w-3.5" />Baixar .glb</button>
      </div>
      <p className="absolute bottom-2 left-2 text-[10px] text-muted-foreground">Arraste para girar · role para aproximar · medidas reais</p>
    </div>
  )
}
