import SwiftUI

// Uso do sistema por pessoa (o mesmo de Configurações → Usuários → Uso do sistema no painel): tempo com cada tela
// aberta e visível, telas mais usadas e caminhos entre as telas. Só para quem gerencia usuários.
struct UsoSistemaView: View {
    @State private var carga = Carga("/api/usuarios/uso?dias=30")
    func tempo(_ ms: Double) -> String {
        let min = Int((ms / 60000).rounded())
        if min < 1 { return ms > 0 ? "menos de 1 min" : "0 min" }
        if min < 60 { return "\(min) min" }
        return min % 60 == 0 ? "\(min / 60) h" : "\(min / 60) h \(min % 60) min"
    }
    var body: some View {
        Estado(carga: carga) { d in
            let nomes = d["nomes"]
            let nome: (String) -> String = { r in nomes[r].opcional ?? r }
            let total = d["pessoas"].l.reduce(0.0) { $0 + $1["ms"].d }
            let maxP = max(1, d["pessoas"].l.map { $0["ms"].d }.max() ?? 1)
            List {
                Section(footer: Text("Conta só com o sistema aberto e alguém mexendo (5 min parado, o relógio para). Nada do que foi digitado é guardado.")) {
                    LabeledContent("Tempo de uso (30 dias)", value: tempo(total))
                    LabeledContent("Pessoas que usaram", value: "\(d["pessoas"].l.count)")
                    LabeledContent("Telas diferentes", value: "\(d["telas"].l.count)")
                }
                if d["pessoas"].l.isEmpty {
                    Section { Text("Ainda sem tempo de uso registrado. A contagem começou na versão 0.5.5 do sistema.").foregroundStyle(.secondary) }
                } else {
                    Section("Quem mais usa") {
                        ForEach(d["pessoas"].l) { p in
                            VStack(alignment: .leading, spacing: 4) {
                                HStack { Text(d["usuarios"][p["id"].s]["nome"].opcional ?? "Conta apagada").fontWeight(.medium); Spacer(); Text(tempo(p["ms"].d)).fontWeight(.semibold) }
                                ProgressView(value: p["ms"].d / maxP).tint(.teal)
                                Text("\(p["dias_ativos"].i) dia(s) · mais em \(nome(p["favorita"].s))").font(.caption).foregroundStyle(.secondary)
                            }
                        }
                    }
                    Section("Telas mais usadas") {
                        ForEach(d["telas"].l) { x in HStack { Text(nome(x["rota"].s)); Spacer(); Text(tempo(x["ms"].d)).foregroundStyle(.secondary) } }
                    }
                    if !d["caminhos"].l.isEmpty {
                        Section("Caminhos mais comuns") {
                            ForEach(d["caminhos"].l.prefix(8).map { $0 }) { c in Text("\(nome(c["de"].s)) → \(nome(c["para"].s)) · \(c["n"].i)×").font(.callout) }
                        }
                    }
                }
            }
        }.navigationTitle("Uso do sistema")
    }
}
