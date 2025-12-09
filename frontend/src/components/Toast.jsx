import React, { createContext, useContext, useState, useCallback } from 'react';
import { Alert, AlertDescription } from '../components/ui/alert';
import { X, CheckCircle, AlertCircle, Info, AlertTriangle } from 'lucide-react';

const ToastContext = createContext();

export const useToast = () => {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
};

export const ToastProvider = ({ children }) => {
  const [toasts, setToasts] = useState([]);

  const addToast = useCallback((message, type = 'info', duration = 5000) => {
    const id = Date.now() + Math.random();
    const newToast = { id, message, type, duration };
    
    setToasts(prev => [...prev, newToast]);
    
    if (duration > 0) {
      setTimeout(() => {
        removeToast(id);
      }, duration);
    }
    
    return id;
  }, []);

  const removeToast = useCallback((id) => {
    setToasts(prev => prev.filter(toast => toast.id !== id));
  }, []);

  const toast = {
    success: (message, duration) => addToast(message, 'success', duration),
    error: (message, duration) => addToast(message, 'error', duration),
    warning: (message, duration) => addToast(message, 'warning', duration),
    info: (message, duration) => addToast(message, 'info', duration),
  };

  const getIcon = (type) => {
    switch (type) {
      case 'success':
        return <CheckCircle className="w-5 h-5 text-green-600" />;
      case 'error':
        return <AlertCircle className="w-5 h-5 text-red-600" />;
      case 'warning':
        return <AlertTriangle className="w-5 h-5 text-yellow-600" />;
      case 'info':
      default:
        return <Info className="w-5 h-5 text-blue-600" />;
    }
  };

  const getVariant = (type) => {
    switch (type) {
      case 'error':
        return 'destructive';
      default:
        return 'default';
    }
  };

  return (
    <ToastContext.Provider value={toast}>
      {children}
      <div className="fixed top-20 right-4 z-50 flex flex-col gap-2 max-w-md">
        {toasts.map(({ id, message, type }) => (
          <Alert
            key={id}
            variant={getVariant(type)}
            className="shadow-lg animate-in slide-in-from-right duration-300"
          >
            <div className="flex items-start gap-3">
              {getIcon(type)}
              <AlertDescription className="flex-1 text-sm">{message}</AlertDescription>
              <button
                onClick={() => removeToast(id)}
                className="text-gray-500 hover:text-gray-700 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </Alert>
        ))}
      </div>
    </ToastContext.Provider>
  );
};

export default ToastProvider;
