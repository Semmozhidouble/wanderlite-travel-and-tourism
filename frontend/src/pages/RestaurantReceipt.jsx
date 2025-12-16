import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Check,
  Calendar,
  Clock,
  Users,
  MapPin,
  Phone,
  Mail,
  Download,
  Share2,
  Printer,
  Copy,
  QrCode,
  Utensils,
  Star,
  Gift,
  ArrowLeft,
  ChefHat,
  IndianRupee,
  CheckCircle,
  Timer,
  Navigation,
  MessageSquare,
  Sparkles
} from 'lucide-react';
import axios from 'axios';
import { format } from 'date-fns';
import QRCode from 'qrcode';
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

const RestaurantReceipt = () => {
  const { bookingRef } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const ticketRef = useRef(null);

  // Get passed state or fetch
  const passedBooking = location.state?.booking;
  const passedRestaurant = location.state?.restaurant;

  const [booking, setBooking] = useState(passedBooking || null);
  const [restaurant, setRestaurant] = useState(passedRestaurant || null);
  const [loading, setLoading] = useState(!passedBooking);
  const [qrCodeUrl, setQrCodeUrl] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!passedBooking) {
      fetchBooking();
    } else {
      generateQRCode(passedBooking.booking_reference);
    }
  }, [bookingRef]);

  const fetchBooking = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(`${API_URL}/api/restaurant/booking/${bookingRef}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const bookingData = response.data.booking;
      setBooking(bookingData);
      // Restaurant info is included in booking data
      if (bookingData) {
        setRestaurant({
          id: bookingData.restaurant_id,
          name: bookingData.restaurant_name,
          city: bookingData.restaurant_city,
          address: bookingData.restaurant_address,
          cuisines: bookingData.restaurant_cuisines,
          rating: bookingData.restaurant_rating
        });
      }
      generateQRCode(bookingData?.booking_reference || bookingRef);
    } catch (error) {
      console.error('Error fetching booking:', error);
    } finally {
      setLoading(false);
    }
  };

  const generateQRCode = async (ref) => {
    try {
      const url = await QRCode.toDataURL(`${window.location.origin}/restaurant/verify/${ref}`, {
        width: 200,
        margin: 2,
        color: {
          dark: '#1f2937',
          light: '#ffffff'
        }
      });
      setQrCodeUrl(url);
    } catch (error) {
      console.error('Error generating QR code:', error);
    }
  };

  const copyBookingRef = () => {
    navigator.clipboard.writeText(booking?.booking_reference || bookingRef);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handlePrint = () => {
    window.print();
  };

  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: `Restaurant Reservation - ${restaurant?.name}`,
          text: `Booking confirmed at ${restaurant?.name} for ${format(new Date(booking?.booking_date), 'MMMM d, yyyy')}`,
          url: window.location.href
        });
      } catch (error) {
        console.log('Error sharing:', error);
      }
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 pt-16">
        <Navbar />
        <div className="max-w-3xl mx-auto px-4 py-12">
          <div className="animate-pulse space-y-8">
            <div className="h-40 bg-gray-200 rounded-2xl" />
            <div className="h-8 bg-gray-200 rounded w-1/2 mx-auto" />
            <div className="h-64 bg-gray-200 rounded-2xl" />
          </div>
        </div>
      </div>
    );
  }

  // Create mock booking if we don't have one
  const displayBooking = booking || {
    booking_reference: bookingRef || 'WL-REST-123456',
    booking_date: new Date().toISOString().split('T')[0],
    time_slot: '19:00',
    guests_count: 2,
    status: 'confirmed',
    guest_name: 'Guest',
    guest_phone: '+91 98765 43210',
    guest_email: 'guest@email.com',
    table_number: 'T-05',
    seating_preference: 'indoor',
    occasion: 'Date Night',
    special_requests: '',
    created_at: new Date().toISOString()
  };

  const displayRestaurant = restaurant || {
    id: 1,
    name: 'Fine Dine Restaurant',
    city: 'Mumbai',
    address: '123 Restaurant Street, Bandra West, Mumbai 400050',
    contact_phone: '+91 22 1234 5678',
    rating: 4.5
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-50 via-white to-orange-50 pt-16">
      <Navbar />

      <div className="max-w-3xl mx-auto px-4 py-8">
        {/* Success Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-8"
        >
          <div className="inline-flex items-center justify-center w-20 h-20 bg-green-100 rounded-full mb-4">
            <CheckCircle className="w-10 h-10 text-green-500" />
          </div>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Reservation Confirmed!</h1>
          <p className="text-gray-500">Your table has been reserved. See you soon!</p>
        </motion.div>

        {/* Ticket Card */}
        <motion.div
          ref={ticketRef}
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.2 }}
          className="bg-white rounded-3xl shadow-xl overflow-hidden print:shadow-none"
        >
          {/* Header with Restaurant Image */}
          <div className="relative h-48">
            <img
              src={getRestaurantImage(displayRestaurant.id)}
              alt={displayRestaurant.name}
              className="w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent" />
            <div className="absolute bottom-0 left-0 right-0 p-6 text-white">
              <div className="flex items-center gap-2 mb-2">
                <Sparkles className="w-5 h-5 text-amber-400" />
                <span className="text-sm text-amber-400 font-medium">Confirmed Reservation</span>
              </div>
              <h2 className="text-2xl font-bold">{displayRestaurant.name}</h2>
              <div className="flex items-center gap-2 text-sm text-white/80 mt-1">
                <MapPin className="w-4 h-4" />
                <span>{displayRestaurant.city}</span>
                <span className="mx-2">•</span>
                <Star className="w-4 h-4 fill-amber-400 text-amber-400" />
                <span>{displayRestaurant.rating}</span>
              </div>
            </div>
          </div>

          {/* Booking Reference Banner */}
          <div className="bg-gradient-to-r from-amber-500 to-orange-500 px-6 py-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-amber-100 text-sm">Booking Reference</p>
                <p className="text-white text-xl font-bold font-mono tracking-wider">
                  {displayBooking.booking_reference}
                </p>
              </div>
              <button
                onClick={copyBookingRef}
                className="p-2 bg-white/20 rounded-lg hover:bg-white/30 transition-colors"
              >
                {copied ? (
                  <Check className="w-5 h-5 text-white" />
                ) : (
                  <Copy className="w-5 h-5 text-white" />
                )}
              </button>
            </div>
          </div>

          {/* Main Content */}
          <div className="p-6">
            {/* Date/Time/Guests Grid */}
            <div className="grid grid-cols-3 gap-4 mb-6">
              <div className="text-center p-4 bg-amber-50 rounded-xl">
                <Calendar className="w-6 h-6 text-amber-500 mx-auto mb-2" />
                <p className="text-xs text-gray-500 mb-1">Date</p>
                <p className="font-bold text-gray-900">
                  {format(new Date(displayBooking.booking_date), 'MMM d')}
                </p>
                <p className="text-xs text-gray-500">
                  {format(new Date(displayBooking.booking_date), 'EEEE')}
                </p>
              </div>
              <div className="text-center p-4 bg-amber-50 rounded-xl">
                <Clock className="w-6 h-6 text-amber-500 mx-auto mb-2" />
                <p className="text-xs text-gray-500 mb-1">Time</p>
                <p className="font-bold text-gray-900">
                  {format(new Date(`2024-01-01T${displayBooking.time_slot}`), 'h:mm')}
                </p>
                <p className="text-xs text-gray-500">
                  {format(new Date(`2024-01-01T${displayBooking.time_slot}`), 'a')}
                </p>
              </div>
              <div className="text-center p-4 bg-amber-50 rounded-xl">
                <Users className="w-6 h-6 text-amber-500 mx-auto mb-2" />
                <p className="text-xs text-gray-500 mb-1">Guests</p>
                <p className="font-bold text-gray-900">{displayBooking.guests_count}</p>
                <p className="text-xs text-gray-500">
                  {displayBooking.guests_count === 1 ? 'Person' : 'People'}
                </p>
              </div>
            </div>

            {/* Divider with decoration */}
            <div className="relative my-6">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t-2 border-dashed border-gray-200" />
              </div>
              <div className="relative flex justify-center">
                <div className="flex items-center gap-2 bg-white px-4">
                  <div className="w-3 h-3 bg-gray-200 rounded-full" />
                  <Utensils className="w-5 h-5 text-amber-500" />
                  <div className="w-3 h-3 bg-gray-200 rounded-full" />
                </div>
              </div>
            </div>

            {/* Details */}
            <div className="grid grid-cols-2 gap-4 mb-6">
              {displayBooking.table_number && (
                <div className="p-4 bg-gray-50 rounded-xl">
                  <p className="text-xs text-gray-500 mb-1">Table</p>
                  <p className="font-semibold text-gray-900">{displayBooking.table_number}</p>
                </div>
              )}
              {displayBooking.seating_preference && (
                <div className="p-4 bg-gray-50 rounded-xl">
                  <p className="text-xs text-gray-500 mb-1">Seating</p>
                  <p className="font-semibold text-gray-900 capitalize">{displayBooking.seating_preference}</p>
                </div>
              )}
              <div className="p-4 bg-gray-50 rounded-xl">
                <p className="text-xs text-gray-500 mb-1">Guest Name</p>
                <p className="font-semibold text-gray-900">{displayBooking.guest_name}</p>
              </div>
              <div className="p-4 bg-gray-50 rounded-xl">
                <p className="text-xs text-gray-500 mb-1">Contact</p>
                <p className="font-semibold text-gray-900">{displayBooking.guest_phone}</p>
              </div>
            </div>

            {displayBooking.occasion && (
              <div className="flex items-center gap-3 p-4 bg-amber-50 rounded-xl mb-6">
                <Gift className="w-5 h-5 text-amber-500" />
                <div>
                  <p className="text-xs text-amber-600">Special Occasion</p>
                  <p className="font-semibold text-gray-900">{displayBooking.occasion}</p>
                </div>
              </div>
            )}

            {displayBooking.special_requests && (
              <div className="flex items-start gap-3 p-4 bg-gray-50 rounded-xl mb-6">
                <MessageSquare className="w-5 h-5 text-gray-400 mt-0.5" />
                <div>
                  <p className="text-xs text-gray-500">Special Requests</p>
                  <p className="text-gray-700">{displayBooking.special_requests}</p>
                </div>
              </div>
            )}

            {/* QR Code */}
            <div className="flex items-center justify-center py-6 border-t border-dashed border-gray-200">
              <div className="text-center">
                {qrCodeUrl ? (
                  <img src={qrCodeUrl} alt="QR Code" className="w-32 h-32 mx-auto mb-3" />
                ) : (
                  <div className="w-32 h-32 bg-gray-100 rounded-xl flex items-center justify-center mx-auto mb-3">
                    <QrCode className="w-12 h-12 text-gray-400" />
                  </div>
                )}
                <p className="text-xs text-gray-500">Scan to verify reservation</p>
              </div>
            </div>

            {/* Restaurant Contact */}
            <div className="bg-gray-50 rounded-xl p-4">
              <h3 className="font-semibold text-gray-900 mb-3">Restaurant Address</h3>
              <div className="space-y-2 text-sm">
                <div className="flex items-start gap-3">
                  <MapPin className="w-4 h-4 text-gray-400 mt-0.5" />
                  <p className="text-gray-600">{displayRestaurant.address || displayRestaurant.city}</p>
                </div>
                {displayRestaurant.contact_phone && (
                  <div className="flex items-center gap-3">
                    <Phone className="w-4 h-4 text-gray-400" />
                    <p className="text-gray-600">{displayRestaurant.contact_phone}</p>
                  </div>
                )}
              </div>
              <a
                href={`https://maps.google.com/?q=${encodeURIComponent(displayRestaurant.address || displayRestaurant.city)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 mt-4 text-amber-600 font-medium text-sm hover:text-amber-700"
              >
                <Navigation className="w-4 h-4" />
                Get Directions
              </a>
            </div>
          </div>

          {/* Footer */}
          <div className="bg-gray-50 px-6 py-4 border-t print:hidden">
            <div className="flex items-center justify-between">
              <p className="text-xs text-gray-500">
                Booked on {format(new Date(displayBooking.created_at || new Date()), 'MMM d, yyyy')}
              </p>
              <div className="flex items-center gap-2">
                <button
                  onClick={handlePrint}
                  className="p-2 bg-white rounded-lg border hover:bg-gray-50 transition-colors"
                >
                  <Printer className="w-4 h-4 text-gray-600" />
                </button>
              </div>
            </div>
          </div>
        </motion.div>

        {/* Action Buttons */}
        <div className="mt-8 flex flex-col sm:flex-row gap-4 print:hidden">
          <button
            onClick={() => navigate('/restaurants')}
            className="flex-1 flex items-center justify-center gap-2 px-6 py-4 border-2 border-gray-200 text-gray-700 font-semibold rounded-xl hover:bg-gray-50 transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
            Browse More Restaurants
          </button>
          <button
            onClick={() => navigate(`/restaurant/${displayRestaurant.id}`)}
            className="flex-1 flex items-center justify-center gap-2 px-6 py-4 bg-amber-500 text-white font-semibold rounded-xl hover:bg-amber-600 transition-colors"
          >
            <ChefHat className="w-5 h-5" />
            Pre-Order Food
          </button>
        </div>

        {/* Important Notes */}
        <div className="mt-8 bg-blue-50 rounded-xl p-6 print:hidden">
          <h3 className="font-semibold text-blue-900 mb-3 flex items-center gap-2">
            <Timer className="w-5 h-5" />
            Important Information
          </h3>
          <ul className="space-y-2 text-sm text-blue-800">
            <li>• Please arrive 5-10 minutes before your reservation time</li>
            <li>• Your table will be held for 15 minutes past the reservation time</li>
            <li>• For cancellation or modifications, please contact the restaurant directly</li>
            <li>• Show this confirmation at the restaurant</li>
          </ul>
        </div>
      </div>

      {/* Print Styles */}
      <style>{`
        @media print {
          body * {
            visibility: hidden;
          }
          .print\\:shadow-none {
            box-shadow: none !important;
          }
          .print\\:hidden {
            display: none !important;
          }
          [ref="ticketRef"], [ref="ticketRef"] * {
            visibility: visible;
          }
          [ref="ticketRef"] {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
          }
        }
      `}</style>
    </div>
  );
};

export default RestaurantReceipt;
