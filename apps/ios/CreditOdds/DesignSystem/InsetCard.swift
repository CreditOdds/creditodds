import SwiftUI

/// Solid white inset card with hairline dividers between rows. Matches the
/// `.co-list` shell in the web prototype: 16pt horizontal margin, 14pt
/// corner radius, no shadow. Use `Divider()` (or a 0.5pt rectangle) between
/// children to get the hairline rule.
struct InsetCard<Content: View>: View {
    let content: () -> Content

    init(@ViewBuilder content: @escaping () -> Content) {
        self.content = content
    }

    var body: some View {
        VStack(spacing: 0, content: content)
            .background(Theme.Palette.surface)
            .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.m, style: .continuous))
            .padding(.horizontal, Theme.Spacing.l)
    }
}

/// Hairline divider matching the design's 0.5px / `line` color.
struct Hairline: View {
    var body: some View {
        Rectangle()
            .fill(Theme.Palette.line)
            .frame(height: 0.5)
    }
}
