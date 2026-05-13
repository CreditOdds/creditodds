import SwiftUI

/// Card Wire (design screen 5) — live ticker of approve/deny events. Auto-
/// refreshes every 30s while visible. No card art on this screen by design;
/// the dense text grid is the editorial point.
struct CardWireView: View {
    @StateObject private var vm = CardWireViewModel()

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
                            Text("· streaming applications · auto-refreshing")
                                .font(.system(size: 12))
                                .foregroundStyle(Theme.Palette.muted)
                            Spacer()
                        }
                        .padding(.horizontal, Theme.Spacing.xl)
                        .padding(.top, Theme.Spacing.xs)
                        .padding(.bottom, Theme.Spacing.m)

                        Hairline()

                        if vm.isLoading && vm.records.isEmpty {
                            ProgressView()
                                .padding(.top, 80)
                        } else if vm.records.isEmpty {
                            ContentUnavailableView(
                                "No activity yet",
                                systemImage: "antenna.radiowaves.left.and.right.slash",
                                description: Text("Recent application activity will appear here.")
                            )
                            .padding(.top, 60)
                        } else {
                            VStack(spacing: 0) {
                                ForEach(vm.records) { record in
                                    WireRow(record: record)
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
}

// MARK: - Wire row

private struct WireRow: View {
    let record: RecentRecord

    var body: some View {
        HStack(alignment: .center, spacing: 12) {
            // Timestamp
            Text(record.relativeTimestamp)
                .font(.system(size: 11.5).monospacedDigit())
                .foregroundStyle(Theme.Palette.muted2)
                .frame(width: 64, alignment: .leading)

            // Status badge
            Text(record.isApproved ? "APPROVED" : "DENIED")
                .font(.system(size: 10.5, weight: .bold))
                .tracking(0.6)
                .foregroundStyle(record.isApproved ? Theme.Palette.success : Theme.Palette.risk)
                .padding(.horizontal, 8)
                .padding(.vertical, 3)
                .background(
                    RoundedRectangle(cornerRadius: 4, style: .continuous)
                        .fill((record.isApproved ? Theme.Palette.success : Theme.Palette.risk).opacity(0.12))
                )
                .frame(width: 86, alignment: .leading)

            VStack(alignment: .leading, spacing: 2) {
                Text(record.cardName)
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundStyle(Theme.Palette.ink)
                    .lineLimit(1)

                HStack(spacing: 6) {
                    if let bank = record.bank { Text(bank) }
                    Text("·").foregroundStyle(Theme.Palette.muted2)
                    Text(record.creditScoreBucket).monospacedDigit()
                    Text("·").foregroundStyle(Theme.Palette.muted2)
                    Text(record.incomeBucket).monospacedDigit()
                }
                .font(.system(size: 11.5))
                .foregroundStyle(Theme.Palette.muted)
                .lineLimit(1)
            }
        }
        .padding(.horizontal, Theme.Spacing.xl)
        .padding(.vertical, 13)
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
    @Published private(set) var records: [RecentRecord] = []
    @Published private(set) var isLoading = false
    private var pollTask: Task<Void, Never>?

    func startStreaming() async {
        if pollTask != nil { return }
        await load()
        pollTask = Task { [weak self] in
            while !Task.isCancelled {
                try? await Task.sleep(nanoseconds: 30_000_000_000) // 30s
                if Task.isCancelled { return }
                await self?.load()
            }
        }
    }

    func load() async {
        isLoading = true
        defer { isLoading = false }
        do {
            records = try await RecentRecordsService.fetch()
        } catch {
            // Silent on the ticker — leave the existing list visible.
            print("CardWire load error:", error.localizedDescription)
        }
    }

    deinit { pollTask?.cancel() }
}
