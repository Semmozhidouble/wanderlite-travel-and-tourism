# Booking Feature Testing Guide

## Fixed Issues

✅ **Booking Creation** - The `/api/bookings` endpoint now properly creates bookings with all required fields
✅ **Payment Processing** - The `/api/payment/confirm` endpoint now handles payment confirmations gracefully
✅ **Environment Configuration** - Frontend .env now correctly points to backend at `http://localhost:8000`
✅ **Enhanced Error Messages** - Booking form now shows specific validation errors

## How to Test Booking Flow

### Step 1: Sign Up (if not already done)
1. Go to `http://localhost:3000/signup`
2. Enter email, username, and password
3. Click "Sign Up"
4. You'll be automatically logged in

### Step 2: Browse Destinations
1. Go to `http://localhost:3000/explore`
2. Browse available destinations
3. Filter by category if desired (Beach, Heritage, Mountain, Adventure)
4. Search by name using the search bar

### Step 3: Book a Destination
1. Click on any destination card
2. Click the "Book Now" button
3. Fill in the booking modal:
   - **Start Date**: Pick a future date
   - **End Date**: Pick a date after the start date
   - **Number of Travelers**: Select 1-8 travelers
   - **Budget Range**: Choose a budget tier
4. Click "Book Trip"
5. You should see "Booking created successfully!" message
6. You'll be redirected to the Payment page

### Step 4: Complete Payment
1. On the Payment page, you'll see your booking details:
   - Destination
   - Booking Reference (WL-YYYYMMDD-XXXXXX)
   - Number of travelers
   - Total amount
2. Fill in payment details:
   - **Full Name**: Your name
   - **Email**: Your email
   - **Phone**: Your phone number
   - **Payment Method**: Select Card, UPI, or Wallet
   - **Payment Credential**: Enter dummy credentials:
     - Card: `1234-5678-9012-3456`
     - UPI: `user@upi`
     - Wallet: `paytm-id`
3. Click "Pay Now"
4. You'll receive a booking confirmation and receipt

## Test Data

### Sample Destinations Available:
- **Goa** (Beach)
- **Paris** (Heritage)
- **Tokyo** (Mountain)
- **Kashmir** (Adventure)
- **Bali** (Beach)
- **Santorini** (Heritage)
- **Dubai** (Modern)
- **Maldives** (Beach)

### Sample Payment Credentials:
- **Card**: `1234-5678-9012-3456`
- **UPI**: `testuser@upi`
- **Wallet**: `PhonePe12345`

## Error Handling

If you see errors during booking:

1. **"Please fill all required fields"** - Make sure all fields are filled:
   - Destination (auto-filled)
   - Start Date
   - End Date
   - Budget Range

2. **"End date must be after start date"** - Select an end date that's after the start date

3. **"Failed to create booking"** - Check the browser console (F12) for detailed error messages

4. **Network errors** - Ensure both backend and frontend are running:
   - Backend: `http://localhost:8000/docs`
   - Frontend: `http://localhost:3000`

## API Endpoints Reference

### Bookings
- **POST** `/api/bookings` - Create a new booking
- **GET** `/api/bookings` - List all bookings
- **DELETE** `/api/bookings/{booking_id}` - Delete a booking
- **PUT** `/api/bookings/{booking_id}/status` - Update booking status

### Payment
- **POST** `/api/payment/confirm` - Confirm payment and generate receipt
- **GET** `/api/receipts` - Get all receipts
- **GET** `/receipts/{receipt_id}` - Get specific receipt

### Destinations
- **GET** `/api/destinations` - Get all destinations
- **GET** `/api/destinations/{id}` - Get destination by ID

## Browser Console Debugging

Open Developer Tools (F12) and check the Console tab for:
- Booking payload being sent
- API response status
- Any validation errors

You should see logs like:
```
[API Request] POST /api/bookings {destination: "Goa", ...}
```

## Next Steps

If booking works, test the following features:
1. View your bookings at `/my-bookings`
2. Download booking PDF (if available)
3. View receipt at `/receipt`
4. Try different budget ranges and see price variations
