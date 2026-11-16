// Gerador de comandos de voz da Alexa. Cada modelo é uma frase com lacunas ({lacuna}); as frases são as
// combinações dos valores das lacunas. Nada é guardado em lista: o índice global vira frase na hora
// (base mista), então dá para paginar e buscar em centenas de milhares de frases sem travar.

export const ARTISTAS = ['Anitta', 'Marília Mendonça', 'Henrique e Juliano', 'Jorge e Mateus', 'Gusttavo Lima', 'Ludmilla', 'Ivete Sangalo', 'Caetano Veloso', 'Gilberto Gil', 'Djavan',
  'Roberto Carlos', 'Tim Maia', 'Elis Regina', 'Chico Buarque', 'Legião Urbana', 'Os Paralamas do Sucesso', 'Titãs', 'Skank', 'Charlie Brown Jr.', 'Capital Inicial',
  'Jota Quest', 'Ana Castela', 'Luan Santana', 'Zé Neto e Cristiano', 'Maiara e Maraisa', 'Simone Mendes', 'Pabllo Vittar', 'Iza', 'Liniker', 'Seu Jorge',
  'Marisa Monte', 'Tribalistas', 'Vitor Kley', 'Melim', 'Lagum', 'Matuê', 'L7nnon', 'MC Ryan SP', 'Racionais MCs', 'Emicida',
  'Projota', 'Natiruts', 'Armandinho', 'Thiaguinho', 'Péricles', 'Ferrugem', 'Turma do Pagode', 'Sorriso Maroto', 'Belo', 'Zeca Pagodinho',
  'Alcione', 'Paula Fernandes', 'Bruno e Marrone', 'Chitãozinho e Xororó', 'Leonardo', 'Daniel', 'Fábio Jr.', 'Lulu Santos', 'Rita Lee', 'Raul Seixas',
  'Cazuza', 'Barão Vermelho', 'Engenheiros do Hawaii', 'Kid Abelha', 'Biquini Cavadão', 'Nando Reis', 'Vanessa da Mata', 'Ana Carolina', 'Maria Gadú', 'Jorge Ben Jor',
  'Taylor Swift', 'The Weeknd', 'Ed Sheeran', 'Coldplay', 'Imagine Dragons', 'Dua Lipa', 'Billie Eilish', 'Bruno Mars', 'Adele', 'Beyoncé',
  'Rihanna', 'Drake', 'Eminem', 'Kendrick Lamar', 'Post Malone', 'Harry Styles', 'Ariana Grande', 'Justin Bieber', 'Shakira', 'Bad Bunny',
  'Karol G', 'J Balvin', 'Rosalía', 'Queen', 'The Beatles', 'Michael Jackson', 'Elvis Presley', 'Madonna', 'Whitney Houston', 'Mariah Carey',
  'Metallica', 'AC/DC', 'Guns N’ Roses', 'Nirvana', 'Foo Fighters', 'Red Hot Chili Peppers', 'Linkin Park', 'Arctic Monkeys', 'Pink Floyd', 'Led Zeppelin',
  'U2', 'Maroon 5', 'OneRepublic', 'Sia', 'Lady Gaga', 'Katy Perry', 'Miley Cyrus', 'Olivia Rodrigo', 'Sabrina Carpenter', 'SZA',
  'Daft Punk', 'Calvin Harris', 'David Guetta', 'Avicii', 'Alok', 'Vintage Culture', 'Martin Garrix', 'Tiësto', 'Hans Zimmer', 'Ludovico Einaudi']
export const GENEROS = ['sertanejo', 'sertanejo universitário', 'modão', 'forró', 'piseiro', 'pagode', 'samba', 'MPB', 'bossa nova', 'funk', 'funk carioca', 'axé',
  'rock', 'rock nacional', 'rock clássico', 'pop', 'pop rock', 'indie', 'rap', 'trap', 'hip hop', 'reggae', 'reggaeton', 'eletrônica', 'house', 'techno',
  'lo-fi', 'jazz', 'blues', 'soul', 'R&B', 'gospel', 'música clássica', 'piano', 'acústico', 'country', 'metal', 'punk', 'k-pop', 'trilhas sonoras', 'disco', 'brega']
