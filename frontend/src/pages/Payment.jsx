import React, { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { Button } from '../components/ui/button';
import { Card } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { jsPDF } from 'jspdf';
import { CheckCircle, IndianRupee, Mail, Phone, User } from 'lucide-react';

const Payment = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const booking = location.state?.booking;

  const [form, setForm] = useState({
    fullName: '',
    email: '',
    phone: '',
    method: 'Card',
    credential: '', // Card Number or UPI ID or Wallet ID
  });
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  const amount = useMemo(() => {
    if (!booking) return 0;
    return booking.total_price || 0;
  }, [booking]);

  useEffect(() => {
    if (!booking) {
      // If user navigates directly without booking, redirect to Explore
      navigate('/explore');
    }
  }, [booking, navigate]);

  const handleChange = (field) => (e) => {
    const value = e?.target ? e.target.value : e; // handles Select
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const validate = () => {
    if (!form.fullName.trim()) return 'Please enter full name';
    if (!form.email.trim() || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(form.email)) return 'Please enter a valid email';
    if (!form.phone.trim() || form.phone.length < 10) return 'Please enter a valid phone number';
    if (!form.credential.trim()) return `Please enter ${form.method === 'Card' ? 'Card Number' : form.method === 'UPI' ? 'UPI ID' : 'Wallet ID'}`;
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
      const payload = {
        booking_ref: booking?.booking_ref,
        destination: booking?.destination,
        start_date: booking?.start_date,
        end_date: booking?.end_date,
        travelers: booking?.travelers,
        full_name: form.fullName,
        email: form.email,
        phone: form.phone,
        method: form.method,
        credential: form.credential,
        amount: Number(amount) || 0,
      };

      const res = await axios.post('/api/payment/confirm', payload);
      setSuccess(true);
      setSubmitting(false);
      navigate('/receipt', { state: { receiptUrl: res.data.receipt_url, bookingRef: res.data.booking_ref, booking, payer: { ...form } } });
      return;
    } catch (err) {
      // Fallback: local PDF generation
      try {
        const doc = new jsPDF();
        doc.setFillColor(0, 119, 182);
        doc.rect(0, 0, 210, 35, 'F');
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(20);
        doc.text('WanderLite', 14, 20);
        doc.setFontSize(12);
        doc.text('Payment Receipt', 170, 20, { align: 'right' });
        doc.setTextColor(0, 0, 0);
        doc.setFontSize(12);
        let y = 50;
        const lines = [
          ['Receipt No.:', booking?.booking_ref || 'WL-XXXX-XXXX'],
          ['Date:', new Date().toLocaleString()],
          ['Destination:', booking?.destination || '-'],
          ['Travel Dates:', `${booking?.start_date ? new Date(booking.start_date).toLocaleDateString() : '-'} to ${booking?.end_date ? new Date(booking.end_date).toLocaleDateString() : '-'}`],
          ['Travelers:', String(booking?.travelers ?? '-')],
          ['Name:', form.fullName],
          ['Email:', form.email],
          ['Phone:', form.phone],
          ['Payment Method:', form.method],
          [form.method === 'Card' ? 'Card (masked):' : form.method === 'UPI' ? 'UPI ID:' : 'Wallet ID:', maskCredential(form.credential)],
          ['Amount Paid:', `₹${Number(amount).toLocaleString()}`],
          ['Status:', 'SUCCESS'],
        ];
        lines.forEach(([label, value]) => {
          doc.setFont(undefined, 'bold');
          doc.text(label, 20, y);
          doc.setFont(undefined, 'normal');
          doc.text(String(value), 85, y);
          y += 9;
        });
        y += 8;
        doc.setFontSize(10);
        doc.setTextColor(100, 100, 100);
        doc.text('This is a system-generated receipt for a simulated payment.', 105, y, { align: 'center' });
        doc.text('For assistance contact support@wanderlite.com', 105, y + 6, { align: 'center' });
        doc.save(`WanderLite_Receipt_${booking?.booking_ref || 'WL'}.pdf`);
      } catch (_) { /* ignore */ }
      setSuccess(true);
      setSubmitting(false);
      navigate('/receipt', { state: { receiptUrl: null, bookingRef: booking?.booking_ref || 'WL', booking, payer: { ...form } } });
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
        {booking && (
          <Card className="mb-8 p-6 bg-gradient-to-br from-blue-50 to-cyan-50 border-0">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-gray-600">Booking Ref</p>
                <p className="text-lg font-bold text-[#0077b6]">{booking.booking_ref}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Destination</p>
                <p className="font-semibold">{booking.destination}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Travel Dates</p>
                <p className="font-semibold">{booking.start_date ? new Date(booking.start_date).toLocaleDateString() : '-'} to {booking.end_date ? new Date(booking.end_date).toLocaleDateString() : '-'}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Amount</p>
                <p className="text-[#0077b6] font-bold text-lg">₹{Number(amount).toLocaleString()}</p>
              </div>
            </div>
          </Card>
        )}

        {/* Payment Form */}
        <Card className="p-6 space-y-5">
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
            </div>

            <div className="space-y-2">
              <Label>{methodLabel}</Label>
              <Input value={form.credential} onChange={handleChange('credential')} placeholder={methodPlaceholder} />
            </div>

            <div className="space-y-2">
              <Label className="flex items-center gap-2"><IndianRupee className="w-4 h-4 text-[#0077b6]" /> Amount</Label>
              <Input readOnly value={`₹${Number(amount).toLocaleString()}`} />
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
