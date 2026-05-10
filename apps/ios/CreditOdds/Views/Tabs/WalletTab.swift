import SwiftUI

struct WalletTab: View {
    @StateObject private var vm = WalletViewModel()

    var body: some View {
        NavigationStack {
            Group {
                if vm.isLoading && vm.cards.isEmpty {
                    ProgressView()
                        .controlSize(.large)
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                } else if vm.cards.isEmpty {
                    ContentUnavailableView(
                        "No cards yet",
                        systemImage: "creditcard",
                        description: Text("Add a card to start tracking rewards and benefits.")
                    )
                } else {
                    List {
                        ForEach(vm.cards) { card in
                            WalletCardRow(card: card)
                        }
                        .onDelete { offsets in
                            Task {
                                for index in offsets {
                                    await vm.remove(vm.cards[index])
                                }
                            }
                        }
                    }
                    .listStyle(.insetGrouped)
                    .refreshable { await vm.load() }
                }
            }
            .navigationTitle("My Wallet")
            .task { await vm.load() }
            .alert("Error",
                   isPresented: .constant(vm.errorMessage != nil),
                   actions: {
                       Button("OK") { vm.errorMessage = nil }
                   },
                   message: { Text(vm.errorMessage ?? "") })
        }
    }
}

private struct WalletCardRow: View {
    let card: WalletCard

    var body: some View {
        HStack(spacing: 12) {
            CardThumb(link: card.cardImageLink, contentMode: .fill)
                .frame(width: 60, height: 38)
                .clipShape(RoundedRectangle(cornerRadius: 4))

            VStack(alignment: .leading, spacing: 2) {
                Text(card.cardName)
                    .font(.subheadline.weight(.semibold))
                    .lineLimit(2)
                Text(card.bank)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                if let acquired = formattedAcquired {
                    Text("Since \(acquired)")
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                }
            }
            Spacer()
        }
        .padding(.vertical, 4)
    }

    private var formattedAcquired: String? {
        guard let m = card.acquiredMonth, let y = card.acquiredYear else { return nil }
        let months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"]
        guard (1...12).contains(m) else { return nil }
        return "\(months[m-1]) \(y)"
    }
}

