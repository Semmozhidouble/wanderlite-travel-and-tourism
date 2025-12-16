import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ChevronLeft,
  Clock,
  Users,
  Calendar,
  MapPin,
  Star,
  Minus,
  Plus,
  Trash2,
  ShoppingBag,
  CreditCard,
  ChefHat,
  Timer,
  AlertCircle,
  Check,
  IndianRupee,
  Leaf,
  Flame,
  X
} from 'lucide-react';
import axios from 'axios';
import { format } from 'date-fns';
import Navbar from '../components/Navbar';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:8000';

// 4K Restaurant Images
const restaurantImages = [
  'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=3840&q=100',
  'https://images.unsplash.com/photo-1552566626-52f8b828add9?w=3840&q=100',
  'https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=3840&q=100',
  'https://images.unsplash.com/photo-1559339352-11d035aa65de?w=3840&q=100',
  'https://images.unsplash.com/photo-1537047902294-62a40c20a6ae?w=3840&q=100'
];

const getRestaurantImage = (restaurantId, index = 0) => {
  if (!restaurantId) return restaurantImages[0];
  const hash = String(restaurantId).split('').reduce((a, b) => ((a << 5) - a) + b.charCodeAt(0), 0);
  return restaurantImages[Math.abs(hash + index) % restaurantImages.length];
};

