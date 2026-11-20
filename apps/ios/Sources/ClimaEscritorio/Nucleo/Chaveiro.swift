import Foundation
import Security

/// Tokens da sessão no Keychain (só neste aparelho, nunca no iCloud nem em backup não cifrado).
enum Chaveiro {
    static let servico = "com.estevam5s.climaescritorio.sessao"

    static func salvar(_ valor: String, chave: String) {
        let base: [String: Any] = [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: servico, kSecAttrAccount as String: chave]
        SecItemDelete(base as CFDictionary)
        var novo = base
        novo[kSecValueData as String] = Data(valor.utf8)
        novo[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        SecItemAdd(novo as CFDictionary, nil)
    }

    static func ler(_ chave: String) -> String? {
        let q: [String: Any] = [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: servico, kSecAttrAccount as String: chave,
                                kSecReturnData as String: true, kSecMatchLimit as String: kSecMatchLimitOne]
        var r: AnyObject?
        guard SecItemCopyMatching(q as CFDictionary, &r) == errSecSuccess, let d = r as? Data else { return nil }
        return String(data: d, encoding: .utf8)
    }

    static func apagar(_ chave: String) {
        SecItemDelete([kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: servico, kSecAttrAccount as String: chave] as CFDictionary)
    }
}
