import SwiftUI

struct InicioView: View {
    @Environment(Sessao.self) private var sessao
    @State private var carga = Carga("/api/painel")
    @State private var notif = Carga("/api/notificacoes")

    var body: some View {
        Estado(carga: carga) { d in
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    let t = d["totais"]
                    if !d["agente"]["online"].b {
                        Label("Nenhum agente do escritório online: os comandos não chegam aos ares.", systemImage: "exclamationmark.triangle.fill")
                            .font(.footnote).foregroundStyle(.orange).padding(12).frame(maxWidth: .infinity, alignment: .leading)
                            .background(.orange.opacity(0.12), in: RoundedRectangle(cornerRadius: 12))
                    }
                    LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 10) {
                        Metrica(rotulo: "Ligados", valor: "\(t["ligados"].i)/\(t["aparelhos"].i)", dica: "ares agora", icone: "power")
                        Metrica(rotulo: "Transmissores", valor: "\(t["hubs_online"].i)/\(t["hubs"].i)", dica: "online", icone: "dot.radiowaves.left.and.right")
                        Metrica(rotulo: "Comandos 24 h", valor: "\(t["comandos_24h"].i)", dica: "\(t["falhas_24h"].i) falha(s)", icone: "bolt")
                        Metrica(rotulo: "Alertas", valor: "\(d["alertas"].i)", dica: d["alexa"].b ? "Alexa conectada" : "Alexa desligada", icone: "bell")
                    }
                    Text("Ares").font(.headline)
                    ForEach(d["aparelhos"].l) { ar in
                        NavigationLink { AparelhoView(id: ar["id"].i) } label: { LinhaAr(ar: ar) }.buttonStyle(.plain)
                    }
                    Text("Atividade recente").font(.headline).padding(.top, 6)
                    ForEach(Array(d["atividade"].l.prefix(8).enumerated()), id: \.offset) { _, a in
                        HStack(alignment: .top) {
                            Image(systemName: a["ok"].b ? "checkmark.circle" : "xmark.circle").foregroundStyle(a["ok"].b ? .green : .red)
                            VStack(alignment: .leading) {
                                Text(a["acao"].s).font(.subheadline).lineLimit(2)
                                Text("\(Fmt.origem(a["origem"].s)) · \(Fmt.haQuanto(a["quando"].d))").font(.caption).foregroundStyle(.secondary)
                            }
                        }
                    }
                }
                .padding()
            }
        }
        .navigationTitle("Olá, \(sessao.nome.components(separatedBy: " ").first ?? "")")
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                NavigationLink { NotificacoesView() } label: {
                    Image(systemName: notif.dados["contagem"]["nao_lidas"].i > 0 ? "bell.badge" : "bell")
                }
            }
        }
        .task { await notif.carregar() }
    }
}

struct LinhaAr: View {
    let ar: JSON
    var body: some View {
        let lig = ar["ligado"].b
        HStack(spacing: 12) {
            Image(systemName: Fmt.icone(ar["modo"].s)).font(.title3).foregroundStyle(.white)
                .frame(width: 42, height: 42).background(Fmt.corModo(ar["modo"].s, ligado: lig), in: RoundedRectangle(cornerRadius: 12))
            VStack(alignment: .leading, spacing: 2) {
                Text(ar["nome"].s).font(.subheadline.weight(.semibold))
                Text(lig ? "\(Fmt.modo(ar["modo"].s)) · \(ar["temperatura"].i)° · \(Fmt.vent(ar["ventilador"].s))" : "Desligado")
                    .font(.caption).foregroundStyle(.secondary)
            }
            Spacer()
            if ar["hub_id"].vazio { Selo(texto: "sem transmissor", cor: .orange) }
            else if !ar["zona"].vazio { Selo(texto: "zona", cor: .blue) }
        }
        .padding(12).background(.background.secondary, in: RoundedRectangle(cornerRadius: 14))
    }
}
