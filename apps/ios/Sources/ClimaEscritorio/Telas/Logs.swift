import SwiftUI

// Logs (os mesmos de Segurança → Logs no painel; só dono e admin): o que cada pessoa fez nos ares nos últimos 7 dias
// (ligou, desligou, subiu ou baixou a temperatura) e a linha do tempo com atividade, segurança e Telegram.
struct LogsView: View {
    @State private var resumo = Carga("/api/seguranca/logs/resumo?dias=7")
    @State private var linha = Carga("/api/seguranca/logs?dias=7&limite=100&fontes=atividade,seguranca,telegram,dispositivos")
    private let rotulos = ["ligou": "Ligou", "desligou": "Desligou", "subiu": "Subiu temp.", "baixou": "Baixou temp.", "modo": "Modo", "ventilacao": "Ventilação", "config": "Configurou"]
    var body: some View {
        Estado(carga: resumo) { r in
            List {
                let t = r["totais"]
                Section("Últimos 7 dias") {
                    Text("\(t["atividade"]["total"].i) registros · \(t["atividade"]["ares"].i) nos ares · \(t["atividade"]["falhas"].i) falha(s)").font(.subheadline)
                    Text("Segurança: \(t["seguranca"]["logins"].i) login(s), \(t["seguranca"]["negados"].i) negado(s) · Telegram \(t["telegram"]["total"].i)").font(.caption).foregroundStyle(.secondary)
                }
                Section("O que cada pessoa fez nos ares") {
                    ForEach(Array(r["pessoas"].l.prefix(15).enumerated()), id: \.offset) { _, p in
                        VStack(alignment: .leading, spacing: 2) {
                            Text(p["nome"].s).font(.subheadline.weight(.semibold))
                            Text("\(p["total"].i) comando(s) · Ligou \(p["ligou"].i) · Desligou \(p["desligou"].i) · Subiu \(p["subiu"].i) · Baixou \(p["baixou"].i)").font(.caption).foregroundStyle(.secondary)
                        }
                    }
                    if r["pessoas"].l.isEmpty { Text("Nenhum comando nos ares no período.").foregroundStyle(.secondary) }
                }
                Section("Linha do tempo") {
                    ForEach(Array(linha.dados["itens"].l.enumerated()), id: \.offset) { _, x in
                        VStack(alignment: .leading, spacing: 2) {
                            Text((x["quem"].vazio ? (x["ip"].vazio ? "Sistema" : x["ip"].s) : x["quem"].s) + ": " + x["acao"].s).font(.subheadline)
                            Text(Fmt.haQuanto(x["quando"].d) + (x["aparelho"].vazio ? "" : " · \(x["aparelho"].s)") + (x["sala"].vazio ? "" : " · \(x["sala"].s)")
                                 + (x["acao_ar"].vazio ? "" : " · \(rotulos[x["acao_ar"].s] ?? x["acao_ar"].s)") + (x["ok"].b ? "" : " · falhou"))
                                .font(.caption).foregroundStyle(x["ok"].b ? Color.secondary : Color.red)
                        }
                    }
                }
            }
            .task { await linha.carregar() }
            .refreshable { await resumo.carregar(); await linha.carregar() }
        }.navigationTitle("Logs")
    }
}
