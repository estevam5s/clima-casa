import SwiftUI

// Fluxos (Rotinas → Fluxos no painel): ligar, desligar e executar; últimas execuções de todos os fluxos.
// O desenho dos blocos continua no painel.
struct FluxosView: View {
    @State private var carga = Carga("/api/fluxos")
    @State private var execucoes = Carga("/api/fluxos-execucoes?limite=15")
    var body: some View {
        Estado(carga: carga) { d in
            List {
                if d.l.isEmpty { Vazio(titulo: "Nenhum fluxo", texto: "Crie no painel, em Rotinas → Fluxos.", icone: "point.3.connected.trianglepath.dotted") }
                Section {
                    ForEach(d.l) { f in
                        VStack(alignment: .leading, spacing: 6) {
                            Toggle(isOn: Binding(get: { f["ativo"].b }, set: { v in Task { await agir(v ? "Fluxo ligado." : "Fluxo desligado.") { _ = try await API.shared.put("/api/fluxos/\(f["id"].i)/ativo", ["ativo": v]); await carga.carregar() } } })) {
                                Text(f["nome"].s).font(.subheadline.weight(.semibold))
                            }
                            Text(f["gatilhos"].l.isEmpty ? "sem gatilho (só pelo botão)" : f["gatilhos"].l.map { $0.s }.joined(separator: " · ")).font(.caption).foregroundStyle(.secondary)
                            Button("Executar agora") {
                                Task { await agir("Fluxo executado.") { _ = try await API.shared.post("/api/fluxos/\(f["id"].i)/executar", ["dados": [String: Any]()]); await carga.carregar(); await execucoes.carregar() } }
                            }.font(.footnote)
                        }
                    }
                }
                Section("Últimas execuções") {
                    ForEach(execucoes.dados.l) { e in
                        Label {
                            VStack(alignment: .leading) { Text(e["fluxo"].s); Text(e["erro"].s.isEmpty ? e["origem"].s : e["erro"].s).font(.caption).foregroundStyle(.secondary) }
                        } icon: { Image(systemName: e["estado"].s == "ok" ? "checkmark.circle.fill" : "xmark.circle.fill").foregroundStyle(e["estado"].s == "ok" ? Color.green : Color.red) }
                    }
                }
            }.task { await execucoes.carregar() }
        }.navigationTitle("Fluxos")
    }
}

// Diagnóstico (Configurações → Diagnóstico no painel): o que faz o sistema funcionar, conferido agora.
struct DiagnosticoSistemaView: View {
    @State private var carga = Carga("/api/config/diagnostico")
    var body: some View {
        Estado(carga: carga) { d in
            List {
                Section(footer: Text("Puxe para conferir de novo.")) {
                    LabeledContent("Em ordem", value: "\(d["ok"].i) de \(d["total"].i)")
                }
                Section {
                    ForEach(d["itens"].l) { i in
                        Label {
                            VStack(alignment: .leading) { Text(i["nome"].s).fontWeight(.medium); Text(i["detalhe"].s).font(.caption).foregroundStyle(.secondary) }
                        } icon: {
                            Image(systemName: i["estado"].s == "ok" ? "checkmark.circle.fill" : i["estado"].s == "alerta" ? "exclamationmark.triangle.fill" : "xmark.octagon.fill")
                                .foregroundStyle(i["estado"].s == "ok" ? Color.green : i["estado"].s == "alerta" ? Color.orange : Color.red)
                        }
                    }
                }
            }.refreshable { await carga.carregar() }
        }.navigationTitle("Diagnóstico")
    }
}
