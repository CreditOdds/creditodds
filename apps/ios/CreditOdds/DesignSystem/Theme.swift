import SwiftUI

/// CreditOdds design tokens, ported from `apps/ios/.../co-ios.css` in the
/// Claude Design handoff (chat23.md). Light values are the primary spec;
/// dark equivalents are picked to invert legibly without becoming pure black.
enum Theme {

    // MARK: - Colors

    enum Palette {
        static let accent       = Color(hex: 0x6B4FE8)
        static let accentDark   = Color(hex: 0x4A2FC4)
        static let accentTint   = Color(hex: 0xEFEAFE)

        static let surface      = Color(light: 0xFFFFFF, dark: 0x1A1A22)
        static let surface2     = Color(light: 0xF7F5FB, dark: 0x0E0E14)
        static let surface3     = Color(light: 0xEFEEF3, dark: 0x232330) // segmented track

        static let ink          = Color(light: 0x0A0A1A, dark: 0xF4F2FA)
        static let muted        = Color(light: 0x5C5C70, dark: 0x9090A6)
        static let muted2       = Color(light: 0x8E8EA0, dark: 0x6A6A7E)

        static let line         = Color(light: 0xE8E5F0, dark: 0x2A2A38)
        static let line2        = Color(light: 0xD8D4E4, dark: 0x33334A)

        static let success      = Color(hex: 0x1F8A4C)
        static let warn         = Color(hex: 0xC46A1C)
        static let risk         = Color(hex: 0xC03A3A)
        static let destructive  = Color(hex: 0xFF3B30) // iOS system red for parity with native rows
    }

    // MARK: - Spacing

    enum Spacing {
        static let xs: CGFloat  = 4
        static let s: CGFloat   = 8
        static let m: CGFloat   = 12
        static let l: CGFloat   = 16
        static let xl: CGFloat  = 20
        static let xxl: CGFloat = 24
        static let xxxl: CGFloat = 32
    }

    // MARK: - Radius

    enum Radius {
        static let xs: CGFloat = 6
        static let s: CGFloat  = 10
        static let m: CGFloat  = 14
        static let l: CGFloat  = 18
        static let xl: CGFloat = 26
    }

    // MARK: - Typography
    //
    // The web design uses Inter Tight for display + Inter for body. To stay
    // native-feeling on iOS without bundling a 2MB font, we use SF Pro at
    // matching weights with explicit tracking. Visually very close, more
    // performant, and lets Dynamic Type work out of the box.

    enum Font {
        // Display — Inter Tight equivalent, tight tracking
        static let largeTitle = SwiftUI.Font.system(size: 34, weight: .bold).width(.condensed)
        static let title2     = SwiftUI.Font.system(size: 22, weight: .bold)
        static let title3     = SwiftUI.Font.system(size: 17, weight: .semibold)

        // Editorial section label — uppercase, 11pt, tracked
        static let editorial  = SwiftUI.Font.system(size: 11, weight: .semibold)

        // Body
        static let body       = SwiftUI.Font.system(size: 16, weight: .regular)
        static let row        = SwiftUI.Font.system(size: 15, weight: .semibold)
        static let rowMeta    = SwiftUI.Font.system(size: 12, weight: .regular)
        static let rowTertiary = SwiftUI.Font.system(size: 11, weight: .regular)

        // Numerics — accent treatment for big rate values
        static let rateLarge  = SwiftUI.Font.system(size: 15, weight: .bold).monospacedDigit()
        static let rateAlt    = SwiftUI.Font.system(size: 13, weight: .semibold).monospacedDigit()
    }
}

// MARK: - Color helpers

extension Color {
    /// Hex literal — `Color(hex: 0x6B4FE8)`.
    init(hex: UInt32, alpha: Double = 1.0) {
        let r = Double((hex >> 16) & 0xFF) / 255.0
        let g = Double((hex >>  8) & 0xFF) / 255.0
        let b = Double((hex      ) & 0xFF) / 255.0
        self = Color(.sRGB, red: r, green: g, blue: b, opacity: alpha)
    }

    /// Pair of light/dark hex values resolved at render time via UIColor's
    /// trait collection. Single source of truth for adaptive tokens.
    init(light: UInt32, dark: UInt32) {
        self = Color(UIColor { trait in
            let h = (trait.userInterfaceStyle == .dark) ? dark : light
            let r = CGFloat((h >> 16) & 0xFF) / 255.0
            let g = CGFloat((h >>  8) & 0xFF) / 255.0
            let b = CGFloat((h      ) & 0xFF) / 255.0
            return UIColor(red: r, green: g, blue: b, alpha: 1)
        })
    }
}
