import Foundation

struct ErroAPI: LocalizedError { let status: Int; let mensagem: String; var errorDescription: String? { mensagem } }

/// Cliente da API do Clima Escritório (a mesma do painel web e dos apps Android e desktop).
/// Bearer = token do Supabase Auth; perto de vencer (ou num 401), renova pelo refresh token e repete uma vez.
@MainActor
final class API {
    static let shared = API()
    static let base = URL(string: "https://app.zynio.com.br")!
    weak var sessao: Sessao?
    private let decoder = JSONDecoder()

    func get(_ caminho: String) async throws -> JSON { try await chamar("GET", caminho) }
    func post(_ caminho: String, _ corpo: [String: Any] = [:]) async throws -> JSON { try await chamar("POST", caminho, corpo) }
    func put(_ caminho: String, _ corpo: Any) async throws -> JSON { try await chamar("PUT", caminho, corpo) }
    func del(_ caminho: String) async throws -> JSON { try await chamar("DELETE", caminho) }

    func chamar(_ metodo: String, _ caminho: String, _ corpo: Any? = nil, tentouRenovar: Bool = false) async throws -> JSON {
        guard let url = URL(string: caminho, relativeTo: API.base) else { throw ErroAPI(status: 0, mensagem: "Endereço inválido.") }
        if !tentouRenovar { await sessao?.renovarSePreciso() }
        var req = URLRequest(url: url, timeoutInterval: 60)
        req.httpMethod = metodo
        req.setValue("ClimaEscritorio-iOS/1.5", forHTTPHeaderField: "User-Agent")
        if let t = sessao?.accessToken { req.setValue("Bearer \(t)", forHTTPHeaderField: "Authorization") }
        if let corpo {
            req.setValue("application/json", forHTTPHeaderField: "Content-Type")
            req.httpBody = try JSONSerialization.data(withJSONObject: corpo)
        }
        let (dados, resp): (Data, URLResponse)
        do { (dados, resp) = try await URLSession.shared.data(for: req) } catch {
            throw ErroAPI(status: 0, mensagem: "Sem conexão com o Clima Escritório. Confira a internet.")
        }
        let status = (resp as? HTTPURLResponse)?.statusCode ?? 0
        let json = (try? decoder.decode(JSON.self, from: dados)) ?? .nulo
        if status == 401, !tentouRenovar, sessao?.refreshToken != nil {
            if await sessao?.renovar() == true { return try await chamar(metodo, caminho, corpo, tentouRenovar: true) }
            sessao?.sair(motivo: "A sessão venceu. Entre de novo.")
        }
        guard (200..<300).contains(status) else {
            let msg = json["detail"].s.isEmpty ? "Erro \(status)" : json["detail"].s
            throw ErroAPI(status: status, mensagem: msg)
        }
        return json
    }
}
