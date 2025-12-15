import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, useSearchParams, useLocation } from 'react-router-dom';
import api from '../services/api';
import { Button } from '../components/ui/button';
import { Card, CardContent } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { 
  Plane, Clock, Download, Share2, Loader2, User, 
  MapPin, Calendar, QrCode, Luggage, Utensils,
  AlertCircle, CheckCircle, XCircle, RefreshCw,
  Phone, Mail, ArrowRight
} from 'lucide-react';
import { format, parseISO } from 'date-fns';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import QRCode from 'qrcode';

const FlightTicket = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const bookingRef = searchParams.get('ref') || location.state?.bookingRef;
  
  const [loading, setLoading] = useState(true);
  const [booking, setBooking] = useState(null);
  const [qrCode, setQrCode] = useState('');
  const [downloading, setDownloading] = useState(false);
  const ticketRef = useRef(null);

  useEffect(() => {
    if (bookingRef) {
      fetchBooking();
    } else {
      // Try to get from my bookings
      navigate('/my-bookings');
    }
  }, [bookingRef]);

  const fetchBooking = async () => {
    try {
      const response = await api.get(`/api/flight/booking/ref/${bookingRef}`);
      setBooking(response.data);
      
      // Generate QR code
      const qrData = JSON.stringify({
        pnr: response.data.pnr,
        booking_ref: response.data.booking_reference,
        passengers: response.data.passengers?.length || 0
      });
      const qrUrl = await QRCode.toDataURL(qrData, { width: 150, margin: 2 });
      setQrCode(qrUrl);
    } catch (error) {
      console.error('Error fetching booking:', error);
      alert('Failed to load booking details');
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadPDF = async () => {
    if (!ticketRef.current) return;
    
    setDownloading(true);
    try {
      const canvas = await html2canvas(ticketRef.current, {
        scale: 2,
        useCORS: true,
        logging: false
      });
      
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
      
      pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
      pdf.save(`FlightTicket_${booking.pnr}.pdf`);
    } catch (error) {
      console.error('Error generating PDF:', error);
      alert('Failed to download ticket');
    } finally {
      setDownloading(false);
    }
  };

  const handleCancelBooking = async () => {
    if (!window.confirm('Are you sure you want to cancel this booking? Cancellation charges may apply.')) {
      return;
    }

    try {
      await api.post('/api/flight/cancel', {
        booking_reference: booking.booking_reference
      });
      alert('Booking cancelled successfully');
      fetchBooking();
    } catch (error) {
      console.error('Error cancelling booking:', error);
      alert(error.response?.data?.detail || 'Failed to cancel booking');
    }
  };

  const formatDuration = (mins) => {
    if (!mins) return '';
    const hours = Math.floor(mins / 60);
    const minutes = mins % 60;
    return `${hours}h ${minutes}m`;
  };

  const getStatusColor = (status) => {
    switch (status?.toLowerCase()) {
      case 'confirmed':
        return 'bg-green-100 text-green-700';
      case 'cancelled':
        return 'bg-red-100 text-red-700';
      case 'completed':
        return 'bg-blue-100 text-blue-700';
      default:
        return 'bg-gray-100 text-gray-700';
    }
  };

  const getStatusIcon = (status) => {
    switch (status?.toLowerCase()) {
      case 'confirmed':
        return <CheckCircle className="w-5 h-5" />;
      case 'cancelled':
        return <XCircle className="w-5 h-5" />;
      default:
        return <AlertCircle className="w-5 h-5" />;
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-100 pt-24 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-12 h-12 animate-spin text-blue-600 mx-auto mb-4" />
          <p className="text-gray-600">Loading your ticket...</p>
        </div>
      </div>
    );
  }

  if (!booking) {
    return (
      <div className="min-h-screen bg-gray-100 pt-24 flex items-center justify-center">
        <Card className="p-8 text-center">
          <AlertCircle className="w-16 h-16 text-gray-400 mx-auto mb-4" />
          <h2 className="text-xl font-semibold mb-2">Booking Not Found</h2>
          <p className="text-gray-600 mb-4">We couldn&apos;t find the booking details.</p>
          <Button onClick={() => navigate('/my-bookings')}>View My Bookings</Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-50 pt-24 pb-8 px-4">
      <div className="max-w-4xl mx-auto">
        {/* Ticket Card */}
        <div ref={ticketRef}>
          <Card className="overflow-hidden shadow-xl">
            {/* Ticket Header */}
            <div className="bg-gradient-to-r from-blue-600 to-indigo-700 text-white p-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="bg-white/20 p-3 rounded-xl">
                    <Plane className="w-8 h-8" />
                  </div>
                  <div>
                    <h1 className="text-2xl font-bold">Flight Ticket</h1>
                    <p className="text-blue-200">E-Ticket / Boarding Pass</p>
                  </div>
                </div>
                <div className="text-right">
                  <Badge className={`${getStatusColor(booking.booking_status)} mb-2`}>
                    {getStatusIcon(booking.booking_status)}
                    <span className="ml-1 capitalize">{booking.booking_status}</span>
                  </Badge>
                  <p className="text-sm text-blue-200">PNR</p>
                  <p className="text-3xl font-bold font-mono">{booking.pnr}</p>
                </div>
              </div>
            </div>

            <CardContent className="p-0">
              {/* Flight Segments */}
              {booking.segments?.map((segment, idx) => (
                <div key={idx} className={`p-6 ${idx > 0 ? 'border-t' : ''}`}>
                  <div className="flex items-center gap-2 mb-4">
                    <Badge variant="outline" className="bg-blue-50">
                      {segment.segment_type === 'outbound' ? 'Outbound' : 'Return'} Flight
                    </Badge>
                    <span className="text-gray-500">|</span>
                    <span className="text-gray-600">{segment.airline_name}</span>
                    <span className="font-semibold">{segment.flight_number}</span>
                  </div>

                  <div className="flex items-center justify-between">
                    {/* Departure */}
                    <div className="text-center">
                      <p className="text-4xl font-bold text-gray-900">{segment.departure_time}</p>
                      <p className="text-xl font-semibold text-blue-600">{segment.origin_code}</p>
                      <p className="text-gray-600">{segment.origin_city}</p>
                      <p className="text-sm text-gray-500">{segment.origin_airport}</p>
                      <p className="text-sm text-gray-500 mt-1">
                        {segment.departure_date && format(parseISO(segment.departure_date), 'EEE, dd MMM yyyy')}
                      </p>
                    </div>

                    {/* Flight Path */}
                    <div className="flex-1 px-8">
                      <div className="flex flex-col items-center">
                        <p className="text-sm text-gray-500 mb-2">{formatDuration(segment.duration_mins)}</p>
                        <div className="flex items-center w-full">
                          <div className="h-px bg-gray-300 flex-1"></div>
                          <div className="mx-4 relative">
                            <Plane className="w-6 h-6 text-blue-600 rotate-90" />
                          </div>
                          <div className="h-px bg-gray-300 flex-1"></div>
                          <ArrowRight className="w-4 h-4 text-gray-400" />
                        </div>
                        <p className="text-xs text-gray-400 mt-2">
                          {segment.stops === 0 ? 'Non-stop' : `${segment.stops} stop(s)`}
                        </p>
                      </div>
                    </div>

                    {/* Arrival */}
                    <div className="text-center">
                      <p className="text-4xl font-bold text-gray-900">{segment.arrival_time}</p>
                      <p className="text-xl font-semibold text-blue-600">{segment.destination_code}</p>
                      <p className="text-gray-600">{segment.destination_city}</p>
                      <p className="text-sm text-gray-500">{segment.destination_airport}</p>
                      <p className="text-sm text-gray-500 mt-1">
                        {segment.arrival_date && format(parseISO(segment.arrival_date), 'EEE, dd MMM yyyy')}
                      </p>
                    </div>
                  </div>

                  {/* Terminal & Gate */}
                  <div className="flex justify-center gap-8 mt-4 pt-4 border-t border-dashed">
                    {segment.terminal && (
                      <div className="text-center">
                        <p className="text-xs text-gray-500">Terminal</p>
                        <p className="font-semibold">{segment.terminal}</p>
                      </div>
                    )}
                    {segment.gate && (
                      <div className="text-center">
                        <p className="text-xs text-gray-500">Gate</p>
                        <p className="font-semibold">{segment.gate}</p>
                      </div>
                    )}
                    <div className="text-center">
                      <p className="text-xs text-gray-500">Class</p>
                      <p className="font-semibold capitalize">{booking.seat_class || 'Economy'}</p>
                    </div>
                    <div className="text-center">
                      <p className="text-xs text-gray-500">Baggage</p>
                      <p className="font-semibold">{segment.baggage || '15kg'}</p>
                    </div>
                  </div>
                </div>
              ))}

              {/* If no segments, show basic flight info */}
              {(!booking.segments || booking.segments.length === 0) && (
                <div className="p-6">
                  <p className="text-gray-500 text-center">Flight details loading...</p>
                </div>
              )}

              {/* Passenger Details */}
              <div className="bg-gray-50 p-6 border-t">
                <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
                  <User className="w-5 h-5 text-blue-600" />
                  Passenger Details
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {booking.passengers?.map((passenger, idx) => (
                    <div key={idx} className="bg-white rounded-lg p-4 border">
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-semibold">
                          {passenger.title} {passenger.first_name} {passenger.last_name}
                        </span>
                        <Badge variant="outline" className="capitalize">{passenger.passenger_type}</Badge>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-sm text-gray-600">
                        <div>
                          <span className="text-gray-400">Seat:</span>{' '}
                          <span className="font-medium">{passenger.seat_number || 'TBD'}</span>
                        </div>
                        <div>
                          <span className="text-gray-400">Meal:</span>{' '}
                          <span className="font-medium capitalize">{passenger.meal_preference || 'Standard'}</span>
                        </div>
                        {passenger.ticket_number && (
                          <div className="col-span-2">
                            <span className="text-gray-400">Ticket #:</span>{' '}
                            <span className="font-mono">{passenger.ticket_number}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Booking & Contact Info */}
              <div className="p-6 border-t grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* QR Code */}
                <div className="flex items-center gap-4">
                  {qrCode && (
                    <img src={qrCode} alt="Booking QR Code" className="w-32 h-32" />
                  )}
                  <div>
                    <p className="text-sm text-gray-500">Booking Reference</p>
                    <p className="font-mono font-bold text-lg">{booking.booking_reference}</p>
                    <p className="text-xs text-gray-400 mt-2">
                      Scan this QR code at the airport for quick check-in
                    </p>
                  </div>
                </div>

                {/* Contact & Payment */}
                <div className="space-y-3">
                  <div>
                    <p className="text-sm text-gray-500">Contact</p>
                    <p className="font-medium">{booking.contact_name}</p>
                    <p className="text-sm text-gray-600 flex items-center gap-1">
                      <Mail className="w-4 h-4" /> {booking.contact_email}
                    </p>
                    <p className="text-sm text-gray-600 flex items-center gap-1">
                      <Phone className="w-4 h-4" /> {booking.contact_phone}
                    </p>
                  </div>
                  <div className="pt-2 border-t">
                    <p className="text-sm text-gray-500">Total Amount Paid</p>
                    <p className="text-2xl font-bold text-blue-600">
                      ₹{(booking.final_amount || booking.total_amount || 0).toLocaleString()}
                    </p>
                    <Badge className={booking.payment_status === 'completed' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}>
                      {booking.payment_status === 'completed' ? 'Paid' : 'Payment Pending'}
                    </Badge>
                  </div>
                </div>
              </div>

              {/* Important Info */}
              <div className="bg-yellow-50 p-4 border-t">
                <h4 className="font-semibold text-yellow-800 mb-2 flex items-center gap-2">
                  <AlertCircle className="w-5 h-5" />
                  Important Information
                </h4>
                <ul className="text-sm text-yellow-700 space-y-1">
                  <li>• Please arrive at the airport at least 2 hours before domestic and 3 hours before international flights</li>
                  <li>• Carry a valid photo ID along with this e-ticket</li>
                  <li>• Web check-in opens 48 hours before departure</li>
                  <li>• Baggage allowance is subject to airline policy</li>
                </ul>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default FlightTicket;
