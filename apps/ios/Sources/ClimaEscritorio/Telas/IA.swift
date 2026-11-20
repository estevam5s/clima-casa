import SwiftUI

struct MsgIA: Identifiable { let id = UUID(); let papel: String; let texto: String; var confirmacoes: [JSON] = []; var erro = false }

/// Assistente de IA: a mesma conversa do painel (/ia), com a escolha entre os modelos gratuitos da NVIDIA.
struct IAView: View {
    @State private var estado = Carga("/api/ia/estado")
    @State private var msgs: [MsgIA] = []
    @State private var texto = ""
    @State private var pensando = false
    @State private var modelo = ""
    @State private var conversa: Int?
    @FocusState private var foco: Bool

    var body: some View {
        Estado(carga: estado) { e in
            VStack(spacing: 0) {
                ScrollViewReader { rolar in
                    ScrollView {
                        LazyVStack(alignment: .leading, spacing: 14) {
                            if msgs.isEmpty {
                                VStack(spacing: 10) {
                                    Image(systemName: "sparkles").font(.largeTitle).foregroundStyle(Color.marca)
                                    Text("Pergunte ou peça").font(.title3.weight(.semibold))
                                    Text("Ele vê o estado real dos ares e só faz o que o seu usuário pode.").font(.subheadline).foregroundStyle(.secondary).multilineTextAlignment(.center)
                                    ForEach(["Quais ares estão ligados agora?", "Coloca o ar do diretor em 23 graus", "Quanto gastamos nesta semana?", "Por que os comandos não estão chegando?"], id: \.self) { s in
                                        Button(s) { texto = s; enviar() }.buttonStyle(.bordered).font(.footnote)
                                    }
                                }.frame(maxWidth: .infinity).padding(.top, 40)
                            }
                            ForEach($msgs) { $m in Bolha(m: $m) }
                            if pensando { HStack { ProgressView(); Text("Consultando o sistema…").font(.footnote).foregroundStyle(.secondary) } }
                            Color.clear.frame(height: 1).id("fim")
                        }.padding()
                    }
                    .onChange(of: msgs.count) { withAnimation { rolar.scrollTo("fim") } }
                }
                Divider()
                HStack(alignment: .bottom, spacing: 8) {
                    TextField("Mensagem", text: $texto, axis: .vertical).lineLimit(1...5).focused($foco)
                        .padding(10).background(.background.secondary, in: RoundedRectangle(cornerRadius: 18))
                    Button { enviar() } label: { Image(systemName: "arrow.up.circle.fill").font(.system(size: 32)) }
                        .disabled(texto.trimmingCharacters(in: .whitespaces).isEmpty || pensando || !e["configurada"].b)
                }.padding(10)
            }
            .onAppear { if modelo.isEmpty { modelo = e["modelo"].s } }
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Menu {
                        ForEach(e["modelos"].l) { m in
                            Button { modelo = m["id"].s } label: {
                                Label("\(m["nome"].s)\(m["ferramentas"].b ? "" : " · só texto")", systemImage: modelo == m["id"].s ? "checkmark" : "cpu")
                            }
                        }
                    } label: { Label(e["modelos"].l.first { $0["id"].s == modelo }?["nome"].s ?? "Modelo", systemImage: "cpu").labelStyle(.titleAndIcon).font(.footnote) }
                }
                ToolbarItem(placement: .topBarLeading) { Button { msgs = []; conversa = nil } label: { Image(systemName: "square.and.pencil") } }
            }
        }
        .navigationTitle("Assistente").navigationBarTitleDisplayMode(.inline)
    }

    private func enviar() {
        let q = texto.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !q.isEmpty else { return }
        msgs.append(MsgIA(papel: "user", texto: q)); texto = ""; pensando = true
        let hist = msgs.filter { !$0.erro }.suffix(20).map { ["role": $0.papel, "content": String($0.texto.prefix(4000))] }
        Task {
            defer { pensando = false }
            do {
                var corpo: [String: Any] = ["mensagens": Array(hist), "modelo": modelo]
                if let conversa { corpo["conversa_id"] = conversa }
                let r = try await API.shared.post("/api/ia/conversar", corpo)
                if r["conversa_id"].i > 0 { conversa = r["conversa_id"].i }
                msgs.append(MsgIA(papel: "assistant", texto: r["texto"].s, confirmacoes: r["confirmacoes"].l))
            } catch { msgs.append(MsgIA(papel: "assistant", texto: error.localizedDescription, erro: true)) }
        }
    }
}

struct Bolha: View {
    @Binding var m: MsgIA
    var body: some View {
        VStack(alignment: m.papel == "user" ? .trailing : .leading, spacing: 8) {
            Text(LocalizedStringKey(m.texto)).font(.body).textSelection(.enabled)
                .padding(m.papel == "user" ? 12 : 0)
                .background(m.papel == "user" ? AnyShapeStyle(.background.secondary) : AnyShapeStyle(.clear), in: RoundedRectangle(cornerRadius: 16))
                .foregroundStyle(m.erro ? .red : .primary)
            ForEach(Array(m.confirmacoes.enumerated()), id: \.offset) { i, c in
                VStack(alignment: .leading, spacing: 8) {
                    Text(c["descricao"].s).font(.subheadline.weight(.medium))
                    HStack {
                        Button("Confirmar") { Task { await agir("Feito.") { _ = try await API.shared.post("/api/ia/confirmar", ["confirmacao": c["confirmacao"].s]); m.confirmacoes.remove(at: i) } } }.buttonStyle(.borderedProminent).tint(.marca)
                        Button("Cancelar", role: .cancel) { m.confirmacoes.remove(at: i) }.buttonStyle(.bordered)
                    }
                }.padding(12).background(.orange.opacity(0.12), in: RoundedRectangle(cornerRadius: 12))
            }
        }
        .frame(maxWidth: .infinity, alignment: m.papel == "user" ? .trailing : .leading)
    }
}
