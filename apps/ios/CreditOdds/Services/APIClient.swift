import Foundation

enum APIError: LocalizedError {
    case invalidURL
    case http(Int, String)
    case decoding(Error)
    case transport(Error)
    case unauthenticated

    var errorDescription: String? {
        switch self {
        case .invalidURL: return "Invalid URL."
        case .http(let code, let body): return "HTTP \(code): \(body)"
        case .decoding(let err): return "Decoding error: \(err.localizedDescription)"
        case .transport(let err): return "Network error: \(err.localizedDescription)"
        case .unauthenticated: return "You're signed out."
        }
    }
}

actor APIClient {
    static let shared = APIClient()

    private let baseURL: URL
    private let session: URLSession
    private let decoder: JSONDecoder

    init(baseURL: URL = URL(string: "https://d2ojrhbh2dincr.cloudfront.net")!,
         session: URLSession = .shared) {
        self.baseURL = baseURL
        self.session = session
        let dec = JSONDecoder()
        self.decoder = dec
    }

    func get<T: Decodable>(_ path: String,
                           query: [URLQueryItem] = [],
                           token: String? = nil) async throws -> T {
        try await request(path: path, method: "GET", query: query, token: token, body: nil)
    }

    func post<T: Decodable, B: Encodable>(_ path: String,
                                          body: B,
                                          token: String? = nil) async throws -> T {
        let data = try JSONEncoder().encode(body)
        return try await request(path: path, method: "POST", query: [], token: token, body: data)
    }

    func put<T: Decodable, B: Encodable>(_ path: String,
                                         body: B,
                                         token: String? = nil) async throws -> T {
        let data = try JSONEncoder().encode(body)
        return try await request(path: path, method: "PUT", query: [], token: token, body: data)
    }

    func delete<T: Decodable>(_ path: String, token: String? = nil) async throws -> T {
        try await request(path: path, method: "DELETE", query: [], token: token, body: nil)
    }

    private func request<T: Decodable>(path: String,
                                       method: String,
                                       query: [URLQueryItem],
                                       token: String?,
                                       body: Data?) async throws -> T {
        var components = URLComponents(url: baseURL.appendingPathComponent(path),
                                       resolvingAgainstBaseURL: false)
        if !query.isEmpty { components?.queryItems = query }
        guard let url = components?.url else { throw APIError.invalidURL }

        var req = URLRequest(url: url)
        req.httpMethod = method
        req.cachePolicy = .reloadIgnoringLocalCacheData
        if let token { req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization") }
        if let body {
            req.httpBody = body
            req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        }

        do {
            let (data, response) = try await session.data(for: req)
            guard let http = response as? HTTPURLResponse else {
                throw APIError.http(-1, "No HTTP response")
            }
            guard (200..<300).contains(http.statusCode) else {
                let bodyText = String(data: data, encoding: .utf8) ?? ""
                throw APIError.http(http.statusCode, bodyText)
            }
            if T.self == EmptyResponse.self {
                return EmptyResponse() as! T
            }
            do {
                return try decoder.decode(T.self, from: data)
            } catch {
                throw APIError.decoding(error)
            }
        } catch let err as APIError {
            throw err
        } catch {
            throw APIError.transport(error)
        }
    }
}

struct EmptyResponse: Decodable {}
