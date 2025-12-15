import React, { useState } from 'react';
import { Outlet, useNavigate, Link } from 'react-router-dom';
import {
  LayoutDashboard,
  Users,
  ShieldCheck,
  Plane,
  CreditCard,
  FileText,
  MapPin,
  Bell,
  BarChart3,
  Settings,
  LogOut,
  Menu,
  X,
  ChevronDown,
} from 'lucide-react';

const AdminLayout = () => {
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [expandedMenu, setExpandedMenu] = useState(null);

  const handleLogout = () => {
    localStorage.removeItem('admin_token');
    localStorage.removeItem('admin_role');
    localStorage.removeItem('admin_email');
    navigate('/admin/login');
  };

  const menuItems = [
    { icon: LayoutDashboard, label: 'Dashboard', path: '/admin/dashboard' },
    { icon: Users, label: 'Users', path: '/admin/users' },
    { icon: ShieldCheck, label: 'KYC Verification', path: '/admin/kyc' },
    {
      icon: Plane,
      label: 'Bookings',
      path: '/admin/bookings',
      submenu: [
        { label: 'All Bookings', path: '/admin/bookings' },
        { label: 'Flights', path: '/admin/bookings?type=flight' },
        { label: 'Hotels', path: '/admin/bookings?type=hotel' },
        { label: 'Restaurants', path: '/admin/bookings?type=restaurant' },
      ],
    },
    { icon: CreditCard, label: 'Transactions', path: '/admin/transactions' },
    { icon: FileText, label: 'Receipts & Tickets', path: '/admin/receipts' },
    { icon: MapPin, label: 'Destinations', path: '/admin/destinations' },
    { icon: Bell, label: 'Notifications', path: '/admin/notifications' },
    { icon: BarChart3, label: 'Reports', path: '/admin/reports' },
    { icon: Settings, label: 'Settings', path: '/admin/settings' },
  ];

  return (
    <div className="min-h-screen bg-slate-50 flex">
      {/* Sidebar */}
      <div
        className={`${
          sidebarOpen ? 'w-64' : 'w-20'
        } bg-slate-900 text-slate-50 transition-all duration-300 fixed h-screen overflow-y-auto z-50`}
      >
        {/* Sidebar Header */}
        <div className="p-6 border-b border-slate-800">
          <div className="flex items-center justify-between">
            {sidebarOpen && (
              <div>
                <h1 className="text-xl font-bold text-white">WanderLite</h1>
                <p className="text-xs text-slate-400">Admin Panel</p>
              </div>
            )}
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="p-2 hover:bg-slate-800 rounded-lg transition-colors"
            >
              {sidebarOpen ? (
                <X className="w-5 h-5" />
              ) : (
                <Menu className="w-5 h-5" />
              )}
            </button>
          </div>
        </div>

        {/* Sidebar Menu */}
        <nav className="p-4 space-y-2 pb-24">
          {menuItems.map((item) => {
            const Icon = item.icon;
            const hasSubmenu = item.submenu && item.submenu.length > 0;
            const isExpanded = expandedMenu === item.label;

            return (
              <div key={item.label}>
                <button
                  onClick={() => {
                    if (hasSubmenu) {
                      setExpandedMenu(isExpanded ? null : item.label);
                    } else {
                      navigate(item.path);
                    }
                  }}
                  className="w-full flex items-center justify-between p-3 rounded-lg hover:bg-slate-800 transition-colors text-slate-300 hover:text-white group"
                >
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <Icon className="w-5 h-5 flex-shrink-0" />
                    {sidebarOpen && (
                      <span className="truncate text-sm font-medium">{item.label}</span>
                    )}
                  </div>
                  {hasSubmenu && sidebarOpen && (
                    <ChevronDown
                      className={`w-4 h-4 transition-transform ${
                        isExpanded ? 'rotate-180' : ''
                      }`}
                    />
                  )}
                </button>

                {/* Submenu */}
                {hasSubmenu && isExpanded && sidebarOpen && (
                  <div className="ml-4 mt-2 space-y-1 border-l border-slate-700 pl-3">
                    {item.submenu.map((subitem) => (
                      <Link
                        key={subitem.label}
                        to={subitem.path}
                        className="block p-2 text-xs text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded transition-colors"
                      >
                        {subitem.label}
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </nav>

        {/* Sidebar Footer */}
        <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-slate-800 bg-slate-900">
          <button
            onClick={handleLogout}
            className="w-full flex items-center justify-center gap-2 p-3 text-red-400 hover:text-red-300 hover:bg-red-900/20 rounded-lg transition-colors text-sm font-medium"
          >
            <LogOut className="w-4 h-4" />
            {sidebarOpen && 'Logout'}
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div
        className={`${sidebarOpen ? 'ml-64' : 'ml-20'} flex-1 transition-all duration-300`}
      >
        {/* Top Bar */}
        <div className="bg-white border-b border-slate-200 shadow-sm sticky top-0 z-40">
          <div className="px-8 py-4 flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-bold text-slate-900">Admin Dashboard</h2>
              <p className="text-sm text-slate-600">
                Welcome back, {localStorage.getItem('admin_email')}
              </p>
            </div>
            <div className="flex items-center gap-4">
              <span className="inline-flex items-center gap-2 px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-sm font-medium">
                {localStorage.getItem('admin_role')?.replace('_', ' ').toUpperCase()}
              </span>
            </div>
          </div>
        </div>

        {/* Page Content */}
        <div className="p-8">
          <Outlet />
        </div>
      </div>
    </div>
  );
};

export default AdminLayout;
