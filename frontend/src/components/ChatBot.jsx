import React, { useState, useRef, useEffect } from 'react';
import { MessageCircle, X, Send, Loader2, Sparkles, Trash2, Mic, MicOff } from 'lucide-react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import geminiService from '../services/geminiService';
import { useAuth } from '../contexts/AuthContext';

/**
 * Enhanced ChatBot Component - AI assistant for WanderLite
 * Features: persistent chat history, voice input, timestamps, typing animation
 */
const ChatBot = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState(() => {
    // Load chat history from localStorage
    const saved = localStorage.getItem('wanderlite-chat-history');
    if (saved) {
      try {
        return JSON.parse(saved).map(msg => ({
          ...msg,
          timestamp: new Date(msg.timestamp)
        }));
      } catch (e) {
        console.error('Failed to load chat history:', e);
      }
    }
    // Default welcome message
    return [
      {
        id: 1,
        type: 'ai',
        text: "Hey there! 👋 I'm WanderLite AI, your personal travel buddy! Whether you're planning a beach getaway, a mountain trek, or just looking for the perfect hotel, I'm here to help. What can I do for you today? ✈️",
        timestamp: new Date()
      }
    ];
  });
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [recognition, setRecognition] = useState(null);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);
  const { user } = useAuth();

  // Initialize speech recognition
  useEffect(() => {
    if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      const recognitionInstance = new SpeechRecognition();
      recognitionInstance.continuous = false;
      recognitionInstance.interimResults = false;
      recognitionInstance.lang = 'en-US';

      recognitionInstance.onresult = (event) => {
        const transcript = event.results[0][0].transcript;
        setInput(transcript);
        setIsListening(false);
      };

      recognitionInstance.onerror = () => {
        setIsListening(false);
      };

      recognitionInstance.onend = () => {
        setIsListening(false);
      };

      setRecognition(recognitionInstance);
    }
  }, []);

  // Save chat history to localStorage
  useEffect(() => {
    localStorage.setItem('wanderlite-chat-history', JSON.stringify(messages));
  }, [messages]);

  // Auto-scroll to latest message
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Focus input when chat opens
  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  // Toggle voice input
  const toggleVoiceInput = () => {
    if (!recognition) return;

    if (isListening) {
      recognition.stop();
      setIsListening(false);
    } else {
      recognition.start();
      setIsListening(true);
    }
  };

  // Clear chat history
  const clearChat = () => {
    const welcomeMessage = {
      id: Date.now(),
      type: 'ai',
      text: "Chat cleared! How can I help you with your travel plans today? 🌍",
      timestamp: new Date()
    };
    setMessages([welcomeMessage]);
  };

  const handleSendMessage = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage = input.trim();
    setInput('');

    // Add user message
    const newUserMessage = {
      id: Date.now(),
      type: 'user',
      text: userMessage,
      timestamp: new Date()
    };
    setMessages(prev => [...prev, newUserMessage]);
    setIsLoading(true);

    try {
      // Build context for AI
      const context = {
        userName: user?.name,
        currentPage: window.location.pathname
      };

      // Get AI response
      const aiResponse = await geminiService.chat(userMessage, context);

      // Add AI message
      const newAiMessage = {
        id: Date.now() + 1,
        type: 'ai',
        text: aiResponse,
        timestamp: new Date()
      };
      setMessages(prev => [...prev, newAiMessage]);
    } catch (error) {
      console.error('Chat error:', error);
      console.log('Backend URL being used:', process.env.REACT_APP_BACKEND_URL);
      
      // More detailed error message for debugging
      const errorMessage = {
        id: Date.now() + 1,
        type: 'ai',
        text: `Oops! 😅 I hit a little snag connecting to the backend. ${error.message || 'Could you try asking that again?'}`,
        timestamp: new Date()
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const quickActions = [
    { label: '🏨 Find Hotels', action: 'Show me hotels in Goa under ₹5000/night' },
    { label: '✈️ Book Flights', action: 'I need flights from Delhi to Mumbai' },
    { label: '🗓️ Plan Trip', action: 'Plan a 3-day trip to Kerala' },
    { label: '🍽️ Restaurants', action: 'Recommend restaurants near Taj Mahal' }
  ];

  const handleQuickAction = (actionText) => {
    setInput(actionText);
    inputRef.current?.focus();
  };

  return (
    <>
      {/* Floating Chat Button */}
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          className="fixed bottom-6 right-6 z-50 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-full p-4 shadow-2xl hover:shadow-blue-500/50 transition-all duration-300 hover:scale-110 group"
          aria-label="Open WanderLite AI Chat"
        >
          <MessageCircle className="w-6 h-6" />
          <span className="absolute -top-1 -right-1 w-3 h-3 bg-green-400 rounded-full animate-pulse"></span>
          <div className="absolute bottom-full right-0 mb-2 px-3 py-1 bg-gray-900 text-white text-sm rounded-lg opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
            Chat with WanderLite AI
          </div>
        </button>
      )}

      {/* Chat Window */}
      {isOpen && (
        <div className="fixed bottom-6 right-6 z-50 w-96 h-[600px] bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden border border-gray-200">
          {/* Header */}
          <div className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white p-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="relative">
                <Sparkles className="w-6 h-6" />
                <span className="absolute -top-1 -right-1 w-2 h-2 bg-green-400 rounded-full"></span>
              </div>
              <div>
                <h3 className="font-semibold">WanderLite AI</h3>
                <p className="text-xs text-blue-100">Always here to help ✨</p>
              </div>
            </div>
            <button
              onClick={() => setIsOpen(false)}
              className="hover:bg-white/20 rounded-full p-1 transition-colors"
              aria-label="Close chat"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Quick Actions (shown when chat is fresh) */}
          {messages.length <= 1 && (
            <div className="p-4 bg-gradient-to-b from-blue-50 to-white border-b">
              <p className="text-xs text-gray-600 mb-2 font-medium">Quick actions:</p>
              <div className="grid grid-cols-2 gap-2">
                {quickActions.map((action, idx) => (
                  <button
                    key={idx}
                    onClick={() => handleQuickAction(action.action)}
                    className="text-left text-xs p-2 bg-white border border-gray-200 rounded-lg hover:border-blue-500 hover:shadow-sm transition-all"
                  >
                    {action.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-50">
            {messages.map((message) => (
              <div
                key={message.id}
                className={`flex ${message.type === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[80%] rounded-2xl px-4 py-2 ${
                    message.type === 'user'
                      ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white'
                      : 'bg-white text-gray-800 shadow-sm border border-gray-200'
                  }`}
                >
                  <p className="text-sm whitespace-pre-wrap">{message.text}</p>
                  <p className={`text-xs mt-1 ${message.type === 'user' ? 'text-blue-100' : 'text-gray-400'}`}>
                    {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
              </div>
            ))}
            
            {isLoading && (
              <div className="flex justify-start">
                <div className="bg-white text-gray-800 shadow-sm border border-gray-200 rounded-2xl px-4 py-3 flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin text-blue-600" />
                  <span className="text-sm">Thinking...</span>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input Area */}
          <div className="p-4 bg-white border-t border-gray-200">
            {/* Clear Chat Button */}
            <div className="flex justify-between items-center mb-3">
              <button
                onClick={clearChat}
                className="text-xs text-gray-500 hover:text-red-500 flex items-center gap-1 transition-colors"
                title="Clear chat history"
              >
                <Trash2 className="w-3 h-3" />
                Clear Chat
              </button>
              <div className="text-xs text-gray-500">
                {messages.length - 1} messages
              </div>
            </div>

            <div className="flex gap-2">
              <div className="flex-1 relative">
                <Input
                  ref={inputRef}
                  type="text"
                  placeholder="Ask me anything about travel..."
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyPress={handleKeyPress}
                  disabled={isLoading}
                  className="pr-12 border-gray-300 focus:border-blue-500 focus:ring-blue-500"
                  maxLength={500}
                />
                
                {/* Voice Input Button */}
                {recognition && (
                  <button
                    onClick={toggleVoiceInput}
                    className={`absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-full transition-colors ${
                      isListening 
                        ? 'bg-red-500 text-white animate-pulse' 
                        : 'text-gray-400 hover:text-blue-500'
                    }`}
                    title={isListening ? 'Stop listening' : 'Voice input'}
                    disabled={isLoading}
                  >
                    {isListening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                  </button>
                )}
              </div>
              
              <Button
                onClick={handleSendMessage}
                disabled={isLoading || !input.trim()}
                className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white px-4"
              >
                {isLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Send className="w-4 h-4" />
                )}
              </Button>
            </div>

            {/* Character Counter & Status */}
            <div className="flex justify-between items-center mt-2">
              <p className="text-xs text-gray-400">
                {isListening ? '🎤 Listening...' : 'Powered by Google Gemini AI'}
              </p>
              <span className={`text-xs ${input.length > 400 ? 'text-orange-500' : 'text-gray-400'}`}>
                {input.length}/500
              </span>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default ChatBot;
