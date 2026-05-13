import SwiftUI

/// Card Wire — a chronological feed of every credit-card change we track:
/// annual fee changes, sign-up bonus value changes, APR shifts, and
/// applications opening / closing. Public endpoint; renders the same when
/// signed-in or signed-out.
struct CardWireView: View {
    @StateObject private var vm = CardWireViewModel()
    @State private var filter: CardChange.Group = .all

    private var filtered: [CardChange] {
        guard filter != .all else { return vm.changes }
        return vm.changes.filter { $0.group == filter }
    }

    var body: some View {
        NavigationStack {
            ZStack {
                Theme.Palette.surface2.ignoresSafeArea()

                ScrollView {
                    VStack(spacing: 0) {
                        // Live indicator
                        HStack(spacing: 8) {
                            LivePulse()
                            Text("Live")
                                .font(.system(size: 12, weight: .semibold))
                                .foregroundStyle(Theme.Palette.ink)
                            Text("· every change we track")
                                .font(.system(size: 12))
                                .foregroundStyle(Theme.Palette.muted)
                            Spacer()
                        }
                        .padding(.horizontal, Theme.Spacing.xl)
                        .padding(.top, Theme.Spacing.xs)
                        .padding(.bottom, Theme.Spacing.m)

                        // Filter chips
                        ScrollView(.horizontal, showsIndicators: false) {
                            HStack(spacing: 8) {
                                ForEach(CardChange.Group.allCases, id: \.self) { g in
                                    filterChip(g)
                                }
                            }
                            .padding(.horizontal, Theme.Spacing.xl)
                            .padding(.bottom, Theme.Spacing.m)
                        }

                        Hairline()

                        if vm.isLoading && vm.changes.isEmpty {
                            ProgressView()
                                .padding(.top, 80)
                        } else if filtered.isEmpty {
                            ContentUnavailableView(
                                "No changes yet",
                                systemImage: "antenna.radiowaves.left.and.right.slash",
                                description: Text("Card change activity will appear here.")
                            )
                            .padding(.top, 60)
                        } else {
                            VStack(spacing: 0) {
                                ForEach(filtered) { change in
                                    WireRow(change: change)
                                    Hairline()
                                }
                            }
                            .background(Theme.Palette.surface)
                        }

                        Color.clear.frame(height: 100)
                    }
                }
                .scrollContentBackground(.hidden)
                .refreshable { await vm.load() }
            }
            .navigationTitle("Card Wire")
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    AuthGateButton()
                }
            }
            .task { await vm.startStreaming() }
        }
    }

    @ViewBuilder
    private func filterChip(_ group: CardChange.Group) -> some View {
        let isOn = filter == group
        Button {
            withAnimation(.easeOut(duration: 0.15)) { filter = group }
        } label: {
            Text(group.label)
                .font(.system(size: 13, weight: .medium))
                .foregroundStyle(isOn ? Color.white : Theme.Palette.ink)
                .padding(.horizontal, 13)
                .padding(.vertical, 7)
                .background {
                    Capsule()
                        .fill(isOn ? Theme.Palette.ink : Theme.Palette.surface)
                    if !isOn {
                        Capsule().strokeBorder(Theme.Palette.line, lineWidth: 0.5)
                    }
                }
        }
        .buttonStyle(.plain)
    }
}

// MARK: - Wire row

private struct WireRow: View {
    let change: CardChange

    private var dirColor: Color {
        switch change.direction {
        case .pos:     return Theme.Palette.success
        case .neg:     return Theme.Palette.risk
        case .neutral: return Theme.Palette.muted
        }
    }

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            CardThumb(link: change.cardImageLink, contentMode: .fill)
                .frame(width: 48, height: 30)
                .clipShape(RoundedRectangle(cornerRadius: 4, style: .continuous))
                .shadow(color: .black.opacity(0.15), radius: 2, x: 0, y: 1)

            VStack(alignment: .leading, spacing: 6) {
                // Card name + timestamp
                HStack(alignment: .firstTextBaseline) {
                    Text(change.cardName)
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundStyle(Theme.Palette.ink)
                        .lineLimit(1)
                    Spacer(minLength: 8)
                    Text(change.relativeTimestamp)
                        .font(.system(size: 11.5).monospacedDigit())
                        .foregroundStyle(Theme.Palette.muted2)
                }

                // Field chip + value change
                HStack(alignment: .center, spacing: 8) {
                    FieldChip(group: change.group, label: change.fieldLabel)

                    HStack(spacing: 4) {
                        Text(change.formatValue(change.oldValue))
                            .strikethrough(change.direction != .neutral, color: Theme.Palette.muted2)
                            .foregroundStyle(Theme.Palette.muted)
                        Image(systemName: "arrow.right")
                            .font(.system(size: 10, weight: .semibold))
                            .foregroundStyle(Theme.Palette.muted2)
                        Text(change.formatValue(change.newValue))
                            .fontWeight(.semibold)
                            .foregroundStyle(dirColor)
                    }
                    .font(.system(size: 12.5).monospacedDigit())
                }
            }
        }
        .padding(.horizontal, Theme.Spacing.xl)
        .padding(.vertical, 12)
    }
}

private struct FieldChip: View {
    let group: CardChange.Group
    let label: String

    private var tint: Color {
        switch group {
        case .fee:   return Theme.Palette.warn
        case .bonus: return Theme.Palette.accent
        case .apr:   return Theme.Palette.risk
        case .apps:  return Theme.Palette.success
        case .all:   return Theme.Palette.muted
        }
    }

    var body: some View {
        Text(label.uppercased())
            .font(.system(size: 9.5, weight: .bold))
            .tracking(0.6)
            .foregroundStyle(tint)
            .padding(.horizontal, 6)
            .padding(.vertical, 3)
            .background(
                RoundedRectangle(cornerRadius: 4, style: .continuous)
                    .fill(tint.opacity(0.12))
            )
    }
}

// MARK: - Live indicator

private struct LivePulse: View {
    @State private var pulse = false

    var body: some View {
        Circle()
            .fill(Theme.Palette.success)
            .frame(width: 7, height: 7)
            .overlay {
                Circle()
                    .stroke(Theme.Palette.success.opacity(0.4), lineWidth: 3)
                    .scaleEffect(pulse ? 2.0 : 1.0)
                    .opacity(pulse ? 0 : 1)
                    .animation(.easeOut(duration: 1.4).repeatForever(autoreverses: false), value: pulse)
            }
            .onAppear { pulse = true }
    }
}

// MARK: - View model

@MainActor
final class CardWireViewModel: ObservableObject {
    @Published private(set) var changes: [CardChange] = []
    @Published private(set) var isLoading = false
    private var pollTask: Task<Void, Never>?

    func startStreaming() async {
        if pollTask != nil { return }
        await load()
        // Card changes are infrequent compared to applications — poll
        // every 60s rather than the 30s we had on the old records feed.
        pollTask = Task { [weak self] in
            while !Task.isCancelled {
                try? await Task.sleep(nanoseconds: 60_000_000_000)
                if Task.isCancelled { return }
                await self?.load()
            }
        }
    }

    func load() async {
        isLoading = true
        defer { isLoading = false }
        do {
            changes = try await CardWireService.fetch()
        } catch {
            print("CardWire load error:", error.localizedDescription)
        }
    }

    deinit { pollTask?.cancel() }
}
