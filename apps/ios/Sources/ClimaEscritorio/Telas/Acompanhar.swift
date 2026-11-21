import SwiftUI

struct NotificacoesView: View {
    @State private var carga = Carga("/api/notificacoes")
    var body: some View {
        Estado(carga: carga) { d in
            List {
                if d["itens"].l.isEmpty { Vazio(titulo: "Tudo em dia", texto: "Nenhuma notificação.", icone: "bell.slash") }
                ForEach(d["itens"].l) { n in
                    VStack(alignment: .leading, spacing: 4) {
                        HStack {
                            if !n["lida"].b { Circle().fill(Color.marca).frame(width: 8, height: 8) }
                            Text(n["titulo"].s).font(.subheadline.weight(.semibold))
                            Spacer()
                            Selo(texto: n["gravidade"].s, cor: ["critica": Color.red, "alta": .orange, "media": .yellow].first { $0.key == n["gravidade"].s }?.value ?? .secondary)
                        }
                        if !n["detalhe"].vazio { Text(n["detalhe"].s).font(.caption).foregroundStyle(.secondary) }
                        Text(Fmt.haQuanto(n["quando"].d)).font(.caption2).foregroundStyle(.secondary)
                    }
                    .swipeActions { Button("Lida") { Task { await agir("Marcada como lida.") { _ = try await API.shared.post("/api/notificacoes/\(n["id"].s)/lida"); await carga.carregar() } } }.tint(.marca) }
                }
            }
        }.navigationTitle("Notificações")
    }
}

struct AtividadeView: View {
    @State private var carga = Carga("/api/atividade?limite=150")
    @State private var falhas = false
    var body: some View {
        Estado(carga: carga) { d in
            List(d.l.filter { !falhas || !$0["ok"].b }) { a in
                VStack(alignment: .leading, spacing: 2) {
                    Text(a["acao"].s).font(.subheadline).foregroundStyle(a["ok"].b ? .primary : Color.red)
                    Text([a["aparelho_nome"].opcional, Fmt.origem(a["origem"].s), Fmt.dataHora(a["quando"].d)].compactMap { $0 }.joined(separator: " · ")).font(.caption).foregroundStyle(.secondary)
                    if !a["ok"].b, !a["detalhe"].vazio { Text(a["detalhe"].s).font(.caption2).foregroundStyle(.secondary) }
                }
            }
            .toolbar { Toggle("Só falhas", isOn: $falhas).toggleStyle(.button) }
        }.navigationTitle("Atividade")
    }
}

struct AlertasView: View {
    @State private var carga = Carga("/api/alertas")
    var body: some View {
        Estado(carga: carga) { d in
            List {
                if d.l.isEmpty { Vazio(titulo: "Sem alertas", texto: "Nenhum ar ligado demais nem falha repetida.", icone: "checkmark.seal") }
                ForEach(d.l) { a in
                    HStack {
                        VStack(alignment: .leading) { Text(a["mensagem"].s).font(.subheadline); Text(Fmt.haQuanto(a["criado_em"].d)).font(.caption).foregroundStyle(.secondary) }
                        Spacer()
                        if !a["resolvido"].b { Button("Resolver") { Task { await agir("Resolvido.") { _ = try await API.shared.post("/api/alertas/\(a["id"].i)/resolver"); await carga.carregar() } } }.buttonStyle(.bordered) }
                    }
                }
            }
        }.navigationTitle("Alertas")
    }
}

struct AgendaView: View {
    @State private var carga = Carga("/api/agendamentos")
    var body: some View {
        Estado(carga: carga) { d in
            List {
                if d.l.isEmpty { Vazio(titulo: "Agenda vazia", texto: "Crie horários no painel (ligar às 8h, desligar às 18h).", icone: "calendar") }
                ForEach(d.l) { g in
                    VStack(alignment: .leading) {
                        Text(g["nome"].opcional ?? "\(g["hora"].s) · \(g["aparelho_nome"].s)").font(.subheadline.weight(.semibold))
                        Text("\(g["hora"].s) · \(g["ligado"].b ? "ligar" : "desligar") · \(g["ativo"].b ? "ativo" : "pausado")").font(.caption).foregroundStyle(.secondary)
                    }
                }
            }
        }.navigationTitle("Agenda")
    }
}

