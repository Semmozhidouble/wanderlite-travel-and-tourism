import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import api from '../services/api';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { CheckCircle } from 'lucide-react';

const FlightBooking = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [step, setStep] = useState(1); // 1: Seats, 2: Passengers, 3: Review, 4: Payment
  const [loading, setLoading] = useState(false);
  const [seatLayout, setSeatLayout] = useState([]);
  const [selectedSeats, setSelectedSeats] = useState([]);
  const [passengers, setPassengers] = useState([]);
  const [contactDetails, setContactDetails] = useState({
    name: '',
    email: '',
    phone: ''
  });

  const flight = location.state?.flight;
  const searchParams = location.state?.searchParams;
  const schedule_id = location.state?.schedule_id;

  useEffect(() => {
    if (!flight || !schedule_id) {
      navigate('/flights');
      return;
    }

    // Fetch seat layout
    const fetchSeats = async () => {
      try {
        const response = await api.get(`/api/flight/seats/${schedule_id}`, {
          params: { seat_class: searchParams.seat_class }
        });
        setSeatLayout(response.data?.seats || []);
      } catch (error) {
        console.error('Error fetching seats:', error);
      }
    };

    // Initialize passengers
    const totalPassengers = searchParams.passengers_adult + searchParams.passengers_child;
    setPassengers(Array(totalPassengers).fill(null).map(() => ({
      title: 'Mr',
      first_name: '',
      last_name: '',
      gender: 'M',
      date_of_birth: '',
      nationality: 'Indian',
      passport_number: '',
      seat_preference: 'window',
      meal_preference: 'veg'
    })));

    fetchSeats();
  }, [flight, schedule_id, searchParams, navigate]);

  const selectSeat = (seat) => {
    if (seat.status === 'available') {
      if (selectedSeats.find(s => s.id === seat.id)) {
        setSelectedSeats(selectedSeats.filter(s => s.id !== seat.id));
      } else {
        if (selectedSeats.length < passengers.length) {
          setSelectedSeats([...selectedSeats, seat]);
        } else {
          alert(`You can only select ${passengers.length} seats`);
        }
      }
    }
  };

  const getSeatColor = (seat) => {
    if (selectedSeats.find(s => s.id === seat.id)) return 'bg-green-500';
    if (seat.status === 'booked') return 'bg-red-500';
    if (seat.status === 'locked') return 'bg-yellow-500';
    if (seat.seat_class === 'business') return 'bg-purple-300';
    return 'bg-blue-200';
  };

  const handlePassengerChange = (index, field, value) => {
    const newPassengers = [...passengers];
    newPassengers[index] = { ...newPassengers[index], [field]: value };
    setPassengers(newPassengers);
  };

  const proceedToPayment = async () => {
    if (selectedSeats.length !== passengers.length) {
      alert('Please select seats for all passengers');
      return;
    }

    if (!contactDetails.name || !contactDetails.email || !contactDetails.phone) {
      alert('Please fill in all contact details');
      return;
    }

    // Validate passengers
    for (let p of passengers) {
      if (!p.first_name || !p.last_name || !p.date_of_birth) {
        alert('Please fill in all passenger details');
        return;
      }
    }

    setLoading(true);
    try {
      // Determine passenger types based on searchParams
      const adultCount = searchParams.passengers_adult || 1;
      const childCount = searchParams.passengers_child || 0;
      
      // Create booking - format to match backend schema
      const bookingResponse = await api.post('/api/flight/book', {
        trip_type: searchParams.trip_type || 'one_way',
        segments: [{
          schedule_id: schedule_id,
          passengers: passengers.map((p, idx) => ({
            title: p.title,
            first_name: p.first_name,
            last_name: p.last_name,
            gender: p.gender,
            date_of_birth: p.date_of_birth,
            nationality: p.nationality,
            passport_number: p.passport_number || '',
            seat_id: selectedSeats[idx]?.id,
            seat_number: selectedSeats[idx]?.seat_number,
            seat_class: searchParams.seat_class || 'economy',
            meal_preference: p.meal_preference || 'veg',
            passenger_type: idx < adultCount ? 'adult' : 'child'
          }))
        }],
        contact_name: contactDetails.name,
        contact_email: contactDetails.email,
        contact_phone: contactDetails.phone,
        payment_method: 'mock'
      });

      const booking = bookingResponse.data;
      const price = searchParams.seat_class === 'economy' ? flight.economy_price : flight.business_price;
      const totalAmount = price * passengers.length;

      // Navigate to payment
      navigate('/payment', {
        state: {
          bookingId: booking.booking_id,
          bookingRef: booking.booking_reference,
          bookingReference: booking.booking_reference,
          amount: booking.final_amount || totalAmount,
          serviceType: 'Flight',
          serviceDetails: {
            flight_number: flight.flight_number,
            airline: flight.airline_name,
            passengers: passengers.length,
            from: flight.origin_code,
            to: flight.destination_code,
            date: searchParams.departure_date,
            pnr: booking.pnr,
            booking_reference: booking.booking_reference
          }
        }
      });
    } catch (error) {
      console.error('Error creating booking:', error);
      alert('Failed to create booking. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (!flight) return null;

  const price = searchParams.seat_class === 'economy' ? flight.economy_price : flight.business_price;
  const totalAmount = price * passengers.length;

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50 py-8 px-4">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Flight Booking</h1>
          <div className="flex gap-4">
            {[1, 2, 3, 4].map(s => (
              <div key={s} className={`flex items-center gap-2 ${step >= s ? 'text-blue-600' : 'text-gray-400'}`}>
                <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold ${step >= s ? 'bg-blue-600 text-white' : 'bg-gray-300'}`}>
                  {s}
                </div>
                {s < 4 && <div className="h-1 w-8 bg-gray-300"></div>}
              </div>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Content */}
          <div className="lg:col-span-2">
            {/* Flight Summary */}
            <Card className="mb-6">
              <CardContent className="p-6">
                <div className="flex items-center gap-4">
                  {flight.airline_logo && (
                    <img src={flight.airline_logo} alt={flight.airline_name} className="w-12 h-12" />
                  )}
                  <div className="flex-1">
                    <h3 className="font-bold text-gray-900">{flight.flight_number}</h3>
                    <p className="text-gray-600">{flight.origin_code} → {flight.destination_code}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-gray-900">{flight.departure_time}</p>
                    <p className="text-gray-600">{searchParams.departure_date}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Step 1: Seat Selection */}
            {step === 1 && (
              <Card>
                <CardHeader>
                  <CardTitle>Select Seats</CardTitle>
                  <CardDescription>Choose {passengers.length} seat(s) for your flight</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  {/* Seat Legend */}
                  <div className="flex gap-4 flex-wrap">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 bg-blue-200 rounded"></div>
                      <span className="text-sm">Available</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 bg-green-500 rounded"></div>
                      <span className="text-sm">Selected</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 bg-red-500 rounded"></div>
                      <span className="text-sm">Booked</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 bg-purple-300 rounded"></div>
                      <span className="text-sm">Business</span>
                    </div>
                  </div>

                  {/* Seat Grid */}
                  <div className="bg-gray-50 p-6 rounded-lg overflow-x-auto">
                    <div className="inline-block">
                      {/* Group seats by row */}
                      {Object.values(
                        seatLayout.reduce((acc, seat) => {
                          acc[seat.row_number] = acc[seat.row_number] || [];
                          acc[seat.row_number].push(seat);
                          return acc;
                        }, {})
                      )
                        .sort((a, b) => a[0].row_number - b[0].row_number)
                        .map(row => (
                          <div key={row[0].row_number} className="flex gap-2 mb-3 items-center">
                            <span className="w-6 text-center text-sm font-medium text-gray-600">{row[0].row_number}</span>
                            {row
                              .sort((a, b) => a.column_letter.localeCompare(b.column_letter))
                              .map(seat => (
                                <button
                                  key={seat.id}
                                  onClick={() => selectSeat(seat)}
                                  disabled={seat.status !== 'available' && !selectedSeats.find(s => s.id === seat.id)}
                                  className={`w-8 h-8 rounded text-xs font-bold ${getSeatColor(seat)} ${
                                    seat.status !== 'available' && !selectedSeats.find(s => s.id === seat.id)
                                      ? 'cursor-not-allowed opacity-50'
                                      : 'cursor-pointer hover:opacity-80'
                                  }`}
                                  title={`${seat.seat_number} - ${seat.seat_type} - ₹${seat.price_modifier + price}`}
                                >
                                  {seat.column_letter}
                                </button>
                              ))}
                          </div>
                        ))}
                    </div>
                  </div>

                  <div className="text-right">
                    <p className="text-gray-600 mb-4">Selected: {selectedSeats.length}/{passengers.length} seats</p>
                    <Button
                      onClick={() => setStep(2)}
                      disabled={selectedSeats.length !== passengers.length}
                      className="bg-blue-600 hover:bg-blue-700"
                    >
                      Continue to Passengers
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Step 2: Passenger Details */}
            {step === 2 && (
              <Card>
                <CardHeader>
                  <CardTitle>Passenger Details</CardTitle>
                  <CardDescription>Enter details for all passengers</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  {passengers.map((passenger, idx) => (
                    <div key={idx} className="border rounded-lg p-4">
                      <h4 className="font-bold text-gray-900 mb-4">Passenger {idx + 1}</h4>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">Title</label>
                          <select
                            value={passenger.title}
                            onChange={(e) => handlePassengerChange(idx, 'title', e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                          >
                            <option>Mr</option>
                            <option>Mrs</option>
                            <option>Ms</option>
                            <option>Miss</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">First Name</label>
                          <input
                            type="text"
                            value={passenger.first_name}
                            onChange={(e) => handlePassengerChange(idx, 'first_name', e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                            required
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">Last Name</label>
                          <input
                            type="text"
                            value={passenger.last_name}
                            onChange={(e) => handlePassengerChange(idx, 'last_name', e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                            required
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">Gender</label>
                          <select
                            value={passenger.gender}
                            onChange={(e) => handlePassengerChange(idx, 'gender', e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                          >
                            <option value="M">Male</option>
                            <option value="F">Female</option>
                            <option value="O">Other</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">Date of Birth</label>
                          <input
                            type="date"
                            value={passenger.date_of_birth}
                            onChange={(e) => handlePassengerChange(idx, 'date_of_birth', e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                            required
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">Nationality</label>
                          <input
                            type="text"
                            value={passenger.nationality}
                            onChange={(e) => handlePassengerChange(idx, 'nationality', e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">Passport (if international)</label>
                          <input
                            type="text"
                            value={passenger.passport_number}
                            onChange={(e) => handlePassengerChange(idx, 'passport_number', e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">Meal Preference</label>
                          <select
                            value={passenger.meal_preference}
                            onChange={(e) => handlePassengerChange(idx, 'meal_preference', e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                          >
                            <option value="veg">Vegetarian</option>
                            <option value="non_veg">Non-Vegetarian</option>
                            <option value="vegan">Vegan</option>
                          </select>
                        </div>
                      </div>
                    </div>
                  ))}

                  {/* Contact Details */}
                  <div className="border-t pt-6">
                    <h4 className="font-bold text-gray-900 mb-4">Contact Information</h4>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">Full Name</label>
                        <input
                          type="text"
                          value={contactDetails.name}
                          onChange={(e) => setContactDetails({ ...contactDetails, name: e.target.value })}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                          required
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">Email</label>
                        <input
                          type="email"
                          value={contactDetails.email}
                          onChange={(e) => setContactDetails({ ...contactDetails, email: e.target.value })}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                          required
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">Phone</label>
                        <input
                          type="tel"
                          value={contactDetails.phone}
                          onChange={(e) => setContactDetails({ ...contactDetails, phone: e.target.value })}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                          required
                        />
                      </div>
                    </div>
                  </div>

                  <div className="flex gap-4">
                    <Button onClick={() => setStep(1)} variant="outline" className="flex-1">
                      Back
                    </Button>
                    <Button onClick={() => setStep(3)} className="flex-1 bg-blue-600 hover:bg-blue-700">
                      Review Booking
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Step 3: Review */}
            {step === 3 && (
              <Card>
                <CardHeader>
                  <CardTitle>Review Your Booking</CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div>
                    <h4 className="font-bold text-gray-900 mb-3">Passengers</h4>
                    <div className="space-y-2">
                      {passengers.map((p, idx) => (
                        <p key={idx} className="text-gray-700">
                          {idx + 1}. {p.title} {p.first_name} {p.last_name} - Seat: {selectedSeats[idx]?.seat_number}
                        </p>
                      ))}
                    </div>
                  </div>

                  <div>
                    <h4 className="font-bold text-gray-900 mb-3">Contact Details</h4>
                    <p className="text-gray-700">{contactDetails.name}</p>
                    <p className="text-gray-700">{contactDetails.email}</p>
                    <p className="text-gray-700">{contactDetails.phone}</p>
                  </div>

                  <div className="flex gap-4">
                    <Button onClick={() => setStep(2)} variant="outline" className="flex-1">
                      Back
                    </Button>
                    <Button
                      onClick={proceedToPayment}
                      disabled={loading}
                      className="flex-1 bg-blue-600 hover:bg-blue-700"
                    >
                      {loading ? 'Processing...' : 'Proceed to Payment'}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Sidebar: Price Breakdown */}
          <div>
            <Card className="sticky top-6">
              <CardHeader>
                <CardTitle>Price Breakdown</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex justify-between">
                  <span className="text-gray-600">Base Fare (x{passengers.length})</span>
                  <span className="font-medium">₹{(price * passengers.length).toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Seat Charges</span>
                  <span className="font-medium">₹{selectedSeats.reduce((sum, s) => sum + (s.price_modifier || 0), 0).toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Taxes & Fees</span>
                  <span className="font-medium">₹{Math.round(totalAmount * 0.05).toLocaleString()}</span>
                </div>
                <div className="border-t pt-4 flex justify-between">
                  <span className="font-bold text-gray-900">Total Amount</span>
                  <span className="text-2xl font-bold text-blue-600">
                    ₹{Math.round(totalAmount * 1.05).toLocaleString()}
                  </span>
                </div>

                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mt-6">
                  <div className="flex gap-2">
                    <CheckCircle className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
                    <div className="text-sm">
                      <p className="font-medium text-blue-900">Best Price Guarantee</p>
                      <p className="text-blue-800 text-xs mt-1">We guarantee the lowest fares. If you find a lower price, we&apos;ll match it!</p>
                    </div>
                  </div>
                </div>

                <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                  <div className="flex gap-2">
                    <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                    <div className="text-sm">
                      <p className="font-medium text-green-900">Refundable Booking</p>
                      <p className="text-green-800 text-xs mt-1">Cancel or modify your flight with full refund.</p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
};

export default FlightBooking;
