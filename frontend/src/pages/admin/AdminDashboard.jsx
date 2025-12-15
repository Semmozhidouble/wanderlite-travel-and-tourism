import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Users, Plane, TrendingUp, Clock } from 'lucide-react';

const API_URL = 'http://127.0.0.1:8000/api/admin';

const AdminDashboard = () => {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchDashboard();
  }, []);

  const fetchDashboard = async () => {
    try {
      const token = localStorage.getItem('admin_token');
      const response = await axios.get(`${API_URL}/dashboard`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setStats(response.data);
      setLoading(false);
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to load dashboard');
      setLoading(false);
    }
  };

  if (loading) {
    return <div className="text-center py-12">Loading dashboard...</div>;
  }

  if (error) {
    return <div className="text-red-600 bg-red-50 p-4 rounded-lg">{error}</div>;
  }

  const metrics = [
    {
      icon: Users,
      label: 'Total Users',
      value: stats?.total_users || 0,
      color: 'blue',
    },
    {
      icon: Plane,
      label: 'Total Bookings',
      value: stats?.total_bookings || 0,
      color: 'green',
    },
    {
      icon: TrendingUp,
      label: 'Total Revenue',
      value: `₹${(stats?.total_revenue || 0).toLocaleString()}`,
      color: 'purple',
    },
    {
      icon: Clock,
      label: 'Pending KYC',
      value: stats?.pending_kyc || 0,
      color: 'orange',
    },
  ];

  const colorClasses = {
    blue: 'bg-blue-50 text-blue-600',
    green: 'bg-green-50 text-green-600',
    purple: 'bg-purple-50 text-purple-600',
    orange: 'bg-orange-50 text-orange-600',
  };

  return (
    <div>
      {/* Page Title */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-slate-900">Dashboard</h1>
        <p className="text-slate-600 mt-2">Welcome to the WanderLite Admin Panel</p>
      </div>

      {/* Metrics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        {metrics.map((metric) => {
          const Icon = metric.icon;
          const bgClass = colorClasses[metric.color];

          return (
            <div
              key={metric.label}
              className="bg-white rounded-lg shadow-sm border border-slate-200 p-6 hover:shadow-md transition-shadow"
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-slate-600 text-sm font-medium">{metric.label}</p>
                  <p className="text-3xl font-bold text-slate-900 mt-2">{metric.value}</p>
                </div>
                <div className={`${bgClass} p-3 rounded-lg`}>
                  <Icon className="w-6 h-6" />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Recent Bookings */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Bookings Table */}
        <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6">
          <h2 className="text-lg font-bold text-slate-900 mb-4">Recent Bookings</h2>
          <div className="space-y-3">
            {stats?.recent_bookings?.slice(0, 5).map((booking) => (
              <div
                key={booking.id}
                className="flex items-center justify-between p-3 bg-slate-50 rounded-lg border border-slate-200"
              >
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-slate-900 truncate">
                    {booking.booking_ref}
                  </p>
                  <p className="text-sm text-slate-600">{booking.service_type}</p>
                </div>
                <div className="text-right">
                  <p className="font-semibold text-slate-900">
                    ₹{booking.total_price.toLocaleString()}
                  </p>
                  <span className={`text-xs font-medium px-2 py-1 rounded-full ${
                    booking.status === 'Paid'
                      ? 'bg-green-100 text-green-700'
                      : 'bg-yellow-100 text-yellow-700'
                  }`}>
                    {booking.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Platform Stats */}
        <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6">
          <h2 className="text-lg font-bold text-slate-900 mb-4">Quick Stats</h2>
          <div className="space-y-4">
            <div>
              <p className="text-sm text-slate-600 mb-2">Active Trips</p>
              <p className="text-2xl font-bold text-slate-900">{stats?.active_trips || 0}</p>
            </div>
            <div>
              <p className="text-sm text-slate-600 mb-2">Pending KYC Requests</p>
              <p className="text-2xl font-bold text-orange-600">{stats?.pending_kyc || 0}</p>
            </div>
            <div className="pt-4 border-t border-slate-200">
              <p className="text-xs text-slate-600 mb-3">Platform Health</p>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-600">Database</span>
                  <span className="text-xs font-medium text-green-600">●  Online</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-600">API Server</span>
                  <span className="text-xs font-medium text-green-600">●  Running</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-600">Email Service</span>
                  <span className="text-xs font-medium text-green-600">●  Active</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminDashboard;
