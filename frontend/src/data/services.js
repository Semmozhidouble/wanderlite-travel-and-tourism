// Mock services data for destination details
export const mockFlights = [
  {
    id: "FL001",
    airline: "IndiGo",
    flight_number: "6E1001",
    origin: "Delhi",
    destination: "Goa",
    departure_time: "2024-11-15T06:00:00",
    arrival_time: "2024-11-15T08:30:00",
    duration: "2h 30m",
    price: 3500,
    currency: "INR",
    seats_available: 45,
    refund_policy: "Free cancellation up to 24 hours",
    baggage: "15kg check-in, 7kg cabin"
  },
  {
    id: "FL002", 
    airline: "Air India",
    flight_number: "AI1002",
    origin: "Delhi",
    destination: "Mumbai",
    departure_time: "2024-11-15T09:00:00",
    arrival_time: "2024-11-15T11:30:00",
    duration: "2h 30m",
    price: 4300,
    currency: "INR",
    seats_available: 40,
    refund_policy: "Non-refundable",
    baggage: "20kg check-in, 7kg cabin"
  },
  {
    id: "FL003",
    airline: "Vistara", 
    flight_number: "UK1003",
    origin: "Delhi",
    destination: "Bangalore",
    departure_time: "2024-11-15T14:00:00",
    arrival_time: "2024-11-15T16:30:00",
    duration: "2h 30m",
    price: 5100,
    currency: "INR",
    seats_available: 35,
    refund_policy: "Free cancellation up to 24 hours",
    baggage: "25kg check-in, 10kg cabin"
  }
];

export const mockHotels = [
  {
    id: "HT001",
    name: "Grand Palace Hotel",
    location: "Central",
    rating: 4.5,
    price_per_night: 3500,
    amenities: ["Free WiFi", "Pool", "Spa", "Restaurant", "Gym"],
    image_url: "https://via.placeholder.com/400x300/3498db/ffffff?text=Grand+Palace",
    rooms_available: 12,
    currency: "INR"
  },
  {
    id: "HT002", 
    name: "Comfort Inn & Suites",
    location: "Near Airport",
    rating: 4.0,
    price_per_night: 2200,
    amenities: ["Free WiFi", "Breakfast", "Parking", "Airport Shuttle"],
    image_url: "https://via.placeholder.com/400x300/2ecc71/ffffff?text=Comfort+Inn",
    rooms_available: 8,
    currency: "INR"
  },
  {
    id: "HT003",
    name: "Luxury Resort & Spa", 
    location: "Beachfront",
    rating: 5.0,
    price_per_night: 8500,
    amenities: ["Private Beach", "Infinity Pool", "Fine Dining", "Spa", "Concierge"],
    image_url: "https://via.placeholder.com/400x300/e74c3c/ffffff?text=Luxury+Resort",
    rooms_available: 5,
    currency: "INR"
  }
];

export const mockRestaurants = [
  {
    id: "RS001",
    name: "Spice Junction",
    cuisine: "Indian",
    specialty_dish: "Butter Chicken with Naan",
    timings: "11:00 AM - 11:00 PM",
    average_cost: 800,
    budget_category: "mid-range",
    rating: 4.3,
    distance: "1.2 km",
    image_url: "https://via.placeholder.com/400x300/e67e22/ffffff?text=Spice+Junction",
    currency: "INR"
  },
  {
    id: "RS002",
    name: "Ocean Breeze Seafood",
    cuisine: "Seafood", 
    specialty_dish: "Grilled Lobster",
    timings: "12:00 PM - 10:00 PM",
    average_cost: 2500,
    budget_category: "fine-dining",
    rating: 4.7,
    distance: "2.5 km",
    image_url: "https://via.placeholder.com/400x300/3498db/ffffff?text=Ocean+Breeze",
    currency: "INR"
  },
  {
    id: "RS003",
    name: "Street Food Paradise",
    cuisine: "Local",
    specialty_dish: "Mixed Street Food Platter",
    timings: "5:00 PM - 12:00 AM", 
    average_cost: 300,
    budget_category: "budget",
    rating: 4.1,
    distance: "0.8 km",
    image_url: "https://via.placeholder.com/400x300/f39c12/ffffff?text=Street+Food",
    currency: "INR"
  }
];