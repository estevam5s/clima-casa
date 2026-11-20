import SwiftUI

struct LoginView: View {
    @Environment(Sessao.self) private var sessao
    var body: some View {
        VStack(spacing: 22) {
            Spacer()
            Image(systemName: "snowflake").font(.system(size: 54, weight: .light)).foregroundStyle(.white)
                .frame(width: 96, height: 96).background(Color.marca, in: RoundedRectangle(cornerRadius: 24))
            VStack(spacing: 6) {
                Text("Clima Escritório").font(.largeTitle.weight(.semibold))
                Text("Os ares do escritório no seu iPhone: ligar, desligar, agenda, cenas e o Assistente de IA.")
                    .font(.subheadline).foregroundStyle(.secondary).multilineTextAlignment(.center).padding(.horizontal, 24)
            }
            Spacer()
            if let e = sessao.erro { Text(e).font(.footnote).foregroundStyle(.red).multilineTextAlignment(.center).padding(.horizontal) }
            Button { Task { await sessao.entrar() } } label: {
                HStack { if sessao.entrando { ProgressView().tint(.white) }; Text("Entrar") .fontWeight(.semibold) }
                    .frame(maxWidth: .infinity).padding(.vertical, 14)
            }
            .buttonStyle(.borderedProminent).tint(.marca).padding(.horizontal, 24).disabled(sessao.entrando)
            Text("Abre a página segura do Clima Escritório (com a verificação anti-robô). E-mail e senha, Google ou biometria: o que você já usa no painel.")
                .font(.caption).foregroundStyle(.secondary).multilineTextAlignment(.center).padding(.horizontal, 32).padding(.bottom, 24)
        }
    }
}

struct BloqueioView: View {
    @Environment(Sessao.self) private var sessao
    var body: some View {
        VStack(spacing: 18) {
            Image(systemName: "faceid").font(.system(size: 60)).foregroundStyle(Color.marca)
            Text("Clima Escritório travado").font(.title3.weight(.semibold))
            Button("Destravar") { Task { await sessao.destravar() } }.buttonStyle(.borderedProminent).tint(.marca)
            Button("Sair da conta", role: .destructive) { sessao.sair() }.font(.footnote)
        }
        .task { await sessao.destravar() }
    }
}