struct AutomacoesView: View {
    @State private var carga = Carga("/api/automacoes")
    var body: some View {
        Estado(carga: carga) { d in
            List {
                if d.l.isEmpty { Vazio(titulo: "Nenhuma automação", texto: "Crie no painel (ex.: desligar depois de 2 h ligado).", icone: "point.3.connected.trianglepath.dotted") }
                ForEach(d.l) { a in
                    HStack {
                        VStack(alignment: .leading) { Text(a["nome"].s).font(.subheadline.weight(.semibold)); Text(a["ativo"].b ? "ativa" : "pausada").font(.caption).foregroundStyle(.secondary) }
                        Spacer()
                        Button("Executar") { Task { await agir("Automação executada.") { _ = try await API.shared.post("/api/automacoes/\(a["id"].i)/executar") } } }.buttonStyle(.bordered)
                    }
                }
            }
        }.navigationTitle("Automações")
    }
}

struct NovidadesView: View {
    @State private var carga = Carga("/api/novidades")
    var body: some View {
        Estado(carga: carga) { d in
            List(d["versoes"].l) { v in
                Section {
                    Text(v["titulo"].s).font(.subheadline.weight(.semibold))
                    ForEach([("novo", "Novo"), ("melhorias", "Melhorias"), ("seguranca", "Segurança"), ("correcoes", "Correções")], id: \.0) { k, r in
                        if !v[k].l.isEmpty {
                            VStack(alignment: .leading, spacing: 4) { Text(r).font(.caption.weight(.semibold)).foregroundStyle(Color.marca); ForEach(v[k].l, id: \.self) { Text("• \($0.s)").font(.caption) } }
                        }
                    }
                } header: { Text("Versão \(v["versao"].s) · \(v["data"].s)") }
            }
        }.navigationTitle("Novidades")
    }
}

// Site e acessos (dono/admin): quem acessa o site e o sistema, desempenho, idiomas do site e newsletter.
// A edição (traduções, campanhas) fica no painel web.
struct SiteView: View {
    @State private var origem = "site"
    var body: some View {
        SiteResumo(origem: origem)
            .id(origem)
            .toolbar { Picker("Origem", selection: $origem) { Text("Site").tag("site"); Text("Sistema").tag("sistema") }.pickerStyle(.segmented) }
            .navigationTitle("Site e acessos")
    }
}

private struct SiteResumo: View {
    let origem: String
    @State private var carga: Carga
    @State private var idiomas = Carga("/api/idiomas")
    init(origem: String) { self.origem = origem; _carga = State(initialValue: Carga("/api/analise/resumo?origem=\(origem)&dias=7")) }
    var body: some View {
        Estado(carga: carga) { d in
            List {
                Section("Últimos 7 dias") {
                    LabeledContent("Online agora", value: d["totais"]["online"].s)
                    LabeledContent("Visitantes", value: d["totais"]["visitantes"].s)
                    LabeledContent("Páginas vistas", value: d["totais"]["paginas"].s)
                    LabeledContent("Rejeição", value: "\(d["totais"]["rejeicao"].s)%")
                }
                Section("Rotas mais vistas") { ForEach(Array(d["rotas"].l.prefix(8))) { r in LabeledContent(r["rota"].s, value: r["paginas"].s) } }
                Section("Cliques") { ForEach(Array(d["cliques"].l.prefix(8))) { r in LabeledContent(r["nome"].s, value: r["n"].s) } }
                Section("Cidades") { ForEach(Array(d["cidades"].l.prefix(8))) { r in LabeledContent("\(r["cidade"].s) · \(r["pais"].s)", value: r["sessoes"].s) } }
                Section("Desempenho (p75)") {
                    ForEach(["LCP", "INP", "CLS", "TTFB"], id: \.self) { k in LabeledContent(k, value: d["vitais"][k]["p75"].vazio ? "-" : (k == "CLS" ? String(format: "%.2f", d["vitais"][k]["p75"].d) : "\(Int(d["vitais"][k]["p75"].d)) ms")) }
                }
                Section("Idiomas do site") {
                    ForEach(idiomas.dados["idiomas"].l) { i in LabeledContent(i["nome"].s, value: "\(i["cobertura"].s)%") }
                    Link("Revisar no painel", destination: URL(string: "https://app.zynio.com.br/idiomas")!)
                    Link("Newsletter no painel", destination: URL(string: "https://app.zynio.com.br/emails?aba=newsletter")!)
                }
            }
            .task { await idiomas.carregar() }
        }
    }
}