export const HUMORES = ['animada', 'calma', 'relaxante', 'romântica', 'feliz', 'triste', 'para dançar', 'instrumental', 'para cantar junto', 'tranquila', 'motivacional', 'nostálgica']
export const ATIVIDADES = ['trabalhar', 'focar', 'estudar', 'relaxar', 'dormir', 'meditar', 'treinar', 'correr', 'cozinhar', 'limpar a casa', 'uma festa', 'um churrasco', 'o café da manhã', 'viajar', 'ler', 'programar']
export const DECADAS = ['60', '70', '80', '90', '2000', '2010', '2020']
const HORAS = Array.from({ length: 24 * 4 }, (_, i) => `${String(Math.floor(i / 4)).padStart(2, '0')}:${String((i % 4) * 15).padStart(2, '0')}`).filter((h) => h >= '05:00' && h <= '23:45')
const DIAS = ['hoje', 'amanhã', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado', 'domingo', 'todo dia', 'de segunda a sexta']
const MINUTOS = [5, 10, 15, 20, 25, 30, 40, 45, 50, 60, 75, 90, 120]

// modelos de música (frases reais da Alexa com o Spotify como serviço de música)
export function modelosMusica({ playlists = [], echos = [] }) {
  const pl = playlists.length ? playlists : ['minha playlist favorita']
  const onde = ['', ...echos.map((e) => `no ${e}`), 'em todos os dispositivos']
  const ondeSem = onde.filter(Boolean)
  return [
    { cat: 'Playlists', faz: 'Toca a playlist no Spotify', frase: 'Alexa, {v} a playlist {p} no Spotify {o}', lacunas: { v: ['toca', 'coloca', 'põe'], p: pl, o: onde } },
    { cat: 'Playlists', faz: 'Toca a playlist embaralhada', frase: 'Alexa, toca a playlist {p} no modo aleatório {o}', lacunas: { p: pl, o: onde } },
    { cat: 'Artistas', faz: 'Toca músicas do artista', frase: 'Alexa, {v} {a} no Spotify {o}', lacunas: { v: ['toca', 'coloca', 'toca músicas de', 'toca as mais tocadas de', 'toca o último álbum de', 'toca a rádio de'], a: ARTISTAS, o: onde } },
    { cat: 'Gêneros e estilos', faz: 'Toca o gênero', frase: 'Alexa, toca {g} {d} no Spotify {o}', lacunas: { g: GENEROS, d: ['', ...DECADAS.map((x) => `dos anos ${x}`)], o: onde } },
    { cat: 'Humor e atividade', faz: 'Toca algo para o momento', frase: 'Alexa, toca música {h} {o}', lacunas: { h: HUMORES, o: onde } },
    { cat: 'Humor e atividade', faz: 'Toca algo para a atividade', frase: 'Alexa, toca música para {t} {g} {o}', lacunas: { t: ATIVIDADES, g: ['', ...GENEROS.map((x) => `(${x})`)], o: onde } },
    { cat: 'Décadas', faz: 'Toca os sucessos da década', frase: 'Alexa, toca {x} dos anos {d} {o}', lacunas: { x: ['músicas', 'os sucessos', 'as mais tocadas', 'flashback'], d: DECADAS, o: onde } },
    { cat: 'Despertador com música', faz: 'Alarme que toca a playlist', frase: 'Alexa, me acorda {dia} às {h} com a playlist {p}', lacunas: { dia: DIAS, h: HORAS, p: pl } },
    { cat: 'Despertador com música', faz: 'Alarme que toca o artista', frase: 'Alexa, me acorda {dia} às {h} com {a}', lacunas: { dia: DIAS, h: HORAS.filter((h) => h <= '10:00'), a: ARTISTAS } },
    { cat: 'Timer de sono', faz: 'Para a música depois de um tempo', frase: 'Alexa, {v} a música em {m} minutos', lacunas: { v: ['para', 'desliga', 'pausa'], m: MINUTOS } },
    { cat: 'Controle', faz: 'Controla o que está tocando', frase: 'Alexa, {c} {o}', lacunas: { c: ['pausa', 'continua', 'próxima', 'volta a música', 'repete essa música', 'para de repetir', 'modo aleatório', 'desliga o modo aleatório', 'curte essa música', 'reinicia a música', 'avança 30 segundos', 'volta 30 segundos', 'para a música'], o: ['', ...ondeSem] } },
    { cat: 'Volume', faz: 'Muda o volume', frase: 'Alexa, volume {n} {o}', lacunas: { n: ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10'], o: ['', ...ondeSem] } },
    { cat: 'Volume', faz: 'Sobe ou desce o volume', frase: 'Alexa, {c} {o}', lacunas: { c: ['aumenta o volume', 'abaixa o volume', 'aumenta um pouco', 'abaixa um pouco', 'volume máximo', 'silencia', 'tira do mudo'], o: ['', ...ondeSem] } },
    { cat: 'Perguntas', faz: 'Pergunta sobre a música', frase: 'Alexa, {q}', lacunas: { q: ['o que está tocando?', 'quem canta essa música?', 'qual é o nome dessa música?', 'de que álbum é essa música?', 'quanto tempo falta dessa música?', 'de que ano é essa música?'] } },
    { cat: 'Mover a música', faz: 'Leva a música para outro Echo', frase: 'Alexa, {v} a música para {e}', lacunas: { v: ['move', 'transfere', 'passa'], e: echos.length ? echos : ['o Echo da sala'] } },
  ]
}

// modelos do ar-condicionado (Sinric Pro: Window AC Unit) para cada aparelho
export function modelosAr({ aparelhos = [] }) {
  const nomes = aparelhos.length ? aparelhos.map((a) => a.nome) : ['ar do escritório']
  const temps = Array.from({ length: 15 }, (_, i) => String(16 + i))
  const art = (n) => (/^ar\b/i.test(n) ? `o ${n}` : n)
  const N = nomes.map(art)
  return [
    { cat: 'Ligar e desligar', faz: 'Liga ou desliga', frase: 'Alexa, {v} {a}', lacunas: { v: ['liga', 'ligar', 'desliga', 'desligar', 'acende', 'apaga'], a: N }, acao: (x) => ({ ligado: /^(liga|ligar|acende)$/.test(x.v) }) },
    { cat: 'Temperatura', faz: 'Ajusta a temperatura', frase: 'Alexa, {v} {a} {p} {t} graus', lacunas: { v: ['coloca', 'ajusta', 'muda', 'deixa', 'põe'], a: N, p: ['em', 'para', 'a'], t: temps }, acao: (x) => ({ ligado: true, temperatura: +x.t }) },
    { cat: 'Temperatura', faz: 'Ajusta a temperatura (forma curta)', frase: 'Alexa, {a} em {t} graus', lacunas: { a: N, t: temps }, acao: (x) => ({ ligado: true, temperatura: +x.t }) },
    { cat: 'Temperatura', faz: 'Sobe ou desce um grau', frase: 'Alexa, {v} a temperatura {d} {a}', lacunas: { v: ['aumenta', 'diminui', 'sobe', 'abaixa'], d: ['do', 'no'], a: nomes } },
    { cat: 'Modo', faz: 'Muda o modo', frase: 'Alexa, {v} {a} no modo {m}', lacunas: { v: ['coloca', 'muda', 'deixa'], a: N, m: ['frio', 'aquecimento', 'automático', 'ventilar', 'desumidificar'] }, acao: (x) => ({ ligado: true, modo: { frio: 'frio', aquecimento: 'quente', automático: 'auto', ventilar: 'ventilar', desumidificar: 'seco' }[x.m] }) },
    { cat: 'Ventilação', faz: 'Muda a velocidade', frase: 'Alexa, {v} a velocidade {d} {a} {p} {n}', lacunas: { v: ['coloca', 'muda', 'ajusta'], d: ['do', 'no'], a: nomes, p: ['em', 'para'], n: ['1', '2', '3'] }, acao: (x) => ({ ligado: true, ventilador: { 1: 'baixa', 2: 'media', 3: 'alta' }[x.n] }) },
    { cat: 'Perguntas', faz: 'Pergunta o estado', frase: 'Alexa, {q} {a}?', lacunas: { q: ['qual a temperatura do', 'como está o', 'o que está ajustado no', 'em que modo está o'], a: nomes } },
    { cat: 'Rotinas suas (criar no app Alexa)', faz: 'Frase sua numa Rotina da Alexa', frase: 'Alexa, {f}', lacunas: { f: ['bom dia escritório', 'cheguei', 'estou saindo', 'fim do expediente', 'hora da reunião', 'modo foco', 'está calor', 'está frio', 'boa noite', 'pausa para o café', 'desliga tudo', 'modo econômico'] } },
  ]
}

const total1 = (m) => Object.values(m.lacunas).reduce((p, v) => p * Math.max(1, v.length), 1)
const montar = (m, idx) => {
  const val = {}
  let resto = idx
  for (const [k, lista] of Object.entries(m.lacunas)) { val[k] = lista[resto % lista.length]; resto = Math.floor(resto / lista.length) }
  const texto = m.frase.replace(/\{(\w+)\}/g, (_, k) => val[k] ?? '').replace(/\s+/g, ' ').replace(/\s+([?.,!])/g, '$1').trim()
  return { texto, val }
}
const norm = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')

// filtra: categoria e busca (cada palavra precisa aparecer na frase); devolve um "conjunto virtual" paginável
export function catalogo(modelos, { cat = '', busca = '' } = {}) {
  const termos = norm(busca).split(/\s+/).filter((t) => t.length > 1)
  const partes = []
  for (const m of modelos) {
    if (cat && m.cat !== cat) continue
    const literal = norm(m.frase.replace(/\{\w+\}/g, ' '))
    const faltam = termos.filter((t) => !literal.includes(t))
    if (!faltam.length) { partes.push({ m, lacunas: m.lacunas, n: total1(m) }); continue }
    // cada termo que falta vai para uma lacuna que o contenha; a lacuna fica só com os valores que têm os seus termos
    const lac = { ...m.lacunas }
    let ok = true
    for (const t of faltam) {
      const k = Object.keys(lac).find((k2) => lac[k2].some((v) => norm(String(v)).includes(t)))
      if (!k) { ok = false; break }
      lac[k] = lac[k].filter((v) => norm(String(v)).includes(t))
    }
    if (ok) partes.push({ m: { ...m, lacunas: lac }, lacunas: lac, n: total1({ lacunas: lac }) })
  }
  const total = partes.reduce((s, p) => s + p.n, 0)
  return {
    total,
    pagina(ini, qtd) {
      const out = []
      let i = ini
      for (const p of partes) {
        if (i >= p.n) { i -= p.n; continue }
        while (i < p.n && out.length < qtd) { const f = montar(p.m, i); out.push({ ...f, cat: p.m.cat, faz: p.m.faz, acao: p.m.acao?.(f.val), alvo: f.val.a }); i++ }
        if (out.length >= qtd) break
        i = 0
      }
      return out
    },
  }
}
export const contar = (modelos) => modelos.reduce((s, m) => s + total1(m), 0)
export const categorias = (modelos) => [...new Set(modelos.map((m) => m.cat))].map((c) => ({ cat: c, n: modelos.filter((m) => m.cat === c).reduce((s, m) => s + total1(m), 0) }))
