import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import Toast from '../components/Toast';
import axios from 'axios';
import {
  Star,
  MapPin,
  Phone,
  Mail,
  Globe,
  Clock,
  Wifi,
  Car,
  UtensilsCrossed,
  Dumbbell,
  Waves,
  Wind,
  Tv,
  Coffee,
  Shield,
  Users,
  Bed,
  Bath,
  ChevronLeft,
  ChevronRight,
  Heart,
  Share2,
  Calendar,
  User,
  Minus,
  Plus,
  X,
  Check,
  AlertCircle,
  Info,
  Camera,
  Building2,
  Sparkles,
  CreditCard,
  Tag,
  ThumbsUp,
  MessageSquare,
  Navigation,
  ZoomIn,
  ArrowRight,
  Loader2
} from 'lucide-react';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:8000';

const AMENITY_ICONS = {
  'wifi': Wifi,
  'free wifi': Wifi,
  'parking': Car,
  'free parking': Car,
  'restaurant': UtensilsCrossed,
  'gym': Dumbbell,
  'fitness center': Dumbbell,
  'pool': Waves,
  'swimming pool': Waves,
  'ac': Wind,
  'air conditioning': Wind,
  'tv': Tv,
  'flat-screen tv': Tv,
  'coffee': Coffee,
  'tea/coffee maker': Coffee,
  'security': Shield,
  '24/7 security': Shield,
  'room service': UtensilsCrossed,
  'spa': Sparkles,
  'bar': UtensilsCrossed,
  'laundry': Wind,
};

// Room type specific images - each room type gets a unique image
const ROOM_TYPE_IMAGES = {
  standard: 'https://images.unsplash.com/photo-1631049307264-da0ec9d70304?w=800&q=80',
  deluxe: 'https://images.unsplash.com/photo-1590490360182-c33d57733427?w=800&q=80',
  superior: 'https://images.unsplash.com/photo-1611892440504-42a792e24d32?w=800&q=80',
  premium: 'https://images.unsplash.com/photo-1582719478250-c89cae4dc85b?w=800&q=80',
  suite: 'https://images.unsplash.com/photo-1578683010236-d716f9a3f461?w=800&q=80',
  executive: 'https://images.unsplash.com/photo-1591088398332-8a7791972843?w=800&q=80',
  family: 'https://images.unsplash.com/photo-1566665797739-1674de7a421a?w=800&q=80',
  twin: 'https://images.unsplash.com/photo-1595576508898-0ad5c879a061?w=800&q=80',
  single: 'https://images.unsplash.com/photo-1505693416388-ac5ce068fe85?w=800&q=80'
};

// Fallback room images for variety
const ROOM_IMAGES = [
  'https://images.unsplash.com/photo-1631049307264-da0ec9d70304?w=800',
  'https://images.unsplash.com/photo-1611892440504-42a792e24d32?w=800',
  'https://images.unsplash.com/photo-1582719478250-c89cae4dc85b?w=800',
  'https://images.unsplash.com/photo-1566665797739-1674de7a421a?w=800',
  'https://images.unsplash.com/photo-1590490360182-c33d57733427?w=800',
];

// Get room image based on room type
const getRoomTypeImage = (room, index = 0) => {
  if (!room) return ROOM_IMAGES[0];
  const roomType = (room.room_type || '').toLowerCase();
  
  // Check for specific room types
  if (roomType.includes('suite')) return ROOM_TYPE_IMAGES.suite;
  if (roomType.includes('executive')) return ROOM_TYPE_IMAGES.executive;
  if (roomType.includes('premium')) return ROOM_TYPE_IMAGES.premium;
  if (roomType.includes('deluxe')) return ROOM_TYPE_IMAGES.deluxe;
  if (roomType.includes('superior')) return ROOM_TYPE_IMAGES.superior;
  if (roomType.includes('family')) return ROOM_TYPE_IMAGES.family;
  if (roomType.includes('twin')) return ROOM_TYPE_IMAGES.twin;
  if (roomType.includes('single')) return ROOM_TYPE_IMAGES.single;
  if (roomType.includes('standard')) return ROOM_TYPE_IMAGES.standard;
  
  // Fallback to index-based image
  return ROOM_IMAGES[index % ROOM_IMAGES.length];
};

const HotelDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  
  const [hotel, setHotel] = useState(null);
  const [rooms, setRooms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('overview');
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [showGallery, setShowGallery] = useState(false);
  const [isFavorite, setIsFavorite] = useState(false);
  const [toast, setToast] = useState(null);
  
  // Booking state
  const [checkIn, setCheckIn] = useState(searchParams.get('checkIn') || '');
  const [checkOut, setCheckOut] = useState(searchParams.get('checkOut') || '');
  const [adultsCount, setAdultsCount] = useState(parseInt(searchParams.get('adults')) || 2);
  const [childrenCount, setChildrenCount] = useState(parseInt(searchParams.get('children')) || 0);
  const [roomsCount, setRoomsCount] = useState(parseInt(searchParams.get('rooms')) || 1);
  const [selectedRooms, setSelectedRooms] = useState({});
  const [checkingAvailability, setCheckingAvailability] = useState(false);
  const [availability, setAvailability] = useState({});
  
  // Reviews state
  const [reviews, setReviews] = useState([]);
  const [reviewsLoading, setReviewsLoading] = useState(false);
  const [newReview, setNewReview] = useState({ rating: 5, comment: '' });
  const [submittingReview, setSubmittingReview] = useState(false);

  // Set default dates if not provided
  useEffect(() => {
    if (!checkIn) {
      const today = new Date();
      setCheckIn(today.toISOString().split('T')[0]);
    }
    if (!checkOut) {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      setCheckOut(tomorrow.toISOString().split('T')[0]);
    }
  }, [checkIn, checkOut]);

  // Fetch hotel details
  const fetchHotelDetails = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      
      const [hotelRes, roomsRes] = await Promise.all([
        axios.get(`${API_BASE_URL}/api/hotel/${id}`),
        axios.get(`${API_BASE_URL}/api/hotel/${id}/rooms`)
      ]);
      
      setHotel(hotelRes.data);
      
      // Handle rooms response - API returns { rooms: [...] }
      const roomsData = roomsRes.data?.rooms || roomsRes.data || [];
      const roomsArray = Array.isArray(roomsData) ? roomsData : [];
      setRooms(roomsArray);
      
      // Generate mock rooms if none exist
      if (roomsArray.length === 0) {
        const mockRooms = generateMockRooms(hotelRes.data);
        setRooms(mockRooms);
      }
    } catch (err) {
      console.error('Error fetching hotel details:', err);
      setError('Failed to load hotel details. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchHotelDetails();
  }, [fetchHotelDetails]);

  // Generate mock rooms based on hotel data
  const generateMockRooms = (hotelData) => {
    const basePrice = hotelData.price_per_night || 2500;
    const starMultiplier = hotelData.star_category || 3;
    
    return [
      {
        id: 1,
        room_type: 'Standard Room',
        capacity: 2,
        price_per_night: Math.round(basePrice * 0.8),
        bed_type: 'Double Bed',
        size_sqft: 250,
        amenities: ['AC', 'TV', 'WiFi', 'Attached Bathroom'],
        images: [ROOM_IMAGES[0]],
        available: true
      },
      {
        id: 2,
        room_type: 'Deluxe Room',
        capacity: 2,
        price_per_night: basePrice,
        bed_type: 'King Size Bed',
        size_sqft: 350,
        amenities: ['AC', 'TV', 'WiFi', 'Mini Bar', 'Attached Bathroom', 'City View'],
        images: [ROOM_IMAGES[1]],
        available: true
      },
      {
        id: 3,
        room_type: 'Premium Suite',
        capacity: 3,
        price_per_night: Math.round(basePrice * 1.5),
        bed_type: 'King Size Bed + Sofa Bed',
        size_sqft: 500,
        amenities: ['AC', 'TV', 'WiFi', 'Mini Bar', 'Jacuzzi', 'Living Area', 'Premium View'],
        images: [ROOM_IMAGES[2]],
        available: starMultiplier >= 3
      },
      {
        id: 4,
        room_type: 'Family Room',
        capacity: 4,
        price_per_night: Math.round(basePrice * 1.3),
        bed_type: '2 Double Beds',
        size_sqft: 450,
        amenities: ['AC', 'TV', 'WiFi', 'Attached Bathroom', 'Extra Space'],
        images: [ROOM_IMAGES[3]],
        available: true
      },
      {
        id: 5,
        room_type: 'Presidential Suite',
        capacity: 4,
        price_per_night: Math.round(basePrice * 3),
        bed_type: 'King Size Bed',
        size_sqft: 800,
        amenities: ['AC', 'TV', 'WiFi', 'Mini Bar', 'Jacuzzi', 'Private Pool', 'Butler Service', 'Panoramic View'],
        images: [ROOM_IMAGES[4]],
        available: starMultiplier >= 4
      }
    ].filter(room => room.available);
  };

  // Check room availability
  const checkAvailability = async () => {
    if (!checkIn || !checkOut) {
      setToast({ type: 'error', message: 'Please select check-in and check-out dates' });
      return;
    }

    try {
      setCheckingAvailability(true);
      const res = await axios.post(`${API_BASE_URL}/api/hotel/check-availability`, {
        hotel_id: parseInt(id),
        check_in_date: checkIn,
        check_out_date: checkOut
      });
      setAvailability(res.data.rooms || {});
      setToast({ type: 'success', message: 'Availability checked successfully!' });
    } catch (err) {
      console.error('Error checking availability:', err);
      // Set all rooms as available for demo
      const mockAvailability = {};
      rooms.forEach(room => {
        mockAvailability[room.id] = { available: 5, price: room.price_per_night };
      });
      setAvailability(mockAvailability);
    } finally {
      setCheckingAvailability(false);
    }
  };

  // Calculate total price
  const calculateTotal = () => {
    if (!checkIn || !checkOut) return 0;
    
    const nights = Math.ceil((new Date(checkOut) - new Date(checkIn)) / (1000 * 60 * 60 * 24));
    let total = 0;
    
    Object.entries(selectedRooms).forEach(([roomId, count]) => {
      const room = rooms.find(r => r.id === parseInt(roomId));
      if (room && count > 0) {
        total += room.price_per_night * count * nights;
      }
    });
    
    return total;
  };

  // Handle room selection
  const handleRoomSelect = (roomId, change) => {
    setSelectedRooms(prev => {
      const current = prev[roomId] || 0;
      const newCount = Math.max(0, Math.min(5, current + change));
      
      if (newCount === 0) {
        const { [roomId]: removed, ...rest } = prev;
        return rest;
      }
      
      return { ...prev, [roomId]: newCount };
    });
  };

  // Proceed to booking
  const proceedToBooking = () => {
    if (!user) {
      setToast({ type: 'error', message: 'Please login to book a hotel' });
      navigate('/login', { state: { from: `/hotel/${id}` } });
      return;
    }

    const totalRooms = Object.values(selectedRooms).reduce((a, b) => a + b, 0);
    if (totalRooms === 0) {
      setToast({ type: 'error', message: 'Please select at least one room' });
      return;
    }

    // Navigate to booking page with state
    navigate('/hotel-booking', {
      state: {
        hotel,
        rooms: rooms.filter(r => selectedRooms[r.id] > 0).map(r => ({
          ...r,
          quantity: selectedRooms[r.id]
        })),
        checkIn,
        checkOut,
        adults: adultsCount,
        children: childrenCount,
        totalAmount: calculateTotal(),
        nights: Math.ceil((new Date(checkOut) - new Date(checkIn)) / (1000 * 60 * 60 * 24))
      }
    });
  };

  // Render star rating
  const renderStars = (rating) => {
    return [...Array(5)].map((_, i) => (
      <Star
        key={i}
        className={`w-4 h-4 ${i < rating ? 'text-yellow-400 fill-yellow-400' : 'text-gray-300'}`}
      />
    ));
  };

  // Get amenity icon
  const getAmenityIcon = (amenity) => {
    // Handle both string and object amenities
    const amenityName = typeof amenity === 'object' ? (amenity.name || amenity.icon || '') : String(amenity);
    const key = amenityName.toLowerCase();
    const IconComponent = Object.entries(AMENITY_ICONS).find(([k]) => key.includes(k))?.[1] || Check;
    return IconComponent;
  };

  // Get amenity display name
  const getAmenityName = (amenity) => {
    if (typeof amenity === 'object') {
      return amenity.name || amenity.icon || 'Amenity';
    }
    return String(amenity);
  };

  // Get image URL from image data (handles both string and object)
  const getImageUrl = (image) => {
    if (typeof image === 'string') return image;
    if (typeof image === 'object' && image !== null) {
      return image.url || image.src || image.image || '';
    }
    return '';
  };

  // Hotel images - extract URLs from image objects
  const defaultImages = [
    'https://images.unsplash.com/photo-1566073771259-6a8506099945?w=800',
    'https://images.unsplash.com/photo-1582719508461-905c673771fd?w=800',
    'https://images.unsplash.com/photo-1571003123894-1f0594d2b5d9?w=800',
    'https://images.unsplash.com/photo-1520250497591-112f2f40a3f4?w=800',
    'https://images.unsplash.com/photo-1542314831-068cd1dbfeeb?w=800',
  ];
  
  const hotelImages = hotel?.images?.length > 0 
    ? hotel.images.map(img => getImageUrl(img)).filter(url => url)
    : defaultImages;

  // Use default images if extracted URLs are empty
  const displayImages = hotelImages.length > 0 ? hotelImages : defaultImages;

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 pt-24 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-12 h-12 text-blue-600 animate-spin mx-auto mb-4" />
          <p className="text-gray-600">Loading hotel details...</p>
        </div>
      </div>
    );
  }

  if (error || !hotel) {
    return (
      <div className="min-h-screen bg-gray-50 pt-24 flex items-center justify-center">
        <div className="text-center">
          <AlertCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Oops! Something went wrong</h2>
          <p className="text-gray-600 mb-4">{error || 'Hotel not found'}</p>
          <button
            onClick={() => navigate('/hotels')}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            Back to Hotels
          </button>
        </div>
      </div>
    );
  }

  const tabs = [
    { id: 'overview', label: 'Overview', icon: Info },
    { id: 'rooms', label: 'Rooms', icon: Bed },
    { id: 'amenities', label: 'Amenities', icon: Sparkles },
    { id: 'reviews', label: 'Reviews', icon: MessageSquare },
    { id: 'location', label: 'Location', icon: MapPin },
    { id: 'policies', label: 'Policies', icon: Shield },
  ];

  return (
    <div className="min-h-screen bg-gray-50 pt-20">
      {toast && (
        <Toast
          type={toast.type}
          message={toast.message}
          onClose={() => setToast(null)}
        />
      )}

      {/* Image Gallery Modal */}
      {showGallery && (
        <div className="fixed inset-0 bg-black/95 z-50 flex items-center justify-center">
          <button
            onClick={() => setShowGallery(false)}
            className="absolute top-4 right-4 p-2 text-white hover:bg-white/10 rounded-full transition-colors"
          >
            <X className="w-8 h-8" />
          </button>
          
          <button
            onClick={() => setCurrentImageIndex(prev => prev === 0 ? displayImages.length - 1 : prev - 1)}
            className="absolute left-4 p-2 text-white hover:bg-white/10 rounded-full transition-colors"
          >
            <ChevronLeft className="w-8 h-8" />
          </button>
          
          <img
            src={displayImages[currentImageIndex]}
            alt={`${hotel.name} - Image ${currentImageIndex + 1}`}
            className="max-h-[80vh] max-w-[90vw] object-contain"
          />
          
          <button
            onClick={() => setCurrentImageIndex(prev => prev === displayImages.length - 1 ? 0 : prev + 1)}
            className="absolute right-4 p-2 text-white hover:bg-white/10 rounded-full transition-colors"
          >
            <ChevronRight className="w-8 h-8" />
          </button>
          
          <div className="absolute bottom-4 flex gap-2">
            {displayImages.map((_, idx) => (
              <button
                key={idx}
                onClick={() => setCurrentImageIndex(idx)}
                className={`w-2 h-2 rounded-full transition-colors ${
                  idx === currentImageIndex ? 'bg-white' : 'bg-white/40'
                }`}
              />
            ))}
          </div>
        </div>
      )}

      {/* Hero Section with Images */}
      <div className="relative h-[400px] overflow-hidden">
        <div className="grid grid-cols-4 gap-1 h-full">
          <div className="col-span-2 row-span-2 relative overflow-hidden">
            <img
              src={displayImages[0]}
              alt={hotel.name}
              className="w-full h-full object-cover cursor-pointer hover:opacity-95 transition-opacity"
              onClick={() => { setCurrentImageIndex(0); setShowGallery(true); }}
            />
          </div>
          {displayImages.slice(1, 5).map((img, idx) => (
            <div key={idx} className="relative overflow-hidden">
              <img
                src={img}
                alt={`${hotel.name} - ${idx + 2}`}
                className="w-full h-full object-cover cursor-pointer hover:opacity-95 transition-opacity"
                onClick={() => { setCurrentImageIndex(idx + 1); setShowGallery(true); }}
              />
              {idx === 3 && displayImages.length > 5 && (
                <div 
                  className="absolute inset-0 bg-black/60 flex items-center justify-center cursor-pointer"
                  onClick={() => { setCurrentImageIndex(4); setShowGallery(true); }}
                >
                  <div className="text-white text-center">
                    <Camera className="w-8 h-8 mx-auto mb-1" />
                    <span className="text-lg font-semibold">+{displayImages.length - 5} Photos</span>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
        
        {/* Quick Actions */}
        <div className="absolute top-4 right-4 flex gap-2">
          <button
            onClick={() => setIsFavorite(!isFavorite)}
            className={`p-3 rounded-full shadow-lg transition-colors ${
              isFavorite ? 'bg-red-500 text-white' : 'bg-white text-gray-700 hover:bg-gray-100'
            }`}
          >
            <Heart className={`w-5 h-5 ${isFavorite ? 'fill-white' : ''}`} />
          </button>
          <button
            onClick={() => {
              navigator.clipboard.writeText(window.location.href);
              setToast({ type: 'success', message: 'Link copied to clipboard!' });
            }}
            className="p-3 bg-white rounded-full shadow-lg text-gray-700 hover:bg-gray-100 transition-colors"
          >
            <Share2 className="w-5 h-5" />
          </button>
        </div>
        
        {/* View All Photos Button */}
        <button
          onClick={() => { setCurrentImageIndex(0); setShowGallery(true); }}
          className="absolute bottom-4 right-4 px-4 py-2 bg-white rounded-lg shadow-lg flex items-center gap-2 hover:bg-gray-100 transition-colors"
        >
          <ZoomIn className="w-4 h-4" />
          View All {displayImages.length} Photos
        </button>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 py-6">
        <div className="flex flex-col lg:flex-row gap-6 relative">
          {/* Left Column - Hotel Info */}
          <div className="flex-1 min-w-0 lg:pr-[400px]">
            {/* Hotel Header */}
            <div className="bg-white rounded-xl shadow-sm p-6 mb-6">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <span className="px-3 py-1 bg-blue-100 text-blue-700 text-sm font-medium rounded-full">
                      {hotel.hotel_type || 'Hotel'}
                    </span>
                    <div className="flex">{renderStars(hotel.star_category || 3)}</div>
                  </div>
                  <h1 className="text-3xl font-bold text-gray-900 mb-2">{hotel.name}</h1>
                  <div className="flex items-center gap-2 text-gray-600">
                    <MapPin className="w-4 h-4" />
                    <span>{hotel.address}</span>
                  </div>
                  <p className="text-gray-500 mt-1">{hotel.city}, {hotel.state}</p>
                </div>
                
                <div className="text-right">
                  <div className="flex items-center gap-2 justify-end mb-2">
                    <div className="bg-green-600 text-white px-3 py-1 rounded-lg font-bold">
                      {hotel.rating?.toFixed(1) || '4.2'}
                    </div>
                    <div>
                      <div className="font-semibold text-gray-900">Very Good</div>
                      <div className="text-sm text-gray-500">{hotel.total_reviews || 128} reviews</div>
                    </div>
                  </div>
                </div>
              </div>
              
              {/* Quick Info */}
              <div className="flex flex-wrap gap-4 pt-4 border-t">
                {hotel.total_rooms && (
                  <div className="flex items-center gap-2 text-gray-600">
                    <Building2 className="w-4 h-4" />
                    <span>{hotel.total_rooms} Rooms</span>
                  </div>
                )}
                <div className="flex items-center gap-2 text-gray-600">
                  <Clock className="w-4 h-4" />
                  <span>Check-in: 2:00 PM</span>
                </div>
                <div className="flex items-center gap-2 text-gray-600">
                  <Clock className="w-4 h-4" />
                  <span>Check-out: 11:00 AM</span>
                </div>
              </div>
            </div>

            {/* Tabs Navigation */}
            <div className="bg-white rounded-xl shadow-sm mb-6 overflow-hidden">
              <div className="flex overflow-x-auto border-b">
                {tabs.map(tab => {
                  const IconComponent = tab.icon;
                  return (
                    <button
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id)}
                      className={`flex items-center gap-2 px-6 py-4 font-medium whitespace-nowrap border-b-2 transition-colors ${
                        activeTab === tab.id
                          ? 'border-blue-600 text-blue-600'
                          : 'border-transparent text-gray-600 hover:text-gray-900'
                      }`}
                    >
                      <IconComponent className="w-4 h-4" />
                      {tab.label}
                    </button>
                  );
                })}
              </div>

              {/* Tab Content */}
              <div className="p-6">
                {/* Overview Tab */}
                {activeTab === 'overview' && (
                  <div>
                    <h3 className="text-xl font-bold text-gray-900 mb-4">About {hotel.name}</h3>
                    <p className="text-gray-600 leading-relaxed mb-6">
                      {hotel.description || `Welcome to ${hotel.name}, a ${hotel.star_category || 3}-star ${hotel.hotel_type || 'hotel'} located in the heart of ${hotel.city}. Our property offers comfortable accommodations with modern amenities, making it perfect for both business and leisure travelers. Experience warm hospitality and excellent service during your stay with us.`}
                    </p>
                    
                    <h4 className="text-lg font-semibold text-gray-900 mb-3">Popular Amenities</h4>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      {(hotel.amenities || ['Free WiFi', 'Parking', 'Restaurant', 'Room Service', 'AC', '24/7 Security']).slice(0, 8).map((amenity, idx) => {
                        const IconComponent = getAmenityIcon(amenity);
                        return (
                          <div key={idx} className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                            <IconComponent className="w-5 h-5 text-blue-600" />
                            <span className="text-gray-700">{getAmenityName(amenity)}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Rooms Tab */}
                {activeTab === 'rooms' && (
                  <div>
                    <div className="flex items-center justify-between mb-6">
                      <h3 className="text-xl font-bold text-gray-900">Select Rooms</h3>
                      <button
                        onClick={checkAvailability}
                        disabled={checkingAvailability}
                        className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
                      >
                        {checkingAvailability ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin" />
                            Checking...
                          </>
                        ) : (
                          <>
                            <Calendar className="w-4 h-4" />
                            Check Availability
                          </>
                        )}
                      </button>
                    </div>

                    <div className="space-y-4">
                      {rooms.map((room, idx) => (
                        <div key={room.id} className="border rounded-xl overflow-hidden hover:shadow-lg transition-shadow">
                          <div className="flex flex-col md:flex-row">
                            {/* Room Image */}
                            <div className="md:w-64 h-48 md:h-auto relative">
                              <img
                                src={room.images?.[0] || getRoomTypeImage(room, idx)}
                                alt={room.room_type}
                                className="w-full h-full object-cover"
                              />
                            </div>
                            
                            {/* Room Details */}
                            <div className="flex-1 p-4">
                              <div className="flex items-start justify-between mb-3">
                                <div>
                                  <h4 className="text-lg font-semibold text-gray-900">{room.room_type}</h4>
                                  <div className="flex items-center gap-4 text-sm text-gray-600 mt-1">
                                    <span className="flex items-center gap-1">
                                      <Users className="w-4 h-4" />
                                      {room.capacity} Guests
                                    </span>
                                    <span className="flex items-center gap-1">
                                      <Bed className="w-4 h-4" />
                                      {room.bed_type}
                                    </span>
                                    {room.size_sqft && (
                                      <span>{room.size_sqft} sq ft</span>
                                    )}
                                  </div>
                                </div>
                                
                                <div className="text-right">
                                  <div className="text-2xl font-bold text-gray-900">
                                    ₹{room.price_per_night?.toLocaleString()}
                                  </div>
                                  <div className="text-sm text-gray-500">per night</div>
                                </div>
                              </div>
                              
                              {/* Room Amenities */}
                              <div className="flex flex-wrap gap-2 mb-4">
                                {room.amenities?.slice(0, 6).map((amenity, idx) => (
                                  <span key={idx} className="px-2 py-1 bg-gray-100 text-gray-600 text-xs rounded">
                                    {typeof amenity === 'object' ? amenity.name : amenity}
                                  </span>
                                ))}
                              </div>
                              
                              {/* Room Selection */}
                              <div className="flex items-center justify-between pt-3 border-t">
                                <div className="text-sm text-green-600 font-medium">
                                  {availability[room.id]?.available !== undefined
                                    ? `${availability[room.id].available} rooms available`
                                    : 'Check availability'}
                                </div>
                                
                                <div className="flex items-center gap-3">
                                  <button
                                    onClick={() => handleRoomSelect(room.id, -1)}
                                    className="p-2 rounded-lg border hover:bg-gray-100 disabled:opacity-50"
                                    disabled={!selectedRooms[room.id]}
                                  >
                                    <Minus className="w-4 h-4" />
                                  </button>
                                  <span className="w-8 text-center font-semibold">
                                    {selectedRooms[room.id] || 0}
                                  </span>
                                  <button
                                    onClick={() => handleRoomSelect(room.id, 1)}
                                    className="p-2 rounded-lg border hover:bg-gray-100"
                                  >
                                    <Plus className="w-4 h-4" />
                                  </button>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Amenities Tab */}
                {activeTab === 'amenities' && (
                  <div>
                    <h3 className="text-xl font-bold text-gray-900 mb-6">Hotel Amenities</h3>
                    
                    <div className="grid md:grid-cols-2 gap-8">
                      <div>
                        <h4 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
                          <Building2 className="w-5 h-5 text-blue-600" />
                          Property Amenities
                        </h4>
                        <ul className="space-y-3">
                          {['Free WiFi', 'Free Parking', 'Swimming Pool', 'Fitness Center', 'Restaurant', 'Bar/Lounge', '24-hour Front Desk', 'Room Service', 'Laundry Service', 'Business Center'].map((amenity, idx) => (
                            <li key={idx} className="flex items-center gap-3 text-gray-700">
                              <Check className="w-4 h-4 text-green-500" />
                              {amenity}
                            </li>
                          ))}
                        </ul>
                      </div>
                      
                      <div>
                        <h4 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
                          <Bed className="w-5 h-5 text-blue-600" />
                          Room Amenities
                        </h4>
                        <ul className="space-y-3">
                          {['Air Conditioning', 'Flat-screen TV', 'Mini Bar', 'Tea/Coffee Maker', 'Safe Deposit Box', 'Attached Bathroom', 'Hot Water', 'Daily Housekeeping', 'Toiletries', 'Iron & Ironing Board'].map((amenity, idx) => (
                            <li key={idx} className="flex items-center gap-3 text-gray-700">
                              <Check className="w-4 h-4 text-green-500" />
                              {amenity}
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </div>
                )}

                {/* Reviews Tab */}
                {activeTab === 'reviews' && (
                  <div>
                    <div className="flex items-center justify-between mb-6">
                      <h3 className="text-xl font-bold text-gray-900">Guest Reviews</h3>
                      <div className="flex items-center gap-2">
                        <div className="bg-green-600 text-white px-3 py-1 rounded-lg font-bold text-lg">
                          {hotel.rating?.toFixed(1) || '4.2'}
                        </div>
                        <span className="text-gray-600">{hotel.total_reviews || 128} reviews</span>
                      </div>
                    </div>
                    
                    {/* Rating Breakdown */}
                    <div className="grid md:grid-cols-2 gap-6 mb-8 p-4 bg-gray-50 rounded-xl">
                      <div>
                        <h4 className="font-semibold mb-3">Rating Breakdown</h4>
                        {[5, 4, 3, 2, 1].map(rating => (
                          <div key={rating} className="flex items-center gap-2 mb-2">
                            <span className="w-4">{rating}</span>
                            <Star className="w-4 h-4 text-yellow-400 fill-yellow-400" />
                            <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
                              <div 
                                className="h-full bg-yellow-400 rounded-full"
                                style={{ width: `${rating === 5 ? 60 : rating === 4 ? 25 : rating === 3 ? 10 : rating === 2 ? 3 : 2}%` }}
                              />
                            </div>
                            <span className="w-10 text-sm text-gray-600">
                              {rating === 5 ? '60%' : rating === 4 ? '25%' : rating === 3 ? '10%' : rating === 2 ? '3%' : '2%'}
                            </span>
                          </div>
                        ))}
                      </div>
                      
                      <div>
                        <h4 className="font-semibold mb-3">Category Ratings</h4>
                        {[
                          { label: 'Cleanliness', rating: 4.5 },
                          { label: 'Service', rating: 4.3 },
                          { label: 'Location', rating: 4.7 },
                          { label: 'Value for Money', rating: 4.1 },
                        ].map((cat, idx) => (
                          <div key={idx} className="flex items-center justify-between mb-2">
                            <span className="text-gray-600">{cat.label}</span>
                            <div className="flex items-center gap-2">
                              <div className="w-24 h-2 bg-gray-200 rounded-full overflow-hidden">
                                <div 
                                  className="h-full bg-blue-600 rounded-full"
                                  style={{ width: `${(cat.rating / 5) * 100}%` }}
                                />
                              </div>
                              <span className="font-semibold">{cat.rating}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                    
                    {/* Sample Reviews */}
                    <div className="space-y-4">
                      {[
                        { name: 'Rahul S.', date: '2 weeks ago', rating: 5, comment: 'Excellent stay! The room was clean and spacious. Staff was very helpful and friendly. Will definitely come back.' },
                        { name: 'Priya M.', date: '1 month ago', rating: 4, comment: 'Good location, comfortable beds. The breakfast could have been better but overall a pleasant experience.' },
                        { name: 'Amit K.', date: '1 month ago', rating: 5, comment: 'Perfect for a weekend getaway. The pool was amazing and the restaurant served delicious food.' },
                      ].map((review, idx) => (
                        <div key={idx} className="p-4 border rounded-xl">
                          <div className="flex items-start justify-between mb-2">
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
                                <User className="w-5 h-5 text-blue-600" />
                              </div>
                              <div>
                                <div className="font-semibold">{review.name}</div>
                                <div className="text-sm text-gray-500">{review.date}</div>
                              </div>
                            </div>
                            <div className="flex">{renderStars(review.rating)}</div>
                          </div>
                          <p className="text-gray-600">{review.comment}</p>
                          <button className="flex items-center gap-1 text-sm text-gray-500 mt-2 hover:text-blue-600">
                            <ThumbsUp className="w-4 h-4" />
                            Helpful
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Location Tab */}
                {activeTab === 'location' && (
                  <div>
                    <h3 className="text-xl font-bold text-gray-900 mb-4">Location</h3>
                    
                    <div className="bg-gray-100 rounded-xl h-64 flex items-center justify-center mb-6">
                      <div className="text-center">
                        <MapPin className="w-12 h-12 text-gray-400 mx-auto mb-2" />
                        <p className="text-gray-500">Map view coming soon</p>
                        <p className="text-sm text-gray-400">{hotel.address}, {hotel.city}</p>
                      </div>
                    </div>
                    
                    <div className="grid md:grid-cols-2 gap-6">
                      <div>
                        <h4 className="font-semibold text-gray-900 mb-3">Address</h4>
                        <p className="text-gray-600">{hotel.address}</p>
                        <p className="text-gray-600">{hotel.city}, {hotel.state}</p>
                        <p className="text-gray-600">India - {hotel.pincode || '000000'}</p>
                      </div>
                      
                      <div>
                        <h4 className="font-semibold text-gray-900 mb-3">Nearby Attractions</h4>
                        <ul className="space-y-2">
                          {[
                            { name: 'City Center', distance: '2 km' },
                            { name: 'Railway Station', distance: '5 km' },
                            { name: 'Airport', distance: '15 km' },
                            { name: 'Shopping Mall', distance: '1 km' },
                          ].map((place, idx) => (
                            <li key={idx} className="flex items-center justify-between text-gray-600">
                              <span className="flex items-center gap-2">
                                <Navigation className="w-4 h-4" />
                                {place.name}
                              </span>
                              <span className="text-sm">{place.distance}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </div>
                )}

                {/* Policies Tab */}
                {activeTab === 'policies' && (
                  <div>
                    <h3 className="text-xl font-bold text-gray-900 mb-6">Hotel Policies</h3>
                    
                    <div className="space-y-6">
                      <div className="p-4 bg-gray-50 rounded-xl">
                        <h4 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
                          <Clock className="w-5 h-5 text-blue-600" />
                          Check-in/Check-out
                        </h4>
                        <div className="grid md:grid-cols-2 gap-4">
                          <div>
                            <span className="text-gray-600">Check-in Time:</span>
                            <span className="ml-2 font-semibold">2:00 PM onwards</span>
                          </div>
                          <div>
                            <span className="text-gray-600">Check-out Time:</span>
                            <span className="ml-2 font-semibold">11:00 AM</span>
                          </div>
                        </div>
                      </div>
                      
                      <div className="p-4 bg-gray-50 rounded-xl">
                        <h4 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
                          <CreditCard className="w-5 h-5 text-blue-600" />
                          Payment & Cancellation
                        </h4>
                        <ul className="space-y-2 text-gray-600">
                          <li className="flex items-start gap-2">
                            <Check className="w-4 h-4 text-green-500 mt-1" />
                            Free cancellation up to 24 hours before check-in
                          </li>
                          <li className="flex items-start gap-2">
                            <Check className="w-4 h-4 text-green-500 mt-1" />
                            Full refund on cancellations made 48+ hours before check-in
                          </li>
                          <li className="flex items-start gap-2">
                            <AlertCircle className="w-4 h-4 text-orange-500 mt-1" />
                            50% charge for cancellations made within 24 hours
                          </li>
                          <li className="flex items-start gap-2">
                            <X className="w-4 h-4 text-red-500 mt-1" />
                            No refund for no-shows
                          </li>
                        </ul>
                      </div>
                      
                      <div className="p-4 bg-gray-50 rounded-xl">
                        <h4 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
                          <Shield className="w-5 h-5 text-blue-600" />
                          House Rules
                        </h4>
                        <ul className="space-y-2 text-gray-600">
                          <li className="flex items-start gap-2">
                            <Info className="w-4 h-4 text-blue-500 mt-1" />
                            Valid ID proof required at check-in
                          </li>
                          <li className="flex items-start gap-2">
                            <Info className="w-4 h-4 text-blue-500 mt-1" />
                            Couples allowed (local IDs accepted)
                          </li>
                          <li className="flex items-start gap-2">
                            <Info className="w-4 h-4 text-blue-500 mt-1" />
                            Pets not allowed
                          </li>
                          <li className="flex items-start gap-2">
                            <Info className="w-4 h-4 text-blue-500 mt-1" />
                            Outside food not allowed in restaurant area
                          </li>
                          <li className="flex items-start gap-2">
                            {hotel.alcohol_allowed ? (
                              <Check className="w-4 h-4 text-green-500 mt-1" />
                            ) : (
                              <X className="w-4 h-4 text-red-500 mt-1" />
                            )}
                            Alcohol {hotel.alcohol_allowed ? 'served' : 'not served'}
                          </li>
                        </ul>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Right Column - Booking Card */}
          <div className="w-full lg:w-[380px] lg:absolute lg:right-0 lg:top-0">
            <div className="bg-white rounded-xl shadow-lg p-5 lg:sticky lg:top-24 border border-gray-100">
              <div className="flex items-center justify-between mb-4">
                <div className="min-w-0 flex-1">
                  <span className="text-sm text-gray-500">Starting from</span>
                  <div className="text-2xl lg:text-3xl font-bold text-gray-900 truncate">
                    ₹{hotel.price_per_night?.toLocaleString() || '2,500'}
                    <span className="text-sm lg:text-base font-normal text-gray-500">/night</span>
                  </div>
                </div>
                <div className="flex items-center gap-1 bg-green-100 text-green-700 px-2 py-1 rounded flex-shrink-0 ml-2">
                  <Tag className="w-4 h-4" />
                  <span className="text-xs lg:text-sm font-medium whitespace-nowrap">Best Price</span>
                </div>
              </div>

              {/* Date Selection */}
              <div className="grid grid-cols-2 gap-2 mb-4">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Check-in</label>
                  <div className="relative">
                    <Calendar className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                      type="date"
                      value={checkIn}
                      onChange={(e) => setCheckIn(e.target.value)}
                      min={new Date().toISOString().split('T')[0]}
                      className="w-full pl-8 pr-2 py-2 text-sm border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Check-out</label>
                  <div className="relative">
                    <Calendar className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                      type="date"
                      value={checkOut}
                      onChange={(e) => setCheckOut(e.target.value)}
                      min={checkIn || new Date().toISOString().split('T')[0]}
                      className="w-full pl-8 pr-2 py-2 text-sm border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                </div>
              </div>

              {/* Guest Selection */}
              <div className="grid grid-cols-3 gap-1 lg:gap-2 mb-4">
                <div className="text-center p-2 border rounded-lg">
                  <div className="text-xs lg:text-sm text-gray-500">Adults</div>
                  <div className="flex items-center justify-center gap-1 lg:gap-2 mt-1">
                    <button
                      onClick={() => setAdultsCount(Math.max(1, adultsCount - 1))}
                      className="p-1 hover:bg-gray-100 rounded"
                    >
                      <Minus className="w-3 h-3" />
                    </button>
                    <span className="font-semibold w-4 text-center">{adultsCount}</span>
                    <button
                      onClick={() => setAdultsCount(Math.min(10, adultsCount + 1))}
                      className="p-1 hover:bg-gray-100 rounded"
                    >
                      <Plus className="w-3 h-3" />
                    </button>
                  </div>
                </div>
                <div className="text-center p-2 border rounded-lg">
                  <div className="text-xs lg:text-sm text-gray-500">Children</div>
                  <div className="flex items-center justify-center gap-1 lg:gap-2 mt-1">
                    <button
                      onClick={() => setChildrenCount(Math.max(0, childrenCount - 1))}
                      className="p-1 hover:bg-gray-100 rounded"
                    >
                      <Minus className="w-3 h-3" />
                    </button>
                    <span className="font-semibold w-4 text-center">{childrenCount}</span>
                    <button
                      onClick={() => setChildrenCount(Math.min(6, childrenCount + 1))}
                      className="p-1 hover:bg-gray-100 rounded"
                    >
                      <Plus className="w-3 h-3" />
                    </button>
                  </div>
                </div>
                <div className="text-center p-2 border rounded-lg">
                  <div className="text-xs lg:text-sm text-gray-500">Rooms</div>
                  <div className="flex items-center justify-center gap-1 lg:gap-2 mt-1">
                    <button
                      onClick={() => setRoomsCount(Math.max(1, roomsCount - 1))}
                      className="p-1 hover:bg-gray-100 rounded"
                    >
                      <Minus className="w-3 h-3" />
                    </button>
                    <span className="font-semibold w-4 text-center">{roomsCount}</span>
                    <button
                      onClick={() => setRoomsCount(Math.min(5, roomsCount + 1))}
                      className="p-1 hover:bg-gray-100 rounded"
                    >
                      <Plus className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              </div>

              {/* Selected Rooms Summary */}
              {Object.keys(selectedRooms).length > 0 && (
                <div className="mb-4 p-3 bg-blue-50 rounded-lg">
                  <h4 className="font-medium text-gray-900 mb-2">Selected Rooms</h4>
                  {Object.entries(selectedRooms).map(([roomId, count]) => {
                    const room = rooms.find(r => r.id === parseInt(roomId));
                    return room ? (
                      <div key={roomId} className="flex justify-between text-sm text-gray-600">
                        <span>{room.room_type} x {count}</span>
                        <span>₹{(room.price_per_night * count).toLocaleString()}/night</span>
                      </div>
                    ) : null;
                  })}
                  {checkIn && checkOut && (
                    <>
                      <div className="border-t mt-2 pt-2 text-sm text-gray-600">
                        {Math.ceil((new Date(checkOut) - new Date(checkIn)) / (1000 * 60 * 60 * 24))} night(s)
                      </div>
                      <div className="flex justify-between font-semibold text-gray-900 mt-1">
                        <span>Total</span>
                        <span>₹{calculateTotal().toLocaleString()}</span>
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* Book Button */}
              <button
                onClick={proceedToBooking}
                disabled={Object.keys(selectedRooms).length === 0}
                className="w-full py-3 bg-gradient-to-r from-blue-600 to-blue-700 text-white font-semibold rounded-xl hover:from-blue-700 hover:to-blue-800 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition-all"
              >
                {Object.keys(selectedRooms).length === 0 ? (
                  'Select a Room to Book'
                ) : (
                  <>
                    Continue Booking
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>

              {/* Trust Badges */}
              <div className="flex flex-col sm:flex-row items-center justify-center gap-2 lg:gap-4 mt-4 pt-4 border-t">
                <div className="flex items-center gap-1 text-xs lg:text-sm text-gray-500">
                  <Shield className="w-4 h-4 text-green-500 flex-shrink-0" />
                  <span>Secure Booking</span>
                </div>
                <div className="flex items-center gap-1 text-xs lg:text-sm text-gray-500">
                  <Check className="w-4 h-4 text-green-500 flex-shrink-0" />
                  <span>Free Cancellation</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default HotelDetail;
