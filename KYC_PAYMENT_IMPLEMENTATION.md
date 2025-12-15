# KYC & Payment Profile Implementation

## Overview
Complete fintech-style KYC verification and payment workflow implementation for WanderLite travel booking platform.

## Features Implemented

### 1. Backend Infrastructure (server.py)

#### Database Models
- **UserModel** additions:
  - `is_kyc_completed` (Boolean): KYC verification status
  - `payment_profile_completed` (Boolean): Payment profile setup status

- **KYCDetailsModel** (New):
  - Personal details: full_name, dob, gender, nationality
  - ID verification: id_type, id_number_hash (SHA-256 hashed)
  - Address: address_line, city, state, country, pincode
  - Document uploads: id_proof_front_path, id_proof_back_path, selfie_path
  - Status tracking: verification_status, submitted_at, verified_at

- **PaymentProfileModel** (New):
  - Account holder name
  - Bank details: bank_name, account_number_encrypted, ifsc_encrypted (Fernet encrypted)
  - UPI: upi_encrypted (Fernet encrypted)
  - Default payment method

- **TransactionModel** (New):
  - user_id, booking_id, service_type
  - amount, currency, payment_method
  - status (pending/completed/failed)
  - created_at timestamp

#### Security Features
- **Encryption**: Fernet (AES-128 CBC + HMAC) for sensitive data
  - Bank account numbers
  - IFSC codes
  - UPI IDs
- **Hashing**: SHA-256 + user-specific salt for ID numbers
- **Auto-generated encryption key** if not present in .env

#### API Endpoints

**KYC Endpoints:**
- `POST /api/kyc` - Submit KYC with file uploads (multipart/form-data)
- `GET /api/kyc/status` - Check KYC verification status

**Payment Profile Endpoints:**
- `POST /api/payment-profile` - Save encrypted payment details
- `GET /api/payment-profile/status` - Check payment profile status

**Payment & Transactions:**
- `POST /api/payments/mock` - Mock payment processing (demo mode)
- `GET /api/transactions` - Get user transaction history with filters

**Updated Endpoints:**
- `GET /api/auth/me` - Now returns `is_kyc_completed` and `payment_profile_completed` flags
- `POST /api/bookings/service` - Now checks KYC status, returns 403 if not verified

### 2. Frontend Components

#### KYCForm.jsx
4-step wizard component:
1. **Personal Details**: Name, DOB, gender, nationality
2. **ID Verification**: ID type, number, document uploads (front, back, selfie)
3. **Address**: Full address with city, state, country, pincode
4. **Review & Submit**: Summary with demo mode notice

Features:
- Progress bar showing completion percentage
- File upload handling with visual feedback
- Form validation at each step
- FormData multipart upload to backend

#### PaymentProfileForm.jsx
Secure payment profile setup:
- Account holder name
- Bank name
- Account number (masked input type="password")
- IFSC code
- UPI ID (optional)
- Default payment method selector (bank/upi)
- Security notice with encryption details

### 3. Updated Pages

#### Profile.jsx
New sections:
- **KYC Banner**: Shows if KYC not completed, prompts user to verify
- **Payment Profile Banner**: Shows if KYC done but payment profile not set
- **Modal Forms**: 
  - KYC form in modal overlay
  - Payment profile form in modal overlay
- **Verification Status**: Visual badges showing KYC and payment profile status
- **Transaction History**: Shows recent 5 transactions with view all option

Features:
- Fetches KYC/payment flags on load
- Auto-refresh after KYC/payment submission
- Transaction history with service type filtering

#### FlightDetail.jsx
- Added KYC guard in `handleBookNowClick()`
- Checks `/api/auth/me` for `is_kyc_completed`
- Redirects to profile with alert if KYC not done

#### HotelDetail.jsx
- Added KYC guard in `handleBookNow()`
- Same verification logic as flights

#### RestaurantDetail.jsx
- Added KYC guard in `handleReserve()`
- Same verification logic as hotels

#### Payment.jsx
New features:
- **One-Click Payment**: Shows if payment profile exists
  - Green gradient button with saved method
  - Calls `/api/payments/mock` directly
  - Bypasses manual payment form
- **Payment Profile Detection**: Checks on component mount
- **Method Display**: Shows "UPI" or "Bank Account" based on default

## User Flow

### First-Time User Journey
1. **Login** → Redirected to Profile
2. **KYC Banner** → Click "Start KYC Verification"
3. **4-Step Form**:
   - Fill personal details
   - Upload ID documents (Aadhaar/PAN/Passport/License)
   - Enter address
   - Review and submit
4. **Auto-verified** (demo mode) → KYC badge turns green
5. **Payment Profile Banner** → Click "Add Payment Profile"
6. **Payment Form**:
   - Enter bank details (encrypted)
   - Or add UPI
   - Set default method
