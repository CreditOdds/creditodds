import Foundation

enum RecentRecordsService {
    /// No auth needed — endpoint is intentionally public for the live
    /// ticker on the unauthenticated Card Wire screen.
    static func fetch() async throws -> [RecentRecord] {
        try await APIClient.shared.get("/recent-records")
    }
}
