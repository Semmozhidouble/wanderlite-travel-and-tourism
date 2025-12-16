import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Calendar,
  Clock,
  Users,
  MapPin,
  Star,
  ChevronLeft,
  ChevronRight,
  Check,
  IndianRupee,
  User,
  Phone,
  Mail,
  MessageSquare,
  Gift,
  CreditCard,
  Shield,
  Zap,
  AlertCircle,
  Armchair,
  Sun,
  Wind,
  Sparkles,
  Heart
} from 'lucide-react';
import axios from 'axios';
import { format, addDays, parseISO } from 'date-fns';
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

// Seating preferences
const seatingPreferences = [
  { id: 'any', label: 'No Preference', icon: Armchair, description: 'Any available table' },
  { id: 'indoor', label: 'Indoor', icon: Wind, description: 'Air-conditioned seating' },
  { id: 'outdoor', label: 'Outdoor', icon: Sun, description: 'Open-air seating' },
  { id: 'private', label: 'Private', icon: Sparkles, description: 'Private dining area' }
];

// Occasions
const occasions = [
  'Birthday',
  'Anniversary',
  'Date Night',
  'Business Meal',
  'Family Gathering',
  'Friends Meetup',
  'Celebration',
  'Other'
];

const RestaurantBooking = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();

  // Get passed state
  const passedState = location.state || {};
  const [restaurant, setRestaurant] = useState(passedState.restaurant || null);
  const [tables, setTables] = useState([]);

  // Booking state
  const [step, setStep] = useState(1);
  const [selectedDate, setSelectedDate] = useState(passedState.date || format(new Date(), 'yyyy-MM-dd'));
  const [selectedTime, setSelectedTime] = useState(passedState.time || '19:00');
  const [guests, setGuests] = useState(passedState.guests || 2);
  const [selectedTable, setSelectedTable] = useState(null);
  const [seatingPreference, setSeatingPreference] = useState('any');

  // Guest details
  const [guestName, setGuestName] = useState('');
  const [guestEmail, setGuestEmail] = useState('');
  const [guestPhone, setGuestPhone] = useState('');
  const [specialRequests, setSpecialRequests] = useState('');
  const [occasion, setOccasion] = useState('');

  // Loading/error state
  const [loading, setLoading] = useState(false);
  const [fetchingTables, setFetchingTables] = useState(false);
  const [error, setError] = useState(null);

  // Pricing
  const [isPeakHour, setIsPeakHour] = useState(false);
  const coverCharge = 0;
  const peakHourFee = isPeakHour ? guests * 75 : 0;
  const gst = Math.round((coverCharge + peakHourFee) * 0.18);
  const totalAmount = coverCharge + peakHourFee + gst;

  // Fetch restaurant data if not passed
  useEffect(() => {
    if (!restaurant) {
      fetchRestaurant();
    }
    fetchTables();
  }, [id]);

  // Check peak hours when time changes
  useEffect(() => {
    const hour = parseInt(selectedTime.split(':')[0]);
    setIsPeakHour((hour >= 12 && hour <= 14) || (hour >= 19 && hour <= 21));
  }, [selectedTime]);

  // Prefill user details
  useEffect(() => {
    const user = JSON.parse(localStorage.getItem('user') || '{}');
    if (user.name) setGuestName(user.name);
    if (user.email) setGuestEmail(user.email);
    if (user.phone) setGuestPhone(user.phone);
  }, []);

  const fetchRestaurant = async () => {
    try {
      const response = await axios.get(`${API_URL}/api/restaurant/${id}`);
      // Backend returns restaurant directly, not nested
      setRestaurant(response.data.restaurant || response.data);
    } catch (error) {
      console.error('Error fetching restaurant:', error);
      setError('Failed to load restaurant details');
    }
  };

  const fetchTables = async () => {
    setFetchingTables(true);
    try {
      const response = await axios.get(`${API_URL}/api/restaurant/${id}/tables`, {
        params: { date: selectedDate, time: selectedTime, guests }
      });
      setTables(response.data.tables || []);
    } catch (error) {
      console.error('Error fetching tables:', error);
    } finally {
      setFetchingTables(false);
    }
  };

  const generateTimeSlots = () => {
    const slots = [];
    for (let hour = 11; hour <= 22; hour++) {
      for (let min = 0; min < 60; min += 30) {
        const timeStr = `${hour.toString().padStart(2, '0')}:${min.toString().padStart(2, '0')}`;
        const isPeak = (hour >= 12 && hour <= 14) || (hour >= 19 && hour <= 21);
        slots.push({
          value: timeStr,
          label: format(new Date(`2024-01-01T${timeStr}`), 'h:mm a'),
          isPeakHour: isPeak
        });
      }
    }
    return slots;
  };

  const generateDateOptions = () => {
    const dates = [];
    for (let i = 0; i < 14; i++) {
      const date = addDays(new Date(), i);
      dates.push({
        value: format(date, 'yyyy-MM-dd'),
        label: format(date, 'EEE'),
        day: format(date, 'd'),
        month: format(date, 'MMM'),
        isToday: i === 0
      });
    }
    return dates;
  };

  const handleBooking = async () => {
    // Validate required fields
    const missingFields = [];
    if (!guestName || guestName.trim() === '') missingFields.push('Name');
    if (!guestPhone || guestPhone.trim() === '') missingFields.push('Phone');
    
    if (missingFields.length > 0) {
      setError(`Please fill in required fields: ${missingFields.join(', ')}`);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const token = localStorage.getItem('token');
      const requestPayload = {
        restaurant_id: parseInt(id),
        booking_date: selectedDate,
        time_slot: selectedTime,
        guests_count: guests,
        guest_name: guestName.trim(),
        guest_phone: guestPhone.trim(),
        guest_email: guestEmail?.trim() || null,
        seating_preference: seatingPreference !== 'any' ? seatingPreference : null,
        table_id: selectedTable?.id || null,
        special_requests: specialRequests?.trim() || null,
        occasion: occasion || null
      };
      
      const response = await axios.post(
        `${API_URL}/api/restaurant/book`,
        requestPayload,
        {
          headers: { Authorization: `Bearer ${token}` }
        }
      );

      // Navigate to confirmation/ticket page
      const bookingResponse = response.data.booking;
      navigate(`/restaurant/booking/${bookingResponse.booking_reference}`, {
        state: {
          booking: bookingResponse,
          restaurant
        }
      });
    } catch (error) {
      console.error('Error booking table:', error);
      const status = error.response?.status;
      const detail = error.response?.data?.detail;
      
      // Network error - no response received
      if (!error.response) {
        setError('Network error. Please check your connection and try again.');
      } else if (status === 401 || status === 403) {
        setError('Please log in to book a table');
      } else if (Array.isArray(detail)) {
        // Handle Pydantic validation errors (array of objects)
        setError(detail.map(e => e.msg || e.message || JSON.stringify(e)).join(', '));
      } else if (typeof detail === 'object') {
        setError(detail.msg || detail.message || JSON.stringify(detail));
      } else {
        setError(detail || 'Failed to book table. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  const timeSlots = generateTimeSlots();
  const dateOptions = generateDateOptions();

  // Get available tables for selected capacity
  const availableTables = tables.filter(t => t.capacity >= guests && t.is_available);

  if (!restaurant) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Navbar />
        <div className="max-w-4xl mx-auto px-4 py-12 pt-20">
          <div className="animate-pulse space-y-8">
            <div className="h-8 bg-gray-200 rounded w-1/3" />
            <div className="h-64 bg-gray-200 rounded-2xl" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 pt-16">
      <Navbar />

      {/* Header */}
      <div className="bg-white border-b">
        <div className="max-w-5xl mx-auto px-4 py-4">
          <button
            onClick={() => navigate(-1)}
            className="flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-4"
          >
            <ChevronLeft className="w-5 h-5" />
            Back to Restaurant
          </button>

          <div className="flex items-center gap-4">
            <img
              src={getRestaurantImage(id)}
              alt={restaurant.name}
              className="w-20 h-20 rounded-xl object-cover"
            />
            <div>
              <h1 className="text-xl font-bold text-gray-900">{restaurant.name}</h1>
              <div className="flex items-center gap-3 text-sm text-gray-500">
                <span className="flex items-center gap-1">
                  <MapPin className="w-4 h-4" />
                  {restaurant.city}
                </span>
                <span className="flex items-center gap-1">
                  <Star className="w-4 h-4 fill-amber-400 text-amber-400" />
                  {restaurant.rating || '4.0'}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Progress Steps */}
      <div className="bg-white border-b">
        <div className="max-w-5xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            {[
              { num: 1, label: 'Date & Time' },
              { num: 2, label: 'Table Selection' },
              { num: 3, label: 'Guest Details' },
              { num: 4, label: 'Confirmation' }
            ].map((s, i) => (
              <React.Fragment key={s.num}>
                <div className="flex items-center gap-3">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold ${
                    step >= s.num ? 'bg-amber-500 text-white' : 'bg-gray-200 text-gray-500'
                  }`}>
                    {step > s.num ? <Check className="w-4 h-4" /> : s.num}
                  </div>
                  <span className={`hidden sm:block text-sm ${step >= s.num ? 'text-gray-900 font-medium' : 'text-gray-500'}`}>
                    {s.label}
                  </span>
                </div>
                {i < 3 && (
                  <div className={`flex-1 h-1 mx-4 rounded ${step > s.num ? 'bg-amber-500' : 'bg-gray-200'}`} />
                )}
              </React.Fragment>
            ))}
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-5xl mx-auto px-4 py-8">
        <div className="flex flex-col lg:flex-row gap-8">
          {/* Left - Form */}
          <div className="flex-1">
            {/* Step 1: Date & Time */}
            {step === 1 && (
              <motion.div
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                className="space-y-6"
              >
                <div className="bg-white rounded-2xl p-6 shadow-sm">
                  <h2 className="text-lg font-bold text-gray-900 mb-4">Select Date</h2>
                  <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
                    {dateOptions.map((date) => (
                      <button
                        key={date.value}
                        onClick={() => {
                          setSelectedDate(date.value);
                          fetchTables();
                        }}
                        className={`flex flex-col items-center px-4 py-3 rounded-xl min-w-[70px] transition-colors ${
                          selectedDate === date.value
                            ? 'bg-amber-500 text-white'
                            : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                        }`}
                      >
                        <span className="text-xs">{date.label}</span>
                        <span className="text-xl font-bold">{date.day}</span>
                        <span className="text-xs">{date.month}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="bg-white rounded-2xl p-6 shadow-sm">
                  <h2 className="text-lg font-bold text-gray-900 mb-4">Select Time</h2>
                  <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
                    {timeSlots.map((slot) => (
                      <button
                        key={slot.value}
                        onClick={() => setSelectedTime(slot.value)}
                        className={`px-3 py-2 rounded-lg text-sm transition-colors ${
                          selectedTime === slot.value
                            ? 'bg-amber-500 text-white'
                            : slot.isPeakHour
                            ? 'bg-amber-50 text-amber-700 hover:bg-amber-100'
                            : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                        }`}
                      >
                        {slot.label}
                        {slot.isPeakHour && <Zap className="w-3 h-3 inline ml-1" />}
                      </button>
                    ))}
                  </div>
                  <p className="text-xs text-amber-600 mt-4 flex items-center gap-1">
                    <Zap className="w-3 h-3" />
                    Peak hour slots (12-2 PM, 7-9 PM) may have additional charges
                  </p>
                </div>

                <div className="bg-white rounded-2xl p-6 shadow-sm">
                  <h2 className="text-lg font-bold text-gray-900 mb-4">Number of Guests</h2>
                  <div className="flex items-center justify-center gap-6">
                    <button
                      onClick={() => setGuests(Math.max(1, guests - 1))}
                      className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center hover:bg-gray-200 transition-colors"
                    >
                      <ChevronLeft className="w-6 h-6" />
                    </button>
                    <div className="text-center">
                      <span className="text-4xl font-bold text-gray-900">{guests}</span>
                      <p className="text-sm text-gray-500">guest{guests > 1 ? 's' : ''}</p>
                    </div>
                    <button
                      onClick={() => setGuests(Math.min(20, guests + 1))}
                      className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center hover:bg-gray-200 transition-colors"
                    >
                      <ChevronRight className="w-6 h-6" />
                    </button>
                  </div>
                </div>

                <button
                  onClick={() => {
                    fetchTables();
                    setStep(2);
                  }}
                  className="w-full py-4 bg-amber-500 text-white font-semibold rounded-xl hover:bg-amber-600 transition-colors"
                >
                  Continue to Table Selection
                </button>
              </motion.div>
            )}

            {/* Step 2: Table Selection */}
            {step === 2 && (
              <motion.div
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                className="space-y-6"
              >
                <div className="bg-white rounded-2xl p-6 shadow-sm">
                  <h2 className="text-lg font-bold text-gray-900 mb-4">Seating Preference</h2>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {seatingPreferences.map((pref) => {
                      const Icon = pref.icon;
                      return (
                        <button
                          key={pref.id}
                          onClick={() => setSeatingPreference(pref.id)}
                          className={`p-4 rounded-xl border-2 transition-colors ${
                            seatingPreference === pref.id
                              ? 'border-amber-500 bg-amber-50'
                              : 'border-gray-200 hover:border-amber-200'
                          }`}
                        >
                          <Icon className={`w-6 h-6 mb-2 ${seatingPreference === pref.id ? 'text-amber-500' : 'text-gray-400'}`} />
                          <p className="font-semibold text-sm text-gray-900">{pref.label}</p>
                          <p className="text-xs text-gray-500">{pref.description}</p>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="bg-white rounded-2xl p-6 shadow-sm">
                  <h2 className="text-lg font-bold text-gray-900 mb-4">Available Tables</h2>
                  {fetchingTables ? (
                    <div className="flex items-center justify-center py-12">
                      <div className="w-8 h-8 border-3 border-amber-500 border-t-transparent rounded-full animate-spin" />
                    </div>
                  ) : availableTables.length > 0 ? (
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                      {availableTables.map((table) => (
                        <button
                          key={table.id}
                          onClick={() => setSelectedTable(table)}
                          className={`p-4 rounded-xl border-2 transition-colors text-left ${
                            selectedTable?.id === table.id
                              ? 'border-amber-500 bg-amber-50'
                              : 'border-gray-200 hover:border-amber-200'
                          }`}
                        >
                          <div className="flex items-center justify-between mb-2">
                            <span className="font-bold text-gray-900">Table {table.table_number}</span>
                            {selectedTable?.id === table.id && (
                              <Check className="w-5 h-5 text-amber-500" />
                            )}
                          </div>
                          <div className="flex items-center gap-2 text-sm text-gray-500">
                            <Users className="w-4 h-4" />
                            <span>{table.capacity} seats</span>
                          </div>
                          <div className="flex flex-wrap gap-1 mt-2">
                            {table.is_outdoor && (
                              <span className="px-2 py-0.5 bg-green-100 text-green-700 text-xs rounded-full">Outdoor</span>
                            )}
                            {table.is_ac && (
                              <span className="px-2 py-0.5 bg-blue-100 text-blue-700 text-xs rounded-full">AC</span>
                            )}
                          </div>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-12">
                      <AlertCircle className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                      <p className="text-gray-500">No tables available for {guests} guests at this time</p>
                      <button
                        onClick={() => setStep(1)}
                        className="mt-4 text-amber-600 font-medium hover:text-amber-700"
                      >
                        Try different time
                      </button>
                    </div>
                  )}
                </div>

                <div className="flex gap-4">
                  <button
                    onClick={() => setStep(1)}
                    className="flex-1 py-4 border-2 border-gray-200 text-gray-700 font-semibold rounded-xl hover:bg-gray-50 transition-colors"
                  >
                    Back
                  </button>
                  <button
                    onClick={() => setStep(3)}
                    disabled={!selectedTable && seatingPreference === 'any'}
                    className="flex-1 py-4 bg-amber-500 text-white font-semibold rounded-xl hover:bg-amber-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Continue
                  </button>
                </div>
              </motion.div>
            )}

            {/* Step 3: Guest Details */}
            {step === 3 && (
              <motion.div
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                className="space-y-6"
              >
                <div className="bg-white rounded-2xl p-6 shadow-sm">
                  <h2 className="text-lg font-bold text-gray-900 mb-4">Guest Details</h2>
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Full Name *</label>
                      <div className="flex items-center gap-3 px-4 py-3 bg-gray-50 rounded-xl">
                        <User className="w-5 h-5 text-gray-400" />
                        <input
                          type="text"
                          value={guestName}
                          onChange={(e) => setGuestName(e.target.value)}
                          placeholder="Enter your name"
                          className="flex-1 bg-transparent outline-none"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Phone Number *</label>
                      <div className="flex items-center gap-3 px-4 py-3 bg-gray-50 rounded-xl">
                        <Phone className="w-5 h-5 text-gray-400" />
                        <input
                          type="tel"
                          value={guestPhone}
                          onChange={(e) => setGuestPhone(e.target.value)}
                          placeholder="Enter phone number"
                          className="flex-1 bg-transparent outline-none"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Email (Optional)</label>
                      <div className="flex items-center gap-3 px-4 py-3 bg-gray-50 rounded-xl">
                        <Mail className="w-5 h-5 text-gray-400" />
                        <input
                          type="email"
                          value={guestEmail}
                          onChange={(e) => setGuestEmail(e.target.value)}
                          placeholder="Enter email address"
                          className="flex-1 bg-transparent outline-none"
                        />
                      </div>
                    </div>
                  </div>
                </div>

                <div className="bg-white rounded-2xl p-6 shadow-sm">
                  <h2 className="text-lg font-bold text-gray-900 mb-4">Special Occasion?</h2>
                  <div className="flex flex-wrap gap-2">
                    {occasions.map((occ) => (
                      <button
                        key={occ}
                        onClick={() => setOccasion(occasion === occ ? '' : occ)}
                        className={`px-4 py-2 rounded-full text-sm transition-colors ${
                          occasion === occ
                            ? 'bg-amber-500 text-white'
                            : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                        }`}
                      >
                        {occ === 'Birthday' && <Gift className="w-4 h-4 inline mr-1" />}
                        {occ === 'Anniversary' && <Heart className="w-4 h-4 inline mr-1" />}
                        {occ}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="bg-white rounded-2xl p-6 shadow-sm">
                  <h2 className="text-lg font-bold text-gray-900 mb-4">Special Requests</h2>
                  <div className="flex items-start gap-3 px-4 py-3 bg-gray-50 rounded-xl">
                    <MessageSquare className="w-5 h-5 text-gray-400 mt-1" />
                    <textarea
                      value={specialRequests}
                      onChange={(e) => setSpecialRequests(e.target.value)}
                      placeholder="Any dietary requirements, allergies, or special requests..."
                      rows={3}
                      className="flex-1 bg-transparent outline-none resize-none"
                    />
                  </div>
                </div>

                <div className="flex gap-4">
                  <button
                    onClick={() => setStep(2)}
                    className="flex-1 py-4 border-2 border-gray-200 text-gray-700 font-semibold rounded-xl hover:bg-gray-50 transition-colors"
                  >
                    Back
                  </button>
                  <button
                    onClick={() => setStep(4)}
                    disabled={!guestName || !guestPhone}
                    className="flex-1 py-4 bg-amber-500 text-white font-semibold rounded-xl hover:bg-amber-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Review Booking
                  </button>
                </div>
              </motion.div>
            )}

            {/* Step 4: Confirmation */}
            {step === 4 && (
              <motion.div
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                className="space-y-6"
              >
                <div className="bg-white rounded-2xl p-6 shadow-sm">
                  <h2 className="text-lg font-bold text-gray-900 mb-4">Booking Summary</h2>

                  <div className="space-y-4">
                    <div className="flex items-center gap-4 p-4 bg-gray-50 rounded-xl">
                      <Calendar className="w-5 h-5 text-amber-500" />
                      <div>
                        <p className="text-sm text-gray-500">Date</p>
                        <p className="font-semibold text-gray-900">{format(new Date(selectedDate), 'EEEE, MMMM d, yyyy')}</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-4 p-4 bg-gray-50 rounded-xl">
                      <Clock className="w-5 h-5 text-amber-500" />
                      <div>
                        <p className="text-sm text-gray-500">Time</p>
                        <p className="font-semibold text-gray-900">
                          {format(new Date(`2024-01-01T${selectedTime}`), 'h:mm a')}
                          {isPeakHour && (
                            <span className="ml-2 text-xs px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full">
                              <Zap className="w-3 h-3 inline" /> Peak Hour
                            </span>
                          )}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-4 p-4 bg-gray-50 rounded-xl">
                      <Users className="w-5 h-5 text-amber-500" />
                      <div>
                        <p className="text-sm text-gray-500">Guests</p>
                        <p className="font-semibold text-gray-900">{guests} guest{guests > 1 ? 's' : ''}</p>
                      </div>
                    </div>

                    {selectedTable && (
                      <div className="flex items-center gap-4 p-4 bg-gray-50 rounded-xl">
                        <Armchair className="w-5 h-5 text-amber-500" />
                        <div>
                          <p className="text-sm text-gray-500">Table</p>
                          <p className="font-semibold text-gray-900">Table {selectedTable.table_number} ({selectedTable.capacity} seats)</p>
                        </div>
                      </div>
                    )}

                    <div className="flex items-center gap-4 p-4 bg-gray-50 rounded-xl">
                      <User className="w-5 h-5 text-amber-500" />
                      <div>
                        <p className="text-sm text-gray-500">Booked by</p>
                        <p className="font-semibold text-gray-900">{guestName}</p>
                        <p className="text-sm text-gray-500">{guestPhone}</p>
                      </div>
                    </div>

                    {occasion && (
                      <div className="flex items-center gap-4 p-4 bg-amber-50 rounded-xl">
                        <Gift className="w-5 h-5 text-amber-500" />
                        <div>
                          <p className="text-sm text-gray-500">Occasion</p>
                          <p className="font-semibold text-gray-900">{occasion}</p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {error && (
                  <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-center gap-3">
                    <AlertCircle className="w-5 h-5 text-red-500" />
                    <p className="text-red-700">{error}</p>
                  </div>
                )}

                <div className="flex gap-4">
                  <button
                    onClick={() => setStep(3)}
                    className="flex-1 py-4 border-2 border-gray-200 text-gray-700 font-semibold rounded-xl hover:bg-gray-50 transition-colors"
                  >
                    Back
                  </button>
                  <button
                    onClick={handleBooking}
                    disabled={loading}
                    className="flex-1 py-4 bg-gradient-to-r from-amber-500 to-orange-500 text-white font-semibold rounded-xl hover:from-amber-600 hover:to-orange-600 transition-colors disabled:opacity-70 flex items-center justify-center gap-2"
                  >
                    {loading ? (
                      <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <>
                        <Check className="w-5 h-5" />
                        Confirm Booking
                      </>
                    )}
                  </button>
                </div>
              </motion.div>
            )}
          </div>

          {/* Right - Summary Card */}
          <div className="lg:w-[350px] flex-shrink-0">
            <div className="sticky top-24">
              <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
                <img
                  src={getRestaurantImage(id)}
                  alt={restaurant.name}
                  className="w-full h-40 object-cover"
                />
                <div className="p-6">
                  <h3 className="font-bold text-gray-900 mb-1">{restaurant.name}</h3>
                  <p className="text-sm text-gray-500 mb-4">{restaurant.city}</p>

                  <div className="space-y-3 pb-4 border-b">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-gray-500">Date</span>
                      <span className="font-medium text-gray-900">{format(new Date(selectedDate), 'MMM d, yyyy')}</span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-gray-500">Time</span>
                      <span className="font-medium text-gray-900">{format(new Date(`2024-01-01T${selectedTime}`), 'h:mm a')}</span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-gray-500">Guests</span>
                      <span className="font-medium text-gray-900">{guests}</span>
                    </div>
                  </div>

                  {/* Pricing */}
                  <div className="pt-4 space-y-2">
                    {peakHourFee > 0 && (
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-amber-600 flex items-center gap-1">
                          <Zap className="w-4 h-4" />
                          Peak Hour Fee
                        </span>
                        <span className="text-amber-600">₹{peakHourFee}</span>
                      </div>
                    )}
                    {totalAmount > 0 && (
                      <>
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-gray-500">GST (18%)</span>
                          <span className="text-gray-600">₹{gst}</span>
                        </div>
                        <div className="flex items-center justify-between pt-2 border-t">
                          <span className="font-semibold text-gray-900">Total</span>
                          <span className="font-bold text-gray-900">₹{totalAmount}</span>
                        </div>
                      </>
                    )}
                    {totalAmount === 0 && (
                      <div className="text-center py-2">
                        <p className="text-sm text-green-600 font-medium">Free Table Reservation</p>
                        <p className="text-xs text-gray-500">Pay only for what you order</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Trust badges */}
              <div className="mt-4 bg-white rounded-2xl p-4 shadow-sm">
                <div className="flex items-center gap-3 mb-3">
                  <Shield className="w-5 h-5 text-green-500" />
                  <span className="text-sm text-gray-700">Instant confirmation</span>
                </div>
                <div className="flex items-center gap-3">
                  <CreditCard className="w-5 h-5 text-green-500" />
                  <span className="text-sm text-gray-700">No payment required now</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default RestaurantBooking;
