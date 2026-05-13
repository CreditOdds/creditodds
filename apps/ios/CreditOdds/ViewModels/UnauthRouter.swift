import SwiftUI

/// Routes the unauthenticated browsing flow. Three tabs in the bottom dock
/// (Cards / Explore / Card Wire) plus a presented sign-in sheet.
@MainActor
final class UnauthRouter: ObservableObject {
    enum Tab: Hashable, CaseIterable {
        case cards, explore, wire

        var label: String {
            switch self {
            case .cards:   return "Cards"
            case .explore: return "Explore"
            case .wire:    return "Card Wire"
            }
        }
    }

    @Published var tab: Tab = .cards
    @Published var showSignIn: Bool = false
    @Published var selectedCard: Card? = nil
}
