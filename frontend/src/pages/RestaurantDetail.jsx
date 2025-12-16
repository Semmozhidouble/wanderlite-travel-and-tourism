import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Star,
  MapPin,
  Clock,
  Phone,
  Mail,
  Users,
  Calendar,
  ChevronLeft,
  ChevronRight,
  Heart,
  Share2,
  Leaf,
  Wine,
  Baby,
  Truck,
  Wifi,
  ParkingSquare,
  CreditCard,
  IndianRupee,
  UtensilsCrossed,
  ArrowRight,
  Check,
  X,
  Timer,
  Flame,
  Award,
  Camera,
  MessageSquare,
  Navigation,
  Info,
  FileText,
  AlertCircle,
  Plus,
  Minus,
  ShoppingBag,
  UserPlus,
  Sparkles,
  ChefHat,
  Zap
} from 'lucide-react';
import axios from 'axios';
import { format, addDays, parse, isAfter, isBefore } from 'date-fns';
import Navbar from '../components/Navbar';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:8000';

// 4K Quality Restaurant Images Array
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
  'https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=3840&q=100'
];

// Food item images by category
const foodImages = {
  'Starters': [
    'https://images.unsplash.com/photo-1601050690117-94f5f6fa8bd7?w=800&q=90',
    'https://images.unsplash.com/photo-1599487488170-d11ec9c172f0?w=800&q=90',
    'https://images.unsplash.com/photo-1567188040759-fb8a883dc6d8?w=800&q=90'
  ],
  'Main Course': [
    'https://images.unsplash.com/photo-1585937421612-70a008356fbe?w=800&q=90',
    'https://images.unsplash.com/photo-1596797038530-2c107229654b?w=800&q=90',
    'https://images.unsplash.com/photo-1563379091339-03b21ab4a4f8?w=800&q=90'
  ],
  'Biryani': [
    'https://images.unsplash.com/photo-1563379091339-03b21ab4a4f8?w=800&q=90',
    'https://images.unsplash.com/photo-1589302168068-964664d93dc0?w=800&q=90'
  ],
  'Desserts': [
    'https://images.unsplash.com/photo-1551024506-0bccd828d307?w=800&q=90',
    'https://images.unsplash.com/photo-1488477181946-6428a0291777?w=800&q=90'
  ],
  'Beverages': [
    'https://images.unsplash.com/photo-1544145945-f90425340c7e?w=800&q=90',
    'https://images.unsplash.com/photo-1556679343-c7306c1976bc?w=800&q=90'
  ],
  'Default': 'https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=800&q=90'
};

// Get restaurant image based on ID
const getRestaurantImage = (restaurantId, index = 0) => {
  if (!restaurantId) return restaurantImages[0];
  const hash = String(restaurantId).split('').reduce((a, b) => {
    return ((a << 5) - a) + b.charCodeAt(0);
  }, 0);
  return restaurantImages[Math.abs(hash + index) % restaurantImages.length];
};

// Get food image based on category
const getFoodImage = (category, itemId) => {
  const categoryImages = foodImages[category] || [foodImages['Default']];
  const hash = String(itemId || 0).split('').reduce((a, b) => {
    return ((a << 5) - a) + b.charCodeAt(0);
  }, 0);
  return Array.isArray(categoryImages) ? categoryImages[Math.abs(hash) % categoryImages.length] : categoryImages;
};

// Tabs
const tabs = [
  { id: 'overview', label: 'Overview', icon: Info },
  { id: 'menu', label: 'Menu', icon: UtensilsCrossed },
  { id: 'photos', label: 'Photos', icon: Camera },
  { id: 'reviews', label: 'Reviews', icon: MessageSquare },
  { id: 'location', label: 'Location', icon: Navigation },
  { id: 'policies', label: 'Policies', icon: FileText }
];

// Amenity icons
const amenityIcons = {
  'WiFi': Wifi,
  'Parking': ParkingSquare,
  'Card Payment': CreditCard,
  'Air Conditioned': Clock,
  'Outdoor Seating': Users,
  'Live Music': Sparkles,
  'Private Dining': Users,
  'Valet Parking': ParkingSquare,
  'Wheelchair Accessible': Users
};

const RestaurantDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  // Restaurant data
  const [restaurant, setRestaurant] = useState(null);
  const [tables, setTables] = useState([]);
  const [menuItems, setMenuItems] = useState([]);
  const [reviews, setReviews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // UI state
  const [activeTab, setActiveTab] = useState('overview');
  const [selectedDate, setSelectedDate] = useState(searchParams.get('date') || format(new Date(), 'yyyy-MM-dd'));
  const [selectedTime, setSelectedTime] = useState(searchParams.get('time') || '19:00');
  const [guests, setGuests] = useState(parseInt(searchParams.get('guests')) || 2);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [isWishlisted, setIsWishlisted] = useState(false);
  const [showAllPhotos, setShowAllPhotos] = useState(false);

  // Menu state
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [menuSearch, setMenuSearch] = useState('');
  const [vegFilter, setVegFilter] = useState(false);

  // Cart for pre-order
  const [cart, setCart] = useState([]);
  const [showCart, setShowCart] = useState(false);

  // Fetch restaurant data
  useEffect(() => {
    fetchRestaurantData();
    checkWishlist();
  }, [id]);

  const fetchRestaurantData = async () => {
    setLoading(true);
    try {
      const [restaurantRes, tablesRes, menuRes] = await Promise.all([
        axios.get(`${API_URL}/api/restaurant/${id}`),
        axios.get(`${API_URL}/api/restaurant/${id}/tables`),
        axios.get(`${API_URL}/api/restaurant/${id}/menu`)
      ]);

      // Backend returns restaurant directly, not nested in .restaurant
      const restaurantData = restaurantRes.data.restaurant || restaurantRes.data;
      setRestaurant(restaurantData);
      setTables(tablesRes.data.tables || tablesRes.data || []);
      
      // Menu comes as {menu: [{category, items}]} - flatten to get all items
      const menuData = menuRes.data.menu || menuRes.data.menu_items || menuRes.data || [];
      const allMenuItems = Array.isArray(menuData) 
        ? menuData.flatMap(cat => cat.items || [cat]) 
        : [];
      setMenuItems(allMenuItems);
      setReviews(restaurantData?.reviews || generateMockReviews());
    } catch (error) {
      console.error('Error fetching restaurant:', error);
      setError('Failed to load restaurant details');
    } finally {
      setLoading(false);
    }
  };

  const checkWishlist = () => {
    const saved = localStorage.getItem('restaurantWishlist');
    if (saved) {
      const wishlist = JSON.parse(saved);
      setIsWishlisted(wishlist.includes(parseInt(id)));
    }
  };

  const toggleWishlist = () => {
    const saved = localStorage.getItem('restaurantWishlist');
    let wishlist = saved ? JSON.parse(saved) : [];
    
    if (isWishlisted) {
      wishlist = wishlist.filter(wid => wid !== parseInt(id));
    } else {
      wishlist.push(parseInt(id));
    }
    
    localStorage.setItem('restaurantWishlist', JSON.stringify(wishlist));
    setIsWishlisted(!isWishlisted);
  };

  // Generate mock reviews
  const generateMockReviews = () => {
    const names = ['Rahul S.', 'Priya M.', 'Amit K.', 'Neha R.', 'Vikram P.', 'Anjali D.'];
    const comments = [
      'Amazing food and great ambiance! Will definitely come back.',
      'The biryani here is the best I\'ve ever had. Highly recommended!',
      'Good service but the wait time was a bit long during peak hours.',
      'Perfect for family gatherings. Kids loved the desserts!',
      'Authentic flavors and generous portions. Value for money.',
      'The staff was very friendly and accommodating to our dietary requirements.'
    ];
    
    return names.map((name, i) => ({
      id: i + 1,
      user_name: name,
      rating: Math.floor(Math.random() * 2) + 4,
      food_rating: Math.floor(Math.random() * 2) + 4,
      service_rating: Math.floor(Math.random() * 2) + 4,
      ambience_rating: Math.floor(Math.random() * 2) + 4,
      review_text: comments[i],
      created_at: format(addDays(new Date(), -Math.floor(Math.random() * 30)), 'yyyy-MM-dd'),
      is_verified: Math.random() > 0.3
    }));
  };

  // Cart functions
  const addToCart = (item) => {
    const existing = cart.find(c => c.id === item.id);
    if (existing) {
      setCart(cart.map(c => c.id === item.id ? { ...c, quantity: c.quantity + 1 } : c));
    } else {
      setCart([...cart, { ...item, quantity: 1 }]);
    }
  };

  const removeFromCart = (itemId) => {
    const existing = cart.find(c => c.id === itemId);
    if (existing && existing.quantity > 1) {
      setCart(cart.map(c => c.id === itemId ? { ...c, quantity: c.quantity - 1 } : c));
    } else {
      setCart(cart.filter(c => c.id !== itemId));
    }
  };

  const getCartTotal = () => {
    return cart.reduce((total, item) => total + (item.price * item.quantity), 0);
  };

  const getCartItemCount = () => {
    return cart.reduce((count, item) => count + item.quantity, 0);
  };

  // Time slots
  const generateTimeSlots = () => {
    const slots = [];
    const operatingHours = restaurant?.operating_hours || { open: '11:00', close: '23:00' };
    const openHour = parseInt(operatingHours.open?.split(':')[0] || 11);
    const closeHour = parseInt(operatingHours.close?.split(':')[0] || 23);
    
    for (let hour = openHour; hour < closeHour; hour++) {
      for (let min = 0; min < 60; min += 30) {
        const timeStr = `${hour.toString().padStart(2, '0')}:${min.toString().padStart(2, '0')}`;
        const isPeakHour = (hour >= 12 && hour <= 14) || (hour >= 19 && hour <= 21);
        slots.push({
          value: timeStr,
          label: format(new Date(`2024-01-01T${timeStr}`), 'h:mm a'),
          isPeakHour
        });
      }
    }
    return slots;
  };

  // Handle booking
  const handleBookTable = () => {
    const token = localStorage.getItem('token');
    if (!token) {
      if (window.confirm('Please login to book a table. Go to login page?')) {
        navigate('/login', { state: { from: `/restaurant/${id}` } });
      }
      return;
    }

    navigate(`/restaurant/${id}/book`, {
      state: {
        restaurant,
        date: selectedDate,
        time: selectedTime,
        guests
      }
    });
  };

  // Handle pre-order
  const handlePreOrder = () => {
    if (cart.length === 0) {
      alert('Please add items to your cart first');
      return;
    }

    const token = localStorage.getItem('token');
    if (!token) {
      if (window.confirm('Please login to pre-order. Go to login page?')) {
        navigate('/login', { state: { from: `/restaurant/${id}` } });
      }
      return;
    }

    navigate(`/restaurant/${id}/preorder`, {
      state: {
        restaurant,
        cart,
        date: selectedDate,
        time: selectedTime,
        guests
      }
    });
  };

  // Handle join queue
  const handleJoinQueue = () => {
    const token = localStorage.getItem('token');
    if (!token) {
      if (window.confirm('Please login to join the queue. Go to login page?')) {
        navigate('/login', { state: { from: `/restaurant/${id}` } });
      }
      return;
    }

    navigate(`/restaurant/${id}/queue`, {
      state: {
        restaurant,
        guests
      }
    });
  };

  // Get menu categories
  const getMenuCategories = () => {
    const categories = new Set(menuItems.map(item => item.category));
    return ['All', ...Array.from(categories)];
  };

  // Filter menu items
  const getFilteredMenu = () => {
    return menuItems.filter(item => {
      const matchesCategory = selectedCategory === 'All' || item.category === selectedCategory;
      const matchesSearch = !menuSearch || item.name.toLowerCase().includes(menuSearch.toLowerCase());
      const matchesVeg = !vegFilter || item.is_veg;
      return matchesCategory && matchesSearch && matchesVeg;
    });
  };

  // Generate gallery images
  const getGalleryImages = () => {
    const images = [];
    for (let i = 0; i < 12; i++) {
      images.push(getRestaurantImage(id, i));
    }
    return images;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 pt-16">
        <Navbar />
        <div className="max-w-7xl mx-auto px-4 py-12">
          <div className="animate-pulse space-y-8">
            <div className="h-[400px] bg-gray-200 rounded-2xl" />
            <div className="h-8 bg-gray-200 rounded w-1/2" />
            <div className="h-4 bg-gray-200 rounded w-1/3" />
            <div className="grid grid-cols-3 gap-4">
              <div className="h-32 bg-gray-200 rounded-xl" />
              <div className="h-32 bg-gray-200 rounded-xl" />
              <div className="h-32 bg-gray-200 rounded-xl" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (error || !restaurant) {
    return (
      <div className="min-h-screen bg-gray-50 pt-16">
        <Navbar />
        <div className="max-w-7xl mx-auto px-4 py-12 text-center">
          <AlertCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Restaurant Not Found</h2>
          <p className="text-gray-500 mb-6">{error || 'The restaurant you\'re looking for doesn\'t exist.'}</p>
          <button
            onClick={() => navigate('/restaurants')}
            className="px-6 py-3 bg-amber-500 text-white rounded-xl font-semibold hover:bg-amber-600 transition-colors"
          >
            Browse Restaurants
          </button>
        </div>
      </div>
    );
  }

  const cuisines = Array.isArray(restaurant.cuisines) 
    ? restaurant.cuisines 
    : (typeof restaurant.cuisines === 'string' ? restaurant.cuisines.split(',').map(c => c.trim()) : []);

  const amenities = Array.isArray(restaurant.amenities) 
    ? restaurant.amenities.map(a => typeof a === 'object' ? a.name : a) 
    : ['WiFi', 'Parking', 'Card Payment', 'Air Conditioned'];

  const timeSlots = generateTimeSlots();
  const galleryImages = getGalleryImages();

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />

      {/* Hero Section - full bleed */}
      <div className="relative h-[450px] overflow-hidden pt-16">
        {/* Main Image */}
        <div className="absolute inset-0">
          <img
            src={getRestaurantImage(id, currentImageIndex)}
            alt={restaurant.name}
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent" />
        </div>

        {/* Image Navigation */}
        <button
          onClick={() => setCurrentImageIndex(prev => (prev - 1 + 6) % 6)}
          className="absolute left-4 top-1/2 -translate-y-1/2 p-3 bg-white/20 backdrop-blur-sm rounded-full text-white hover:bg-white/30 transition-colors z-10"
        >
          <ChevronLeft className="w-6 h-6" />
        </button>
        <button
          onClick={() => setCurrentImageIndex(prev => (prev + 1) % 6)}
          className="absolute right-4 top-1/2 -translate-y-1/2 p-3 bg-white/20 backdrop-blur-sm rounded-full text-white hover:bg-white/30 transition-colors z-10"
        >
          <ChevronRight className="w-6 h-6" />
        </button>

        {/* Image Dots */}
        <div className="absolute bottom-24 left-1/2 -translate-x-1/2 flex gap-2 z-10">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <button
              key={i}
              onClick={() => setCurrentImageIndex(i)}
              className={`w-2 h-2 rounded-full transition-all ${
                currentImageIndex === i ? 'bg-white w-6' : 'bg-white/50'
              }`}
            />
          ))}
        </div>

        {/* View All Photos */}
        <button
          onClick={() => setShowAllPhotos(true)}
          className="absolute bottom-24 right-4 flex items-center gap-2 px-4 py-2 bg-white/20 backdrop-blur-sm rounded-full text-white text-sm hover:bg-white/30 transition-colors z-10"
        >
          <Camera className="w-4 h-4" />
          View All Photos
        </button>

        {/* Restaurant Info */}
        <div className="absolute bottom-0 left-0 right-0 p-6 text-white z-10">
          <div className="max-w-7xl mx-auto">
            <div className="flex items-start justify-between">
              <div>
                <div className="flex items-center gap-3 mb-2">
                  {restaurant.is_veg_only && (
                    <span className="px-3 py-1 bg-green-500 text-white text-xs rounded-full flex items-center gap-1">
                      <Leaf className="w-3 h-3" />
                      Pure Veg
                    </span>
                  )}
                  {restaurant.rating >= 4.5 && (
                    <span className="px-3 py-1 bg-amber-500 text-white text-xs rounded-full flex items-center gap-1">
                      <Award className="w-3 h-3" />
                      Top Rated
                    </span>
                  )}
                </div>
                <h1 className="text-3xl md:text-4xl font-bold mb-2">{restaurant.name}</h1>
                <div className="flex items-center gap-4 text-white/90 text-sm">
                  <div className="flex items-center gap-1">
                    <MapPin className="w-4 h-4" />
                    <span>{restaurant.address || restaurant.city}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Star className="w-4 h-4 fill-amber-400 text-amber-400" />
                    <span className="font-semibold">{restaurant.rating || '4.0'}</span>
                    <span className="text-white/70">({reviews.length} reviews)</span>
                  </div>
                </div>
              </div>
              <div className="hidden md:flex items-center gap-2 px-4 py-2 bg-white/10 backdrop-blur-sm rounded-xl">
                <IndianRupee className="w-5 h-5" />
                <span className="font-semibold text-lg">{restaurant.avg_cost_for_two || 500}</span>
                <span className="text-sm text-white/70">for two</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 py-6">
        <div className="flex flex-col lg:flex-row gap-8">
          {/* Left Content */}
          <div className="flex-1 min-w-0">
            {/* Tabs */}
            <div className="bg-white rounded-xl shadow-sm mb-6 sticky top-16 z-20">
              <div className="flex overflow-x-auto scrollbar-hide">
                {tabs.map((tab) => {
                  const Icon = tab.icon;
                  return (
                    <button
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id)}
                      className={`flex items-center gap-2 px-6 py-4 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                        activeTab === tab.id
                          ? 'text-amber-600 border-amber-500'
                          : 'text-gray-500 border-transparent hover:text-gray-700'
                      }`}
                    >
                      <Icon className="w-4 h-4" />
                      {tab.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Tab Content */}
            <div className="space-y-6">
              {/* Overview Tab */}
              {activeTab === 'overview' && (
                <>
                  {/* Quick Info */}
                  <div className="bg-white rounded-2xl p-6 shadow-sm">
                    <h2 className="text-lg font-bold text-gray-900 mb-4">Quick Information</h2>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div className="p-4 bg-gray-50 rounded-xl">
                        <UtensilsCrossed className="w-5 h-5 text-amber-500 mb-2" />
                        <p className="text-xs text-gray-500 mb-1">Cuisines</p>
                        <p className="font-semibold text-sm text-gray-900">{cuisines.slice(0, 2).join(', ')}</p>
                      </div>
                      <div className="p-4 bg-gray-50 rounded-xl">
                        <Clock className="w-5 h-5 text-amber-500 mb-2" />
                        <p className="text-xs text-gray-500 mb-1">Avg. Dining Time</p>
                        <p className="font-semibold text-sm text-gray-900">{restaurant.avg_dining_time || 60} mins</p>
                      </div>
                      <div className="p-4 bg-gray-50 rounded-xl">
                        <Users className="w-5 h-5 text-amber-500 mb-2" />
                        <p className="text-xs text-gray-500 mb-1">Seating Capacity</p>
                        <p className="font-semibold text-sm text-gray-900">{restaurant.seating_capacity || 100} guests</p>
                      </div>
                      <div className="p-4 bg-gray-50 rounded-xl">
                        <Timer className="w-5 h-5 text-amber-500 mb-2" />
                        <p className="text-xs text-gray-500 mb-1">Operating Hours</p>
                        <p className="font-semibold text-sm text-gray-900">
                          {restaurant.operating_hours?.open || '11:00'} - {restaurant.operating_hours?.close || '23:00'}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Description */}
                  <div className="bg-white rounded-2xl p-6 shadow-sm">
                    <h2 className="text-lg font-bold text-gray-900 mb-4">About</h2>
                    <p className="text-gray-600 leading-relaxed">
                      {restaurant.description || `Welcome to ${restaurant.name}, a premier dining destination in ${restaurant.city}. We offer an exquisite selection of ${cuisines.join(', ')} cuisines prepared by our expert chefs using the finest ingredients.`}
                    </p>
                  </div>

                  {/* Amenities */}
                  <div className="bg-white rounded-2xl p-6 shadow-sm">
                    <h2 className="text-lg font-bold text-gray-900 mb-4">Amenities & Features</h2>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      {amenities.map((amenity, i) => {
                        const Icon = amenityIcons[amenity] || Check;
                        return (
                          <div key={i} className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl">
                            <div className="p-2 bg-amber-100 rounded-lg">
                              <Icon className="w-4 h-4 text-amber-600" />
                            </div>
                            <span className="text-sm text-gray-700">{amenity}</span>
                          </div>
                        );
                      })}
                      {restaurant.has_bar && (
                        <div className="flex items-center gap-3 p-3 bg-purple-50 rounded-xl">
                          <div className="p-2 bg-purple-100 rounded-lg">
                            <Wine className="w-4 h-4 text-purple-600" />
                          </div>
                          <span className="text-sm text-gray-700">Bar Available</span>
                        </div>
                      )}
                    </div>
                  </div>
                </>
              )}

              {/* Menu Tab */}
              {activeTab === 'menu' && (
                <div className="bg-white rounded-2xl p-6 shadow-sm">
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
                    <h2 className="text-lg font-bold text-gray-900">Menu</h2>
                    <div className="flex items-center gap-3">
                      <input
                        type="text"
                        placeholder="Search menu..."
                        value={menuSearch}
                        onChange={(e) => setMenuSearch(e.target.value)}
                        className="flex-1 md:w-64 pl-4 pr-4 py-2 border border-gray-200 rounded-lg"
                      />
                      <button
                        onClick={() => setVegFilter(!vegFilter)}
                        className={`flex items-center gap-2 px-4 py-2 rounded-lg border ${
                          vegFilter ? 'bg-green-500 text-white border-green-500' : 'border-gray-200 text-gray-600'
                        }`}
                      >
                        <Leaf className="w-4 h-4" />
                        Veg
                      </button>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2 mb-6 pb-6 border-b">
                    {getMenuCategories().map((category) => (
                      <button
                        key={category}
                        onClick={() => setSelectedCategory(category)}
                        className={`px-4 py-2 rounded-full text-sm ${
                          selectedCategory === category ? 'bg-amber-500 text-white' : 'bg-gray-100 text-gray-700'
                        }`}
                      >
                        {category}
                      </button>
                    ))}
                  </div>

                  <div className="space-y-4">
                    {getFilteredMenu().map((item) => (
                      <div key={item.id} className="flex gap-4 p-4 bg-gray-50 rounded-xl">
                        <img src={getFoodImage(item.category, item.id)} alt={item.name} className="w-24 h-24 rounded-lg object-cover" />
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <span className={`w-4 h-4 rounded border-2 flex items-center justify-center ${item.is_veg ? 'border-green-500' : 'border-red-500'}`}>
                              <span className={`w-2 h-2 rounded-full ${item.is_veg ? 'bg-green-500' : 'bg-red-500'}`} />
                            </span>
                            <h4 className="font-semibold text-gray-900">{item.name}</h4>
                            {item.is_bestseller && <span className="px-2 py-0.5 bg-amber-100 text-amber-700 text-xs rounded-full">Bestseller</span>}
                          </div>
                          <p className="text-sm text-gray-500 line-clamp-2">{item.description}</p>
                          <div className="flex items-center justify-between mt-3">
                            <p className="font-bold text-gray-900">₹{item.price}</p>
                            {cart.find(c => c.id === item.id) ? (
                              <div className="flex items-center gap-2">
                                <button onClick={() => removeFromCart(item.id)} className="p-1 bg-amber-100 text-amber-600 rounded-md"><Minus className="w-4 h-4" /></button>
                                <span className="font-semibold">{cart.find(c => c.id === item.id).quantity}</span>
                                <button onClick={() => addToCart(item)} className="p-1 bg-amber-100 text-amber-600 rounded-md"><Plus className="w-4 h-4" /></button>
                              </div>
                            ) : (
                              <button onClick={() => addToCart(item)} className="flex items-center gap-1 px-4 py-2 bg-amber-500 text-white text-sm rounded-lg"><Plus className="w-4 h-4" />Add</button>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Photos Tab */}
              {activeTab === 'photos' && (
                <div className="bg-white rounded-2xl p-6 shadow-sm">
                  <h2 className="text-lg font-bold text-gray-900 mb-4">Photos</h2>
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                    {galleryImages.map((img, i) => (
                      <div key={i} className="aspect-square rounded-xl overflow-hidden cursor-pointer group" onClick={() => { setCurrentImageIndex(i); setShowAllPhotos(true); }}>
                        <img src={img} alt={`Photo ${i + 1}`} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-300" />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Reviews Tab */}
              {activeTab === 'reviews' && (
                <div className="bg-white rounded-2xl p-6 shadow-sm">
                  <div className="flex items-center justify-between mb-6">
                    <h2 className="text-lg font-bold text-gray-900">Reviews</h2>
                    <div className="flex items-center gap-2 px-4 py-2 bg-green-50 rounded-lg">
                      <Star className="w-5 h-5 text-green-600 fill-green-600" />
                      <span className="text-xl font-bold text-green-700">{restaurant.rating || '4.0'}</span>
                    </div>
                  </div>
                  <div className="space-y-6">
                    {reviews.map((review) => (
                      <div key={review.id} className="border-b border-gray-100 pb-6 last:border-0">
                        <div className="flex items-start justify-between mb-3">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-amber-100 rounded-full flex items-center justify-center">
                              <span className="font-semibold text-amber-600">{review.user_name.charAt(0)}</span>
                            </div>
                            <div>
                              <span className="font-semibold text-gray-900">{review.user_name}</span>
                              {review.is_verified && <span className="ml-2 text-xs text-green-600 flex items-center gap-1"><Check className="w-3 h-3" />Verified</span>}
                              <p className="text-xs text-gray-500">{format(new Date(review.created_at), 'MMM d, yyyy')}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-1 px-2 py-1 bg-green-50 rounded">
                            <Star className="w-4 h-4 text-green-600 fill-green-600" />
                            <span className="font-semibold text-green-700">{review.rating}</span>
                          </div>
                        </div>
                        <p className="text-gray-600">{review.review_text}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Location Tab */}
              {activeTab === 'location' && (
                <div className="bg-white rounded-2xl p-6 shadow-sm">
                  <h2 className="text-lg font-bold text-gray-900 mb-4">Location</h2>
                  <div className="aspect-video bg-gray-200 rounded-xl mb-4 flex items-center justify-center">
                    <div className="text-center">
                      <MapPin className="w-12 h-12 text-amber-500 mx-auto mb-2" />
                      <p className="text-gray-600">{restaurant.address || restaurant.city}</p>
                    </div>
                  </div>
                </div>
              )}

              {/* Policies Tab */}
              {activeTab === 'policies' && (
                <div className="bg-white rounded-2xl p-6 shadow-sm">
                  <h2 className="text-lg font-bold text-gray-900 mb-4">Restaurant Policies</h2>
                  <div className="space-y-4">
                    <div className="p-4 bg-gray-50 rounded-xl">
                      <h3 className="font-semibold text-gray-900 mb-2">Reservation Policy</h3>
                      <ul className="text-sm text-gray-600 space-y-1">
                        <li>• Table reservations can be made up to 30 days in advance</li>
                        <li>• A 15-minute grace period is allowed for late arrivals</li>
                      </ul>
                    </div>
                    <div className="p-4 bg-amber-50 rounded-xl">
                      <h3 className="font-semibold text-amber-900 mb-2">Peak Hour Pricing</h3>
                      <p className="text-sm text-amber-700">A peak hour surcharge of ₹50-100 per person may apply during lunch (12-2 PM) and dinner (7-9 PM).</p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Right Sidebar - Booking Panel */}
          <div className="lg:w-[380px] flex-shrink-0">
            <div className="sticky top-24 space-y-4">
              {/* Book Table Card */}
              <div className="bg-white rounded-2xl shadow-sm p-6">
                <h3 className="text-lg font-bold text-gray-900 mb-4">Book a Table</h3>
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2">Date</label>
                  <div className="flex items-center gap-3 px-4 py-3 bg-gray-50 rounded-xl">
                    <Calendar className="w-5 h-5 text-amber-500" />
                    <input type="date" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} min={format(new Date(), 'yyyy-MM-dd')} className="flex-1 bg-transparent outline-none" />
                  </div>
                </div>
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2">Time</label>
                  <div className="grid grid-cols-3 gap-2">
                    {timeSlots.slice(0, 9).map((slot) => (
                      <button key={slot.value} onClick={() => setSelectedTime(slot.value)} className={`px-3 py-2 rounded-lg text-sm ${selectedTime === slot.value ? 'bg-amber-500 text-white' : slot.isPeakHour ? 'bg-amber-50 text-amber-700' : 'bg-gray-100 text-gray-700'}`}>
                        {slot.label}
                        {slot.isPeakHour && <Zap className="w-3 h-3 inline ml-1" />}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="mb-6">
                  <label className="block text-sm font-medium text-gray-700 mb-2">Guests</label>
                  <div className="flex items-center justify-between px-4 py-3 bg-gray-50 rounded-xl">
                    <Users className="w-5 h-5 text-amber-500" />
                    <div className="flex items-center gap-4">
                      <button onClick={() => setGuests(Math.max(1, guests - 1))} className="p-1 bg-white rounded-full shadow"><Minus className="w-4 h-4" /></button>
                      <span className="font-semibold min-w-[30px] text-center">{guests}</span>
                      <button onClick={() => setGuests(Math.min(20, guests + 1))} className="p-1 bg-white rounded-full shadow"><Plus className="w-4 h-4" /></button>
                    </div>
                    <span className="text-gray-500">guests</span>
                  </div>
                </div>
                <button onClick={handleBookTable} className="w-full flex items-center justify-center gap-2 px-6 py-4 bg-gradient-to-r from-amber-500 to-orange-500 text-white font-semibold rounded-xl hover:from-amber-600 hover:to-orange-600 shadow-lg shadow-amber-500/30">
                  <Calendar className="w-5 h-5" />
                  Book Table
                </button>
              </div>

              {/* Pre-Order Card */}
              <div className="bg-white rounded-2xl shadow-sm p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-bold text-gray-900">Pre-Order Food</h3>
                  {cart.length > 0 && <span className="px-3 py-1 bg-amber-100 text-amber-700 rounded-full text-sm font-semibold">{getCartItemCount()} items</span>}
                </div>
                <p className="text-sm text-gray-500 mb-4">Order your food in advance and have it ready when you arrive.</p>
                {cart.length > 0 && (
                  <div className="mb-4 p-3 bg-gray-50 rounded-xl">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-gray-600">Cart Total</span>
                      <span className="font-bold text-gray-900">₹{getCartTotal()}</span>
                    </div>
                  </div>
                )}
                <button onClick={() => setActiveTab('menu')} className="w-full flex items-center justify-center gap-2 px-6 py-3 border-2 border-amber-500 text-amber-600 font-semibold rounded-xl hover:bg-amber-50">
                  <ShoppingBag className="w-5 h-5" />
                  {cart.length > 0 ? 'View Cart' : 'Browse Menu'}
                </button>
                {cart.length > 0 && (
                  <button onClick={handlePreOrder} className="w-full mt-2 flex items-center justify-center gap-2 px-6 py-3 bg-amber-500 text-white font-semibold rounded-xl hover:bg-amber-600">
                    <ChefHat className="w-5 h-5" />
                    Place Pre-Order
                  </button>
                )}
              </div>

              {/* Join Queue Card */}
              <div className="bg-gradient-to-r from-purple-500 to-indigo-500 rounded-2xl p-6 text-white">
                <h3 className="text-lg font-bold mb-2">No Tables Available?</h3>
                <p className="text-white/80 text-sm mb-4">Join our virtual queue and we&apos;ll notify you when a table becomes available.</p>
                <button onClick={handleJoinQueue} className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-white text-purple-600 font-semibold rounded-xl hover:bg-purple-50">
                  <UserPlus className="w-5 h-5" />
                  Join Waiting List
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Photo Gallery Modal */}
      <AnimatePresence>
        {showAllPhotos && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/95 z-50 flex items-center justify-center" onClick={() => setShowAllPhotos(false)}>
            <button onClick={() => setShowAllPhotos(false)} className="absolute top-4 right-4 p-2 text-white/80 hover:text-white"><X className="w-8 h-8" /></button>
            <button onClick={(e) => { e.stopPropagation(); setCurrentImageIndex(prev => (prev - 1 + galleryImages.length) % galleryImages.length); }} className="absolute left-4 p-3 bg-white/10 rounded-full text-white"><ChevronLeft className="w-8 h-8" /></button>
            <img src={galleryImages[currentImageIndex]} alt={`Photo ${currentImageIndex + 1}`} className="max-h-[85vh] max-w-[85vw] object-contain" onClick={(e) => e.stopPropagation()} />
            <button onClick={(e) => { e.stopPropagation(); setCurrentImageIndex(prev => (prev + 1) % galleryImages.length); }} className="absolute right-4 p-3 bg-white/10 rounded-full text-white"><ChevronRight className="w-8 h-8" /></button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Floating Cart Button (Mobile) */}
      {cart.length > 0 && (
        <div className="fixed bottom-4 left-4 right-4 lg:hidden z-40">
          <button onClick={handlePreOrder} className="w-full flex items-center justify-between px-6 py-4 bg-amber-500 text-white rounded-2xl shadow-xl">
            <div className="flex items-center gap-3">
              <div className="relative">
                <ShoppingBag className="w-6 h-6" />
                <span className="absolute -top-2 -right-2 w-5 h-5 bg-white text-amber-600 text-xs font-bold rounded-full flex items-center justify-center">{getCartItemCount()}</span>
              </div>
              <span className="font-semibold">View Cart</span>
            </div>
            <span className="font-bold">₹{getCartTotal()}</span>
          </button>
        </div>
      )}
    </div>
  );
};

export default RestaurantDetail;
