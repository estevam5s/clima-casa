import SwiftUI

/// Carrega um JSON da API com estados de carregando, erro e "puxar para atualizar".
@MainActor @Observable
final class Carga {
    var dados: JSON = .nulo
    var erro: String?
    var carregando = false
    private let caminho: () -> String
    init(_ caminho: @escaping @autoclosure () -> String) { self.caminho = caminho }
    func carregar() async {
        carregando = true; defer { carregando = false }
        do { dados = try await API.shared.get(caminho()); erro = nil } catch { erro = error.localizedDescription }
    }
}

struct Estado<Conteudo: View>: View {
    let carga: Carga
    @ViewBuilder var conteudo: (JSON) -> Conteudo
    var body: some View {
        Group {
            if carga.dados == .nulo && carga.erro == nil { ProgressView("Carregando…").frame(maxWidth: .infinity, maxHeight: .infinity) }
            else if let e = carga.erro, carga.dados == .nulo { ErroView(texto: e) { Task { await carga.carregar() } } }
            else { conteudo(carga.dados) }
        }
        .task { if carga.dados == .nulo { await carga.carregar() } }
        .refreshable { await carga.carregar() }
    }
}

struct ErroView: View {
    let texto: String
    var tentar: (() -> Void)?
    var body: some View {
        ContentUnavailableView {
            Label("Não deu para carregar", systemImage: "exclamationmark.triangle")
        } description: { Text(texto) } actions: {
            if let tentar { Button("Tentar de novo", action: tentar).buttonStyle(.borderedProminent).tint(.marca) }
        }
    }
}

struct Vazio: View {
    let titulo: String, texto: String, icone: String
    var body: some View { ContentUnavailableView(titulo, systemImage: icone, description: Text(texto)) }
}

struct Selo: View {
    let texto: String
    var cor: Color = .secondary
    var body: some View {
        Text(texto).font(.caption2.weight(.semibold)).padding(.horizontal, 7).padding(.vertical, 3)
            .background(cor.opacity(0.15), in: Capsule()).foregroundStyle(cor)
    }
}

struct Metrica: View {
    let rotulo: String, valor: String
    var dica: String = ""
    var icone: String = ""
    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Label(rotulo, systemImage: icone).font(.caption).foregroundStyle(.secondary).labelStyle(.titleAndIcon)
            Text(valor).font(.title2.weight(.semibold)).monospacedDigit()
            if !dica.isEmpty { Text(dica).font(.caption2).foregroundStyle(.secondary).lineLimit(1) }
        }
        .frame(maxWidth: .infinity, alignment: .leading).padding(14)
        .background(.background.secondary, in: RoundedRectangle(cornerRadius: 14))
    }
}

/// Aviso rápido no rodapé (como o toast do painel).
@MainActor @Observable
final class Aviso {
    static let shared = Aviso()
    var texto: String?
    var erro = false
    func mostrar(_ t: String, erro: Bool = false) {
        texto = t; self.erro = erro
        Task { try? await Task.sleep(for: .seconds(3)); if self.texto == t { self.texto = nil } }
    }
}

struct AvisoOverlay: ViewModifier {
    @State private var aviso = Aviso.shared
    func body(content: Content) -> some View {
        content.overlay(alignment: .bottom) {
            if let t = aviso.texto {
                Text(t).font(.subheadline.weight(.medium)).foregroundStyle(.white).padding(.horizontal, 16).padding(.vertical, 10)
                    .background(aviso.erro ? Color.red : Color.marca, in: Capsule()).padding(.bottom, 90)
                    .transition(.move(edge: .bottom).combined(with: .opacity))
            }
        }
        .animation(.spring(duration: 0.3), value: aviso.texto)
    }
}

/// Executa uma ação da API com aviso de sucesso/erro e vibração.
@MainActor
func agir(_ msg: String, _ acao: @escaping () async throws -> Void) async {
    do {
        try await acao()
        UIImpactFeedbackGenerator(style: .light).impactOccurred()
        Aviso.shared.mostrar(msg)
    } catch {
        UINotificationFeedbackGenerator().notificationOccurred(.error)
        Aviso.shared.mostrar(error.localizedDescription, erro: true)
    }
}
