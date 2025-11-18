/**
 * WanderLite AI Service - Google Gemini Integration
 * Handles all AI chat interactions with personality and context
 */

// Use backend AI proxy to avoid CORS and protect API keys
const BACKEND_BASE = (process.env.REACT_APP_BACKEND_URL || 'http://127.0.0.1:8000').replace(/\/$/, '');

// System prompt defining WanderLite AI personality and behavior
const SYSTEM_CONTEXT = `You are WanderLite AI — an advanced, friendly, and knowledgeable travel assistant integrated into a travel planning website.

Your role:
- Help users find destinations, hotels, flights, and restaurants based on their preferences.
- Provide personalized suggestions based on location, budget, and travel type (solo, family, group, romantic, etc.).
- Explain booking and refund policies in simple terms.
- Handle trip planning, itinerary creation, and group coordination.
- Keep tone: friendly, clear, and human-like — never robotic.
- Format answers neatly with bullet points, emojis, and short paragraphs.

Rules:
- Always stay within the context of travel, hotels, restaurants, and flights.
- Never provide fake payment or transaction details.
- If user asks unrelated questions, politely redirect to travel assistance.
- If you need data (like hotel list or flight options), say: "Would you like me to show WanderLite's latest results?" to trigger frontend actions.
- You can ask clarifying questions before giving recommendations.

System Context:
- App name: WanderLite
- Developer: Bro
- Style: Modern, helpful, cheerful AI with human warmth and confidence.

Keep responses concise (under 300 words) unless creating detailed itineraries.`;

class GeminiService {
  constructor() {
    this.conversationHistory = [];
  }

  /**
   * Send a message to Gemini and get AI response
   * @param {string} userMessage - The user's message
   * @param {object} context - Optional context (user data, booking info, etc.)
   * @returns {Promise<string>} AI response
   */
  async chat(userMessage, context = {}) {
    try {
      // Send just the user message - backend has its own system context
      const response = await fetch(`${BACKEND_BASE}/api/ai/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: userMessage, context })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ detail: 'Unknown error' }));
        console.error('AI Proxy Error:', response.status, errorData);
        throw new Error(errorData.detail || `AI Proxy Error: ${response.status}`);
      }

      const data = await response.json();
      const aiResponse = data.answer || 'Sorry, I could not process that. Please try again.';
      this.conversationHistory.push({ user: userMessage, assistant: aiResponse, timestamp: new Date() });
      return aiResponse;
    } catch (error) {
      console.error('AI Chat Error:', { message: error.message, stack: error.stack, backend: BACKEND_BASE });
      return `I'm having trouble connecting right now. 😅 Please try again in a moment, or feel free to browse our hotels and flights directly!`;
    }
  }

  /**
   * Build context string from user and app data
   * @param {object} context - Context object with user info, search params, etc.
   * @returns {string} Formatted context string
   */
  _buildContext(context) {
    const parts = [];
    
    if (context.userName) {
      parts.push(`User: ${context.userName}`);
    }
    
    if (context.currentPage) {
      parts.push(`Current page: ${context.currentPage}`);
    }
    
    if (context.searchParams) {
      parts.push(`User searching for: ${JSON.stringify(context.searchParams)}`);
    }
    
    if (context.bookingData) {
      parts.push(`Recent booking: ${JSON.stringify(context.bookingData)}`);
    }

    if (context.userPreferences) {
      parts.push(`Preferences: ${JSON.stringify(context.userPreferences)}`);
    }
    
    return parts.length > 0 ? parts.join(' | ') : '';
  }

  /**
   * Get trip planning suggestions
   * @param {object} tripData - Trip parameters (destination, budget, duration, type)
   * @returns {Promise<string>} Detailed trip plan
   */
  async planTrip(tripData) {
    const { destination, budget, duration, tripType, travelers } = tripData;
    
    const prompt = `Plan a ${duration}-day trip to ${destination} for ${travelers || 'a traveler'} with a budget of INR ${budget}. Trip type: ${tripType || 'leisure'}. 

Please include:
- Recommended hotels with price ranges
- Flight suggestions (if applicable)
- Daily itinerary with activities
- Restaurant recommendations
- Estimated costs breakdown
- Tips for this destination

Format it beautifully with emojis and clear sections.`;

    return await this.chat(prompt);
  }

  /**
   * Get hotel recommendations based on criteria
   * @param {object} criteria - Hotel search criteria
   * @returns {Promise<string>} Hotel recommendations
   */
  async getHotelRecommendations(criteria) {
    const { location, budget, checkIn, checkOut, guests, preferences } = criteria;
    
    const prompt = `Suggest hotels in ${location} for ${guests || '2'} guests from ${checkIn} to ${checkOut}. Budget: INR ${budget || '5000-10000'} per night. ${preferences ? `Preferences: ${preferences}` : ''}

Please provide 3-5 recommendations with:
- Hotel name and type (budget/mid-range/luxury)
- Key amenities
- Approximate price
- Best for (couples/families/solo/business)

Would you like me to show WanderLite's latest results?`;

    return await this.chat(prompt);
  }

  /**
   * Get flight recommendations
   * @param {object} flightData - Flight search parameters
   * @returns {Promise<string>} Flight suggestions
   */
  async getFlightRecommendations(flightData) {
    const { from, to, date, passengers, class: flightClass } = flightData;
    
    const prompt = `Find flights from ${from} to ${to} on ${date} for ${passengers || '1'} passenger(s) in ${flightClass || 'economy'} class.

Please suggest:
- Best airlines for this route
- Typical price range
- Flight duration
- Best time to book
- Any travel tips

Would you like me to show WanderLite's latest flight options?`;

    return await this.chat(prompt);
  }

  /**
   * Explain booking or refund policy
   * @param {string} policyType - 'booking' or 'refund'
   * @param {string} serviceType - 'hotel', 'flight', or 'restaurant'
   * @returns {Promise<string>} Policy explanation
   */
  async explainPolicy(policyType, serviceType) {
    const prompt = `Explain WanderLite's ${policyType} policy for ${serviceType} bookings in simple, friendly terms. Keep it clear and reassuring.`;
    return await this.chat(prompt);
  }

  /**
   * Clear conversation history
   */
  clearHistory() {
    this.conversationHistory = [];
  }

  /**
   * Get conversation history
   * @returns {Array} Conversation history
   */
  getHistory() {
    return this.conversationHistory;
  }
}

// Export singleton instance
export default new GeminiService();