7. **Ready to Book** → All verification status badges green

### Booking Flow (Post-KYC)
1. Browse **Flights/Hotels/Restaurants**
2. Click **Book Now** → KYC check passes
3. Fill booking details
4. Proceed to **Payment** page
5. See **One-Click Payment** option
6. Click instant pay → Mock payment succeeds
7. View **Transaction** in Profile
8. Get **Ticket/Voucher**

### Booking Flow (No KYC)
1. Browse services
2. Click **Book Now** → Alert: "Complete KYC first"
3. Redirected to **Profile** page
4. Complete KYC + Payment Profile
5. Return to booking

## Security Implementation

### Encryption Strategy
```python
# Fernet (AES-128 CBC + HMAC)
from cryptography.fernet import Fernet

# Sensitive data encrypted:
- account_number_encrypted
- ifsc_encrypted  
- upi_encrypted

# ID numbers hashed (one-way):
- id_number_hash (SHA-256 + user salt)
```

### Key Management
- Encryption key in `.env` as `FERNET_ENCRYPTION_KEY`
- Auto-generated if missing (logs warning)
- User-specific salt for ID hashing prevents rainbow tables

### Data Protection
- Passwords masked (type="password") for account numbers
- Bank details never sent to frontend in plain text
- Payment profile status endpoint returns only flags, not actual data

## Demo Mode Features

### Auto-Verification
- KYC submitted → Instantly marked as "verified"
- No manual approval needed
- Production: Would integrate with NSDL/KRA API

### Mock Payments
- All payments auto-succeed
- Transaction created with "completed" status
- No actual payment gateway integration
- Production: Would integrate Razorpay/Stripe/PayU

### No File Validation
- File uploads accepted without ID verification
- Production: Would use OCR for ID extraction

## Database Schema

```sql
-- KYC Details Table
CREATE TABLE kyc_details (
  id INT PRIMARY KEY AUTO_INCREMENT,
  user_id INT UNIQUE,
  full_name VARCHAR(255),
  dob DATE,
  gender VARCHAR(20),
  nationality VARCHAR(100),
  id_type VARCHAR(50),
  id_number_hash VARCHAR(255),
  address_line VARCHAR(500),
  city VARCHAR(100),
  state VARCHAR(100),
  country VARCHAR(100),
  pincode VARCHAR(20),
  id_proof_front_path VARCHAR(500),
  id_proof_back_path VARCHAR(500),
  selfie_path VARCHAR(500),
  verification_status VARCHAR(50) DEFAULT 'pending',
  submitted_at DATETIME,
  verified_at DATETIME,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

-- Payment Profiles Table
CREATE TABLE payment_profiles (
  id INT PRIMARY KEY AUTO_INCREMENT,
  user_id INT UNIQUE,
  account_holder_name VARCHAR(255),
  bank_name VARCHAR(255),
  account_number_encrypted TEXT,
  ifsc_encrypted TEXT,
  upi_encrypted TEXT,
  default_method VARCHAR(20),
  created_at DATETIME,
  updated_at DATETIME,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

-- Transactions Table
CREATE TABLE transactions (
  id INT PRIMARY KEY AUTO_INCREMENT,
  user_id INT,
  booking_id INT,
  service_type VARCHAR(50),
  amount DECIMAL(10, 2),
  currency VARCHAR(10) DEFAULT 'INR',
  payment_method VARCHAR(50),
  status VARCHAR(50) DEFAULT 'pending',
  created_at DATETIME,
  FOREIGN KEY (user_id) REFERENCES users(id)
);
```

## File Upload Handling

### Backend
- Accepts multipart/form-data
- Files saved to `backend/uploads/kyc/{user_id}/`
- Paths stored in database
- Files: id_proof_front, id_proof_back, selfie

### Frontend
- FormData API for multipart upload
- File preview with CheckCircle icon after selection
- Max file size validation (add if needed)

## Testing Checklist

- [ ] User can register and login
- [ ] Profile shows KYC banner if not verified
- [ ] KYC form accepts all 4 steps
- [ ] File uploads work (front, back, selfie)
- [ ] KYC auto-verifies in demo mode
- [ ] Payment profile banner shows after KYC
- [ ] Payment form encrypts and saves bank details
- [ ] Booking pages block if no KYC
- [ ] Booking pages allow if KYC completed
- [ ] Payment page shows one-click option
- [ ] One-click payment creates transaction
- [ ] Transaction history displays in Profile
- [ ] Verification badges show correct status

## Production Readiness Checklist

### Security
- [ ] Change demo auto-verification to manual/API verification
- [ ] Implement rate limiting on KYC submissions
- [ ] Add CAPTCHA to prevent bot submissions
- [ ] Rotate Fernet encryption keys periodically
- [ ] Add audit logging for all sensitive operations

