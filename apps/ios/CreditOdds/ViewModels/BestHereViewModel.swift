import Foundation
import CoreLocation

@MainActor
final class BestHereViewModel: ObservableObject {
    enum State {
        case idle
        case requesting
        case loaded(picks: [MerchantPick], at: Date)
        case empty(reason: String)
        case error(String)
    }

    @Published var state: State = .idle
    private let location = LocationService()

    var canRefresh: Bool {
        if case .requesting = state { return false }
        return true
    }

    func refresh(walletCards: [WalletCard], allCards: [Card]) async {
        guard !walletCards.isEmpty else {
            state = .empty(reason: "Add cards to your wallet to see merchant recommendations.")
            return
        }
        guard !allCards.isEmpty else {
            state = .empty(reason: "Card catalog still loading…")
            return
        }
        state = .requesting
        do {
            let loc = try await location.requestOnce()
            let places = try await NearbyService.fetch(
                lat: loc.coordinate.latitude,
                lng: loc.coordinate.longitude
            )
            let picks = BestHereRanker.picks(
                for: places,
                walletCards: walletCards,
                allCards: allCards,
                userLocation: loc
            )
            if picks.isEmpty {
                state = .empty(reason: "No nearby merchants matched a category your wallet earns on.")
            } else {
                state = .loaded(picks: picks, at: Date())
            }
        } catch let err as LocationService.LocationError {
            state = .error(err.localizedDescription)
        } catch {
            state = .error(error.localizedDescription)
        }
    }
}
