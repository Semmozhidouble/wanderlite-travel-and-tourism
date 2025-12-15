import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Send } from 'lucide-react';

const API_URL = 'http://127.0.0.1:8000/api/admin';

const Notifications = () => {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    title: '',
    message: '',
    notification_type: 'info',
    target_type: 'all', // 'all' or 'specific'
    user_id: '',
  });
  const [sendingNotification, setSendingNotification] = useState(false);

  useEffect(() => {
    fetchNotifications();
  }, []);

  const fetchNotifications = async () => {
    try {
      const token = localStorage.getItem('admin_token');
      const response = await axios.get(`${API_URL}/notifications`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setNotifications(response.data);
      setLoading(false);
    } catch (err) {
      console.error('Failed to load notifications', err);
      setLoading(false);
    }
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData({
      ...formData,
      [name]: value,
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSendingNotification(true);

    try {
      const token = localStorage.getItem('admin_token');
      const payload = {
        title: formData.title,
        message: formData.message,
        notification_type: formData.notification_type,
      };

      if (formData.target_type === 'specific' && formData.user_id) {
        payload.user_id = parseInt(formData.user_id);
      }

      await axios.post(`${API_URL}/notifications`, payload, {
        headers: { Authorization: `Bearer ${token}` },
      });

      setShowForm(false);
      setFormData({
        title: '',
        message: '',
        notification_type: 'info',
        target_type: 'all',
        user_id: '',
      });
      fetchNotifications();
      alert('Notification sent successfully!');
    } catch (err) {
      console.error('Failed to send notification', err);
      alert('Failed to send notification');
    } finally {
      setSendingNotification(false);
    }
  };

  const getNotificationTypeColor = (type) => {
    switch (type) {
      case 'info':
        return 'bg-blue-100 text-blue-700';
      case 'warning':
        return 'bg-yellow-100 text-yellow-700';
      case 'success':
        return 'bg-green-100 text-green-700';
      case 'error':
        return 'bg-red-100 text-red-700';
      default:
        return 'bg-slate-100 text-slate-700';
    }
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold text-slate-900">Notifications</h1>
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition"
        >
          <Send size={20} /> Send Notification
        </button>
      </div>

      {/* Send Notification Form */}
      {showForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-lg max-w-xl w-full">
            <div className="p-6">
              <h2 className="text-2xl font-bold text-slate-900 mb-4">Send New Notification</h2>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Title</label>
                  <input
                    type="text"
                    name="title"
                    value={formData.title}
                    onChange={handleInputChange}
                    required
                    placeholder="e.g., Special Offer"
                    className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Message</label>
                  <textarea
                    name="message"
                    value={formData.message}
                    onChange={handleInputChange}
                    required
                    rows="4"
                    placeholder="Enter notification message..."
                    className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Type</label>
                  <select
                    name="notification_type"
                    value={formData.notification_type}
                    onChange={handleInputChange}
                    className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="info">Info</option>
                    <option value="warning">Warning</option>
                    <option value="success">Success</option>
                    <option value="error">Error</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Send To</label>
                  <select
                    name="target_type"
                    value={formData.target_type}
                    onChange={handleInputChange}
                    className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="all">All Users</option>
                    <option value="specific">Specific User</option>
                  </select>
                </div>

                {formData.target_type === 'specific' && (
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">User ID</label>
                    <input
                      type="number"
                      name="user_id"
                      value={formData.user_id}
                      onChange={handleInputChange}
                      placeholder="Enter user ID"
                      className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                )}

                <div className="flex justify-end gap-3 pt-4">
                  <button
                    type="button"
                    onClick={() => setShowForm(false)}
                    className="px-4 py-2 text-slate-700 bg-slate-200 rounded-lg hover:bg-slate-300 transition"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={sendingNotification}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition disabled:opacity-50"
                  >
                    {sendingNotification ? 'Sending...' : 'Send'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Notifications List */}
      <div className="bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden">
        {loading ? (
          <div className="p-8 text-center">Loading notifications...</div>
        ) : notifications.length === 0 ? (
          <div className="p-8 text-center text-slate-500">No notifications sent yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-slate-900">Title</th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-slate-900">Recipient</th>
                  <th className="px-6 py-3 text-center text-sm font-semibold text-slate-900">Type</th>
                  <th className="px-6 py-3 text-center text-sm font-semibold text-slate-900">Status</th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-slate-900">Sent At</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {notifications.map((notification) => (
                  <tr key={notification.id} className="hover:bg-slate-50">
                    <td className="px-6 py-4">
                      <div>
                        <p className="font-medium text-slate-900">{notification.title}</p>
                        <p className="text-sm text-slate-600 truncate max-w-xs">{notification.message}</p>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-slate-600">{notification.user_email || 'All Users'}</td>
                    <td className="px-6 py-4 text-center">
                      <span className={`text-xs font-medium px-3 py-1 rounded-full ${getNotificationTypeColor(notification.notification_type)}`}>
                        {notification.notification_type}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <span className={`text-xs font-medium px-3 py-1 rounded-full ${notification.is_read ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
                        {notification.is_read ? 'Read' : 'Unread'}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-slate-600 text-sm">
                      {new Date(notification.created_at).toLocaleString()}
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

export default Notifications;
