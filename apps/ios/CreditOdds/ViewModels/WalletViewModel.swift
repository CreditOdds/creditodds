import Foundation

@MainActor
final class WalletViewModel: ObservableObject {
    @Published var cards: [WalletCard] = []
    @Published var isLoading = false
    @Published var errorMessage: String?

    func load() async {
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }
        do {
            cards = try await WalletService.fetch()
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func remove(_ card: WalletCard) async {
        do {
            _ = try await WalletService.remove(walletRowId: card.id)
            cards.removeAll { $0.id == card.id }
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}
