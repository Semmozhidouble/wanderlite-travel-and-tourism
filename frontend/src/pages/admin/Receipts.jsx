import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Download, Eye } from 'lucide-react';

const API_URL = 'http://127.0.0.1:8000/api/admin';

const Receipts = () => {
  const [receipts, setReceipts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedReceipt, setSelectedReceipt] = useState(null);

  useEffect(() => {
    fetchReceipts();
  }, []);

  const fetchReceipts = async () => {
    try {
      const token = localStorage.getItem('admin_token');
      const response = await axios.get(`${API_URL}/receipts`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setReceipts(response.data);
      setLoading(false);
    } catch (err) {
      console.error('Failed to load receipts', err);
      setLoading(false);
    }
  };

  const handleDownloadPDF = (filePath) => {
    const link = document.createElement('a');
    link.href = filePath;
    link.download = filePath.split('/').pop();
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div>
      <h1 className="text-3xl font-bold text-slate-900 mb-6">Receipts & Tickets</h1>

      {/* Receipt Detail Modal */}
      {selectedReceipt && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-lg max-w-2xl w-full max-h-96 overflow-y-auto">
            <div className="p-6">
              <h2 className="text-2xl font-bold text-slate-900 mb-4">{selectedReceipt.receipt_type} Receipt</h2>

              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-slate-600">Reference Number</p>
                    <p className="text-lg font-semibold text-slate-900">{selectedReceipt.reference_number}</p>
                  </div>
                  <div>
                    <p className="text-sm text-slate-600">User</p>
                    <p className="text-lg font-semibold text-slate-900">{selectedReceipt.user_email}</p>
                  </div>
                  <div>
                    <p className="text-sm text-slate-600">Amount</p>
                    <p className="text-lg font-semibold text-slate-900">₹{selectedReceipt.amount?.toLocaleString()}</p>
                  </div>
                  <div>
                    <p className="text-sm text-slate-600">Status</p>
                    <span className="text-lg font-semibold text-green-600">
                      {selectedReceipt.status}
                    </span>
                  </div>
                  <div>
                    <p className="text-sm text-slate-600">Issue Date</p>
                    <p className="text-lg font-semibold text-slate-900">
                      {new Date(selectedReceipt.issue_date).toLocaleDateString()}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-slate-600">Type</p>
                    <p className="text-lg font-semibold text-slate-900">{selectedReceipt.receipt_type}</p>
                  </div>
                </div>

                {selectedReceipt.file_path && (
                  <div className="pt-4">
                    <button
                      onClick={() => handleDownloadPDF(selectedReceipt.file_path)}
                      className="flex items-center gap-2 w-full justify-center bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition"
                    >
                      <Download size={20} /> Download PDF
                    </button>
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-3 pt-6">
                <button
                  onClick={() => setSelectedReceipt(null)}
                  className="px-4 py-2 text-slate-700 bg-slate-200 rounded-lg hover:bg-slate-300 transition"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Receipts Table */}
      <div className="bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden">
        {loading ? (
          <div className="p-8 text-center">Loading receipts...</div>
        ) : receipts.length === 0 ? (
          <div className="p-8 text-center text-slate-500">No receipts found.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-slate-900">Reference #</th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-slate-900">User</th>
                  <th className="px-6 py-3 text-right text-sm font-semibold text-slate-900">Amount</th>
                  <th className="px-6 py-3 text-center text-sm font-semibold text-slate-900">Type</th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-slate-900">Issue Date</th>
                  <th className="px-6 py-3 text-center text-sm font-semibold text-slate-900">Status</th>
                  <th className="px-6 py-3 text-center text-sm font-semibold text-slate-900">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {receipts.map((receipt) => (
                  <tr key={receipt.id} className="hover:bg-slate-50">
                    <td className="px-6 py-4 font-medium text-slate-900">{receipt.reference_number}</td>
                    <td className="px-6 py-4 text-slate-600">{receipt.user_email}</td>
                    <td className="px-6 py-4 text-right font-semibold text-slate-900">
                      ₹{receipt.amount?.toLocaleString()}
                    </td>
                    <td className="px-6 py-4 text-center">
                      <span className="px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-xs font-medium">
                        {receipt.receipt_type}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-slate-600 text-sm">
                      {new Date(receipt.issue_date).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4 text-center">
                      <span className="px-3 py-1 bg-green-100 text-green-700 rounded-full text-xs font-medium">
                        {receipt.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <button
                        onClick={() => setSelectedReceipt(receipt)}
                        className="text-blue-600 hover:text-blue-700 inline-flex items-center gap-1"
                      >
                        <Eye size={18} /> View
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default Receipts;
