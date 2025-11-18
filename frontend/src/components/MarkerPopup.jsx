import React from 'react';
import { motion } from 'framer-motion';

export default function MarkerPopup({ marker }) {
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="max-w-xs">
      <div className="space-y-2">
        <h3 className="font-bold text-[#0077b6] text-lg">{marker.name}</h3>
        <p className="text-sm text-gray-600">{marker.address || 'Address not available'}</p>
        <p className="text-sm text-gray-500">Lat: {marker.lat.toFixed(4)}, Lng: {marker.lng.toFixed(4)}</p>
        <p className="text-sm text-gray-500">Category: {marker.category}</p>
        <div className="pt-2">
          <button className="w-full bg-gradient-to-r from-[#0077b6] to-[#48cae4] text-white py-2 rounded-md text-sm">Book Now</button>
        </div>
      </div>
    </motion.div>
  );
}
