import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import api from '../services/api';
import { useAuth } from './AuthContext';

const NotificationContext = createContext();

export const useNotifications = () => {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error('useNotifications must be used within a NotificationProvider');
  }
  return context;
};

export const NotificationProvider = ({ children }) => {
  const { isAuthenticated, token } = useAuth();
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isConnected, setIsConnected] = useState(false);
  const [newNotification, setNewNotification] = useState(null); // For toast display
  const wsRef = useRef(null);
  const reconnectTimeoutRef = useRef(null);
  const reconnectAttempts = useRef(0);
  const maxReconnectAttempts = 5;

  // Fetch notifications from API
  const fetchNotifications = useCallback(async () => {
    if (!isAuthenticated) return;
    
    try {
      const response = await api.get('/api/notifications');
      setNotifications(response.data.notifications || []);
      setUnreadCount(response.data.unread_count || 0);
    } catch (error) {
      console.error('Failed to fetch notifications:', error);
    }
  }, [isAuthenticated]);

  // Fetch unread count only
  const fetchUnreadCount = useCallback(async () => {
    if (!isAuthenticated) return;
    
    try {
      const response = await api.get('/api/notifications/unread-count');
      setUnreadCount(response.data.unread_count || 0);
    } catch (error) {
      console.error('Failed to fetch unread count:', error);
    }
  }, [isAuthenticated]);

  // Mark notification as read
  const markAsRead = useCallback(async (notificationId) => {
    try {
      await api.post(`/api/notifications/${notificationId}/read`);
      setNotifications(prev => 
        prev.map(n => n.id === notificationId ? { ...n, is_read: true } : n)
      );
      setUnreadCount(prev => Math.max(0, prev - 1));
    } catch (error) {
      console.error('Failed to mark notification as read:', error);
    }
  }, []);

  // Mark all as read
  const markAllAsRead = useCallback(async () => {
    try {
      await api.post('/api/notifications/mark-all-read');
      setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
      setUnreadCount(0);
    } catch (error) {
      console.error('Failed to mark all as read:', error);
    }
  }, []);

  // Delete notification
  const deleteNotification = useCallback(async (notificationId) => {
    try {
      await api.delete(`/api/notifications/${notificationId}`);
      setNotifications(prev => prev.filter(n => n.id !== notificationId));
      // Refresh unread count
      fetchUnreadCount();
    } catch (error) {
      console.error('Failed to delete notification:', error);
    }
  }, [fetchUnreadCount]);

  // Clear new notification (after toast displayed)
  const clearNewNotification = useCallback(() => {
    setNewNotification(null);
  }, []);

  // WebSocket connection
  const connectWebSocket = useCallback(() => {
    if (!isAuthenticated || !token || wsRef.current?.readyState === WebSocket.OPEN) {
      return;
    }

    // Get WebSocket URL
    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsHost = process.env.REACT_APP_WS_URL || `${wsProtocol}//localhost:8000`;
    const wsUrl = `${wsHost}/ws/notifications/${token}`;

    try {
      wsRef.current = new WebSocket(wsUrl);

      wsRef.current.onopen = () => {
        console.log('WebSocket connected');
        setIsConnected(true);
        reconnectAttempts.current = 0;
      };

      wsRef.current.onmessage = (event) => {
        // Dev: log raw message when verbose mode is enabled
        if (process.env.REACT_APP_VERBOSE_WS === 'true') {
          console.debug('[WS raw]', event.data);
        }

        try {
          const data = JSON.parse(event.data);
          
          if (data.type === 'init') {
            // Initial connection - set unread count
            setUnreadCount(data.unread_count || 0);
          } else if (data.type === 'notification') {
            // New notification received
            const notification = {
              id: data.id || Date.now(),
              title: data.title,
              message: data.message,
              type: data.notification_type,
              is_read: false,
              created_at: data.created_at
            };
            
            // Add to notifications list
            setNotifications(prev => [notification, ...prev]);
            setUnreadCount(prev => prev + 1);
            
            // Trigger toast notification
            setNewNotification(notification);
          } else if (data.type === 'heartbeat') {
            // Server heartbeat - keep connection alive
          }
        } catch (e) {
          console.error('Failed to parse WebSocket message:', e);
        }
      };

      wsRef.current.onclose = (event) => {
        setIsConnected(false);
        
        // Only attempt to reconnect a few times silently
        if (event.code !== 1000 && reconnectAttempts.current < 3) {
          reconnectAttempts.current += 1;
          const delay = Math.min(5000 * reconnectAttempts.current, 15000);
          reconnectTimeoutRef.current = setTimeout(connectWebSocket, delay);
        }
      };

      wsRef.current.onerror = (error) => {
        // Silently handle WebSocket errors - notifications are not critical
        if (process.env.NODE_ENV === 'development') {
          console.log('WebSocket connection unavailable - notifications disabled');
        }
      };

      // Send ping every 25 seconds to keep connection alive
      const pingInterval = setInterval(() => {
        if (wsRef.current?.readyState === WebSocket.OPEN) {
          wsRef.current.send('ping');
        }
      }, 25000);

      return () => clearInterval(pingInterval);
    } catch (error) {
      console.error('Failed to connect WebSocket:', error);
    }
  }, [isAuthenticated, token]);

  // Connect WebSocket when authenticated
  useEffect(() => {
    if (isAuthenticated && token) {
      fetchNotifications();
      connectWebSocket();
    } else {
      // Cleanup on logout
      if (wsRef.current) {
        wsRef.current.close(1000, 'User logged out');
        wsRef.current = null;
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      setNotifications([]);
      setUnreadCount(0);
      setIsConnected(false);
    }

    return () => {
      if (wsRef.current) {
        wsRef.current.close(1000, 'Component unmounted');
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
    };
  }, [isAuthenticated, token, fetchNotifications, connectWebSocket]);

  const value = {
    notifications,
    unreadCount,
    isConnected,
    newNotification,
    fetchNotifications,
    fetchUnreadCount,
    markAsRead,
    markAllAsRead,
    deleteNotification,
    clearNewNotification
  };

  return (
    <NotificationContext.Provider value={value}>
      {children}
    </NotificationContext.Provider>
  );
};

export default NotificationContext;
