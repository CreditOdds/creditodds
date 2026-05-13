import SwiftUI

/// Routes the unauthenticated browsing flow. Two tabs in the bottom dock
/// (Cards / Card Wire) plus a presented sign-in sheet. Explore was merged
/// into Cards — search + filters live there now via `.searchable()`.
@MainActor
final class UnauthRouter: ObservableObject {
    enum Tab: Hashable, CaseIterable {
        case cards, wire

        var label: String {
            switch self {
            case .cards: return "Cards"
            case .wire:  return "Card Wire"
            }
        }
    }

    @Published var tab: Tab = .cards
    @Published var showSignIn: Bool = false
    @Published var selectedCard: Card? = nil
}
