import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search,
  MapPin,
  Star,
  Clock,
  Users,
  Utensils,
  Filter,
  ChevronDown,
  ChevronUp,
  Leaf,
  Wine,
  Baby,
  Truck,
  IndianRupee,
  Heart,
  Share2,
  X,
  Calendar,
  ArrowRight,
  TrendingUp,
  Award,
  Coffee,
  Pizza,
  Flame,
  Grid,
  List,
  SlidersHorizontal,
  Sparkles,
  CheckCircle2,
  Timer,
  Phone,
  Navigation
} from 'lucide-react';
import axios from 'axios';
import { format } from 'date-fns';
import Navbar from '../components/Navbar';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:8000';

// 4K Quality Restaurant Images Array - Different for each restaurant
const restaurantImages = [
  'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=3840&q=100',
  'https://images.unsplash.com/photo-1552566626-52f8b828add9?w=3840&q=100',
  'https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=3840&q=100',
  'https://images.unsplash.com/photo-1559339352-11d035aa65de?w=3840&q=100',
  'https://images.unsplash.com/photo-1537047902294-62a40c20a6ae?w=3840&q=100',
  'https://images.unsplash.com/photo-1544148103-0773bf10d330?w=3840&q=100',
  'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?w=3840&q=100',
  'https://images.unsplash.com/photo-1424847651672-bf20a4b0982b?w=3840&q=100',
  'https://images.unsplash.com/photo-1466978913421-dad2ebd01d17?w=3840&q=100',
  'https://images.unsplash.com/photo-1550966871-3ed3cdb5ed0c?w=3840&q=100',
  'https://images.unsplash.com/photo-1590846406792-0adc7f938f1d?w=3840&q=100',
  'https://images.unsplash.com/photo-1578474846511-04ba529f0b88?w=3840&q=100',
  'https://images.unsplash.com/photo-1428515613728-6b4607e44363?w=3840&q=100',
  'https://images.unsplash.com/photo-1496412705862-e0088f16f791?w=3840&q=100',
  'https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=3840&q=100',
  'https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=3840&q=100',
  'https://images.unsplash.com/photo-1482049016gy-0ce0fdc71dc9?w=3840&q=100',
  'https://images.unsplash.com/photo-1560053608-13721e0d69e8?w=3840&q=100',
  'https://images.unsplash.com/photo-1567521464027-f127ff144326?w=3840&q=100',
  'https://images.unsplash.com/photo-1551218808-94e220e084d2?w=3840&q=100',
  'https://images.unsplash.com/photo-1600891964599-f61ba0e24092?w=3840&q=100',
  'https://images.unsplash.com/photo-1592861956120-e524fc739696?w=3840&q=100',
  'https://images.unsplash.com/photo-1571091718767-18b5b1457add?w=3840&q=100',
  'https://images.unsplash.com/photo-1546833999-b9f581a1996d?w=3840&q=100',
  'https://images.unsplash.com/photo-1585937421612-70a008356fbe?w=3840&q=100',
  'https://images.unsplash.com/photo-1567620905732-2d1ec7ab7445?w=3840&q=100',
  'https://images.unsplash.com/photo-1512058564366-18510be2db19?w=3840&q=100',
  'https://images.unsplash.com/photo-1476224203421-9ac39bcb3327?w=3840&q=100',
  'https://images.unsplash.com/photo-1473093295043-cdd812d0e601?w=3840&q=100',
  'https://images.unsplash.com/photo-1540189549336-e6e99c3679fe?w=3840&q=100',
  'https://images.unsplash.com/photo-1499028344343-cd173ffc68a9?w=3840&q=100',
  'https://images.unsplash.com/photo-1574484284002-952d92456975?w=3840&q=100',
  'https://images.unsplash.com/photo-1517244683847-7456b63c5969?w=3840&q=100',
  'https://images.unsplash.com/photo-1606491956689-2ea866880c84?w=3840&q=100',
  'https://images.unsplash.com/photo-1563379926898-05f4575a45d8?w=3840&q=100',
  'https://images.unsplash.com/photo-1596797038530-2c107229654b?w=3840&q=100',
  'https://images.unsplash.com/photo-1645696301019-35adcc18fc51?w=3840&q=100',
  'https://images.unsplash.com/photo-1626082927389-6cd097cdc6ec?w=3840&q=100',
  'https://images.unsplash.com/photo-1455619452474-d2be8b1e70cd?w=3840&q=100',
  'https://images.unsplash.com/photo-1601050690117-94f5f6fa8bd7?w=3840&q=100'
];

