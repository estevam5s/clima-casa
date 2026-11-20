import SwiftUI

/// Mensagens do site: lista, conversa (responder por e-mail ou nota interna) e o Kanban por etapa.
struct MensagensView: View {
    @State private var lista = Carga("/api/site/conversas?filtro=tudo")
    @State private var kanban = Carga("/api/site/kanban")
    @State private var modo = 0
    var body: some View {
        VStack(spacing: 0) {
            Picker("", selection: $modo) { Text("Conversas").tag(0); Text("Kanban").tag(1) }.pickerStyle(.segmented).padding()
            Estado(carga: lista) { d in
                if modo == 0 {
                    List {
                        if d["itens"].l.isEmpty { Vazio(titulo: "Nenhuma mensagem", texto: "O que chegar pelo site aparece aqui.", icone: "tray") }
                        ForEach(d["itens"].l) { c in
                            NavigationLink { ConversaView(email: c["email"].s) } label: {
                                VStack(alignment: .leading, spacing: 2) {
                                    HStack { Text(c["nome"].opcional ?? c["email"].s).font(.subheadline.weight(.semibold)); Spacer(); if c["nao_lidas"].i > 0 { Selo(texto: "\(c["nao_lidas"].i)", cor: .marca) } }
                                    Text(c["ultimo"]["texto"].s).font(.caption).foregroundStyle(.secondary).lineLimit(2)
                                }
                            }
                        }
                    }
                } else {
                    ScrollView(.horizontal) {
                        HStack(alignment: .top, spacing: 12) {
                            ForEach(kanban.dados["etapas"].l) { e in
                                let pessoas = d["itens"].l.filter { ($0["etapa"].opcional ?? "novo") == e["id"].s }
                                VStack(alignment: .leading, spacing: 8) {
                                    HStack { Circle().fill(Color(hex: e["cor"].s)).frame(width: 9, height: 9); Text(e["nome"].s).font(.subheadline.weight(.semibold)); Spacer(); Text("\(pessoas.count)").font(.caption).foregroundStyle(.secondary) }
                                    ForEach(pessoas) { c in
                                        VStack(alignment: .leading, spacing: 4) {
                                            Text(c["nome"].opcional ?? c["email"].s).font(.footnote.weight(.semibold))
                                            Text(c["ultimo"]["texto"].s).font(.caption2).foregroundStyle(.secondary).lineLimit(2)
                                            Menu("Mover") {
                                                ForEach(kanban.dados["etapas"].l) { et in
                                                    Button(et["nome"].s) { Task { await agir("Movido para \(et["nome"].s).") { _ = try await API.shared.put("/api/site/conversa?email=\(c["email"].s.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? "")", ["etapa": et["id"].s]); await lista.carregar() } } }
                                                }
                                            }.font(.caption)
                                        }.padding(10).frame(width: 240, alignment: .leading).background(.background, in: RoundedRectangle(cornerRadius: 10))
                                    }
                                }.padding(10).frame(width: 260, alignment: .topLeading).background(.background.secondary, in: RoundedRectangle(cornerRadius: 14))
                            }
                        }.padding()
                    }
                    .task { if kanban.dados == .nulo { await kanban.carregar() } }
                }
            }
        }.navigationTitle("Mensagens")
    }
}