### Payment Gateway
- [ ] Integrate Razorpay/Stripe for real payments
- [ ] Add webhook handlers for payment status
- [ ] Implement refund flow
- [ ] Add payment retry logic

### KYC Provider
- [ ] Integrate NSDL/KRA API for India
- [ ] Add document OCR for ID verification
- [ ] Implement liveness detection for selfie
- [ ] Add address verification via postal service

### Compliance
- [ ] Add KYC expiry (every 2 years)
- [ ] Implement data deletion requests (GDPR)
- [ ] Add consent forms for data processing
- [ ] Implement PCI-DSS for payment data

### UX Improvements
- [ ] Add progress saving (resume KYC later)
- [ ] Email notifications for KYC status
- [ ] SMS OTP for payment verification
- [ ] Add multiple payment methods per user
- [ ] Implement saved addresses

## API Reference

### KYC APIs

**Submit KYC**
```http
POST /api/kyc
Content-Type: multipart/form-data

Form Fields:
- full_name: string (required)
- dob: date (YYYY-MM-DD, required)
- gender: string (required)
- nationality: string (required)
- id_type: string (Aadhaar/PAN/Passport/DrivingLicense, required)
- id_number: string (required)
- address_line: string (required)
- city: string (required)
- state: string (required)
- country: string (required)
- pincode: string (required)
- id_proof_front: file (image, required)
- id_proof_back: file (image, required)
- selfie: file (image, required)

Response:
{
  "is_kyc_completed": true,
  "verification_status": "verified",
  "message": "KYC verification completed successfully (Demo Mode)"
}
```

**Get KYC Status**
```http
GET /api/kyc/status

Response:
{
  "is_kyc_completed": true,
  "verification_status": "verified",
  "submitted_at": "2024-01-15T10:30:00",
  "verified_at": "2024-01-15T10:30:05"
}
```

### Payment Profile APIs

**Save Payment Profile**
```http
POST /api/payment-profile
Content-Type: application/json

Body:
{
  "account_holder_name": "John Doe",
  "bank_name": "State Bank of India",
  "account_number": "1234567890",
  "ifsc": "SBIN0001234",
  "upi": "john@upi",
  "default_method": "bank"
}

Response:
{
  "is_payment_profile_completed": true,
  "default_method": "bank",
  "message": "Payment profile saved successfully"
}
```

**Get Payment Profile Status**
```http
GET /api/payment-profile/status

Response:
{
  "is_payment_profile_completed": true,
  "default_method": "upi"
}
```

### Payment APIs

**Mock Payment**
```http
POST /api/payments/mock
Content-Type: application/json

Body:
{
  "booking_id": 123,
  "service_type": "Flight",
  "amount": 5000.00,
  "payment_method": "upi"
}

Response:
{
  "transaction_id": 456,
  "status": "completed",
  "message": "Payment successful (Demo Mode)"
}
```

**Get Transactions**
```http
GET /api/transactions?service_type=Flight

Response:
[
  {
    "id": 456,
    "booking_id": 123,
    "service_type": "Flight",
    "amount": 5000.00,
    "currency": "INR",
    "payment_method": "upi",
    "status": "completed",
    "created_at": "2024-01-15T14:30:00"
  }
]
```

## Environment Variables

```bash
# .env file
FERNET_ENCRYPTION_KEY=<base64-encoded-32-byte-key>
# Auto-generated if missing

# MySQL connection (existing)
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=your_password
DB_NAME=wanderlite

# JWT secret (existing)
JWT_SECRET=your-secret-key
```

## File Structure

```
backend/
  server.py (updated)
  uploads/
    kyc/
      <user_id>/
        id_proof_front_*.jpg
        id_proof_back_*.jpg
        selfie_*.jpg

frontend/
  src/
    components/
      KYCForm.jsx (new)
      PaymentProfileForm.jsx (new)
    pages/
      Profile.jsx (updated)
      FlightDetail.jsx (updated)
      HotelDetail.jsx (updated)
      RestaurantDetail.jsx (updated)
      Payment.jsx (updated)
```

## Next Steps

1. **Start Backend** (requires virtual environment):
   ```bash
   cd backend
   python3 -m venv venv
   source venv/bin/activate
   pip install -r requirements.txt
   python3 server.py
   ```

2. **Start Frontend**:
   ```bash
   cd frontend
   npm start
   ```

3. **Test Flow**:
   - Register new user
   - Complete KYC from Profile
   - Add payment profile
   - Book a flight/hotel
   - Use one-click payment

4. **Production Deployment**:
   - Set up production database
   - Generate secure encryption key
   - Configure real payment gateway
   - Integrate KYC verification provider
   - Enable HTTPS
   - Set up monitoring/logging

## Support

For issues or questions:
- Check backend logs for API errors
- Check browser console for frontend errors
- Verify database connection
- Ensure encryption key is set
- Check file upload directory permissions
