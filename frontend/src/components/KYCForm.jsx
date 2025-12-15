import React, { useState } from 'react';
import { Card } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Upload, CheckCircle, User, FileText, Home, CreditCard } from 'lucide-react';
import api from '../services/api';

const KYCForm = ({ onSuccess }) => {
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    full_name: '',
    dob: '',
    gender: '',
    nationality: 'Indian',
    id_type: '',
    id_number: '',
    address_line: '',
    city: '',
    state: '',
    country: 'India',
    pincode: '',
  });
  
  const [files, setFiles] = useState({
    id_proof_front: null,
    id_proof_back: null,
    selfie: null,
  });

  const updateField = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleFileChange = (field, file) => {
    setFiles(prev => ({ ...prev, [field]: file }));
  };

  const canProceed = () => {
    switch (step) {
      case 1:
        return formData.full_name && formData.dob && formData.gender && formData.nationality;
      case 2:
        return formData.id_type && formData.id_number;
      case 3:
        return formData.address_line && formData.city && formData.state && formData.country && formData.pincode;
      default:
        return true;
    }
  };

  const handleSubmit = async () => {
    setLoading(true);
    try {
      const payload = new FormData();
      
      // Append all form fields
      Object.keys(formData).forEach(key => {
        payload.append(key, formData[key]);
      });
      
      // Append files if present
      if (files.id_proof_front) {
        payload.append('id_proof_front', files.id_proof_front);
      }
      if (files.id_proof_back) {
        payload.append('id_proof_back', files.id_proof_back);
      }
      if (files.selfie) {
        payload.append('selfie', files.selfie);
      }

      // Don't set Content-Type header - browser will set it with boundary for multipart
      const response = await api.post('/api/kyc', payload);

      // KYC submitted successfully - now pending admin verification
      if (response.data.status === 'pending') {
        alert('KYC submitted successfully! Your verification is pending admin review. You will be notified once approved.');
        onSuccess && onSuccess();
      } else if (response.data.is_kyc_completed) {
        onSuccess && onSuccess();
      }
    } catch (error) {
      console.error('KYC submission failed:', error);
      alert(error.response?.data?.detail || 'Failed to submit KYC. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const progress = (step / 4) * 100;

  return (
    <div className="max-w-3xl mx-auto">
      {/* Progress Bar */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium text-gray-700">Complete Your KYC</span>
          <span className="text-sm text-gray-500">{step} of 4</span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-2">
          <div 
            className="bg-gradient-to-r from-blue-600 to-indigo-600 h-2 rounded-full transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* Step 1: Personal Details */}
      {step === 1 && (
        <Card className="p-6 md:p-8 shadow-lg border-0 bg-white">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center">
              <User className="w-6 h-6 text-blue-600" />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-gray-900">Personal Details</h2>
              <p className="text-sm text-gray-600">Enter your details as per ID proof</p>
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <Label>Full Name (as per ID)</Label>
              <Input
                value={formData.full_name}
                onChange={(e) => updateField('full_name', e.target.value)}
                placeholder="John Doe"
              />
            </div>
            <div>
              <Label>Date of Birth</Label>
              <Input
                type="date"
                value={formData.dob}
                onChange={(e) => updateField('dob', e.target.value)}
              />
            </div>
            <div>
              <Label>Gender</Label>
              <Select value={formData.gender} onValueChange={(val) => updateField('gender', val)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select gender" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="male">Male</SelectItem>
                  <SelectItem value="female">Female</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Nationality</Label>
              <Input
                value={formData.nationality}
                onChange={(e) => updateField('nationality', e.target.value)}
              />
            </div>
          </div>
        </Card>
      )}

      {/* Step 2: ID Verification */}
      {step === 2 && (
        <Card className="p-6 md:p-8 shadow-lg border-0 bg-white">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-12 h-12 rounded-full bg-purple-100 flex items-center justify-center">
              <FileText className="w-6 h-6 text-purple-600" />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-gray-900">ID Verification</h2>
              <p className="text-sm text-gray-600">Upload your government ID proof</p>
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <Label>Select ID Type</Label>
              <Select value={formData.id_type} onValueChange={(val) => updateField('id_type', val)}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose ID type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="aadhaar">Aadhaar Card</SelectItem>
                  <SelectItem value="passport">Passport</SelectItem>
                  <SelectItem value="voterid">Voter ID</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>ID Number</Label>
              <Input
                value={formData.id_number}
                onChange={(e) => updateField('id_number', e.target.value)}
                placeholder="Enter ID number"
              />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label>Upload ID Front</Label>
                <div className="mt-2">
                  <label className="flex items-center justify-center w-full h-32 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:border-blue-500 transition">
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => handleFileChange('id_proof_front', e.target.files[0])}
                    />
                    {files.id_proof_front ? (
                      <div className="text-center">
                        <CheckCircle className="w-8 h-8 text-green-600 mx-auto mb-2" />
                        <span className="text-sm text-gray-700">{files.id_proof_front.name}</span>
                      </div>
                    ) : (
                      <div className="text-center">
                        <Upload className="w-8 h-8 text-gray-400 mx-auto mb-2" />
                        <span className="text-sm text-gray-500">Click to upload</span>
                      </div>
                    )}
                  </label>
                </div>
              </div>
              <div>
                <Label>Upload ID Back</Label>
                <div className="mt-2">
                  <label className="flex items-center justify-center w-full h-32 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:border-blue-500 transition">
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => handleFileChange('id_proof_back', e.target.files[0])}
                    />
                    {files.id_proof_back ? (
                      <div className="text-center">
                        <CheckCircle className="w-8 h-8 text-green-600 mx-auto mb-2" />
                        <span className="text-sm text-gray-700">{files.id_proof_back.name}</span>
                      </div>
                    ) : (
                      <div className="text-center">
                        <Upload className="w-8 h-8 text-gray-400 mx-auto mb-2" />
                        <span className="text-sm text-gray-500">Click to upload</span>
                      </div>
                    )}
                  </label>
                </div>
              </div>
            </div>
          </div>
        </Card>
      )}

      {/* Step 3: Address */}
      {step === 3 && (
        <Card className="p-6 md:p-8 shadow-lg border-0 bg-white">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center">
              <Home className="w-6 h-6 text-green-600" />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-gray-900">Address Details</h2>
              <p className="text-sm text-gray-600">Enter your current residential address</p>
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <Label>Address Line</Label>
              <Input
                value={formData.address_line}
                onChange={(e) => updateField('address_line', e.target.value)}
                placeholder="House no, Street, Area"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>City</Label>
                <Input
                  value={formData.city}
                  onChange={(e) => updateField('city', e.target.value)}
                />
              </div>
              <div>
                <Label>State</Label>
                <Input
                  value={formData.state}
                  onChange={(e) => updateField('state', e.target.value)}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Country</Label>
                <Input
                  value={formData.country}
                  onChange={(e) => updateField('country', e.target.value)}
                />
              </div>
              <div>
                <Label>Pincode</Label>
                <Input
                  value={formData.pincode}
                  onChange={(e) => updateField('pincode', e.target.value)}
                  placeholder="110001"
                />
              </div>
            </div>
          </div>
        </Card>
      )}

      {/* Step 4: Review */}
      {step === 4 && (
        <Card className="p-6 md:p-8 shadow-lg border-0 bg-white">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-12 h-12 rounded-full bg-amber-100 flex items-center justify-center">
              <CheckCircle className="w-6 h-6 text-amber-600" />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-gray-900">Review & Submit</h2>
              <p className="text-sm text-gray-600">Verify your information before submission</p>
            </div>
          </div>

          <div className="space-y-4 mb-6">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div className="text-gray-600">Full Name:</div>
              <div className="font-semibold">{formData.full_name}</div>
              
              <div className="text-gray-600">Date of Birth:</div>
              <div className="font-semibold">{formData.dob}</div>
              
              <div className="text-gray-600">Gender:</div>
              <div className="font-semibold capitalize">{formData.gender}</div>
              
              <div className="text-gray-600">ID Type:</div>
              <div className="font-semibold capitalize">{formData.id_type}</div>
              
              <div className="text-gray-600">Address:</div>
              <div className="font-semibold">{formData.address_line}, {formData.city}</div>
            </div>
          </div>

          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
            <p className="text-sm text-blue-800">
              ℹ️ <strong>Demo Mode:</strong> Your KYC will be automatically verified for demonstration purposes. 
              In production, this would require manual verification.
            </p>
          </div>
        </Card>
      )}

      {/* Navigation Buttons */}
      <div className="flex justify-between mt-6">
        {step > 1 && (
          <Button 
            variant="outline" 
            onClick={() => setStep(step - 1)}
            disabled={loading}
          >
            Previous
          </Button>
        )}
        {step < 4 ? (
          <Button 
            className="ml-auto bg-gradient-to-r from-blue-600 to-indigo-600 text-white"
            onClick={() => setStep(step + 1)}
            disabled={!canProceed()}
          >
            Next
          </Button>
        ) : (
          <Button 
            className="ml-auto bg-gradient-to-r from-green-600 to-emerald-600 text-white"
            onClick={handleSubmit}
            disabled={loading}
          >
            {loading ? 'Submitting...' : 'Submit & Verify KYC'}
          </Button>
        )}
      </div>
    </div>
  );
};

export default KYCForm;
