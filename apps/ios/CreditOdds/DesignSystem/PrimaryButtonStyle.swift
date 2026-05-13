import SwiftUI

/// Brand purple primary button. Full-width by default; wrap in a parent that
/// constrains horizontally to use as a compact button.
struct PrimaryButtonStyle: ButtonStyle {
    var compact: Bool = false

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.system(size: 16, weight: .semibold))
            .foregroundStyle(.white)
            .padding(.vertical, compact ? 12 : 16)
            .padding(.horizontal, compact ? 16 : 18)
            .frame(maxWidth: compact ? nil : .infinity)
            .background(
                RoundedRectangle(cornerRadius: Theme.Radius.m, style: .continuous)
                    .fill(configuration.isPressed ? Theme.Palette.accentDark : Theme.Palette.accent)
            )
            .opacity(configuration.isPressed ? 0.92 : 1)
            .animation(.easeOut(duration: 0.12), value: configuration.isPressed)
    }
}

extension ButtonStyle where Self == PrimaryButtonStyle {
    static var coPrimary: PrimaryButtonStyle { PrimaryButtonStyle() }
    static var coPrimaryCompact: PrimaryButtonStyle { PrimaryButtonStyle(compact: true) }
}
