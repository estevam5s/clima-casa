import Foundation
import SwiftUI

enum Fmt {
    static let modos: [(String, String, String)] = [("frio", "Frio", "snowflake"), ("quente", "Quente", "sun.max"), ("ventilar", "Ventilar", "fan"),
                                                    ("seco", "Desumidificar", "drop"), ("auto", "Automático", "a.circle")]
    static let ventilacao: [(String, String)] = [("auto", "Automática"), ("baixa", "Baixa"), ("media", "Média"), ("alta", "Alta")]
    static func modo(_ m: String) -> String { modos.first { $0.0 == m }?.1 ?? m }
    static func icone(_ m: String) -> String { modos.first { $0.0 == m }?.2 ?? "thermometer" }
    static func vent(_ v: String) -> String { ventilacao.first { $0.0 == v }?.1 ?? v }
    static func corModo(_ m: String, ligado: Bool) -> Color {
        guard ligado else { return .gray }
        return ["frio": Color.blue, "quente": .orange, "ventilar": .teal, "seco": .purple, "auto": .green][m] ?? .marca
    }

    static func haQuanto(_ ts: Double) -> String {
        guard ts > 0 else { return "nunca" }
        let s = Date().timeIntervalSince1970 - ts
        if s < 45 { return "agora" }
        if s < 3600 { return "há \(Int(s / 60)) min" }
        if s < 86400 { return "há \(Int(s / 3600)) h" }
        return "há \(Int(s / 86400)) d"
    }
    static func dataHora(_ ts: Double) -> String {
        guard ts > 0 else { return "-" }
        let f = DateFormatter(); f.locale = Locale(identifier: "pt_BR"); f.dateFormat = "dd/MM HH:mm"
        return f.string(from: Date(timeIntervalSince1970: ts))
    }
    static func brl(_ v: Double) -> String {
        let f = NumberFormatter(); f.locale = Locale(identifier: "pt_BR"); f.numberStyle = .currency
        return f.string(from: NSNumber(value: v)) ?? "R$ \(v)"
    }
    static func num(_ v: Double, casas: Int = 1) -> String {
        let f = NumberFormatter(); f.locale = Locale(identifier: "pt_BR"); f.maximumFractionDigits = casas; f.minimumFractionDigits = 0
        return f.string(from: NSNumber(value: v)) ?? "\(v)"
    }
    static func origem(_ o: String) -> String {
        if o.hasPrefix("agenda:") { return "Agenda · \(o.dropFirst(7))" }
        if o.hasPrefix("cena:") { return "Cena · \(o.dropFirst(5))" }
        return ["painel": "Painel", "alexa": "Alexa", "sinric": "Alexa (Sinric)", "sistema": "Sistema", "agente": "Agente", "telegram": "Telegram", "ia": "Assistente", "musica": "Música"][o] ?? o
    }
}

extension Color {
    static let marca = Color(red: 15 / 255, green: 118 / 255, blue: 106 / 255)   // #0f766a, a mesma do painel
    init(hex: String) {
        var v: UInt64 = 0
        Scanner(string: hex.replacingOccurrences(of: "#", with: "")).scanHexInt64(&v)
        self.init(red: Double((v >> 16) & 0xff) / 255, green: Double((v >> 8) & 0xff) / 255, blue: Double(v & 0xff) / 255)
    }
}
