import SwiftUI

/// Add to Wallet sheet — design screen 10. Searchable list of all cards;
/// tapping a row expands an inline month/year picker for acquisition date;
/// sticky "Add" CTA at the bottom.
struct AddToWalletSheet: View {
    let onAdded: () -> Void

    @Environment(\.dismiss) private var dismiss
    @StateObject private var catalog = CardsRepository.shared
    @State private var query = ""
    @State private var expandedCardId: String?
    @State private var month: Int = Calendar.current.component(.month, from: Date())
    @State private var year: Int = Calendar.current.component(.year, from: Date())
    @State private var submitting = false
    @State private var errorMessage: String?

    private var filtered: [Card] {
        guard !query.isEmpty else { return catalog.cards }
        let q = query.lowercased()
        return catalog.cards.filter {
            $0.cardName.lowercased().contains(q)
                || ($0.bank?.lowercased().contains(q) ?? false)
        }
    }

    var body: some View {
        NavigationStack {
            ZStack(alignment: .bottom) {
                Theme.Palette.surface.ignoresSafeArea()

                VStack(spacing: 0) {
                    // Search field
                    HStack(spacing: 8) {
                        Image(systemName: "magnifyingglass")
                            .font(.system(size: 16))
                            .foregroundStyle(Theme.Palette.muted)
                        TextField("Search by name or issuer", text: $query)
                            .font(.system(size: 15))
                            .textInputAutocapitalization(.never)
                            .autocorrectionDisabled()
                        if !query.isEmpty {
                            Button {
                                query = ""
                            } label: {
                                Image(systemName: "xmark.circle.fill")
                                    .font(.system(size: 16))
                                    .foregroundStyle(Theme.Palette.muted2)
                            }
                            .buttonStyle(.plain)
                        }
                    }
                    .padding(.horizontal, 14)
                    .padding(.vertical, 10)
                    .background(Theme.Palette.surface2)
                    .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
                    .padding(.horizontal, Theme.Spacing.l)
                    .padding(.top, Theme.Spacing.s)
                    .padding(.bottom, Theme.Spacing.m)

                    Hairline()

                    // List
                    ScrollView {
                        LazyVStack(spacing: 0) {
                            ForEach(filtered) { card in
                                CardPickerRow(
                                    card: card,
                                    isExpanded: expandedCardId == card.id,
                                    month: $month,
                                    year: $year,
                                    onTap: {
                                        withAnimation(.easeInOut(duration: 0.2)) {
                                            expandedCardId = (expandedCardId == card.id) ? nil : card.id
                                        }
                                    }
                                )
                                Hairline()
                            }
                            // Bottom space for sticky CTA
                            Color.clear.frame(height: 110)
                        }
                    }
                }

                // Sticky bottom CTA
                if let selectedId = expandedCardId,
                   let selectedCard = filtered.first(where: { $0.id == selectedId }) {
                    VStack(spacing: 0) {
                        Hairline()
                        Button {
                            submit(card: selectedCard)
                        } label: {
                            if submitting {
                                ProgressView().tint(.white)
                                    .frame(maxWidth: .infinity, minHeight: 24)
                            } else {
                                Text("Add \(selectedCard.cardName) to Wallet")
                            }
                        }
                        .buttonStyle(.coPrimary)
                        .disabled(submitting)
                        .padding(.horizontal, Theme.Spacing.l)
                        .padding(.top, Theme.Spacing.m)
                        .padding(.bottom, 28)
                    }
                    .background(.ultraThinMaterial)
                }
            }
            .navigationTitle("Add card")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button {
                        dismiss()
                    } label: {
                        Image(systemName: "xmark.circle.fill")
                            .font(.system(size: 28))
                            .foregroundStyle(Theme.Palette.line2)
                    }
                    .buttonStyle(.plain)
                }
            }
            .alert("Couldn't add card",
                   isPresented: .constant(errorMessage != nil),
                   actions: { Button("OK") { errorMessage = nil } },
                   message: { Text(errorMessage ?? "") })
            .task { await catalog.loadIfNeeded() }
        }
        .presentationDetents([.medium, .large])
        .presentationDragIndicator(.visible)
    }

    private func submit(card: Card) {
        guard let dbId = card.dbCardId else {
            errorMessage = "This card isn't available to add yet."
            return
        }
        submitting = true
        Task {
            do {
                _ = try await WalletService.add(cardId: dbId, month: month, year: year)
                await MainActor.run {
                    submitting = false
                    onAdded()
                    dismiss()
                }
            } catch {
                await MainActor.run {
                    submitting = false
                    errorMessage = error.localizedDescription
                }
            }
        }
    }
}

