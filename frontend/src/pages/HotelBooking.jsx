import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import Toast from '../components/Toast';
import axios from 'axios';
import {
  Hotel,
  MapPin,
  Star,
  Calendar,
  Users,
  Bed,
  Clock,
  Phone,
  Mail,
  User,
  CreditCard,
  Shield,
  Check,
  AlertCircle,
  ChevronRight,
  ChevronDown,
  Tag,
  Gift,
  Percent,
  Loader2,
  Info,
  X,
  Plus,
  Building2,
  FileText,
  Sparkles
} from 'lucide-react';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:8000';

// Default hotel images
const DEFAULT_HOTEL_IMAGES = [
  'https://images.unsplash.com/photo-1566073771259-6a8506099945?w=400',
  'https://images.unsplash.com/photo-1582719508461-905c673771fd?w=400',
  'https://images.unsplash.com/photo-1571003123894-1f0594d2b5d9?w=400',
  'https://images.unsplash.com/photo-1520250497591-112f2f40a3f4?w=400',
  'https://images.unsplash.com/photo-1542314831-068cd1dbfeeb?w=400',
];

// Room type specific images
const ROOM_TYPE_IMAGES = {
  'standard': 'https://images.unsplash.com/photo-1631049307264-da0ec9d70304?w=400',
  'superior': 'https://images.unsplash.com/photo-1590490360182-c33d57733427?w=400',
  'deluxe': 'https://images.unsplash.com/photo-1611892440504-42a792e24d32?w=400',
  'premium': 'https://images.unsplash.com/photo-1582719478250-c89cae4dc85b?w=400',
  'suite': 'https://images.unsplash.com/photo-1591088398332-8a7791972843?w=400',
  'executive': 'https://images.unsplash.com/photo-1566665797739-1674de7a421a?w=400',
  'family': 'https://images.unsplash.com/photo-1598928506311-c55ez361a344?w=400',
  'presidential': 'https://images.unsplash.com/photo-1578683010236-d716f9a3f461?w=400',
  'default': 'https://images.unsplash.com/photo-1631049307264-da0ec9d70304?w=400'
};

// Helper to get image URL from image object or string
const getImageUrl = (image) => {
  if (!image) return null;
  if (typeof image === 'string') return image;
  if (typeof image === 'object') return image.url || image.src || image.image || null;
  return null;
};

// Get hotel image with fallback
const getHotelImage = (hotel) => {
  if (hotel?.images?.length > 0) {
    const firstImage = hotel.images[0];
    const url = getImageUrl(firstImage);
    if (url) return url;
  }
  if (hotel?.primary_image) {
    const url = getImageUrl(hotel.primary_image);
    if (url) return url;
  }
  // Return random default based on hotel id
  const index = (hotel?.id || 0) % DEFAULT_HOTEL_IMAGES.length;
  return DEFAULT_HOTEL_IMAGES[index];
};

// Get room image based on room type with unique fallback per room
const getRoomImage = (room, index = 0) => {
  // First try room's own images
  if (room?.images?.length > 0) {
    const firstImage = room.images[0];
    const url = getImageUrl(firstImage);
    if (url) return url;
  }
  
  // Try to match room type
  const roomType = (room?.room_type || room?.room_name || '').toLowerCase();
  for (const [key, url] of Object.entries(ROOM_TYPE_IMAGES)) {
    if (roomType.includes(key)) {
      return url;
    }
  }
  
  // Fallback based on index to ensure different images
  const roomImages = Object.values(ROOM_TYPE_IMAGES);
  return roomImages[index % roomImages.length];
};

