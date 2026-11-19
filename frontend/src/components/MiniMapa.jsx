import { useEffect, useRef } from 'react'

// Minimapa no estilo de jogo de mundo aberto: círculo no canto que gira com a pessoa (a seta do centro aponta sempre
// para a frente), norte marcado, salas com a cor do projeto, quadras e prédio na rua, pessoas por perto e o marcador do
// escritório: fora do alcance ele fica preso na borda com a distância, como um GPS. Lê a posição direto do 3D (E) a ~20 qps.
const R = 78   // raio em px

export default function MiniMapa({ estado }) {
  const ref = useRef(null)
  useEffect(() => {
    const cv = ref.current
    if (!cv) return undefined
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    cv.width = cv.height = (R * 2 + 8) * dpr
    const g = cv.getContext('2d')
    g.scale(dpr, dpr)
    const C = R + 4
    let quadro = 0, ultimo = 0
    const desenhar = (t) => {
      quadro = requestAnimationFrame(desenhar)
      if (t - ultimo < 50) return
      ultimo = t
      const E = estado.current, c = E?.ctrl
      if (!c?.av || !E.mini) return
      const P = c.av.getWorldPosition ? c.av.getWorldPosition(c.av.position.clone()) : c.av.position
      const fora = E.nivel === 'terreo'
      const esc = fora ? 1.15 : 5.5   // px por metro: na rua enxerga ~70 m; no andar ~14 m
      const yaw = c.yaw || 0
      const fx = Math.sin(yaw), fz = Math.cos(yaw), dx0 = -Math.cos(yaw), dz0 = Math.sin(yaw)   // frente e direita na tela
      const tela = (x, z) => { const dx = x - P.x, dz = z - P.z; return [C + (dx * dx0 + dz * dz0) * esc, C - (dx * fx + dz * fz) * esc] }
      const ret = (x0, z0, x1, z1) => { const a = tela(x0, z0), b = tela(x1, z0), d = tela(x1, z1), e = tela(x0, z1); g.beginPath(); g.moveTo(...a); g.lineTo(...b); g.lineTo(...d); g.lineTo(...e); g.closePath() }

      g.clearRect(0, 0, C * 2, C * 2)
      g.save()
      g.beginPath(); g.arc(C, C, R, 0, Math.PI * 2); g.clip()
      g.fillStyle = fora ? '#26313d' : '#1e2630'; g.fillRect(0, 0, C * 2, C * 2)
      if (fora && E.cidadeRuas) {   // quadras construídas (o resto é rua, calçada e praça)
        g.fillStyle = '#3c4a58'
        for (const o of E.cidadeRuas.obstaculos) { const [a] = [tela((o[0] + o[2]) / 2, (o[1] + o[3]) / 2)]; if (Math.hypot(a[0] - C, a[1] - C) < R + 40) { ret(...o); g.fill() } }
      }
      const [p0, q0, p1, q1] = E.mini.predio
      ret(p0, q0, p1, q1); g.fillStyle = fora ? '#0f766a' : '#2a3542'; g.fill(); g.strokeStyle = '#5eead4'; g.lineWidth = 1.2; g.stroke()
      if (!fora) for (const s of E.mini.salas) {
        ret(s.x0, s.z0, s.x1, s.z1); g.globalAlpha = 0.55; g.fillStyle = s.cor; g.fill(); g.globalAlpha = 1; g.strokeStyle = 'rgba(255,255,255,0.35)'; g.lineWidth = 1; g.stroke()
      }
      // pessoas por perto
      g.fillStyle = '#fbbf24'
      for (const it of E.avatares || []) {
        if (it.av === c.av || !it.av.visible) continue
        const w = it.av.getWorldPosition(it.av.position.clone())
        const [sx, sy] = tela(w.x, w.z)
        if (Math.hypot(sx - C, sy - C) < R - 3) { g.beginPath(); g.arc(sx, sy, 2.3, 0, Math.PI * 2); g.fill() }
      }
      g.restore()

      // escritório: centro do prédio; fora do alcance, preso na borda com a distância
      const cx = (p0 + p1) / 2, cz = (q0 + q1) / 2
      let [ox, oy] = tela(cx, cz)
      const dist = Math.hypot(cx - P.x, cz - P.z)
      const longe = Math.hypot(ox - C, oy - C) > R - 10
      if (longe) { const ang = Math.atan2(oy - C, ox - C); ox = C + Math.cos(ang) * (R - 10); oy = C + Math.sin(ang) * (R - 10) }
      if (fora || longe) {
        g.fillStyle = '#14b8a6'; g.strokeStyle = '#fff'; g.lineWidth = 1.5
        g.beginPath(); g.arc(ox, oy, 6.5, 0, Math.PI * 2); g.fill(); g.stroke()
        g.fillStyle = '#fff'; g.font = 'bold 8px system-ui'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('E', ox, oy + 0.5)
      }

      // borda, norte e a seta da pessoa
      g.strokeStyle = 'rgba(255,255,255,0.75)'; g.lineWidth = 2; g.beginPath(); g.arc(C, C, R, 0, Math.PI * 2); g.stroke()
      const [nx, ny] = tela(P.x, P.z - 1000)   // norte = -z no mundo
      const an = Math.atan2(ny - C, nx - C), bx = C + Math.cos(an) * R, by = C + Math.sin(an) * R
      g.fillStyle = '#ef4444'; g.beginPath(); g.arc(bx, by, 7, 0, Math.PI * 2); g.fill()
      g.fillStyle = '#fff'; g.font = 'bold 9px system-ui'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('N', bx, by + 0.5)
      g.fillStyle = '#fff'; g.strokeStyle = '#0f172a'; g.lineWidth = 1.5
      g.beginPath(); g.moveTo(C, C - 8); g.lineTo(C + 6, C + 6); g.lineTo(C, C + 3); g.lineTo(C - 6, C + 6); g.closePath(); g.fill(); g.stroke()

      const leg = ref.current?.nextSibling
      if (leg) leg.textContent = fora ? (dist < 25 ? 'Na frente do escritório' : `Escritório a ${Math.round(dist)} m`) : `${E.mini.salas.find((s) => P.x >= Math.min(s.x0, s.x1) && P.x <= Math.max(s.x0, s.x1) && P.z >= Math.min(s.z0, s.z1) && P.z <= Math.max(s.z0, s.z1))?.nome || 'Corredor'} · ${E.mini.andar || 9}º andar`
    }
    quadro = requestAnimationFrame(desenhar)
    return () => cancelAnimationFrame(quadro)
  }, [estado])
  return (
    <div className="pointer-events-none absolute bottom-16 right-3 z-10 flex flex-col items-center gap-1" aria-hidden="true">
      <canvas ref={ref} style={{ width: R * 2 + 8, height: R * 2 + 8 }} className="drop-shadow-lg" /> {/* marca: minimapa flutua sobre o 3D */}
      <span className="rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-medium text-white" />
    </div>
  )
}
