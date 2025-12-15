import React, { useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { adminAuthService } from '../../services/adminApi';
import {
  LayoutDashboard,
  Users,
  ShieldCheck,
  Calendar,
  CreditCard,
  Receipt,
  MapPin,
  Bell,
  BarChart3,
  Settings,
  LogOut,
  ChevronDown,
  Plane,
  Hotel,
  UtensilsCrossed,
  UsersRound,
  Menu,
  X,
} from 'lucide-react';

const AdminSidebar = ({ isOpen, setIsOpen }) => {
  const location = useLocation();
  const [bookingsOpen, setBookingsOpen] = useState(
    location.pathname.includes('/admin/bookings')
  );
  const admin = adminAuthService.getAdminData();

  const handleLogout = () => {
    if (window.confirm('Are you sure you want to logout?')) {
      adminAuthService.logout();
    }
  };

  const navItems = [
    { path: '/admin/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
    { path: '/admin/users', icon: Users, label: 'Users' },
    { path: '/admin/kyc', icon: ShieldCheck, label: 'KYC Verification' },
    {
      label: 'Bookings',
      icon: Calendar,
      subItems: [
        { path: '/admin/bookings/flights', icon: Plane, label: 'Flights' },
        { path: '/admin/bookings/hotels', icon: Hotel, label: 'Hotels' },
        { path: '/admin/bookings/restaurants', icon: UtensilsCrossed, label: 'Restaurants' },
        { path: '/admin/bookings/all', icon: UsersRound, label: 'All Bookings' },
      ],
    },
    { path: '/admin/transactions', icon: CreditCard, label: 'Transactions' },
    { path: '/admin/receipts', icon: Receipt, label: 'Receipts & Tickets' },
    { path: '/admin/destinations', icon: MapPin, label: 'Destinations' },
    { path: '/admin/notifications', icon: Bell, label: 'Notifications' },
    { path: '/admin/reports', icon: BarChart3, label: 'Reports' },
    { path: '/admin/settings', icon: Settings, label: 'Settings' },
  ];

  const NavItem = ({ item }) => {
    if (item.subItems) {
      return (
        <div>
          <button
            onClick={() => setBookingsOpen(!bookingsOpen)}
            className={`w-full flex items-center justify-between px-4 py-3 text-gray-300 hover:bg-slate-700/50 transition-colors ${
              location.pathname.includes('/admin/bookings') ? 'bg-slate-700/50 text-white' : ''
            }`}
          >
            <div className="flex items-center gap-3">
              <item.icon className="w-5 h-5" />
              <span>{item.label}</span>
            </div>
            <ChevronDown
              className={`w-4 h-4 transition-transform ${bookingsOpen ? 'rotate-180' : ''}`}
            />
          </button>
          {bookingsOpen && (
            <div className="bg-slate-900/50">
              {item.subItems.map((subItem) => (
                <NavLink
                  key={subItem.path}
                  to={subItem.path}
                  className={({ isActive }) =>
                    `flex items-center gap-3 px-4 py-2.5 pl-12 text-sm transition-colors ${
                      isActive
                        ? 'bg-blue-600 text-white'
                        : 'text-gray-400 hover:bg-slate-700/50 hover:text-white'
                    }`
                  }
                >
                  <subItem.icon className="w-4 h-4" />
                  <span>{subItem.label}</span>
                </NavLink>
              ))}
            </div>
          )}
        </div>
      );
    }

    return (
      <NavLink
        to={item.path}
        className={({ isActive }) =>
          `flex items-center gap-3 px-4 py-3 transition-colors ${
            isActive
              ? 'bg-blue-600 text-white'
              : 'text-gray-300 hover:bg-slate-700/50 hover:text-white'
          }`
        }
      >
        <item.icon className="w-5 h-5" />
        <span>{item.label}</span>
      </NavLink>
    );
  };

  return (
    <>
      {/* Mobile Overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={() => setIsOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed top-0 left-0 z-50 h-full w-64 bg-slate-800 transform transition-transform duration-300 lg:translate-x-0 ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-5 border-b border-slate-700">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-cyan-400 rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-lg">W</span>
            </div>
            <div>
              <h1 className="text-white font-bold">WanderLite</h1>
              <p className="text-xs text-gray-400">Admin Panel</p>
            </div>
          </div>
          <button
            onClick={() => setIsOpen(false)}
            className="lg:hidden text-gray-400 hover:text-white"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Admin Info */}
        <div className="px-4 py-4 border-b border-slate-700">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-slate-600 rounded-full flex items-center justify-center">
              <span className="text-white font-medium">
                {admin?.username?.charAt(0).toUpperCase() || 'A'}
              </span>
            </div>
            <div>
              <p className="text-white font-medium text-sm">{admin?.username || 'Admin'}</p>
              <p className="text-xs text-gray-400">{admin?.role || 'Administrator'}</p>
            </div>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto py-4">
          {navItems.map((item, index) => (
            <NavItem key={index} item={item} />
          ))}
        </nav>

        {/* Logout */}
        <div className="border-t border-slate-700 p-4">
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-4 py-3 text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
          >
            <LogOut className="w-5 h-5" />
            <span>Logout</span>
          </button>
        </div>
      </aside>
    </>
  );
};

export default AdminSidebar;
