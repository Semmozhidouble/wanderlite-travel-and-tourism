import React, { useState } from 'react';

const OPENCAGE_KEY = process.env.REACT_APP_OPENCAGE_KEY;

export default function SearchBar({ onResult }) {
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!query.trim()) return;

    setLoading(true);
    try {
      const response = await fetch(
        `https://api.opencagedata.com/geocode/v1/json?q=${encodeURIComponent(query)}&key=${OPENCAGE_KEY}&limit=1`
      );
      const data = await response.json();
      
      if (data && data.results && data.results.length > 0) {
        const result = data.results[0];
        if (onResult) {
          onResult({
            name: result.formatted,
            lat: result.geometry.lat,
            lng: result.geometry.lng
          });
        }
      } else {
        alert('No results found for: ' + query);
      }
    } catch (error) {
      console.error('Search error:', error);
      alert('Search failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex gap-2">
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search for a place (e.g., Paris, Goa)..."
        className="px-4 py-2 border border-gray-300 rounded-full focus:outline-none focus:border-[#0077b6] min-w-[300px]"
        disabled={loading}
      />
      <button
        type="submit"
        disabled={loading || !query.trim()}
        className="bg-[#0077b6] text-white px-6 py-2 rounded-full hover:bg-[#005f8f] disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {loading ? 'Searching...' : 'Search'}
      </button>
    </form>
  );
}
