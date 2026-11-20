import SwiftUI

@main
struct ClimaEscritorioApp: App {
    @State private var sessao = Sessao()
    @Environment(\.scenePhase) private var fase

    var body: some Scene {
        WindowGroup {
            Group {
                if !sessao.logado { LoginView() }
                else if sessao.travado { BloqueioView() }
                else { AbasView() }
            }
            .environment(sessao)
            .tint(.marca)
            .modifier(AvisoOverlay())
            .task { if sessao.logado { await sessao.carregarUsuario() } }
            .onChange(of: fase) { _, nova in if nova == .background && sessao.biometria && sessao.logado { sessao.travado = true } }
        }
    }
}

struct AbasView: View {
    @State private var aba: Int = {
        #if DEBUG
        return Int(ProcessInfo.processInfo.environment["CLIMA_TESTE_ABA"] ?? "0") ?? 0
        #else
        return 0
        #endif
    }()
    var body: some View {
        TabView(selection: $aba) {
            NavigationStack { InicioView() }.tabItem { Label("Início", systemImage: "house") }.tag(0)
            NavigationStack { AparelhosView() }.tabItem { Label("Aparelhos", systemImage: "air.conditioner.horizontal") }.tag(1)
            NavigationStack { CenasView() }.tabItem { Label("Cenas", systemImage: "sparkles") }.tag(2)
            NavigationStack { IAView() }.tabItem { Label("Assistente", systemImage: "bubble.left.and.text.bubble.right") }.tag(3)
            NavigationStack { MaisView() }.tabItem { Label("Mais", systemImage: "square.grid.2x2") }.tag(4)
        }
    }
}