const RestaurantPreOrder = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();

  // Get passed state
  const passedState = location.state || {};
  const [restaurant, setRestaurant] = useState(passedState.restaurant || null);
  const [cart, setCart] = useState(passedState.cart || []);
  const [selectedDate, setSelectedDate] = useState(passedState.date || format(new Date(), 'yyyy-MM-dd'));
  const [selectedTime, setSelectedTime] = useState(passedState.time || '19:00');
  const [guests, setGuests] = useState(passedState.guests || 2);

  // Form state
  const [guestName, setGuestName] = useState('');
  const [guestPhone, setGuestPhone] = useState('');
  const [guestEmail, setGuestEmail] = useState('');
  const [specialInstructions, setSpecialInstructions] = useState('');

  // Loading state
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!restaurant) {
      fetchRestaurant();
    }
  }, [id]);

  const fetchRestaurant = async () => {
    try {
      const response = await axios.get(`${API_URL}/api/restaurant/${id}`);
      setRestaurant(response.data.restaurant || response.data);
    } catch (error) {
      console.error('Error fetching restaurant:', error);
    }
  };

  const updateQuantity = (itemId, delta) => {
    setCart(prevCart => {
      const updated = prevCart.map(item => {
        if (item.id === itemId) {
          const newQty = item.quantity + delta;
          return newQty > 0 ? { ...item, quantity: newQty } : null;
        }
        return item;
      }).filter(Boolean);
      return updated;
    });
  };

  const removeItem = (itemId) => {
    setCart(prevCart => prevCart.filter(item => item.id !== itemId));
  };

  const getSubtotal = () => {
    return cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  };

  const getPackagingCharges = () => {
    return Math.ceil(cart.length * 10);
  };

  const getGST = () => {
    return Math.ceil(getSubtotal() * 0.05);
  };

  const getTotal = () => {
    return getSubtotal() + getPackagingCharges() + getGST();
  };

  const handlePlaceOrder = async () => {
    if (!guestName || !guestPhone) {
      alert('Please fill in your name and phone number');
      return;
    }

    if (cart.length === 0) {
      alert('Your cart is empty');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const token = localStorage.getItem('token');
      
      // First create the pre-order
      const response = await axios.post(
        `${API_URL}/api/restaurant/pre-order`,
        {
          restaurant_id: parseInt(id),
          order_date: selectedDate,
          arrival_time: selectedTime,
          guests_count: guests || 2,
          guest_name: guestName.trim(),
          guest_phone: guestPhone.trim(),
          special_instructions: specialInstructions?.trim() || null,
          items: cart.map(item => ({
            item_id: item.id,
            quantity: item.quantity
          })),
          payment_method: 'online'
        },
        {
          headers: { Authorization: `Bearer ${token}` }
        }
      );

      // Navigate to payment with correct state format expected by Payment component
      const preOrder = response.data;
      const subtotal = getSubtotal();
      const packagingCharges = getPackagingCharges();
      const gst = getGST();
      const total = getTotal();
      
      navigate('/payment', {
        state: {
          bookingId: preOrder.id || preOrder.order_reference,
          bookingRef: preOrder.order_reference,
          amount: total,
          serviceType: 'Restaurant Pre-Order',
          serviceDetails: {
            destination: restaurant.name,
            restaurant: restaurant,
            preOrderRef: preOrder.order_reference,
            items: cart,
            reservationDate: selectedDate,
            arrivalTime: selectedTime,
            guests: guests || 2,
            guestName,
            guestPhone,
            specialInstructions,
            // Payment breakdown
            subtotal: subtotal,
            packagingCharges: packagingCharges,
            gst: gst,
            total_price: total
          }
        }
      });
    } catch (error) {
      console.error('Error placing pre-order:', error);
      const status = error.response?.status;
      const detail = error.response?.data?.detail;
      
      if (status === 401 || status === 403) {
        setError('Please log in to place a pre-order');
        // Optionally redirect to login
        // navigate('/login', { state: { from: location.pathname } });
      } else if (Array.isArray(detail)) {
        setError(detail.map(e => e.msg || e.message || JSON.stringify(e)).join(', '));
      } else if (typeof detail === 'object' && detail !== null) {
        setError(detail.msg || detail.message || JSON.stringify(detail));
      } else {
        setError(detail || 'Failed to place pre-order. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  if (!restaurant) {
    return (
      <div className="min-h-screen bg-gray-50 pt-16">
        <Navbar />
        <div className="max-w-7xl mx-auto px-4 py-12">
          <div className="animate-pulse space-y-8">
            <div className="h-8 bg-gray-200 rounded w-1/3" />
            <div className="h-64 bg-gray-200 rounded-2xl" />
          </div>
        </div>
      </div>
    );
  }

  if (cart.length === 0) {
    return (
      <div className="min-h-screen bg-gray-50 pt-16">
        <Navbar />
        <div className="max-w-3xl mx-auto px-4 py-12 text-center">
          <ShoppingBag className="w-20 h-20 text-gray-300 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Your Cart is Empty</h2>
          <p className="text-gray-500 mb-8">Add items from the menu to pre-order your food.</p>
          <button
            onClick={() => navigate(`/restaurant/${id}`)}
            className="px-6 py-3 bg-amber-500 text-white rounded-xl font-semibold hover:bg-amber-600"
          >
            Browse Menu
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 pt-16">
      <Navbar />

      {/* Header */}
      <div className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <button
            onClick={() => navigate(-1)}
            className="flex items-center gap-2 text-gray-600 hover:text-gray-900"
          >
            <ChevronLeft className="w-5 h-5" />
            Back to Restaurant
          </button>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="flex flex-col lg:flex-row gap-8">
          {/* Left - Cart Items */}
          <div className="flex-1">
            {/* Restaurant Info */}
            <div className="bg-white rounded-2xl p-6 shadow-sm mb-6">
              <div className="flex items-center gap-4">
                <img
                  src={getRestaurantImage(id)}
                  alt={restaurant.name}
                  className="w-20 h-20 rounded-xl object-cover"
                />
                <div>
                  <h1 className="text-xl font-bold text-gray-900">{restaurant.name}</h1>
                  <div className="flex items-center gap-2 text-sm text-gray-500 mt-1">
                    <MapPin className="w-4 h-4" />
                    <span>{restaurant.city}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Pre-Order Info */}
            <div className="bg-gradient-to-r from-amber-50 to-orange-50 rounded-2xl p-6 border border-amber-100 mb-6">
              <div className="flex items-center gap-3 mb-3">
                <div className="p-2 bg-amber-100 rounded-lg">
                  <ChefHat className="w-5 h-5 text-amber-600" />
                </div>
                <h2 className="font-bold text-gray-900">Pre-Order Your Food</h2>
              </div>
              <p className="text-sm text-gray-600">
                Your food will be ready when you arrive! Pre-ordering saves time and ensures your favorite dishes are prepared fresh for you.
              </p>
            </div>

            {/* Arrival Details */}
            <div className="bg-white rounded-2xl p-6 shadow-sm mb-6">
              <h2 className="text-lg font-bold text-gray-900 mb-4">Arrival Details</h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Date</label>
                  <div className="flex items-center gap-3 px-4 py-3 bg-gray-50 rounded-xl">
                    <Calendar className="w-5 h-5 text-amber-500" />
                    <input
                      type="date"
                      value={selectedDate}
                      onChange={(e) => setSelectedDate(e.target.value)}
                      min={format(new Date(), 'yyyy-MM-dd')}
                      className="bg-transparent flex-1 outline-none"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Time</label>
                  <div className="flex items-center gap-3 px-4 py-3 bg-gray-50 rounded-xl">
                    <Clock className="w-5 h-5 text-amber-500" />
                    <input
                      type="time"
                      value={selectedTime}
                      onChange={(e) => setSelectedTime(e.target.value)}
                      className="bg-transparent flex-1 outline-none"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Guests</label>
                  <div className="flex items-center gap-3 px-4 py-3 bg-gray-50 rounded-xl">
                    <Users className="w-5 h-5 text-amber-500" />
                    <span className="flex-1">{guests} Guests</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Cart Items */}
            <div className="bg-white rounded-2xl p-6 shadow-sm mb-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-bold text-gray-900">Your Order ({cart.length} items)</h2>
                <span className="text-sm text-gray-500">
                  <Timer className="w-4 h-4 inline mr-1" />
                  Est. prep time: {Math.max(...cart.map(i => i.prep_time || 15))} mins
                </span>
              </div>

              <div className="space-y-4">
                {cart.map((item) => (
                  <div key={item.id} className="flex items-center gap-4 p-4 bg-gray-50 rounded-xl">
                    <div className="relative">
                      <img
                        src={item.image_url || `https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=200&q=80`}
                        alt={item.name}
                        className="w-20 h-20 rounded-lg object-cover"
                      />
                      {item.is_veg && (
                        <span className="absolute -top-1 -left-1 w-5 h-5 bg-green-500 rounded-full flex items-center justify-center">
                          <Leaf className="w-3 h-3 text-white" />
                        </span>
                      )}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-start justify-between">
                        <div>
                          <h3 className="font-semibold text-gray-900">{item.name}</h3>
                          {item.is_bestseller && (
                            <span className="inline-flex items-center gap-1 text-xs text-amber-600 mt-1">
                              <Flame className="w-3 h-3" /> Bestseller
                            </span>
                          )}
                        </div>
                        <button
                          onClick={() => removeItem(item.id)}
                          className="p-1 text-gray-400 hover:text-red-500"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                      <div className="flex items-center justify-between mt-2">
                        <span className="font-semibold text-amber-600">₹{item.price}</span>
                        <div className="flex items-center gap-3 bg-white rounded-lg border border-gray-200 px-2 py-1">
                          <button
                            onClick={() => updateQuantity(item.id, -1)}
                            className="p-1 hover:bg-gray-100 rounded"
                          >
                            <Minus className="w-4 h-4" />
                          </button>
                          <span className="font-semibold w-6 text-center">{item.quantity}</span>
                          <button
                            onClick={() => updateQuantity(item.id, 1)}
                            className="p-1 hover:bg-gray-100 rounded"
                          >
                            <Plus className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <button
                onClick={() => navigate(`/restaurant/${id}`)}
                className="mt-4 text-amber-600 font-medium hover:text-amber-700"
              >
                + Add more items
              </button>
            </div>

            {/* Guest Details */}
            <div className="bg-white rounded-2xl p-6 shadow-sm">
              <h2 className="text-lg font-bold text-gray-900 mb-4">Guest Details</h2>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Full Name *</label>
                  <input
                    type="text"
                    value={guestName}
                    onChange={(e) => setGuestName(e.target.value)}
                    placeholder="Enter your full name"
                    className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                  />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Phone Number *</label>
                    <input
                      type="tel"
                      value={guestPhone}
                      onChange={(e) => setGuestPhone(e.target.value)}
                      placeholder="+91 XXXXX XXXXX"
                      className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Email (Optional)</label>
                    <input
                      type="email"
                      value={guestEmail}
                      onChange={(e) => setGuestEmail(e.target.value)}
                      placeholder="your@email.com"
                      className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Special Instructions</label>
                  <textarea
                    value={specialInstructions}
                    onChange={(e) => setSpecialInstructions(e.target.value)}
                    placeholder="Any dietary requirements or special requests..."
                    rows={3}
                    className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Right - Order Summary */}
          <div className="lg:w-[380px] flex-shrink-0">
            <div className="sticky top-24">
              <div className="bg-white rounded-2xl shadow-lg p-6">
                <h3 className="text-xl font-bold text-gray-900 mb-6">Order Summary</h3>

                {/* Items Summary */}
                <div className="space-y-3 mb-6 max-h-48 overflow-y-auto">
                  {cart.map((item) => (
                    <div key={item.id} className="flex items-center justify-between text-sm">
                      <span className="text-gray-600">{item.name} x {item.quantity}</span>
                      <span className="font-medium">₹{item.price * item.quantity}</span>
                    </div>
                  ))}
                </div>

                <div className="border-t border-gray-100 pt-4 space-y-3">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-600">Subtotal</span>
                    <span className="font-medium">₹{getSubtotal()}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-600">Packaging Charges</span>
                    <span className="font-medium">₹{getPackagingCharges()}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-600">GST (5%)</span>
                    <span className="font-medium">₹{getGST()}</span>
                  </div>
                  <div className="flex items-center justify-between text-lg font-bold border-t border-gray-100 pt-3">
                    <span>Total</span>
                    <span className="text-amber-600">₹{getTotal()}</span>
                  </div>
                </div>

                {error && (
                  <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-xl flex items-center gap-2 text-red-700 text-sm">
                    <AlertCircle className="w-4 h-4" />
                    {error}
                  </div>
                )}

                <button
                  onClick={handlePlaceOrder}
                  disabled={loading || cart.length === 0}
                  className="w-full mt-6 py-4 bg-gradient-to-r from-amber-500 to-orange-500 text-white font-semibold rounded-xl hover:from-amber-600 hover:to-orange-600 transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading ? (
                    <>
                      <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Processing...
                    </>
                  ) : (
                    <>
                      <CreditCard className="w-5 h-5" />
                      Proceed to Pay ₹{getTotal()}
                    </>
                  )}
                </button>

                <div className="mt-4 flex items-center justify-center gap-2 text-sm text-gray-500">
                  <Check className="w-4 h-4 text-green-500" />
                  <span>Secure payment</span>
                </div>
              </div>

              {/* Info Card */}
              <div className="mt-4 bg-blue-50 rounded-2xl p-4 border border-blue-100">
                <h4 className="font-semibold text-blue-900 mb-2">How Pre-Order Works</h4>
                <ul className="text-sm text-blue-700 space-y-2">
                  <li className="flex items-start gap-2">
                    <span className="w-5 h-5 bg-blue-200 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0">1</span>
                    <span>Place your order now</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="w-5 h-5 bg-blue-200 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0">2</span>
                    <span>Kitchen starts preparing before you arrive</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="w-5 h-5 bg-blue-200 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0">3</span>
                    <span>Food is ready when you reach!</span>
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default RestaurantPreOrder;