// Indian cuisine category images
const cuisineImages = {
  'North Indian': 'https://images.unsplash.com/photo-1585937421612-70a008356fbe?w=800&q=90',
  'South Indian': 'https://images.unsplash.com/photo-1630383249896-424e482df921?w=800&q=90',
  'Chinese': 'https://images.unsplash.com/photo-1552566626-52f8b828add9?w=800&q=90',
  'Italian': 'https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=800&q=90',
  'Fast Food': 'https://images.unsplash.com/photo-1571091718767-18b5b1457add?w=800&q=90',
  'Street Food': 'https://images.unsplash.com/photo-1601050690117-94f5f6fa8bd7?w=800&q=90',
  'Mughlai': 'https://images.unsplash.com/photo-1599487488170-d11ec9c172f0?w=800&q=90',
  'Continental': 'https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=800&q=90',
  'Bengali': 'https://images.unsplash.com/photo-1596797038530-2c107229654b?w=800&q=90',
  'Biryani': 'https://images.unsplash.com/photo-1563379091339-03b21ab4a4f8?w=800&q=90',
  'Cafe': 'https://images.unsplash.com/photo-1445116572660-236099ec97a0?w=800&q=90',
  'Desserts': 'https://images.unsplash.com/photo-1551024506-0bccd828d307?w=800&q=90',
  'Default': 'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=800&q=90'
};

// Get restaurant image based on ID (consistent for same restaurant)
const getRestaurantImage = (restaurantId, index = 0) => {
  if (!restaurantId) return restaurantImages[0];
  const hash = String(restaurantId).split('').reduce((a, b) => {
    return ((a << 5) - a) + b.charCodeAt(0);
  }, 0);
  return restaurantImages[Math.abs(hash + index) % restaurantImages.length];
};

// Get cuisine image
const getCuisineImage = (cuisines) => {
  if (!cuisines || cuisines.length === 0) return cuisineImages['Default'];
  for (const cuisine of cuisines) {
    if (cuisineImages[cuisine]) return cuisineImages[cuisine];
  }
  return cuisineImages['Default'];
};

// Popular cuisines for quick filter
const popularCuisines = [
  { name: 'North Indian', icon: <Flame className="w-4 h-4" /> },
  { name: 'South Indian', icon: <Coffee className="w-4 h-4" /> },
  { name: 'Chinese', icon: <Utensils className="w-4 h-4" /> },
  { name: 'Italian', icon: <Pizza className="w-4 h-4" /> },
  { name: 'Fast Food', icon: <Truck className="w-4 h-4" /> },
  { name: 'Biryani', icon: <Sparkles className="w-4 h-4" /> },
  { name: 'Mughlai', icon: <Award className="w-4 h-4" /> },
  { name: 'Street Food', icon: <TrendingUp className="w-4 h-4" /> }
];

// Price range options
const priceRanges = [
  { value: 1, label: '₹', description: 'Budget Friendly', range: 'Under ₹300' },
  { value: 2, label: '₹₹', description: 'Moderate', range: '₹300 - ₹600' },
  { value: 3, label: '₹₹₹', description: 'Fine Dining', range: '₹600 - ₹1200' },
  { value: 4, label: '₹₹₹₹', description: 'Luxury', range: 'Above ₹1200' }
];

