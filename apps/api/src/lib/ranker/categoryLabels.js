// Display labels for reward categories. Plain data so it can be required
// by the Lambda runtime *and* re-imported into the Next.js frontend
// through the tsconfig path alias.
//
// The original definition lived in apps/web-next/src/lib/cardDisplayUtils.tsx
// alongside Heroicon imports. Those React deps stay on the frontend; this
// file holds only the data the ranker needs.

const categoryLabels = {
  dining: "Dining",
  groceries: "Groceries",
  travel: "Travel",
  gas: "Gas",
  streaming: "Streaming",
  transit: "Transit",
  drugstores: "Drugstores",
  home_improvement: "Home Improvement",
  online_shopping: "Online Shopping",
  hotels: "Hotels",
  airlines: "Airlines",
  car_rentals: "Car Rentals",
  entertainment: "Entertainment",
  rotating: "Rotating Categories",
  top_category: "Top Spend Category",
  selected_categories: "Selected Categories",
  travel_portal: "Travel (via Portal)",
  hotels_portal: "Hotels (via Portal)",
  flights_portal: "Flights (via Portal)",
  hotels_car_portal: "Hotels & Car Rentals (via Portal)",
  car_rentals_portal: "Car Rentals (via Portal)",
  amazon: "Amazon.com",
  rei: "REI",
  everything_else: "Everything Else",
  fast_food: "Fast Food",
  electronics_stores: "Electronics Stores",
  tv_internet_streaming: "TV, Internet & Streaming Services",
  home_utilities: "Home Utilities",
  cell_phone_providers: "Cell Phone Providers",
  furniture_stores: "Furniture Stores",
  department_stores: "Department Stores",
  ground_transportation: "Ground Transportation",
  gyms_fitness: "Gyms/Fitness Centers",
  select_clothing: "Select Clothing Stores",
  sporting_goods: "Sporting Goods Stores",
  movie_theaters: "Movie Theaters",
};

module.exports = { categoryLabels };
