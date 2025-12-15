import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { BarChart3, TrendingUp } from 'lucide-react';

const API_URL = 'http://127.0.0.1:8000/api/admin';

const Reports = () => {
  const [bookingReport, setBookingReport] = useState(null);
  const [userReport, setUserReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState({
    startDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    endDate: new Date().toISOString().split('T')[0],
  });

  useEffect(() => {
    fetchReports();
  }, [dateRange]);

  const fetchReports = async () => {
    try {
      const token = localStorage.getItem('admin_token');
      const params = new URLSearchParams({
        start_date: dateRange.startDate,
        end_date: dateRange.endDate,
      });

      const [bookingRes, userRes] = await Promise.all([
        axios.get(`${API_URL}/reports/bookings?${params}`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        axios.get(`${API_URL}/reports/users?${params}`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
      ]);

      setBookingReport(bookingRes.data);
      setUserReport(userRes.data);
      setLoading(false);
    } catch (err) {
      console.error('Failed to load reports', err);
      setLoading(false);
    }
  };

  const handleDateChange = (e) => {
    const { name, value } = e.target;
    setDateRange({
      ...dateRange,
      [name]: value,
    });
  };

  return (
    <div>
      <h1 className="text-3xl font-bold text-slate-900 mb-6">Reports & Analytics</h1>

      {/* Date Range Filter */}
      <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6 mb-6">
        <div className="flex items-end gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Start Date</label>
            <input
              type="date"
              name="startDate"
              value={dateRange.startDate}
              onChange={handleDateChange}
              className="px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">End Date</label>
            <input
              type="date"
              name="endDate"
              value={dateRange.endDate}
              onChange={handleDateChange}
              className="px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <button
            onClick={fetchReports}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
          >
            Generate Report
          </button>
        </div>
      </div>

      {loading ? (
        <div className="p-8 text-center">Loading reports...</div>
      ) : (
        <>
          {/* Booking Report */}
          <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6 mb-6">
            <div className="flex items-center gap-2 mb-6">
              <BarChart3 size={24} className="text-blue-600" />
              <h2 className="text-2xl font-bold text-slate-900">Booking Report</h2>
            </div>

            {bookingReport ? (
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
                <div className="bg-blue-50 rounded-lg p-4">
                  <p className="text-sm text-slate-600 mb-1">Total Bookings</p>
                  <p className="text-3xl font-bold text-blue-600">{bookingReport.total_bookings}</p>
                </div>
                <div className="bg-green-50 rounded-lg p-4">
                  <p className="text-sm text-slate-600 mb-1">Total Revenue</p>
                  <p className="text-3xl font-bold text-green-600">
                    ₹{bookingReport.total_revenue?.toLocaleString()}
                  </p>
                </div>
                <div className="bg-purple-50 rounded-lg p-4">
                  <p className="text-sm text-slate-600 mb-1">Avg Booking Value</p>
                  <p className="text-3xl font-bold text-purple-600">
                    ₹{Math.round(bookingReport.total_revenue / bookingReport.total_bookings || 0).toLocaleString()}
                  </p>
                </div>
                <div className="bg-orange-50 rounded-lg p-4">
                  <p className="text-sm text-slate-600 mb-1">Completion Rate</p>
                  <p className="text-3xl font-bold text-orange-600">
                    {bookingReport.total_bookings > 0
                      ? Math.round((bookingReport.confirmed_bookings / bookingReport.total_bookings) * 100)
                      : 0}
                    %
                  </p>
                </div>
              </div>
            ) : null}

            {bookingReport?.bookings_by_type && (
              <div className="mt-6">
                <h3 className="text-lg font-semibold text-slate-900 mb-4">Bookings by Type</h3>
                <div className="space-y-3">
                  {Object.entries(bookingReport.bookings_by_type).map(([type, count]) => (
                    <div key={type} className="flex items-center gap-4">
                      <div className="w-32 text-sm font-medium text-slate-700 capitalize">{type}</div>
                      <div className="flex-1 h-8 bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-blue-600 flex items-center justify-end pr-3 text-white text-sm font-medium"
                          style={{
                            width: `${(count / bookingReport.total_bookings) * 100}%`,
                          }}
                        >
                          {count > 0 ? count : ''}
                        </div>
                      </div>
                      <div className="w-16 text-right text-sm font-semibold text-slate-900">{count}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* User Report */}
          <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6">
            <div className="flex items-center gap-2 mb-6">
              <TrendingUp size={24} className="text-green-600" />
              <h2 className="text-2xl font-bold text-slate-900">User Growth Report</h2>
            </div>

            {userReport ? (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                <div className="bg-green-50 rounded-lg p-4">
                  <p className="text-sm text-slate-600 mb-1">New Users</p>
                  <p className="text-3xl font-bold text-green-600">{userReport.new_users}</p>
                </div>
                <div className="bg-blue-50 rounded-lg p-4">
                  <p className="text-sm text-slate-600 mb-1">KYC Completed</p>
                  <p className="text-3xl font-bold text-blue-600">{userReport.kyc_completed}</p>
                </div>
                <div className="bg-yellow-50 rounded-lg p-4">
                  <p className="text-sm text-slate-600 mb-1">KYC Pending</p>
                  <p className="text-3xl font-bold text-yellow-600">{userReport.kyc_pending}</p>
                </div>
              </div>
            ) : null}

            {userReport?.users_by_month && (
              <div className="mt-6">
                <h3 className="text-lg font-semibold text-slate-900 mb-4">User Signups by Month</h3>
                <div className="space-y-3">
                  {userReport.users_by_month.map((month) => (
                    <div key={month.month} className="flex items-center gap-4">
                      <div className="w-24 text-sm font-medium text-slate-700">{month.month}</div>
                      <div className="flex-1 h-8 bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-green-600 flex items-center justify-end pr-3 text-white text-sm font-medium"
                          style={{
                            width: `${
                              (month.count /
                                Math.max(
                                  ...userReport.users_by_month.map((m) => m.count)
                                )) *
                              100
                            }%`,
                          }}
                        >
                          {month.count > 0 ? month.count : ''}
                        </div>
                      </div>
                      <div className="w-12 text-right text-sm font-semibold text-slate-900">{month.count}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};

export default Reports;
