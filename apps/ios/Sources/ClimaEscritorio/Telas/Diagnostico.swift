import SwiftUI

// Bugs (abertos, por categoria; procurar e autoteste para quem gerencia) e Uso da IA (sessão de 5 h e semana).
struct BugsView: View {
    @State private var carga = Carga("/api/bugs")
    @State private var categoria = ""
    @State private var teste: JSON = .nulo
    private let cats: [(String, String)] = [("", "Todos"), ("cadastro", "Cadastros"), ("tela", "Telas"), ("servidor", "Servidor"), ("atividade", "Comandos")]
    var body: some View {
        Estado(carga: carga) { d in
            List {
                if d["gestor"].b {
                    Section("Procurar e testar") {
                        Button("Procurar bugs agora") { Task { await agir("Procura concluída.") { _ = try await API.shared.post("/api/bugs/varrer"); await carga.carregar() } } }
                        Button("Rodar autoteste dos cadastros") { Task { await agir("Autoteste concluído.") { teste = try await API.shared.post("/api/bugs/autoteste"); await carga.carregar() } } }
                        ForEach((teste.vazio ? d["autoteste"] : teste)["passos"].l) { p in
                            Label(p["nome"].s, systemImage: p["ok"].b ? "checkmark.circle.fill" : "xmark.circle.fill").foregroundStyle(p["ok"].b ? Color.green : Color.red).font(.footnote)
                        }
                    }
                }
                Section {
                    Picker("Categoria", selection: $categoria) { ForEach(cats, id: \.0) { Text($0.1).tag($0.0) } }.pickerStyle(.segmented)
                    let abertos = d["itens"].l.filter { ["aberto", "analisando"].contains($0["estado"].s) && (categoria.isEmpty || $0["categoria"].s == categoria) }
                    if abertos.isEmpty { Vazio(titulo: "Nada aberto", texto: "Nenhum bug aberto aqui.", icone: "checkmark.seal") }
                    ForEach(abertos) { b in
                        VStack(alignment: .leading, spacing: 4) {
                            HStack { Selo(texto: b["gravidade"].s, cor: ["critica", "alta"].contains(b["gravidade"].s) ? .red : .orange); Text("\(b["ocorrencias"].i)×").font(.caption).foregroundStyle(.secondary) }
                            Text(b["titulo"].s).font(.subheadline.weight(.semibold))
                            Text(b["sugestao"].s).font(.caption).foregroundStyle(.secondary)
                        }
                    }
                }
            }
        }.navigationTitle("Bugs")
    }
}

struct UsoIAView: View {
    @State private var carga = Carga("/api/ia/uso")
    var body: some View {
        Estado(carga: carga) { d in
            List {
                Section(footer: Text("A sessão começa na sua primeira pergunta e dura 5 horas; a semana, 7 dias. Vale para o painel, o terminal e o Telegram.")) {
                    if d["meu"]["ilimitado"].b { Text("Sua conta não tem limite.").foregroundStyle(.secondary) }
                    barra("Sessão atual (5 horas)", d["meu"]["sessao"])
                    barra("Semana atual (7 dias)", d["meu"]["semana"])
                }
                if !d["pessoas"].l.isEmpty {
                    Section("Uso por pessoa") {
                        ForEach(d["pessoas"].l) { p in
                            HStack { Text(p["nome"].s); Spacer(); Text("\(p["sessao"]["limite"].vazio ? "∞" : "\(p["sessao"]["pct"].i)%") · \(p["semana"]["limite"].vazio ? "∞" : "\(p["semana"]["pct"].i)%")").foregroundStyle(.secondary) }
                        }
                    }
                }
            }
        }.navigationTitle("Uso da IA")
    }
    func barra(_ rotulo: String, _ j: JSON) -> some View {
        let pct = j["limite"].vazio ? 0.0 : Double(j["pct"].i) / 100
        let reinicia = j["reinicia_em"].vazio ? "começa na próxima pergunta" : "reinicia \(Date(timeIntervalSince1970: j["reinicia_em"].d).formatted(.dateTime.weekday(.abbreviated).hour().minute()))"
        return VStack(alignment: .leading, spacing: 6) {
            Text(rotulo).font(.subheadline.weight(.semibold))
            ProgressView(value: pct).tint(pct >= 0.9 ? .red : pct >= 0.7 ? .orange : .marca)
            Text(j["limite"].vazio ? "sem limite · \(j["usado"].i) tokens" : "\(j["pct"].i)% usado · \(reinicia)").font(.caption).foregroundStyle(.secondary)
        }.padding(.vertical, 4)
    }
}
