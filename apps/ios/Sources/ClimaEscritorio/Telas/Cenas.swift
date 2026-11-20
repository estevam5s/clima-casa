import SwiftUI

struct CenasView: View {
    @State private var carga = Carga("/api/cenas")
    var body: some View {
        Estado(carga: carga) { d in
            List {
                if d.l.isEmpty { Vazio(titulo: "Nenhuma cena", texto: "Crie cenas no painel (vários ares de uma vez).", icone: "sparkles") }
                ForEach(d.l) { c in
                    HStack {
                        VStack(alignment: .leading) {
                            Text(c["nome"].s).font(.body.weight(.semibold))
                            Text("\(c["acoes"].l.count) ação(ões) · \(c["projeto_nome"].opcional ?? "todas as salas")").font(.caption).foregroundStyle(.secondary)
                        }
                        Spacer()
                        Button("Executar") { Task { await agir("Cena \(c["nome"].s) executada.") { _ = try await API.shared.post("/api/cenas/\(c["id"].i)/executar") } } }
                            .buttonStyle(.borderedProminent).tint(.marca)
                    }
                }
            }
        }
        .navigationTitle("Cenas")
    }
}
