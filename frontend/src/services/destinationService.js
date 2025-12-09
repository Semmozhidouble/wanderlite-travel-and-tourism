import api, { apiHelpers } from './api';

/**
 * Destination Service
 * Handles fetching and caching destination data
 */

const DESTINATIONS_ENDPOINT = '/api/destinations';

// Simple in-memory cache
let destinationsCache = null;
let cacheTimestamp = null;
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

export const destinationService = {
  /**
   * Get all destinations with optional filtering
   * @param {Object} options - Query options
   * @param {string} options.category - Filter by category
   * @param {string} options.search - Search query
   * @param {boolean} options.forceRefresh - Skip cache
   * @returns {Promise<{success: boolean, destinations?: Array, error?: string}>}
   */
  getAllDestinations: async (options = {}) => {
    const { category, search, forceRefresh = false } = options;
    
    // Check cache first (only if no filters and not forcing refresh)
    if (!forceRefresh && !category && !search && destinationsCache && cacheTimestamp) {
      const cacheAge = Date.now() - cacheTimestamp;
      if (cacheAge < CACHE_DURATION) {
        console.debug('[Destination Service] Using cached destinations');
        return { success: true, destinations: destinationsCache };
      }
    }
    
    try {
      // Build query params
      const params = {};
      if (category && category !== 'All') params.category = category;
      if (search) params.search = search;
      
      const response = await api.get(DESTINATIONS_ENDPOINT, { params });
      const destinations = response.data;
      
      // Cache results if no filters
      if (!category && !search) {
        destinationsCache = destinations;
        cacheTimestamp = Date.now();
      }
      
      return { success: true, destinations };
    } catch (error) {
      console.error('[Destination Service] Failed to fetch destinations:', error);
      
      // Try to use fallback data from sessionStorage or cache
      if (destinationsCache) {
        console.warn('[Destination Service] Using stale cache due to error');
        return { success: true, destinations: destinationsCache, fromCache: true };
      }
      
      // Try to load from local mock data as last resort
      try {
        const mockData = await import('../data/mock');
        console.warn('[Destination Service] Using local mock data');
        return { success: true, destinations: mockData.destinations, fromMock: true };
      } catch (mockError) {
        return { 
          success: false, 
          error: error.message || 'Failed to load destinations',
          networkError: error.networkError 
        };
      }
    }
  },
  
  /**
   * Get single destination by ID
   * @param {string|number} id - Destination ID
   * @returns {Promise<{success: boolean, destination?: Object, error?: string}>}
   */
  getDestinationById: async (id) => {
    if (!id) {
      return { success: false, error: 'Destination ID is required' };
    }
    
    // Try to get from cache first
    if (destinationsCache) {
      const cached = destinationsCache.find(d => String(d.id) === String(id));
      if (cached) {
        console.debug('[Destination Service] Using cached destination:', id);
        return { success: true, destination: cached, fromCache: true };
      }
    }
    
    // Try sessionStorage for recently viewed destination
    try {
      const sessionKey = `destination_${id}`;
      const sessionData = sessionStorage.getItem(sessionKey);
      if (sessionData) {
        const destination = JSON.parse(sessionData);
        console.debug('[Destination Service] Using session destination:', id);
        return { success: true, destination, fromSession: true };
      }
    } catch (error) {
      console.error('[Destination Service] Session storage error:', error);
    }
    
    try {
      // Fetch from API
      const response = await api.get(`${DESTINATIONS_ENDPOINT}/${id}`);
      const destination = response.data;
      
      // Store in sessionStorage for quick reload
      try {
        sessionStorage.setItem(`destination_${id}`, JSON.stringify(destination));
      } catch (error) {
        console.warn('[Destination Service] Could not cache to session:', error);
      }
      
      return { success: true, destination };
    } catch (error) {
      console.error('[Destination Service] Failed to fetch destination:', id, error);
      
      // Fallback to local mock data
      try {
        const mockData = await import('../data/mock');
        const destination = mockData.destinations.find(d => String(d.id) === String(id));
        if (destination) {
          console.warn('[Destination Service] Using local mock data for destination:', id);
          return { success: true, destination, fromMock: true };
        }
      } catch (mockError) {
        console.error('[Destination Service] Mock data also failed:', mockError);
      }
      
      return { 
        success: false, 
        error: error.status === 404 ? 'Destination not found' : error.message || 'Failed to load destination',
        status: error.status 
      };
    }
  },
  
  /**
   * Get destination by name (for URL slugs)
   * @param {string} name - Destination name or slug
   * @returns {Promise<{success: boolean, destination?: Object, error?: string}>}
   */
  getDestinationByName: async (name) => {
    if (!name) {
      return { success: false, error: 'Destination name is required' };
    }
    
    // Normalize the name for comparison
    const normalizedName = name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    
    // Try cache first
    if (destinationsCache) {
      const cached = destinationsCache.find(d => {
        const destName = d.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
        return destName === normalizedName || destName.includes(normalizedName);
      });
      if (cached) {
        console.debug('[Destination Service] Found destination by name in cache:', name);
        return { success: true, destination: cached, fromCache: true };
      }
    }
    
    // Fetch all and find by name
    const result = await destinationService.getAllDestinations();
    if (result.success && result.destinations) {
      const destination = result.destinations.find(d => {
        const destName = d.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
        return destName === normalizedName || destName.includes(normalizedName);
      });
      
      if (destination) {
        return { success: true, destination };
      }
    }
    
    return { success: false, error: 'Destination not found', status: 404 };
  },
  
  /**
   * Clear destination cache
   */
  clearCache: () => {
    destinationsCache = null;
    cacheTimestamp = null;
    console.debug('[Destination Service] Cache cleared');
  },
  
  /**
   * Preload destinations (useful for app initialization)
   */
  preloadDestinations: async () => {
    console.debug('[Destination Service] Preloading destinations');
    return await destinationService.getAllDestinations();
  },
};

export default destinationService;