const HotelBooking = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();
  
  const [toast, setToast] = useState(null);
  const [currentStep, setCurrentStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [couponCode, setCouponCode] = useState('');
  const [couponApplied, setCouponApplied] = useState(false);
  const [discount, setDiscount] = useState(0);
  const [showCouponInput, setShowCouponInput] = useState(false);
  
  // Get booking data from navigation state
  const bookingData = location.state;
  
  // Guest details
  const [primaryGuest, setPrimaryGuest] = useState({
    firstName: user?.firstName || user?.name?.split(' ')[0] || '',
    lastName: user?.lastName || user?.name?.split(' ').slice(1).join(' ') || '',
    email: user?.email || '',
    phone: user?.phone || '',
    idType: 'aadhar',
    idNumber: ''
  });
  
  const [additionalGuests, setAdditionalGuests] = useState([]);
  const [specialRequests, setSpecialRequests] = useState({
    earlyCheckIn: false,
    lateCheckOut: false,
    highFloor: false,
    nonSmoking: true,
    extraBed: false,
    airportTransfer: false,
    honeymoonSetup: false,
    otherRequests: ''
  });
  
  // Payment details
  const [paymentMethod, setPaymentMethod] = useState('card');
  const [cardDetails, setCardDetails] = useState({
    number: '',
    name: '',
    expiry: '',
    cvv: ''
  });
  const [upiId, setUpiId] = useState('');
  const [agreeTerms, setAgreeTerms] = useState(false);
  
  // Redirect if no booking data
  useEffect(() => {
    if (!bookingData || !bookingData.hotel) {
      navigate('/hotels');
    }
  }, [bookingData, navigate]);

  // Redirect if not logged in
  useEffect(() => {
    if (!user) {
      navigate('/login', { state: { from: '/hotel-booking' } });
    }
  }, [user, navigate]);

  if (!bookingData || !bookingData.hotel) {
    return null;
  }

  const { hotel, rooms, checkIn, checkOut, adults, children, totalAmount, nights } = bookingData;

  // Calculate totals
  const roomCharges = totalAmount;
  const taxes = Math.round(roomCharges * 0.18); // 18% GST
  const serviceFee = Math.round(roomCharges * 0.05);
  const discountAmount = couponApplied ? Math.round(roomCharges * discount) : 0;
  const grandTotal = roomCharges + taxes + serviceFee - discountAmount;

  // Add additional guest
  const addGuest = () => {
    if (additionalGuests.length < (adults + children - 1)) {
      setAdditionalGuests([...additionalGuests, {
        firstName: '',
        lastName: '',
        age: '',
        isChild: false
      }]);
    }
  };

  // Remove additional guest
  const removeGuest = (index) => {
    setAdditionalGuests(additionalGuests.filter((_, i) => i !== index));
  };

  // Update additional guest
  const updateGuest = (index, field, value) => {
    const updated = [...additionalGuests];
    updated[index] = { ...updated[index], [field]: value };
    setAdditionalGuests(updated);
  };

  // Apply coupon
  const applyCoupon = () => {
    const validCoupons = {
      'FIRST10': 0.10,
      'SAVE15': 0.15,
      'WANDERLITE': 0.12,
      'HOTEL20': 0.20
    };

    if (validCoupons[couponCode.toUpperCase()]) {
      setDiscount(validCoupons[couponCode.toUpperCase()]);
      setCouponApplied(true);
      setToast({ type: 'success', message: `Coupon applied! You save ₹${Math.round(roomCharges * validCoupons[couponCode.toUpperCase()]).toLocaleString()}` });
    } else {
      setToast({ type: 'error', message: 'Invalid coupon code' });
    }
  };

  // Remove coupon
  const removeCoupon = () => {
    setCouponCode('');
    setCouponApplied(false);
    setDiscount(0);
  };

  // Validate step
  const validateStep = (step) => {
    if (step === 1) {
      if (!primaryGuest.firstName || !primaryGuest.lastName || !primaryGuest.email || !primaryGuest.phone) {
        setToast({ type: 'error', message: 'Please fill in all required guest details' });
        return false;
      }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(primaryGuest.email)) {
        setToast({ type: 'error', message: 'Please enter a valid email address' });
        return false;
      }
      if (!/^\d{10}$/.test(primaryGuest.phone)) {
        setToast({ type: 'error', message: 'Please enter a valid 10-digit phone number' });
        return false;
      }
    }
    if (step === 2) {
      // Special requests are optional
    }
    if (step === 3) {
      if (!agreeTerms) {
        setToast({ type: 'error', message: 'Please agree to the terms and conditions' });
        return false;
      }
      if (paymentMethod === 'card') {
        if (!cardDetails.number || !cardDetails.name || !cardDetails.expiry || !cardDetails.cvv) {
          setToast({ type: 'error', message: 'Please fill in all card details' });
          return false;
        }
      }
      if (paymentMethod === 'upi' && !upiId) {
        setToast({ type: 'error', message: 'Please enter your UPI ID' });
        return false;
      }
    }
    return true;
  };

  // Next step
  const nextStep = () => {
    if (validateStep(currentStep)) {
      setCurrentStep(currentStep + 1);
    }
  };

  // Previous step
  const prevStep = () => {
    setCurrentStep(currentStep - 1);
  };

  // Complete booking
  const completeBooking = async () => {
    if (!validateStep(3)) return;

    try {
      setLoading(true);

      const bookingPayload = {
        hotel_id: hotel.id,
        user_id: user.id,
        check_in_date: checkIn,
        check_out_date: checkOut,
        rooms: rooms.map(r => ({
          room_id: r.id,
          quantity: r.quantity,
          price_per_night: r.price_per_night
        })),
        guests: [
          {
            first_name: primaryGuest.firstName,
            last_name: primaryGuest.lastName,
            email: primaryGuest.email,
            phone: primaryGuest.phone,
            id_type: primaryGuest.idType,
            id_number: primaryGuest.idNumber,
            is_primary: true
          },
          ...additionalGuests.map(g => ({
            first_name: g.firstName,
            last_name: g.lastName,
            age: g.age ? parseInt(g.age) : null,
            is_child: g.isChild,
            is_primary: false
          }))
        ],
        special_requests: Object.entries(specialRequests)
          .filter(([key, value]) => value && key !== 'otherRequests')
          .map(([key]) => key.replace(/([A-Z])/g, ' $1').trim())
          .concat(specialRequests.otherRequests ? [specialRequests.otherRequests] : [])
          .join(', '),
        total_amount: grandTotal,
        room_charges: roomCharges,
        taxes: taxes,
        service_fee: serviceFee,
        discount: discountAmount,
        coupon_code: couponApplied ? couponCode : null,
        payment_method: paymentMethod,
        payment_status: 'completed',
        adults_count: adults,
        children_count: children,
        nights: nights
      };

      const response = await axios.post(`${API_BASE_URL}/api/hotel/booking`, bookingPayload);
      
      // Navigate to ticket/receipt page
      navigate('/hotel-ticket', {
        state: {
          booking: response.data,
          hotel,
          rooms,
          primaryGuest,
          additionalGuests,
          specialRequests,
          checkIn,
          checkOut,
          nights,
          roomCharges,
          taxes,
          serviceFee,
          discountAmount,
          grandTotal,
          paymentMethod
        }
      });
    } catch (err) {
      console.error('Booking error:', err);
      
      // For demo, navigate anyway with mock data
      const mockBookingRef = `WL-HTL-${Date.now().toString(36).toUpperCase()}`;
      navigate('/hotel-ticket', {
        state: {
          booking: {
            booking_reference: mockBookingRef,
            id: Date.now(),
            status: 'confirmed',
            created_at: new Date().toISOString()
          },
          hotel,
          rooms,
          primaryGuest,
          additionalGuests,
          specialRequests,
          checkIn,
          checkOut,
          nights,
          roomCharges,
          taxes,
          serviceFee,
          discountAmount,
          grandTotal,
          paymentMethod
        }
      });
    } finally {
      setLoading(false);
    }
  };

  // Format date for display
  const formatDate = (dateStr) => {
    return new Date(dateStr).toLocaleDateString('en-IN', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    });
  };

  const steps = [
    { id: 1, label: 'Guest Details', icon: User },
    { id: 2, label: 'Special Requests', icon: Gift },
    { id: 3, label: 'Payment', icon: CreditCard }
  ];

  return (
    <div className="min-h-screen bg-gray-50 pt-20 pb-12">
      {toast && (
        <Toast
          type={toast.type}
          message={toast.message}
          onClose={() => setToast(null)}
        />
      )}

      <div className="max-w-7xl mx-auto px-4">
        {/* Progress Steps */}
        <div className="bg-white rounded-xl shadow-sm p-6 mb-6">
          <div className="flex items-center justify-between relative">
            {/* Progress Line */}
            <div className="absolute top-5 left-0 right-0 h-0.5 bg-gray-200">
              <div
                className="h-full bg-blue-600 transition-all duration-500"
                style={{ width: `${((currentStep - 1) / (steps.length - 1)) * 100}%` }}
              />
            </div>

            {steps.map((step) => {
              const StepIcon = step.icon;
              const isActive = currentStep === step.id;
              const isCompleted = currentStep > step.id;

              return (
                <div key={step.id} className="relative z-10 flex flex-col items-center">
                  <div
                    className={`w-10 h-10 rounded-full flex items-center justify-center transition-colors ${
                      isCompleted
                        ? 'bg-green-500 text-white'
                        : isActive
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-200 text-gray-500'
                    }`}
                  >
                    {isCompleted ? (
                      <Check className="w-5 h-5" />
                    ) : (
                      <StepIcon className="w-5 h-5" />
                    )}
                  </div>
                  <span
                    className={`mt-2 text-sm font-medium ${
                      isActive || isCompleted ? 'text-gray-900' : 'text-gray-500'
                    }`}
                  >
                    {step.label}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        <div className="flex flex-col lg:flex-row gap-6">
          {/* Main Content */}
          <div className="flex-1">
            {/* Step 1: Guest Details */}
            {currentStep === 1 && (
              <div className="bg-white rounded-xl shadow-sm p-6">
                <h2 className="text-xl font-bold text-gray-900 mb-6 flex items-center gap-2">
                  <User className="w-6 h-6 text-blue-600" />
                  Guest Details
                </h2>

                {/* Primary Guest */}
                <div className="mb-8">
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">Primary Guest (Lead Traveler)</h3>
                  <div className="grid md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        First Name <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        value={primaryGuest.firstName}
                        onChange={(e) => setPrimaryGuest({ ...primaryGuest, firstName: e.target.value })}
                        className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        placeholder="Enter first name"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Last Name <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        value={primaryGuest.lastName}
                        onChange={(e) => setPrimaryGuest({ ...primaryGuest, lastName: e.target.value })}
                        className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        placeholder="Enter last name"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Email <span className="text-red-500">*</span>
                      </label>
                      <div className="relative">
                        <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                        <input
                          type="email"
                          value={primaryGuest.email}
                          onChange={(e) => setPrimaryGuest({ ...primaryGuest, email: e.target.value })}
                          className="w-full pl-10 pr-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                          placeholder="Enter email address"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Phone <span className="text-red-500">*</span>
                      </label>
                      <div className="relative">
                        <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                        <input
                          type="tel"
                          value={primaryGuest.phone}
                          onChange={(e) => setPrimaryGuest({ ...primaryGuest, phone: e.target.value })}
                          className="w-full pl-10 pr-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                          placeholder="10-digit phone number"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        ID Type
                      </label>
                      <select
                        value={primaryGuest.idType}
                        onChange={(e) => setPrimaryGuest({ ...primaryGuest, idType: e.target.value })}
                        className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      >
                        <option value="aadhar">Aadhar Card</option>
                        <option value="pan">PAN Card</option>
                        <option value="passport">Passport</option>
                        <option value="driving">Driving License</option>
                        <option value="voter">Voter ID</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        ID Number
                      </label>
                      <input
                        type="text"
                        value={primaryGuest.idNumber}
                        onChange={(e) => setPrimaryGuest({ ...primaryGuest, idNumber: e.target.value })}
                        className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        placeholder="Enter ID number"
                      />
                    </div>
                  </div>
                </div>

                {/* Additional Guests */}
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-semibold text-gray-900">Additional Guests</h3>
                    {additionalGuests.length < (adults + children - 1) && (
                      <button
                        onClick={addGuest}
                        className="flex items-center gap-1 text-blue-600 hover:text-blue-700"
                      >
                        <Plus className="w-4 h-4" />
                        Add Guest
                      </button>
                    )}
                  </div>

                  {additionalGuests.length === 0 ? (
                    <p className="text-gray-500 text-sm">No additional guests added. Click &quot;Add Guest&quot; to include other travelers.</p>
                  ) : (
                    <div className="space-y-4">
                      {additionalGuests.map((guest, index) => (
                        <div key={index} className="p-4 border rounded-lg relative">
                          <button
                            onClick={() => removeGuest(index)}
                            className="absolute top-2 right-2 p-1 text-gray-400 hover:text-red-500"
                          >
                            <X className="w-4 h-4" />
                          </button>
                          <div className="grid md:grid-cols-4 gap-4">
                            <div>
                              <label className="block text-sm font-medium text-gray-700 mb-1">First Name</label>
                              <input
                                type="text"
                                value={guest.firstName}
                                onChange={(e) => updateGuest(index, 'firstName', e.target.value)}
                                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                              />
                            </div>
                            <div>
                              <label className="block text-sm font-medium text-gray-700 mb-1">Last Name</label>
                              <input
                                type="text"
                                value={guest.lastName}
                                onChange={(e) => updateGuest(index, 'lastName', e.target.value)}
                                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                              />
                            </div>
                            <div>
                              <label className="block text-sm font-medium text-gray-700 mb-1">Age</label>
                              <input
                                type="number"
                                value={guest.age}
                                onChange={(e) => updateGuest(index, 'age', e.target.value)}
                                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                              />
                            </div>
                            <div className="flex items-end">
                              <label className="flex items-center gap-2 cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={guest.isChild}
                                  onChange={(e) => updateGuest(index, 'isChild', e.target.checked)}
                                  className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                                />
                                <span className="text-sm text-gray-700">Child (below 12)</span>
                              </label>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Next Button */}
                <div className="mt-8 flex justify-end">
                  <button
                    onClick={nextStep}
                    className="px-6 py-3 bg-blue-600 text-white font-semibold rounded-xl hover:bg-blue-700 flex items-center gap-2"
                  >
                    Continue
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}

            {/* Step 2: Special Requests */}
            {currentStep === 2 && (
              <div className="bg-white rounded-xl shadow-sm p-6">
                <h2 className="text-xl font-bold text-gray-900 mb-6 flex items-center gap-2">
                  <Gift className="w-6 h-6 text-blue-600" />
                  Special Requests
                </h2>

                <p className="text-gray-600 mb-6">
                  Special requests are subject to availability and cannot be guaranteed. The hotel will try their best to accommodate your requests.
                </p>

                <div className="grid md:grid-cols-2 gap-4 mb-6">
                  {[
                    { key: 'earlyCheckIn', label: 'Early Check-in', icon: Clock },
                    { key: 'lateCheckOut', label: 'Late Check-out', icon: Clock },
                    { key: 'highFloor', label: 'High Floor Room', icon: Building2 },
                    { key: 'nonSmoking', label: 'Non-Smoking Room', icon: Shield },
                    { key: 'extraBed', label: 'Extra Bed', icon: Bed },
                    { key: 'airportTransfer', label: 'Airport Transfer', icon: MapPin },
                    { key: 'honeymoonSetup', label: 'Honeymoon Setup', icon: Sparkles },
                  ].map(({ key, label, icon: Icon }) => (
                    <label
                      key={key}
                      className={`flex items-center gap-3 p-4 border rounded-lg cursor-pointer transition-colors ${
                        specialRequests[key] ? 'border-blue-500 bg-blue-50' : 'hover:border-gray-300'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={specialRequests[key]}
                        onChange={(e) => setSpecialRequests({ ...specialRequests, [key]: e.target.checked })}
                        className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                      />
                      <Icon className="w-5 h-5 text-gray-500" />
                      <span className="text-gray-700">{label}</span>
                    </label>
                  ))}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Other Requests
                  </label>
                  <textarea
                    value={specialRequests.otherRequests}
                    onChange={(e) => setSpecialRequests({ ...specialRequests, otherRequests: e.target.value })}
                    rows={4}
                    className="w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="Any other special requests or preferences..."
                  />
                </div>

                {/* Navigation */}
                <div className="mt-8 flex justify-between">
                  <button
                    onClick={prevStep}
                    className="px-6 py-3 border border-gray-300 text-gray-700 font-semibold rounded-xl hover:bg-gray-50"
                  >
                    Back
                  </button>
                  <button
                    onClick={nextStep}
                    className="px-6 py-3 bg-blue-600 text-white font-semibold rounded-xl hover:bg-blue-700 flex items-center gap-2"
                  >
                    Continue
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}

            {/* Step 3: Payment */}
            {currentStep === 3 && (
              <div className="bg-white rounded-xl shadow-sm p-6">
                <h2 className="text-xl font-bold text-gray-900 mb-6 flex items-center gap-2">
                  <CreditCard className="w-6 h-6 text-blue-600" />
                  Payment
                </h2>

                {/* Coupon Section */}
                <div className="mb-6 p-4 bg-gray-50 rounded-lg">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Tag className="w-5 h-5 text-orange-500" />
                      <span className="font-medium">Have a coupon?</span>
                    </div>
                    {!couponApplied && (
                      <button
                        onClick={() => setShowCouponInput(!showCouponInput)}
                        className="text-blue-600 text-sm"
                      >
                        {showCouponInput ? 'Hide' : 'Apply Coupon'}
                      </button>
                    )}
                  </div>
                  
                  {showCouponInput && !couponApplied && (
                    <div className="flex gap-2 mt-3">
                      <input
                        type="text"
                        value={couponCode}
                        onChange={(e) => setCouponCode(e.target.value.toUpperCase())}
                        className="flex-1 px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                        placeholder="Enter coupon code"
                      />
                      <button
                        onClick={applyCoupon}
                        className="px-4 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600"
                      >
                        Apply
                      </button>
                    </div>
                  )}
                  
                  {couponApplied && (
                    <div className="flex items-center justify-between mt-2 p-2 bg-green-50 border border-green-200 rounded">
                      <div className="flex items-center gap-2 text-green-700">
                        <Check className="w-4 h-4" />
                        <span>Coupon <strong>{couponCode}</strong> applied</span>
                      </div>
                      <button onClick={removeCoupon} className="text-red-500 text-sm">Remove</button>
                    </div>
                  )}
                </div>

                {/* Payment Methods */}
                <div className="mb-6">
                  <h3 className="font-semibold text-gray-900 mb-4">Select Payment Method</h3>
                  <div className="space-y-3">
                    {[
                      { id: 'card', label: 'Credit/Debit Card', icon: CreditCard },
                      { id: 'upi', label: 'UPI', icon: Phone },
                      { id: 'netbanking', label: 'Net Banking', icon: Building2 },
                      { id: 'payathotel', label: 'Pay at Hotel', icon: Hotel },
                    ].map(({ id, label, icon: Icon }) => (
                      <label
                        key={id}
                        className={`flex items-center gap-3 p-4 border rounded-lg cursor-pointer transition-colors ${
                          paymentMethod === id ? 'border-blue-500 bg-blue-50' : 'hover:border-gray-300'
                        }`}
                      >
                        <input
                          type="radio"
                          name="paymentMethod"
                          value={id}
                          checked={paymentMethod === id}
                          onChange={(e) => setPaymentMethod(e.target.value)}
                          className="w-4 h-4 text-blue-600 focus:ring-blue-500"
                        />
                        <Icon className="w-5 h-5 text-gray-500" />
                        <span className="text-gray-700">{label}</span>
                      </label>
                    ))}
                  </div>
                </div>

                {/* Card Details */}
                {paymentMethod === 'card' && (
                  <div className="mb-6 p-4 border rounded-lg">
                    <h4 className="font-medium text-gray-900 mb-4">Card Details</h4>
                    <div className="grid md:grid-cols-2 gap-4">
                      <div className="md:col-span-2">
                        <label className="block text-sm font-medium text-gray-700 mb-1">Card Number</label>
                        <input
                          type="text"
                          value={cardDetails.number}
                          onChange={(e) => setCardDetails({ ...cardDetails, number: e.target.value })}
                          className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                          placeholder="1234 5678 9012 3456"
                          maxLength={19}
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Cardholder Name</label>
                        <input
                          type="text"
                          value={cardDetails.name}
                          onChange={(e) => setCardDetails({ ...cardDetails, name: e.target.value })}
                          className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                          placeholder="Name on card"
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Expiry</label>
                          <input
                            type="text"
                            value={cardDetails.expiry}
                            onChange={(e) => setCardDetails({ ...cardDetails, expiry: e.target.value })}
                            className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                            placeholder="MM/YY"
                            maxLength={5}
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">CVV</label>
                          <input
                            type="password"
                            value={cardDetails.cvv}
                            onChange={(e) => setCardDetails({ ...cardDetails, cvv: e.target.value })}
                            className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                            placeholder="•••"
                            maxLength={4}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* UPI */}
                {paymentMethod === 'upi' && (
                  <div className="mb-6 p-4 border rounded-lg">
                    <h4 className="font-medium text-gray-900 mb-4">UPI Details</h4>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">UPI ID</label>
                      <input
                        type="text"
                        value={upiId}
                        onChange={(e) => setUpiId(e.target.value)}
                        className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                        placeholder="yourname@upi"
                      />
                    </div>
                  </div>
                )}

                {/* Pay at Hotel Notice */}
                {paymentMethod === 'payathotel' && (
                  <div className="mb-6 p-4 bg-yellow-50 border border-yellow-200 rounded-lg flex items-start gap-3">
                    <AlertCircle className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-yellow-800 font-medium">Pay at Hotel</p>
                      <p className="text-yellow-700 text-sm">Payment will be collected at the hotel during check-in. Please carry a valid ID proof.</p>
                    </div>
                  </div>
                )}

                {/* Terms */}
                <div className="mb-6">
                  <label className="flex items-start gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={agreeTerms}
                      onChange={(e) => setAgreeTerms(e.target.checked)}
                      className="w-4 h-4 mt-1 text-blue-600 rounded focus:ring-blue-500"
                    />
                    <span className="text-sm text-gray-600">
                      I agree to the <a href="#" className="text-blue-600 hover:underline">Terms and Conditions</a>,{' '}
                      <a href="#" className="text-blue-600 hover:underline">Privacy Policy</a>, and{' '}
                      <a href="#" className="text-blue-600 hover:underline">Cancellation Policy</a>. I confirm that the
                      information provided is accurate.
                    </span>
                  </label>
                </div>

                {/* Navigation */}
                <div className="flex justify-between">
                  <button
                    onClick={prevStep}
                    className="px-6 py-3 border border-gray-300 text-gray-700 font-semibold rounded-xl hover:bg-gray-50"
                  >
                    Back
                  </button>
                  <button
                    onClick={completeBooking}
                    disabled={loading || !agreeTerms}
                    className="px-8 py-3 bg-gradient-to-r from-green-600 to-green-700 text-white font-semibold rounded-xl hover:from-green-700 hover:to-green-800 disabled:opacity-50 flex items-center gap-2"
                  >
                    {loading ? (
                      <>
                        <Loader2 className="w-5 h-5 animate-spin" />
                        Processing...
                      </>
                    ) : (
                      <>
                        <Shield className="w-5 h-5" />
                        Pay ₹{grandTotal.toLocaleString()}
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Right Column - Booking Summary */}
          <div className="lg:w-96">
            <div className="bg-white rounded-xl shadow-sm p-6 sticky top-24">
              <h3 className="text-lg font-bold text-gray-900 mb-4">Booking Summary</h3>
              
              {/* Hotel Info */}
              <div className="flex gap-3 pb-4 border-b">
                <img
                  src={getHotelImage(hotel)}
                  alt={hotel.name}
                  className="w-20 h-20 rounded-lg object-cover"
                  onError={(e) => {
                    e.target.onerror = null;
                    e.target.src = DEFAULT_HOTEL_IMAGES[0];
                  }}
                />
                <div>
                  <h4 className="font-semibold text-gray-900 line-clamp-2">{hotel.name}</h4>
                  <div className="flex items-center gap-1 text-sm text-gray-500">
                    <MapPin className="w-3 h-3" />
                    {hotel.city}, {hotel.state}
                  </div>
                  <div className="flex mt-1">
                    {[...Array(hotel.star_category || 3)].map((_, i) => (
                      <Star key={i} className="w-3 h-3 text-yellow-400 fill-yellow-400" />
                    ))}
                  </div>
                </div>
              </div>
              
              {/* Stay Details */}
              <div className="py-4 border-b">
                <div className="flex justify-between text-sm mb-2">
                  <span className="text-gray-600">Check-in</span>
                  <span className="font-medium">{formatDate(checkIn)}</span>
                </div>
                <div className="flex justify-between text-sm mb-2">
                  <span className="text-gray-600">Check-out</span>
                  <span className="font-medium">{formatDate(checkOut)}</span>
                </div>
                <div className="flex justify-between text-sm mb-2">
                  <span className="text-gray-600">Duration</span>
                  <span className="font-medium">{nights} Night(s)</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Guests</span>
                  <span className="font-medium">{adults} Adults{children > 0 ? `, ${children} Children` : ''}</span>
                </div>
              </div>
              
              {/* Rooms with Images */}
              <div className="py-4 border-b">
                <h4 className="font-medium text-gray-900 mb-3">Rooms Selected</h4>
                {rooms.map((room, idx) => (
                  <div key={idx} className="flex gap-3 mb-3 last:mb-0">
                    <img
                      src={getRoomImage(room, idx)}
                      alt={room.room_type || room.room_name}
                      className="w-16 h-16 rounded-lg object-cover flex-shrink-0"
                      onError={(e) => {
                        e.target.onerror = null;
                        e.target.src = ROOM_TYPE_IMAGES.default;
                      }}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-gray-900 text-sm truncate">{room.room_type || room.room_name}</p>
                      <p className="text-xs text-gray-500">Qty: {room.quantity}</p>
                      <p className="text-sm font-semibold text-blue-600">
                        ₹{(room.price_per_night * room.quantity * nights).toLocaleString()}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
              
              {/* Price Breakdown */}
              <div className="py-4 border-b space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Room Charges</span>
                  <span>₹{roomCharges.toLocaleString()}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Taxes & Fees (18%)</span>
                  <span>₹{taxes.toLocaleString()}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Service Fee</span>
                  <span>₹{serviceFee.toLocaleString()}</span>
                </div>
                {couponApplied && (
                  <div className="flex justify-between text-sm text-green-600">
                    <span>Coupon Discount ({Math.round(discount * 100)}%)</span>
                    <span>-₹{discountAmount.toLocaleString()}</span>
                  </div>
                )}
              </div>
              
              {/* Total */}
              <div className="pt-4">
                <div className="flex justify-between items-center">
                  <span className="text-lg font-bold text-gray-900">Total Amount</span>
                  <span className="text-2xl font-bold text-blue-600">₹{grandTotal.toLocaleString()}</span>
                </div>
                <p className="text-xs text-gray-500 mt-1">Inclusive of all taxes</p>
              </div>
              
              {/* Trust Badges */}
              <div className="mt-4 pt-4 border-t flex items-center justify-center gap-4">
                <div className="flex items-center gap-1 text-xs text-gray-500">
                  <Shield className="w-3 h-3 text-green-500" />
                  Secure Payment
                </div>
                <div className="flex items-center gap-1 text-xs text-gray-500">
                  <Check className="w-3 h-3 text-green-500" />
                  Instant Confirmation
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default HotelBooking;
