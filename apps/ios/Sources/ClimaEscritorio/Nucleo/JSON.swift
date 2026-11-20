import Foundation

/// JSON dinâmico: as telas leem só os campos que usam, e um campo novo ou ausente na API não derruba o app
/// (com Codable rígido, qualquer mudança no backend quebraria a decodificação inteira).
enum JSON: Decodable, Equatable, Hashable, Sendable {
    case nulo, bool(Bool), num(Double), texto(String), lista([JSON]), obj([String: JSON])

    init(from d: Decoder) throws {
        let c = try d.singleValueContainer()
        if c.decodeNil() { self = .nulo }
        else if let b = try? c.decode(Bool.self) { self = .bool(b) }
        else if let n = try? c.decode(Double.self) { self = .num(n) }
        else if let s = try? c.decode(String.self) { self = .texto(s) }
        else if let l = try? c.decode([JSON].self) { self = .lista(l) }
        else if let o = try? c.decode([String: JSON].self) { self = .obj(o) }
        else { self = .nulo }
    }

    subscript(_ k: String) -> JSON { if case .obj(let o) = self { return o[k] ?? .nulo }; return .nulo }
    subscript(_ i: Int) -> JSON { if case .lista(let l) = self, l.indices.contains(i) { return l[i] }; return .nulo }

    var s: String { switch self { case .texto(let v): v; case .num(let n): n == n.rounded() ? String(Int(n)) : String(n); case .bool(let b): b ? "sim" : "não"; default: "" } }
    var i: Int { switch self { case .num(let n): Int(n); case .texto(let v): Int(v) ?? 0; case .bool(let b): b ? 1 : 0; default: 0 } }
    var d: Double { switch self { case .num(let n): n; case .texto(let v): Double(v) ?? 0; default: 0 } }
    var b: Bool { switch self { case .bool(let v): v; case .num(let n): n != 0; case .texto(let v): !v.isEmpty && v != "0"; default: false } }
    var l: [JSON] { if case .lista(let v) = self { return v }; return [] }
    var o: [String: JSON] { if case .obj(let v) = self { return v }; return [:] }
    var vazio: Bool { switch self { case .nulo: true; case .texto(let v): v.isEmpty; case .lista(let v): v.isEmpty; case .obj(let v): v.isEmpty; default: false } }
    var opcional: String? { vazio ? nil : s }
}

extension JSON: Identifiable { var id: String { self["id"].s.isEmpty ? String(hashValue) : self["id"].s } }
