import React, { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import api from '../services/api';
import { Button } from '../components/ui/button';
import { Card } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { CheckCircle, IndianRupee, Mail, Phone, User, CreditCard, Zap, Plane, Bus } from 'lucide-react';

const Payment = () => {
  const navigate = useNavigate();
  const location = useLocation();
  let booking = location.state?.booking;
  const bookingId = location.state?.bookingId;
  const bookingRef = location.state?.bookingRef;
  const amount = location.state?.amount;
  const serviceType = location.state?.serviceType;
  const serviceDetails = location.state?.serviceDetails;

  const [form, setForm] = useState({
    fullName: '',
    email: '',
    phone: '',
    method: 'Card',
    credential: '', // Card Number or UPI ID or Wallet ID
    useSavedPayment: false,
  });
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [fullBooking, setFullBooking] = useState(booking);
  const [hasPaymentProfile, setHasPaymentProfile] = useState(false);
  const [defaultPaymentMethod, setDefaultPaymentMethod] = useState(null);
  const [paymentProfileDetails, setPaymentProfileDetails] = useState(null);

  const paymentAmount = useMemo(() => {
    if (amount) return amount; // Service booking amount
    if (fullBooking) return fullBooking.amount || fullBooking.total_price || 0; // Old trip booking amount
    return 0;
  }, [amount, fullBooking]);

  useEffect(() => {
    if (!booking && !bookingId) {
      // If user navigates directly without booking, redirect to Explore
      navigate('/explore');
      return;
    }

    // Fetch complete booking details if we only have bookingId
    if (bookingId && !booking) {
      const fetchBooking = async () => {
        try {
          const { data } = await api.get(`/api/bookings/${bookingId}`);
          setFullBooking(data);
        } catch (err) {
          console.error('Failed to fetch booking details:', err);
        }
      };
      fetchBooking();
    }

    // Check payment profile status
    const checkPaymentProfile = async () => {
      try {
        const response = await api.get('/api/payment-profile/status');
        if (response.data.is_payment_profile_completed) {
          setHasPaymentProfile(true);
          setDefaultPaymentMethod(response.data.default_method);
          setPaymentProfileDetails(response.data.profile);
          // Auto-select saved payment method
          setForm((prev) => ({ 
            ...prev, 
            method: response.data.default_method === 'bank' ? 'Bank' : 'UPI',
            useSavedPayment: true,
            credential: response.data.default_method === 'bank' ? 'Saved Bank Account' : 'Saved UPI ID'
          }));
        }
      } catch (err) {
        console.error('Failed to check payment profile:', err);
      }
    };
    checkPaymentProfile();
  }, [booking, bookingId, navigate]);

  const handleChange = (field) => (e) => {
    const value = e?.target ? e.target.value : e; // handles Select
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const validate = () => {
    if (!form.fullName.trim()) return 'Please enter full name';
    if (!form.email.trim() || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(form.email)) return 'Please enter a valid email';
    if (!form.phone.trim() || form.phone.length < 10) return 'Please enter a valid phone number';
    // Skip credential validation if using saved payment
    if (!form.useSavedPayment && !form.credential.trim()) return `Please enter ${form.method === 'Card' ? 'Card Number' : form.method === 'UPI' ? 'UPI ID' : 'Wallet ID'}`;
    return null;
  };

  const maskCredential = (value) => {
    if (form.method === 'Card') {
      const digits = value.replace(/\D/g, '');
      if (digits.length <= 4) return digits;
      return `${'*'.repeat(Math.max(0, digits.length - 4))}${digits.slice(-4)}`;
    }
    // For UPI/Wallet just partially mask username part
    const [id, domain] = value.split('@');
    if (!domain) return value.length <= 2 ? value : `${value.slice(0, 2)}***`;
    return `${id.slice(0, 2)}***@${domain}`;
  };

  const handleOneClickPay = async () => {
    setSubmitting(true);
    try {
      // First process the payment
      const paymentResponse = await api.post('/api/payments/mock', {
        booking_id: bookingId,
        service_type: serviceType,
        amount: paymentAmount,
        payment_method: defaultPaymentMethod
      });

      if (paymentResponse.data.status === 'completed') {
        // Now generate receipt like the regular flow
        const toIso = (val) => {
          if (!val) return undefined;
          const d = new Date(val);
          return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
        };
        const prune = (obj) => Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined && v !== ''));
        
        // Get user profile for receipt generation
        let userProfile = { fullName: '', email: '', phone: '' };
        try {
          const profileRes = await api.get('/api/auth/me');
          userProfile = {
            fullName: profileRes.data.name || profileRes.data.username || '',
            email: profileRes.data.email || '',
            phone: profileRes.data.phone || ''
          };
        } catch (e) {
          console.error('Could not fetch profile for receipt:', e);
        }

        const payload = prune({
          booking_ref: bookingRef,
          destination: serviceDetails?.destination || '',
          start_date: toIso(serviceDetails?.checkIn || serviceDetails?.travelDate || serviceDetails?.reservationDate),
          end_date: toIso(serviceDetails?.checkOut),
          travelers: serviceDetails?.travelers || serviceDetails?.guests || 1,
          full_name: userProfile.fullName,
          email: userProfile.email,
          phone: userProfile.phone,
          method: defaultPaymentMethod === 'upi' ? 'UPI' : 'Bank',
          credential: `Saved ${defaultPaymentMethod === 'upi' ? 'UPI' : 'Bank Account'}`,
          amount: Number(paymentAmount) || 0,
        });

        try {
          const res = await api.post('/api/payment/confirm', payload);
          setSuccess(true);
          
          // Navigate based on service type
          if (serviceType === 'Flight') {
            navigate(`/flight-ticket?ref=${serviceDetails?.pnr || bookingRef}`, { 
              state: { 
                bookingRef: serviceDetails?.pnr || bookingRef,
                payment: res.data
              } 
            });
          } else if (serviceType === 'Bus') {
            navigate(`/bus-ticket?ref=${bookingRef}`, { 
              state: { 
                bookingRef: bookingRef,
                payment: res.data
              } 
            });
          } else {
            navigate('/receipt', { 
              state: { 
                receiptUrl: res.data.receipt_url, 
                ticketUrl: res.data.ticket_url,
                bookingRef: res.data.booking_ref, 
                booking: {
                  ...fullBooking,
                  booking_ref: res.data.booking_ref,
                  service_details: serviceDetails,
                  service_type: serviceType
                },
                payer: { 
                  fullName: userProfile.fullName,
                  email: userProfile.email,
                  phone: userProfile.phone,
                  method: defaultPaymentMethod === 'upi' ? 'UPI' : 'Bank',
                  credential: `Saved ${defaultPaymentMethod === 'upi' ? 'UPI' : 'Bank Account'}`
                },
                payment: res.data,
                serviceType,
                serviceDetails
              } 
            });
          }
        } catch (receiptError) {
          // Payment succeeded but receipt generation failed - still navigate to ticket
          console.error('Receipt generation failed, redirecting to ticket:', receiptError);
          setSuccess(true);
          setTimeout(() => {
            if (serviceType === 'Flight') {
              navigate(`/flight-ticket?ref=${serviceDetails?.pnr || bookingRef}`);
            } else {
              navigate(`/ticket/${bookingId}`);
            }
          }, 1500);
        }
      }
    } catch (error) {
      console.error('Payment failed:', error);
      alert(error.response?.data?.detail || 'Payment failed. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const handlePayNow = async (e) => {
    e.preventDefault();
    const err = validate();
    if (err) {
      alert(err);
      return;
    }
    setSubmitting(true);

    // Try backend receipt generation first
    try {
      // Helpers to safely serialize optional dates to ISO 8601 (omit if invalid)
      const toIso = (val) => {
        if (!val) return undefined;
        const d = new Date(val);
        return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
      };

      const prune = (obj) => Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined && v !== ''));

      // Prepare payload for service bookings or trip bookings
      const payload = bookingRef ? prune({
        // Service booking (flight/hotel/restaurant)
        booking_ref: bookingRef,
        destination: serviceDetails?.destination || '',
        start_date: toIso(serviceDetails?.checkIn || serviceDetails?.travelDate || serviceDetails?.reservationDate),
        end_date: toIso(serviceDetails?.checkOut),
        travelers: serviceDetails?.travelers || serviceDetails?.guests || 1,
        full_name: form.fullName,
        email: form.email,
        phone: form.phone,
        method: form.method,
        credential: form.credential,
        amount: Number(paymentAmount) || 0,
      }) : prune({
        // Old trip booking format
        booking_ref: fullBooking?.booking_ref || booking?.booking_ref,
        destination: fullBooking?.destination || booking?.destination,
        start_date: toIso(fullBooking?.start_date || booking?.start_date),
        end_date: toIso(fullBooking?.end_date || booking?.end_date),
        travelers: fullBooking?.travelers || booking?.travelers,
        full_name: form.fullName,
        email: form.email,
        phone: form.phone,
        method: form.method,
        credential: form.credential,
        amount: Number(paymentAmount) || 0,
      });

  const res = await api.post('/api/payment/confirm', payload);
      setSuccess(true);
      setSubmitting(false);
      
      // Navigate based on service type
      if (serviceType === 'Flight') {
        navigate(`/flight-ticket?ref=${serviceDetails?.pnr || bookingRef}`, { 
          state: { 
            bookingRef: serviceDetails?.pnr || bookingRef,
            payment: res.data
          } 
        });
      } else if (serviceType === 'Bus') {
        navigate(`/bus-ticket?ref=${bookingRef}`, { 
          state: { 
            bookingRef: bookingRef,
            payment: res.data
          } 
        });
      } else {
        navigate('/receipt', { 
          state: { 
            receiptUrl: res.data.receipt_url, 
            ticketUrl: res.data.ticket_url,
            bookingRef: res.data.booking_ref, 
            booking: {
              ...fullBooking,
              ...booking,
              booking_ref: res.data.booking_ref,
              service_details: serviceDetails,
              service_type: serviceType,
              amount: paymentAmount,
              total_price: paymentAmount
            },
            payer: { ...form },
            payment: {
              ...res.data,
              amount: paymentAmount,
              method: form.method
            },
            serviceType,
            serviceDetails,
            amount: paymentAmount
          } 
        });
      }
      return;
    } catch (err) {
      console.error('Payment confirm failed:', err?.response?.status, err?.response?.data || err?.message);
      setSubmitting(false);
      alert(`Payment failed to confirm on server. ${err?.response?.data?.detail || ''}`.trim());
      return;
    }
  };

  const methodLabel = form.method === 'Card' ? 'Card Number' : form.method === 'UPI' ? 'UPI ID' : 'Wallet ID';
  const methodPlaceholder = form.method === 'Card' ? '1234-5678-9012-3456' : form.method === 'UPI' ? 'name@upi' : 'Paytm / PhonePe ID';

  return (
    <div className="min-h-screen pt-24 pb-16 bg-gradient-to-b from-gray-50 to-white">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mb-8 text-center space-y-2">
          <h1 className="text-4xl md:text-5xl font-bold bg-gradient-to-r from-[#0077b6] to-[#48cae4] bg-clip-text text-transparent">Payment</h1>
          <p className="text-gray-600">Securely complete your booking payment</p>
        </div>

        {/* Summary Card */}
        {(booking || bookingRef) && (
          <Card className="mb-8 p-6 bg-gradient-to-br from-blue-50 to-cyan-50 border-0">
            {/* Flight-specific Summary */}
            {serviceType === 'Flight' && serviceDetails && (
              <div className="space-y-4">
                <div className="flex items-center gap-3 mb-4">
                  <div className="bg-blue-600 p-2 rounded-lg">
                    <Plane className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <h3 className="font-bold text-lg text-gray-900">{serviceDetails.airline}</h3>
                    <p className="text-sm text-gray-600">Flight {serviceDetails.flight_number}</p>
                  </div>
                </div>
                <div className="flex items-center justify-between bg-white/60 rounded-xl p-4">
                  <div className="text-center">
                    <p className="text-3xl font-bold text-gray-900">{serviceDetails.from}</p>
                    <p className="text-sm text-gray-500">Origin</p>
                  </div>
                  <div className="flex-1 flex items-center justify-center px-4">
                    <div className="flex items-center gap-2">
                      <div className="h-px w-12 bg-gray-300"></div>
                      <Plane className="w-5 h-5 text-blue-600 rotate-90" />
                      <div className="h-px w-12 bg-gray-300"></div>
                    </div>
                  </div>
                  <div className="text-center">
                    <p className="text-3xl font-bold text-gray-900">{serviceDetails.to}</p>
                    <p className="text-sm text-gray-500">Destination</p>
                  </div>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div>
                    <p className="text-xs text-gray-500">Travel Date</p>
                    <p className="font-semibold">{serviceDetails.date}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">Passengers</p>
                    <p className="font-semibold">{serviceDetails.passengers}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">PNR</p>
                    <p className="font-mono font-bold text-blue-600">{serviceDetails.pnr}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">Total Amount</p>
                    <p className="text-xl font-bold text-blue-600">₹{Number(paymentAmount).toLocaleString()}</p>
                  </div>
                </div>
              </div>
            )}
            
            {/* Generic Service Summary (non-flight) */}
            {serviceType !== 'Flight' && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {serviceType && (
                  <div>
                    <p className="text-sm text-gray-600">Service Type</p>
                    <p className="text-lg font-bold text-[#0077b6]">{serviceType}</p>
                  </div>
                )}
                <div>
                  <p className="text-sm text-gray-600">Booking Ref</p>
                  <p className="text-lg font-bold text-[#0077b6]">{bookingRef || booking?.booking_ref}</p>
                </div>
                {(serviceDetails?.destination || booking?.destination) && (
                  <div>
                    <p className="text-sm text-gray-600">Destination</p>
                    <p className="font-semibold">{serviceDetails?.destination || booking?.destination}</p>
                  </div>
                )}
                {(serviceDetails?.checkIn || booking?.start_date) && (
                  <div>
                    <p className="text-sm text-gray-600">
                      {serviceType === 'Hotel' ? 'Check-in / Check-out' : 
                       serviceType === 'Restaurant' ? 'Reservation Date' : 
                       'Travel Date'}
                    </p>
                    <p className="font-semibold">
                      {serviceType === 'Hotel' 
                        ? `${serviceDetails?.checkIn} to ${serviceDetails?.checkOut}`
                        : serviceType === 'Restaurant'
                        ? `${serviceDetails?.reservationDate} at ${serviceDetails?.timeSlot}`
                        : `${booking?.start_date ? new Date(booking.start_date).toLocaleDateString() : '-'} to ${booking?.end_date ? new Date(booking.end_date).toLocaleDateString() : '-'}`
                      }
                    </p>
                  </div>
                )}
                <div>
                  <p className="text-sm text-gray-600">Amount</p>
                  <p className="text-[#0077b6] font-bold text-lg">₹{Number(paymentAmount).toLocaleString()}</p>
                </div>
              </div>
            )}
          </Card>
        )}

        {/* Payment Form */}
        <Card className="p-6 space-y-5">
          {hasPaymentProfile && (
            <div className="p-4 bg-gradient-to-r from-green-50 to-emerald-50 border border-green-200 rounded-lg">
              <div className="flex items-center gap-3 mb-3">
                <Zap className="w-5 h-5 text-green-600" />
                <h3 className="font-bold text-green-900">Verified Payment Method</h3>
              </div>
              <p className="text-sm text-green-800 mb-4">
                Your KYC-verified {defaultPaymentMethod === 'upi' ? 'UPI' : 'bank account'} is ready. Pay instantly with one click.
              </p>
              <Button
                onClick={handleOneClickPay}
                disabled={submitting}
                className="w-full bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 text-white h-12 text-lg font-semibold"
              >
                {submitting ? 'Processing...' : `Pay ₹${Number(paymentAmount).toLocaleString()} with Saved ${defaultPaymentMethod === 'upi' ? 'UPI' : 'Bank Account'}`}
              </Button>
              <div className="text-center text-sm text-gray-600 mt-3">or use different payment method below</div>
            </div>
          )}

          <form onSubmit={handlePayNow} className="space-y-5">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div className="space-y-2">
                <Label className="flex items-center gap-2"><User className="w-4 h-4 text-[#0077b6]" /> Full Name</Label>
                <Input value={form.fullName} onChange={handleChange('fullName')} placeholder="John Doe" />
              </div>
              <div className="space-y-2">
                <Label className="flex items-center gap-2"><Mail className="w-4 h-4 text-[#0077b6]" /> Email</Label>
                <Input value={form.email} onChange={handleChange('email')} placeholder="john@gmail.com" />
              </div>
              <div className="space-y-2">
                <Label className="flex items-center gap-2"><Phone className="w-4 h-4 text-[#0077b6]" /> Phone Number</Label>
                <Input type="tel" value={form.phone} onChange={handleChange('phone')} placeholder="9876543210" />
              </div>
              {(!hasPaymentProfile || !form.useSavedPayment) && (
                <div className="space-y-2">
                  <Label>Payment Method</Label>
                  <Select value={form.method} onValueChange={handleChange('method')}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Card">Card</SelectItem>
                      <SelectItem value="UPI">UPI</SelectItem>
                      <SelectItem value="Wallet">Wallet</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>

            {(!hasPaymentProfile || !form.useSavedPayment) && (
              <div className="space-y-2">
                <Label>{methodLabel}</Label>
                <Input value={form.credential} onChange={handleChange('credential')} placeholder={methodPlaceholder} />
              </div>
            )}

            <div className="space-y-2">
              <Label className="flex items-center gap-2"><IndianRupee className="w-4 h-4 text-[#0077b6]" /> Amount</Label>
              <Input readOnly value={`₹${Number(paymentAmount).toLocaleString()}`} />
            </div>

            <div className="pt-2">
              <Button type="submit" disabled={submitting} className="w-full h-12 bg-gradient-to-r from-[#0077b6] to-[#48cae4] text-white text-lg font-semibold rounded-lg">
                {submitting ? 'Processing…' : 'Pay Now'}
              </Button>
            </div>
          </form>

          {success && (
            <div className="mt-6 p-4 rounded-lg border border-green-200 bg-green-50 flex items-start gap-3">
              <CheckCircle className="w-6 h-6 text-green-600 mt-0.5" />
              <div>
                <p className="font-semibold text-green-700">Payment Successful</p>
                <p className="text-sm text-green-700/80">Your payment has been confirmed. A PDF receipt has been downloaded.</p>
              </div>
            </div>
          )}
        </Card>

        <div className="mt-6 flex gap-3">
          <Button variant="outline" onClick={() => navigate('/explore')}>Back to Explore</Button>
          <Button onClick={() => navigate('/')}>Go Home</Button>
        </div>
      </div>
    </div>
  );
};

export default Payment;
