import Foundation
import CoreLocation

/// Projection of a single `/wallet-picks/nearby` merchant for the EarnTab
/// row. Used to live in BestHereRanker (when ranking happened on-device);
/// now it's a thin reshaping of the backend response — the only thing iOS
/// computes is the distance string from the user's coordinates.
struct MerchantPick: Identifiable, Hashable {
    let placeId: String
    let placeName: String
    let address: String?
    let categoryLabel: String
    let categoryId: String
    let distanceMeters: Double?
    let best: WalletPickPlace
    let next: WalletPickPlace?

    var id: String { placeId }

    var distanceText: String? {
        guard let m = distanceMeters else { return nil }
        let mi = m / 1609.34
        if mi < 0.1 { return "<0.1 mi" }
        return String(format: "%.1f mi", mi)
    }
}

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

    /// Wallet + catalog are no longer needed for matching (the backend
    /// does it), but we still gate the "Find best card here" affordance on
    /// the user actually having cards in their wallet — otherwise the
    /// server returns an empty merchants list and we can't explain why
    /// without an extra round-trip.
    func refresh(walletCards: [WalletCard]) async {
        guard !walletCards.isEmpty else {
            state = .empty(reason: "Add cards to your wallet to see merchant recommendations.")
            return
        }
        state = .requesting
        do {
            let loc = try await location.requestOnce()
            let merchants = try await NearbyService.fetch(
                lat: loc.coordinate.latitude,
                lng: loc.coordinate.longitude
            )
            let picks = merchants.map { entry in
                merchantPick(entry: entry, userLocation: loc)
            }
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

    private func merchantPick(entry: NearbyMerchantEntry,
                              userLocation: CLLocation) -> MerchantPick {
        let dist: Double? = {
            guard let lat = entry.place.lat, let lng = entry.place.lng else { return nil }
            let p = CLLocation(latitude: lat, longitude: lng)
            return userLocation.distance(from: p)
        }()
        return MerchantPick(
            placeId: entry.place.id,
            placeName: entry.place.name,
            address: entry.place.address?.split(separator: ",").first.map(String.init),
            categoryLabel: entry.match.label,
            categoryId: entry.match.categoryId,
            distanceMeters: dist,
            best: entry.match.best,
            next: entry.match.next
        )
    }
}
