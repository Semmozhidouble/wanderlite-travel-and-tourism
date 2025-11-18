import React, { useState, useRef, useEffect } from 'react';
import { Card } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Sparkles, Send, Loader2, MapPin, Calendar, Users, DollarSign, Trash2 } from 'lucide-react';
import { useAI } from '../contexts/AIContext';
import { useAuth } from '../contexts/AuthContext';

const Assistant = () => {
  const [messages, setMessages] = useState([
    { 
      id: 1, 
      role: 'assistant', 
      content: "Hey there! 👋 I'm WanderLite AI, your personal travel companion! Whether you're dreaming of a beach escape, planning a mountain adventure, or just need help finding the perfect hotel, I've got you covered. What's on your mind today? ✈️🌍" 
    }
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('chat');
  
  // Trip planning form
  const [tripForm, setTripForm] = useState({
    destination: '',
    duration: '',
    budget: '',
    tripType: 'leisure',
    travelers: '1'
  });

  const { sendMessage, planTrip, currentTrip, clearChatHistory } = useAI();
  const { user } = useAuth();
  const messagesEndRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim() || loading) return;

    const userMessage = input.trim();
    setInput('');

    // Add user message
    const newUserMsg = {
      id: Date.now(),
      role: 'user',
      content: userMessage
    };
    setMessages(prev => [...prev, newUserMsg]);
    setLoading(true);

    try {
      // Build context
      const context = {
        userName: user?.name,
        currentPage: 'Assistant'
      };

      // Get AI response
      const aiResponse = await sendMessage(userMessage, context);

      // Add AI message
      const newAiMsg = {
        id: Date.now() + 1,
        role: 'assistant',
        content: aiResponse
      };
      setMessages(prev => [...prev, newAiMsg]);
    } catch (error) {
      console.error('Assistant error:', error);
      const errorMsg = {
        id: Date.now() + 1,
        role: 'assistant',
        content: "Oops! 😅 I hit a little snag. Could you try asking that again?"
      };
      setMessages(prev => [...prev, errorMsg]);
    } finally {
      setLoading(false);
    }
  };

  const handlePlanTrip = async () => {
    if (!tripForm.destination || !tripForm.duration || !tripForm.budget) {
      alert('Please fill in destination, duration, and budget');
      return;
    }

    setLoading(true);
    try {
      const plan = await planTrip(tripForm);
      
      // Add trip plan to chat
      const tripMsg = {
        id: Date.now(),
        role: 'assistant',
        content: plan
      };
      setMessages(prev => [...prev, tripMsg]);
      
      // Switch to chat tab to show result
      setActiveTab('chat');
      
      // Reset form
      setTripForm({
        destination: '',
        duration: '',
        budget: '',
        tripType: 'leisure',
        travelers: '1'
      });
    } catch (error) {
      alert('Failed to plan trip. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleClearChat = () => {
    if (window.confirm('Clear all chat history?')) {
      setMessages([
        { 
          id: 1, 
          role: 'assistant', 
          content: "Chat cleared! 🎉 Ready for a fresh start? What can I help you with?" 
        }
      ]);
      clearChatHistory();
    }
  };

  const quickPrompts = [
    { icon: '🏨', text: 'Find hotels in Goa under ₹5000/night' },
    { icon: '✈️', text: 'Show flights from Delhi to Mumbai' },
    { icon: '🗓️', text: 'Plan a weekend trip to Jaipur' },
    { icon: '🍽️', text: 'Best restaurants in Bangalore' },
    { icon: '💰', text: 'Budget travel tips for Kerala' },
    { icon: '🎒', text: 'Solo travel destinations in India' }
  ];

  return (
    <div className="min-h-screen pt-24 pb-16 bg-gradient-to-b from-blue-50 via-white to-indigo-50">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 mb-4">
            <Sparkles className="w-8 h-8 text-blue-600" />
            <h1 className="text-4xl font-bold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
              WanderLite AI Assistant
            </h1>
          </div>
          <p className="text-gray-600 max-w-2xl mx-auto">
            Your intelligent travel companion powered by Google Gemini. Get personalized recommendations, 
            plan trips, and discover amazing destinations!
          </p>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-2 mb-6">
            <TabsTrigger value="chat" className="flex items-center gap-2">
              <Sparkles className="w-4 h-4" />
              Chat Assistant
            </TabsTrigger>
            <TabsTrigger value="planner" className="flex items-center gap-2">
              <MapPin className="w-4 h-4" />
              Trip Planner
            </TabsTrigger>
          </TabsList>

          {/* Chat Tab */}
          <TabsContent value="chat">
            <Card className="shadow-xl border-0">
              {/* Messages Area */}
              <div className="h-[60vh] overflow-y-auto p-6 space-y-4 bg-gradient-to-b from-gray-50 to-white">
                {messages.map((msg) => (
                  <div
                    key={msg.id}
                    className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={`max-w-[75%] rounded-2xl px-4 py-3 ${
                        msg.role === 'user'
                          ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white'
                          : 'bg-white text-gray-800 shadow-md border border-gray-100'
                      }`}
                    >
                      <p className="whitespace-pre-wrap text-sm leading-relaxed">{msg.content}</p>
                    </div>
                  </div>
                ))}
                
                {loading && (
                  <div className="flex justify-start">
                    <div className="bg-white text-gray-800 shadow-md border border-gray-100 rounded-2xl px-4 py-3 flex items-center gap-2">
                      <Loader2 className="w-4 h-4 animate-spin text-blue-600" />
                      <span className="text-sm">Thinking...</span>
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Quick Prompts */}
              {messages.length <= 1 && (
                <div className="px-6 py-4 border-t bg-gradient-to-r from-blue-50 to-indigo-50">
                  <p className="text-xs font-semibold text-gray-600 mb-3">Try asking:</p>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                    {quickPrompts.map((prompt, idx) => (
                      <button
                        key={idx}
                        onClick={() => setInput(prompt.text)}
                        className="text-left text-xs p-2 bg-white rounded-lg hover:bg-blue-50 hover:border-blue-300 border border-gray-200 transition-all shadow-sm hover:shadow-md"
                      >
                        <span className="mr-1">{prompt.icon}</span>
                        {prompt.text}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Input Area */}
              <div className="p-4 border-t bg-white">
                <div className="flex gap-3 items-end">
                  <div className="flex-1">
                    <Input
                      placeholder="Ask me anything about travel... ✈️"
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      onKeyPress={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          handleSend();
                        }
                      }}
                      disabled={loading}
                      className="border-gray-300 focus:border-blue-500 h-12"
                    />
                  </div>
                  <Button
                    onClick={handleSend}
                    disabled={loading || !input.trim()}
                    className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 h-12 px-6"
                  >
                    <Send className="w-4 h-4 mr-2" />
                    Send
                  </Button>
                  <Button
                    onClick={handleClearChat}
                    variant="outline"
                    className="h-12 px-4"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </Card>
          </TabsContent>

          {/* Trip Planner Tab */}
          <TabsContent value="planner">
            <Card className="p-8 shadow-xl border-0">
              <div className="max-w-2xl mx-auto">
                <h2 className="text-2xl font-bold mb-2 text-center">Plan Your Perfect Trip</h2>
                <p className="text-gray-600 text-center mb-8">
                  Tell us your preferences and let AI create a personalized itinerary for you!
                </p>

                <div className="space-y-6">
                  {/* Destination */}
                  <div>
                    <label className="flex items-center gap-2 text-sm font-semibold text-gray-700 mb-2">
                      <MapPin className="w-4 h-4 text-blue-600" />
                      Destination
                    </label>
                    <Input
                      placeholder="e.g., Goa, Kerala, Rajasthan"
                      value={tripForm.destination}
                      onChange={(e) => setTripForm({ ...tripForm, destination: e.target.value })}
                      className="h-12"
                    />
                  </div>

                  {/* Duration & Budget */}
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="flex items-center gap-2 text-sm font-semibold text-gray-700 mb-2">
                        <Calendar className="w-4 h-4 text-blue-600" />
                        Duration (days)
                      </label>
                      <Input
                        type="number"
                        placeholder="e.g., 3"
                        value={tripForm.duration}
                        onChange={(e) => setTripForm({ ...tripForm, duration: e.target.value })}
                        className="h-12"
                      />
                    </div>
                    <div>
                      <label className="flex items-center gap-2 text-sm font-semibold text-gray-700 mb-2">
                        <DollarSign className="w-4 h-4 text-blue-600" />
                        Budget (INR)
                      </label>
                      <Input
                        type="number"
                        placeholder="e.g., 25000"
                        value={tripForm.budget}
                        onChange={(e) => setTripForm({ ...tripForm, budget: e.target.value })}
                        className="h-12"
                      />
                    </div>
                  </div>

                  {/* Travelers & Trip Type */}
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="flex items-center gap-2 text-sm font-semibold text-gray-700 mb-2">
                        <Users className="w-4 h-4 text-blue-600" />
                        Travelers
                      </label>
                      <select
                        value={tripForm.travelers}
                        onChange={(e) => setTripForm({ ...tripForm, travelers: e.target.value })}
                        className="w-full h-12 px-3 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="1">Solo</option>
                        <option value="2">Couple</option>
                        <option value="3-4">Small Group (3-4)</option>
                        <option value="5+">Large Group (5+)</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-sm font-semibold text-gray-700 mb-2 block">
                        Trip Type
                      </label>
                      <select
                        value={tripForm.tripType}
                        onChange={(e) => setTripForm({ ...tripForm, tripType: e.target.value })}
                        className="w-full h-12 px-3 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="leisure">Leisure</option>
                        <option value="adventure">Adventure</option>
                        <option value="romantic">Romantic</option>
                        <option value="family">Family</option>
                        <option value="business">Business</option>
                      </select>
                    </div>
                  </div>

                  {/* Plan Button */}
                  <Button
                    onClick={handlePlanTrip}
                    disabled={loading}
                    className="w-full h-14 text-lg bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700"
                  >
                    {loading ? (
                      <>
                        <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                        Creating Your Perfect Trip...
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-5 h-5 mr-2" />
                        Plan My Trip with AI
                      </>
                    )}
                  </Button>
                </div>

                {/* Current Trip Display */}
                {currentTrip && (
                  <div className="mt-8 p-6 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl border border-blue-200">
                    <h3 className="font-bold text-lg mb-2 flex items-center gap-2">
                      <Sparkles className="w-5 h-5 text-blue-600" />
                      Your Latest Trip Plan
                    </h3>
                    <p className="text-sm text-gray-600 mb-4">
                      {currentTrip.destination} • {currentTrip.duration} days • INR {currentTrip.budget}
                    </p>
                    <Button
                      onClick={() => setActiveTab('chat')}
                      variant="outline"
                      size="sm"
                    >
                      View Full Plan in Chat
                    </Button>
                  </div>
                )}
              </div>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default Assistant;


