import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { Card } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { MapPin, Calendar, Users, IndianRupee, Download, XCircle, CheckCircle2, Clock, ListChecks } from 'lucide-react';

const TripHistory = () => {
  const navigate = useNavigate();
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('all');
  const [updatingStatus, setUpdatingStatus] = useState(null);

  useEffect(() => {
    fetchBookings();
  }, []);

  const fetchBookings = async () => {
    try {
      const response = await axios.get('/api/bookings');
      setBookings(response.data || []);
    } catch (error) {
      console.error('Failed to fetch bookings:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleStatusUpdate = async (bookingId, newStatus) => {
    if (newStatus === 'Cancelled' && !window.confirm('Are you sure you want to cancel this booking?')) return;
    
    setUpdatingStatus(bookingId);
    try {
      await axios.put(`/api/bookings/${bookingId}/status`, { status: newStatus });
      setBookings((prev) =>
        prev.map((b) => (b.id === bookingId ? { ...b, status: newStatus } : b))
      );
    } catch (error) {
      console.error('Failed to update status:', error);
      alert('Failed to update booking status. Please try again.');
    } finally {
      setUpdatingStatus(null);
    }
  };

  const getReceiptForBooking = async (booking) => {
    try {
      const response = await axios.get('/api/receipts');
      const receipt = (response.data || []).find((r) => r.booking_ref === booking.booking_ref);
      if (receipt && receipt.receipt_url) {
        window.open(receipt.receipt_url, '_blank');
      } else {
        if (window.confirm('No e-ticket found for this booking. Do you want to complete payment now to generate your e-ticket?')) {
          navigate('/payment', { state: { booking } });
        }
      }
    } catch (error) {
      console.error('Failed to fetch e-ticket/receipt:', error);
      const retry = window.confirm('Fetching e-ticket failed. This can happen if the app is not connected to the backend. Try payment flow now?');
      if (retry) navigate('/payment', { state: { booking } });
    }
  };

  const getStatusBadge = (status) => {
    const styles = {
      Confirmed: 'bg-green-100 text-green-700 border-green-200',
      Cancelled: 'bg-red-100 text-red-700 border-red-200',
      Completed: 'bg-blue-100 text-blue-700 border-blue-200',
    };
    const icons = {
      Confirmed: CheckCircle2,
      Cancelled: XCircle,
      Completed: Clock,
    };
    const effective = status || 'Confirmed';
    const Icon = icons[effective] || CheckCircle2;
    return (
      <Badge className={`${styles[effective] || ''} flex items-center gap-1`}>
        <Icon className="w-3 h-3" />
        {effective}
      </Badge>
    );
  };

  const filterBookings = (status) => {
    if (status === 'all') return bookings;
    return bookings.filter((b) => b.status === status);
  };

  const filteredBookings = filterBookings(activeTab);

  const renderBookingCard = (booking) => {
    const status = booking.status || 'Confirmed';
    return (
    <Card key={booking.id} className="p-6 hover:shadow-xl transition-shadow">
      <div className="flex justify-between items-start mb-4">
        <div>
          <h3 className="text-xl font-bold text-gray-900">{booking.destination}</h3>
          <p className="text-sm text-gray-500 mt-1">{booking.booking_ref}</p>
        </div>
  {getStatusBadge(status)}
      </div>

      <div className="space-y-3 mb-4">
        <div className="flex items-center gap-2 text-gray-700">
          <Calendar className="w-4 h-4 text-[#0077b6]" />
          <span className="text-sm">
            {booking.start_date ? new Date(booking.start_date).toLocaleDateString() : '-'} to{' '}
            {booking.end_date ? new Date(booking.end_date).toLocaleDateString() : '-'}
          </span>
        </div>

        <div className="flex items-center gap-2 text-gray-700">
          <Users className="w-4 h-4 text-[#0077b6]" />
          <span className="text-sm">
            {booking.travelers} {booking.travelers === 1 ? 'Traveler' : 'Travelers'}
          </span>
        </div>

        {booking.package_type && (
          <div className="flex items-center gap-2 text-gray-700">
            <MapPin className="w-4 h-4 text-[#0077b6]" />
            <span className="text-sm">{booking.package_type}</span>
          </div>
        )}

        <div className="flex items-center gap-2 text-gray-700 pt-2 border-t">
          <IndianRupee className="w-4 h-4 text-[#0077b6]" />
          <span className="text-lg font-bold text-[#0077b6]">
            ₹{Number(booking.total_price || 0).toLocaleString()}
          </span>
        </div>

        <div className="text-xs text-gray-500 pt-2">
          Booked on {new Date(booking.created_at).toLocaleDateString()}
        </div>
      </div>

      <div className="flex gap-2 pt-3 border-t">
        <Button
          size="sm"
          variant="outline"
          onClick={() => getReceiptForBooking(booking)}
          className="flex-1 border-[#0077b6] text-[#0077b6] hover:bg-[#0077b6] hover:text-white"
        >
          <Download className="w-4 h-4 mr-2" />
          View E-Ticket
        </Button>

        <Button
          size="sm"
          variant="outline"
          onClick={() => navigate(`/checklist?booking_id=${booking.id}`)}
          className="flex-1 border-purple-500 text-purple-600 hover:bg-purple-500 hover:text-white"
        >
          <ListChecks className="w-4 h-4 mr-2" />
          Checklist
        </Button>

        {status === 'Confirmed' && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => handleStatusUpdate(booking.id, 'Cancelled')}
            disabled={updatingStatus === booking.id}
            className="flex-1 border-red-500 text-red-500 hover:bg-red-500 hover:text-white"
          >
            <XCircle className="w-4 h-4 mr-2" />
            Cancel Trip
          </Button>
        )}

        {status === 'Confirmed' && (
          <Button
            size="sm"
            onClick={() => handleStatusUpdate(booking.id, 'Completed')}
            disabled={updatingStatus === booking.id}
            className="flex-1 bg-gradient-to-r from-green-600 to-emerald-500"
          >
            Mark Complete
          </Button>
        )}
      </div>
    </Card>
  ); };

  return (
    <div className="min-h-screen pt-24 pb-16 bg-gradient-to-b from-gray-50 to-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mb-8">
          <h1 className="text-4xl md:text-5xl font-bold bg-gradient-to-r from-[#0077b6] to-[#48cae4] bg-clip-text text-transparent mb-2">
            Trip History & E-Ticket Center
          </h1>
          <p className="text-gray-600">Manage your bookings and download e-tickets</p>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="mb-8">
          <TabsList className="grid grid-cols-4 w-full max-w-2xl">
            <TabsTrigger value="all">All Trips</TabsTrigger>
            <TabsTrigger value="Confirmed">Confirmed</TabsTrigger>
            <TabsTrigger value="Completed">Completed</TabsTrigger>
            <TabsTrigger value="Cancelled">Cancelled</TabsTrigger>
          </TabsList>

          {loading ? (
            <div className="flex justify-center items-center py-20">
              <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-[#0077b6]"></div>
            </div>
          ) : (
            <>
              <TabsContent value="all" className="mt-8">
                {filteredBookings.length === 0 ? (
                  <Card className="p-12 text-center">
                    <p className="text-gray-600 text-lg mb-4">No bookings found</p>
                    <Button onClick={() => navigate('/explore')} className="bg-gradient-to-r from-[#0077b6] to-[#48cae4]">
                      Explore Destinations
                    </Button>
                  </Card>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {filteredBookings.map(renderBookingCard)}
                  </div>
                )}
              </TabsContent>

              <TabsContent value="Confirmed" className="mt-8">
                {filteredBookings.length === 0 ? (
                  <Card className="p-12 text-center">
                    <CheckCircle2 className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                    <p className="text-gray-600 text-lg mb-4">No confirmed bookings</p>
                  </Card>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {filteredBookings.map(renderBookingCard)}
                  </div>
                )}
              </TabsContent>

              <TabsContent value="Completed" className="mt-8">
                {filteredBookings.length === 0 ? (
                  <Card className="p-12 text-center">
                    <Clock className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                    <p className="text-gray-600 text-lg mb-4">No completed trips</p>
                  </Card>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {filteredBookings.map(renderBookingCard)}
                  </div>
                )}
              </TabsContent>

              <TabsContent value="Cancelled" className="mt-8">
                {filteredBookings.length === 0 ? (
                  <Card className="p-12 text-center">
                    <XCircle className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                    <p className="text-gray-600 text-lg mb-4">No cancelled bookings</p>
                  </Card>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {filteredBookings.map(renderBookingCard)}
                  </div>
                )}
              </TabsContent>
            </>
          )}
        </Tabs>
      </div>
    </div>
  );
};

export default TripHistory;
