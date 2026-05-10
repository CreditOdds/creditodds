import SwiftUI

/// CDN host for card images. Mirrors apps/web-next/src/components/ui/CardImage.tsx.
private let cardImageCDN = "https://d3ay3etzd1512y.cloudfront.net/card_images"

func cardImageURL(_ link: String?) -> URL? {
    guard let link, !link.isEmpty else { return nil }
    if link.hasPrefix("http://") || link.hasPrefix("https://") {
        return URL(string: link)
    }
    return URL(string: "\(cardImageCDN)/\(link)")
}

struct CardThumb: View {
    let link: String?
    var contentMode: ContentMode = .fit

    var body: some View {
        if let url = cardImageURL(link) {
            AsyncImage(url: url) { phase in
                switch phase {
                case .success(let img):
                    img.resizable().aspectRatio(contentMode: contentMode)
                case .failure:
                    placeholder
                case .empty:
                    placeholder.overlay(ProgressView().controlSize(.mini))
                @unknown default:
                    placeholder
                }
            }
        } else {
            placeholder
        }
    }

    private var placeholder: some View {
        Rectangle()
            .fill(Color(.tertiarySystemFill))
            .overlay(Image(systemName: "creditcard").foregroundStyle(.secondary))
    }
}
