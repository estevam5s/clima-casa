import SwiftUI

struct SalasView: View {
    @State private var carga = Carga("/api/projetos")
    var body: some View {
        Estado(carga: carga) { d in
            List(d.l) { p in
                HStack(spacing: 12) {
                    Circle().fill(Color(hex: p["cor"].opcional ?? "#0f766a")).frame(width: 12, height: 12)
                    VStack(alignment: .leading) {
                        Text(p["nome"].s).font(.body.weight(.semibold))
                        Text("\(p["aparelhos"].i) ar(es) · \(p["ligados"].i) ligado(s) · \(p["transmissores_online"].i)/\(p["transmissores"].i) transmissor(es)").font(.caption).foregroundStyle(.secondary)
                    }
                    Spacer()
                    if p["ligados"].i > 0 {
                        Button("Desligar") { Task { await agir("Ares de \(p["nome"].s) desligando.") { _ = try await API.shared.post("/api/projetos/\(p["id"].i)/desligar") } } }.buttonStyle(.bordered).tint(.red)
                    }
                }
            }
        }.navigationTitle("Salas")
    }
}

struct TransmissoresView: View {
    @State private var carga = Carga("/api/hubs")
    var body: some View {
        Estado(carga: carga) { d in
            List(d.l) { h in
                VStack(alignment: .leading, spacing: 6) {
                    HStack {
                        Circle().fill(h["online"].b ? Color.green : Color.gray).frame(width: 9, height: 9)
                        Text(h["nome"].s).font(.body.weight(.semibold))
                        Spacer()
                        Selo(texto: h["online"].b ? "online" : "offline", cor: h["online"].b ? .green : .secondary)
                    }
                    Text("\(h["ares"].l.count) ar(es) · \(h["ip"].opcional ?? "sem IP") · protocolo \(h["versao"].s)").font(.caption).foregroundStyle(.secondary)
                    if !h["problema"].vazio { Text(h["problema"].s).font(.caption).foregroundStyle(.orange) }
                    if !h["ares"].l.isEmpty { Text(h["ares"].l.map { $0["nome"].s }.joined(separator: ", ")).font(.caption2).foregroundStyle(.secondary) }
                    Button("Reconectar agora") { Task { await agir("Pedido enviado ao agente.") { _ = try await API.shared.post("/api/hubs/\(h["id"].s)/reparar") } } }.font(.footnote)
                }
            }
        }.navigationTitle("Transmissores")
    }
}

/// Luzes (inclusive cada tecla de interruptor), persianas, cafeteira e fechadura: a mesma API das telas do painel.
struct DispositivosView: View {
    let tipo: String, titulo: String
    @State private var carga: Carga
    init(tipo: String, titulo: String) { self.tipo = tipo; self.titulo = titulo; _carga = State(initialValue: Carga("/api/dispositivos?tipo=\(tipo)")) }
    var body: some View {
        Estado(carga: carga) { d in
            List {
                if tipo == "luz", !d["sol"].vazio { Section { LabeledContent("Pôr do sol hoje", value: d["sol"]["por"].s); LabeledContent("Nascer do sol", value: d["sol"]["nascer"].s) } }
                if d["dispositivos"].l.isEmpty { Vazio(titulo: "Nada cadastrado", texto: "Cadastre e conecte no painel (\(titulo)).", icone: "questionmark.circle") }
                ForEach(d["dispositivos"].l) { x in linha(x) }
            }
        }.navigationTitle(titulo)
    }

    @ViewBuilder func linha(_ x: JSON) -> some View {
        let r = x["resumo"], id = x["id"].i
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text(x["nome"].s).font(.body.weight(.semibold))
                if !r["tecla"].vazio { Selo(texto: "tecla \(r["tecla"].s.replacingOccurrences(of: "switch_", with: ""))", cor: .blue) }
                Spacer()
                Selo(texto: x["conectado"].b ? (x["online"].b ? "online" : "offline") : "sem aparelho", cor: x["conectado"].b && x["online"].b ? .green : .secondary)
            }
            Text(x["projeto_nome"].opcional ?? "Escritório todo").font(.caption).foregroundStyle(.secondary)
            if x["conectado"].b {
                HStack {
                    switch tipo {
                    case "luz":
                        botao(r["ligada"].b ? "Apagar" : "Acender", r["ligada"].b ? "desligar" : "ligar", id)
                    case "persiana":
                        botao("Abrir", "abrir", id); botao("Parar", "parar", id); botao("Fechar", "fechar", id)
                    case "cafeteira":
                        botao(r["ligada"].b ? "Desligar" : "Ligar", r["ligada"].b ? "desligar" : "ligar", id)
                    default:
                        Text(r["trancada"].b ? "Trancada" : "Destrancada").font(.subheadline)
                    }
                }
                if tipo == "persiana", r["posicao"].d > 0 || !r["posicao"].vazio { Text("Posição: \(r["posicao"].i)%").font(.caption).foregroundStyle(.secondary) }
                if tipo == "luz", !r["brilho"].vazio {
                    Slider(value: Binding(get: { r["brilho"].d }, set: { v in Task { await comando(id, "brilho", Int(v)) } }), in: 1...100, step: 5) { Text("Brilho") }
                }
            }
        }
    }
    func botao(_ t: String, _ acao: String, _ id: Int) -> some View {
        Button(t) { Task { await comando(id, acao) } }.buttonStyle(.bordered)
    }
    func comando(_ id: Int, _ acao: String, _ valor: Int? = nil) async {
        await agir("Feito.") {
            var c: [String: Any] = ["acao": acao]; if let valor { c["valor"] = valor }
            _ = try await API.shared.post("/api/dispositivos/\(id)/comando", c)
            await carga.carregar()
        }
    }
}

struct MusicaView: View {
    @State private var carga = Carga("/api/musica/tocando")
    var body: some View {
        Estado(carga: carga) { p in
            List {
                Section {
                    VStack(alignment: .leading, spacing: 4) {
                        Text(p["item"]["nome"].opcional ?? "Nada tocando").font(.title3.weight(.semibold))
                        Text(p["item"]["artistas"].s).foregroundStyle(.secondary)
                        Text(p["aparelho"]["nome"].opcional.map { "Tocando em \($0)" } ?? "Nenhum aparelho ativo").font(.caption).foregroundStyle(.secondary)
                    }
                    HStack(spacing: 28) {
                        controle("backward.fill", "anterior"); controle(p["tocando"].b ? "pause.fill" : "play.fill", p["tocando"].b ? "pausar" : "tocar"); controle("forward.fill", "proxima")
                    }.frame(maxWidth: .infinity).font(.title)
                }
                Section("Aparelhos") {
                    ForEach(p["aparelhos"].l) { a in
                        Button { Task { await agir("Tocando em \(a["nome"].s).") { _ = try await API.shared.post("/api/musica/comando", ["acao": "transferir", "device_id": a["id"].s]); await carga.carregar() } } } label: {
                            HStack { Text(a["nome"].s); Spacer(); if a["ativo"].b { Image(systemName: "speaker.wave.2.fill").foregroundStyle(Color.marca) } }
                        }
                    }
                }
            }
        }.navigationTitle("Música")
    }
    func controle(_ icone: String, _ acao: String) -> some View {
        Button { Task { await agir("Feito.") { _ = try await API.shared.post("/api/musica/comando", ["acao": acao]); await carga.carregar() } } } label: { Image(systemName: icone) }.buttonStyle(.plain)
    }
}
