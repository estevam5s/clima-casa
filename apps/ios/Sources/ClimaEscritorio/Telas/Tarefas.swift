import SwiftUI

// Tarefas (as mesmas do painel em /tarefas): as que estão com você, por prazo. Tocar no círculo conclui ou reabre.
// Quadro, cronograma, comentários e GitHub Projects ficam no painel.
struct TarefasView: View {
    @State private var carga = Carga("/api/tarefas/minhas")
    private var hoje: String { let f = DateFormatter(); f.dateFormat = "yyyy-MM-dd"; f.timeZone = TimeZone(identifier: "America/Sao_Paulo"); return f.string(from: Date()) }
    private func prazo(_ s: String) -> String { s.count == 10 ? "\(s.suffix(2))/\(s.dropFirst(5).prefix(2))" : "" }
    var body: some View {
        Estado(carga: carga) { d in
            let lista = d["tarefas"].l
            List {
                if lista.isEmpty { Vazio(titulo: "Nada com você", texto: "Quando alguém marcar você como responsável de uma tarefa, ela aparece aqui.", icone: "checklist") }
                ForEach([("Atrasadas", lista.filter { !$0["concluida"].b && !$0["prazo"].vazio && $0["prazo"].s < hoje }),
                         ("Abertas", lista.filter { !$0["concluida"].b && ($0["prazo"].vazio || $0["prazo"].s >= hoje) }),
                         ("Concluídas (7 dias)", lista.filter { $0["concluida"].b })], id: \.0) { grupo in
                    if !grupo.1.isEmpty {
                        Section(grupo.0) {
                            ForEach(grupo.1) { t in
                                HStack(spacing: 12) {
                                    Button {
                                        Task { await agir(t["concluida"].b ? "Reaberta." : "Concluída.") { _ = try await API.shared.put("/api/tarefas/\(t["id"].s)", ["concluida": !t["concluida"].b]); await carga.carregar() } }
                                    } label: { Image(systemName: t["concluida"].b ? "checkmark.circle.fill" : "circle").font(.title3).foregroundStyle(t["concluida"].b ? Color.green : Color.secondary) }
                                    .buttonStyle(.plain).accessibilityLabel(t["concluida"].b ? "Reabrir" : "Concluir")
                                    VStack(alignment: .leading, spacing: 2) {
                                        Text(t["titulo"].s).strikethrough(t["concluida"].b).foregroundStyle(t["concluida"].b ? .secondary : .primary)
                                        Text(t["projeto_nome"].s + (t["secao_nome"].vazio ? "" : " · \(t["secao_nome"].s)")).font(.caption).foregroundStyle(.secondary)
                                    }
                                    Spacer()
                                    if !t["prazo"].vazio { Text(prazo(t["prazo"].s)).font(.caption).foregroundStyle(grupo.0 == "Atrasadas" ? Color.red : Color.secondary) }
                                }
                            }
                        }
                    }
                }
            }
        }.navigationTitle("Tarefas")
    }
}
