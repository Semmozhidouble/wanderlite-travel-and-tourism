import React, { useState } from 'react';
import { Card } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { CreditCard, Lock, CheckCircle } from 'lucide-react';
import api from '../services/api';

const PaymentProfileForm = ({ onSuccess }) => {
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    account_holder_name: '',
    bank_name: '',
    account_number: '',
    ifsc: '',
    upi: '',
    default_method: 'bank',
  });

  const updateField = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const canSubmit = () => {
    return formData.account_holder_name && 
           formData.bank_name && 
           formData.account_number && 
           formData.ifsc;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const response = await api.post('/api/payment-profile', formData);
      
      if (response.data.is_payment_profile_completed) {
        onSuccess && onSuccess();
      }
    } catch (error) {
      console.error('Payment profile submission failed:', error);
      alert(error.response?.data?.detail || 'Failed to save payment profile. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto">
      <Card className="p-6 md:p-8 shadow-lg border-0 bg-white">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center">
            <CreditCard className="w-6 h-6 text-green-600" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Payment Profile</h2>
            <p className="text-sm text-gray-600">Save your bank details for quick checkout</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label>Account Holder Name</Label>
            <Input
              value={formData.account_holder_name}
              onChange={(e) => updateField('account_holder_name', e.target.value)}
              placeholder="John Doe"
              required
            />
          </div>

          <div>
            <Label>Bank Name</Label>
            <Input
              value={formData.bank_name}
              onChange={(e) => updateField('bank_name', e.target.value)}
              placeholder="State Bank of India"
              required
            />
          </div>

          <div>
            <Label>Account Number</Label>
            <Input
              type="password"
              value={formData.account_number}
              onChange={(e) => updateField('account_number', e.target.value)}
              placeholder="Enter account number"
              required
            />
            <p className="text-xs text-gray-500 mt-1">
              Your account number will be encrypted and stored securely
            </p>
          </div>

          <div>
            <Label>IFSC Code</Label>
            <Input
              value={formData.ifsc}
              onChange={(e) => updateField('ifsc', e.target.value.toUpperCase())}
              placeholder="SBIN0001234"
              required
            />
          </div>

          <div>
            <Label>UPI ID (Optional)</Label>
            <Input
              value={formData.upi}
              onChange={(e) => updateField('upi', e.target.value)}
              placeholder="username@upi"
            />
          </div>

          <div>
            <Label>Default Payment Method</Label>
            <Select value={formData.default_method} onValueChange={(val) => updateField('default_method', val)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="bank">Bank Account</SelectItem>
                <SelectItem value="upi">UPI</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <Lock className="w-5 h-5 text-amber-600 mt-0.5" />
              <div className="text-sm text-amber-800">
                <strong>Security Notice:</strong> Your bank details are encrypted using AES-256-GCM encryption 
                and stored securely. We never share your payment information with third parties.
              </div>
            </div>
          </div>

          <Button 
            type="submit"
            className="w-full bg-gradient-to-r from-green-600 to-emerald-600 text-white h-12"
            disabled={!canSubmit() || loading}
          >
            {loading ? 'Saving...' : 'Save Payment Profile'}
          </Button>
        </form>
      </Card>
    </div>
  );
};

export default PaymentProfileForm;
