import SwiftUI

/// Cards / "Wallet" tab — design screens 8 (empty) and 9 (populated).
struct WalletTab: View {
    @StateObject private var vm = WalletViewModel()
    @State private var showAddSheet = false

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
                        WalletPopulatedView(cards: vm.cards, onDelete: handleDelete)
                            .refreshable { await vm.load() }
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
            .task { await vm.load() }
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

    private func handleDelete(_ card: WalletCard) {
        Task { await vm.remove(card) }
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
    let cards: [WalletCard]
    let onDelete: (WalletCard) -> Void

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

                EditorialLabel(number: cards.count, label: "Active · \(cards.count) \(cards.count == 1 ? "card" : "cards")")
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.horizontal, Theme.Spacing.xl)

                InsetCard {
                    ForEach(Array(cards.enumerated()), id: \.element.id) { idx, card in
                        WalletCardRow(card: card, onDelete: { onDelete(card) })
                        if idx < cards.count - 1 {
                            Hairline().padding(.leading, 86) // align under card-art
                        }
                    }
                }

                Text("Swipe left on a card to delete.")
                    .font(.system(size: 11))
                    .foregroundStyle(Theme.Palette.muted2)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.horizontal, Theme.Spacing.xl)
                    .padding(.top, Theme.Spacing.s)
                    .padding(.bottom, Theme.Spacing.xxl)

                // Bottom safe area for the glass tab bar
                Color.clear.frame(height: 90)
            }
        }
        .scrollContentBackground(.hidden)
        .background(Theme.Palette.surface2)
    }
}

private struct WalletCardRow: View {
    let card: WalletCard
    let onDelete: () -> Void
    @State private var dragOffset: CGFloat = 0
    @State private var showDeleteAction = false

    private let actionWidth: CGFloat = 80

    var body: some View {
        ZStack(alignment: .trailing) {
            // Destructive action background (revealed on swipe)
            Rectangle()
                .fill(Theme.Palette.destructive)
                .overlay {
                    Button(action: onDelete) {
                        VStack(spacing: 4) {
                            Image(systemName: "trash.fill")
                                .font(.system(size: 18))
                            Text("Delete")
                                .font(.system(size: 11, weight: .semibold))
                        }
                        .foregroundStyle(.white)
                        .frame(width: actionWidth)
                    }
                    .opacity(showDeleteAction ? 1 : 0)
                }
                .frame(width: actionWidth)

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
            .offset(x: dragOffset)
            .gesture(
                DragGesture()
                    .onChanged { value in
                        let translation = value.translation.width
                        if translation < 0 {
                            dragOffset = max(translation, -actionWidth - 20)
                        }
                    }
                    .onEnded { value in
                        let translation = value.translation.width
                        withAnimation(.spring(response: 0.35, dampingFraction: 0.85)) {
                            if translation < -actionWidth / 2 {
                                dragOffset = -actionWidth
                                showDeleteAction = true
                            } else {
                                dragOffset = 0
                                showDeleteAction = false
                            }
                        }
                    }
            )
        }
    }

    private var formattedAcquired: String? {
        guard let m = card.acquiredMonth, let y = card.acquiredYear,
              (1...12).contains(m) else { return nil }
        let months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"]
        return "\(months[m - 1]) \(y)"
    }
}
