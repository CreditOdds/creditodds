import SwiftUI

/// Cards / "Wallet" tab — design screens 8 (empty) and 9 (populated).
/// Active and archived cards split into separate sections; archived is
/// collapsed by default behind a "Show archived" button.
///
/// Note: delete-from-wallet is intentionally not exposed in iOS for now.
/// Users manage card removal on the web; iOS reads the same wallet but
/// avoids destructive operations until we land a proper confirm flow.
struct WalletTab: View {
    @StateObject private var vm = WalletViewModel()
    @StateObject private var catalog = CardsRepository.shared
    @State private var showAddSheet = false
    @State private var showArchived = false

    /// A wallet card is "archived" when the underlying catalog entry has
    /// `accepting_applications == false` — i.e. the card is no longer
    /// open to new applicants. We cross-reference by name because the
    /// /wallet response doesn't include this flag.
    private func isArchived(_ card: WalletCard) -> Bool {
        guard !catalog.cards.isEmpty,
              let master = catalog.cards.first(where: { $0.cardName == card.cardName })
        else { return false }
        return master.acceptingApplications == false
    }

    private var partition: (active: [WalletCard], archived: [WalletCard]) {
        var active: [WalletCard] = []
        var archived: [WalletCard] = []
        for c in vm.cards {
            if isArchived(c) { archived.append(c) } else { active.append(c) }
        }
        return (active, archived)
    }

    var body: some View {
        NavigationStack {
            ZStack {
                Theme.Palette.surface2.ignoresSafeArea()

                Group {
                    if vm.isLoading && vm.cards.isEmpty {
                        ProgressView()
                            .controlSize(.large)
                            .frame(maxWidth: .infinity, maxHeight: .infinity)
                    } else if vm.cards.isEmpty {
                        WalletEmptyState(onAdd: handleAdd)
                    } else {
                        WalletPopulatedView(
                            active: partition.active,
                            archived: partition.archived,
                            showArchived: $showArchived
                        )
                        .refreshable {
                            async let w: Void = vm.load()
                            async let c: Void = catalog.load()
                            _ = await (w, c)
                        }
                    }
                }
            }
            .navigationTitle("Wallet")
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button(action: handleAdd) {
                        Image(systemName: "plus")
                            .font(.system(size: 18, weight: .semibold))
                            .foregroundStyle(Theme.Palette.accent)
                            .frame(width: 36, height: 36)
                            .background(Theme.Palette.accentTint)
                            .clipShape(Circle())
                    }
                    .accessibilityLabel("Add card")
                }
            }
            .task {
                async let w: Void = vm.load()
                async let c: Void = catalog.loadIfNeeded()
                _ = await (w, c)
            }
            .alert("Error",
                   isPresented: .constant(vm.errorMessage != nil),
                   actions: { Button("OK") { vm.errorMessage = nil } },
                   message: { Text(vm.errorMessage ?? "") })
            .sheet(isPresented: $showAddSheet) {
                AddToWalletSheet {
                    Task { await vm.load() }
                }
            }
        }
    }

    private func handleAdd() {
        showAddSheet = true
    }
}

// MARK: - Empty state (screen 8)

private struct WalletEmptyState: View {
    let onAdd: () -> Void

    var body: some View {
        VStack(spacing: Theme.Spacing.m) {
            Spacer().frame(height: 80)

            Image(systemName: "creditcard")
                .font(.system(size: 68, weight: .ultraLight))
                .foregroundStyle(Theme.Palette.muted2)
                .padding(.bottom, Theme.Spacing.s)

            Text("Your wallet is empty")
                .font(Theme.Font.title2)
                .foregroundStyle(Theme.Palette.ink)

            Text("Add a card to start tracking earn rates and benefits.")
                .font(.system(size: 14.5))
                .foregroundStyle(Theme.Palette.muted)
                .multilineTextAlignment(.center)
                .lineSpacing(2)
                .frame(maxWidth: 280)

            Button("Add a card", action: onAdd)
                .font(.system(size: 15, weight: .semibold))
                .foregroundStyle(Theme.Palette.accent)
                .padding(.top, Theme.Spacing.l)

            Spacer()
        }
        .padding(.horizontal, Theme.Spacing.xxl)
    }
}

// MARK: - Populated wallet (screen 9)

