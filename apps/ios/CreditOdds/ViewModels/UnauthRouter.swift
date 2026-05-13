import SwiftUI

/// Tab state for the unauthenticated browsing flow. Just holds the
/// current dock selection — sign-in and card-detail presentation are
/// owned by the screens themselves so they work in any context (signed
/// in or out).
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
}
