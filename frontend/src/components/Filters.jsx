import React from 'react';

const CATEGORIES = ['Hotels', 'Restaurants', 'Attractions'];

export default function Filters({ active, onSelect }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-sm text-gray-600 mr-2">Show:</span>
      {CATEGORIES.map((category) => (
        <button
          key={category}
          onClick={() => onSelect(active === category ? null : category)}
          className={`px-4 py-2 rounded-full text-sm font-medium transition-all duration-200 ${
            active === category
              ? 'bg-gradient-to-r from-[#0077b6] to-[#48cae4] text-white shadow-md'
              : 'bg-white text-[#0077b6] border border-[#0077b6]/20 hover:bg-[#0077b6]/5'
          }`}
        >
          {category}
        </button>
      ))}
    </div>
  );
}