private struct WalletPopulatedView: View {
    let active: [WalletCard]
    let archived: [WalletCard]
    @Binding var showArchived: Bool

    var body: some View {
        ScrollView {
            VStack(spacing: 0) {
                // "Updated just now" pull-to-refresh hint
                HStack(spacing: 6) {
                    Image(systemName: "arrow.clockwise")
                        .font(.system(size: 11))
                    Text("Updated just now")
                        .font(.system(size: 11.5))
                }
                .foregroundStyle(Theme.Palette.muted2)
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.horizontal, Theme.Spacing.xl)
                .padding(.top, Theme.Spacing.xs)

                // Active section
                if !active.isEmpty {
                    EditorialLabel(number: active.count,
                                   label: "Active · \(active.count) \(active.count == 1 ? "card" : "cards")")
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(.horizontal, Theme.Spacing.xl)

                    InsetCard {
                        ForEach(Array(active.enumerated()), id: \.element.id) { idx, card in
                            WalletCardRow(card: card)
                            if idx < active.count - 1 {
                                Hairline().padding(.leading, 86)
                            }
                        }
                    }
                }

                // Show / hide archived toggle
                if !archived.isEmpty {
                    Button {
                        withAnimation(.easeInOut(duration: 0.22)) { showArchived.toggle() }
                    } label: {
                        HStack(spacing: 6) {
                            Image(systemName: showArchived ? "chevron.up" : "chevron.down")
                                .font(.system(size: 11, weight: .semibold))
                            Text(showArchived
                                ? "Hide archived"
                                : "Show archived (\(archived.count))")
                                .font(.system(size: 13, weight: .semibold))
                        }
                        .foregroundStyle(Theme.Palette.accent)
                        .padding(.vertical, Theme.Spacing.m)
                        .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.plain)
                    .padding(.top, Theme.Spacing.m)
                }

                // Archived section
                if showArchived && !archived.isEmpty {
                    EditorialLabel(number: archived.count,
                                   label: "Archived · \(archived.count) \(archived.count == 1 ? "card" : "cards")")
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(.horizontal, Theme.Spacing.xl)

                    InsetCard {
                        ForEach(Array(archived.enumerated()), id: \.element.id) { idx, card in
                            WalletCardRow(card: card)
                                .opacity(0.72)
                            if idx < archived.count - 1 {
                                Hairline().padding(.leading, 86)
                            }
                        }
                    }
                    .transition(.opacity.combined(with: .move(edge: .top)))
                }

                // Bottom safe area for the floating tab bar
                Color.clear.frame(height: 110)
            }
        }
        .scrollContentBackground(.hidden)
        .background(Theme.Palette.surface2)
    }
}

private struct WalletCardRow: View {
    let card: WalletCard

    var body: some View {
        HStack(spacing: 14) {
            CardThumb(link: card.cardImageLink, contentMode: .fill)
                .frame(width: 60, height: 38)
                .clipShape(RoundedRectangle(cornerRadius: 5, style: .continuous))
                .shadow(color: .black.opacity(0.18), radius: 2, x: 0, y: 1)
                .shadow(color: .black.opacity(0.10), radius: 14, x: 0, y: 6)

            VStack(alignment: .leading, spacing: 2) {
                Text(card.cardName)
                    .font(Theme.Font.row)
                    .foregroundStyle(Theme.Palette.ink)
                    .lineLimit(2)
                Text(card.bank)
                    .font(Theme.Font.rowMeta)
                    .foregroundStyle(Theme.Palette.muted)
                if let since = formattedAcquired {
                    Text("Since \(since)")
                        .font(Theme.Font.rowTertiary)
                        .foregroundStyle(Theme.Palette.muted2)
                }
            }

            Spacer()

            Image(systemName: "chevron.right")
                .font(.system(size: 12, weight: .semibold))
                .foregroundStyle(Theme.Palette.muted2)
        }
        .padding(.horizontal, Theme.Spacing.l)
        .padding(.vertical, Theme.Spacing.m)
        .frame(maxWidth: .infinity)
        .background(Theme.Palette.surface)
    }

    private var formattedAcquired: String? {
        guard let m = card.acquiredMonth, let y = card.acquiredYear,
              (1...12).contains(m) else { return nil }
        let months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"]
        return "\(months[m - 1]) \(y)"
    }
}
