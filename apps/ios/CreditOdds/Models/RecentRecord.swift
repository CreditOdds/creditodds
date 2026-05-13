import Foundation

/// Card Wire ticker row — a single approve/deny event surfaced on the
/// unauthenticated Card Wire screen. Returned by `GET /recent-records`.
struct RecentRecord: Identifiable, Decodable, Hashable {
    let recordId: Int
    /// 1 = approved, 0 = denied.
    let result: Int
    let creditScore: Int
    let listedIncome: Double
    /// ISO-8601 UTC string (e.g. "2026-05-09T07:21:13.000Z").
    let submitDatetime: String
    let cardName: String
    let cardImageLink: String?
    let bank: String?

    var id: Int { recordId }

    var isApproved: Bool { result == 1 }

    /// "720–740" bucketed credit score band for the ticker row subtitle.
    var creditScoreBucket: String {
        let lo = (creditScore / 20) * 20
        if creditScore >= 780 { return "780+" }
        return "\(lo)–\(lo + 20)"
    }

    /// "$80–100k" bucketed income band — keeps the ticker readable
    /// without surfacing exact reported incomes.
    var incomeBucket: String {
        let income = Int(listedIncome)
        switch income {
        case 0..<30_000:        return "<$30k"
        case 30_000..<40_000:   return "$30–40k"
        case 40_000..<50_000:   return "$40–50k"
        case 50_000..<60_000:   return "$50–60k"
        case 60_000..<80_000:   return "$60–80k"
        case 80_000..<100_000:  return "$80–100k"
        case 100_000..<120_000: return "$100–120k"
        case 120_000..<150_000: return "$120–150k"
        case 150_000..<200_000: return "$150–200k"
        default:                return "$200k+"
        }
    }

    /// "2m ago" / "3h ago" / "Apr 14" relative timestamp for the ticker.
    var relativeTimestamp: String {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        let date = formatter.date(from: submitDatetime)
            ?? ISO8601DateFormatter().date(from: submitDatetime)
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
}