private struct CardPickerRow: View {
    let card: Card
    let isExpanded: Bool
    @Binding var month: Int
    @Binding var year: Int
    let onTap: () -> Void

    var body: some View {
        VStack(spacing: 0) {
            Button(action: onTap) {
                HStack(spacing: 12) {
                    CardThumb(link: card.cardImageLink, contentMode: .fit)
                        .frame(width: 68, height: 42)
                        .clipShape(RoundedRectangle(cornerRadius: 5, style: .continuous))
                        .shadow(color: .black.opacity(0.15), radius: 3, x: 0, y: 1)

                    VStack(alignment: .leading, spacing: 2) {
                        Text(card.cardName)
                            .font(.system(size: 15, weight: .semibold))
                            .foregroundStyle(Theme.Palette.ink)
                            .lineLimit(1)
                        Text(metaLine)
                            .font(.system(size: 12))
                            .foregroundStyle(Theme.Palette.muted)
                    }

                    Spacer()

                    Image(systemName: isExpanded ? "checkmark" : "plus")
                        .font(.system(size: 16, weight: .semibold))
                        .foregroundStyle(Theme.Palette.accent)
                }
                .padding(.horizontal, Theme.Spacing.l)
                .padding(.vertical, 12)
                .background(isExpanded ? Theme.Palette.surface2 : Theme.Palette.surface)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)

            if isExpanded {
                AcquiredInline(month: $month, year: $year)
                    .padding(.horizontal, Theme.Spacing.l)
                    .padding(.bottom, Theme.Spacing.l)
                    .background(Theme.Palette.surface2)
            }
        }
    }

    private var metaLine: String {
        let issuer = card.bank ?? ""
        let fee = (card.annualFee ?? 0) == 0 ? "No fee" : "$\(Int(card.annualFee ?? 0))/yr"
        return issuer.isEmpty ? fee : "\(issuer) · \(fee)"
    }
}

private struct AcquiredInline: View {
    @Binding var month: Int
    @Binding var year: Int

    private let months = ["January","February","March","April","May","June",
                          "July","August","September","October","November","December"]

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("ACQUIRED")
                .font(.system(size: 11, weight: .semibold))
                .tracking(1.5)
                .foregroundStyle(Theme.Palette.muted)

            HStack(spacing: 8) {
                Menu {
                    Picker("Month", selection: $month) {
                        ForEach(1...12, id: \.self) { m in
                            Text(months[m - 1]).tag(m)
                        }
                    }
                } label: {
                    pickerCard(label: "Month", value: months[month - 1])
                }

                Menu {
                    Picker("Year", selection: $year) {
                        ForEach(yearRange, id: \.self) { y in
                            Text(String(y)).tag(y)
                        }
                    }
                } label: {
                    pickerCard(label: "Year", value: String(year))
                }
            }
        }
    }

    private var yearRange: [Int] {
        let current = Calendar.current.component(.year, from: Date())
        return Array((current - 30)...current).reversed()
    }

    @ViewBuilder
    private func pickerCard(label: String, value: String) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(label)
                .font(.system(size: 11))
                .foregroundStyle(Theme.Palette.muted)
            HStack(spacing: 4) {
                Text(value)
                    .font(.system(size: 15, weight: .semibold).monospacedDigit())
                    .foregroundStyle(Theme.Palette.ink)
                Image(systemName: "chevron.down")
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundStyle(Theme.Palette.muted)
            }
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 10)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Theme.Palette.surface)
        .overlay(
            RoundedRectangle(cornerRadius: Theme.Radius.s, style: .continuous)
                .strokeBorder(Theme.Palette.line2, lineWidth: 0.5)
        )
        .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.s, style: .continuous))
    }
}
