import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import SearchBar from './SearchBar';
import Filters from './Filters';
import { slugify } from '../lib/utils';

// Lazy load Leaflet to avoid SSR issues
let MapContainer, TileLayer, Marker, Popup;
let L;

const DEFAULT_CENTER = [20.5937, 78.9629]; // India center
const DEFAULT_ZOOM = 5;

// Sample data for filters
const SAMPLE_DATA = {
  Hotels: [
    { id: 'h1', name: 'Seaside Resort', lat: 15.4909, lng: 73.8278, address: 'Calangute, Goa' },
    { id: 'h2', name: 'Heritage Palace', lat: 26.9124, lng: 75.7873, address: 'Jaipur, Rajasthan' },
    { id: 'h3', name: 'Mountain View Hotel', lat: 12.9716, lng: 77.5946, address: 'Bangalore, Karnataka' },
  ],
  Restaurants: [
    { id: 'r1', name: 'Spice Garden', lat: 19.0760, lng: 72.8777, address: 'Mumbai, Maharashtra' },
    { id: 'r2', name: 'Royal Feast', lat: 28.6139, lng: 77.2090, address: 'New Delhi' },
    { id: 'r3', name: 'Coastal Kitchen', lat: 13.0827, lng: 80.2707, address: 'Chennai, Tamil Nadu' },
  ],
  Attractions: [
    { id: 'a1', name: 'Historical Fort', lat: 27.1767, lng: 78.0081, address: 'Agra, Uttar Pradesh' },
    { id: 'a2', name: 'Golden Temple', lat: 31.6200, lng: 74.8765, address: 'Amritsar, Punjab' },
    { id: 'a3', name: 'Backwater Paradise', lat: 9.4981, lng: 76.3388, address: 'Kochi, Kerala' },
  ]
};

export default function MapView() {
  const navigate = useNavigate();
  const [mapLoaded, setMapLoaded] = useState(false);
  const [center, setCenter] = useState(DEFAULT_CENTER);
  const [zoom, setZoom] = useState(DEFAULT_ZOOM);
  const [markers, setMarkers] = useState([]);
  const [activeFilter, setActiveFilter] = useState(null);
  const [searchMarker, setSearchMarker] = useState(null);

  useEffect(() => {
    // Dynamically import Leaflet components
    const loadLeaflet = async () => {
      try {
        const leaflet = await import('leaflet');
        const reactLeaflet = await import('react-leaflet');
        
        L = leaflet.default;
        MapContainer = reactLeaflet.MapContainer;
        TileLayer = reactLeaflet.TileLayer;
        Marker = reactLeaflet.Marker;
        Popup = reactLeaflet.Popup;

        // Fix default icons
        delete L.Icon.Default.prototype._getIconUrl;
        L.Icon.Default.mergeOptions({
          iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
          iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
          shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
        });

        setMapLoaded(true);
      } catch (error) {
        console.error('Failed to load Leaflet:', error);
      }
    };

    loadLeaflet();
  }, []);

  const handleSearchResult = (result) => {
    const newCenter = [result.lat, result.lng];
    setCenter(newCenter);
    setZoom(12);
    setSearchMarker({
      id: 'search',
      name: result.name,
      lat: result.lat,
      lng: result.lng,
      category: 'Search Result'
    });
  };

  const handleFilterSelect = (category) => {
    setActiveFilter(category);
    if (!category) {
      setMarkers([]);
      return;
    }

    const data = SAMPLE_DATA[category] || [];
    setMarkers(data.map(item => ({ ...item, category })));
    
    if (data.length > 0) {
      // Center on first marker of this category
      setCenter([data[0].lat, data[0].lng]);
      setZoom(6);
    }
  };

  const recenterToUser = () => {
    if (!navigator.geolocation) {
      alert('Geolocation is not supported by this browser.');
      return;
    }
    
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCenter([pos.coords.latitude, pos.coords.longitude]);
        setZoom(13);
      },
      () => alert('Unable to retrieve your location')
    );
  };

  const resetMap = () => {
    setCenter(DEFAULT_CENTER);
    setZoom(DEFAULT_ZOOM);
    setMarkers([]);
    setActiveFilter(null);
    setSearchMarker(null);
  };

  const handleBookNow = (markerName) => {
    const slug = slugify(markerName);
    navigate(`/destination/${slug}`);
  };

  if (!mapLoaded) {
    return (
      <div className="w-full h-[85vh] rounded-lg overflow-hidden shadow-lg border bg-gray-100 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin w-8 h-8 border-4 border-[#0077b6] border-t-transparent rounded-full mx-auto mb-3"></div>
          <h3 className="text-xl font-bold text-gray-600 mb-2">Loading Interactive Map</h3>
          <p className="text-gray-500">Please wait while we load the map...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full">
      {/* Controls */}
      <div className="flex flex-col lg:flex-row gap-4 mb-4">
        <SearchBar onResult={handleSearchResult} />
        <Filters active={activeFilter} onSelect={handleFilterSelect} />
        <div className="flex gap-2 lg:ml-auto">
          <button
            onClick={recenterToUser}
            className="bg-white shadow-md px-4 py-2 rounded-full text-sm text-[#0077b6] hover:bg-gray-50 flex items-center gap-1"
            title="My Location"
          >
            📍 My Location
          </button>
          <button
            onClick={resetMap}
            className="bg-gradient-to-r from-[#0077b6] to-[#48cae4] text-white px-4 py-2 rounded-full text-sm hover:opacity-90 flex items-center gap-1"
            title="Reset Map"
          >
            🔄 Reset
          </button>
        </div>
      </div>

      {/* Map Container */}
      <div className="w-full h-[85vh] rounded-lg overflow-hidden shadow-lg border">
        <MapContainer
          center={center}
          zoom={zoom}
          style={{ height: '100%', width: '100%' }}
          key={`${center[0]}-${center[1]}-${zoom}`}
        >
          <TileLayer 
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          />
          
          {/* Search marker */}
          {searchMarker && (
            <Marker position={[searchMarker.lat, searchMarker.lng]}>
              <Popup>
                <div className="text-center">
                  <h3 className="font-bold text-[#0077b6] mb-1">{searchMarker.name}</h3>
                  <p className="text-sm text-gray-600">Search Result</p>
                  <p className="text-xs text-gray-500 mt-1">
                    {searchMarker.lat.toFixed(4)}, {searchMarker.lng.toFixed(4)}
                  </p>
                </div>
              </Popup>
            </Marker>
          )}

          {/* Category markers */}
          {markers.map((marker) => (
            <Marker key={marker.id} position={[marker.lat, marker.lng]}>
              <Popup>
                <div className="text-center">
                  <h3 className="font-bold text-[#0077b6] mb-1">{marker.name}</h3>
                  <p className="text-sm text-gray-600 mb-1">{marker.category}</p>
                  <p className="text-sm text-gray-500">{marker.address}</p>
                  <button 
                    onClick={() => handleBookNow(marker.name)}
                    className="mt-2 bg-gradient-to-r from-[#0077b6] to-[#48cae4] text-white px-3 py-1 rounded-md text-sm hover:opacity-90"
                  >
                    Book Now
                  </button>
                </div>
              </Popup>
            </Marker>
          ))}
        </MapContainer>
      </div>
    </div>
  );
}
