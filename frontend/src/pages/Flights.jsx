import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardFooter, CardHeader } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Plane, Clock, Users, ArrowRight, MapPin } from 'lucide-react';
import { format, addDays } from 'date-fns';

const Flights = () => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('roundtrip'); // roundtrip, oneway, multicity
  const [loading, setLoading] = useState(false);
  const [flights, setFlights] = useState([]);
  const [airports, setAirports] = useState([]);
  const [showOriginDropdown, setShowOriginDropdown] = useState(false);
  const [showDestDropdown, setShowDestDropdown] = useState(false);
  const [originSearch, setOriginSearch] = useState('');
  const [destSearch, setDestSearch] = useState('');
  
  const [searchParams, setSearchParams] = useState({
    origin_code: '',
    destination_code: '',
    departure_date: format(new Date(), 'yyyy-MM-dd'),
    return_date: format(addDays(new Date(), 1), 'yyyy-MM-dd'),
    trip_type: 'round_trip',
    passengers_adult: 1,
    passengers_child: 0,
    passengers_infant: 0,
    seat_class: 'economy'
  });

  const [sortBy, setSortBy] = useState('price'); // price, duration, departure
  const [filterClass, setFilterClass] = useState('all');

  // Fetch airports on mount
  useEffect(() => {
    const fetchAirports = async () => {
      try {
        const response = await api.get('/api/flight/airports');
        setAirports(response.data || []);
      } catch (error) {
        console.error('Error fetching airports:', error);
      }
    };
    fetchAirports();
  }, []);

  // Filter airports based on search
  const filteredOriginAirports = originSearch
    ? airports.filter(a => 
        a.code?.toLowerCase().includes(originSearch.toLowerCase()) ||
        a.city?.toLowerCase().includes(originSearch.toLowerCase()) ||
        a.name?.toLowerCase().includes(originSearch.toLowerCase())
      ).slice(0, 5)
    : [];

  const filteredDestAirports = destSearch
    ? airports.filter(a => 
        a.code?.toLowerCase().includes(destSearch.toLowerCase()) ||
        a.city?.toLowerCase().includes(destSearch.toLowerCase()) ||
        a.name?.toLowerCase().includes(destSearch.toLowerCase())
      ).slice(0, 5)
    : [];

  const selectOrigin = (airport) => {
    setSearchParams({ ...searchParams, origin_code: airport.code });
    setOriginSearch('');
    setShowOriginDropdown(false);
  };

  const selectDestination = (airport) => {
    setSearchParams({ ...searchParams, destination_code: airport.code });
    setDestSearch('');
    setShowDestDropdown(false);
  };

  const swapOriginDest = () => {
    setSearchParams({
      ...searchParams,
      origin_code: searchParams.destination_code,
      destination_code: searchParams.origin_code
    });
  };

  const searchFlights = async () => {
    if (!searchParams.origin_code || !searchParams.destination_code) {
      alert('Please select origin and destination');
      return;
    }

    if (searchParams.trip_type === 'round_trip' && !searchParams.return_date) {
      alert('Please select return date for round trip');
      return;
    }

    setLoading(true);
    try {
      const response = await api.post('/api/flight/search', {
        origin_code: searchParams.origin_code,
        destination_code: searchParams.destination_code,
        departure_date: searchParams.departure_date,
        return_date: searchParams.trip_type === 'round_trip' ? searchParams.return_date : null,
        trip_type: searchParams.trip_type,
        passengers_adult: searchParams.passengers_adult,
        passengers_child: searchParams.passengers_child,
        passengers_infant: searchParams.passengers_infant,
        seat_class: searchParams.seat_class
      });
      
      let results = response.data.outbound || [];
      
      // Apply filters
      if (filterClass !== 'all') {
        results = results.filter(f => {
          const availableSeats = filterClass === 'business' ? f.available_business : f.available_economy;
          return availableSeats > 0;
        });
      }

      // Apply sorting
      if (sortBy === 'price') {
        results.sort((a, b) => {
          const priceA = searchParams.seat_class === 'economy' ? a.economy_price : (a.business_price || a.economy_price * 3);
          const priceB = searchParams.seat_class === 'economy' ? b.economy_price : (b.business_price || b.economy_price * 3);
          return priceA - priceB;
        });
      } else if (sortBy === 'duration') {
        results.sort((a, b) => a.duration_mins - b.duration_mins);
      } else if (sortBy === 'departure') {
        results.sort((a, b) => a.departure_time.localeCompare(b.departure_time));
      }

      setFlights(results);
    } catch (error) {
      console.error('Error searching flights:', error);
      alert('Failed to search flights. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const bookFlight = (flight) => {
    navigate('/flights/booking', {
      state: {
        flight,
        searchParams,
        schedule_id: flight.schedule_id
      }
    });
  };
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white py-12">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex items-center gap-3 mb-4">
            <Plane className="w-10 h-10" />
            <h1 className="text-4xl font-bold">Flight Bookings</h1>
          </div>
          <p className="text-blue-100 text-lg">Search and book flights from India&apos;s best airlines</p>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* Search Form */}
        <Card className="shadow-xl -mt-8 relative z-10 mb-8">
          <CardHeader>
            <div className="flex gap-4 mb-4">
              {['roundtrip', 'oneway', 'multicity'].map(tab => (
                <button
                  key={tab}
                  onClick={() => {
                    setActiveTab(tab);
                    setSearchParams({
                      ...searchParams,
                      trip_type: tab === 'roundtrip' ? 'round_trip' : tab === 'oneway' ? 'one_way' : 'multi_city'
                    });
                  }}
                  className={`px-6 py-2 rounded-lg font-medium transition ${
                    activeTab === tab
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  {tab === 'roundtrip' ? 'Round Trip' : tab === 'oneway' ? 'One Way' : 'Multi City'}
                </button>
              ))}
            </div>
          </CardHeader>

          <CardContent>
            <div className="space-y-6">
              {/* Route Selection */}
              <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                {/* Origin */}
                <div className="relative">
                  <label className="block text-sm font-medium text-gray-700 mb-2">From</label>
                  <div className="relative">
                    <MapPin className="absolute left-3 top-3 w-4 h-4 text-gray-400" />
                    <input
                      type="text"
                      placeholder="Departure city"
                      value={originSearch || searchParams.origin_code}
                      onChange={(e) => {
                        setOriginSearch(e.target.value);
                        setShowOriginDropdown(true);
                      }}
                      onFocus={() => setShowOriginDropdown(true)}
                      className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                    {showOriginDropdown && filteredOriginAirports.length > 0 && (
                      <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-300 rounded-lg shadow-lg z-20">
                        {filteredOriginAirports.map(airport => (
                          <button
                            key={airport.id}
                            onClick={() => selectOrigin(airport)}
                            className="w-full text-left px-4 py-2 hover:bg-blue-50 transition"
                          >
                            <div className="font-medium text-gray-900">{airport.code}</div>
                            <div className="text-sm text-gray-600">{airport.city}, {airport.country}</div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Swap Button */}
                <div className="flex items-end justify-center">
                  <button
                    onClick={swapOriginDest}
                    className="p-2 rounded-full bg-blue-100 hover:bg-blue-200 transition text-blue-600"
                    title="Swap"
                  >
                    <ArrowRight className="w-5 h-5 rotate-90" />
                  </button>
                </div>

                {/* Destination */}
                <div className="relative">
                  <label className="block text-sm font-medium text-gray-700 mb-2">To</label>
                  <div className="relative">
                    <MapPin className="absolute left-3 top-3 w-4 h-4 text-gray-400" />
                    <input
                      type="text"
                      placeholder="Arrival city"
                      value={destSearch || searchParams.destination_code}
                      onChange={(e) => {
                        setDestSearch(e.target.value);
                        setShowDestDropdown(true);
                      }}
                      onFocus={() => setShowDestDropdown(true)}
                      className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                    {showDestDropdown && filteredDestAirports.length > 0 && (
                      <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-300 rounded-lg shadow-lg z-20">
                        {filteredDestAirports.map(airport => (
                          <button
                            key={airport.id}
                            onClick={() => selectDestination(airport)}
                            className="w-full text-left px-4 py-2 hover:bg-blue-50 transition"
                          >
                            <div className="font-medium text-gray-900">{airport.code}</div>
                            <div className="text-sm text-gray-600">{airport.city}, {airport.country}</div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Departure Date */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Departure</label>
                  <input
                    type="date"
                    value={searchParams.departure_date}
                    onChange={(e) => setSearchParams({ ...searchParams, departure_date: e.target.value })}
                    min={format(new Date(), 'yyyy-MM-dd')}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>

                {/* Return Date (for round trip) */}
                {activeTab === 'roundtrip' && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Return</label>
                    <input
                      type="date"
                      value={searchParams.return_date}
                      onChange={(e) => setSearchParams({ ...searchParams, return_date: e.target.value })}
                      min={searchParams.departure_date}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                )}
              </div>

              {/* Passengers and Class Selection */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    <Users className="inline w-4 h-4 mr-1" />
                    Adults
                  </label>
                  <select
                    value={searchParams.passengers_adult}
                    onChange={(e) => setSearchParams({ ...searchParams, passengers_adult: parseInt(e.target.value) })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => (
                      <option key={n} value={n}>{n} {n === 1 ? 'Adult' : 'Adults'}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Children (2-12)</label>
                  <select
                    value={searchParams.passengers_child}
                    onChange={(e) => setSearchParams({ ...searchParams, passengers_child: parseInt(e.target.value) })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    {[0, 1, 2, 3, 4, 5, 6].map(n => (
                      <option key={n} value={n}>{n}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Infants</label>
                  <select
                    value={searchParams.passengers_infant}
                    onChange={(e) => setSearchParams({ ...searchParams, passengers_infant: parseInt(e.target.value) })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    {[0, 1, 2, 3].map(n => (
                      <option key={n} value={n}>{n}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Cabin Class</label>
                  <select
                    value={searchParams.seat_class}
                    onChange={(e) => setSearchParams({ ...searchParams, seat_class: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    <option value="economy">Economy</option>
                    <option value="business">Business</option>
                  </select>
                </div>
              </div>
            </div>
          </CardContent>

          <CardFooter>
            <Button
              onClick={searchFlights}
              disabled={loading}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white py-3 rounded-lg font-medium text-lg"
            >
              {loading ? 'Searching Flights...' : 'Search Flights'}
            </Button>
          </CardFooter>
        </Card>

        {/* Filter and Sort Options */}
        {flights.length > 0 && (
          <div className="flex gap-4 mb-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Sort By</label>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                className="px-4 py-2 border border-gray-300 rounded-lg"
              >
                <option value="price">Lowest Price</option>
                <option value="duration">Shortest Duration</option>
                <option value="departure">Earliest Departure</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Class</label>
              <select
                value={filterClass}
                onChange={(e) => setFilterClass(e.target.value)}
                className="px-4 py-2 border border-gray-300 rounded-lg"
              >
                <option value="all">All Classes</option>
                <option value="economy">Economy</option>
                <option value="business">Business</option>
              </select>
            </div>
          </div>
        )}

        {/* Flight Results */}
        {flights.length > 0 && (
          <div className="space-y-4">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">
              {flights.length} {flights.length === 1 ? 'Flight' : 'Flights'} Found
            </h2>
            {flights.map((flight, idx) => {
              const price = searchParams.seat_class === 'economy' ? flight.economy_price : (flight.business_price || flight.economy_price * 3);
              const totalPrice = price * (searchParams.passengers_adult + searchParams.passengers_child);
              
              return (
                <Card key={idx} className="hover:shadow-xl transition-shadow overflow-hidden">
                  <CardContent className="p-6">
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                      {/* Airline Info */}
                      <div>
                        <div className="flex items-center gap-3 mb-4">
                          {flight.airline_logo && (
                            <img src={flight.airline_logo} alt={flight.airline_name} className="w-12 h-12 object-contain" />
                          )}
                          <div>
                            <p className="font-bold text-gray-900">{flight.airline_name}</p>
                            <p className="text-sm text-gray-600">{flight.flight_number}</p>
                          </div>
                        </div>
                        <div className="flex gap-2 flex-wrap">
                          {flight.stops === 0 && <Badge className="bg-green-100 text-green-800">Non-Stop</Badge>}
                          {flight.stops > 0 && <Badge className="bg-orange-100 text-orange-800">{flight.stops} Stop</Badge>}
                          {flight.is_refundable ? <Badge variant="secondary">Refundable</Badge> : <Badge variant="outline">Non-Refundable</Badge>}
                        </div>
                      </div>

                      {/* Timing */}
                      <div>
                        <div className="text-center mb-4">
                          <div className="text-3xl font-bold text-gray-900">{flight.departure_time}</div>
                          <div className="text-sm text-gray-600">{flight.origin_code}</div>
                        </div>
                        <div className="flex items-center gap-2 justify-center text-gray-500 mb-2">
                          <div className="h-px bg-gray-300 flex-1"></div>
                          <Clock className="w-4 h-4" />
                          <span className="text-sm">{Math.floor(flight.duration_mins / 60)}h {flight.duration_mins % 60}m</span>
                          <div className="h-px bg-gray-300 flex-1"></div>
                        </div>
                        <div className="text-center">
                          <div className="text-3xl font-bold text-gray-900">{flight.arrival_time}</div>
                          <div className="text-sm text-gray-600">{flight.destination_code}</div>
                        </div>
                      </div>

                      {/* Details */}
                      <div>
                        <h4 className="font-medium text-gray-900 mb-2">Flight Details</h4>
                        <div className="space-y-1 text-sm">
                          <p><span className="text-gray-600">Baggage:</span> {flight.baggage_allowance}</p>
                          <p><span className="text-gray-600">Meals:</span> {flight.meal_included ? 'Included' : 'Not Included'}</p>
                          <p><span className="text-gray-600">Available:</span> {flight.available_economy} seats</p>
                          {flight.available_business > 0 && (
                            <p><span className="text-gray-600">Business:</span> {flight.available_business} seats</p>
                          )}
                        </div>
                      </div>

                      {/* Price and Book */}
                      <div className="flex flex-col justify-between">
                        <div>
                          <p className="text-4xl font-bold text-blue-600 mb-1">
                            ₹{totalPrice.toLocaleString()}
                          </p>
                          <p className="text-sm text-gray-600 mb-4">
                            ₹{price.toLocaleString()} per person
                          </p>
                        </div>
                        <Button
                          onClick={() => bookFlight(flight)}
                          className="w-full bg-blue-600 hover:bg-blue-700"
                        >
                          Book Now
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        {/* No Results */}
        {!loading && flights.length === 0 && searchParams.origin_code && searchParams.destination_code && (
          <div className="text-center py-16">
            <Plane className="w-20 h-20 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-600 text-lg">No flights found for selected criteria.</p>
            <p className="text-gray-500 mt-2">Try different dates or airports</p>
          </div>
        )}

        {/* Empty State */}
        {!loading && flights.length === 0 && !searchParams.origin_code && (
          <div className="text-center py-16">
            <Plane className="w-20 h-20 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-600 text-lg">Start searching to see available flights</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default Flights;
