import Foundation

enum CategoryLabels {
    static let labels: [String: String] = [
        "dining": "Dining",
        "groceries": "Groceries",
        "travel": "Travel",
        "gas": "Gas",
        "streaming": "Streaming",
        "transit": "Transit",
        "drugstores": "Drugstores",
        "home_improvement": "Home Improvement",
        "online_shopping": "Online Shopping",
        "hotels": "Hotels",
        "airlines": "Airlines",
        "car_rentals": "Car Rentals",
        "entertainment": "Entertainment",
        "rotating": "Rotating Categories",
        "top_category": "Top Spend Category",
        "selected_categories": "Selected Categories",
        "travel_portal": "Travel (via Portal)",
        "hotels_portal": "Hotels (via Portal)",
        "flights_portal": "Flights (via Portal)",
        "hotels_car_portal": "Hotels & Car Rentals (via Portal)",
        "car_rentals_portal": "Car Rentals (via Portal)",
        "amazon": "Amazon.com",
        "rei": "REI",
        "everything_else": "Everything Else",
        "fast_food": "Fast Food",
        "electronics_stores": "Electronics Stores",
        "tv_internet_streaming": "TV, Internet & Streaming Services",
        "home_utilities": "Home Utilities",
        "cell_phone_providers": "Cell Phone Providers",
        "furniture_stores": "Furniture Stores",
        "department_stores": "Department Stores",
        "ground_transportation": "Ground Transportation",
        "gyms_fitness": "Gyms/Fitness Centers",
        "select_clothing": "Select Clothing Stores",
        "sporting_goods": "Sporting Goods Stores",
        "movie_theaters": "Movie Theaters",
    ]

    /// Display order matching the web's canonical iteration: insertion order
    /// of the dictionary literal above, minus `everything_else`.
    static let canonicalOrder: [String] = [
        "dining", "groceries", "travel", "gas", "streaming", "transit",
        "drugstores", "home_improvement", "online_shopping", "hotels",
        "airlines", "car_rentals", "entertainment", "rotating", "top_category",
        "selected_categories", "travel_portal", "hotels_portal",
        "flights_portal", "hotels_car_portal", "car_rentals_portal",
        "amazon", "rei", "fast_food", "electronics_stores",
        "tv_internet_streaming", "home_utilities", "cell_phone_providers",
        "furniture_stores", "department_stores", "ground_transportation",
        "gyms_fitness", "select_clothing", "sporting_goods", "movie_theaters",
    ]

    static func label(_ category: String) -> String {
        labels[category] ?? category
    }
}
