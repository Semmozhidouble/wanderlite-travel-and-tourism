import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Settings, Lock } from 'lucide-react';

const API_URL = 'http://127.0.0.1:8000/api/admin';

const SettingsPage = () => {
  const [settings, setSettings] = useState({
    maintenance_mode: false,
    bookings_enabled: true,
    new_user_registration: true,
  });
  const [loading, setLoading] = useState(true);
  const [saveMessage, setSaveMessage] = useState('');
  const [passwordForm, setPasswordForm] = useState({
    current_password: '',
    new_password: '',
    confirm_password: '',
  });
  const [passwordMessage, setPasswordMessage] = useState('');

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      const token = localStorage.getItem('admin_token');
      const response = await axios.get(`${API_URL}/settings`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      
      const settingsObj = {};
      response.data.forEach((setting) => {
        settingsObj[setting.setting_key] = setting.setting_value === 'true' || setting.setting_value === true;
      });
      setSettings(settingsObj);
      setLoading(false);
    } catch (err) {
      console.error('Failed to load settings', err);
      setLoading(false);
    }
  };

  const handleSettingChange = (key) => {
    setSettings({
      ...settings,
      [key]: !settings[key],
    });
  };

  const handleSaveSettings = async () => {
    try {
      const token = localStorage.getItem('admin_token');
      
      await Promise.all(
        Object.entries(settings).map(([ setting_key, setting_value ]) =>
          axios.put(
            `${API_URL}/settings`,
            { setting_key, setting_value: String(setting_value) },
            { headers: { Authorization: `Bearer ${token}` } }
          )
        )
      );

      setSaveMessage('Settings updated successfully!');
      setTimeout(() => setSaveMessage(''), 3000);
    } catch (err) {
      console.error('Failed to save settings', err);
      setSaveMessage('Failed to save settings');
    }
  };

  const handlePasswordChange = async (e) => {
    e.preventDefault();

    if (passwordForm.new_password !== passwordForm.confirm_password) {
      setPasswordMessage('New passwords do not match');
      return;
    }

    try {
      const token = localStorage.getItem('admin_token');
      await axios.post(
        `${API_URL}/change-password`,
        {
          current_password: passwordForm.current_password,
          new_password: passwordForm.new_password,
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      setPasswordMessage('Password changed successfully!');
      setPasswordForm({
        current_password: '',
        new_password: '',
        confirm_password: '',
      });
      setTimeout(() => setPasswordMessage(''), 3000);
    } catch (err) {
      console.error('Failed to change password', err);
      setPasswordMessage(err.response?.data?.detail || 'Failed to change password');
    }
  };

  return (
    <div>
      <h1 className="text-3xl font-bold text-slate-900 mb-6">Admin Settings</h1>

      {loading ? (
        <div className="p-8 text-center">Loading settings...</div>
      ) : (
        <>
          {/* Platform Settings */}
          <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6 mb-6">
            <div className="flex items-center gap-2 mb-6">
              <Settings size={24} className="text-blue-600" />
              <h2 className="text-2xl font-bold text-slate-900">Platform Settings</h2>
            </div>

            <div className="space-y-6">
              {/* Maintenance Mode */}
              <div className="flex items-center justify-between p-4 bg-slate-50 rounded-lg">
                <div>
                  <h3 className="text-lg font-semibold text-slate-900">Maintenance Mode</h3>
                  <p className="text-sm text-slate-600">Put the platform in maintenance mode</p>
                </div>
                <label className="flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={settings.maintenance_mode}
                    onChange={() => handleSettingChange('maintenance_mode')}
                    className="w-6 h-6 rounded border-slate-300"
                  />
                </label>
              </div>

              {/* Bookings Enabled */}
              <div className="flex items-center justify-between p-4 bg-slate-50 rounded-lg">
                <div>
                  <h3 className="text-lg font-semibold text-slate-900">Enable Bookings</h3>
                  <p className="text-sm text-slate-600">Allow users to make new bookings</p>
                </div>
                <label className="flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={settings.bookings_enabled}
                    onChange={() => handleSettingChange('bookings_enabled')}
                    className="w-6 h-6 rounded border-slate-300"
                  />
                </label>
              </div>

              {/* User Registration */}
              <div className="flex items-center justify-between p-4 bg-slate-50 rounded-lg">
                <div>
                  <h3 className="text-lg font-semibold text-slate-900">Enable Registration</h3>
                  <p className="text-sm text-slate-600">Allow new user registrations</p>
                </div>
                <label className="flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={settings.new_user_registration}
                    onChange={() => handleSettingChange('new_user_registration')}
                    className="w-6 h-6 rounded border-slate-300"
                  />
                </label>
              </div>

              {/* Save Button */}
              <div>
                <button
                  onClick={handleSaveSettings}
                  className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
                >
                  Save Settings
                </button>
                {saveMessage && (
                  <p className="mt-3 text-sm font-medium text-green-600">{saveMessage}</p>
                )}
              </div>
            </div>
          </div>

          {/* Change Password */}
          <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6">
            <div className="flex items-center gap-2 mb-6">
              <Lock size={24} className="text-red-600" />
              <h2 className="text-2xl font-bold text-slate-900">Change Password</h2>
            </div>

            <form onSubmit={handlePasswordChange} className="space-y-4 max-w-md">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Current Password</label>
                <input
                  type="password"
                  value={passwordForm.current_password}
                  onChange={(e) =>
                    setPasswordForm({ ...passwordForm, current_password: e.target.value })
                  }
                  required
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">New Password</label>
                <input
                  type="password"
                  value={passwordForm.new_password}
                  onChange={(e) =>
                    setPasswordForm({ ...passwordForm, new_password: e.target.value })
                  }
                  required
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Confirm Password</label>
                <input
                  type="password"
                  value={passwordForm.confirm_password}
                  onChange={(e) =>
                    setPasswordForm({ ...passwordForm, confirm_password: e.target.value })
                  }
                  required
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <button
                type="submit"
                className="px-6 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition"
              >
                Change Password
              </button>

              {passwordMessage && (
                <p
                  className={`text-sm font-medium ${
                    passwordMessage.includes('successfully')
                      ? 'text-green-600'
                      : 'text-red-600'
                  }`}
                >
                  {passwordMessage}
                </p>
              )}
            </form>
          </div>
        </>
      )}
    </div>
  );
};

export default SettingsPage;
