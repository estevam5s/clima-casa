import * as THREE from 'three'

// Lugares conhecidos na Terra (coordenadas reais), com um alfinete e nome. A Muralha da China entra como linha com o
// traçado aproximado da muralha Ming (de Shanhaiguan a Jiayuguan): ela NÃO é visível a olho nu do espaço; aqui ela é
// desenhada para você achar onde fica.
export const MARCOS = [
  ['muralha', 'Muralha da China', 40.36, 116.02, 'Traçado aproximado da muralha Ming, ~8.850 km. Não é visível a olho nu da órbita.'],
  ['gize', 'Pirâmides de Gizé', 29.979, 31.134, 'Egito · c. 2560 a.C.'],
  ['cristo', 'Cristo Redentor', -22.952, -43.211, 'Rio de Janeiro'],
  ['hercilio', 'Ponte Hercílio Luz', -27.594, -48.565, 'Florianópolis · aqui perto do escritório'],
  ['itaipu', 'Usina de Itaipu', -25.408, -54.589, 'Brasil/Paraguai'],
  ['amazonia', 'Floresta Amazônica', -3.465, -62.215, 'Maior floresta tropical do planeta'],
  ['eiffel', 'Torre Eiffel', 48.858, 2.294, 'Paris'],
  ['liberdade', 'Estátua da Liberdade', 40.689, -74.044, 'Nova York'],
  ['taj', 'Taj Mahal', 27.175, 78.042, 'Agra, Índia'],
  ['machu', 'Machu Picchu', -13.163, -72.545, 'Peru'],
  ['opera', 'Ópera de Sydney', -33.857, 151.215, 'Austrália'],
  ['burj', 'Burj Khalifa', 25.197, 55.274, 'Dubai · 828 m'],
  ['everest', 'Monte Everest', 27.988, 86.925, '8.849 m'],
  ['panama', 'Canal do Panamá', 9.08, -79.68, 'Liga o Atlântico ao Pacífico'],
  ['kennedy', 'Centro Espacial Kennedy', 28.573, -80.649, 'Flórida'],
  ['starbase', 'Base de lançamentos em Boca Chica', 25.997, -97.155, 'Texas'],
  ['baikonur', 'Cosmódromo de Baikonur', 45.965, 63.305, 'Cazaquistão'],
  ['alcantara', 'Centro de Lançamento de Alcântara', -2.373, -44.396, 'Maranhão'],
  ['kourou', 'Centro Espacial de Kourou', 5.239, -52.768, 'Guiana Francesa'],
  ['sahara', 'Deserto do Saara', 23.4, 13.0, 'Maior deserto quente'],
]
const MURALHA = [[40.0, 119.75], [40.15, 119.6], [40.43, 118.2], [40.68, 117.24], [40.43, 116.56], [40.36, 116.02], [40.29, 116.07], [40.6, 115.4],
  [40.9, 114.9], [40.6, 114.0], [40.3, 113.3], [39.95, 112.4], [39.43, 111.5], [38.9, 110.4], [38.3, 109.7], [37.9, 108.7], [37.6, 107.6],
  [38.1, 106.9], [38.5, 106.3], [37.5, 105.2], [37.3, 104.2], [37.9, 102.6], [38.4, 101.6], [38.9, 100.5], [39.4, 99.4], [39.8, 98.2]]

export function criarMarcos(globo, vetor) {
  const grupo = new THREE.Group(); globo.add(grupo)
  const corpos = {}, descartar = []
  const geoPino = new THREE.CylinderGeometry(0.0012, 0.0012, 0.02, 6); geoPino.translate(0, 0.01, 0)
  const geoCabeca = new THREE.SphereGeometry(0.0045, 12, 8)
  const matPino = new THREE.MeshBasicMaterial({ color: 0xf8fafc }), matCab = new THREE.MeshBasicMaterial({ color: 0xf59e0b })
  descartar.push(geoPino, geoCabeca, matPino, matCab)
  const y = new THREE.Vector3(0, 1, 0)
  for (const [k, nome, lat, lon, texto] of MARCOS) {
    const p = vetor(lat, lon, 1.0005)
    const g = new THREE.Group(); g.position.copy(p); g.quaternion.setFromUnitVectors(y, p.clone().normalize())
    const pino = new THREE.Mesh(geoPino, matPino), cab = new THREE.Mesh(geoCabeca, matCab); cab.position.y = 0.02
    g.add(pino, cab); grupo.add(g)
    corpos[`lugar:${k}`] = { obj: g, alvo: cab, raio: 0.01, nome, distancia: texto, superficie: true }
  }
  // muralha: linha grossa (tubo) colada na superfície
  const pts = []
  for (let i = 0; i < MURALHA.length - 1; i++) {
    const [a1, o1] = MURALHA[i], [a2, o2] = MURALHA[i + 1]
    for (let t = 0; t < 1; t += 0.2) pts.push(vetor(a1 + (a2 - a1) * t, o1 + (o2 - o1) * t, 1.0012))
  }
  pts.push(vetor(...MURALHA[MURALHA.length - 1], 1.0012))
  const tubo = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 300, 0.0011, 5, false), new THREE.MeshBasicMaterial({ color: 0xfbbf24 }))
  grupo.add(tubo); descartar.push(tubo.geometry, tubo.material)
  return { grupo, corpos, descartar: () => descartar.forEach((d) => d.dispose()) }
}
