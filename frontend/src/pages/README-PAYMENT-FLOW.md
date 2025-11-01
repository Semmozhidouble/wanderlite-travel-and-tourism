# WanderLite Payment Flow (Fake)

Flow: Select Destination → Fill Booking Form → Proceed to Payment → Enter Card/UPI/Wallet → Confirm Payment → Generate Receipt (PDF)

## Backend
- POST `/api/payment/confirm`
  - Body:
    ```json
    {
      "booking_ref": "WL-20251101-ABCDEFGH",
      "destination": "Goa",
      "start_date": "2025-12-01T00:00:00Z",
      "end_date": "2025-12-05T00:00:00Z",
      "travelers": 2,
      "full_name": "John Doe",
      "email": "john@gmail.com",
      "phone": "9876543210",
      "method": "Card",
      "credential": "1234-5678-9012-3456",
      "amount": 40000
    }
    ```
  - Response:
    ```json
    {
      "status": "success",
      "booking_ref": "WL-20251101-ABCDEFGH",
      "receipt_url": "/uploads/receipts/receipt_WL-20251101-ABCDEFGH.pdf"
    }
    ```
  - Output PDF is stored under `backend/uploads/receipts/` and served at `/uploads/receipts/...`

## Frontend
- `Explore.jsx`: After booking, navigate to `/payment` with booking in router state
- `Payment.jsx`:
  - Collects Full Name, Email, Phone, Payment Method (Card/UPI/Wallet), Credential, Amount (auto)
  - Calls `/api/payment/confirm` and navigates to `/receipt` with `receiptUrl` on success
  - Falls back to local pdf generation if server call fails
- `Receipt.jsx`:
  - Shows success and a button to download the server-generated PDF (or fallback message)

