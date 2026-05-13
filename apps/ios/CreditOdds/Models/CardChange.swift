import Foundation

/// One row from `/card-wire` — a tracked change to a card's terms
/// (annual fee, sign-up bonus value, APR, accepting_applications, etc).
struct CardChange: Identifiable, Decodable, Hashable {
    let id: Int
    let cardId: Int
    let cardName: String
    let cardImageLink: String?
    /// "annual_fee" | "signup_bonus_value" | "apr_min" | "apr_max" | "accepting_applications"
    let field: String
    let oldValue: String?
    let newValue: String?
    let changedAt: String

    enum CodingKeys: String, CodingKey {
        case id
        case cardId = "card_id"
        case cardName = "card_name"
        case cardImageLink = "card_image_link"
        case field
        case oldValue = "old_value"
        case newValue = "new_value"
        case changedAt = "changed_at"
    }

    // MARK: - Computed display

    /// Pretty label for the field, e.g. "Annual fee", "Sign-up bonus".
    var fieldLabel: String {
        switch field {
        case "annual_fee":             return "Annual fee"
        case "signup_bonus_value":     return "Sign-up bonus"
        case "apr_min":                return "APR min"
        case "apr_max":                return "APR max"
        case "accepting_applications": return "Applications"
        default:                       return field
        }
    }

    enum Group: String, CaseIterable {
        case all, fee, bonus, apr, apps
        var label: String {
            switch self {
            case .all:   return "All"
            case .fee:   return "Annual fee"
            case .bonus: return "Sign-up bonus"
            case .apr:   return "APR"
            case .apps:  return "Applications"
            }
        }
    }

    var group: Group {
        switch field {
        case "annual_fee":             return .fee
        case "signup_bonus_value":     return .bonus
        case "apr_min", "apr_max":     return .apr
        case "accepting_applications": return .apps
        default:                       return .all
        }
    }

    /// "$95 → $0", "70,000 → 80,000 points", "Accepting → Not accepting".
    func formatValue(_ value: String?, bonusType: String? = nil) -> String {
        guard let value, !value.isEmpty else { return "—" }
        switch field {
        case "accepting_applications":
            if value == "1" || value == "true" { return "Accepting" }
            if value == "0" || value == "false" { return "Not accepting" }
            return value
        case "annual_fee":
            if let n = Double(value) {
                return n == 0 ? "$0" : "$\(Int(n).formatted())"
            }
            return value
        case "signup_bonus_value":
            if let n = Double(value) {
                let int = Int(n).formatted()
                if let type = bonusType, !type.isEmpty { return "\(int) \(type)" }
                return int
            }
            return value
        case "apr_min", "apr_max":
            if let n = Double(value) { return "\(formatNum(n))%" }
            return value
        default:
            return value
        }
    }

    /// Semantic direction — informs the green/red coloring on the change.
    enum Direction { case pos, neg, neutral }

    var direction: Direction {
        guard let oldValue, let newValue else { return .neutral }
        if field == "accepting_applications" {
            let wasAccepting = oldValue == "1" || oldValue == "true"
            let nowAccepting = newValue == "1" || newValue == "true"
            if wasAccepting && !nowAccepting { return .neg }
            if !wasAccepting && nowAccepting { return .pos }
            return .neutral
        }
        guard let oldNum = Double(oldValue), let newNum = Double(newValue) else {
            return .neutral
        }
        if oldNum == newNum { return .neutral }
        let increased = newNum > oldNum
        let higherIsBad: Set<String> = ["annual_fee", "apr_min", "apr_max"]
        if higherIsBad.contains(field) { return increased ? .neg : .pos }
        return increased ? .pos : .neg
    }

    /// "2d ago" / "Apr 14" — matches the convention used elsewhere in the app.
    var relativeTimestamp: String {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        let date = formatter.date(from: changedAt)
            ?? ISO8601DateFormatter().date(from: changedAt)
        guard let date else { return "—" }

        let interval = Date().timeIntervalSince(date)
        let minutes = Int(interval / 60)
        if minutes < 1 { return "now" }
        if minutes < 60 { return "\(minutes)m ago" }
        let hours = minutes / 60
        if hours < 24 { return "\(hours)h ago" }
        let days = hours / 24
        if days < 7 { return "\(days)d ago" }
        let f = DateFormatter()
        f.dateFormat = "MMM d"
        return f.string(from: date)
    }

    private func formatNum(_ n: Double) -> String {
        if n.truncatingRemainder(dividingBy: 1) == 0 { return String(Int(n)) }
        return String(format: "%.2f", n)
            .replacingOccurrences(of: #"0+$"#, with: "", options: .regularExpression)
            .replacingOccurrences(of: #"\.$"#, with: "", options: .regularExpression)
    }
}

/// Wire envelope returned by `GET /card-wire`.
struct CardWireResponse: Decodable {
    let changes: [CardChange]
}