struct ConversaView: View {
    let email: String
    @State private var carga: Carga
    @State private var texto = ""
    @State private var nota = false
    init(email: String) { self.email = email; _carga = State(initialValue: Carga("/api/site/conversa?email=\(email.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? "")")) }
    var body: some View {
        Estado(carga: carga) { d in
            VStack(spacing: 0) {
                List(d["linha"].l) { m in
                    VStack(alignment: m["de"].s == "contato" ? .leading : .trailing) {
                        Text(m["texto"].s).padding(10).background(m["de"].s == "contato" ? Color.gray.opacity(0.15) : (m["de"].s == "nota" ? Color.yellow.opacity(0.25) : Color.marca.opacity(0.2)), in: RoundedRectangle(cornerRadius: 12))
                        Text(Fmt.dataHora(m["quando"].d)).font(.caption2).foregroundStyle(.secondary)
                    }.frame(maxWidth: .infinity, alignment: m["de"].s == "contato" ? .leading : .trailing).listRowSeparator(.hidden)
                }.listStyle(.plain)
                HStack {
                    Toggle(isOn: $nota) { Image(systemName: "note.text") }.toggleStyle(.button)
                    TextField(nota ? "Nota interna" : "Responder por e-mail", text: $texto, axis: .vertical).textFieldStyle(.roundedBorder)
                    Button("Enviar") { Task { await agir(nota ? "Nota salva." : "Resposta enviada.") { _ = try await API.shared.post("/api/site/conversa/responder?email=\(email.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? "")", ["texto": texto, "nota": nota]); texto = ""; await carga.carregar() } } }.disabled(texto.isEmpty)
                }.padding()
            }
            .navigationTitle(d["contato"]["nome"].opcional ?? email).navigationBarTitleDisplayMode(.inline)
        }
    }
}

struct SegurancaView: View {
    @State private var resumo = Carga("/api/seguranca/resumo")
    @State private var tg = Carga("/api/seguranca/telegram?horas=168")
    var body: some View {
        Estado(carga: resumo) { r in
            List {
                Section("Últimos \(r["dias"].i) dias") {
                    ForEach(r["totais"].o.sorted { $0.key < $1.key }, id: \.key) { k, v in LabeledContent(k.replacingOccurrences(of: "_", with: " ").capitalized, value: v.s) }
                }
                Section("Bot do Telegram (7 dias)") {
                    let pt = tg.dados["por_tipo"]
                    LabeledContent("Comandos", value: "\(pt["comando"].i)")
                    LabeledContent("Recusadas", value: "\(pt["negado"].i + pt["flood"].i + pt["pin_errado"].i + pt["identidade"].i)")
                    LabeledContent("Vínculos", value: "\(tg.dados["vinculos"].l.count)")
                    ForEach(tg.dados["ips"].l.prefix(6)) { ip in LabeledContent(ip["ip"].s, value: "\(ip["n"].i) entrega(s)\(ip["telegram"].b ? "" : " · fora do Telegram")") }
                }
                Section { Link("Abrir Segurança no painel", destination: URL(string: "https://app.zynio.com.br/seguranca")!) }
            }
            .task { await tg.carregar() }
        }.navigationTitle("Segurança")
    }
}

struct IntegracoesView: View {
    @State private var carga = Carga("/api/sinric")
    var body: some View {
        Estado(carga: carga) { d in
            List {
                Section("Sinric Pro (Alexa e Google)") {
                    LabeledContent("Conectado", value: d["conectado"].b || d["status"]["conectado"].b ? "sim" : "não")
                    LabeledContent("Aparelhos na Alexa", value: "\(d["aparelhos"].l.count)")
                }
                ForEach(d["aparelhos"].l) { a in LabeledContent(a["nome"].s, value: a["sala"].opcional ?? "") }
            }
        }.navigationTitle("Alexa e Google")
    }
}

struct SupabaseView: View {
    @State private var resumo = Carga("/api/supabase/resumo")
    @State private var rotinas = Carga("/api/supabase/rotinas")
    var body: some View {
        Estado(carga: resumo) { r in
            List {
                Section("Banco") { ForEach(r.o.filter { !$0.value.vazio && $0.value.o.isEmpty && $0.value.l.isEmpty }.sorted { $0.key < $1.key }, id: \.key) { k, v in LabeledContent(k.replacingOccurrences(of: "_", with: " "), value: v.s) } }
                Section("Rotinas (cron)") {
                    ForEach(rotinas.dados.l) { j in
                        HStack {
                            VStack(alignment: .leading) { Text(j["jobname"].s).font(.footnote.weight(.semibold)); Text(j["schedule"].s).font(.caption2).foregroundStyle(.secondary) }
                            Spacer()
                            Button("Rodar") { Task { await agir("Rotina iniciada.") { _ = try await API.shared.post("/api/supabase/rotinas/\(j["jobname"].s)/executar") } } }.buttonStyle(.bordered)
                        }
                    }
                }
            }.task { await rotinas.carregar() }
        }.navigationTitle("Banco")
    }
}
