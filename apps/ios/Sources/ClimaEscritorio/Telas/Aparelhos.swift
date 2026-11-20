import SwiftUI

struct AparelhosView: View {
    @State private var carga = Carga("/api/aparelhos")
    @State private var busca = ""
    var body: some View {
        Estado(carga: carga) { d in
            let lista = d.l.filter { busca.isEmpty || "\($0["nome"].s) \($0["projeto_nome"].s)".localizedCaseInsensitiveContains(busca) }
            let salas = Dictionary(grouping: lista) { $0["projeto_nome"].s.isEmpty ? "Sem sala" : $0["projeto_nome"].s }
            List {
                ForEach(salas.keys.sorted(), id: \.self) { sala in
                    Section(sala) {
                        ForEach(salas[sala] ?? []) { ar in
                            NavigationLink { AparelhoView(id: ar["id"].i) } label: { LinhaAr(ar: ar).listRowInsets(EdgeInsets()) }
                        }
                    }
                }
            }
            .searchable(text: $busca, prompt: "Procurar ar ou sala")
            .overlay { if lista.isEmpty { Vazio(titulo: "Nenhum ar", texto: "Nada com esse nome.", icone: "magnifyingglass") } }
        }
        .navigationTitle("Aparelhos")
    }
}

/// Controle completo de um ar: ligar/desligar, temperatura, modo, ventilação, timer, botões extras e histórico.
struct AparelhoView: View {
    let id: Int
    @State private var carga: Carga
    @State private var temp: Double = 23
    @State private var ocupado = false
    init(id: Int) { self.id = id; _carga = State(initialValue: Carga("/api/aparelhos/\(id)")) }

    var body: some View {
        Estado(carga: carga) { ar in
            let lig = ar["ligado"].b
            let semTx = ar["hub_id"].vazio
            Form {
                Section {
                    VStack(spacing: 10) {
                        ZStack {
                            Circle().stroke(Fmt.corModo(ar["modo"].s, ligado: lig).opacity(0.18), lineWidth: 14)
                            Circle().trim(from: 0, to: CGFloat((temp - 16) / 14)).stroke(Fmt.corModo(ar["modo"].s, ligado: lig), style: StrokeStyle(lineWidth: 14, lineCap: .round)).rotationEffect(.degrees(-90))
                            VStack {
                                Text("\(Int(temp))°").font(.system(size: 52, weight: .semibold)).monospacedDigit()
                                Text(lig ? Fmt.modo(ar["modo"].s) : "Desligado").foregroundStyle(.secondary)
                            }
                        }
                        .frame(width: 190, height: 190).padding(.top, 6)
                        HStack(spacing: 24) {
                            Button { mudar(temp: temp - 1) } label: { Image(systemName: "minus").frame(width: 44, height: 44) }.buttonStyle(.bordered)
                            Button { Task { await enviar(["ligado": !lig]) } } label: {
                                Image(systemName: "power").font(.title2).frame(width: 64, height: 64)
                            }.buttonStyle(.borderedProminent).tint(lig ? .red : .marca).clipShape(Circle())
                            Button { mudar(temp: temp + 1) } label: { Image(systemName: "plus").frame(width: 44, height: 44) }.buttonStyle(.bordered)
                        }
                        .disabled(semTx || ocupado)
                        if semTx { Text("Este ar não tem transmissor: vincule um no painel para controlar.").font(.footnote).foregroundStyle(.orange).multilineTextAlignment(.center) }
                        if !ar["zona"].vazio { Text("Zona \(ar["zona"]["nome"].s): muda junto com \(ar["zona"]["outros"].l.map(\.s).joined(separator: ", ")).").font(.caption).foregroundStyle(.secondary).multilineTextAlignment(.center) }
                    }
                    .frame(maxWidth: .infinity)
                }
                Section("Modo") {
                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack { ForEach(Fmt.modos, id: \.0) { m in
                            Button { Task { await enviar(["ligado": true, "modo": m.0]) } } label: { Label(m.1, systemImage: m.2) }
                                .buttonStyle(.bordered).tint(ar["modo"].s == m.0 && lig ? Fmt.corModo(m.0, ligado: true) : .secondary)
                        } }
                    }.disabled(semTx || ocupado)
                }
                Section("Ventilação") {
                    Picker("Ventilação", selection: Binding(get: { ar["ventilador"].s }, set: { v in Task { await enviar(["ligado": true, "ventilador": v]) } })) {
                        ForEach(Fmt.ventilacao, id: \.0) { Text($0.1).tag($0.0) }
                    }.pickerStyle(.segmented).disabled(semTx || ocupado)
                }
                Section("Timer") {
                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack {
                            ForEach([15, 30, 60, 120, 240], id: \.self) { m in
                                Button(m >= 60 ? "\(m / 60) h" : "\(m) min") { Task { await agir("Desliga em \(m >= 60 ? "\(m / 60) h" : "\(m) min").") { _ = try await API.shared.post("/api/aparelhos/\(id)/temporizador", ["minutos": m, "ligado": false]) } } }.buttonStyle(.bordered)
                            }
                            Button("Cancelar", role: .destructive) { Task { await agir("Timer cancelado.") { _ = try await API.shared.del("/api/aparelhos/\(id)/temporizador") } } }.buttonStyle(.bordered)
                        }
                    }
                }
                let extras = ar["codigos"].l.filter { $0["chave"].s.hasPrefix("extra_") }
                if !extras.isEmpty {
                    Section("Botões extras") {
                        ForEach(extras) { c in
                            Button(c["rotulo"].opcional ?? String(c["chave"].s.dropFirst(6))) { Task { await agir("Enviado.") { _ = try await API.shared.post("/api/aparelhos/\(id)/botoes/\(c["chave"].s)/enviar") } } }
                        }
                    }
                }
                Section("Detalhes") {
                    LabeledContent("Sala", value: ar["projeto_nome"].opcional ?? "-")
                    LabeledContent("Transmissor", value: ar["hub"]["nome"].opcional ?? "nenhum")
                    LabeledContent("Botões gravados", value: "\(ar["codigos"].l.count)")
                    LabeledContent("Faixa", value: "\(ar["temp_min"].i)° a \(ar["temp_max"].i)°")
                    LabeledContent("Alexa", value: ar["alexa"].b ? "sim" : "não")
                }
                Section("Histórico") {
                    ForEach(Array(ar["atividade"].l.prefix(12).enumerated()), id: \.offset) { _, a in
                        VStack(alignment: .leading) {
                            Text(a["acao"].s).font(.subheadline).foregroundStyle(a["ok"].b ? .primary : Color.red)
                            Text("\(Fmt.origem(a["origem"].s)) · \(Fmt.dataHora(a["quando"].d))").font(.caption).foregroundStyle(.secondary)
                        }
                    }
                }
            }
            .onAppear { temp = Double(ar["temperatura"].i == 0 ? 23 : ar["temperatura"].i) }
            .navigationTitle(ar["nome"].s)
        }
    }

    private func mudar(temp nova: Double) {
        let ar = carga.dados
        temp = min(Double(ar["temp_max"].i == 0 ? 30 : ar["temp_max"].i), max(Double(ar["temp_min"].i == 0 ? 16 : ar["temp_min"].i), nova))
        Task { await enviar(["ligado": true, "temperatura": Int(temp)]) }
    }

    private func enviar(_ estado: [String: Any]) async {
        ocupado = true; defer { ocupado = false }
        await agir("Comando enviado.") {
            _ = try await API.shared.post("/api/aparelhos/\(id)/estado", estado)
            await carga.carregar()
        }
    }
}
