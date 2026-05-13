import SwiftUI

/// "01  —  BEST CARD HERE" — editorial section label used as a divider above
/// every grouped list. The number renders in `ink`, the label in `muted`.
/// Em dash is preserved here because it's a typographic convention in the
/// design (magazine-style section marker), distinct from prose copy.
struct EditorialLabel: View {
    let number: Int
    let label: String

    var body: some View {
        HStack(spacing: 8) {
            Text(String(format: "%02d", number))
                .foregroundStyle(Theme.Palette.ink)
            Text("—")
                .foregroundStyle(Theme.Palette.muted)
            Text(label.uppercased())
                .foregroundStyle(Theme.Palette.muted)
        }
        .font(Theme.Font.editorial)
        .tracking(1.5) // ≈ 0.14em at 11pt
        .padding(.horizontal, 4)
        .padding(.top, Theme.Spacing.m)
        .padding(.bottom, Theme.Spacing.s)
    }
}

/// Section footer — small muted prose that sits below an inset list.
struct SectionFootnote: View {
    let text: String
    var body: some View {
        Text(text)
            .font(.system(size: 11.5))
            .foregroundStyle(Theme.Palette.muted)
            .lineSpacing(2)
            .padding(.horizontal, Theme.Spacing.l)
            .padding(.top, Theme.Spacing.s)
            .padding(.bottom, Theme.Spacing.xs)
            .frame(maxWidth: .infinity, alignment: .leading)
    }
}
