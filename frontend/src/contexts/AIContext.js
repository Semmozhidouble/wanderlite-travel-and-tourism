import React, { createContext, useContext, useState, useCallback } from 'react';
import geminiService from '../services/geminiService';

/**
 * AI Context - Manages WanderLite AI state across the application
 * Provides chat functionality, trip planning, and recommendation features
 */

const AIContext = createContext();

export const useAI = () => {
  const context = useContext(AIContext);
  if (!context) {
    throw new Error('useAI must be used within an AIProvider');
  }
  return context;
};

export const AIProvider = ({ children }) => {
  const [chatHistory, setChatHistory] = useState([]);
  const [currentTrip, setCurrentTrip] = useState(null);
  const [recommendations, setRecommendations] = useState({
    hotels: [],
    flights: [],
    restaurants: []
  });

  /**
   * Send a message to AI and get response
   */
  const sendMessage = useCallback(async (message, context = {}) => {
    try {
      const response = await geminiService.chat(message, context);
      
      // Add to chat history
      setChatHistory(prev => [
        ...prev,
        { type: 'user', text: message, timestamp: new Date() },
        { type: 'ai', text: response, timestamp: new Date() }
      ]);

      return response;
    } catch (error) {
      console.error('AI message error:', error);
      throw error;
    }
  }, []);

  /**
   * Plan a trip with AI
   */
  const planTrip = useCallback(async (tripData) => {
    try {
      const plan = await geminiService.planTrip(tripData);
      
      setCurrentTrip({
        ...tripData,
        plan,
        createdAt: new Date()
      });

      return plan;
    } catch (error) {
      console.error('Trip planning error:', error);
      throw error;
    }
  }, []);

  /**
   * Get hotel recommendations from AI
   */
  const getHotelRecommendations = useCallback(async (criteria) => {
    try {
      const recommendations = await geminiService.getHotelRecommendations(criteria);
      
      setRecommendations(prev => ({
        ...prev,
        hotels: { criteria, recommendations, timestamp: new Date() }
      }));

      return recommendations;
    } catch (error) {
      console.error('Hotel recommendations error:', error);
      throw error;
    }
  }, []);

  /**
   * Get flight recommendations from AI
   */
  const getFlightRecommendations = useCallback(async (flightData) => {
    try {
      const recommendations = await geminiService.getFlightRecommendations(flightData);
      
      setRecommendations(prev => ({
        ...prev,
        flights: { flightData, recommendations, timestamp: new Date() }
      }));

      return recommendations;
    } catch (error) {
      console.error('Flight recommendations error:', error);
      throw error;
    }
  }, []);

  /**
   * Ask AI to explain policies
   */
  const explainPolicy = useCallback(async (policyType, serviceType) => {
    try {
      return await geminiService.explainPolicy(policyType, serviceType);
    } catch (error) {
      console.error('Policy explanation error:', error);
      throw error;
    }
  }, []);

  /**
   * Clear all AI chat history
   */
  const clearChatHistory = useCallback(() => {
    setChatHistory([]);
    geminiService.clearHistory();
  }, []);

  /**
   * Clear current trip plan
   */
  const clearTripPlan = useCallback(() => {
    setCurrentTrip(null);
  }, []);

  /**
   * Get contextual AI suggestions based on current page
   */
  const getContextualSuggestions = useCallback((pageName, pageData = {}) => {
    const suggestions = {
      home: [
        "What are the top destinations for this season?",
        "Help me plan a budget-friendly weekend getaway",
        "Show me the best hotel deals right now"
      ],
      hotels: [
        `Find hotels in ${pageData.location || 'this area'} under ₹5000/night`,
        "What amenities should I look for?",
        "Explain the cancellation policy"
      ],
      flights: [
        "When is the best time to book flights?",
        `Find cheap flights to ${pageData.destination || 'popular destinations'}`,
        "What's included in the ticket price?"
      ],
      restaurants: [
        "Recommend restaurants near my hotel",
        "Find vegetarian-friendly restaurants",
        "What's the local cuisine I should try?"
      ],
      explore: [
        "Suggest hidden gems in India",
        "Plan a road trip itinerary",
        "Best places for solo travelers"
      ]
    };

    return suggestions[pageName] || suggestions.home;
  }, []);

  const value = {
    // State
    chatHistory,
    currentTrip,
    recommendations,

    // Actions
    sendMessage,
    planTrip,
    getHotelRecommendations,
    getFlightRecommendations,
    explainPolicy,
    clearChatHistory,
    clearTripPlan,
    getContextualSuggestions
  };

  return <AIContext.Provider value={value}>{children}</AIContext.Provider>;
};
