# PDF Generation Placeholder Functions
# These replace the original PDF generation functions to avoid FPDF/qrcode dependencies

from pathlib import Path

def _generate_flight_ticket_pdf(service_data: dict, booking_ref: str, passenger_info: dict, upload_dir: Path) -> str:
    """Generate a flight ticket - PLACEHOLDER VERSION."""
    tickets_dir = upload_dir / 'tickets'
    tickets_dir.mkdir(parents=True, exist_ok=True)
    
    filename = f"flight_ticket_{booking_ref}.txt"
    file_path = tickets_dir / filename
    
    ticket_content = f"""
FLIGHT TICKET - {booking_ref}
================================

Passenger: {passenger_info.get('name', 'N/A')}
Flight: {service_data.get('airline', 'N/A')} {service_data.get('flight_number', 'N/A')}
From: {service_data.get('origin', 'N/A')}
To: {service_data.get('destination', 'N/A')}
Date: {service_data.get('departure_time', 'N/A')}
Seat: {passenger_info.get('seat', 'N/A')}

Booking Reference: {booking_ref}
Status: CONFIRMED

Note: PDF generation is temporarily unavailable.
This is a text-based ticket for demonstration purposes.
"""
    
    with open(file_path, 'w') as f:
        f.write(ticket_content)
    
    return f"/uploads/{str(file_path.relative_to(upload_dir))}"

def _generate_hotel_voucher_pdf(service_data: dict, booking_ref: str, guest_info: dict, upload_dir: Path) -> str:
    """Generate a hotel voucher - PLACEHOLDER VERSION."""
    tickets_dir = upload_dir / 'tickets'
    tickets_dir.mkdir(parents=True, exist_ok=True)
    
    filename = f"hotel_voucher_{booking_ref}.txt"
    file_path = tickets_dir / filename
    
    voucher_content = f"""
HOTEL VOUCHER - {booking_ref}
================================

Guest: {guest_info.get('name', 'N/A')}
Hotel: {service_data.get('name', 'N/A')}
Location: {service_data.get('location', 'N/A')}
Check-in: {service_data.get('check_in', 'N/A')}
Check-out: {service_data.get('check_out', 'N/A')}
Guests: {service_data.get('guests', 1)}

Booking Reference: {booking_ref}
Status: CONFIRMED

Note: PDF generation is temporarily unavailable.
This is a text-based voucher for demonstration purposes.
"""
    
    with open(file_path, 'w') as f:
        f.write(voucher_content)
    
    return f"/uploads/{str(file_path.relative_to(upload_dir))}"

def _generate_restaurant_reservation_pdf(service_data: dict, booking_ref: str, guest_info: dict, upload_dir: Path) -> str:
    """Generate a restaurant reservation - PLACEHOLDER VERSION."""
    tickets_dir = upload_dir / 'tickets'
    tickets_dir.mkdir(parents=True, exist_ok=True)
    
    filename = f"restaurant_reservation_{booking_ref}.txt"
    file_path = tickets_dir / filename
    
    reservation_content = f"""
RESTAURANT RESERVATION - {booking_ref}
================================

Guest: {guest_info.get('name', 'N/A')}
Restaurant: {service_data.get('name', 'N/A')}
Cuisine: {service_data.get('cuisine', 'N/A')}
Date: {service_data.get('date', 'N/A')}
Time: {service_data.get('time', 'N/A')}
Party Size: {service_data.get('party_size', 1)}

Booking Reference: {booking_ref}
Status: CONFIRMED

Note: PDF generation is temporarily unavailable.
This is a text-based reservation for demonstration purposes.
"""
    
    with open(file_path, 'w') as f:
        f.write(reservation_content)
    
    return f"/uploads/{str(file_path.relative_to(upload_dir))}"

def _generate_receipt_pdf(payload, upload_dir: Path) -> str:
    """Generate a payment receipt - PLACEHOLDER VERSION."""
    receipts_dir = upload_dir / 'receipts'
    receipts_dir.mkdir(parents=True, exist_ok=True)
    
    filename = f"receipt_{payload.booking_ref}.txt"
    file_path = receipts_dir / filename
    
    receipt_content = f"""
PAYMENT RECEIPT - {payload.booking_ref}
================================

Booking Reference: {payload.booking_ref}
Service Type: {payload.service_type}
Amount: {payload.amount} {payload.currency}
Payment Method: {payload.payment_method}

Status: PAID

Note: PDF generation is temporarily unavailable.
This is a text-based receipt for demonstration purposes.
"""
    
    with open(file_path, 'w') as f:
        f.write(receipt_content)
    
    return f"/uploads/{str(file_path.relative_to(upload_dir))}"

def _generate_hotel_receipt_pdf(service_data: dict, booking_ref: str, guest_info: dict, amount: float, currency: str, upload_dir: Path) -> str:
    """Generate a hotel receipt - PLACEHOLDER VERSION."""
    return _generate_receipt_pdf(type('obj', (object,), {
        'booking_ref': booking_ref,
        'service_type': 'Hotel',
        'amount': amount,
        'currency': currency,
        'payment_method': 'Card'
    })(), upload_dir)

def _generate_restaurant_receipt_pdf(service_data: dict, booking_ref: str, guest_info: dict, amount: float, currency: str, upload_dir: Path) -> str:
    """Generate a restaurant receipt - PLACEHOLDER VERSION."""
    return _generate_receipt_pdf(type('obj', (object,), {
        'booking_ref': booking_ref,
        'service_type': 'Restaurant',
        'amount': amount,
        'currency': currency,
        'payment_method': 'Card'
    })(), upload_dir)