const Restaurants = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();

  // Search state
  const [city, setCity] = useState(searchParams.get('city') || '');
  const [date, setDate] = useState(searchParams.get('date') || format(new Date(), 'yyyy-MM-dd'));
  const [time, setTime] = useState(searchParams.get('time') || '19:00');
  const [guests, setGuests] = useState(parseInt(searchParams.get('guests')) || 2);

  // Results state
  const [restaurants, setRestaurants] = useState([]);
  const [cities, setCities] = useState([]);
  const [popularRestaurants, setPopularRestaurants] = useState([]);
  const [loading, setLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [totalResults, setTotalResults] = useState(0);
  const [page, setPage] = useState(1);

  // Filter state
  const [showFilters, setShowFilters] = useState(false);
  const [selectedCuisines, setSelectedCuisines] = useState([]);
  const [selectedPriceRange, setSelectedPriceRange] = useState([]);
  const [vegOnly, setVegOnly] = useState(false);
  const [hasBar, setHasBar] = useState(false);
  const [familyFriendly, setFamilyFriendly] = useState(false);
  const [deliveryAvailable, setDeliveryAvailable] = useState(false);
  const [minRating, setMinRating] = useState(0);
  const [sortBy, setSortBy] = useState('rating');

  // UI state
  const [viewMode, setViewMode] = useState('grid');
  const [showCityDropdown, setShowCityDropdown] = useState(false);
  const [showGuestsDropdown, setShowGuestsDropdown] = useState(false);
  const [showTimeDropdown, setShowTimeDropdown] = useState(false);
  const [wishlist, setWishlist] = useState([]);

  // Fetch cities on mount
  useEffect(() => {
    fetchCities();
    fetchPopularRestaurants();
    loadWishlist();
    
    // Auto search if params exist
    if (searchParams.get('city')) {
      handleSearch();
    }
  }, []);

  const fetchCities = async () => {
    try {
      const response = await axios.get(`${API_URL}/api/restaurant/cities`);
      // Backend returns array directly with city and restaurant_count
      const citiesData = Array.isArray(response.data) ? response.data : (response.data.cities || []);
      setCities(citiesData.map(c => ({ city: c.city, count: c.restaurant_count || c.count })));
    } catch (error) {
      console.error('Error fetching cities:', error);
    }
  };

  const fetchPopularRestaurants = async () => {
    try {
      const response = await axios.get(`${API_URL}/api/restaurant/popular`);
      setPopularRestaurants(response.data.restaurants || []);
    } catch (error) {
      console.error('Error fetching popular restaurants:', error);
    }
  };

  const loadWishlist = () => {
    const saved = localStorage.getItem('restaurantWishlist');
    if (saved) {
      setWishlist(JSON.parse(saved));
    }
  };

  const toggleWishlist = (restaurantId) => {
    const newWishlist = wishlist.includes(restaurantId)
      ? wishlist.filter(id => id !== restaurantId)
      : [...wishlist, restaurantId];
    setWishlist(newWishlist);
    localStorage.setItem('restaurantWishlist', JSON.stringify(newWishlist));
  };

  const handleSearch = async (pageNum = 1) => {
    if (!city) {
      alert('Please select a city');
      return;
    }

    setLoading(true);
    setHasSearched(true);
    setPage(pageNum);

    try {
      const searchData = {
        city,
        date,
        time,
        guests,
        cuisines: selectedCuisines.length > 0 ? selectedCuisines : undefined,
        price_category: selectedPriceRange.length > 0 ? selectedPriceRange[0] : undefined,
        is_pure_veg: vegOnly || undefined,
        has_bar: hasBar || undefined,
        min_rating: minRating > 0 ? minRating : undefined,
        sort_by: sortBy,
        page: pageNum,
        limit: 20
      };

      const response = await axios.post(`${API_URL}/api/restaurant/search`, searchData);
      
      if (pageNum === 1) {
        setRestaurants(response.data.restaurants || []);
      } else {
        setRestaurants(prev => [...prev, ...(response.data.restaurants || [])]);
      }
      setTotalResults(response.data.total || 0);

      // Update URL params
      setSearchParams({
        city,
        date,
        time,
        guests: guests.toString()
      });
    } catch (error) {
      console.error('Error searching restaurants:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleRestaurantClick = (restaurant) => {
    navigate(`/restaurant/${restaurant.id}?date=${date}&time=${time}&guests=${guests}`);
  };

  const clearFilters = () => {
    setSelectedCuisines([]);
    setSelectedPriceRange([]);
    setVegOnly(false);
    setHasBar(false);
    setFamilyFriendly(false);
    setDeliveryAvailable(false);
    setMinRating(0);
    setSortBy('rating');
  };

  const generateTimeSlots = () => {
    const slots = [];
    for (let hour = 10; hour <= 22; hour++) {
      for (let min = 0; min < 60; min += 30) {
        const timeStr = `${hour.toString().padStart(2, '0')}:${min.toString().padStart(2, '0')}`;
        const label = format(new Date(`2024-01-01T${timeStr}`), 'h:mm a');
        slots.push({ value: timeStr, label });
      }
    }
    return slots;
  };

  const timeSlots = generateTimeSlots();

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      
      {/* Hero Section */}
      <div className="relative h-[450px] overflow-hidden pt-16">
        {/* Background Image */}
        <div 
          className="absolute inset-0 bg-cover bg-center"
          style={{
            backgroundImage: `url('https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=3840&q=100')`
          }}
        >
          <div className="absolute inset-0 bg-gradient-to-b from-black/70 via-black/50 to-black/70" />
        </div>

        {/* Content */}
        <div className="relative z-10 max-w-7xl mx-auto px-4 h-full flex flex-col justify-center items-center text-center">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            <span className="inline-flex items-center gap-2 px-4 py-2 bg-white/10 backdrop-blur-sm rounded-full text-white/90 text-sm mb-6">
              <Sparkles className="w-4 h-4 text-amber-400" />
              Over 5,000+ Restaurants Across India
            </span>
            <h1 className="text-4xl md:text-6xl font-bold text-white mb-4 leading-tight">
              Find Your Perfect
              <span className="text-amber-400"> Dining </span>
              Experience
            </h1>
            <p className="text-lg md:text-xl text-white/80 max-w-2xl mx-auto">
              Book tables at the finest restaurants, pre-order meals, or join the waiting list
            </p>
          </motion.div>

          {/* Search Box */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="mt-8 w-full max-w-5xl"
          >
            <div className="bg-white rounded-2xl shadow-2xl p-4 md:p-6">
              <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                {/* City */}
                <div className="relative md:col-span-2">
                  <label className="block text-xs font-medium text-gray-500 mb-1 ml-1">City</label>
                  <div 
                    className="flex items-center gap-3 px-4 py-3 bg-gray-50 rounded-xl cursor-pointer hover:bg-gray-100 transition-colors"
                    onClick={() => setShowCityDropdown(!showCityDropdown)}
                  >
                    <MapPin className="w-5 h-5 text-amber-500" />
                    <input
                      type="text"
                      placeholder="Select City..."
                      value={city}
                      onChange={(e) => {
                        setCity(e.target.value);
                        setShowCityDropdown(true);
                      }}
                      className="bg-transparent flex-1 outline-none text-gray-800 placeholder-gray-400"
                    />
                    <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${showCityDropdown ? 'rotate-180' : ''}`} />
                  </div>
                  
                  {/* City Dropdown */}
                  <AnimatePresence>
                    {showCityDropdown && (
                      <motion.div
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        className="absolute top-full left-0 right-0 mt-2 bg-white rounded-xl shadow-xl border border-gray-100 max-h-64 overflow-y-auto z-50"
                      >
                        {cities
                          .filter(c => c.city.toLowerCase().includes(city.toLowerCase()))
                          .slice(0, 15)
                          .map((c, i) => (
                            <div
                              key={i}
                              className="px-4 py-3 hover:bg-amber-50 cursor-pointer flex items-center justify-between"
                              onClick={() => {
                                setCity(c.city);
                                setShowCityDropdown(false);
                              }}
                            >
                              <span className="text-gray-800">{c.city}</span>
                              <span className="text-xs text-gray-400">{c.count} restaurants</span>
                            </div>
                          ))
                        }
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                {/* Date */}
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1 ml-1">Date</label>
                  <div className="flex items-center gap-3 px-4 py-3 bg-gray-50 rounded-xl">
                    <Calendar className="w-5 h-5 text-amber-500" />
                    <input
                      type="date"
                      value={date}
                      onChange={(e) => setDate(e.target.value)}
                      min={format(new Date(), 'yyyy-MM-dd')}
                      className="bg-transparent flex-1 outline-none text-gray-800"
                    />
                  </div>
                </div>

                {/* Time */}
                <div className="relative">
                  <label className="block text-xs font-medium text-gray-500 mb-1 ml-1">Time</label>
                  <div 
                    className="flex items-center gap-3 px-4 py-3 bg-gray-50 rounded-xl cursor-pointer hover:bg-gray-100 transition-colors"
                    onClick={() => setShowTimeDropdown(!showTimeDropdown)}
                  >
                    <Clock className="w-5 h-5 text-amber-500" />
                    <span className="flex-1 text-gray-800">
                      {format(new Date(`2024-01-01T${time}`), 'h:mm a')}
                    </span>
                    <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${showTimeDropdown ? 'rotate-180' : ''}`} />
                  </div>
                  
                  <AnimatePresence>
                    {showTimeDropdown && (
                      <motion.div
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        className="absolute top-full left-0 right-0 mt-2 bg-white rounded-xl shadow-xl border border-gray-100 max-h-48 overflow-y-auto z-50"
                      >
                        {timeSlots.map((slot, i) => (
                          <div
                            key={i}
                            className={`px-4 py-2 hover:bg-amber-50 cursor-pointer ${time === slot.value ? 'bg-amber-50 text-amber-600' : 'text-gray-800'}`}
                            onClick={() => {
                              setTime(slot.value);
                              setShowTimeDropdown(false);
                            }}
                          >
                            {slot.label}
                          </div>
                        ))}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                {/* Guests */}
                <div className="relative">
                  <label className="block text-xs font-medium text-gray-500 mb-1 ml-1">Guests</label>
                  <div 
                    className="flex items-center gap-3 px-4 py-3 bg-gray-50 rounded-xl cursor-pointer hover:bg-gray-100 transition-colors"
                    onClick={() => setShowGuestsDropdown(!showGuestsDropdown)}
                  >
                    <Users className="w-5 h-5 text-amber-500" />
                    <span className="flex-1 text-gray-800">{guests} Guest{guests > 1 ? 's' : ''}</span>
                    <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${showGuestsDropdown ? 'rotate-180' : ''}`} />
                  </div>
                  
                  <AnimatePresence>
                    {showGuestsDropdown && (
                      <motion.div
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        className="absolute top-full left-0 right-0 mt-2 bg-white rounded-xl shadow-xl border border-gray-100 max-h-48 overflow-y-auto z-50"
                      >
                        {[1, 2, 3, 4, 5, 6, 7, 8, 10, 12, 15, 20].map((num) => (
                          <div
                            key={num}
                            className={`px-4 py-2 hover:bg-amber-50 cursor-pointer ${guests === num ? 'bg-amber-50 text-amber-600' : 'text-gray-800'}`}
                            onClick={() => {
                              setGuests(num);
                              setShowGuestsDropdown(false);
                            }}
                          >
                            {num} Guest{num > 1 ? 's' : ''}
                          </div>
                        ))}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </div>

              {/* Search Button */}
              <div className="mt-4 flex items-center gap-4">
                <button
                  onClick={() => handleSearch(1)}
                  disabled={loading}
                  className="flex-1 flex items-center justify-center gap-2 px-6 py-4 bg-gradient-to-r from-amber-500 to-orange-500 text-white font-semibold rounded-xl hover:from-amber-600 hover:to-orange-600 transition-all shadow-lg shadow-amber-500/30 disabled:opacity-70"
                >
                  {loading ? (
                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <>
                      <Search className="w-5 h-5" />
                      Find Restaurants
                    </>
                  )}
                </button>
                <button
                  onClick={() => setShowFilters(!showFilters)}
                  className={`p-4 rounded-xl border-2 transition-colors ${showFilters ? 'bg-amber-500 border-amber-500 text-white' : 'border-gray-200 text-gray-600 hover:border-amber-500 hover:text-amber-500'}`}
                >
                  <SlidersHorizontal className="w-5 h-5" />
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      </div>

      {/* Filters Section */}
      <AnimatePresence>
        {showFilters && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="bg-white border-b shadow-sm overflow-hidden"
          >
            <div className="max-w-7xl mx-auto px-4 py-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-gray-900">Filters</h3>
                <button
                  onClick={clearFilters}
                  className="text-sm text-amber-600 hover:text-amber-700"
                >
                  Clear All
                </button>
              </div>

              {/* Quick Cuisine Filters */}
              <div className="mb-6">
                <p className="text-sm text-gray-500 mb-3">Popular Cuisines</p>
                <div className="flex flex-wrap gap-2">
                  {popularCuisines.map((cuisine) => (
                    <button
                      key={cuisine.name}
                      onClick={() => {
                        setSelectedCuisines(prev => 
                          prev.includes(cuisine.name)
                            ? prev.filter(c => c !== cuisine.name)
                            : [...prev, cuisine.name]
                        );
                      }}
                      className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm transition-colors ${
                        selectedCuisines.includes(cuisine.name)
                          ? 'bg-amber-500 text-white'
                          : 'bg-gray-100 text-gray-700 hover:bg-amber-50 hover:text-amber-600'
                      }`}
                    >
                      {cuisine.icon}
                      {cuisine.name}
                    </button>
                  ))}
                </div>
              </div>

              {/* Price Range */}
              <div className="mb-6">
                <p className="text-sm text-gray-500 mb-3">Price Range</p>
                <div className="flex flex-wrap gap-3">
                  {priceRanges.map((range) => (
                    <button
                      key={range.value}
                      onClick={() => {
                        setSelectedPriceRange(prev =>
                          prev.includes(range.value)
                            ? prev.filter(p => p !== range.value)
                            : [...prev, range.value]
                        );
                      }}
                      className={`px-4 py-3 rounded-xl text-sm transition-colors ${
                        selectedPriceRange.includes(range.value)
                          ? 'bg-amber-500 text-white'
                          : 'bg-gray-100 text-gray-700 hover:bg-amber-50'
                      }`}
                    >
                      <div className="font-semibold">{range.label}</div>
                      <div className="text-xs opacity-75">{range.range}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Toggle Filters */}
              <div className="flex flex-wrap gap-4 mb-6">
                <button
                  onClick={() => setVegOnly(!vegOnly)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm transition-colors ${
                    vegOnly ? 'bg-green-500 text-white' : 'bg-gray-100 text-gray-700 hover:bg-green-50'
                  }`}
                >
                  <Leaf className="w-4 h-4" />
                  Pure Veg Only
                </button>
                <button
                  onClick={() => setHasBar(!hasBar)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm transition-colors ${
                    hasBar ? 'bg-purple-500 text-white' : 'bg-gray-100 text-gray-700 hover:bg-purple-50'
                  }`}
                >
                  <Wine className="w-4 h-4" />
                  Has Bar
                </button>
                <button
                  onClick={() => setFamilyFriendly(!familyFriendly)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm transition-colors ${
                    familyFriendly ? 'bg-blue-500 text-white' : 'bg-gray-100 text-gray-700 hover:bg-blue-50'
                  }`}
                >
                  <Baby className="w-4 h-4" />
                  Family Friendly
                </button>
                <button
                  onClick={() => setDeliveryAvailable(!deliveryAvailable)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm transition-colors ${
                    deliveryAvailable ? 'bg-orange-500 text-white' : 'bg-gray-100 text-gray-700 hover:bg-orange-50'
                  }`}
                >
                  <Truck className="w-4 h-4" />
                  Delivery Available
                </button>
              </div>

              {/* Rating Filter */}
              <div className="mb-4">
                <p className="text-sm text-gray-500 mb-3">Minimum Rating</p>
                <div className="flex gap-2">
                  {[0, 3, 3.5, 4, 4.5].map((rating) => (
                    <button
                      key={rating}
                      onClick={() => setMinRating(rating)}
                      className={`flex items-center gap-1 px-3 py-2 rounded-lg text-sm transition-colors ${
                        minRating === rating
                          ? 'bg-amber-500 text-white'
                          : 'bg-gray-100 text-gray-700 hover:bg-amber-50'
                      }`}
                    >
                      {rating === 0 ? 'Any' : (
                        <>
                          <Star className="w-3 h-3 fill-current" />
                          {rating}+
                        </>
                      )}
                    </button>
                  ))}
                </div>
              </div>

              {/* Sort By */}
              <div>
                <p className="text-sm text-gray-500 mb-3">Sort By</p>
                <div className="flex gap-2">
                  {[
                    { value: 'rating', label: 'Rating' },
                    { value: 'popularity', label: 'Popularity' },
                    { value: 'price_low', label: 'Price: Low to High' },
                    { value: 'price_high', label: 'Price: High to Low' }
                  ].map((option) => (
                    <button
                      key={option.value}
                      onClick={() => setSortBy(option.value)}
                      className={`px-4 py-2 rounded-lg text-sm transition-colors ${
                        sortBy === option.value
                          ? 'bg-amber-500 text-white'
                          : 'bg-gray-100 text-gray-700 hover:bg-amber-50'
                      }`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* Results Header */}
        {hasSearched && (
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-2xl font-bold text-gray-900">
                {totalResults} Restaurants in {city}
              </h2>
              <p className="text-gray-500 text-sm mt-1">
                {format(new Date(date), 'EEEE, MMMM d')} • {format(new Date(`2024-01-01T${time}`), 'h:mm a')} • {guests} Guest{guests > 1 ? 's' : ''}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setViewMode('grid')}
                className={`p-2 rounded-lg transition-colors ${viewMode === 'grid' ? 'bg-amber-100 text-amber-600' : 'text-gray-400 hover:text-gray-600'}`}
              >
                <Grid className="w-5 h-5" />
              </button>
              <button
                onClick={() => setViewMode('list')}
                className={`p-2 rounded-lg transition-colors ${viewMode === 'list' ? 'bg-amber-100 text-amber-600' : 'text-gray-400 hover:text-gray-600'}`}
              >
                <List className="w-5 h-5" />
              </button>
            </div>
          </div>
        )}

        {/* Popular Restaurants (before search) */}
        {!hasSearched && popularRestaurants.length > 0 && (
          <div className="mb-12">
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Popular Restaurants</h2>
            <p className="text-gray-500 mb-6">Top-rated restaurants loved by food enthusiasts</p>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {popularRestaurants.slice(0, 8).map((restaurant, idx) => (
                <RestaurantCard
                  key={restaurant.id}
                  restaurant={restaurant}
                  index={idx}
                  viewMode="grid"
                  isWishlisted={wishlist.includes(restaurant.id)}
                  onWishlistToggle={toggleWishlist}
                  onClick={() => handleRestaurantClick(restaurant)}
                />
              ))}
            </div>
          </div>
        )}

        {/* Browse by Cuisine */}
        {!hasSearched && (
          <div className="mb-12">
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Browse by Cuisine</h2>
            <p className="text-gray-500 mb-6">Explore restaurants by your favorite cuisine type</p>
            
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-4">
              {popularCuisines.map((cuisine, idx) => (
                <motion.div
                  key={cuisine.name}
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: idx * 0.05 }}
                  onClick={() => {
                    setSelectedCuisines([cuisine.name]);
                    if (city) handleSearch(1);
                  }}
                  className="cursor-pointer group"
                >
                  <div className="relative aspect-square rounded-2xl overflow-hidden">
                    <img
                      src={cuisineImages[cuisine.name] || cuisineImages['Default']}
                      alt={cuisine.name}
                      className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-300"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent" />
                    <div className="absolute bottom-0 left-0 right-0 p-3 text-white">
                      <p className="font-semibold text-sm">{cuisine.name}</p>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        )}

        {/* Search Results */}
        {hasSearched && (
          <>
            {loading && page === 1 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {[...Array(6)].map((_, i) => (
                  <div key={i} className="bg-white rounded-2xl overflow-hidden shadow-sm animate-pulse">
                    <div className="h-48 bg-gray-200" />
                    <div className="p-4 space-y-3">
                      <div className="h-4 bg-gray-200 rounded w-3/4" />
                      <div className="h-3 bg-gray-200 rounded w-1/2" />
                      <div className="h-3 bg-gray-200 rounded w-full" />
                    </div>
                  </div>
                ))}
              </div>
            ) : restaurants.length > 0 ? (
              <>
                <div className={viewMode === 'grid' ? 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6' : 'space-y-4'}>
                  {restaurants.map((restaurant, idx) => (
                    <RestaurantCard
                      key={restaurant.id}
                      restaurant={restaurant}
                      index={idx}
                      viewMode={viewMode}
                      isWishlisted={wishlist.includes(restaurant.id)}
                      onWishlistToggle={toggleWishlist}
                      onClick={() => handleRestaurantClick(restaurant)}
                    />
                  ))}
                </div>

                {/* Load More */}
                {restaurants.length < totalResults && (
                  <div className="mt-8 text-center">
                    <button
                      onClick={() => handleSearch(page + 1)}
                      disabled={loading}
                      className="px-8 py-3 bg-amber-500 text-white rounded-xl font-semibold hover:bg-amber-600 transition-colors disabled:opacity-70"
                    >
                      {loading ? (
                        <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin mx-auto" />
                      ) : (
                        `Load More (${totalResults - restaurants.length} remaining)`
                      )}
                    </button>
                  </div>
                )}
              </>
            ) : (
              <div className="text-center py-16">
                <Utensils className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                <h3 className="text-xl font-semibold text-gray-900 mb-2">No restaurants found</h3>
                <p className="text-gray-500">Try adjusting your filters or search for a different city</p>
                <button
                  onClick={clearFilters}
                  className="mt-4 px-6 py-2 text-amber-600 hover:text-amber-700 font-medium"
                >
                  Clear Filters
                </button>
              </div>
            )}
          </>
        )}

        {/* Browse by City */}
        {!hasSearched && cities.length > 0 && (
          <div className="mt-12">
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Popular Cities</h2>
            <p className="text-gray-500 mb-6">Discover restaurants in major Indian cities</p>
            
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
              {cities.slice(0, 12).map((c, idx) => (
                <motion.div
                  key={c.city}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: idx * 0.05 }}
                  onClick={() => {
                    setCity(c.city);
                    handleSearch(1);
                  }}
                  className="bg-white rounded-xl p-4 shadow-sm hover:shadow-md transition-shadow cursor-pointer group"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-semibold text-gray-900 group-hover:text-amber-600 transition-colors">{c.city}</h3>
                      <p className="text-sm text-gray-500">{c.count} restaurants</p>
                    </div>
                    <ArrowRight className="w-4 h-4 text-gray-300 group-hover:text-amber-500 transition-colors" />
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Click outside to close dropdowns */}
      {(showCityDropdown || showTimeDropdown || showGuestsDropdown) && (
        <div
          className="fixed inset-0 z-40"
          onClick={() => {
            setShowCityDropdown(false);
            setShowTimeDropdown(false);
            setShowGuestsDropdown(false);
          }}
        />
      )}
    </div>
  );
};

// Restaurant Card Component
const RestaurantCard = ({ restaurant, index, viewMode, isWishlisted, onWishlistToggle, onClick }) => {
  const cuisines = Array.isArray(restaurant.cuisines) 
    ? restaurant.cuisines 
    : (typeof restaurant.cuisines === 'string' ? restaurant.cuisines.split(',').map(c => c.trim()) : []);

  if (viewMode === 'list') {
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: index * 0.03 }}
        className="bg-white rounded-2xl overflow-hidden shadow-sm hover:shadow-xl transition-all cursor-pointer flex"
        onClick={onClick}
      >
        {/* Image */}
        <div className="relative w-64 flex-shrink-0">
          <img
            src={getRestaurantImage(restaurant.id, 0)}
            alt={restaurant.name}
            className="w-full h-full object-cover"
          />
          {restaurant.is_veg_only && (
            <span className="absolute top-3 left-3 px-2 py-1 bg-green-500 text-white text-xs rounded-full flex items-center gap-1">
              <Leaf className="w-3 h-3" />
              Pure Veg
            </span>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 p-5">
          <div className="flex items-start justify-between mb-2">
            <div>
              <h3 className="font-bold text-lg text-gray-900 hover:text-amber-600 transition-colors">
                {restaurant.name}
              </h3>
              <div className="flex items-center gap-2 text-sm text-gray-500 mt-1">
                <MapPin className="w-4 h-4" />
                <span>{restaurant.address || restaurant.city}</span>
              </div>
            </div>
            <div className="flex items-center gap-1 px-2 py-1 bg-green-50 rounded-lg">
              <Star className="w-4 h-4 text-green-600 fill-green-600" />
              <span className="font-semibold text-green-700">{restaurant.rating || '4.0'}</span>
            </div>
          </div>

          <div className="flex flex-wrap gap-1 mb-3">
            {cuisines.slice(0, 4).map((cuisine, i) => (
              <span key={i} className="px-2 py-1 bg-gray-100 text-gray-600 text-xs rounded-full">
                {cuisine}
              </span>
            ))}
            {cuisines.length > 4 && (
              <span className="px-2 py-1 text-gray-400 text-xs">+{cuisines.length - 4} more</span>
            )}
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4 text-sm text-gray-500">
              <span className="flex items-center gap-1">
                <IndianRupee className="w-4 h-4" />
                {restaurant.avg_cost_for_two || 500} for two
              </span>
              <span className="flex items-center gap-1">
                <Timer className="w-4 h-4" />
                {restaurant.avg_dining_time || 60} mins
              </span>
            </div>
            <div className="flex items-center gap-2">
              {restaurant.has_bar && (
                <span className="p-1.5 bg-purple-50 text-purple-500 rounded-full" title="Has Bar">
                  <Wine className="w-4 h-4" />
                </span>
              )}
              {restaurant.delivery_available && (
                <span className="p-1.5 bg-orange-50 text-orange-500 rounded-full" title="Delivery Available">
                  <Truck className="w-4 h-4" />
                </span>
              )}
              {restaurant.is_family_friendly && (
                <span className="p-1.5 bg-blue-50 text-blue-500 rounded-full" title="Family Friendly">
                  <Baby className="w-4 h-4" />
                </span>
              )}
            </div>
          </div>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.03 }}
      className="bg-white rounded-2xl overflow-hidden shadow-sm hover:shadow-xl transition-all cursor-pointer group"
      onClick={onClick}
    >
      {/* Image */}
      <div className="relative h-48 overflow-hidden">
        <img
          src={getRestaurantImage(restaurant.id, 0)}
          alt={restaurant.name}
          className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
        
        {/* Badges */}
        <div className="absolute top-3 left-3 flex gap-2">
          {restaurant.is_veg_only && (
            <span className="px-2 py-1 bg-green-500 text-white text-xs rounded-full flex items-center gap-1">
              <Leaf className="w-3 h-3" />
              Pure Veg
            </span>
          )}
          {restaurant.rating >= 4.5 && (
            <span className="px-2 py-1 bg-amber-500 text-white text-xs rounded-full flex items-center gap-1">
              <Award className="w-3 h-3" />
              Top Rated
            </span>
          )}
        </div>

        {/* Rating */}
        <div className="absolute bottom-3 right-3 flex items-center gap-1 px-2 py-1 bg-white/90 backdrop-blur-sm rounded-lg">
          <Star className="w-4 h-4 text-amber-500 fill-amber-500" />
          <span className="font-semibold text-gray-900">{restaurant.rating || '4.0'}</span>
        </div>
      </div>

      {/* Content */}
      <div className="p-4">
        <h3 className="font-bold text-gray-900 mb-1 truncate group-hover:text-amber-600 transition-colors">
          {restaurant.name}
        </h3>
        
        <div className="flex items-center gap-1 text-sm text-gray-500 mb-3">
          <MapPin className="w-3 h-3 flex-shrink-0" />
          <span className="truncate">{restaurant.address || restaurant.city}</span>
        </div>

        <div className="flex flex-wrap gap-1 mb-3">
          {cuisines.slice(0, 3).map((cuisine, i) => (
            <span key={i} className="px-2 py-0.5 bg-amber-50 text-amber-700 text-xs rounded-full">
              {cuisine}
            </span>
          ))}
          {cuisines.length > 3 && (
            <span className="px-2 py-0.5 text-gray-400 text-xs">+{cuisines.length - 3}</span>
          )}
        </div>

        <div className="flex items-center justify-between pt-3 border-t border-gray-100">
          <div className="flex items-center gap-1 text-sm">
            <IndianRupee className="w-3 h-3 text-gray-400" />
            <span className="text-gray-600">{restaurant.avg_cost_for_two || 500} for two</span>
          </div>
          <div className="flex items-center gap-1">
            {restaurant.has_bar && <Wine className="w-4 h-4 text-purple-400" />}
            {restaurant.delivery_available && <Truck className="w-4 h-4 text-orange-400" />}
          </div>
        </div>
      </div>
    </motion.div>
  );
};

export default Restaurants;
