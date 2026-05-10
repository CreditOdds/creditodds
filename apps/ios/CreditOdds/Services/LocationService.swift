import Foundation
import CoreLocation

/// Async wrapper around CLLocationManager. One-shot location request that
/// throws if permission is denied or the OS can't get a fix in time.
@MainActor
final class LocationService: NSObject, ObservableObject {
    enum LocationError: LocalizedError {
        case denied
        case servicesDisabled
        case timeout
        case underlying(Error)

        var errorDescription: String? {
            switch self {
            case .denied: return "Location access is off for CreditOdds. Enable it in Settings → Privacy & Security → Location Services."
            case .servicesDisabled: return "Location Services are off device-wide. Enable them in Settings."
            case .timeout: return "Couldn't get your location in time. Try again."
            case .underlying(let err): return err.localizedDescription
            }
        }
    }

    private let manager = CLLocationManager()
    private var continuation: CheckedContinuation<CLLocation, Error>?

    override init() {
        super.init()
        manager.delegate = self
        manager.desiredAccuracy = kCLLocationAccuracyHundredMeters
    }

    func requestOnce() async throws -> CLLocation {
        switch manager.authorizationStatus {
        case .notDetermined:
            manager.requestWhenInUseAuthorization()
        case .denied, .restricted:
            throw LocationError.denied
        case .authorizedWhenInUse, .authorizedAlways:
            break
        @unknown default:
            break
        }

        return try await withCheckedThrowingContinuation { cont in
            self.continuation = cont
            self.manager.requestLocation()
        }
    }
}

extension LocationService: CLLocationManagerDelegate {
    nonisolated func locationManager(_ manager: CLLocationManager,
                                     didUpdateLocations locations: [CLLocation]) {
        guard let last = locations.last else { return }
        Task { @MainActor in
            self.continuation?.resume(returning: last)
            self.continuation = nil
        }
    }

    nonisolated func locationManager(_ manager: CLLocationManager,
                                     didFailWithError error: Error) {
        Task { @MainActor in
            let mapped: Error
            if (error as NSError).code == CLError.denied.rawValue {
                mapped = LocationError.denied
            } else {
                mapped = LocationError.underlying(error)
            }
            self.continuation?.resume(throwing: mapped)
            self.continuation = nil
        }
    }

    nonisolated func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        let status = manager.authorizationStatus
        Task { @MainActor in
            switch status {
            case .denied, .restricted:
                if self.continuation != nil {
                    self.continuation?.resume(throwing: LocationError.denied)
                    self.continuation = nil
                }
            case .authorizedWhenInUse, .authorizedAlways:
                if self.continuation != nil {
                    manager.requestLocation()
                }
            default:
                break
            }
        }
    }
}
