import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { CheckCircle, XCircle, Clock, Eye, FileText, User, Calendar, MapPin } from 'lucide-react';

const API_URL = 'http://127.0.0.1:8000/api/admin';
const BACKEND_URL = 'http://127.0.0.1:8000';

const KYCVerification = () => {
  const [kycRequests, setKycRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('pending');
  const [selectedKyc, setSelectedKyc] = useState(null);
  const [kycDetail, setKycDetail] = useState(null);
  const [reviewAction, setReviewAction] = useState('');
  const [rejectReason, setRejectReason] = useState('');
  const [counts, setCounts] = useState({ pending: 0, verified: 0, rejected: 0 });
  const [submitting, setSubmitting] = useState(false);

  const fetchCounts = useCallback(async () => {
    try {
      const token = localStorage.getItem('admin_token');
      const response = await axios.get(`${API_URL}/kyc/counts`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setCounts(response.data);
    } catch (err) {
      console.error('Failed to load KYC counts', err);
    }
  }, []);

  const fetchKycRequests = useCallback(async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('admin_token');
      const response = await axios.get(`${API_URL}/kyc?status=${statusFilter}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setKycRequests(response.data);
    } catch (err) {
      console.error('Failed to load KYC requests', err);
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    fetchCounts();
    fetchKycRequests();
  }, [fetchCounts, fetchKycRequests]);

  const fetchKycDetail = async (kycId) => {
    try {
      const token = localStorage.getItem('admin_token');
      const response = await axios.get(`${API_URL}/kyc/${kycId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setKycDetail(response.data);
    } catch (err) {
      console.error('Failed to load KYC detail', err);
    }
  };

  const handleOpenReview = async (kyc) => {
    setSelectedKyc(kyc);
    await fetchKycDetail(kyc.id);
  };

  const handleKycReview = async () => {
    if (!reviewAction) return;
    
    try {
      setSubmitting(true);
      const token = localStorage.getItem('admin_token');
      await axios.post(
        `${API_URL}/kyc/${selectedKyc.id}/review`,
        {
          action: reviewAction,
          reason: rejectReason || null,
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      // Reset modal state
      setSelectedKyc(null);
      setKycDetail(null);
      setReviewAction('');
      setRejectReason('');
      
      // Refresh data
      await fetchCounts();
      await fetchKycRequests();
      
      alert(`KYC ${reviewAction === 'approve' ? 'approved' : 'rejected'} successfully!`);
    } catch (err) {
      console.error('Failed to process KYC review', err);
      alert('Failed to process KYC review');
    } finally {
      setSubmitting(false);
    }
  };

  const closeModal = () => {
    setSelectedKyc(null);
    setKycDetail(null);
    setReviewAction('');
    setRejectReason('');
  };

  return (
    <div>
      <h1 className="text-3xl font-bold text-slate-900 mb-6">KYC Verification</h1>

      {/* Status Filter with Real Counts */}
      <div className="flex gap-2 mb-6">
        <button
          onClick={() => setStatusFilter('pending')}
          className={`px-4 py-2 rounded-lg font-medium transition flex items-center gap-2 ${
            statusFilter === 'pending'
              ? 'bg-yellow-500 text-white'
              : 'bg-slate-200 text-slate-700 hover:bg-slate-300'
          }`}
        >
          <Clock className="w-4 h-4" />
          Pending ({counts.pending})
        </button>
        <button
          onClick={() => setStatusFilter('verified')}
          className={`px-4 py-2 rounded-lg font-medium transition flex items-center gap-2 ${
            statusFilter === 'verified'
              ? 'bg-green-600 text-white'
              : 'bg-slate-200 text-slate-700 hover:bg-slate-300'
          }`}
        >
          <CheckCircle className="w-4 h-4" />
          Verified ({counts.verified})
        </button>
        <button
          onClick={() => setStatusFilter('rejected')}
          className={`px-4 py-2 rounded-lg font-medium transition flex items-center gap-2 ${
            statusFilter === 'rejected'
              ? 'bg-red-600 text-white'
              : 'bg-slate-200 text-slate-700 hover:bg-slate-300'
          }`}
        >
          <XCircle className="w-4 h-4" />
          Rejected ({counts.rejected})
        </button>
      </div>

      {/* KYC Requests Table */}
      <div className="bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-slate-500">Loading KYC requests...</div>
        ) : kycRequests.length === 0 ? (
          <div className="p-8 text-center text-slate-500">
            No {statusFilter} KYC requests found.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-slate-900">User</th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-slate-900">Full Name</th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-slate-900">ID Type</th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-slate-900">Submitted</th>
                  <th className="px-6 py-3 text-center text-sm font-semibold text-slate-900">Status</th>
                  <th className="px-6 py-3 text-right text-sm font-semibold text-slate-900">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {kycRequests.map((kyc) => (
                  <tr key={kyc.id} className="hover:bg-slate-50">
                    <td className="px-6 py-4">
                      <div>
                        <p className="font-medium text-slate-900">{kyc.user_name}</p>
                        <p className="text-sm text-slate-600">{kyc.user_email}</p>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-slate-900">{kyc.full_name}</td>
                    <td className="px-6 py-4">
                      <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded text-xs font-medium uppercase">
                        {kyc.id_type}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-600">
                      {kyc.submitted_at ? new Date(kyc.submitted_at).toLocaleString() : 'N/A'}
                    </td>
                    <td className="px-6 py-4 text-center">
                      <span
                        className={`text-xs font-medium px-3 py-1 rounded-full inline-flex items-center gap-1 ${
                          kyc.verification_status === 'pending'
                            ? 'bg-yellow-100 text-yellow-700'
                            : kyc.verification_status === 'verified'
                            ? 'bg-green-100 text-green-700'
                            : 'bg-red-100 text-red-700'
                        }`}
                      >
                        {kyc.verification_status === 'pending' && <Clock className="w-3 h-3" />}
                        {kyc.verification_status === 'verified' && <CheckCircle className="w-3 h-3" />}
                        {kyc.verification_status === 'rejected' && <XCircle className="w-3 h-3" />}
                        {kyc.verification_status.charAt(0).toUpperCase() + kyc.verification_status.slice(1)}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button
                        onClick={() => handleOpenReview(kyc)}
                        className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg inline-flex items-center gap-1"
                      >
                        <Eye className="w-4 h-4" />
                        {kyc.verification_status === 'pending' ? 'Review' : 'View'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* KYC Review Modal */}
      {selectedKyc && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            {/* Modal Header */}
            <div className="sticky top-0 bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between">
              <h2 className="text-2xl font-bold text-slate-900">
                KYC {selectedKyc.verification_status === 'pending' ? 'Review' : 'Details'}
              </h2>
              <button
                onClick={closeModal}
                className="text-slate-500 hover:text-slate-700 text-2xl"
              >
                ×
              </button>
            </div>

            {/* Modal Content */}
            <div className="p-6">
              {kycDetail ? (
                <div className="space-y-6">
                  {/* User Info Section */}
                  <div className="bg-slate-50 rounded-lg p-4">
                    <h3 className="font-semibold text-slate-900 mb-3 flex items-center gap-2">
                      <User className="w-5 h-5" /> User Information
                    </h3>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="text-sm text-slate-600">Username</label>
                        <p className="font-medium text-slate-900">{kycDetail.user_name}</p>
                      </div>
                      <div>
                        <label className="text-sm text-slate-600">Email</label>
                        <p className="font-medium text-slate-900">{kycDetail.user_email}</p>
                      </div>
                    </div>
                  </div>

                  {/* Personal Info Section */}
                  <div className="bg-slate-50 rounded-lg p-4">
                    <h3 className="font-semibold text-slate-900 mb-3 flex items-center gap-2">
                      <FileText className="w-5 h-5" /> Personal Information
                    </h3>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                      <div>
                        <label className="text-sm text-slate-600">Full Name</label>
                        <p className="font-medium text-slate-900">{kycDetail.full_name}</p>
                      </div>
                      <div>
                        <label className="text-sm text-slate-600">Date of Birth</label>
                        <p className="font-medium text-slate-900">{kycDetail.dob}</p>
                      </div>
                      <div>
                        <label className="text-sm text-slate-600">Gender</label>
                        <p className="font-medium text-slate-900 capitalize">{kycDetail.gender}</p>
                      </div>
                      <div>
                        <label className="text-sm text-slate-600">Nationality</label>
                        <p className="font-medium text-slate-900">{kycDetail.nationality}</p>
                      </div>
                      <div>
                        <label className="text-sm text-slate-600">ID Type</label>
                        <p className="font-medium text-slate-900 uppercase">{kycDetail.id_type}</p>
                      </div>
                    </div>
                  </div>

                  {/* Address Section */}
                  <div className="bg-slate-50 rounded-lg p-4">
                    <h3 className="font-semibold text-slate-900 mb-3 flex items-center gap-2">
                      <MapPin className="w-5 h-5" /> Address
                    </h3>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                      <div className="col-span-2 md:col-span-3">
                        <label className="text-sm text-slate-600">Address Line</label>
                        <p className="font-medium text-slate-900">{kycDetail.address_line}</p>
                      </div>
                      <div>
                        <label className="text-sm text-slate-600">City</label>
                        <p className="font-medium text-slate-900">{kycDetail.city}</p>
                      </div>
                      <div>
                        <label className="text-sm text-slate-600">State</label>
                        <p className="font-medium text-slate-900">{kycDetail.state}</p>
                      </div>
                      <div>
                        <label className="text-sm text-slate-600">Country</label>
                        <p className="font-medium text-slate-900">{kycDetail.country}</p>
                      </div>
                      <div>
                        <label className="text-sm text-slate-600">Pincode</label>
                        <p className="font-medium text-slate-900">{kycDetail.pincode}</p>
                      </div>
                    </div>
                  </div>

                  {/* Documents Section */}
                  <div className="bg-slate-50 rounded-lg p-4">
                    <h3 className="font-semibold text-slate-900 mb-3 flex items-center gap-2">
                      <FileText className="w-5 h-5" /> Uploaded Documents
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      {kycDetail.id_proof_front_path && (
                        <div>
                          <label className="text-sm text-slate-600 block mb-2">ID Proof (Front)</label>
                          <img
                            src={`${BACKEND_URL}${kycDetail.id_proof_front_path}`}
                            alt="ID Front"
                            className="w-full h-40 object-cover rounded-lg border border-slate-300 cursor-pointer hover:opacity-80"
                            onClick={() => window.open(`${BACKEND_URL}${kycDetail.id_proof_front_path}`, '_blank')}
                          />
                        </div>
                      )}
                      {kycDetail.id_proof_back_path && (
                        <div>
                          <label className="text-sm text-slate-600 block mb-2">ID Proof (Back)</label>
                          <img
                            src={`${BACKEND_URL}${kycDetail.id_proof_back_path}`}
                            alt="ID Back"
                            className="w-full h-40 object-cover rounded-lg border border-slate-300 cursor-pointer hover:opacity-80"
                            onClick={() => window.open(`${BACKEND_URL}${kycDetail.id_proof_back_path}`, '_blank')}
                          />
                        </div>
                      )}
                      {kycDetail.selfie_path && (
                        <div>
                          <label className="text-sm text-slate-600 block mb-2">Selfie</label>
                          <img
                            src={`${BACKEND_URL}${kycDetail.selfie_path}`}
                            alt="Selfie"
                            className="w-full h-40 object-cover rounded-lg border border-slate-300 cursor-pointer hover:opacity-80"
                            onClick={() => window.open(`${BACKEND_URL}${kycDetail.selfie_path}`, '_blank')}
                          />
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Timestamps */}
                  <div className="bg-slate-50 rounded-lg p-4">
                    <h3 className="font-semibold text-slate-900 mb-3 flex items-center gap-2">
                      <Calendar className="w-5 h-5" /> Timeline
                    </h3>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                      <div>
                        <label className="text-sm text-slate-600">Submitted At</label>
                        <p className="font-medium text-slate-900">
                          {kycDetail.submitted_at ? new Date(kycDetail.submitted_at).toLocaleString() : 'N/A'}
                        </p>
                      </div>
                      {kycDetail.verified_at && (
                        <div>
                          <label className="text-sm text-slate-600">Verified At</label>
                          <p className="font-medium text-slate-900">
                            {new Date(kycDetail.verified_at).toLocaleString()}
                          </p>
                        </div>
                      )}
                      <div>
                        <label className="text-sm text-slate-600">Current Status</label>
                        <span
                          className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-sm font-medium ${
                            kycDetail.verification_status === 'pending'
                              ? 'bg-yellow-100 text-yellow-700'
                              : kycDetail.verification_status === 'verified'
                              ? 'bg-green-100 text-green-700'
                              : 'bg-red-100 text-red-700'
                          }`}
                        >
                          {kycDetail.verification_status === 'pending' && <Clock className="w-4 h-4" />}
                          {kycDetail.verification_status === 'verified' && <CheckCircle className="w-4 h-4" />}
                          {kycDetail.verification_status === 'rejected' && <XCircle className="w-4 h-4" />}
                          {kycDetail.verification_status.charAt(0).toUpperCase() + kycDetail.verification_status.slice(1)}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Review Actions - Only for pending */}
                  {selectedKyc.verification_status === 'pending' && (
                    <div className="border-t border-slate-200 pt-6 space-y-4">
                      <h3 className="font-semibold text-slate-900">Admin Decision</h3>
                      
                      <div className="flex gap-3">
                        <button
                          onClick={() => setReviewAction('approve')}
                          className={`flex-1 py-3 rounded-lg font-medium transition flex items-center justify-center gap-2 ${
                            reviewAction === 'approve'
                              ? 'bg-green-600 text-white'
                              : 'bg-green-100 text-green-700 hover:bg-green-200'
                          }`}
                        >
                          <CheckCircle className="w-5 h-5" />
                          Approve KYC
                        </button>
                        <button
                          onClick={() => setReviewAction('reject')}
                          className={`flex-1 py-3 rounded-lg font-medium transition flex items-center justify-center gap-2 ${
                            reviewAction === 'reject'
                              ? 'bg-red-600 text-white'
                              : 'bg-red-100 text-red-700 hover:bg-red-200'
                          }`}
                        >
                          <XCircle className="w-5 h-5" />
                          Reject KYC
                        </button>
                      </div>

                      {reviewAction === 'reject' && (
                        <div>
                          <label className="block text-sm font-medium text-slate-700 mb-2">
                            Rejection Reason *
                          </label>
                          <textarea
                            value={rejectReason}
                            onChange={(e) => setRejectReason(e.target.value)}
                            placeholder="Provide a reason for rejection (e.g., blurry document, mismatched information)..."
                            className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
                            rows="3"
                          />
                        </div>
                      )}

                      <button
                        onClick={handleKycReview}
                        disabled={!reviewAction || submitting || (reviewAction === 'reject' && !rejectReason)}
                        className="w-full py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:bg-slate-400 disabled:cursor-not-allowed transition"
                      >
                        {submitting ? 'Processing...' : 'Submit Decision'}
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <div className="p-8 text-center text-slate-500">Loading KYC details...</div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default KYCVerification;
