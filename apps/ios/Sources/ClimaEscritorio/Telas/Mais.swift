import SwiftUI

struct MaisView: View {
    @Environment(Sessao.self) private var sessao
    var body: some View {
        List {
            Section("Escritório") {
                NavigationLink { SalasView() } label: { Label("Salas", systemImage: "rectangle.split.3x1") }
                NavigationLink { TransmissoresView() } label: { Label("Transmissores", systemImage: "dot.radiowaves.left.and.right") }
                NavigationLink { DispositivosView(tipo: "luz", titulo: "Luzes") } label: { Label("Luzes e interruptores", systemImage: "lightbulb") }
                NavigationLink { DispositivosView(tipo: "persiana", titulo: "Persianas") } label: { Label("Persianas", systemImage: "blinds.horizontal.closed") }
                NavigationLink { DispositivosView(tipo: "cafeteira", titulo: "Cafeteira") } label: { Label("Cafeteira", systemImage: "cup.and.saucer") }
                NavigationLink { DispositivosView(tipo: "fechadura", titulo: "Fechadura") } label: { Label("Fechadura", systemImage: "lock") }
                NavigationLink { MusicaView() } label: { Label("Música", systemImage: "music.note") }
            }
            Section("Automação") {
                NavigationLink { AgendaView() } label: { Label("Agenda", systemImage: "calendar") }
                NavigationLink { AutomacoesView() } label: { Label("Automações", systemImage: "point.3.connected.trianglepath.dotted") }
            }
            Section("Acompanhar") {
                NavigationLink { NotificacoesView() } label: { Label("Notificações", systemImage: "bell") }
                NavigationLink { AtividadeView() } label: { Label("Atividade", systemImage: "list.bullet.rectangle") }
                NavigationLink { AlertasView() } label: { Label("Alertas", systemImage: "exclamationmark.triangle") }
                if sessao.pode("mensagens.ver") { NavigationLink { MensagensView() } label: { Label("Mensagens e Kanban", systemImage: "bubble.left.and.bubble.right") } }
                NavigationLink { NovidadesView() } label: { Label("Novidades", systemImage: "sparkle") }
                NavigationLink { UsoIAView() } label: { Label("Uso da IA", systemImage: "gauge.with.dots.needle.50percent") }
                NavigationLink { BugsView() } label: { Label("Bugs", systemImage: "ladybug") }
                Link(destination: URL(string: "https://github.com/estevam5s/clima-casa")!) { Label("Código no GitHub", systemImage: "chevron.left.forwardslash.chevron.right") }
            }
            if ["dono", "admin"].contains(sessao.papel) || sessao.pode("seguranca.gerenciar") {
                Section("Administração") {
                    NavigationLink { SegurancaView() } label: { Label("Segurança", systemImage: "shield.lefthalf.filled") }
                    NavigationLink { IntegracoesView() } label: { Label("Alexa e Google", systemImage: "waveform") }
                    NavigationLink { SupabaseView() } label: { Label("Banco (Supabase)", systemImage: "cylinder.split.1x2") }
                }
            }
            Section("Conta") {
                NavigationLink { ContaView() } label: { Label(sessao.nome, systemImage: "person.crop.circle") }
            }
        }
        .navigationTitle("Mais")
    }
}

struct ContaView: View {
    @Environment(Sessao.self) private var sessao
    var body: some View {
        @Bindable var s = sessao
        Form {
            Section("Você") {
                LabeledContent("Nome", value: sessao.nome)
                LabeledContent("E-mail", value: sessao.usuario["email"].s)
                LabeledContent("Papel", value: sessao.usuario["papel_rotulo"].opcional ?? sessao.papel)
                LabeledContent("Duas etapas", value: sessao.usuario["totp_ativo"].b ? "ativa" : "desligada")
            }
            Section { Toggle("Travar com Face ID / Touch ID", isOn: $s.biometria) } footer: { Text("Ao voltar para o app, pede a biometria do iPhone.") }
            Section { Link("Abrir o painel no navegador", destination: URL(string: "https://app.zynio.com.br")!) }
            Section { Button("Sair", role: .destructive) { sessao.sair() } }
            Section { LabeledContent("Versão", value: Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "-") }
        }
        .navigationTitle("Conta")
    }
}
