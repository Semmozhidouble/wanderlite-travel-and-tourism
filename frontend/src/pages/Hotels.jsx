import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import api from '../services/api';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Card, CardContent } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Checkbox } from '../components/ui/checkbox';
import { Slider } from '../components/ui/slider';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { 
  Hotel, Star, MapPin, Search, Calendar, Users, Filter, Loader2,
  Wifi, UtensilsCrossed, Dumbbell, Car, Waves, Sparkles, Coffee, Tv,
  Heart, Building2, ArrowRight, SlidersHorizontal, Grid3X3, List, RefreshCw
} from 'lucide-react';
import { format, addDays } from 'date-fns';

const Hotels = () => {
  const navigate = useNavigate();
  const [searchParamsUrl, setSearchParamsUrl] = useSearchParams();
  
  // Search state
  const [city, setCity] = useState(searchParamsUrl.get('city') || '');
  const [checkIn, setCheckIn] = useState(searchParamsUrl.get('checkIn') || format(addDays(new Date(), 1), 'yyyy-MM-dd'));
  const [checkOut, setCheckOut] = useState(searchParamsUrl.get('checkOut') || format(addDays(new Date(), 2), 'yyyy-MM-dd'));
  const [adults, setAdults] = useState(parseInt(searchParamsUrl.get('adults')) || 2);
  const [children, setChildren] = useState(parseInt(searchParamsUrl.get('children')) || 0);
  const [rooms, setRooms] = useState(parseInt(searchParamsUrl.get('rooms')) || 1);
  
  // Results state
  const [hotels, setHotels] = useState([]);
  const [loading, setLoading] = useState(false);
  const [totalResults, setTotalResults] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [searchPerformed, setSearchPerformed] = useState(false);
  
  // Filter state
  const [showFilters, setShowFilters] = useState(true);
  const [starRatings, setStarRatings] = useState([]);
  const [priceRange, setPriceRange] = useState([0, 50000]);
  const [freeCancellation, setFreeCancellation] = useState(false);
  const [breakfastIncluded, setBreakfastIncluded] = useState(false);
  const [sortBy, setSortBy] = useState('popularity');
  const [viewMode, setViewMode] = useState('grid');
  
  // City suggestions
  const [citySuggestions, setCitySuggestions] = useState([]);
  const [showCitySuggestions, setShowCitySuggestions] = useState(false);
  const [popularCities, setPopularCities] = useState([]);
  const [featuredHotels, setFeaturedHotels] = useState([]);
  
  // Fetch popular cities on mount
  useEffect(() => {
    fetchPopularCities();
    fetchFeaturedHotels();
  }, []);
  
  const fetchPopularCities = async () => {
    try {
      const response = await api.get('/api/hotel/popular-cities');
      setPopularCities(response.data.cities || []);
    } catch (error) {
      console.error('Error fetching popular cities:', error);
    }
  };
  
  const fetchFeaturedHotels = async () => {
    try {
      const response = await api.get('/api/hotel/featured?limit=6');
      setFeaturedHotels(response.data.hotels || []);
    } catch (error) {
      console.error('Error fetching featured hotels:', error);
    }
  };
  
  // Fetch city suggestions
  const fetchCitySuggestions = useCallback(async (search) => {
    if (search.length < 2) {
      setCitySuggestions([]);
      return;
    }
    
    try {
      const response = await api.get(`/api/hotel/cities?search=${encodeURIComponent(search)}`);
      setCitySuggestions(response.data || []);
    } catch (error) {
      console.error('Error fetching city suggestions:', error);
    }
  }, []);
  
  // Debounced city search
  useEffect(() => {
    const timer = setTimeout(() => {
      if (city) {
        fetchCitySuggestions(city);
      }
    }, 300);
    
    return () => clearTimeout(timer);
  }, [city, fetchCitySuggestions]);
  
  // Search hotels
  const searchHotels = async (page = 1) => {
    if (!city.trim()) {
      alert('Please enter a city');
      return;
    }
    
    setLoading(true);
    setSearchPerformed(true);
    
    try {
      const response = await api.post('/api/hotel/search', {
        city: city,
        check_in_date: checkIn,
        check_out_date: checkOut,
        adults: adults,
        children: children,
        rooms: rooms,
        star_rating: starRatings.length > 0 ? starRatings : null,
        min_price: priceRange[0] > 0 ? priceRange[0] : null,
        max_price: priceRange[1] < 50000 ? priceRange[1] : null,
        free_cancellation: freeCancellation || null,
        breakfast_included: breakfastIncluded || null,
        sort_by: sortBy,
        page: page,
        limit: 12
      });
      
      setHotels(response.data.hotels || []);
      setTotalResults(response.data.total || 0);
      setCurrentPage(response.data.page || 1);
      setTotalPages(response.data.pages || 1);
      
      // Update URL params
      const params = new URLSearchParams();
      params.set('city', city);
      params.set('checkIn', checkIn);
      params.set('checkOut', checkOut);
      params.set('adults', adults.toString());
      params.set('children', children.toString());
      params.set('rooms', rooms.toString());
      setSearchParamsUrl(params);
      
    } catch (error) {
      console.error('Error searching hotels:', error);
      alert('Failed to search hotels. Please try again.');
    } finally {
      setLoading(false);
    }
  };
  
  // Handle city selection
  const selectCity = (selectedCity) => {
    setCity(selectedCity.city);
    setShowCitySuggestions(false);
    setCitySuggestions([]);
  };
  
  // Calculate nights
  const calculateNights = () => {
    const start = new Date(checkIn);
    const end = new Date(checkOut);
    return Math.max(1, Math.ceil((end - start) / (1000 * 60 * 60 * 24)));
  };
  
  // Toggle star rating filter
  const toggleStarRating = (star) => {
    setStarRatings(prev => 
      prev.includes(star) ? prev.filter(s => s !== star) : [...prev, star]
    );
  };
  
  // Amenity icons mapping
  const amenityIcons = {
    'Free WiFi': Wifi,
    'High-Speed WiFi': Wifi,
    'Premium WiFi': Wifi,
    'WiFi': Wifi,
    'Restaurant': UtensilsCrossed,
    'Multi-Cuisine Restaurant': UtensilsCrossed,
    'Fine Dining Restaurants': UtensilsCrossed,
    'Gym': Dumbbell,
    'Fitness Center': Dumbbell,
    'World-Class Gym': Dumbbell,
    'Parking': Car,
    'Valet Parking': Car,
    'Swimming Pool': Waves,
    'Infinity Pool': Waves,
    'Pool': Waves,
    'Spa': Sparkles,
    'Luxury Spa': Sparkles,
    'Breakfast': Coffee,
    'TV': Tv,
    'Smart TV': Tv,
    'default': Hotel
  };
  
  const getAmenityIcon = (amenity) => {
    const Icon = amenityIcons[amenity] || amenityIcons['default'];
    return <Icon className="w-4 h-4" />;
  };
  
  // Render stars
  const renderStars = (count) => {
    return Array(count).fill(0).map((_, i) => (
      <Star key={i} className="w-4 h-4 fill-yellow-400 text-yellow-400" />
    ));
  };
  
  // Navigate to hotel detail
  const viewHotelDetails = (hotel) => {
    navigate(`/hotel/${hotel.id}`, {
      state: {
        checkIn,
        checkOut,
        adults,
        children,
        rooms,
        nights: calculateNights()
      }
    });
  };
  
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 pt-20">
      {/* Hero Section with Search */}
      <div className="bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 text-white">
        <div className="max-w-7xl mx-auto px-4 py-12">
          <div className="text-center mb-8">
            <h1 className="text-4xl font-bold mb-2">Find Your Perfect Stay</h1>
            <p className="text-blue-100">Search from 1000+ hotels across India</p>
          </div>
          
          {/* Search Form */}
          <Card className="bg-white/95 backdrop-blur shadow-2xl border-0">
            <CardContent className="p-6">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-4">
                {/* City Input */}
                <div className="lg:col-span-2 relative">
                  <label className="block text-sm font-medium text-gray-700 mb-1">City / Destination</label>
                  <div className="relative">
                    <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                    <Input
                      type="text"
                      placeholder="Where are you going?"
                      value={city}
                      onChange={(e) => {
                        setCity(e.target.value);
                        setShowCitySuggestions(true);
                      }}
                      onFocus={() => setShowCitySuggestions(true)}
                      className="pl-10 h-12 text-gray-900"
                    />
                  </div>
                  
                  {/* City Suggestions Dropdown */}
                  {showCitySuggestions && citySuggestions.length > 0 && (
                    <div className="absolute z-50 w-full mt-1 bg-white border rounded-lg shadow-lg max-h-60 overflow-auto">
                      {citySuggestions.map((suggestion, idx) => (
                        <button
                          key={idx}
                          className="w-full px-4 py-3 text-left hover:bg-blue-50 flex items-center gap-3 border-b last:border-b-0"
                          onClick={() => selectCity(suggestion)}
                        >
                          <MapPin className="w-4 h-4 text-blue-500" />
                          <div>
                            <div className="font-medium text-gray-900">{suggestion.city}</div>
                            <div className="text-sm text-gray-500">{suggestion.state}, {suggestion.country} • {suggestion.hotel_count} hotels</div>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                
                {/* Check-in Date */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Check-in</label>
                  <div className="relative">
                    <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                    <Input
                      type="date"
                      value={checkIn}
                      min={format(new Date(), 'yyyy-MM-dd')}
                      onChange={(e) => {
                        setCheckIn(e.target.value);
                        if (new Date(e.target.value) >= new Date(checkOut)) {
                          setCheckOut(format(addDays(new Date(e.target.value), 1), 'yyyy-MM-dd'));
                        }
                      }}
                      className="pl-10 h-12 text-gray-900"
                    />
                  </div>
                </div>
                
                {/* Check-out Date */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Check-out</label>
                  <div className="relative">
                    <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                    <Input
                      type="date"
                      value={checkOut}
                      min={format(addDays(new Date(checkIn), 1), 'yyyy-MM-dd')}
                      onChange={(e) => setCheckOut(e.target.value)}
                      className="pl-10 h-12 text-gray-900"
                    />
                  </div>
                </div>
                
                {/* Guests & Rooms */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Guests & Rooms</label>
                  <Select
                    value={`${adults}-${children}-${rooms}`}
                    onValueChange={(val) => {
                      const [a, c, r] = val.split('-').map(Number);
                      setAdults(a);
                      setChildren(c);
                      setRooms(r);
                    }}
                  >
                    <SelectTrigger className="h-12">
                      <div className="flex items-center gap-2">
                        <Users className="w-4 h-4 text-gray-400" />
                        <span>{adults}A, {children}C, {rooms}R</span>
                      </div>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1-0-1">1 Adult, 0 Children, 1 Room</SelectItem>
                      <SelectItem value="2-0-1">2 Adults, 0 Children, 1 Room</SelectItem>
                      <SelectItem value="2-1-1">2 Adults, 1 Child, 1 Room</SelectItem>
                      <SelectItem value="2-2-1">2 Adults, 2 Children, 1 Room</SelectItem>
                      <SelectItem value="3-0-1">3 Adults, 0 Children, 1 Room</SelectItem>
                      <SelectItem value="4-0-2">4 Adults, 0 Children, 2 Rooms</SelectItem>
                      <SelectItem value="4-2-2">4 Adults, 2 Children, 2 Rooms</SelectItem>
                      <SelectItem value="6-0-3">6 Adults, 0 Children, 3 Rooms</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                
                {/* Search Button */}
                <div className="flex items-end">
                  <Button 
                    onClick={() => searchHotels(1)} 
                    className="w-full h-12 bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600 text-white font-semibold"
                    disabled={loading}
                  >
                    {loading ? (
                      <Loader2 className="w-5 h-5 animate-spin" />
                    ) : (
                      <>
                        <Search className="w-5 h-5 mr-2" />
                        Search
                      </>
                    )}
                  </Button>
                </div>
              </div>
              
              {/* Quick Info */}
              {city && checkIn && checkOut && (
                <div className="mt-4 pt-4 border-t flex flex-wrap items-center gap-4 text-sm text-gray-600">
                  <span className="flex items-center gap-1">
                    <Calendar className="w-4 h-4" />
                    {calculateNights()} Night{calculateNights() > 1 ? 's' : ''}
                  </span>
                  <span>•</span>
                  <span>{format(new Date(checkIn), 'EEE, MMM d')} → {format(new Date(checkOut), 'EEE, MMM d, yyyy')}</span>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
      
      {/* Results Section */}
      {searchPerformed ? (
        <div className="max-w-7xl mx-auto px-4 py-8">
          <div className="flex gap-6">
            {/* Filters Sidebar */}
            <div className={`hidden lg:block ${showFilters ? 'w-72' : 'w-0'} transition-all duration-300 overflow-hidden`}>
              <Card className="sticky top-24">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="font-semibold flex items-center gap-2">
                      <Filter className="w-4 h-4" />
                      Filters
                    </h3>
                    <Button 
                      variant="ghost" 
                      size="sm"
                      onClick={() => {
                        setStarRatings([]);
                        setPriceRange([0, 50000]);
                        setFreeCancellation(false);
                        setBreakfastIncluded(false);
                      }}
                    >
                      <RefreshCw className="w-4 h-4 mr-1" />
                      Reset
                    </Button>
                  </div>
                  
                  {/* Star Rating Filter */}
                  <div className="mb-6">
                    <h4 className="font-medium mb-3">Star Rating</h4>
                    <div className="space-y-2">
                      {[5, 4, 3, 2, 1].map(star => (
                        <label key={star} className="flex items-center gap-2 cursor-pointer">
                          <Checkbox
                            checked={starRatings.includes(star)}
                            onCheckedChange={() => toggleStarRating(star)}
                          />
                          <div className="flex items-center gap-1">
                            {renderStars(star)}
                          </div>
                        </label>
                      ))}
                    </div>
                  </div>
                  
                  {/* Price Range Filter */}
                  <div className="mb-6">
                    <h4 className="font-medium mb-3">Price per Night</h4>
                    <Slider
                      value={priceRange}
                      min={0}
                      max={50000}
                      step={500}
                      onValueChange={setPriceRange}
                      className="mb-2"
                    />
                    <div className="flex justify-between text-sm text-gray-600">
                      <span>₹{priceRange[0].toLocaleString()}</span>
                      <span>₹{priceRange[1].toLocaleString()}</span>
                    </div>
                  </div>
                  
                  {/* Quick Filters */}
                  <div className="mb-6">
                    <h4 className="font-medium mb-3">Popular Filters</h4>
                    <div className="space-y-2">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <Checkbox
                          checked={freeCancellation}
                          onCheckedChange={setFreeCancellation}
                        />
                        <span className="text-sm">Free Cancellation</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <Checkbox
                          checked={breakfastIncluded}
                          onCheckedChange={setBreakfastIncluded}
                        />
                        <span className="text-sm">Breakfast Included</span>
                      </label>
                    </div>
                  </div>
                  
                  <Button 
                    onClick={() => searchHotels(1)} 
                    className="w-full bg-blue-600 hover:bg-blue-700"
                  >
                    Apply Filters
                  </Button>
                </CardContent>
              </Card>
            </div>
            
            {/* Results List */}
            <div className="flex-1">
              {/* Results Header */}
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-4">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowFilters(!showFilters)}
                    className="lg:hidden"
                  >
                    <SlidersHorizontal className="w-4 h-4 mr-1" />
                    Filters
                  </Button>
                  <span className="text-gray-600">
                    {totalResults} hotels found in {city}
                  </span>
                </div>
                
                <div className="flex items-center gap-3">
                  {/* Sort */}
                  <Select value={sortBy} onValueChange={(val) => { setSortBy(val); searchHotels(1); }}>
                    <SelectTrigger className="w-40">
                      <SelectValue placeholder="Sort by" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="popularity">Popularity</SelectItem>
                      <SelectItem value="price_low">Price: Low to High</SelectItem>
                      <SelectItem value="price_high">Price: High to Low</SelectItem>
                      <SelectItem value="rating">Guest Rating</SelectItem>
                      <SelectItem value="distance">Distance</SelectItem>
                    </SelectContent>
                  </Select>
                  
                  {/* View Toggle */}
                  <div className="hidden md:flex border rounded-lg">
                    <Button
                      variant={viewMode === 'grid' ? 'default' : 'ghost'}
                      size="sm"
                      onClick={() => setViewMode('grid')}
                      className="rounded-r-none"
                    >
                      <Grid3X3 className="w-4 h-4" />
                    </Button>
                    <Button
                      variant={viewMode === 'list' ? 'default' : 'ghost'}
                      size="sm"
                      onClick={() => setViewMode('list')}
                      className="rounded-l-none"
                    >
                      <List className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </div>
              
              {/* Loading State */}
              {loading ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {[1, 2, 3, 4].map(i => (
                    <Card key={i} className="animate-pulse">
                      <div className="h-48 bg-gray-200 rounded-t-lg" />
                      <CardContent className="p-4">
                        <div className="h-6 bg-gray-200 rounded w-3/4 mb-2" />
                        <div className="h-4 bg-gray-200 rounded w-1/2 mb-4" />
                        <div className="h-4 bg-gray-200 rounded w-full mb-2" />
                        <div className="h-8 bg-gray-200 rounded w-1/3" />
                      </CardContent>
                    </Card>
                  ))}
                </div>
              ) : hotels.length === 0 ? (
                <Card className="p-12 text-center">
                  <Hotel className="w-16 h-16 mx-auto text-gray-300 mb-4" />
                  <h3 className="text-xl font-semibold mb-2">No hotels found</h3>
                  <p className="text-gray-500 mb-4">Try adjusting your search filters</p>
                  <Button variant="outline" onClick={() => {
                    setStarRatings([]);
                    setPriceRange([0, 50000]);
                    setFreeCancellation(false);
                    setBreakfastIncluded(false);
                    searchHotels(1);
                  }}>
                    Reset Filters
                  </Button>
                </Card>
              ) : (
                <>
                  {/* Hotel Cards */}
                  <div className={`grid ${viewMode === 'grid' ? 'grid-cols-1 md:grid-cols-2' : 'grid-cols-1'} gap-4`}>
                    {hotels.map(hotel => (
                      <Card 
                        key={hotel.id} 
                        className={`overflow-hidden hover:shadow-xl transition-all duration-300 cursor-pointer group ${
                          viewMode === 'list' ? 'flex' : ''
                        }`}
                        onClick={() => viewHotelDetails(hotel)}
                      >
                        {/* Image */}
                        <div className={`relative ${viewMode === 'list' ? 'w-72 flex-shrink-0' : 'h-48'}`}>
                          <img
                            src={hotel.primary_image || 'https://images.unsplash.com/photo-1566073771259-6a8506099945?w=800'}
                            alt={hotel.name}
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                          />
                          <div className="absolute top-3 left-3 flex gap-2">
                            {hotel.free_cancellation && (
                              <Badge className="bg-green-500 text-white text-xs">Free Cancel</Badge>
                            )}
                            {hotel.breakfast_included && (
                              <Badge className="bg-orange-500 text-white text-xs">Breakfast</Badge>
                            )}
                          </div>
                          <button 
                            className="absolute top-3 right-3 p-2 bg-white/80 rounded-full hover:bg-white transition-colors"
                            onClick={(e) => { e.stopPropagation(); }}
                          >
                            <Heart className="w-4 h-4 text-gray-600 hover:text-red-500" />
                          </button>
                        </div>
                        
                        {/* Content */}
                        <CardContent className="p-4 flex-1">
                          <div className="flex items-start justify-between mb-2">
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-1">
                                <div className="flex">{renderStars(hotel.star_category)}</div>
                                {hotel.hotel_type && (
                                  <Badge variant="outline" className="text-xs">{hotel.hotel_type}</Badge>
                                )}
                              </div>
                              <h3 className="font-semibold text-lg text-gray-900 group-hover:text-blue-600 transition-colors line-clamp-1">
                                {hotel.name}
                              </h3>
                            </div>
                            <div className="text-right ml-2">
                              <div className="flex items-center gap-1 bg-green-600 text-white px-2 py-1 rounded">
                                <Star className="w-3 h-3 fill-white" />
                                <span className="font-semibold text-sm">{hotel.rating?.toFixed(1)}</span>
                              </div>
                              <span className="text-xs text-gray-500">{hotel.reviews_count} reviews</span>
                            </div>
                          </div>
                          
                          <div className="flex items-center gap-1 text-sm text-gray-500 mb-3">
                            <MapPin className="w-4 h-4 flex-shrink-0" />
                            <span className="line-clamp-1">{hotel.landmark || hotel.address || hotel.city}</span>
                            {hotel.distance_from_center && (
                              <span className="text-blue-600 flex-shrink-0">• {hotel.distance_from_center} km</span>
                            )}
                          </div>
                          
                          {/* Amenities */}
                          <div className="flex flex-wrap gap-2 mb-4">
                            {hotel.amenities?.slice(0, 4).map((amenity, idx) => (
                              <span key={idx} className="flex items-center gap-1 text-xs text-gray-600 bg-gray-100 px-2 py-1 rounded">
                                {getAmenityIcon(amenity)}
                                <span className="hidden sm:inline">{amenity}</span>
                              </span>
                            ))}
                            {hotel.amenities?.length > 4 && (
                              <span className="text-xs text-blue-600 px-2 py-1">
                                +{hotel.amenities.length - 4} more
                              </span>
                            )}
                          </div>
                          
                          {/* Price */}
                          <div className="flex items-end justify-between">
                            <div>
                              {hotel.original_price && (
                                <span className="text-sm text-gray-400 line-through mr-2">
                                  ₹{hotel.original_price.toLocaleString()}
                                </span>
                              )}
                              <span className="text-2xl font-bold text-gray-900">
                                ₹{hotel.price_per_night?.toLocaleString()}
                              </span>
                              <span className="text-sm text-gray-500">/night</span>
                              <div className="text-sm text-gray-600">
                                ₹{hotel.total_price?.toLocaleString()} total for {hotel.nights} night{hotel.nights > 1 ? 's' : ''}
                              </div>
                            </div>
                            <Button className="bg-blue-600 hover:bg-blue-700">
                              View Deal
                              <ArrowRight className="w-4 h-4 ml-1" />
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                  
                  {/* Pagination */}
                  {totalPages > 1 && (
                    <div className="flex justify-center items-center gap-2 mt-8">
                      <Button
                        variant="outline"
                        disabled={currentPage === 1}
                        onClick={() => searchHotels(currentPage - 1)}
                      >
                        Previous
                      </Button>
                      
                      {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                        let page;
                        if (totalPages <= 5) {
                          page = i + 1;
                        } else if (currentPage <= 3) {
                          page = i + 1;
                        } else if (currentPage >= totalPages - 2) {
                          page = totalPages - 4 + i;
                        } else {
                          page = currentPage - 2 + i;
                        }
                        return (
                          <Button
                            key={page}
                            variant={currentPage === page ? 'default' : 'outline'}
                            onClick={() => searchHotels(page)}
                          >
                            {page}
                          </Button>
                        );
                      })}
                      
                      <Button
                        variant="outline"
                        disabled={currentPage === totalPages}
                        onClick={() => searchHotels(currentPage + 1)}
                      >
                        Next
                      </Button>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      ) : (
        /* Initial Landing Content */
        <div className="max-w-7xl mx-auto px-4 py-12">
          {/* Popular Cities */}
          {popularCities.length > 0 && (
            <section className="mb-12">
              <h2 className="text-2xl font-bold mb-6 flex items-center gap-2">
                <Building2 className="w-6 h-6 text-blue-600" />
                Popular Destinations
              </h2>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                {popularCities.map((cityItem, idx) => (
                  <Card 
                    key={idx}
                    className="overflow-hidden cursor-pointer group hover:shadow-lg transition-all"
                    onClick={() => {
                      setCity(cityItem.city);
                      setTimeout(() => searchHotels(1), 100);
                    }}
                  >
                    <div className="relative h-32">
                      <img
                        src={cityItem.image}
                        alt={cityItem.city}
                        className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent" />
                      <div className="absolute bottom-2 left-2 text-white">
                        <h3 className="font-semibold">{cityItem.city}</h3>
                        <p className="text-xs text-gray-200">{cityItem.hotel_count} hotels</p>
                      </div>
                    </div>
                    <CardContent className="p-2 bg-gray-50">
                      <p className="text-xs text-gray-600">Starting from</p>
                      <p className="font-semibold text-blue-600">₹{cityItem.starting_price?.toLocaleString()}</p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </section>
          )}
          
          {/* Featured Hotels */}
          {featuredHotels.length > 0 && (
            <section>
              <h2 className="text-2xl font-bold mb-6 flex items-center gap-2">
                <Star className="w-6 h-6 text-yellow-500" />
                Featured Hotels
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {featuredHotels.map(hotel => (
                  <Card 
                    key={hotel.id}
                    className="overflow-hidden cursor-pointer group hover:shadow-xl transition-all"
                    onClick={() => navigate(`/hotel/${hotel.id}`)}
                  >
                    <div className="relative h-48">
                      <img
                        src={hotel.primary_image || 'https://images.unsplash.com/photo-1566073771259-6a8506099945?w=800'}
                        alt={hotel.name}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                      />
                      <div className="absolute top-3 left-3 flex gap-1">
                        {renderStars(hotel.star_category)}
                      </div>
                      {hotel.free_cancellation && (
                        <Badge className="absolute top-3 right-3 bg-green-500">Free Cancellation</Badge>
                      )}
                    </div>
                    <CardContent className="p-4">
                      <h3 className="font-semibold text-lg mb-1 group-hover:text-blue-600 transition-colors">
                        {hotel.name}
                      </h3>
                      <p className="text-sm text-gray-500 flex items-center gap-1 mb-3">
                        <MapPin className="w-4 h-4" />
                        {hotel.city}, {hotel.state}
                      </p>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className="flex items-center gap-1 bg-green-600 text-white px-2 py-1 rounded text-sm">
                            <Star className="w-3 h-3 fill-white" />
                            {hotel.rating?.toFixed(1)}
                          </div>
                          <span className="text-xs text-gray-500">{hotel.reviews_count} reviews</span>
                        </div>
                        <div className="text-right">
                          {hotel.original_price && (
                            <span className="text-sm text-gray-400 line-through block">
                              ₹{hotel.original_price.toLocaleString()}
                            </span>
                          )}
                          <span className="text-xl font-bold text-blue-600">
                            ₹{hotel.price_per_night?.toLocaleString()}
                          </span>
                          <span className="text-xs text-gray-500">/night</span>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
};

export default Hotels;
