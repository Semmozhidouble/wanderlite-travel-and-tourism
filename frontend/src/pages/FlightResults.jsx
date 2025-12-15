import React from 'react';
import { useNavigate } from 'react-router-dom';

const FlightResults = () => {
  const navigate = useNavigate();
  
  // Redirect to main flights page since search results are shown there
  React.useEffect(() => {
    navigate('/flights');
  }, [navigate]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50 flex items-center justify-center">
      <p className="text-gray-600">Redirecting to flights search...</p>
    </div>
  );
};

export default FlightResults;
