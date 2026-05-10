import Foundation

enum CardService {
    static func all() async throws -> [Card] {
        try await APIClient.shared.get("/cards")
    }
}

/// Process-wide cache for the full card catalog. The /cards response is
/// large and rarely changes — the web side relies on Next.js ISR for the
/// same effect. We hold one in-memory copy and let callers `await` it.
@MainActor
final class CardsRepository: ObservableObject {
    static let shared = CardsRepository()

    @Published private(set) var cards: [Card] = []
    @Published private(set) var isLoading = false
    @Published private(set) var errorMessage: String?

    private var loadTask: Task<[Card], Error>?

    func loadIfNeeded() async {
        if !cards.isEmpty || isLoading { return }
        await load()
    }

    func load() async {
        if let existing = loadTask {
            _ = try? await existing.value
            return
        }
        isLoading = true
        errorMessage = nil
        let task = Task<[Card], Error> { try await CardService.all() }
        loadTask = task
        defer {
            isLoading = false
            loadTask = nil
        }
        do {
            let result = try await task.value
            self.cards = result
        } catch {
            self.errorMessage = error.localizedDescription
        }
    }
}
