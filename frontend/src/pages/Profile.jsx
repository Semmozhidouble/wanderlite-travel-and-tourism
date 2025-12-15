import React, { useEffect, useState } from 'react';
import api from '../services/api';
import { Card } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Switch } from '../components/ui/switch';
import { useAuth } from '../contexts/AuthContext';
import { Camera, Save, X, Edit3, Trash2, ShieldCheck, CreditCard, AlertCircle, Receipt } from 'lucide-react';
import KYCForm from '../components/KYCForm';
import PaymentProfileForm from '../components/PaymentProfileForm';

const Profile = () => {
  const { logout } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [trips, setTrips] = useState([]);
  const [editMode, setEditMode] = useState(false);
  const [preview, setPreview] = useState(null);
  const [showKYC, setShowKYC] = useState(false);
  const [showPayment, setShowPayment] = useState(false);
  const [transactions, setTransactions] = useState([]);
  const [profile, setProfile] = useState({
    id: '', email: '', username: '', name: '', phone: '', profile_image: '',
    favorite_travel_type: '', preferred_budget_range: '', climate_preference: '',
    food_preference: '', language_preference: '', notifications_enabled: 1,
    is_kyc_completed: false,
    payment_profile_completed: false,
  });

  const travelTypes = ['Adventure', 'Beach', 'Heritage', 'Urban', 'Nature'];
  const budgetRanges = ['₹20k–₹50k', '₹50k–₹100k', '₹100k–₹200k'];
  const climates = ['Cool', 'Warm', 'Moderate'];
  const foods = ['Veg', 'Non-Veg', 'Vegan'];
  const languages = ['English', 'Hindi', 'Tamil', 'Telugu', 'Malayalam'];

  useEffect(() => {
    const init = async () => {
      try {
        const me = await api.get('/api/auth/me');
        setProfile((p) => ({ ...p, ...me.data }));
        const t = await api.get('/api/trips');
        setTrips(t.data || []);
        
        // Fetch transactions if KYC completed
        if (me.data.is_kyc_completed) {
          const trans = await api.get('/api/transactions');
          setTransactions(trans.data || []);
        }
      } catch (e) {
        console.error('Failed to load profile', e);
      } finally {
        setLoading(false);
      }
    };
    init();
  }, []);

  const onFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    // preview
    const reader = new FileReader();
    reader.onload = () => setPreview(reader.result);
    reader.readAsDataURL(file);
    // upload
    const form = new FormData();
    form.append('file', file);
    try {
      const resp = await api.post('/api/profile/avatar', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setProfile((p) => ({ ...p, profile_image: resp.data.image_url }));
    } catch (err) {
      console.error('Image upload failed', err);
      alert('Image upload failed');
    }
  };

  const saveProfile = async () => {
    setSaving(true);
    try {
      const payload = {
        name: profile.name,
        username: profile.username,
        phone: profile.phone,
        favorite_travel_type: profile.favorite_travel_type,
        preferred_budget_range: profile.preferred_budget_range,
        climate_preference: profile.climate_preference,
        food_preference: profile.food_preference,
        language_preference: profile.language_preference,
        notifications_enabled: !!profile.notifications_enabled,
      };
      const resp = await api.put('/api/profile', payload);
      setProfile((p) => ({ ...p, ...resp.data }));
      setEditMode(false);
    } catch (e) {
      console.error('Failed to save profile', e);
      alert('Failed to save profile');
    } finally {
      setSaving(false);
    }
  };

  const deleteAccount = async () => {
    if (!window.confirm('Are you sure you want to delete your account? This cannot be undone.')) return;
    try {
      await api.delete('/api/auth/account');
      logout();
    } catch (e) {
      console.error('Delete account failed', e);
      alert('Delete account failed');
    }
  };

  const handleKYCSuccess = async () => {
    setShowKYC(false);
    const me = await api.get('/api/auth/me');
    setProfile((p) => ({ ...p, ...me.data }));
  };

  const handlePaymentSuccess = async () => {
    setShowPayment(false);
    const me = await api.get('/api/auth/me');
    setProfile((p) => ({ ...p, ...me.data }));
  };

  if (loading) {
    return (
      <div className="min-h-screen pt-24 pb-16 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#31A8E0]"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen pt-24 pb-16 bg-gradient-to-b from-[#E1F0FD] to-white">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 space-y-8">
        {/* KYC Banner */}
        {!profile.is_kyc_completed && (
          <Card className="p-6 bg-gradient-to-r from-amber-50 to-orange-50 border-amber-200 shadow-lg">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-full bg-amber-100 flex items-center justify-center flex-shrink-0">
                <AlertCircle className="w-6 h-6 text-amber-600" />
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-bold text-amber-900 mb-2">Complete KYC Verification</h3>
                <p className="text-sm text-amber-800 mb-4">
                  To book flights, hotels, or restaurants, you must complete your KYC verification. 
                  This is a one-time process that takes less than 5 minutes.
                </p>
                <Button 
                  onClick={() => setShowKYC(true)}
                  className="bg-amber-600 hover:bg-amber-700 text-white"
                >
                  <ShieldCheck className="w-4 h-4 mr-2" />
                  Start KYC Verification
                </Button>
              </div>
            </div>
          </Card>
        )}

        {/* Payment Profile Banner */}
        {profile.is_kyc_completed && !profile.payment_profile_completed && (
          <Card className="p-6 bg-gradient-to-r from-green-50 to-emerald-50 border-green-200 shadow-lg">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0">
                <CreditCard className="w-6 h-6 text-green-600" />
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-bold text-green-900 mb-2">Set Up Payment Profile</h3>
                <p className="text-sm text-green-800 mb-4">
                  Save your bank details for quick one-click checkout. Your information is encrypted and secured.
                </p>
                <Button 
                  onClick={() => setShowPayment(true)}
                  className="bg-green-600 hover:bg-green-700 text-white"
                >
                  <CreditCard className="w-4 h-4 mr-2" />
                  Add Payment Profile
                </Button>
              </div>
            </div>
          </Card>
        )}

        {/* Show KYC Form */}
        {showKYC && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto">
              <div className="p-4 border-b flex justify-between items-center sticky top-0 bg-white">
                <h2 className="text-xl font-bold">KYC Verification</h2>
                <Button variant="ghost" onClick={() => setShowKYC(false)}>
                  <X className="w-5 h-5" />
                </Button>
              </div>
              <div className="p-6">
                <KYCForm onSuccess={handleKYCSuccess} />
              </div>
            </div>
          </div>
        )}

        {/* Show Payment Form */}
        {showPayment && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
              <div className="p-4 border-b flex justify-between items-center sticky top-0 bg-white">
                <h2 className="text-xl font-bold">Payment Profile</h2>
                <Button variant="ghost" onClick={() => setShowPayment(false)}>
                  <X className="w-5 h-5" />
                </Button>
              </div>
              <div className="p-6">
                <PaymentProfileForm onSuccess={handlePaymentSuccess} />
              </div>
            </div>
          </div>
        )}

        {/* Profile Overview */}
        <Card className="p-6 md:p-8 shadow-xl border-0 bg-white">
          <div className="flex flex-col md:flex-row items-start md:items-center gap-6">
            <div className="relative w-32 h-32">
              <img
                src={preview || profile.profile_image || 'https://via.placeholder.com/150'}
                alt="Profile"
                className="w-32 h-32 rounded-full object-cover border-4 border-white shadow-md"
              />
              <label className="absolute bottom-0 right-0 bg-[#31A8E0] hover:bg-[#2492c7] text-white p-2 rounded-full cursor-pointer shadow">
                <Camera className="w-4 h-4" />
                <input type="file" accept="image/*" className="hidden" onChange={onFileChange} />
              </label>
            </div>
            <div className="flex-1 w-full space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label>Name</Label>
                  <Input value={profile.name || ''} disabled={!editMode} onChange={(e) => setProfile({ ...profile, name: e.target.value })} />
                </div>
                <div>
                  <Label>Username</Label>
                  <Input value={profile.username || ''} disabled={!editMode} onChange={(e) => setProfile({ ...profile, username: e.target.value })} />
                </div>
                <div>
                  <Label>Email</Label>
                  <Input value={profile.email || ''} disabled readOnly />
                </div>
                <div>
                  <Label>Phone Number</Label>
                  <Input value={profile.phone || ''} disabled={!editMode} onChange={(e) => setProfile({ ...profile, phone: e.target.value })} />
                </div>
              </div>
              <div className="pt-2">
                {!editMode ? (
                  <Button onClick={() => setEditMode(true)} className="bg-[#31A8E0] text-white">
                    <Edit3 className="w-4 h-4 mr-2" /> Edit Profile
                  </Button>
                ) : (
                  <div className="flex gap-3">
                    <Button onClick={saveProfile} disabled={saving} className="bg-[#31A8E0] text-white">
                      <Save className="w-4 h-4 mr-2" /> {saving ? 'Saving...' : 'Save Changes'}
                    </Button>
                    <Button variant="outline" onClick={() => { setEditMode(false); setPreview(null); }}>
                      <X className="w-4 h-4 mr-2" /> Cancel
                    </Button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </Card>

        {/* Travel Preferences */}
        <Card className="p-6 md:p-8 shadow-xl border-0 bg-white">
          <h2 className="text-2xl font-bold text-[#31A8E0] mb-6">Travel Preferences</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <Label>Favorite Travel Type</Label>
              <Select value={profile.favorite_travel_type || ''} onValueChange={(v) => setProfile({ ...profile, favorite_travel_type: v })}>
                <SelectTrigger className="h-12">
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent>
                  {travelTypes.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Preferred Budget Range</Label>
              <Select value={profile.preferred_budget_range || ''} onValueChange={(v) => setProfile({ ...profile, preferred_budget_range: v })}>
                <SelectTrigger className="h-12">
                  <SelectValue placeholder="Select budget" />
                </SelectTrigger>
                <SelectContent>
                  {budgetRanges.map(b => <SelectItem key={b} value={b}>{b}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Climate Preference</Label>
              <Select value={profile.climate_preference || ''} onValueChange={(v) => setProfile({ ...profile, climate_preference: v })}>
                <SelectTrigger className="h-12">
                  <SelectValue placeholder="Select climate" />
                </SelectTrigger>
                <SelectContent>
                  {climates.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Food Preference</Label>
              <Select value={profile.food_preference || ''} onValueChange={(v) => setProfile({ ...profile, food_preference: v })}>
                <SelectTrigger className="h-12">
                  <SelectValue placeholder="Select food" />
                </SelectTrigger>
                <SelectContent>
                  {foods.map(f => <SelectItem key={f} value={f}>{f}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Language Preference</Label>
              <Select value={profile.language_preference || ''} onValueChange={(v) => setProfile({ ...profile, language_preference: v })}>
                <SelectTrigger className="h-12">
                  <SelectValue placeholder="Select language" />
                </SelectTrigger>
                <SelectContent>
                  {languages.map(l => <SelectItem key={l} value={l}>{l}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
        </Card>

        {/* Saved Trips */}
        <Card className="p-6 md:p-8 shadow-xl border-0 bg-white">
          <h2 className="text-2xl font-bold text-[#31A8E0] mb-6">Your Trips</h2>
          {trips.length === 0 ? (
            <div className="text-gray-600">No trips yet. Plan your first adventure!</div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {trips.map((trip) => (
                <div key={trip.id} className="rounded-xl overflow-hidden bg-white shadow hover:shadow-lg transform hover:scale-[1.01] transition">
                  <div className="h-40 bg-gray-200">
                    {/* If you store images in trip.images, you can show the first one */}
                    {trip.images && trip.images.length > 0 ? (
                      <img src={trip.images[0]} alt={trip.destination} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-gray-500">{trip.destination}</div>
                    )}
                  </div>
                  <div className="p-4">
                    <div className="font-semibold text-gray-800">{trip.destination}</div>
                    <div className="text-sm text-gray-600">{trip.days} days • {trip.budget}</div>
                    <div className="pt-2">
                      <Button variant="outline" className="text-[#31A8E0] border-[#31A8E0]">View Details</Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Verification Status */}
        <Card className="p-6 md:p-8 shadow-xl border-0 bg-white">
          <h2 className="text-2xl font-bold text-[#31A8E0] mb-6">Verification Status</h2>
          <div className="space-y-4">
            <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
              <div className="flex items-center gap-3">
                <ShieldCheck className={`w-6 h-6 ${profile.is_kyc_completed ? 'text-green-600' : 'text-gray-400'}`} />
                <div>
                  <div className="font-semibold text-gray-900">KYC Verification</div>
                  <div className="text-sm text-gray-600">Identity verification completed</div>
                </div>
              </div>
              <div className={`px-4 py-1 rounded-full text-sm font-medium ${profile.is_kyc_completed ? 'bg-green-100 text-green-700' : 'bg-gray-200 text-gray-600'}`}>
                {profile.is_kyc_completed ? 'Verified' : 'Pending'}
              </div>
            </div>
            
            <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
              <div className="flex items-center gap-3">
                <CreditCard className={`w-6 h-6 ${profile.payment_profile_completed ? 'text-green-600' : 'text-gray-400'}`} />
                <div>
                  <div className="font-semibold text-gray-900">Payment Profile</div>
                  <div className="text-sm text-gray-600">Bank details saved for quick checkout</div>
                </div>
              </div>
              <div className={`px-4 py-1 rounded-full text-sm font-medium ${profile.payment_profile_completed ? 'bg-green-100 text-green-700' : 'bg-gray-200 text-gray-600'}`}>
                {profile.payment_profile_completed ? 'Active' : 'Not Set'}
              </div>
            </div>
          </div>
        </Card>

        {/* Transaction History */}
        {profile.is_kyc_completed && transactions.length > 0 && (
          <Card className="p-6 md:p-8 shadow-xl border-0 bg-white">
            <h2 className="text-2xl font-bold text-[#31A8E0] mb-6 flex items-center gap-2">
              <Receipt className="w-6 h-6" />
              Transaction History
            </h2>
            <div className="space-y-3">
              {transactions.slice(0, 5).map((txn) => (
                <div key={txn.id} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition">
                  <div className="flex-1">
                    <div className="font-semibold text-gray-900">{txn.service_type}</div>
                    <div className="text-sm text-gray-600">
                      {new Date(txn.created_at).toLocaleDateString()} • {txn.payment_method}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-bold text-gray-900">₹{txn.amount.toFixed(2)}</div>
                    <div className={`text-xs ${txn.status === 'completed' ? 'text-green-600' : txn.status === 'pending' ? 'text-amber-600' : 'text-red-600'}`}>
                      {txn.status}
                    </div>
                  </div>
                </div>
              ))}
            </div>
            {transactions.length > 5 && (
              <div className="pt-4 text-center">
                <Button variant="outline" className="text-[#31A8E0] border-[#31A8E0]">
                  View All Transactions
                </Button>
              </div>
            )}
          </Card>
        )}

        {/* Account Settings */}
        <Card className="p-6 md:p-8 shadow-xl border-0 bg-white">
          <h2 className="text-2xl font-bold text-[#31A8E0] mb-6">Account Settings</h2>
          <div className="flex flex-col md:flex-row md:items-center gap-4 justify-between">
            <div className="flex items-center gap-3">
              <Switch checked={!!profile.notifications_enabled} onCheckedChange={(v) => setProfile({ ...profile, notifications_enabled: v ? 1 : 0 })} />
              <span className="text-gray-700">Email Notifications</span>
            </div>
            <div className="flex items-center gap-3">
              <Button variant="outline" onClick={() => alert('Open change password UI')}>Change Password</Button>
              <Button variant="destructive" onClick={deleteAccount} className="bg-red-600 text-white hover:bg-red-700">
                <Trash2 className="w-4 h-4 mr-2" /> Delete Account
              </Button>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
};

export default Profile;
