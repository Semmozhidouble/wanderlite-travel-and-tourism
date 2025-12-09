import { render, screen } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import DestinationDetails from '../pages/DestinationDetails';
import destinationService from '../services/destinationService';

// Mock the destination service
jest.mock('../services/destinationService');

// Mock react-router-dom useParams
jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useParams: () => ({ destinationName: 'goa-india' }),
}));

describe('DestinationDetails Component', () => {
  const mockDestination = {
    id: '1',
    name: 'Goa, India',
    category: 'Beach',
    description: 'Beautiful beaches and culture',
    image: 'https://example.com/goa.jpg',
    lat: 15.2993,
    lng: 74.1240,
    attractions: ['Beach', 'Fort'],
    activities: ['Swimming', 'Sightseeing'],
  };

  beforeEach(() => {
    destinationService.getDestinationByName = jest.fn().mockResolvedValue({
      success: true,
      destination: mockDestination,
    });
  });

  test('shows loading state initially', () => {
    render(
      <BrowserRouter>
        <DestinationDetails />
      </BrowserRouter>
    );
    
    expect(screen.getByText(/Loading destination details/i)).toBeInTheDocument();
  });

  test('renders destination details after loading', async () => {
    render(
      <BrowserRouter>
        <DestinationDetails />
      </BrowserRouter>
    );

    // Wait for the destination to load
    await screen.findByText('Goa, India');
    
    expect(screen.getByText('Goa, India')).toBeInTheDocument();
    expect(screen.getByText(/Beautiful beaches and culture/i)).toBeInTheDocument();
  });

  test('shows error state when destination not found', async () => {
    destinationService.getDestinationByName = jest.fn().mockResolvedValue({
      success: false,
      error: 'Destination not found',
      status: 404,
    });

    render(
      <BrowserRouter>
        <DestinationDetails />
      </BrowserRouter>
    );

    await screen.findByText(/Destination not found/i);
    
    expect(screen.getByText(/Destination not found/i)).toBeInTheDocument();
    expect(screen.getByText(/Back to Explore/i)).toBeInTheDocument();
  });
});
