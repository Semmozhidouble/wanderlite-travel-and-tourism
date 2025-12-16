import React, { useState, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import {
  Hotel,
  MapPin,
  Star,
  Calendar,
  Clock,
  Users,
  Bed,
  Phone,
  Mail,
  User,
  CreditCard,
  Shield,
  Check,
  Download,
  Share2,
  Printer,
  QrCode,
  ChevronRight,
  Info,
  AlertCircle,
  Home,
  Copy,
  ExternalLink,
  FileText,
  Sparkles,
  CheckCircle2,
  Loader2
} from 'lucide-react';
import Toast from '../components/Toast';

// Default hotel images for fallback
const DEFAULT_HOTEL_IMAGES = [
  'https://images.unsplash.com/photo-1566073771259-6a8506099945?w=800&q=80',
  'https://images.unsplash.com/photo-1564501049412-61c2a3083791?w=800&q=80',
  'https://images.unsplash.com/photo-1582719508461-905c673771fd?w=800&q=80',
  'https://images.unsplash.com/photo-1551882547-ff40c63fe5fa?w=800&q=80',
  'https://images.unsplash.com/photo-1520250497591-112f2f40a3f4?w=800&q=80'
];

// Room type specific images
const ROOM_TYPE_IMAGES = {
  standard: 'https://images.unsplash.com/photo-1631049307264-da0ec9d70304?w=800&q=80',
  deluxe: 'https://images.unsplash.com/photo-1590490360182-c33d57733427?w=800&q=80',
  superior: 'https://images.unsplash.com/photo-1611892440504-42a792e24d32?w=800&q=80',
  premium: 'https://images.unsplash.com/photo-1582719478250-c89cae4dc85b?w=800&q=80',
  suite: 'https://images.unsplash.com/photo-1578683010236-d716f9a3f461?w=800&q=80',
  executive: 'https://images.unsplash.com/photo-1591088398332-8a7791972843?w=800&q=80'
};

// Get hotel image
const getHotelImage = (hotel) => {
  if (!hotel) return DEFAULT_HOTEL_IMAGES[0];
  if (hotel.images && Array.isArray(hotel.images) && hotel.images.length > 0) {
    const img = hotel.images[0];
    return typeof img === 'object' ? img.url : img;
  }
  if (hotel.image_url) return hotel.image_url;
  // Generate consistent image based on hotel name
  const index = hotel.name ? hotel.name.length % DEFAULT_HOTEL_IMAGES.length : 0;
  return DEFAULT_HOTEL_IMAGES[index];
};

// Get room image based on room type
const getRoomImage = (room, index = 0) => {
  if (!room) return ROOM_TYPE_IMAGES.standard;
  const roomType = (room.room_type || '').toLowerCase();
  if (roomType.includes('suite')) return ROOM_TYPE_IMAGES.suite;
  if (roomType.includes('executive')) return ROOM_TYPE_IMAGES.executive;
  if (roomType.includes('premium')) return ROOM_TYPE_IMAGES.premium;
  if (roomType.includes('deluxe')) return ROOM_TYPE_IMAGES.deluxe;
  if (roomType.includes('superior')) return ROOM_TYPE_IMAGES.superior;
  return ROOM_TYPE_IMAGES.standard;
};

const HotelTicket = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const ticketRef = useRef(null);
  
  const [toast, setToast] = useState(null);
  const [copied, setCopied] = useState(false);
  const [downloading, setDownloading] = useState(false);

  // Get booking data from navigation state
  const ticketData = location.state;

  // Redirect if no data
  if (!ticketData || !ticketData.hotel) {
    return (
      <div className="min-h-screen bg-gray-50 pt-24 flex items-center justify-center">
        <div className="text-center">
          <AlertCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-gray-900 mb-2">No Booking Found</h2>
          <p className="text-gray-600 mb-4">Unable to find your booking details.</p>
          <button
            onClick={() => navigate('/hotels')}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            Browse Hotels
          </button>
        </div>
      </div>
    );
  }

  const {
    booking,
    hotel,
    rooms,
    primaryGuest,
    additionalGuests = [],
    specialRequests,
    checkIn,
    checkOut,
    nights,
    roomCharges,
    taxes,
    serviceFee,
    discountAmount = 0,
    grandTotal,
    paymentMethod
  } = ticketData;

  // Format date
  const formatDate = (dateStr, format = 'long') => {
    const options = format === 'long' 
      ? { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }
      : { day: 'numeric', month: 'short', year: 'numeric' };
    return new Date(dateStr).toLocaleDateString('en-IN', options);
  };

  // Format booking time
  const formatBookingTime = (dateStr) => {
    return new Date(dateStr).toLocaleString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  // Copy booking reference
  const copyBookingRef = () => {
    navigator.clipboard.writeText(booking.booking_reference);
    setCopied(true);
    setToast({ type: 'success', message: 'Booking reference copied!' });
    setTimeout(() => setCopied(false), 2000);
  };

  // Print ticket
  const handlePrint = () => {
    window.print();
  };

  // Download as PDF
  const handleDownload = async () => {
    if (!ticketRef.current) {
      setToast({ type: 'error', message: 'Unable to generate PDF' });
      return;
    }

    setDownloading(true);
    setToast({ type: 'info', message: 'Generating PDF...' });

    try {
      // Create canvas from the ticket element
      const canvas = await html2canvas(ticketRef.current, {
        scale: 2,
        useCORS: true,
        allowTaint: true,
        backgroundColor: '#f9fafb',
        logging: false,
        windowWidth: ticketRef.current.scrollWidth,
        windowHeight: ticketRef.current.scrollHeight
      });

      // Calculate PDF dimensions (A4 size)
      const imgWidth = 210; // A4 width in mm
      const pageHeight = 297; // A4 height in mm
      const imgHeight = (canvas.height * imgWidth) / canvas.width;
      
      // Create PDF
      const pdf = new jsPDF('p', 'mm', 'a4');
      let heightLeft = imgHeight;
      let position = 0;

      // Add first page
      pdf.addImage(
        canvas.toDataURL('image/png'),
        'PNG',
        0,
        position,
        imgWidth,
        imgHeight,
        undefined,
        'FAST'
      );
      heightLeft -= pageHeight;

      // Add additional pages if content is longer than one page
      while (heightLeft > 0) {
        position = heightLeft - imgHeight;
        pdf.addPage();
        pdf.addImage(
          canvas.toDataURL('image/png'),
          'PNG',
          0,
          position,
          imgWidth,
          imgHeight,
          undefined,
          'FAST'
        );
        heightLeft -= pageHeight;
      }

      // Download the PDF
      const fileName = `WanderLite_Hotel_Booking_${booking.booking_reference}.pdf`;
      pdf.save(fileName);

      setToast({ type: 'success', message: 'PDF downloaded successfully!' });
    } catch (error) {
      console.error('PDF generation error:', error);
      setToast({ type: 'error', message: 'Failed to generate PDF. Please try again.' });
    } finally {
      setDownloading(false);
    }
  };

  // Share booking
  const handleShare = async () => {
    const shareData = {
      title: `Hotel Booking - ${hotel.name}`,
      text: `Hotel booking confirmation at ${hotel.name}, ${hotel.city}. Ref: ${booking.booking_reference}`,
      url: window.location.href
    };

    try {
      if (navigator.share) {
        await navigator.share(shareData);
      } else {
        navigator.clipboard.writeText(`Booking at ${hotel.name}. Reference: ${booking.booking_reference}`);
        setToast({ type: 'success', message: 'Booking details copied to clipboard!' });
      }
    } catch (err) {
      console.error('Share error:', err);
    }
  };

  // Generate QR code data
  const qrData = JSON.stringify({
    ref: booking.booking_reference,
    hotel: hotel.name,
    checkIn,
    checkOut,
    guest: `${primaryGuest.firstName} ${primaryGuest.lastName}`
  });

  // Payment method display
  const getPaymentMethodDisplay = (method) => {
    const methods = {
      card: 'Credit/Debit Card',
      upi: 'UPI',
      netbanking: 'Net Banking',
      payathotel: 'Pay at Hotel'
    };
    return methods[method] || method;
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 pt-20 pb-12 print:pt-0 print:pb-0 print:bg-white">
      {toast && (
        <Toast
          type={toast.type}
          message={toast.message}
          onClose={() => setToast(null)}
        />
      )}

      {/* Action Bar - Hidden in print */}
      <div className="max-w-4xl mx-auto px-4 mb-6 print:hidden">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <button
            onClick={() => navigate('/')}
            className="flex items-center gap-2 text-gray-600 hover:text-gray-900"
          >
            <Home className="w-4 h-4" />
            Back to Home
          </button>
          
          <div className="flex items-center gap-3">
            <button
              onClick={handlePrint}
              className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
            >
              <Printer className="w-4 h-4" />
              Print
            </button>
            <button
              onClick={handleDownload}
              disabled={downloading}
              className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {downloading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <Download className="w-4 h-4" />
                  Download PDF
                </>
              )}
            </button>
            <button
              onClick={handleShare}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              <Share2 className="w-4 h-4" />
              Share
            </button>
          </div>
        </div>
      </div>

      {/* Ticket Container */}
      <div 
        ref={ticketRef}
        className="max-w-4xl mx-auto px-4 print:px-0 print:max-w-full"
      >
        {/* Success Banner */}
        <div className="bg-gradient-to-r from-green-500 to-emerald-600 rounded-t-2xl p-6 text-white text-center print:rounded-none">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-white/20 rounded-full mb-4">
            <CheckCircle2 className="w-10 h-10" />
          </div>
          <h1 className="text-2xl font-bold mb-2">Booking Confirmed!</h1>
          <p className="text-white/90">Your hotel reservation has been successfully confirmed</p>
        </div>

        {/* Main Receipt Card */}
        <div className="bg-white shadow-2xl rounded-b-2xl overflow-hidden print:shadow-none print:rounded-none">
          {/* Booking Reference Section */}
          <div className="bg-gradient-to-r from-blue-600 to-blue-700 px-6 py-4 flex flex-col md:flex-row items-center justify-between">
            <div className="text-white text-center md:text-left mb-3 md:mb-0">
              <p className="text-blue-100 text-sm">Booking Reference</p>
              <div className="flex items-center gap-2">
                <span className="text-2xl font-bold font-mono tracking-wider">
                  {booking.booking_reference}
                </span>
                <button
                  onClick={copyBookingRef}
                  className="p-1.5 hover:bg-white/10 rounded transition-colors print:hidden"
                  title="Copy reference"
                >
                  {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                </button>
              </div>
            </div>
            
            {/* QR Code Placeholder */}
            <div className="bg-white p-3 rounded-lg">
              <div className="w-24 h-24 bg-gray-100 flex items-center justify-center rounded">
                <QrCode className="w-16 h-16 text-gray-400" />
              </div>
            </div>
          </div>

          {/* Hotel Information */}
          <div className="p-6 border-b">
            <div className="flex flex-col md:flex-row gap-6">
              {/* Hotel Image */}
              <div className="md:w-48 h-36 rounded-xl overflow-hidden flex-shrink-0">
                <img
                  src={getHotelImage(hotel)}
                  alt={hotel.name}
                  className="w-full h-full object-cover"
                />
              </div>
              
              {/* Hotel Details */}
              <div className="flex-1">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="px-2 py-0.5 bg-blue-100 text-blue-700 text-xs font-medium rounded">
                        {hotel.hotel_type || 'Hotel'}
                      </span>
                      <div className="flex">
                        {[...Array(hotel.star_category || 3)].map((_, i) => (
                          <Star key={i} className="w-3 h-3 text-yellow-400 fill-yellow-400" />
                        ))}
                      </div>
                    </div>
                    <h2 className="text-2xl font-bold text-gray-900 mb-2">{hotel.name}</h2>
                    <div className="flex items-start gap-2 text-gray-600">
                      <MapPin className="w-4 h-4 mt-0.5 flex-shrink-0" />
                      <div>
                        <p>{hotel.address}</p>
                        <p>{hotel.city}, {hotel.state}</p>
                      </div>
                    </div>
                  </div>
                  
                  {/* Rating Badge */}
                  <div className="text-right">
                    <div className="inline-flex items-center gap-1 bg-green-100 text-green-700 px-3 py-1 rounded-lg">
                      <span className="font-bold">{hotel.rating?.toFixed(1) || '4.2'}</span>
                      <Star className="w-4 h-4 fill-current" />
                    </div>
                    <p className="text-xs text-gray-500 mt-1">{hotel.total_reviews || '128'} reviews</p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Stay Details Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 border-b">
            <div className="p-4 border-r border-b md:border-b-0">
              <div className="flex items-center gap-2 text-gray-500 text-sm mb-1">
                <Calendar className="w-4 h-4" />
                Check-in
              </div>
              <p className="font-bold text-gray-900">{formatDate(checkIn, 'short')}</p>
              <p className="text-sm text-gray-500">From 2:00 PM</p>
            </div>
            <div className="p-4 md:border-r border-b md:border-b-0">
              <div className="flex items-center gap-2 text-gray-500 text-sm mb-1">
                <Calendar className="w-4 h-4" />
                Check-out
              </div>
              <p className="font-bold text-gray-900">{formatDate(checkOut, 'short')}</p>
              <p className="text-sm text-gray-500">By 11:00 AM</p>
            </div>
            <div className="p-4 border-r">
              <div className="flex items-center gap-2 text-gray-500 text-sm mb-1">
                <Clock className="w-4 h-4" />
                Duration
              </div>
              <p className="font-bold text-gray-900">{nights} Night(s)</p>
            </div>
            <div className="p-4">
              <div className="flex items-center gap-2 text-gray-500 text-sm mb-1">
                <Users className="w-4 h-4" />
                Guests
              </div>
              <p className="font-bold text-gray-900">{ticketData.adults || 2} Adults</p>
              {(ticketData.children > 0) && (
                <p className="text-sm text-gray-500">{ticketData.children} Children</p>
              )}
            </div>
          </div>

          {/* Rooms Booked */}
          <div className="p-6 border-b">
            <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
              <Bed className="w-5 h-5 text-blue-600" />
              Rooms Booked
            </h3>
            <div className="space-y-3">
              {rooms.map((room, idx) => (
                <div key={idx} className="flex items-center gap-4 p-4 bg-gray-50 rounded-lg">
                  {/* Room Image */}
                  <div className="w-20 h-16 rounded-lg overflow-hidden flex-shrink-0">
                    <img 
                      src={getRoomImage(room, idx)} 
                      alt={room.room_type}
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div className="flex-1">
                    <p className="font-semibold text-gray-900">{room.room_type}</p>
                    <div className="flex items-center gap-4 text-sm text-gray-500 mt-1">
                      <span className="flex items-center gap-1">
                        <Users className="w-3 h-3" />
                        {room.capacity} Guests
                      </span>
                      <span className="flex items-center gap-1">
                        <Bed className="w-3 h-3" />
                        {room.bed_type}
                      </span>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-gray-500">Qty: {room.quantity}</p>
                    <p className="font-semibold text-gray-900">
                      ₹{(room.price_per_night * room.quantity).toLocaleString()}/night
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Guest Details */}
          <div className="p-6 border-b">
            <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
              <User className="w-5 h-5 text-blue-600" />
              Guest Details
            </h3>
            
            {/* Primary Guest */}
            <div className="p-4 bg-blue-50 rounded-lg mb-3">
              <div className="flex items-center gap-2 mb-2">
                <span className="px-2 py-0.5 bg-blue-600 text-white text-xs rounded">Primary Guest</span>
              </div>
              <p className="font-semibold text-gray-900 text-lg">
                {primaryGuest.firstName} {primaryGuest.lastName}
              </p>
              <div className="grid grid-cols-2 gap-4 mt-3 text-sm">
                <div className="flex items-center gap-2 text-gray-600">
                  <Mail className="w-4 h-4" />
                  {primaryGuest.email}
                </div>
                <div className="flex items-center gap-2 text-gray-600">
                  <Phone className="w-4 h-4" />
                  {primaryGuest.phone}
                </div>
              </div>
              {primaryGuest.idType && primaryGuest.idNumber && (
                <div className="flex items-center gap-2 text-gray-600 text-sm mt-2">
                  <FileText className="w-4 h-4" />
                  {primaryGuest.idType.toUpperCase()}: {primaryGuest.idNumber}
                </div>
              )}
            </div>
            
            {/* Additional Guests */}
            {additionalGuests.length > 0 && (
              <div className="space-y-2">
                {additionalGuests.map((guest, idx) => (
                  <div key={idx} className="p-3 bg-gray-50 rounded-lg flex items-center justify-between">
                    <div>
                      <p className="font-medium text-gray-900">{guest.firstName} {guest.lastName}</p>
                      {guest.isChild && (
                        <span className="text-xs text-orange-600">Child</span>
                      )}
                    </div>
                    {guest.age && (
                      <span className="text-sm text-gray-500">Age: {guest.age}</span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Special Requests */}
          {specialRequests && Object.values(specialRequests).some(v => v) && (
            <div className="p-6 border-b">
              <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-blue-600" />
                Special Requests
              </h3>
              <div className="flex flex-wrap gap-2">
                {specialRequests.earlyCheckIn && (
                  <span className="px-3 py-1 bg-purple-100 text-purple-700 rounded-full text-sm">Early Check-in</span>
                )}
                {specialRequests.lateCheckOut && (
                  <span className="px-3 py-1 bg-purple-100 text-purple-700 rounded-full text-sm">Late Check-out</span>
                )}
                {specialRequests.highFloor && (
                  <span className="px-3 py-1 bg-purple-100 text-purple-700 rounded-full text-sm">High Floor</span>
                )}
                {specialRequests.nonSmoking && (
                  <span className="px-3 py-1 bg-green-100 text-green-700 rounded-full text-sm">Non-Smoking Room</span>
                )}
                {specialRequests.extraBed && (
                  <span className="px-3 py-1 bg-purple-100 text-purple-700 rounded-full text-sm">Extra Bed</span>
                )}
                {specialRequests.airportTransfer && (
                  <span className="px-3 py-1 bg-purple-100 text-purple-700 rounded-full text-sm">Airport Transfer</span>
                )}
                {specialRequests.honeymoonSetup && (
                  <span className="px-3 py-1 bg-pink-100 text-pink-700 rounded-full text-sm">Honeymoon Setup</span>
                )}
                {specialRequests.otherRequests && (
                  <p className="w-full mt-2 text-sm text-gray-600 italic">&ldquo;{specialRequests.otherRequests}&rdquo;</p>
                )}
              </div>
              <p className="text-xs text-gray-500 mt-3">
                * Special requests are subject to availability and cannot be guaranteed
              </p>
            </div>
          )}

          {/* Payment Summary */}
          <div className="p-6 border-b bg-gray-50">
            <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
              <CreditCard className="w-5 h-5 text-blue-600" />
              Payment Summary
            </h3>
            
            <div className="space-y-3">
              <div className="flex justify-between text-gray-600">
                <span>Room Charges ({nights} night{nights > 1 ? 's' : ''})</span>
                <span>₹{roomCharges.toLocaleString()}</span>
              </div>
              <div className="flex justify-between text-gray-600">
                <span>Taxes & GST (18%)</span>
                <span>₹{taxes.toLocaleString()}</span>
              </div>
              <div className="flex justify-between text-gray-600">
                <span>Service Fee</span>
                <span>₹{serviceFee.toLocaleString()}</span>
              </div>
              {discountAmount > 0 && (
                <div className="flex justify-between text-green-600">
                  <span>Discount Applied</span>
                  <span>-₹{discountAmount.toLocaleString()}</span>
                </div>
              )}
              <div className="border-t pt-3 mt-3">
                <div className="flex justify-between items-center">
                  <span className="text-lg font-bold text-gray-900">Total Paid</span>
                  <span className="text-2xl font-bold text-blue-600">₹{grandTotal.toLocaleString()}</span>
                </div>
              </div>
            </div>
            
            {/* Payment Method */}
            <div className="mt-4 p-3 bg-white rounded-lg border flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-100 rounded-lg">
                  <CreditCard className="w-5 h-5 text-blue-600" />
                </div>
                <div>
                  <p className="text-sm text-gray-500">Payment Method</p>
                  <p className="font-semibold text-gray-900">{getPaymentMethodDisplay(paymentMethod)}</p>
                </div>
              </div>
              <div className="flex items-center gap-2 text-green-600">
                <CheckCircle2 className="w-5 h-5" />
                <span className="font-medium">Paid</span>
              </div>
            </div>
          </div>

          {/* Important Information */}
          <div className="p-6 border-b">
            <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
              <Info className="w-5 h-5 text-blue-600" />
              Important Information
            </h3>
            
            <div className="grid md:grid-cols-2 gap-4">
              <div className="p-4 bg-blue-50 rounded-lg">
                <h4 className="font-semibold text-blue-900 mb-2">Check-in Requirements</h4>
                <ul className="text-sm text-blue-800 space-y-1">
                  <li>• Valid photo ID required at check-in</li>
                  <li>• Check-in time: 2:00 PM onwards</li>
                  <li>• Early check-in subject to availability</li>
                </ul>
              </div>
              <div className="p-4 bg-orange-50 rounded-lg">
                <h4 className="font-semibold text-orange-900 mb-2">Cancellation Policy</h4>
                <ul className="text-sm text-orange-800 space-y-1">
                  <li>• Free cancellation up to 24 hours before check-in</li>
                  <li>• 50% charge for late cancellations</li>
                  <li>• No refund for no-shows</li>
                </ul>
              </div>
            </div>
          </div>

          {/* Hotel Contact */}
          <div className="p-6 border-b">
            <h3 className="text-lg font-bold text-gray-900 mb-4">Hotel Contact</h3>
            <div className="flex flex-wrap gap-4">
              <a 
                href={`tel:+919876543210`}
                className="flex items-center gap-2 px-4 py-2 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
              >
                <Phone className="w-4 h-4 text-gray-600" />
                <span className="text-gray-700">+91 98765 43210</span>
              </a>
              <a 
                href={`mailto:reservations@${hotel.name.toLowerCase().replace(/\s+/g, '')}.com`}
                className="flex items-center gap-2 px-4 py-2 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
              >
                <Mail className="w-4 h-4 text-gray-600" />
                <span className="text-gray-700">reservations@hotel.com</span>
              </a>
            </div>
          </div>

          {/* Footer */}
          <div className="p-6 bg-gray-100">
            <div className="flex flex-col md:flex-row items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-600 rounded-lg">
                  <Hotel className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h4 className="font-bold text-gray-900">Wanderlite</h4>
                  <p className="text-sm text-gray-500">Your journey begins here</p>
                </div>
              </div>
              
              <div className="flex items-center gap-6 text-sm text-gray-500">
                <div className="flex items-center gap-2">
                  <Shield className="w-4 h-4 text-green-500" />
                  Secure Booking
                </div>
                <div className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-green-500" />
                  Verified Property
                </div>
                <div className="flex items-center gap-2">
                  <Phone className="w-4 h-4 text-blue-500" />
                  24/7 Support
                </div>
              </div>
            </div>
            
            {/* Booking Details */}
            <div className="mt-4 pt-4 border-t border-gray-200 text-center text-sm text-gray-500">
              <p>Booking ID: {booking.id} | Booked on: {formatBookingTime(booking.created_at)}</p>
              <p className="mt-1">For support, email us at support@wanderlite.com or call +91 1800 XXX XXXX</p>
            </div>
          </div>
        </div>

        {/* Continue Exploring - Hidden in print */}
        <div className="mt-8 text-center print:hidden">
          <p className="text-gray-600 mb-4">Thank you for booking with Wanderlite!</p>
          <div className="flex flex-wrap justify-center gap-4">
            <button
              onClick={() => navigate('/hotels')}
              className="px-6 py-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700 flex items-center gap-2"
            >
              Book Another Hotel
              <ChevronRight className="w-4 h-4" />
            </button>
            <button
              onClick={() => navigate('/dashboard')}
              className="px-6 py-3 border border-gray-300 text-gray-700 rounded-xl hover:bg-gray-50 flex items-center gap-2"
            >
              View My Bookings
              <ExternalLink className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Print Styles */}
      <style>{`
        @media print {
          body {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          .print\\:hidden {
            display: none !important;
          }
        }
      `}</style>
    </div>
  );
};

export default HotelTicket;
