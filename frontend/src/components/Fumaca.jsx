import { useEffect, useRef } from 'react'

// Fumaça em WebGL (um fragment shader com ruído "domain-warped"), com um fio na cor da marca
// atravessando as plumas. O ponteiro mexe a fumaça. Fica parada com prefers-reduced-motion.
// Adaptado do componente Smoke Login (design de referência em docs/prompt/login.md).
const ESCALA = 0.4 // fumaça é toda gradiente: renderiza pequeno e o navegador amplia

const VERT = 'attribute vec2 a;void main(){gl_Position=vec4(a,0.,1.);}'
const FRAG = `
precision highp float;
uniform vec2 uRes; uniform float uTime; uniform vec2 uMouse; uniform float uDark;
float hash(vec2 p){ p = fract(p * vec2(234.34, 435.345)); p += dot(p, p + 34.23); return fract(p.x * p.y); }
float noise(vec2 p){ vec2 i = floor(p), f = fract(p), u = f * f * (3. - 2. * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y); }
float fbm(vec2 p){ float v = 0., a = .5; mat2 r = mat2(.8, .6, -.6, .8);
  for (int i = 0; i < 5; i++) { v += a * noise(p); p = r * p * 2.02 + vec2(1.7, 9.2); a *= .5; } return v; }
void main(){
  vec2 uv = gl_FragCoord.xy / uRes; float ar = uRes.x / uRes.y;
  vec2 p = vec2(uv.x * ar, uv.y) * 1.25; float t = uTime * .07;
  vec2 d = p - vec2(uMouse.x * ar, uMouse.y) * 1.25; float k = exp(-dot(d, d) * 1.6);
  p += vec2(-d.y, d.x) * k * .55;
  vec2 q = vec2(fbm(p + vec2(0., t)), fbm(p + vec2(5.2, 1.3) - t * .8));
  vec2 r = vec2(fbm(p + 3. * q + vec2(1.7, 9.2) + t * 1.2), fbm(p + 3. * q + vec2(8.3, 2.8) - t));
  float f = fbm(p + 2.6 * r + vec2(t * .4, -t * .3));
  float smoke = smoothstep(.3, .85, f); smoke *= smoke;
  float wisp = smoothstep(.55, .75, f) * (1. - smoothstep(.75, .95, f));
  float vein = (1. - smoothstep(.0, .04, abs(f - .58))) * smoothstep(.42, .62, r.y);
  vec3 marca = vec3(.16, .78, .68);
  vec3 paper = vec3(.968, .964, .949);
  vec3 lit = mix(paper, vec3(.07, .08, .08), smoke * .92);
  lit = mix(lit, vec3(.02, .46, .41), vein * .75);
  lit += (1. - smoke) * wisp * .03;
  vec3 night = mix(vec3(.04, .045, .045), vec3(.03, .035, .035), uv.y);
  vec3 drk = night + vec3(.78, .8, .79) * smoke * .62 + vec3(.9) * wisp * .08;
  drk += marca * vein * .85;
  vec3 col = mix(lit, drk, uDark);
  col += (hash(gl_FragCoord.xy + fract(t)) - .5) / 255.;
  gl_FragColor = vec4(col, 1.);
}`

export default function Fumaca({ escuro }) {
  const ref = useRef(null)
  const escuroRef = useRef(escuro ? 1 : 0)
  const redesenhar = useRef(() => {})

  useEffect(() => {
    const canvas = ref.current
    const gl = canvas?.getContext('webgl', { antialias: false, alpha: false, depth: false })
    if (!canvas || !gl) return // sem WebGL: fica a cor do papel por trás
    const shader = (tipo, src) => { const s = gl.createShader(tipo); gl.shaderSource(s, src); gl.compileShader(s); return s }
    const prog = gl.createProgram()
    gl.attachShader(prog, shader(gl.VERTEX_SHADER, VERT))
    gl.attachShader(prog, shader(gl.FRAGMENT_SHADER, FRAG))
    gl.linkProgram(prog)
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return
    gl.useProgram(prog)
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer())
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW)
    gl.enableVertexAttribArray(0)
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0)
    const uRes = gl.getUniformLocation(prog, 'uRes'), uTime = gl.getUniformLocation(prog, 'uTime')
    const uMouse = gl.getUniformLocation(prog, 'uMouse'), uDark = gl.getUniformLocation(prog, 'uDark')

    const calmo = window.matchMedia('(prefers-reduced-motion: reduce)')
    const inicio = performance.now()
    const mouse = { x: 0.7, y: 0.4, tx: 0.7, ty: 0.4 }
    let tom = escuroRef.current, tempo = 40, raf = 0, ultimo = 0
    const desenhar = () => {
      gl.uniform2f(uRes, canvas.width, canvas.height); gl.uniform1f(uTime, tempo)
      gl.uniform2f(uMouse, mouse.x, mouse.y); gl.uniform1f(uDark, tom)
      gl.drawArrays(gl.TRIANGLES, 0, 3)
    }
    const laco = (agora) => {
      raf = requestAnimationFrame(laco)
      if (agora - ultimo < 1000 / 30 - 2) return // fumaça lenta: 30 fps bastam
      const dt = Math.min((agora - ultimo) / 1000, 0.1); ultimo = agora
      tempo = 40 + (agora - inicio) / 1000
      mouse.x += (mouse.tx - mouse.x) * Math.min(1, dt * 2.2)
      mouse.y += (mouse.ty - mouse.y) * Math.min(1, dt * 2.2)
      tom += (escuroRef.current - tom) * Math.min(1, dt * 3.5)
      desenhar()
    }
    const tocar = () => { cancelAnimationFrame(raf); if (calmo.matches) desenhar(); else raf = requestAnimationFrame(laco) }
    redesenhar.current = () => { if (!calmo.matches) return; tom = escuroRef.current; desenhar() }
    const mover = (e) => { const b = canvas.getBoundingClientRect(); mouse.tx = (e.clientX - b.left) / b.width; mouse.ty = 1 - (e.clientY - b.top) / b.height }
    const ro = new ResizeObserver(() => {
      const s = Math.min(window.devicePixelRatio || 1, 2) * ESCALA
      canvas.width = Math.max(1, Math.round(canvas.clientWidth * s)); canvas.height = Math.max(1, Math.round(canvas.clientHeight * s))
      gl.viewport(0, 0, canvas.width, canvas.height); desenhar()
    })
    ro.observe(canvas)
    canvas.addEventListener('pointermove', mover)
    calmo.addEventListener('change', tocar)
    tocar()
    return () => { cancelAnimationFrame(raf); ro.disconnect(); canvas.removeEventListener('pointermove', mover); calmo.removeEventListener('change', tocar) }
  }, [])

  useEffect(() => { escuroRef.current = escuro ? 1 : 0; redesenhar.current() }, [escuro])
  return <canvas ref={ref} aria-hidden className="absolute inset-0 h-full w-full" />
}
