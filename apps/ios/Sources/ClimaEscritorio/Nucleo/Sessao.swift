import AuthenticationServices
import CryptoKit
import Foundation
import LocalAuthentication
import Observation
import SwiftUI

/// Sessão: login pelo navegador com PKCE (o login por senha passa pelo CAPTCHA, que só funciona num navegador),
/// tokens no Keychain, renovação automática e trava por Face ID / Touch ID.
@MainActor @Observable
final class Sessao: NSObject, ASWebAuthenticationPresentationContextProviding {
    var accessToken: String? { didSet { gravar() } }
    var refreshToken: String? { didSet { gravar() } }
    var expiraEm: Double = 0
    var usuario: JSON = .nulo
    var erro: String?
    var entrando = false
    var travado = false
    var biometria: Bool { didSet { UserDefaults.standard.set(biometria, forKey: "biometria") } }
    private var chavePublica: String?
    private var sessaoWeb: ASWebAuthenticationSession?

    var logado: Bool { accessToken != nil }
    var nome: String { usuario["nome"].s.isEmpty ? usuario["email"].s : usuario["nome"].s }
    var papel: String { usuario["papel"].s }
    func pode(_ p: String) -> Bool { ["dono", "admin"].contains(papel) || usuario["permissoes"].l.contains { $0.s == p } }

    override init() {
        biometria = UserDefaults.standard.bool(forKey: "biometria")
        super.init()
        accessToken = Chaveiro.ler("access")
        refreshToken = Chaveiro.ler("refresh")
        expiraEm = Double(Chaveiro.ler("expira") ?? "0") ?? 0
        #if DEBUG
        // só em build de depuração (simulador nos testes): sessão temporária passada por variável de ambiente
        if let t = ProcessInfo.processInfo.environment["CLIMA_TESTE_TOKEN"] {
            accessToken = t; refreshToken = ProcessInfo.processInfo.environment["CLIMA_TESTE_REFRESH"]; expiraEm = Date().timeIntervalSince1970 + 3000
        }
        #endif
        travado = logado && biometria
        API.shared.sessao = self
    }

    private func gravar() {
        if let a = accessToken { Chaveiro.salvar(a, chave: "access") } else { Chaveiro.apagar("access") }
        if let r = refreshToken { Chaveiro.salvar(r, chave: "refresh") } else { Chaveiro.apagar("refresh") }
        Chaveiro.salvar(String(expiraEm), chave: "expira")
    }

    func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
        UIApplication.shared.connectedScenes.compactMap { ($0 as? UIWindowScene)?.keyWindow }.first ?? ASPresentationAnchor()
    }

    // ---------- login pelo navegador (PKCE) ----------
    func entrar() async {
        erro = nil; entrando = true
        defer { entrando = false }
        var bytes = [UInt8](repeating: 0, count: 48)
        _ = SecRandomCopyBytes(kSecRandomDefault, bytes.count, &bytes)
        let verificador = bytes.map { String(format: "%02x", $0) }.joined()
        let desafio = SHA256.hash(data: Data(verificador.utf8)).map { String(format: "%02x", $0) }.joined()
        guard let url = URL(string: "/entrar-app?desafio=\(desafio)", relativeTo: API.base) else { return }
        do {
            let volta: URL = try await withCheckedThrowingContinuation { cont in
                let s = ASWebAuthenticationSession(url: url, callbackURLScheme: "climacasa") { u, e in
                    if let u { cont.resume(returning: u) } else { cont.resume(throwing: e ?? ErroAPI(status: 0, mensagem: "Login cancelado.")) }
                }
                s.presentationContextProvider = self
                s.prefersEphemeralWebBrowserSession = false
                sessaoWeb = s
                s.start()
            }
            guard let codigo = URLComponents(url: volta, resolvingAgainstBaseURL: false)?.queryItems?.first(where: { $0.name == "codigo" })?.value else {
                erro = "O site não devolveu o código. Tente de novo."; return
            }
            let r = try await API.shared.chamar("POST", "/api/apps/login/trocar", ["codigo": codigo, "verificador": verificador], tentouRenovar: true)
            aplicar(r)
            await carregarUsuario()
            _ = try? await API.shared.post("/api/sessao/registrar-login", ["metodo": "ios"])
        } catch let e as ASWebAuthenticationSessionError where e.code == .canceledLogin {
            return
        } catch {
            erro = error.localizedDescription
        }
    }

    private func aplicar(_ r: JSON) {
        accessToken = r["access_token"].opcional
        refreshToken = r["refresh_token"].opcional ?? refreshToken
        expiraEm = r["expires_at"].d > 0 ? r["expires_at"].d : Date().timeIntervalSince1970 + max(60, r["expires_in"].d)
        gravar()
    }

    func carregarUsuario() async {
        if let u = try? await API.shared.get("/api/sessao") { usuario = u }
    }

    // ---------- renovação (Supabase Auth, refresh_token) ----------
    func renovarSePreciso() async {
        if logado, expiraEm > 0, expiraEm - Date().timeIntervalSince1970 < 90 { _ = await renovar() }
    }

    @discardableResult
    func renovar() async -> Bool {
        guard let rt = refreshToken else { return false }
        do {
            if chavePublica == nil {
                let c = try await API.shared.chamar("GET", "/api/supabase-config", tentouRenovar: true)
                chavePublica = c["chave"].opcional
                urlSupabase = c["url"].opcional
            }
            guard let chave = chavePublica, let base = urlSupabase, let url = URL(string: "\(base)/auth/v1/token?grant_type=refresh_token") else { return false }
            var req = URLRequest(url: url)
            req.httpMethod = "POST"
            req.setValue(chave, forHTTPHeaderField: "apikey")
            req.setValue("application/json", forHTTPHeaderField: "Content-Type")
            req.httpBody = try JSONSerialization.data(withJSONObject: ["refresh_token": rt])
            let (d, resp) = try await URLSession.shared.data(for: req)
            guard (resp as? HTTPURLResponse)?.statusCode == 200 else { return false }
            aplicar(try JSONDecoder().decode(JSON.self, from: d))
            return true
        } catch { return false }
    }
    private var urlSupabase: String?

    func sair(motivo: String? = nil) {
        accessToken = nil; refreshToken = nil; expiraEm = 0; usuario = .nulo; travado = false
        erro = motivo
    }

    // ---------- Face ID / Touch ID ----------
    func destravar() async {
        let ctx = LAContext()
        var e: NSError?
        guard ctx.canEvaluatePolicy(.deviceOwnerAuthentication, error: &e) else { travado = false; return }
        if (try? await ctx.evaluatePolicy(.deviceOwnerAuthentication, localizedReason: "Abrir o Clima Escritório")) == true { travado = false }
    }
}
