import Foundation

/// Maps Google Places API `primaryType` / `types` values to reward category
/// slugs. Mirrors apps/web-next/src/lib/placeTypeMapping.ts.
enum PlaceTypeMapping {
    struct Match {
        let primary: String
        let categories: [String]
        let matchedBy: MatchedBy
        let matchedValue: String?
    }

    enum MatchedBy { case brand, primaryType, type, subtype, fallback }

    private static let brandToCategory: [(match: String, category: String)] = [
        ("whole foods", "amazon"),
        ("amazon fresh", "amazon"),
        ("amazon go", "amazon"),
        ("rei", "rei"),
    ]

    private static let primaryTypeToCategory: [String: String] = [
        // dining
        "restaurant": "dining",
        "cafe": "dining",
        "coffee_shop": "dining",
        "bar": "dining",
        "meal_takeaway": "dining",
        "meal_delivery": "dining",
        "bakery": "dining",
        "fast_food_restaurant": "dining",
        "ice_cream_shop": "dining",
        "pizza_restaurant": "dining",
        "sandwich_shop": "dining",
        // groceries
        "supermarket": "groceries",
        "grocery_store": "groceries",
        "grocery_or_supermarket": "groceries",
        // gas
        "gas_station": "gas",
        // drugstores
        "pharmacy": "drugstores",
        "drugstore": "drugstores",
        // transit
        "transit_station": "transit",
        "bus_station": "transit",
        "subway_station": "transit",
        "train_station": "transit",
        "taxi_stand": "transit",
        "light_rail_station": "transit",
        // hotels
        "lodging": "hotels",
        "hotel": "hotels",
        "motel": "hotels",
        "resort_hotel": "hotels",
        "extended_stay_hotel": "hotels",
        "inn": "hotels",
        "bed_and_breakfast": "hotels",
        // airlines / travel
        "airport": "airlines",
        "travel_agency": "travel",
        // car rentals
        "car_rental": "car_rentals",
        // entertainment
        "movie_theater": "entertainment",
        "amusement_park": "entertainment",
        "bowling_alley": "entertainment",
        "zoo": "entertainment",
        "aquarium": "entertainment",
        "stadium": "entertainment",
        "night_club": "entertainment",
        // home improvement
        "home_goods_store": "home_improvement",
        "hardware_store": "home_improvement",
    ]

    private static let primaryTypeSubtypes: [String: [String]] = [
        "fast_food_restaurant": ["fast_food"],
        "meal_takeaway": ["fast_food"],
        "movie_theater": ["movie_theaters"],
        "electronics_store": ["electronics_stores"],
        "furniture_store": ["furniture_stores"],
        "gym": ["gyms_fitness"],
        "fitness_center": ["gyms_fitness"],
        "sporting_goods_store": ["sporting_goods"],
        "taxi_stand": ["ground_transportation"],
        "bus_station": ["ground_transportation"],
        "subway_station": ["ground_transportation"],
        "train_station": ["ground_transportation"],
        "light_rail_station": ["ground_transportation"],
        "transit_station": ["ground_transportation"],
    ]

    private static func withSubtypes(primary: String, sourceType: String?) -> [String] {
        guard let sourceType,
              let subs = primaryTypeSubtypes[sourceType] else { return [primary] }
        return [primary] + subs
    }

    static func match(_ place: NearbyPlace) -> Match {
        let lowerName = place.name.lowercased()
        for entry in brandToCategory where lowerName.contains(entry.match) {
            return Match(primary: entry.category,
                         categories: [entry.category],
                         matchedBy: .brand,
                         matchedValue: entry.match)
        }
        if let pt = place.primaryType, let primary = primaryTypeToCategory[pt] {
            return Match(primary: primary,
                         categories: withSubtypes(primary: primary, sourceType: pt),
                         matchedBy: .primaryType,
                         matchedValue: pt)
        }
        if let types = place.types {
            for t in types {
                if let primary = primaryTypeToCategory[t] {
                    return Match(primary: primary,
                                 categories: withSubtypes(primary: primary, sourceType: t),
                                 matchedBy: .type,
                                 matchedValue: t)
                }
            }
            for t in types {
                if let subs = primaryTypeSubtypes[t], !subs.isEmpty {
                    return Match(primary: subs[0],
                                 categories: subs,
                                 matchedBy: .subtype,
                                 matchedValue: t)
                }
            }
        }
        return Match(primary: "everything_else",
                     categories: ["everything_else"],
                     matchedBy: .fallback,
                     matchedValue: nil)
    }
}
