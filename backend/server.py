from fastapi import FastAPI, APIRouter, HTTPException, Depends, status, UploadFile, File, Form, WebSocket, WebSocketDisconnect
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
import os
import logging
import random
from pathlib import Path
PDF_GENERATION_DISABLED = True  # Disable PDF generation due to dependency issues
from pydantic import BaseModel, Field, ConfigDict
from typing import List, Optional, Generator, Dict
import uuid
from datetime import datetime, timezone
from passlib.context import CryptContext
from jose import JWTError, jwt
from datetime import timedelta
import requests
import json
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi.staticfiles import StaticFiles
# from fpdf import FPDF  # Commenting out to avoid numpy issues
import qrcode
from io import BytesIO
import base64
import asyncio

# Placeholder variables to avoid Pylance undefined variable warnings
FPDF = None
# qrcode is now imported
import hashlib
from cryptography.fernet import Fernet
import httpx

# SQLAlchemy (MySQL via XAMPP)
from sqlalchemy import (
    create_engine,
    Column,
    String,
    Integer,
    DateTime,
    Float,
    Text,
    ForeignKey,
    text,
    func,
    Date,
    JSON,
)
from sqlalchemy.orm import sessionmaker, declarative_base, Session
from sqlalchemy.engine import url as sa_url


ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# =============================
# Encryption Utility (AES-256-GCM)
# =============================
ENCRYPTION_KEY = os.environ.get("ENCRYPTION_KEY")
if not ENCRYPTION_KEY:
    # Generate a key for demo purposes (store this in .env for production)
    ENCRYPTION_KEY = Fernet.generate_key().decode()
    logging.warning("No ENCRYPTION_KEY found in .env, using generated key (not persistent!)")

fernet = Fernet(ENCRYPTION_KEY.encode() if isinstance(ENCRYPTION_KEY, str) else ENCRYPTION_KEY)

def encrypt_field(plain_text: str) -> str:
    """Encrypt sensitive field using Fernet (AES-128 CBC + HMAC)"""
    if not plain_text:
        return ""
    return fernet.encrypt(plain_text.encode()).decode()

def decrypt_field(encrypted_text: str) -> str:
    """Decrypt sensitive field"""
    if not encrypted_text:
        return ""
    try:
        return fernet.decrypt(encrypted_text.encode()).decode()
    except Exception:
        return ""

def hash_id_number(id_number: str, user_id: str) -> str:
    """Hash ID number with user-specific salt"""
    salt = f"{user_id}_wanderlite_salt"
    return hashlib.sha256(f"{id_number}{salt}".encode()).hexdigest()

# Initialize FastAPI app
app = FastAPI(title="Wanderlite API")

# Basic CORS to allow frontend dev origin
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# =============================
# WebSocket Connection Manager for Real-Time Notifications
# =============================
class ConnectionManager:
    def __init__(self):
        # Maps user_id to list of WebSocket connections (user can have multiple tabs)
        self.active_connections: Dict[str, List[WebSocket]] = {}
    
    async def connect(self, websocket: WebSocket, user_id: str):
        await websocket.accept()
        if user_id not in self.active_connections:
            self.active_connections[user_id] = []
        self.active_connections[user_id].append(websocket)
        logging.info(f"WebSocket connected for user {user_id}")
    
    def disconnect(self, websocket: WebSocket, user_id: str):
        if user_id in self.active_connections:
            if websocket in self.active_connections[user_id]:
                self.active_connections[user_id].remove(websocket)
            if not self.active_connections[user_id]:
                del self.active_connections[user_id]
        logging.info(f"WebSocket disconnected for user {user_id}")
    
    async def send_to_user(self, user_id: str, message: dict):
        """Send notification to a specific user"""
        if user_id in self.active_connections:
            disconnected = []
            for connection in self.active_connections[user_id]:
                try:
                    await connection.send_json(message)
                except Exception as e:
                    logging.warning(f"Failed to send to user {user_id}: {e}")
                    disconnected.append(connection)
            # Clean up disconnected connections
            for conn in disconnected:
                self.active_connections[user_id].remove(conn)
    
    async def broadcast_to_all(self, message: dict):
        """Broadcast notification to all connected users"""
        for user_id in list(self.active_connections.keys()):
            await self.send_to_user(user_id, message)
    
    def get_connected_users(self) -> List[str]:
        """Get list of connected user IDs"""
        return list(self.active_connections.keys())

notification_manager = ConnectionManager()

# Minimal auth router to satisfy frontend login calls
auth_router = APIRouter(prefix="/api/auth", tags=["auth"])

class LoginRequest(BaseModel):
    email: str
    password: str

@auth_router.post("/login")
def auth_login(req: LoginRequest):
    # Development mode: accept any valid credentials without DB check
    # For production, validate against UserModel in database
    if not req.email or not req.password:
        raise HTTPException(status_code=400, detail="Email and password required")
    
    token = jwt.encode({"sub": req.email, "scope": "user"}, "dev-secret", algorithm="HS256")
    return {"access_token": token, "token_type": "bearer", "user": {"email": req.email}}

app.include_router(auth_router)

# =============================
# Database setup (MySQL / XAMPP)
# =============================
DATABASE_URL = os.environ.get(
    "MYSQL_URL", "mysql+pymysql://root:@localhost:3306/wanderlite"
)

# Ensure database exists (for XAMPP first-time setup)
parsed_url = sa_url.make_url(DATABASE_URL)
db_name = parsed_url.database
server_url = parsed_url.set(database=None)

# Only attempt MySQL database creation for MySQL URLs
try:
    if parsed_url.get_backend_name().startswith("mysql"):
        tmp_engine = create_engine(server_url, pool_pre_ping=True)
        with tmp_engine.connect() as conn:
            conn.execution_options(isolation_level="AUTOCOMMIT").execute(
                text(f"CREATE DATABASE IF NOT EXISTS `{db_name}` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;")
            )
        tmp_engine.dispose()
except Exception as e:
    # Log but continue; startup will fail later with clearer error
    logging.getLogger(__name__).warning(f"Could not ensure database exists: {e}")

engine = create_engine(DATABASE_URL, pool_pre_ping=True)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


class UserModel(Base):
    __tablename__ = "users"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    email = Column(String(255), unique=True, index=True, nullable=False)
    username = Column(String(100), nullable=False)
    hashed_password = Column(String(255), nullable=False)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    # Profile fields
    name = Column(String(255), nullable=True)
    phone = Column(String(50), nullable=True)
    profile_image = Column(String(500), nullable=True)
    favorite_travel_type = Column(String(50), nullable=True)
    preferred_budget_range = Column(String(50), nullable=True)
    climate_preference = Column(String(50), nullable=True)
    food_preference = Column(String(50), nullable=True)
    language_preference = Column(String(50), nullable=True)
    notifications_enabled = Column(Integer, default=1)
    # KYC & Payment flags
    is_kyc_completed = Column(Integer, default=0)
    payment_profile_completed = Column(Integer, default=0)


class KYCDetailsModel(Base):
    __tablename__ = "kyc_details"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(String(36), ForeignKey("users.id"), unique=True, index=True, nullable=False)
    full_name = Column(String(255), nullable=False)
    dob = Column(String(20), nullable=False)  # YYYY-MM-DD
    gender = Column(String(20), nullable=False)  # male / female / other
    nationality = Column(String(100), nullable=False)
    id_type = Column(String(50), nullable=False)  # aadhaar / passport / voterid
    id_number_hash = Column(String(255), nullable=False)  # hashed ID number
    id_proof_front_path = Column(String(500), nullable=True)
    id_proof_back_path = Column(String(500), nullable=True)
    selfie_path = Column(String(500), nullable=True)
    address_line = Column(String(500), nullable=False)
    city = Column(String(100), nullable=False)
    state = Column(String(100), nullable=False)
    country = Column(String(100), nullable=False)
    pincode = Column(String(20), nullable=False)
    verification_status = Column(String(20), default="pending")  # pending / verified / rejected
    submitted_at = Column(DateTime(timezone=True), nullable=True)
    verified_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime(timezone=True), nullable=True)


class PaymentProfileModel(Base):
    __tablename__ = "payment_profiles"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(String(36), ForeignKey("users.id"), unique=True, index=True, nullable=False)
    account_holder_name = Column(String(255), nullable=False)
    bank_name = Column(String(255), nullable=False)
    account_number_encrypted = Column(Text, nullable=False)  # AES-256-GCM encrypted
    ifsc_encrypted = Column(Text, nullable=False)
    upi_encrypted = Column(Text, nullable=True)  # optional
    default_method = Column(String(20), default="bank")  # bank / upi
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime(timezone=True), nullable=True)


class TransactionModel(Base):
    __tablename__ = "transactions"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(String(36), ForeignKey("users.id"), index=True, nullable=False)
    booking_id = Column(String(36), index=True, nullable=True)  # reference to service_bookings
    service_type = Column(String(30), nullable=True)  # flight / hotel / restaurant
    amount = Column(Float, nullable=False)
    currency = Column(String(10), default="INR")
    payment_method = Column(String(50), nullable=False)  # saved_bank / saved_upi / one_time_card / one_time_upi
    status = Column(String(20), default="success")  # success / failed
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))


class TripModel(Base):
    __tablename__ = "trips"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(String(36), ForeignKey("users.id"), index=True, nullable=False)
    destination = Column(String(255), nullable=False)
    days = Column(Integer, nullable=False)
    budget = Column(String(20), nullable=False)
    currency = Column(String(10), nullable=False)
    total_cost = Column(Float, default=0)
    start_date = Column(DateTime(timezone=True), nullable=True)
    end_date = Column(DateTime(timezone=True), nullable=True)
    travelers = Column(Integer, nullable=True)
    itinerary_json = Column(Text, nullable=False, default="[]")
    images_json = Column(Text, nullable=False, default="[]")
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime(timezone=True), nullable=True)

class BookingModel(Base):
    __tablename__ = "bookings"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(String(36), index=True, nullable=False)  # Removed ForeignKey constraint
    trip_id = Column(String(36), index=True, nullable=True)  # Removed ForeignKey constraint
    destination = Column(String(255), nullable=False)
    start_date = Column(DateTime(timezone=True), nullable=True)
    end_date = Column(DateTime(timezone=True), nullable=True)
    travelers = Column(Integer, default=1)
    package_type = Column(String(50), nullable=True)
    hotel_name = Column(String(255), nullable=True)
    flight_number = Column(String(50), nullable=True)
    total_price = Column(Float, default=0)
    currency = Column(String(10), default="INR")
    booking_ref = Column(String(50), unique=True, index=True, nullable=False)
    status = Column(String(20), default="Confirmed")  # Confirmed / Cancelled / Completed
    cancelled_at = Column(DateTime(timezone=True), nullable=True)
    completed_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

class GalleryPostModel(Base):
    __tablename__ = "gallery_posts"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(String(36), ForeignKey("users.id"), index=True, nullable=False)
    image_url = Column(String(500), nullable=False)
    caption = Column(Text, nullable=True)
    location = Column(String(255), nullable=True)
    tags_json = Column(Text, nullable=False, default="[]")
    likes = Column(Integer, default=0)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))


class PaymentReceiptModel(Base):
    __tablename__ = "payment_receipts"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(String(36), index=True, nullable=True)  # nullable for guest payments
    booking_ref = Column(String(50), index=True, nullable=False)
    destination = Column(String(255), nullable=True)
    start_date = Column(DateTime(timezone=True), nullable=True)
    end_date = Column(DateTime(timezone=True), nullable=True)
    travelers = Column(Integer, nullable=True)
    full_name = Column(String(255), nullable=False)
    email = Column(String(255), nullable=False)
    phone = Column(String(50), nullable=False)
    payment_method = Column(String(50), nullable=False)
    amount = Column(Float, nullable=False)
    receipt_url = Column(String(500), nullable=False)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))


class ChecklistItemModel(Base):
    __tablename__ = "checklist_items"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(String(36), index=True, nullable=True)
    booking_id = Column(String(36), index=True, nullable=True)
    trip_id = Column(String(36), index=True, nullable=True)
    item_name = Column(String(255), nullable=False)
    category = Column(String(100), nullable=True)  # e.g., Clothing, Documents, Toiletries, etc.
    is_packed = Column(Integer, default=0)  # 0 = not packed, 1 = packed
    is_auto_generated = Column(Integer, default=0)  # 0 = user added, 1 = auto-suggested
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))


class ServiceBookingModel(Base):
    __tablename__ = "service_bookings"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(String(36), index=True, nullable=True)
    service_type = Column(String(30), nullable=False)  # flight / hotel / restaurant
    service_json = Column(Text, nullable=False)
    total_price = Column(Float, nullable=False, default=0.0)
    currency = Column(String(10), default="INR")
    booking_ref = Column(String(80), unique=True, index=True, nullable=False)
    status = Column(String(20), default="Pending")
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))


class StatusCheckModel(Base):
    __tablename__ = "status_checks"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    client_name = Column(String(255), nullable=False)
    timestamp = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))


# =============================
# Admin Panel Database Models
# =============================
class AdminModel(Base):
    __tablename__ = "admins"

    id = Column(Integer, primary_key=True, autoincrement=True)
    email = Column(String(255), unique=True, index=True, nullable=False)
    username = Column(String(100), nullable=False)
    hashed_password = Column(String(255), nullable=False)
    role = Column(String(30), default="support")  # super_admin / support
    is_active = Column(Integer, default=1)
    last_login = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime(timezone=True), nullable=True)


class AuditLogModel(Base):
    __tablename__ = "audit_logs"

    id = Column(Integer, primary_key=True, autoincrement=True)
    admin_id = Column(Integer, ForeignKey("admins.id"), nullable=True)
    action = Column(String(100), nullable=False)
    entity_type = Column(String(50), nullable=True)
    entity_id = Column(String(36), nullable=True)
    details = Column(Text, nullable=True)
    ip_address = Column(String(45), nullable=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))


class NotificationModel(Base):
    __tablename__ = "notifications"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(String(36), ForeignKey("users.id"), nullable=True)
    admin_id = Column(Integer, ForeignKey("admins.id"), nullable=True)
    title = Column(String(255), nullable=False)
    message = Column(Text, nullable=False)
    notification_type = Column(String(50), default="info")  # info / warning / success / error
    is_read = Column(Integer, default=0)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))


class DestinationModel(Base):
    __tablename__ = "destinations"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    category = Column(String(50), nullable=True)  # beach / hill / city / heritage / adventure
    country = Column(String(100), nullable=True)
    state = Column(String(100), nullable=True)
    city = Column(String(100), nullable=True)
    image_url = Column(String(500), nullable=True)
    latitude = Column(Float, nullable=True)
    longitude = Column(Float, nullable=True)
    is_active = Column(Integer, default=1)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime(timezone=True), nullable=True)


class PlatformSettingModel(Base):
    __tablename__ = "platform_settings"

    id = Column(Integer, primary_key=True, autoincrement=True)
    setting_key = Column(String(100), unique=True, nullable=False)
    setting_value = Column(Text, nullable=True)
    updated_by = Column(Integer, ForeignKey("admins.id"), nullable=True)
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))


# =============================
# Bus Booking Database Models
# =============================
class BusCityModel(Base):
    __tablename__ = "bus_cities"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(255), nullable=False)
    state = Column(String(100), nullable=True)
    country = Column(String(100), default="India")
    latitude = Column(Float, nullable=True)
    longitude = Column(Float, nullable=True)
    is_active = Column(Integer, default=1)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))


class BusRouteModel(Base):
    __tablename__ = "bus_routes"

    id = Column(Integer, primary_key=True, autoincrement=True)
    from_city_id = Column(Integer, ForeignKey("bus_cities.id"), nullable=False)
    to_city_id = Column(Integer, ForeignKey("bus_cities.id"), nullable=False)
    distance_km = Column(Float, nullable=True)
    estimated_duration_mins = Column(Integer, nullable=True)
    is_active = Column(Integer, default=1)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))


class BusOperatorModel(Base):
    __tablename__ = "bus_operators"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(255), nullable=False)
    logo_url = Column(String(500), nullable=True)
    rating = Column(Float, default=4.0)
    total_reviews = Column(Integer, default=0)
    contact_phone = Column(String(20), nullable=True)
    contact_email = Column(String(255), nullable=True)
    cancellation_policy = Column(Text, nullable=True)
    amenities = Column(Text, nullable=True)  # JSON: wifi, charging, water, blanket, etc.
    is_active = Column(Integer, default=1)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))


class BusModel(Base):
    __tablename__ = "buses"

    id = Column(Integer, primary_key=True, autoincrement=True)
    operator_id = Column(Integer, ForeignKey("bus_operators.id"), nullable=False)
    bus_number = Column(String(50), nullable=False)
    bus_type = Column(String(50), nullable=False)  # AC Sleeper, Non-AC Seater, AC Seater, etc.
    total_seats = Column(Integer, nullable=False)
    seat_layout = Column(String(20), default="2+2")  # 2+2, 2+1, sleeper
    has_upper_deck = Column(Integer, default=0)
    amenities = Column(Text, nullable=True)  # JSON array
    is_active = Column(Integer, default=1)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))


class BusScheduleModel(Base):
    __tablename__ = "bus_schedules"

    id = Column(Integer, primary_key=True, autoincrement=True)
    bus_id = Column(Integer, ForeignKey("buses.id"), nullable=False)
    route_id = Column(Integer, ForeignKey("bus_routes.id"), nullable=False)
    departure_time = Column(String(10), nullable=False)  # HH:MM format
    arrival_time = Column(String(10), nullable=False)    # HH:MM format
    duration_mins = Column(Integer, nullable=True)
    days_of_week = Column(String(50), default="0,1,2,3,4,5,6")  # 0=Monday, 6=Sunday
    base_price = Column(Float, nullable=False)
    is_night_bus = Column(Integer, default=0)
    next_day_arrival = Column(Integer, default=0)
    is_active = Column(Integer, default=1)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))


class BusSeatModel(Base):
    __tablename__ = "bus_seats"

    id = Column(Integer, primary_key=True, autoincrement=True)
    bus_id = Column(Integer, ForeignKey("buses.id"), nullable=False)
    seat_number = Column(String(10), nullable=False)  # L1, L2, U1, U2, 1A, 1B, etc.
    seat_type = Column(String(20), default="seater")  # seater, sleeper, semi-sleeper
    deck = Column(String(10), default="lower")  # lower, upper
    row_number = Column(Integer, nullable=True)
    column_number = Column(Integer, nullable=True)
    position = Column(String(20), default="window")  # window, aisle, middle
    price_modifier = Column(Float, default=0)  # Extra charge for premium seats
    is_female_only = Column(Integer, default=0)
    is_active = Column(Integer, default=1)


class BusBoardingPointModel(Base):
    __tablename__ = "bus_boarding_points"

    id = Column(Integer, primary_key=True, autoincrement=True)
    schedule_id = Column(Integer, ForeignKey("bus_schedules.id"), nullable=False)
    city_id = Column(Integer, ForeignKey("bus_cities.id"), nullable=False)
    point_name = Column(String(255), nullable=False)
    address = Column(Text, nullable=True)
    time = Column(String(10), nullable=False)  # HH:MM
    latitude = Column(Float, nullable=True)
    longitude = Column(Float, nullable=True)
    point_type = Column(String(20), default="boarding")  # boarding, dropping
    is_active = Column(Integer, default=1)


class BusBookingModel(Base):
    __tablename__ = "bus_bookings"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(String(36), ForeignKey("users.id"), nullable=True)
    schedule_id = Column(Integer, ForeignKey("bus_schedules.id"), nullable=False)
    journey_date = Column(String(20), nullable=False)  # YYYY-MM-DD
    pnr = Column(String(20), unique=True, nullable=False)
    booking_status = Column(String(30), default="pending")  # pending, confirmed, cancelled, completed
    total_amount = Column(Float, nullable=False)
    discount_amount = Column(Float, default=0)
    final_amount = Column(Float, nullable=False)
    payment_status = Column(String(30), default="pending")  # pending, paid, refunded
    payment_method = Column(String(30), nullable=True)
    transaction_id = Column(String(100), nullable=True)
    boarding_point_id = Column(Integer, ForeignKey("bus_boarding_points.id"), nullable=True)
    dropping_point_id = Column(Integer, ForeignKey("bus_boarding_points.id"), nullable=True)
    contact_name = Column(String(255), nullable=True)
    contact_email = Column(String(255), nullable=True)
    contact_phone = Column(String(20), nullable=True)
    cancelled_at = Column(DateTime(timezone=True), nullable=True)
    refund_amount = Column(Float, nullable=True)
    refund_status = Column(String(30), nullable=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime(timezone=True), nullable=True)


class BusPassengerModel(Base):
    __tablename__ = "bus_passengers"

    id = Column(Integer, primary_key=True, autoincrement=True)
    booking_id = Column(String(36), ForeignKey("bus_bookings.id"), nullable=False)
    seat_id = Column(Integer, ForeignKey("bus_seats.id"), nullable=False)
    name = Column(String(255), nullable=False)
    age = Column(Integer, nullable=False)
    gender = Column(String(10), nullable=False)  # male, female, other
    id_type = Column(String(50), nullable=True)  # aadhaar, passport, etc.
    id_number = Column(String(100), nullable=True)
    seat_price = Column(Float, nullable=False)


class BusSeatAvailabilityModel(Base):
    __tablename__ = "bus_seat_availability"

    id = Column(Integer, primary_key=True, autoincrement=True)
    schedule_id = Column(Integer, ForeignKey("bus_schedules.id"), nullable=False)
    seat_id = Column(Integer, ForeignKey("bus_seats.id"), nullable=False)
    journey_date = Column(String(20), nullable=False)  # YYYY-MM-DD
    status = Column(String(20), default="available")  # available, booked, locked, blocked
    locked_by = Column(String(36), nullable=True)  # user_id who locked
    locked_until = Column(DateTime(timezone=True), nullable=True)
    booking_id = Column(String(36), ForeignKey("bus_bookings.id"), nullable=True)


class BusLiveTrackingModel(Base):
    __tablename__ = "bus_live_tracking"

    id = Column(Integer, primary_key=True, autoincrement=True)
    schedule_id = Column(Integer, ForeignKey("bus_schedules.id"), nullable=False)
    journey_date = Column(String(20), nullable=False)
    current_latitude = Column(Float, nullable=True)
    current_longitude = Column(Float, nullable=True)
    speed_kmph = Column(Float, nullable=True)
    status = Column(String(30), default="not_started")  # not_started, departed, en_route, arrived
    last_updated = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    eta_mins = Column(Integer, nullable=True)


# =============================
# Flight Booking Models (Advanced MakeMyTrip-style)
# =============================

class AirportModel(Base):
    __tablename__ = "airports"
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    code = Column(String(10), unique=True, nullable=False)  # IATA code (e.g., DEL, BOM)
    name = Column(String(200), nullable=False)
    city = Column(String(100), nullable=False)
    country = Column(String(100), nullable=False)
    latitude = Column(Float, nullable=True)
    longitude = Column(Float, nullable=True)
    timezone = Column(String(50), nullable=True)
    is_active = Column(Integer, default=1)
    created_at = Column(DateTime, default=datetime.utcnow)


class AirlineModel(Base):
    __tablename__ = "airlines"
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    code = Column(String(10), unique=True, nullable=False)  # Airline code (e.g., 6E, AI)
    name = Column(String(200), nullable=False)
    logo_url = Column(String(500), nullable=True)
    country = Column(String(100), nullable=True)
    is_active = Column(Integer, default=1)
    created_at = Column(DateTime, default=datetime.utcnow)


class AircraftModel(Base):
    __tablename__ = "aircraft"
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    model = Column(String(50), nullable=False)  # A320, B737, etc.
    manufacturer = Column(String(100), nullable=True)
    total_seats = Column(Integer, nullable=False)
    economy_seats = Column(Integer, nullable=False)
    business_seats = Column(Integer, default=0)
    seat_layout = Column(String(20), nullable=False)  # 3-3 for economy, 2-2 for business
    created_at = Column(DateTime, default=datetime.utcnow)


class FlightRouteModel(Base):
    __tablename__ = "flight_routes"
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    origin_airport_id = Column(Integer, ForeignKey("airports.id"), nullable=False)
    destination_airport_id = Column(Integer, ForeignKey("airports.id"), nullable=False)
    distance_km = Column(Integer, nullable=True)
    estimated_duration_mins = Column(Integer, nullable=True)
    is_active = Column(Integer, default=1)
    created_at = Column(DateTime, default=datetime.utcnow)


class FlightModel(Base):
    __tablename__ = "flights"
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    flight_number = Column(String(20), nullable=False)
    airline_id = Column(Integer, ForeignKey("airlines.id"), nullable=False)
    route_id = Column(Integer, ForeignKey("flight_routes.id"), nullable=False)
    aircraft_id = Column(Integer, ForeignKey("aircraft.id"), nullable=False)
    departure_time = Column(String(10), nullable=False)  # HH:MM format
    arrival_time = Column(String(10), nullable=False)
    duration_mins = Column(Integer, nullable=False)
    stops = Column(Integer, default=0)
    stop_airports = Column(String(200), nullable=True)  # Comma-separated airport codes
    days_of_week = Column(String(20), nullable=False)  # 1,2,3,4,5,6,7 (Mon-Sun)
    base_price_economy = Column(Float, nullable=False)
    base_price_business = Column(Float, nullable=True)
    is_overnight = Column(Integer, default=0)
    is_refundable = Column(Integer, default=1)
    baggage_allowance = Column(String(100), default="15kg check-in, 7kg cabin")
    meal_included = Column(Integer, default=0)
    is_active = Column(Integer, default=1)
    created_at = Column(DateTime, default=datetime.utcnow)


class FlightScheduleModel(Base):
    __tablename__ = "flight_schedules"
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    flight_id = Column(Integer, ForeignKey("flights.id"), nullable=False)
    flight_date = Column(String(20), nullable=False)  # YYYY-MM-DD
    departure_datetime = Column(DateTime, nullable=False)
    arrival_datetime = Column(DateTime, nullable=False)
    status = Column(String(30), default="scheduled")  # scheduled, boarding, departed, in_air, landed, cancelled, delayed
    delay_mins = Column(Integer, default=0)
    gate = Column(String(10), nullable=True)
    terminal = Column(String(10), nullable=True)
    economy_price = Column(Float, nullable=False)
    business_price = Column(Float, nullable=True)
    available_economy = Column(Integer, nullable=False)
    available_business = Column(Integer, default=0)
    created_at = Column(DateTime, default=datetime.utcnow)


class FlightSeatModel(Base):
    __tablename__ = "flight_seats"
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    aircraft_id = Column(Integer, ForeignKey("aircraft.id"), nullable=False)
    seat_number = Column(String(10), nullable=False)  # 1A, 12F, etc.
    seat_class = Column(String(20), nullable=False)  # economy, business
    seat_type = Column(String(20), nullable=False)  # window, middle, aisle
    row_number = Column(Integer, nullable=False)
    column_letter = Column(String(2), nullable=False)  # A, B, C, D, E, F
    is_extra_legroom = Column(Integer, default=0)
    is_emergency_exit = Column(Integer, default=0)
    is_reclinable = Column(Integer, default=1)
    price_modifier = Column(Float, default=0)  # Extra charge for premium seats
    is_active = Column(Integer, default=1)


class FlightSeatAvailabilityModel(Base):
    __tablename__ = "flight_seat_availability"
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    schedule_id = Column(Integer, ForeignKey("flight_schedules.id"), nullable=False)
    seat_id = Column(Integer, ForeignKey("flight_seats.id"), nullable=False)
    status = Column(String(20), default="available")  # available, locked, booked, blocked
    locked_by = Column(String(36), nullable=True)
    locked_until = Column(DateTime, nullable=True)


class FlightBookingModel(Base):
    __tablename__ = "flight_bookings"
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(String(36), ForeignKey("users.id"), nullable=False)
    booking_reference = Column(String(20), unique=True, nullable=False)
    pnr = Column(String(10), unique=True, nullable=False)
    trip_type = Column(String(20), nullable=False)  # one_way, round_trip, multi_city
    booking_status = Column(String(30), default="confirmed")  # confirmed, cancelled, completed
    total_amount = Column(Float, nullable=False)
    discount_amount = Column(Float, default=0)
    final_amount = Column(Float, nullable=False)
    payment_status = Column(String(20), default="pending")
    payment_method = Column(String(50), nullable=True)
    transaction_id = Column(String(100), nullable=True)
    contact_name = Column(String(200), nullable=False)
    contact_email = Column(String(200), nullable=False)
    contact_phone = Column(String(20), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    cancelled_at = Column(DateTime, nullable=True)
    refund_amount = Column(Float, nullable=True)


class FlightSegmentModel(Base):
    """Each segment of a flight booking (for multi-city or round trips)"""
    __tablename__ = "flight_segments"
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    booking_id = Column(Integer, ForeignKey("flight_bookings.id"), nullable=False)
    segment_order = Column(Integer, nullable=False)  # 1, 2, 3 for multi-city
    schedule_id = Column(Integer, ForeignKey("flight_schedules.id"), nullable=False)
    segment_type = Column(String(20), nullable=False)  # outbound, return, multi_city
    segment_pnr = Column(String(10), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)


class FlightPassengerModel(Base):
    __tablename__ = "flight_passengers"
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    booking_id = Column(Integer, ForeignKey("flight_bookings.id"), nullable=False)
    segment_id = Column(Integer, ForeignKey("flight_segments.id"), nullable=False)
    seat_id = Column(Integer, ForeignKey("flight_seats.id"), nullable=True)
    passenger_type = Column(String(20), nullable=False)  # adult, child, infant
    title = Column(String(10), nullable=False)  # Mr, Mrs, Ms, Master, Miss
    first_name = Column(String(100), nullable=False)
    last_name = Column(String(100), nullable=False)
    date_of_birth = Column(String(20), nullable=True)
    gender = Column(String(10), nullable=False)
    nationality = Column(String(100), nullable=True)
    passport_number = Column(String(50), nullable=True)
    seat_number = Column(String(10), nullable=True)
    seat_class = Column(String(20), nullable=False)  # economy, business
    meal_preference = Column(String(50), nullable=True)  # veg, non_veg, vegan, etc.
    special_assistance = Column(String(200), nullable=True)
    ticket_number = Column(String(20), nullable=True)
    boarding_pass_issued = Column(Integer, default=0)
    fare_amount = Column(Float, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)


class FlightTrackingModel(Base):
    __tablename__ = "flight_tracking"
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    schedule_id = Column(Integer, ForeignKey("flight_schedules.id"), nullable=False)
    current_latitude = Column(Float, nullable=True)
    current_longitude = Column(Float, nullable=True)
    altitude_ft = Column(Integer, nullable=True)
    speed_kmph = Column(Float, nullable=True)
    heading = Column(Integer, nullable=True)
    status = Column(String(30), default="scheduled")  # scheduled, boarding, taxiing, departed, in_air, landing, landed
    progress_percentage = Column(Float, default=0)
    last_updated = Column(DateTime, default=datetime.utcnow)
    eta_mins = Column(Integer, nullable=True)


# =============================
# Hotel Booking Models (Advanced Booking.com/MakeMyTrip-style)
# =============================

class HotelModel(Base):
    __tablename__ = "hotels"
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(300), nullable=False)
    slug = Column(String(300), unique=True, nullable=False)
    description = Column(Text, nullable=True)
    star_category = Column(Integer, nullable=False)  # 1, 2, 3, 4, 5
    hotel_type = Column(String(100), nullable=True)  # Hotel, Resort, Boutique, etc.
    city = Column(String(100), nullable=False)
    state = Column(String(100), nullable=False)
    country = Column(String(100), default="India")
    address = Column(Text, nullable=True)
    latitude = Column(Float, nullable=True)
    longitude = Column(Float, nullable=True)
    landmark = Column(String(200), nullable=True)
    distance_from_center = Column(Float, nullable=True)  # in km
    rating = Column(Float, default=0)  # User rating 0-5
    reviews_count = Column(Integer, default=0)
    price_per_night = Column(Float, nullable=False)  # Starting price
    original_price = Column(Float, nullable=True)  # Before discount
    currency = Column(String(10), default="INR")
    amenities = Column(Text, nullable=True)  # JSON string of amenities
    images = Column(Text, nullable=True)  # JSON string of image URLs
    policies = Column(Text, nullable=True)  # JSON string of policies
    check_in_time = Column(String(10), default="14:00")
    check_out_time = Column(String(10), default="11:00")
    contact_phone = Column(String(20), nullable=True)
    contact_email = Column(String(200), nullable=True)
    gst_number = Column(String(50), nullable=True)
    is_featured = Column(Integer, default=0)
    free_cancellation = Column(Integer, default=1)
    breakfast_included = Column(Integer, default=0)
    total_rooms = Column(Integer, default=50)
    is_active = Column(Integer, default=1)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class HotelRoomModel(Base):
    __tablename__ = "hotel_rooms"
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    hotel_id = Column(Integer, ForeignKey("hotels.id"), nullable=False)
    room_type = Column(String(100), nullable=False)  # Standard, Deluxe, Suite, etc.
    room_name = Column(String(200), nullable=False)
    description = Column(Text, nullable=True)
    max_guests = Column(Integer, default=2)
    max_adults = Column(Integer, default=2)
    max_children = Column(Integer, default=1)
    bed_type = Column(String(100), nullable=False)  # King, Queen, Twin, etc.
    room_size_sqft = Column(Integer, nullable=True)
    view_type = Column(String(100), nullable=True)  # City View, Garden View, Pool View
    price_per_night = Column(Float, nullable=False)
    original_price = Column(Float, nullable=True)
    discount_percent = Column(Float, default=0)
    amenities = Column(Text, nullable=True)  # JSON string
    images = Column(Text, nullable=True)  # JSON string
    inclusions = Column(Text, nullable=True)  # JSON string (breakfast, wifi, etc.)
    cancellation_policy = Column(Text, nullable=True)
    total_rooms = Column(Integer, default=10)
    available_rooms = Column(Integer, default=10)
    is_refundable = Column(Integer, default=1)
    is_active = Column(Integer, default=1)
    created_at = Column(DateTime, default=datetime.utcnow)


class HotelRoomAvailabilityModel(Base):
    __tablename__ = "hotel_room_availability"
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    room_id = Column(Integer, ForeignKey("hotel_rooms.id"), nullable=False)
    date = Column(String(20), nullable=False)  # YYYY-MM-DD
    available_rooms = Column(Integer, nullable=False)
    price = Column(Float, nullable=False)
    is_blocked = Column(Integer, default=0)


class HotelBookingModel(Base):
    __tablename__ = "hotel_bookings"
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    booking_id = Column(String(36), unique=True, nullable=False)  # UUID
    booking_reference = Column(String(20), unique=True, nullable=False)
    user_id = Column(String(36), ForeignKey("users.id"), nullable=False)
    hotel_id = Column(Integer, ForeignKey("hotels.id"), nullable=False)
    room_id = Column(Integer, ForeignKey("hotel_rooms.id"), nullable=False)
    check_in_date = Column(String(20), nullable=False)  # YYYY-MM-DD
    check_out_date = Column(String(20), nullable=False)
    check_in_time = Column(String(10), nullable=True)
    check_out_time = Column(String(10), nullable=True)
    nights = Column(Integer, nullable=False)
    rooms_booked = Column(Integer, default=1)
    adults = Column(Integer, default=2)
    children = Column(Integer, default=0)
    guest_name = Column(String(200), nullable=False)
    guest_email = Column(String(200), nullable=False)
    guest_phone = Column(String(20), nullable=False)
    guest_nationality = Column(String(100), default="Indian")
    special_requests = Column(Text, nullable=True)
    base_price = Column(Float, nullable=False)  # Room rate * nights
    taxes = Column(Float, nullable=False)
    service_charge = Column(Float, default=0)
    discount_amount = Column(Float, default=0)
    total_amount = Column(Float, nullable=False)
    currency = Column(String(10), default="INR")
    payment_status = Column(String(30), default="pending")  # pending, paid, refunded, failed
    payment_method = Column(String(50), nullable=True)
    transaction_id = Column(String(100), nullable=True)
    payment_date = Column(DateTime, nullable=True)
    booking_status = Column(String(30), default="confirmed")  # confirmed, cancelled, completed, no_show
    cancellation_reason = Column(Text, nullable=True)
    cancelled_at = Column(DateTime, nullable=True)
    refund_amount = Column(Float, nullable=True)
    refund_status = Column(String(30), nullable=True)  # pending, processed, failed
    qr_code = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class HotelReviewModel(Base):
    __tablename__ = "hotel_reviews"
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    hotel_id = Column(Integer, ForeignKey("hotels.id"), nullable=False)
    booking_id = Column(Integer, ForeignKey("hotel_bookings.id"), nullable=True)
    user_id = Column(String(36), ForeignKey("users.id"), nullable=False)
    rating = Column(Float, nullable=False)  # 1-5
    cleanliness_rating = Column(Float, nullable=True)
    service_rating = Column(Float, nullable=True)
    location_rating = Column(Float, nullable=True)
    value_rating = Column(Float, nullable=True)
    title = Column(String(200), nullable=True)
    review_text = Column(Text, nullable=True)
    pros = Column(Text, nullable=True)
    cons = Column(Text, nullable=True)
    travel_type = Column(String(50), nullable=True)  # Business, Leisure, Family, Couple
    is_verified = Column(Integer, default=0)
    helpful_count = Column(Integer, default=0)
    is_active = Column(Integer, default=1)
    created_at = Column(DateTime, default=datetime.utcnow)


class HotelWishlistModel(Base):
    __tablename__ = "hotel_wishlists"
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(String(36), ForeignKey("users.id"), nullable=False)
    hotel_id = Column(Integer, ForeignKey("hotels.id"), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)


# =============================
# Advanced Restaurant Booking Models
# =============================

class RestaurantModel(Base):
    __tablename__ = "restaurants"
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(200), nullable=False)
    slug = Column(String(250), nullable=True, index=True)
    description = Column(Text, nullable=True)
    city = Column(String(100), nullable=False, index=True)
    locality = Column(String(200), nullable=True)
    address = Column(Text, nullable=True)
    latitude = Column(Float, nullable=True)
    longitude = Column(Float, nullable=True)
    
    # Cuisine & Category
    cuisines = Column(JSON, default=[])  # ["South Indian", "North Indian", "Chinese"]
    restaurant_type = Column(String(100), nullable=True)  # Fine Dining, Casual, Cafe, Fast Food
    
    # Ratings & Reviews
    rating = Column(Float, default=4.0)
    total_reviews = Column(Integer, default=0)
    food_rating = Column(Float, nullable=True)
    service_rating = Column(Float, nullable=True)
    ambience_rating = Column(Float, nullable=True)
    
    # Pricing
    price_for_two = Column(Integer, default=500)
    price_category = Column(String(20), default="moderate")  # budget, moderate, expensive, premium
    
    # Tags & Features
    is_pure_veg = Column(Integer, default=0)
    has_bar = Column(Integer, default=0)
    is_family_friendly = Column(Integer, default=1)
    has_outdoor_seating = Column(Integer, default=0)
    has_ac = Column(Integer, default=1)
    has_wifi = Column(Integer, default=0)
    has_parking = Column(Integer, default=0)
    accepts_reservations = Column(Integer, default=1)
    has_live_music = Column(Integer, default=0)
    has_private_dining = Column(Integer, default=0)
    
    # Delivery & Takeaway
    has_delivery = Column(Integer, default=1)
    has_takeaway = Column(Integer, default=1)
    avg_delivery_time = Column(Integer, default=30)  # minutes
    
    # Timing
    opening_time = Column(String(10), default="10:00")
    closing_time = Column(String(10), default="23:00")
    is_open_now = Column(Integer, default=1)
    weekly_off = Column(String(20), nullable=True)  # "Sunday", "Monday", etc.
    
    # Media
    images = Column(JSON, default=[])
    logo_url = Column(String(500), nullable=True)
    cover_image = Column(String(500), nullable=True)
    
    # Contact
    phone = Column(String(20), nullable=True)
    email = Column(String(100), nullable=True)
    website = Column(String(200), nullable=True)
    
    # Amenities
    amenities = Column(JSON, default=[])
    
    # Popularity
    popularity_score = Column(Integer, default=0)
    is_featured = Column(Integer, default=0)
    is_trending = Column(Integer, default=0)
    
    # Status
    is_active = Column(Integer, default=1)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class RestaurantTableModel(Base):
    __tablename__ = "restaurant_tables"
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    restaurant_id = Column(Integer, ForeignKey("restaurants.id"), nullable=False)
    table_number = Column(String(20), nullable=False)
    capacity = Column(Integer, default=4)
    table_type = Column(String(50), default="standard")  # standard, booth, outdoor, private, window
    seating_type = Column(String(50), default="indoor")  # indoor, outdoor, rooftop, garden
    is_ac = Column(Integer, default=1)
    floor = Column(Integer, default=0)
    description = Column(String(200), nullable=True)
    min_booking_amount = Column(Integer, default=0)
    is_active = Column(Integer, default=1)
    created_at = Column(DateTime, default=datetime.utcnow)


class RestaurantTimeSlotModel(Base):
    __tablename__ = "restaurant_time_slots"
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    restaurant_id = Column(Integer, ForeignKey("restaurants.id"), nullable=False)
    slot_time = Column(String(10), nullable=False)  # "12:00", "12:30", etc.
    slot_type = Column(String(20), default="lunch")  # breakfast, lunch, dinner, late_night
    is_peak_hour = Column(Integer, default=0)
    peak_hour_charge_percent = Column(Float, default=0)  # 10, 15, 20%
    max_reservations = Column(Integer, default=10)
    is_active = Column(Integer, default=1)


class RestaurantTableAvailabilityModel(Base):
    __tablename__ = "restaurant_table_availability"
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    table_id = Column(Integer, ForeignKey("restaurant_tables.id"), nullable=False)
    date = Column(Date, nullable=False)
    time_slot = Column(String(10), nullable=False)
    is_available = Column(Integer, default=1)
    booking_id = Column(Integer, nullable=True)


class MenuCategoryModel(Base):
    __tablename__ = "menu_categories"
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    restaurant_id = Column(Integer, ForeignKey("restaurants.id"), nullable=False)
    name = Column(String(100), nullable=False)
    description = Column(String(300), nullable=True)
    display_order = Column(Integer, default=0)
    image_url = Column(String(500), nullable=True)
    is_active = Column(Integer, default=1)


class MenuItemModel(Base):
    __tablename__ = "menu_items"
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    restaurant_id = Column(Integer, ForeignKey("restaurants.id"), nullable=False)
    category_id = Column(Integer, ForeignKey("menu_categories.id"), nullable=True)
    name = Column(String(200), nullable=False)
    description = Column(Text, nullable=True)
    price = Column(Float, nullable=False)
    discounted_price = Column(Float, nullable=True)
    
    # Type
    is_veg = Column(Integer, default=1)
    is_bestseller = Column(Integer, default=0)
    is_chef_special = Column(Integer, default=0)
    is_new = Column(Integer, default=0)
    spice_level = Column(Integer, default=1)  # 1-5
    
    # Preparation
    prep_time_mins = Column(Integer, default=15)
    serves = Column(Integer, default=1)  # Number of people
    
    # Media
    image_url = Column(String(500), nullable=True)
    
    # Availability
    available_for_preorder = Column(Integer, default=1)
    available_start_time = Column(String(10), nullable=True)
    available_end_time = Column(String(10), nullable=True)
    
    # Nutrition (optional)
    calories = Column(Integer, nullable=True)
    
    # Status
    is_available = Column(Integer, default=1)
    is_active = Column(Integer, default=1)
    created_at = Column(DateTime, default=datetime.utcnow)


class RestaurantBookingModel(Base):
    __tablename__ = "restaurant_bookings"
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    booking_reference = Column(String(20), unique=True, nullable=False, index=True)
    user_id = Column(String(36), ForeignKey("users.id"), nullable=False)
    restaurant_id = Column(Integer, ForeignKey("restaurants.id"), nullable=False)
    
    # Booking Details
    booking_date = Column(Date, nullable=False)
    time_slot = Column(String(10), nullable=False)
    guests_count = Column(Integer, nullable=False)
    
    # Table Info
    table_id = Column(Integer, ForeignKey("restaurant_tables.id"), nullable=True)
    seating_preference = Column(String(50), nullable=True)  # indoor, outdoor, ac, non_ac
    
    # Guest Info
    guest_name = Column(String(100), nullable=False)
    guest_phone = Column(String(20), nullable=False)
    guest_email = Column(String(100), nullable=True)
    special_requests = Column(Text, nullable=True)
    occasion = Column(String(50), nullable=True)  # Birthday, Anniversary, Date, Business
    
    # Pricing
    base_amount = Column(Float, default=0)
    peak_hour_charge = Column(Float, default=0)
    service_charge = Column(Float, default=0)
    gst = Column(Float, default=0)
    total_amount = Column(Float, default=0)
    advance_paid = Column(Float, default=0)
    
    # Payment
    payment_status = Column(String(20), default="pending")  # pending, partial, paid, refunded
    payment_method = Column(String(30), nullable=True)
    transaction_id = Column(String(100), nullable=True)
    
    # Status
    booking_status = Column(String(20), default="confirmed")  # confirmed, completed, cancelled, no_show
    cancellation_reason = Column(String(200), nullable=True)
    cancelled_at = Column(DateTime, nullable=True)
    
    # QR & Timestamps
    qr_code = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class PreOrderModel(Base):
    __tablename__ = "pre_orders"
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    order_reference = Column(String(20), unique=True, nullable=False, index=True)
    user_id = Column(String(36), ForeignKey("users.id"), nullable=False)
    restaurant_id = Column(Integer, ForeignKey("restaurants.id"), nullable=False)
    booking_id = Column(Integer, ForeignKey("restaurant_bookings.id"), nullable=True)
    
    # Order Details
    order_date = Column(Date, nullable=False)
    arrival_time = Column(String(10), nullable=False)
    guests_count = Column(Integer, nullable=False)
    
    # Guest Info
    guest_name = Column(String(100), nullable=False)
    guest_phone = Column(String(20), nullable=False)
    special_instructions = Column(Text, nullable=True)
    
    # Items
    items = Column(JSON, default=[])  # [{item_id, name, quantity, price, is_veg}]
    
    # Preparation
    estimated_prep_time = Column(Integer, default=30)  # minutes
    ready_by_time = Column(String(10), nullable=True)
    
    # Pricing
    subtotal = Column(Float, default=0)
    gst = Column(Float, default=0)
    packaging_charge = Column(Float, default=0)
    total_amount = Column(Float, default=0)
    
    # Payment
    payment_status = Column(String(20), default="pending")
    payment_method = Column(String(30), nullable=True)
    transaction_id = Column(String(100), nullable=True)
    
    # Status
    order_status = Column(String(20), default="pending")  # pending, confirmed, preparing, ready, completed, cancelled
    
    # QR & Timestamps
    qr_code = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class RestaurantQueueModel(Base):
    __tablename__ = "restaurant_queue"
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    queue_number = Column(String(10), nullable=False)
    user_id = Column(String(36), ForeignKey("users.id"), nullable=True)
    restaurant_id = Column(Integer, ForeignKey("restaurants.id"), nullable=False)
    
    # Queue Details
    queue_date = Column(Date, nullable=False)
    join_time = Column(DateTime, default=datetime.utcnow)
    guests_count = Column(Integer, nullable=False)
    
    # Guest Info
    guest_name = Column(String(100), nullable=False)
    guest_phone = Column(String(20), nullable=False)
    
    # Position
    position = Column(Integer, nullable=False)
    estimated_wait_mins = Column(Integer, default=30)
    
    # Status
    status = Column(String(20), default="waiting")  # waiting, notified, seated, left, expired
    seated_at = Column(DateTime, nullable=True)
    left_at = Column(DateTime, nullable=True)
    
    # QR
    qr_code = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)


class RestaurantReviewModel(Base):
    __tablename__ = "restaurant_reviews"
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(String(36), ForeignKey("users.id"), nullable=False)
    restaurant_id = Column(Integer, ForeignKey("restaurants.id"), nullable=False)
    booking_id = Column(Integer, ForeignKey("restaurant_bookings.id"), nullable=True)
    
    # Ratings
    overall_rating = Column(Float, nullable=False)
    food_rating = Column(Float, nullable=True)
    service_rating = Column(Float, nullable=True)
    ambience_rating = Column(Float, nullable=True)
    value_rating = Column(Float, nullable=True)
    
    # Review Content
    title = Column(String(200), nullable=True)
    review_text = Column(Text, nullable=True)
    
    # Dining Type
    dining_type = Column(String(30), nullable=True)  # Dine-in, Delivery, Takeaway
    visit_type = Column(String(30), nullable=True)  # Family, Friends, Couple, Business, Solo
    
    # Media
    images = Column(JSON, default=[])
    
    # Status
    is_verified = Column(Integer, default=0)
    helpful_count = Column(Integer, default=0)
    is_active = Column(Integer, default=1)
    created_at = Column(DateTime, default=datetime.utcnow)


class RestaurantWishlistModel(Base):
    __tablename__ = "restaurant_wishlists"
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(String(36), ForeignKey("users.id"), nullable=False)
    restaurant_id = Column(Integer, ForeignKey("restaurants.id"), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

app = FastAPI()

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")


# Authentication setup
pwd_context = CryptContext(schemes=["pbkdf2_sha256"], deprecated="auto")

SECRET_KEY = os.environ.get('SECRET_KEY', 'your-secret-key-here')
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 30
PUBLIC_BASE_URL = os.environ.get('PUBLIC_BASE_URL', 'http://127.0.0.1:8001')
HF_API_KEY = os.environ.get('HUGGINGFACE_API_KEY')

security = HTTPBearer()

# Define Models
class StatusCheck(BaseModel):
    model_config = ConfigDict(extra="ignore")  # Ignore MongoDB's _id field

    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    client_name: str
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class StatusCheckCreate(BaseModel):
    client_name: str

class User(BaseModel):
    model_config = ConfigDict(extra="ignore")

    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    email: str
    username: str
    hashed_password: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    profile_image: Optional[str] = None

class UserCreate(BaseModel):
    email: str
    username: str
    password: str

class UserLogin(BaseModel):
    email: str
    password: str

class Token(BaseModel):
    access_token: str
    token_type: str


class UserPublic(BaseModel):
    id: str
    email: str
    username: str
    created_at: datetime
    name: Optional[str] = None
    phone: Optional[str] = None
    profile_image: Optional[str] = None
    favorite_travel_type: Optional[str] = None
    preferred_budget_range: Optional[str] = None
    climate_preference: Optional[str] = None
    food_preference: Optional[str] = None
    language_preference: Optional[str] = None
    notifications_enabled: Optional[int] = 1
    is_kyc_completed: Optional[int] = 0
    payment_profile_completed: Optional[int] = 0


class KYCSubmit(BaseModel):
    full_name: str
    dob: str  # YYYY-MM-DD
    gender: str  # male / female / other
    nationality: str
    id_type: str  # aadhaar / passport / voterid
    id_number: str  # will be hashed
    address_line: str
    city: str
    state: str
    country: str
    pincode: str
    # File URLs handled separately via multipart upload


class KYCStatus(BaseModel):
    is_completed: bool
    verification_status: Optional[str] = None  # pending / verified / rejected
    full_name: Optional[str] = None
    created_at: Optional[datetime] = None


class PaymentProfileSubmit(BaseModel):
    account_holder_name: str
    bank_name: str
    account_number: str  # will be encrypted
    ifsc: str  # will be encrypted
    upi: Optional[str] = None  # will be encrypted
    default_method: str = "bank"  # bank / upi


class PaymentProfileStatus(BaseModel):
    is_completed: bool
    is_payment_profile_completed: Optional[bool] = False
    account_holder_name: Optional[str] = None
    bank_name: Optional[str] = None
    account_last_4: Optional[str] = None  # masked
    default_method: Optional[str] = None
    created_at: Optional[datetime] = None


class TransactionRecord(BaseModel):
    id: str
    booking_id: Optional[str] = None
    service_type: Optional[str] = None
    amount: float
    currency: str


class MockPaymentRequest(BaseModel):
    booking_id: str
    service_type: Optional[str] = None
    amount: float
    currency: str = "INR"
    payment_method: Optional[str] = None


class ProfileUpdate(BaseModel):
    name: Optional[str] = None
    username: Optional[str] = None
    phone: Optional[str] = None
    favorite_travel_type: Optional[str] = None
    preferred_budget_range: Optional[str] = None
    climate_preference: Optional[str] = None
    food_preference: Optional[str] = None
    language_preference: Optional[str] = None
    notifications_enabled: Optional[bool] = None


class PasswordChange(BaseModel):
    current_password: str
    new_password: str


# =============================
# Admin Panel Pydantic Schemas
# =============================
class AdminLogin(BaseModel):
    email: str
    password: str


class AdminToken(BaseModel):
    access_token: str
    token_type: str
    admin: dict


class AdminPublic(BaseModel):
    id: int
    email: str
    username: str
    role: str
    is_active: bool
    last_login: Optional[datetime] = None
    created_at: datetime


class AdminCreate(BaseModel):
    email: str
    username: str
    password: str
    role: str = "support"


class AdminPasswordChange(BaseModel):
    current_password: str
    new_password: str


class DashboardStats(BaseModel):
    total_users: int
    total_bookings: int
    total_revenue: float
    pending_kyc: int
    active_trips: int
    recent_bookings: List[dict] = []
    bookings_by_day: List[dict] = []
    revenue_by_month: List[dict] = []
    top_destinations: List[dict] = []


class UserListItem(BaseModel):
    id: str
    email: str
    username: str
    name: Optional[str] = None
    phone: Optional[str] = None
    is_kyc_completed: int
    is_blocked: Optional[int] = 0
    created_at: datetime


class UserDetail(BaseModel):
    id: str
    email: str
    username: str
    name: Optional[str] = None
    phone: Optional[str] = None
    is_kyc_completed: int
    payment_profile_completed: int
    is_blocked: Optional[int] = 0
    created_at: datetime
    kyc_details: Optional[dict] = None
    bookings: List[dict] = []
    transactions: List[dict] = []


class KYCReviewItem(BaseModel):
    id: int
    user_id: str
    user_email: str
    user_name: str
    full_name: str
    id_type: str
    verification_status: str
    submitted_at: Optional[datetime] = None
    created_at: datetime


class KYCReviewAction(BaseModel):
    action: str  # approve / reject
    reason: Optional[str] = None


class BookingListItem(BaseModel):
    id: str
    user_id: Optional[str] = None
    user_email: Optional[str] = None
    service_type: str
    booking_ref: str
    total_price: float
    currency: str
    status: str
    created_at: datetime


class TransactionListItem(BaseModel):
    id: int
    user_id: str
    user_email: Optional[str] = None
    booking_id: Optional[str] = None
    service_type: Optional[str] = None
    amount: float
    currency: str
    payment_method: str
    status: str
    created_at: datetime


class DestinationCreate(BaseModel):
    name: str
    description: Optional[str] = None
    category: Optional[str] = None
    country: Optional[str] = None
    state: Optional[str] = None
    city: Optional[str] = None
    image_url: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    is_active: int = 1


class DestinationUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    category: Optional[str] = None
    country: Optional[str] = None
    state: Optional[str] = None
    city: Optional[str] = None
    image_url: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    is_active: Optional[int] = None


class NotificationCreate(BaseModel):
    user_id: Optional[str] = None  # None = all users
    title: str
    message: str
    notification_type: str = "info"


class PlatformSettingUpdate(BaseModel):
    maintenance_mode: Optional[bool] = None
    bookings_enabled: Optional[bool] = None
    new_user_registration: Optional[bool] = None


class AuditLogItem(BaseModel):
    id: int
    admin_id: Optional[int] = None
    admin_email: Optional[str] = None
    action: str
    entity_type: Optional[str] = None
    entity_id: Optional[str] = None
    details: Optional[str] = None
    ip_address: Optional[str] = None
    created_at: datetime


# =============================
# Bus Booking Pydantic Schemas
# =============================
class BusCityCreate(BaseModel):
    name: str
    state: Optional[str] = None
    country: str = "India"
    latitude: Optional[float] = None
    longitude: Optional[float] = None


class BusCityResponse(BaseModel):
    id: int
    name: str
    state: Optional[str] = None
    country: str
    is_active: int


class BusOperatorCreate(BaseModel):
    name: str
    logo_url: Optional[str] = None
    rating: float = 4.0
    contact_phone: Optional[str] = None
    contact_email: Optional[str] = None
    cancellation_policy: Optional[str] = None
    amenities: Optional[str] = None  # JSON string


class BusRouteCreate(BaseModel):
    from_city_id: int
    to_city_id: int
    distance_km: Optional[float] = None
    estimated_duration_mins: Optional[int] = None


class BusCreate(BaseModel):
    operator_id: int
    bus_number: str
    bus_type: str
    total_seats: int
    seat_layout: str = "2+2"
    has_upper_deck: int = 0
    amenities: Optional[str] = None


class BusScheduleCreate(BaseModel):
    bus_id: int
    route_id: int
    departure_time: str
    arrival_time: str
    duration_mins: Optional[int] = None
    days_of_week: str = "0,1,2,3,4,5,6"
    base_price: float
    is_night_bus: int = 0
    next_day_arrival: int = 0


class BusBoardingPointCreate(BaseModel):
    schedule_id: int
    city_id: int
    point_name: str
    address: Optional[str] = None
    time: str
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    point_type: str = "boarding"


class BusSearchRequest(BaseModel):
    from_city_id: int
    to_city_id: int
    journey_date: str  # YYYY-MM-DD
    return_date: Optional[str] = None


class BusSeatSelection(BaseModel):
    seat_id: int
    schedule_id: int
    journey_date: str


class BusSeatLockRequest(BaseModel):
    schedule_id: int
    journey_date: str
    seat_ids: List[int]


class BusPassengerInfo(BaseModel):
    seat_id: int
    name: str
    age: int
    gender: str
    id_type: Optional[str] = None
    id_number: Optional[str] = None


class BusBookingCreate(BaseModel):
    schedule_id: int
    journey_date: str
    passengers: List[BusPassengerInfo]
    boarding_point_id: int
    dropping_point_id: int
    contact_name: str
    contact_email: str
    contact_phone: str
    payment_method: str = "mock"


class BusTicketResponse(BaseModel):
    id: str
    pnr: str
    booking_status: str
    journey_date: str
    total_amount: float
    final_amount: float
    payment_status: str
    operator_name: str
    bus_type: str
    bus_number: str
    from_city: str
    to_city: str
    departure_time: str
    arrival_time: str
    boarding_point: str
    boarding_time: str
    dropping_point: str
    dropping_time: str
    passengers: List[dict]
    amenities: List[str]
    cancellation_policy: str
    created_at: datetime


class BusCancellationRequest(BaseModel):
    booking_id: str
    reason: Optional[str] = None


# =============================
# Flight Booking Pydantic Schemas
# =============================

class AirportCreate(BaseModel):
    code: str
    name: str
    city: str
    country: str
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    timezone: Optional[str] = None

class AirportResponse(BaseModel):
    id: int
    code: str
    name: str
    city: str
    country: str
    latitude: Optional[float] = None
    longitude: Optional[float] = None

class AirlineCreate(BaseModel):
    code: str
    name: str
    logo_url: Optional[str] = None
    country: Optional[str] = None

class AirlineResponse(BaseModel):
    id: int
    code: str
    name: str
    logo_url: Optional[str] = None
    country: Optional[str] = None

class AircraftCreate(BaseModel):
    model: str
    manufacturer: Optional[str] = None
    total_seats: int
    economy_seats: int
    business_seats: int = 0
    seat_layout: str  # e.g., "3-3"

class FlightRouteCreate(BaseModel):
    origin_airport_id: int
    destination_airport_id: int
    distance_km: Optional[int] = None
    estimated_duration_mins: Optional[int] = None

class FlightCreate(BaseModel):
    flight_number: str
    airline_id: int
    route_id: int
    aircraft_id: int
    departure_time: str
    arrival_time: str
    duration_mins: int
    stops: int = 0
    stop_airports: Optional[str] = None
    days_of_week: str
    base_price_economy: float
    base_price_business: Optional[float] = None
    is_overnight: int = 0
    is_refundable: int = 1
    baggage_allowance: str = "15kg check-in, 7kg cabin"
    meal_included: int = 0

class FlightSearchRequest(BaseModel):
    origin_code: str  # Airport code or city
    destination_code: str
    departure_date: str  # YYYY-MM-DD
    return_date: Optional[str] = None  # For round trip
    trip_type: str = "one_way"  # one_way, round_trip, multi_city
    passengers_adult: int = 1
    passengers_child: int = 0
    passengers_infant: int = 0
    seat_class: str = "economy"  # economy, business

class FlightSearchResult(BaseModel):
    schedule_id: int
    flight_id: int
    flight_number: str
    airline_id: int
    airline_name: str
    airline_code: str
    airline_logo: Optional[str] = None
    origin_code: str
    origin_city: str
    origin_airport: str
    destination_code: str
    destination_city: str
    destination_airport: str
    departure_time: str
    arrival_time: str
    departure_datetime: str
    arrival_datetime: str
    duration_mins: int
    stops: int
    stop_airports: Optional[str] = None
    is_overnight: int
    is_refundable: int
    baggage_allowance: str
    meal_included: int
    economy_price: float
    business_price: Optional[float] = None
    available_economy: int
    available_business: int
    gate: Optional[str] = None
    terminal: Optional[str] = None
    status: str

class FlightSeatResponse(BaseModel):
    id: int
    seat_number: str
    seat_class: str
    seat_type: str
    row_number: int
    column_letter: str
    is_extra_legroom: int
    is_emergency_exit: int
    price_modifier: float
    status: str
    price: float

class FlightSeatLockRequest(BaseModel):
    schedule_id: int
    seat_ids: List[int]

class FlightPassengerInfo(BaseModel):
    seat_id: Optional[int] = None
    passenger_type: str  # adult, child, infant
    title: str  # Mr, Mrs, Ms, Master, Miss
    first_name: str
    last_name: str
    date_of_birth: Optional[str] = None
    gender: str
    nationality: Optional[str] = None
    passport_number: Optional[str] = None
    meal_preference: Optional[str] = None
    special_assistance: Optional[str] = None
    seat_class: str = "economy"

class FlightBookingCreate(BaseModel):
    trip_type: str  # one_way, round_trip, multi_city
    segments: List[dict]  # [{schedule_id, passengers: [FlightPassengerInfo]}]
    contact_name: str
    contact_email: str
    contact_phone: str
    payment_method: str = "mock"

class FlightTicketResponse(BaseModel):
    id: int
    booking_reference: str
    pnr: str
    trip_type: str
    booking_status: str
    total_amount: float
    final_amount: float
    payment_status: str
    contact_name: str
    contact_email: str
    contact_phone: str
    segments: List[dict]
    created_at: str

class FlightCancellationRequest(BaseModel):
    booking_id: int
    reason: Optional[str] = None


class Trip(BaseModel):
    model_config = ConfigDict(extra="ignore")

    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    destination: str
    days: int
    budget: str
    currency: str
    total_cost: float = 0
    start_date: Optional[datetime] = None
    end_date: Optional[datetime] = None
    travelers: Optional[int] = None
    itinerary: List[dict]
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    images: List[str] = []

class TripCreate(BaseModel):
    destination: str
    days: int
    budget: str
    currency: str
    total_cost: Optional[float] = 0
    start_date: Optional[datetime] = None
    end_date: Optional[datetime] = None
    travelers: Optional[int] = None
    itinerary: List[dict]

class Booking(BaseModel):
    id: str
    destination: str
    start_date: Optional[datetime] = None
    end_date: Optional[datetime] = None
    travelers: int
    package_type: Optional[str] = None
    hotel_name: Optional[str] = None
    flight_number: Optional[str] = None
    total_price: float
    currency: str
    booking_ref: str
    status: str = "Confirmed"
    created_at: datetime

class BookingCreate(BaseModel):
    trip_id: Optional[str] = None
    destination: str
    start_date: Optional[datetime] = None
    end_date: Optional[datetime] = None
    travelers: int = 1
    package_type: Optional[str] = None
    hotel_name: Optional[str] = None
    flight_number: Optional[str] = None
    total_price: float
    currency: str = "INR"

class GalleryPost(BaseModel):
    id: str
    image_url: str
    caption: Optional[str] = None
    location: Optional[str] = None
    tags: List[str] = []
    likes: int
    created_at: datetime

class Destination(BaseModel):
    model_config = ConfigDict(extra="ignore")

    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    category: str
    image: str
    short_description: str
    description: str
    best_time: str
    weather: dict
    attractions: List[str]
    activities: List[str]

# Payment models
class PaymentRequest(BaseModel):
    booking_ref: Optional[str] = None
    destination: Optional[str] = None
    start_date: Optional[datetime] = None
    end_date: Optional[datetime] = None
    travelers: Optional[int] = None

    full_name: str
    email: str
    phone: str
    method: str  # Card / UPI / Wallet
    credential: str  # Card Number / UPI ID / Wallet ID
    amount: float

class PaymentResponse(BaseModel):
    status: str
    booking_ref: str
    receipt_url: str
    ticket_url: Optional[str] = None  # For service-specific tickets (flight/hotel/restaurant)


class ReceiptRecord(BaseModel):
    id: str
    booking_ref: str
    destination: Optional[str] = None
    start_date: Optional[datetime] = None
    end_date: Optional[datetime] = None
    travelers: Optional[int] = None
    full_name: str
    email: str
    phone: str
    payment_method: str
    amount: float
    receipt_url: str
    created_at: datetime

class ChecklistItem(BaseModel):
    id: str
    booking_id: Optional[str] = None
    trip_id: Optional[str] = None
    item_name: str
    category: Optional[str] = None
    is_packed: bool
    is_auto_generated: bool
    created_at: datetime

class ChecklistItemCreate(BaseModel):
    booking_id: Optional[str] = None
    trip_id: Optional[str] = None
    item_name: str
    category: Optional[str] = None

class BookingStatusUpdate(BaseModel):
    status: str  # Confirmed / Cancelled / Completed


# Service Booking Models
class ServiceBookingCreate(BaseModel):
    service_type: str  # flight / hotel / restaurant
    service_json: str  # JSON string of service details
    total_price: float
    currency: str = "INR"


class ServiceBookingResponse(BaseModel):
    id: str
    user_id: str
    service_type: str
    service_json: str
    total_price: float
    currency: str
    booking_ref: str
    status: str
    created_at: datetime


# Search Query Models
class FlightSearchQuery(BaseModel):
    origin: str
    destination: str
    date: Optional[str] = None
    travelers: int = 1


class HotelSearchQuery(BaseModel):
    destination: str
    check_in: Optional[str] = None
    check_out: Optional[str] = None
    guests: int = 1
    min_rating: Optional[float] = None
    max_price: Optional[float] = None


# =============================
# Hotel Pydantic Schemas (Advanced)
# =============================

class HotelSearchRequest(BaseModel):
    city: str
    check_in_date: Optional[str] = None  # YYYY-MM-DD
    check_out_date: Optional[str] = None  # YYYY-MM-DD
    adults: int = 2
    children: int = 0
    rooms: int = 1
    star_rating: Optional[List[int]] = None  # [3, 4, 5]
    min_price: Optional[float] = None
    max_price: Optional[float] = None
    amenities: Optional[List[str]] = None
    hotel_type: Optional[str] = None
    free_cancellation: Optional[bool] = None
    breakfast_included: Optional[bool] = None
    sort_by: str = "popularity"  # popularity, price_low, price_high, rating, distance
    page: int = 1
    limit: int = 20


class HotelCityResponse(BaseModel):
    id: int
    name: str
    state: str
    country: str
    hotel_count: int


class HotelAmenity(BaseModel):
    name: str
    icon: str
    category: str


class HotelImage(BaseModel):
    url: str
    caption: Optional[str] = None
    is_primary: bool = False


class HotelPolicy(BaseModel):
    title: str
    description: str
    category: str  # check_in, cancellation, children, pets, etc.


class HotelListItem(BaseModel):
    id: int
    name: str
    slug: str
    star_category: int
    hotel_type: Optional[str]
    city: str
    state: str
    address: Optional[str]
    latitude: Optional[float]
    longitude: Optional[float]
    rating: float
    reviews_count: int
    price_per_night: float
    original_price: Optional[float]
    currency: str
    primary_image: Optional[str]
    amenities: List[str]
    free_cancellation: bool
    breakfast_included: bool
    distance_from_center: Optional[float]
    landmark: Optional[str]


class HotelDetailResponse(BaseModel):
    id: int
    name: str
    slug: str
    description: Optional[str]
    star_category: int
    hotel_type: Optional[str]
    city: str
    state: str
    country: str
    address: Optional[str]
    latitude: Optional[float]
    longitude: Optional[float]
    landmark: Optional[str]
    distance_from_center: Optional[float]
    rating: float
    reviews_count: int
    price_per_night: float
    original_price: Optional[float]
    currency: str
    amenities: List[dict]
    images: List[dict]
    policies: List[dict]
    check_in_time: str
    check_out_time: str
    contact_phone: Optional[str]
    contact_email: Optional[str]
    gst_number: Optional[str]
    free_cancellation: bool
    breakfast_included: bool
    total_rooms: int


class HotelRoomResponse(BaseModel):
    id: int
    hotel_id: int
    room_type: str
    room_name: str
    description: Optional[str]
    max_guests: int
    max_adults: int
    max_children: int
    bed_type: str
    room_size_sqft: Optional[int]
    view_type: Optional[str]
    price_per_night: float
    original_price: Optional[float]
    discount_percent: float
    amenities: List[str]
    images: List[str]
    inclusions: List[str]
    cancellation_policy: Optional[str]
    available_rooms: int
    is_refundable: bool


class HotelBookingCreate(BaseModel):
    hotel_id: int
    room_id: int
    check_in_date: str
    check_out_date: str
    rooms_booked: int = 1
    adults: int = 2
    children: int = 0
    guest_name: str
    guest_email: str
    guest_phone: str
    guest_nationality: str = "Indian"
    special_requests: Optional[str] = None


class HotelBookingResponse(BaseModel):
    booking_id: str
    booking_reference: str
    hotel_name: str
    hotel_address: Optional[str]
    hotel_phone: Optional[str]
    hotel_email: Optional[str]
    hotel_star: int
    hotel_gst: Optional[str]
    room_type: str
    room_name: str
    bed_type: str
    check_in_date: str
    check_out_date: str
    check_in_time: str
    check_out_time: str
    nights: int
    rooms_booked: int
    adults: int
    children: int
    guest_name: str
    guest_email: str
    guest_phone: str
    guest_nationality: str
    special_requests: Optional[str]
    base_price: float
    taxes: float
    service_charge: float
    discount_amount: float
    total_amount: float
    currency: str
    payment_status: str
    payment_method: Optional[str]
    transaction_id: Optional[str]
    booking_status: str
    qr_code: Optional[str]
    created_at: datetime


class HotelReviewCreate(BaseModel):
    hotel_id: int
    booking_id: Optional[int] = None
    rating: float
    cleanliness_rating: Optional[float] = None
    service_rating: Optional[float] = None
    location_rating: Optional[float] = None
    value_rating: Optional[float] = None
    title: Optional[str] = None
    review_text: Optional[str] = None
    pros: Optional[str] = None
    cons: Optional[str] = None
    travel_type: Optional[str] = None


class HotelReviewResponse(BaseModel):
    id: int
    hotel_id: int
    user_name: str
    rating: float
    cleanliness_rating: Optional[float]
    service_rating: Optional[float]
    location_rating: Optional[float]
    value_rating: Optional[float]
    title: Optional[str]
    review_text: Optional[str]
    pros: Optional[str]
    cons: Optional[str]
    travel_type: Optional[str]
    is_verified: bool
    helpful_count: int
    created_at: datetime


# =============================
# Advanced Restaurant Pydantic Schemas
# =============================

class RestaurantSearchRequest(BaseModel):
    city: str
    date: Optional[str] = None  # YYYY-MM-DD
    time: Optional[str] = None  # HH:MM
    guests: int = 2
    cuisines: Optional[List[str]] = None
    is_pure_veg: Optional[bool] = None
    has_bar: Optional[bool] = None
    price_category: Optional[str] = None  # budget, moderate, expensive, premium
    min_rating: Optional[float] = None
    has_outdoor_seating: Optional[bool] = None
    has_ac: Optional[bool] = None
    sort_by: str = "popularity"  # popularity, rating, price_low, price_high, distance
    page: int = 1
    limit: int = 20


class RestaurantCityResponse(BaseModel):
    city: str
    restaurant_count: int


class RestaurantListItem(BaseModel):
    id: int
    name: str
    slug: Optional[str]
    city: str
    locality: Optional[str]
    address: Optional[str]
    cuisines: List[str]
    restaurant_type: Optional[str]
    rating: float
    total_reviews: int
    price_for_two: int
    price_category: str
    is_pure_veg: bool
    has_bar: bool
    is_family_friendly: bool
    has_outdoor_seating: bool
    has_ac: bool
    has_delivery: bool
    avg_delivery_time: int
    opening_time: str
    closing_time: str
    is_open_now: bool
    cover_image: Optional[str]
    images: List[str]
    amenities: List[str]
    is_featured: bool
    is_trending: bool


class RestaurantDetailResponse(BaseModel):
    id: int
    name: str
    slug: Optional[str]
    description: Optional[str]
    city: str
    locality: Optional[str]
    address: Optional[str]
    latitude: Optional[float]
    longitude: Optional[float]
    cuisines: List[str]
    restaurant_type: Optional[str]
    rating: float
    total_reviews: int
    food_rating: Optional[float]
    service_rating: Optional[float]
    ambience_rating: Optional[float]
    price_for_two: int
    price_category: str
    is_pure_veg: bool
    has_bar: bool
    is_family_friendly: bool
    has_outdoor_seating: bool
    has_ac: bool
    has_wifi: bool
    has_parking: bool
    accepts_reservations: bool
    has_live_music: bool
    has_private_dining: bool
    has_delivery: bool
    has_takeaway: bool
    avg_delivery_time: int
    opening_time: str
    closing_time: str
    is_open_now: bool
    weekly_off: Optional[str]
    images: List[dict]
    logo_url: Optional[str]
    cover_image: Optional[str]
    phone: Optional[str]
    email: Optional[str]
    website: Optional[str]
    amenities: List[dict]
    is_featured: bool
    is_trending: bool


class RestaurantTableResponse(BaseModel):
    id: int
    restaurant_id: int
    table_number: str
    capacity: int
    table_type: str
    seating_type: str
    is_ac: bool
    floor: int
    description: Optional[str]
    min_booking_amount: int
    is_available: bool = True


class TimeSlotResponse(BaseModel):
    slot_time: str
    slot_type: str
    is_peak_hour: bool
    peak_hour_charge_percent: float
    is_available: bool
    available_tables: int


class MenuCategoryResponse(BaseModel):
    id: int
    name: str
    description: Optional[str]
    image_url: Optional[str]
    items_count: int


class MenuItemResponse(BaseModel):
    id: int
    restaurant_id: int
    category_id: Optional[int]
    category_name: Optional[str]
    name: str
    description: Optional[str]
    price: float
    discounted_price: Optional[float]
    is_veg: bool
    is_bestseller: bool
    is_chef_special: bool
    is_new: bool
    spice_level: int
    prep_time_mins: int
    serves: int
    image_url: Optional[str]
    available_for_preorder: bool
    is_available: bool


class TableBookingCreate(BaseModel):
    restaurant_id: int
    booking_date: str  # YYYY-MM-DD
    time_slot: str  # HH:MM
    guests_count: int
    table_id: Optional[int] = None
    seating_preference: Optional[str] = None  # indoor, outdoor, ac, non_ac
    guest_name: str
    guest_phone: str
    guest_email: Optional[str] = None
    special_requests: Optional[str] = None
    occasion: Optional[str] = None  # Birthday, Anniversary, Date, Business
    payment_method: Optional[str] = None


class TableBookingResponse(BaseModel):
    id: int
    booking_reference: str
    restaurant_id: int
    restaurant_name: str
    restaurant_address: Optional[str]
    restaurant_phone: Optional[str]
    booking_date: str
    time_slot: str
    guests_count: int
    table_number: Optional[str]
    table_type: Optional[str]
    seating_preference: Optional[str]
    guest_name: str
    guest_phone: str
    guest_email: Optional[str]
    special_requests: Optional[str]
    occasion: Optional[str]
    base_amount: float
    peak_hour_charge: float
    service_charge: float
    gst: float
    total_amount: float
    advance_paid: float
    payment_status: str
    payment_method: Optional[str]
    booking_status: str
    qr_code: Optional[str]
    created_at: datetime


class PreOrderCreate(BaseModel):
    restaurant_id: int
    booking_id: Optional[int] = None
    order_date: str  # YYYY-MM-DD
    arrival_time: str  # HH:MM
    guests_count: int
    guest_name: str
    guest_phone: str
    special_instructions: Optional[str] = None
    items: List[dict]  # [{item_id, quantity}]
    payment_method: Optional[str] = None


class PreOrderResponse(BaseModel):
    id: int
    order_reference: str
    restaurant_id: int
    restaurant_name: str
    booking_id: Optional[int]
    order_date: str
    arrival_time: str
    guests_count: int
    guest_name: str
    guest_phone: str
    special_instructions: Optional[str]
    items: List[dict]
    estimated_prep_time: int
    ready_by_time: Optional[str]
    subtotal: float
    gst: float
    packaging_charge: float
    total_amount: float
    payment_status: str
    payment_method: Optional[str]
    order_status: str
    qr_code: Optional[str]
    created_at: datetime


class JoinQueueRequest(BaseModel):
    restaurant_id: int
    guests_count: int
    guest_name: str
    guest_phone: str


class QueueResponse(BaseModel):
    id: int
    queue_number: str
    restaurant_id: int
    restaurant_name: str
    queue_date: str
    join_time: datetime
    guests_count: int
    guest_name: str
    guest_phone: str
    position: int
    estimated_wait_mins: int
    status: str
    qr_code: Optional[str]


class RestaurantReviewCreate(BaseModel):
    restaurant_id: int
    booking_id: Optional[int] = None
    overall_rating: float
    food_rating: Optional[float] = None
    service_rating: Optional[float] = None
    ambience_rating: Optional[float] = None
    value_rating: Optional[float] = None
    title: Optional[str] = None
    review_text: Optional[str] = None
    dining_type: Optional[str] = None
    visit_type: Optional[str] = None


class RestaurantReviewResponse(BaseModel):
    id: int
    restaurant_id: int
    user_name: str
    overall_rating: float
    food_rating: Optional[float]
    service_rating: Optional[float]
    ambience_rating: Optional[float]
    value_rating: Optional[float]
    title: Optional[str]
    review_text: Optional[str]
    dining_type: Optional[str]
    visit_type: Optional[str]
    images: List[str]
    is_verified: bool
    helpful_count: int
    created_at: datetime


# Add your routes to the router instead of directly to app
@api_router.get("/")
async def root():
    return {"message": "Hello World"}

# Smart packing checklist templates
PACKING_TEMPLATES = {
    "Beach": {
        "Clothing": ["Swimwear", "Beach cover-up", "Shorts", "T-shirts", "Sandals", "Sun hat", "Sunglasses"],
        "Toiletries": ["Sunscreen SPF 50+", "After-sun lotion", "Lip balm with SPF", "Waterproof phone case"],
        "Accessories": ["Beach towel", "Beach bag", "Snorkeling gear", "Flip flops"],
        "Essentials": ["Passport", "Tickets", "Hotel booking", "Travel insurance", "Cash/Cards"]
    },
    "Mountain": {
        "Clothing": ["Warm jacket", "Thermal wear", "Gloves", "Woolen cap", "Hiking boots", "Thick socks", "Waterproof pants"],
        "Toiletries": ["Moisturizer", "Lip balm", "Hand cream", "Sunscreen", "First aid kit"],
        "Accessories": ["Backpack", "Trekking pole", "Water bottle", "Flashlight", "Power bank"],
        "Essentials": ["Passport", "Tickets", "Hotel booking", "Travel insurance", "Cash/Cards", "Emergency contacts"]
    },
    "Heritage": {
        "Clothing": ["Comfortable walking shoes", "Light jacket", "Modest clothing", "Scarf/shawl", "Sun hat"],
        "Toiletries": ["Sunscreen", "Hand sanitizer", "Wet wipes", "Basic medicines"],
        "Accessories": ["Camera", "Guidebook", "Daypack", "Water bottle", "Notebook"],
        "Essentials": ["Passport", "Tickets", "Hotel booking", "Travel insurance", "Cash/Cards", "Museum passes"]
    },
    "Adventure": {
        "Clothing": ["Quick-dry clothes", "Sports shoes", "Cap", "Sunglasses", "Rain jacket", "Extra socks"],
        "Toiletries": ["Sunscreen", "Insect repellent", "First aid kit", "Energy bars", "Electrolyte powder"],
        "Accessories": ["GoPro/Action camera", "Headlamp", "Multi-tool", "Dry bag", "Portable charger"],
        "Essentials": ["Passport", "Tickets", "Activity bookings", "Travel insurance", "Emergency contact", "Maps"]
    },
    "Urban": {
        "Clothing": ["Casual wear", "Comfortable shoes", "Light jacket", "Accessories for photos"],
        "Toiletries": ["Travel-size toiletries", "Hand sanitizer", "Wet wipes", "Basic medicines"],
        "Accessories": ["Phone charger", "Power bank", "Camera", "Day bag", "Reusable water bottle"],
        "Essentials": ["Passport", "Tickets", "Hotel booking", "Travel card/pass", "City map/app"]
    },
    "Default": {
        "Clothing": ["Comfortable clothes", "Shoes", "Light jacket", "Undergarments", "Socks"],
        "Toiletries": ["Toothbrush", "Toothpaste", "Soap", "Shampoo", "Deodorant", "Sunscreen"],
        "Accessories": ["Phone charger", "Power bank", "Headphones", "Books/e-reader"],
        "Essentials": ["Passport", "Tickets", "Hotel booking", "Travel insurance", "Cash", "Credit cards"]
    }
}

def _detect_destination_category(destination: str) -> str:
    """Detect category from destination name or return Default."""
    dest_lower = destination.lower()
    # Beach destinations
    if any(word in dest_lower for word in ['goa', 'beach', 'maldives', 'bali', 'phuket', 'coast', 'island']):
        return "Beach"
    # Mountain destinations
    if any(word in dest_lower for word in ['kashmir', 'mountain', 'himalaya', 'nepal', 'manali', 'shimla', 'ladakh', 'ski']):
        return "Mountain"
    # Heritage destinations
    if any(word in dest_lower for word in ['rome', 'paris', 'egypt', 'petra', 'heritage', 'delhi', 'agra', 'jaipur', 'rajasthan']):
        return "Heritage"
    # Adventure destinations
    if any(word in dest_lower for word in ['adventure', 'safari', 'jungle', 'rishikesh', 'queenstown', 'interlaken']):
        return "Adventure"
    # Urban destinations
    if any(word in dest_lower for word in ['tokyo', 'new york', 'london', 'dubai', 'singapore', 'city', 'urban', 'mumbai']):
        return "Urban"
    return "Default"

def _generate_checklist_for_booking(booking_id: str, destination: str, db: Session) -> List[str]:
    """Auto-generate smart packing checklist items based on destination."""
    category = _detect_destination_category(destination)
    template = PACKING_TEMPLATES.get(category, PACKING_TEMPLATES["Default"])
    
    item_ids = []
    for cat, items in template.items():
        for item_name in items:
            item = ChecklistItemModel(
                user_id=None,  # TODO: associate with current user
                booking_id=booking_id,
                item_name=item_name,
                category=cat,
                is_auto_generated=1
            )
            db.add(item)
            db.flush()
            item_ids.append(item.id)
    db.commit()
    return item_ids

def _mask_credential(method: str, credential: str) -> str:
    try:
        m = method.lower()
        if m == 'card':
            digits = ''.join(filter(str.isdigit, credential))
            if len(digits) <= 4:
                return digits
            return f"{'*' * (len(digits) - 4)}{digits[-4:]}"
        if m in ('upi', 'wallet'):
            parts = credential.split('@', 1)
            if len(parts) == 2:
                user, domain = parts
                return f"{user[:2]}***@{domain}"
            return credential[:2] + '***' if len(credential) > 2 else credential
    except Exception:
        pass
    return credential

def _get_fernet() -> Fernet:
    # Derive a stable Fernet key from SECRET_KEY (SHA-256 then urlsafe base64)
    digest = hashlib.sha256(SECRET_KEY.encode('utf-8')).digest()
    key = base64.urlsafe_b64encode(digest)
    return Fernet(key)

def _qr_encrypt(payload: dict) -> str:
    token = _get_fernet().encrypt(json.dumps(payload).encode('utf-8'))
    return token.decode('utf-8')

def _qr_decrypt(token: str) -> dict:
    data = _get_fernet().decrypt(token.encode('utf-8'))
    return json.loads(data.decode('utf-8'))

def _build_qr_verification_url(booking_ref: str, service_type: str) -> str:
    payload = {
        'br': booking_ref,
        'stype': service_type,
        'iat': datetime.now(timezone.utc).isoformat()
    }
    token = _qr_encrypt(payload)
    base = PUBLIC_BASE_URL.rstrip('/')
    return f"{base}/ticket/verify?token={token}"

def _generate_flight_ticket_pdf(service_data: dict, booking_ref: str, passenger_info: dict, upload_dir: Path) -> str:
    """Generate a realistic flight ticket PDF with boarding pass layout - PLACEHOLDER VERSION."""
    # PDF generation temporarily disabled due to dependency issues
    # This function would normally generate a PDF ticket
    tickets_dir = upload_dir / 'tickets'
    tickets_dir.mkdir(parents=True, exist_ok=True)
    
    # Create a simple text file as placeholder
    filename = f"flight_ticket_{booking_ref}.txt"
    file_path = tickets_dir / filename
    
    # Create a simple text-based ticket
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
    
    return str(file_path)
    
    # PNR and E-Ticket Number
    pdf.set_text_color(255, 255, 255)
    pdf.set_xy(150, 10)
    pdf.set_font('Arial', 'B', 12)
    pdf.cell(0, 5, f'PNR: {booking_ref}', 0, 1)
    pdf.set_xy(150, 17)
    pdf.set_font('Arial', '', 9)
    pdf.cell(0, 5, f"E-Ticket: {booking_ref[:6].upper()}", 0, 1)
    pdf.set_xy(150, 24)
    pdf.cell(0, 5, f"Date: {datetime.now().strftime('%d %b %Y')}", 0, 1)
    
    # Passenger Details Section
    y = 50
    pdf.set_xy(10, y)
    pdf.set_fill_color(240, 240, 240)
    pdf.rect(10, y, 190, 8, 'F')
    pdf.set_text_color(0, 0, 0)
    pdf.set_font('Arial', 'B', 11)
    pdf.cell(0, 8, 'PASSENGER DETAILS', 0, 1)
    
    y += 12
    pdf.set_font('Arial', '', 10)
    pdf.set_xy(10, y)
    pdf.cell(95, 6, f"Name: {passenger_info.get('fullName', passenger_info.get('full_name', 'N/A'))}", 0, 0)
    pdf.cell(95, 6, f"Gender: {passenger_info.get('gender', 'N/A').capitalize()}", 0, 1)
    
    y += 8
    pdf.set_xy(10, y)
    pdf.cell(95, 6, f"Date of Birth: {passenger_info.get('dateOfBirth', passenger_info.get('date_of_birth', 'N/A'))}", 0, 0)
    pdf.cell(95, 6, f"Nationality: {passenger_info.get('nationality', 'N/A')}", 0, 1)
    
    y += 8
    pdf.set_xy(10, y)
    pdf.cell(95, 6, f"Email: {passenger_info.get('email', 'N/A')}", 0, 0)
    pdf.cell(95, 6, f"Mobile: {passenger_info.get('mobile', 'N/A')}", 0, 1)
    
    y += 8
    pdf.set_xy(10, y)
    passport_num = passenger_info.get('passportNumber', passenger_info.get('passport_number', 'N/A'))
    pdf.cell(0, 6, f"Passport / ID: {passport_num}", 0, 1)
    
    # Flight Details Section with Boarding Pass Layout
    y += 15
    pdf.set_xy(10, y)
    pdf.set_fill_color(0, 102, 204)  # Blue
    pdf.rect(10, y, 190, 10, 'F')
    pdf.set_text_color(255, 255, 255)
    pdf.set_font('Arial', 'B', 12)
    pdf.set_xy(10, y + 2)
    pdf.cell(0, 6, 'FLIGHT INFORMATION', 0, 1, 'C')
    
    # Flight Number and Class
    y += 15
    pdf.set_text_color(0, 0, 0)
    pdf.set_xy(10, y)
    pdf.set_font('Arial', 'B', 14)
    pdf.cell(95, 8, f"Flight: {service_data.get('flight_number', 'N/A')}", 0, 0)
    pdf.cell(95, 8, f"Class: {service_data.get('class', 'Economy').upper()}", 0, 1)
    
    # Route with large font
    y += 15
    pdf.set_font('Arial', 'B', 18)
    pdf.set_xy(10, y)
    origin = service_data.get('origin', 'N/A')
    destination = service_data.get('destination', 'N/A')
    pdf.cell(70, 10, origin, 0, 0, 'C')
    pdf.set_font('Arial', '', 16)
    pdf.cell(50, 10, '->', 0, 0, 'C')
    pdf.set_font('Arial', 'B', 18)
    pdf.cell(70, 10, destination, 0, 1, 'C')
    
    # Departure and Arrival Times
    y += 15
    pdf.set_font('Arial', '', 10)
    departure_time = service_data.get('departure_time', '')
    arrival_time = service_data.get('arrival_time', '')
    departure_date = service_data.get('departureDate', '')
    
    try:
        if departure_time:
            dep_dt = datetime.fromisoformat(departure_time.replace('Z', '+00:00'))
            dep_str = dep_dt.strftime('%H:%M')
            dep_date = dep_dt.strftime('%d %b %Y')
        elif departure_date:
            dep_str = 'TBA'
            dep_date = departure_date
        else:
            dep_str = 'TBA'
            dep_date = 'TBA'
            
        if arrival_time:
            arr_dt = datetime.fromisoformat(arrival_time.replace('Z', '+00:00'))
            arr_str = arr_dt.strftime('%H:%M')
            arr_date = arr_dt.strftime('%d %b %Y')
        else:
            arr_str = 'TBA'
            arr_date = dep_date
    except:
        dep_str = departure_time[:5] if departure_time else 'TBA'
        arr_str = arrival_time[:5] if arrival_time else 'TBA'
        dep_date = departure_date if departure_date else 'TBA'
        arr_date = dep_date
    
    pdf.set_xy(10, y)
    pdf.set_font('Arial', 'B', 11)
    pdf.cell(70, 6, 'DEPARTURE', 0, 0, 'C')
    pdf.cell(50, 6, 'DURATION', 0, 0, 'C')
    pdf.cell(70, 6, 'ARRIVAL', 0, 1, 'C')
    
    y += 8
    pdf.set_xy(10, y)
    pdf.set_font('Arial', 'B', 14)
    pdf.cell(70, 6, dep_str, 0, 0, 'C')
    pdf.set_font('Arial', '', 11)
    pdf.cell(50, 6, service_data.get('duration', 'N/A'), 0, 0, 'C')
    pdf.set_font('Arial', 'B', 14)
    pdf.cell(70, 6, arr_str, 0, 1, 'C')
    
    y += 8
    pdf.set_xy(10, y)
    pdf.set_font('Arial', '', 9)
    pdf.cell(70, 5, dep_date, 0, 0, 'C')
    pdf.cell(50, 5, '', 0, 0, 'C')
    pdf.cell(70, 5, arr_date, 0, 1, 'C')
    
    # Boarding Pass Section
    y += 15
    pdf.set_xy(10, y)
    pdf.set_fill_color(255, 215, 0)  # Gold
    pdf.rect(10, y, 190, 45, 'F')
    pdf.set_fill_color(0, 0, 0)
    pdf.rect(10, y, 190, 10, 'F')
    pdf.set_text_color(255, 255, 255)
    pdf.set_font('Arial', 'B', 12)
    pdf.set_xy(10, y + 2)
    pdf.cell(0, 6, 'BOARDING INFORMATION', 0, 1, 'C')
    
    y += 15
    pdf.set_text_color(0, 0, 0)
    pdf.set_font('Arial', 'B', 11)
    pdf.set_xy(15, y)
    pdf.cell(45, 6, 'GATE', 0, 0)
    pdf.cell(45, 6, 'SEAT', 0, 0)
    pdf.cell(45, 6, 'BOARDING TIME', 0, 0)
    pdf.cell(45, 6, 'DATE', 0, 1)
    
    y += 8
    pdf.set_font('Arial', 'B', 16)
    pdf.set_xy(15, y)
    gate = service_data.get('gate', 'TBA')
    seat = passenger_info.get('seatNumber', passenger_info.get('seat_number', 'N/A'))
    boarding_time = service_data.get('boardingTime', 'TBA')
    
    pdf.cell(45, 8, str(gate), 0, 0)
    pdf.cell(45, 8, seat, 0, 0)
    pdf.set_font('Arial', 'B', 14)
    pdf.cell(45, 8, boarding_time, 0, 0)
    pdf.set_font('Arial', '', 10)
    pdf.cell(45, 8, dep_date, 0, 1)
    
    # Additional Information
    y += 15
    pdf.set_xy(10, y)
    pdf.set_font('Arial', 'B', 10)
    pdf.cell(60, 6, 'Baggage Allowance:', 0, 0)
    pdf.set_font('Arial', '', 10)
    pdf.cell(0, 6, service_data.get('baggage', 'Check-in: 20kg, Cabin: 7kg'), 0, 1)
    
    y += 8
    pdf.set_xy(10, y)
    pdf.set_font('Arial', 'B', 10)
    pdf.cell(60, 6, 'Booking Status:', 0, 0)
    pdf.set_font('Arial', '', 10)
    pdf.set_text_color(0, 128, 0)
    pdf.cell(0, 6, 'CONFIRMED', 0, 1)
    
    # Generate QR Code
    y += 15
    pdf.set_text_color(0, 0, 0)
    
    # QR Code now encodes a secure verification URL
    qr_data = _build_qr_verification_url(booking_ref, 'flight')
    
    # Create QR code
    qr = None  # qrcode disabled
    qr.add_data(qr_data)
    qr.make(fit=True)
    qr_img = qr.make_image(fill_color="black", back_color="white")
    
    # Save QR code to temporary file
    qr_temp_path = tickets_dir / f"qr_{booking_ref}.png"
    qr_img.save(str(qr_temp_path))
    
    # Add QR code to PDF (right side)
    pdf.image(str(qr_temp_path), x=155, y=y, w=40, h=40)
    
    # Add barcode on left side
    pdf.set_xy(10, y)
    pdf.set_fill_color(0, 0, 0)
    for i in range(35):
        if i % 2 == 0:
            pdf.rect(10 + i * 3, y, 2, 15, 'F')
    
    pdf.set_text_color(0, 0, 0)
    pdf.set_xy(10, y + 18)
    pdf.set_font('Arial', '', 8)
    pdf.cell(105, 4, f'*{booking_ref}*', 0, 0, 'C')
    
    # QR Code label
    pdf.set_xy(155, y + 42)
    pdf.set_font('Arial', '', 7)
    pdf.cell(40, 3, 'Scan for Details', 0, 0, 'C')
    
    # Footer
    y += 50
    pdf.set_xy(10, y)
    pdf.set_font('Arial', 'I', 9)
    pdf.set_text_color(100, 100, 100)
    pdf.cell(0, 5, '* Please arrive at the airport at least 2-3 hours before departure for international flights.', 0, 1)
    y += 5
    pdf.set_xy(10, y)
    pdf.cell(0, 5, '* Carry a valid government-issued photo ID and passport for verification.', 0, 1)
    y += 5
    pdf.set_xy(10, y)
    pdf.cell(0, 5, f"* Boarding closes 30 minutes before departure. For queries: support@wanderlite.com | PNR: {booking_ref}", 0, 1)
    
    pdf.output(str(file_path))
    
    # Clean up QR code temp file
    try:
        qr_temp_path.unlink()
    except:
        pass
    
    return f"/uploads/{str(file_path.relative_to(upload_dir))}"


def _generate_hotel_voucher_pdf(service_data: dict, booking_ref: str, guest_info: dict, upload_dir: Path) -> str:
    """Generate a hotel booking voucher PDF - PLACEHOLDER VERSION."""
    tickets_dir = upload_dir / 'tickets'
    tickets_dir.mkdir(parents=True, exist_ok=True)
    
    filename = f"hotel_voucher_{booking_ref}.txt"
    file_path = tickets_dir / filename
    
    # Create a simple text-based voucher
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
    
    # Header
    pdf.set_fill_color(102, 51, 153)  # Purple
    pdf.rect(0, 0, 210, 35, 'F')
    pdf.set_text_color(255, 255, 255)
    pdf.set_font('Arial', 'B', 20)
    pdf.set_xy(10, 10)
    pdf.cell(0, 10, 'HOTEL BOOKING VOUCHER', 0, 1)
    
    pdf.set_xy(150, 12)
    pdf.set_font('Arial', 'B', 11)
    pdf.cell(0, 5, f'Voucher: {booking_ref}', 0, 1)
    
    # Hotel Name
    y = 45
    pdf.set_text_color(0, 0, 0)
    pdf.set_font('Arial', 'B', 16)
    pdf.set_xy(10, y)
    pdf.cell(0, 10, service_data.get('name', 'Hotel Name'), 0, 1)
    
    # Rating
    rating = service_data.get('rating', 0)
    pdf.set_font('Arial', '', 12)
    pdf.set_xy(10, y + 10)
    pdf.cell(0, 6, f"Rating: {rating}/5", 0, 1)
    
    # Location
    pdf.set_xy(10, y + 18)
    pdf.cell(0, 6, f"Location: {service_data.get('location', 'N/A')}", 0, 1)
    
    # Guest Details
    y += 35
    pdf.set_xy(10, y)
    pdf.set_fill_color(240, 240, 240)
    pdf.rect(10, y, 190, 8, 'F')
    pdf.set_font('Arial', 'B', 11)
    pdf.cell(0, 8, 'GUEST DETAILS', 0, 1)
    
    y += 12
    pdf.set_font('Arial', '', 10)
    pdf.set_xy(10, y)
    pdf.cell(0, 6, f"Name: {guest_info.get('full_name', 'N/A')}", 0, 1)
    pdf.set_xy(10, y + 6)
    pdf.cell(0, 6, f"Email: {guest_info.get('email', 'N/A')}", 0, 1)
    pdf.set_xy(10, y + 12)
    pdf.cell(0, 6, f"Phone: {guest_info.get('phone', 'N/A')}", 0, 1)
    pdf.set_xy(10, y + 18)
    pdf.cell(0, 6, f"Guests: {service_data.get('guests', 1)} person(s)", 0, 1)
    
    # Booking Details
    y += 35
    pdf.set_xy(10, y)
    pdf.set_fill_color(240, 240, 240)
    pdf.rect(10, y, 190, 8, 'F')
    pdf.set_font('Arial', 'B', 11)
    pdf.cell(0, 8, 'BOOKING DETAILS', 0, 1)
    
    y += 12
    pdf.set_font('Arial', '', 10)
    pdf.set_xy(10, y)
    pdf.cell(95, 6, f"Check-in: {service_data.get('check_in', 'N/A')}", 0, 0)
    pdf.cell(95, 6, f"Check-out: {service_data.get('check_out', 'N/A')}", 0, 1)
    
    pdf.set_xy(10, y + 8)
    pdf.cell(95, 6, f"Nights: {service_data.get('nights', 1)} night(s)", 0, 0)
    pdf.cell(95, 6, f"Room Type: {service_data.get('room_type', 'Standard')}", 0, 1)
    
    # Amenities
    y += 25
    pdf.set_xy(10, y)
    pdf.set_font('Arial', 'B', 10)
    pdf.cell(0, 6, 'Amenities:', 0, 1)
    pdf.set_font('Arial', '', 9)
    amenities = service_data.get('amenities', [])
    amenities_text = ', '.join(amenities) if amenities else 'Contact hotel for details'
    pdf.set_xy(10, y + 6)
    pdf.multi_cell(190, 5, amenities_text)
    
    # Footer
    y = 250
    pdf.set_xy(10, y)
    pdf.set_font('Arial', 'I', 9)
    pdf.set_text_color(100, 100, 100)
    pdf.cell(0, 5, '* Please present this voucher at the hotel reception during check-in.', 0, 1)
    pdf.cell(0, 5, '* Carry a valid government-issued ID for verification.', 0, 1)
    pdf.cell(0, 5, f"* For any queries, contact: support@wanderlite.com | Booking Ref: {booking_ref}", 0, 1)
    
    # Add QR with verification URL
    try:
        verify_url = _build_qr_verification_url(booking_ref, 'hotel')
        qr = None  # qrcode disabled
        qr.add_data(verify_url)
        qr.make(fit=True)
        qr_img = qr.make_image(fill_color="black", back_color="white")
        qr_temp_path = tickets_dir / f"qr_{booking_ref}.png"
        qr_img.save(str(qr_temp_path))
        pdf.image(str(qr_temp_path), x=170, y=10, w=30, h=30)
        try:
            qr_temp_path.unlink()
        except:
            pass
    except Exception:
        pass

    pdf.output(str(file_path))
    return f"/uploads/{str(file_path.relative_to(upload_dir))}"


def _generate_restaurant_reservation_pdf(service_data: dict, booking_ref: str, guest_info: dict, upload_dir: Path) -> str:
    """Generate a restaurant reservation confirmation PDF."""
    tickets_dir = upload_dir / 'tickets'
    tickets_dir.mkdir(parents=True, exist_ok=True)
    
    filename = f"restaurant_reservation_{booking_ref}.pdf"
    file_path = tickets_dir / filename
    
    pdf = None  # FPDF disabled
    pdf.add_page()
    
    # Header
    pdf.set_fill_color(230, 126, 34)  # Orange
    pdf.rect(0, 0, 210, 35, 'F')
    pdf.set_text_color(255, 255, 255)
    pdf.set_font('Arial', 'B', 20)
    pdf.set_xy(10, 10)
    pdf.cell(0, 10, 'RESTAURANT RESERVATION', 0, 1)
    
    pdf.set_xy(150, 12)
    pdf.set_font('Arial', 'B', 11)
    pdf.cell(0, 5, f'Ref: {booking_ref}', 0, 1)
    
    # Restaurant Name
    y = 45
    pdf.set_text_color(0, 0, 0)
    pdf.set_font('Arial', 'B', 18)
    pdf.set_xy(10, y)
    pdf.cell(0, 10, service_data.get('name', 'Restaurant Name'), 0, 1)
    
    # Cuisine & Rating
    pdf.set_font('Arial', '', 11)
    pdf.set_xy(10, y + 12)
    pdf.cell(0, 6, f"Cuisine: {service_data.get('cuisine', 'Multi-cuisine')}", 0, 1)
    
    rating = service_data.get('rating', 0)
    pdf.set_xy(10, y + 18)
    pdf.cell(0, 6, f"Rating: {rating}/5", 0, 1)
    
    # Guest Details
    y += 35
    pdf.set_xy(10, y)
    pdf.set_fill_color(240, 240, 240)
    pdf.rect(10, y, 190, 8, 'F')
    pdf.set_font('Arial', 'B', 11)
    pdf.cell(0, 8, 'RESERVATION DETAILS', 0, 1)
    
    y += 12
    pdf.set_font('Arial', '', 10)
    pdf.set_xy(10, y)
    pdf.cell(0, 6, f"Name: {guest_info.get('full_name', 'N/A')}", 0, 1)
    pdf.set_xy(10, y + 6)
    pdf.cell(0, 6, f"Phone: {guest_info.get('phone', 'N/A')}", 0, 1)
    pdf.set_xy(10, y + 12)
    pdf.cell(0, 6, f"Email: {guest_info.get('email', 'N/A')}", 0, 1)
    
    # Reservation Info
    y += 28
    pdf.set_xy(10, y)
    pdf.set_font('Arial', 'B', 10)
    pdf.cell(60, 6, 'Date & Time:', 0, 0)
    pdf.set_font('Arial', '', 10)
    reservation_time = service_data.get('reservation_time', datetime.now().strftime('%d %b %Y, %H:%M'))
    pdf.cell(0, 6, reservation_time, 0, 1)
    
    pdf.set_xy(10, y + 8)
    pdf.set_font('Arial', 'B', 10)
    pdf.cell(60, 6, 'Number of Guests:', 0, 0)
    pdf.set_font('Arial', '', 10)
    pdf.cell(0, 6, f"{service_data.get('guests', 2)} person(s)", 0, 1)
    
    pdf.set_xy(10, y + 16)
    pdf.set_font('Arial', 'B', 10)
    pdf.cell(60, 6, 'Table Preference:', 0, 0)
    pdf.set_font('Arial', '', 10)
    pdf.cell(0, 6, service_data.get('table_preference', 'Standard seating'), 0, 1)
    
    # Specialty Dish
    y += 35
    pdf.set_xy(10, y)
    pdf.set_font('Arial', 'B', 10)
    pdf.cell(0, 6, 'Recommended Specialty:', 0, 1)
    pdf.set_font('Arial', '', 10)
    pdf.set_xy(10, y + 6)
    pdf.cell(0, 6, service_data.get('specialty_dish', 'Ask for chef recommendations'), 0, 1)
    
    # Location
    y += 20
    pdf.set_xy(10, y)
    pdf.set_font('Arial', 'B', 10)
    pdf.cell(0, 6, 'Address:', 0, 1)
    pdf.set_font('Arial', '', 10)
    pdf.set_xy(10, y + 6)
    pdf.multi_cell(190, 5, f"{service_data.get('location', 'N/A')}\nDistance: {service_data.get('distance', 'N/A')}")
    
    # Footer
    y = 250
    pdf.set_xy(10, y)
    pdf.set_font('Arial', 'I', 9)
    pdf.set_text_color(100, 100, 100)
    pdf.cell(0, 5, '* Please arrive on time or call to inform if delayed.', 0, 1)
    pdf.cell(0, 5, '* Reservation may be cancelled if you are more than 15 minutes late without notice.', 0, 1)
    pdf.cell(0, 5, f"* For cancellation or changes, contact: {guest_info.get('phone', 'N/A')} | Ref: {booking_ref}", 0, 1)
    
    # Add QR with verification URL
    try:
        verify_url = _build_qr_verification_url(booking_ref, 'restaurant')
        qr = None  # qrcode disabled
        qr.add_data(verify_url)
        qr.make(fit=True)
        qr_img = qr.make_image(fill_color="black", back_color="white")
        qr_temp_path = tickets_dir / f"qr_{booking_ref}.png"
        qr_img.save(str(qr_temp_path))
        pdf.image(str(qr_temp_path), x=170, y=10, w=30, h=30)
        try:
            qr_temp_path.unlink()
        except:
            pass
    except Exception:
        pass

    pdf.output(str(file_path))
    return f"/uploads/{str(file_path.relative_to(upload_dir))}"


def _generate_receipt_pdf(payload: PaymentRequest, upload_dir: Path) -> str:
    """Generate a simple payment receipt PDF and return the relative file path under uploads."""
    if PDF_GENERATION_DISABLED:
        # Return a placeholder receipt URL when PDF generation is disabled
        booking_ref = payload.booking_ref or f"WL-{datetime.now(timezone.utc).strftime('%Y%m%d')}-{str(uuid.uuid4())[:8].upper()}"
        return f"/uploads/receipts/receipt_{booking_ref}.pdf"
    
    receipts_dir = upload_dir / 'receipts'
    receipts_dir.mkdir(parents=True, exist_ok=True)

    booking_ref = payload.booking_ref or f"WL-{datetime.now(timezone.utc).strftime('%Y%m%d')}-{str(uuid.uuid4())[:8].upper()}"
    filename = f"receipt_{booking_ref}.pdf"
    file_path = receipts_dir / filename

    from fpdf import FPDF
    pdf = FPDF()
    pdf.add_page()

    # Header
    pdf.set_fill_color(0, 119, 182)  # WanderLite blue
    pdf.rect(0, 0, 210, 25, 'F')
    pdf.set_text_color(255, 255, 255)
    pdf.set_font('Arial', 'B', 16)
    pdf.set_xy(10, 8)
    pdf.cell(0, 10, 'WanderLite - Payment Receipt', 0, 1, 'L')

    # Body
    pdf.set_text_color(0, 0, 0)
    pdf.set_font('Arial', '', 12)
    pdf.ln(10)

    def row(label: str, value: str):
        pdf.set_font('Arial', 'B', 12)
        pdf.cell(55, 8, label)
        pdf.set_font('Arial', '', 12)
        pdf.multi_cell(0, 8, value)

    row('Receipt No.:', booking_ref)
    row('Date:', datetime.now().strftime('%Y-%m-%d %H:%M'))
    row('Destination:', payload.destination or '-')
    sdate = payload.start_date.astimezone(timezone.utc).strftime('%Y-%m-%d') if payload.start_date else '-'
    edate = payload.end_date.astimezone(timezone.utc).strftime('%Y-%m-%d') if payload.end_date else '-'
    row('Travel Dates:', f"{sdate} to {edate}")
    row('Travelers:', str(payload.travelers or '-'))
    row('Name:', payload.full_name)
    row('Email:', payload.email)
    row('Phone:', payload.phone)
    row('Payment Method:', payload.method)
    row('Credential:', _mask_credential(payload.method, payload.credential))
    row('Amount Paid:', f"INR {(payload.amount or 0):,.2f}")
    row('Status:', 'SUCCESS')

    pdf.ln(6)
    pdf.set_text_color(100, 100, 100)
    pdf.set_font('Arial', '', 10)
    pdf.multi_cell(0, 6, 'This is a system-generated receipt for a simulated payment. For assistance contact support@wanderlite.com')

    pdf.output(str(file_path))
    return f"/uploads/receipts/{filename}"

def _generate_hotel_receipt_pdf(service_data: dict, booking_ref: str, guest_info: dict, amount: float, currency: str, upload_dir: Path) -> str:
    """Generate a rich, branded hotel stay receipt PDF. Returns an absolute '/uploads/receipts/..' URL path."""
    receipts_dir = upload_dir / 'receipts'
    receipts_dir.mkdir(parents=True, exist_ok=True)

    filename = f"hotel_receipt_{booking_ref}.pdf"
    file_path = receipts_dir / filename

    pdf = None  # FPDF disabled
    pdf.add_page()

    # Header branding
    pdf.set_fill_color(102, 51, 153)  # Purple brand for hotel
    pdf.rect(0, 0, 210, 28, 'F')
    pdf.set_text_color(255, 255, 255)
    pdf.set_font('Arial', 'B', 16)
    pdf.set_xy(10, 8)
    pdf.cell(0, 10, 'WanderLite - Hotel Receipt', 0, 1, 'L')

    # Receipt meta
    pdf.set_text_color(0, 0, 0)
    pdf.set_font('Arial', '', 11)
    y = 40
    pdf.set_xy(10, y)
    pdf.set_font('Arial', 'B', 12)
    pdf.cell(0, 7, 'Receipt Details', 0, 1)
    pdf.set_font('Arial', '', 11)
    def row(lbl: str, val: str):
        nonlocal y
        pdf.set_xy(10, y)
        pdf.set_font('Arial', 'B', 11)
        pdf.cell(45, 7, lbl)
        pdf.set_font('Arial', '', 11)
        pdf.cell(0, 7, val, 0, 1)
        y += 7

    issue_date = datetime.now().strftime('%Y-%m-%d %H:%M')
    row('Receipt No.:', booking_ref)
    row('Issue Date:', issue_date)

    # Guest & Booker
    y += 3
    pdf.set_xy(10, y)
    pdf.set_fill_color(240, 240, 240)
    pdf.rect(10, y, 190, 8, 'F')
    pdf.set_font('Arial', 'B', 11)
    pdf.cell(0, 8, 'Guest & Booker', 0, 1)
    y += 12
    row('Name:', str(guest_info.get('full_name') or guest_info.get('fullName') or 'N/A'))
    row('Email:', str(guest_info.get('email') or 'N/A'))
    row('Phone:', str(guest_info.get('phone') or 'N/A'))

    # Hotel & Stay details
    y += 3
    pdf.set_xy(10, y)
    pdf.set_fill_color(240, 240, 240)
    pdf.rect(10, y, 190, 8, 'F')
    pdf.set_font('Arial', 'B', 11)
    pdf.cell(0, 8, 'Hotel & Stay', 0, 1)
    y += 12
    hotel_name = service_data.get('name') or service_data.get('hotel_name') or 'Hotel'
    location = service_data.get('location') or service_data.get('destination') or 'N/A'
    rating = service_data.get('rating') or service_data.get('stars') or ''
    check_in = service_data.get('check_in') or service_data.get('checkIn') or ''
    check_out = service_data.get('check_out') or service_data.get('checkOut') or ''
    nights = service_data.get('nights') or service_data.get('nights_count') or ''
    guests = service_data.get('guests') or 1
    room_type = service_data.get('room_type') or service_data.get('roomType') or 'Standard'

    row('Hotel:', f"{hotel_name}")
    row('Location:', f"{location}")
    if rating:
        row('Rating:', f"{rating}/5")
    row('Check-in:', str(check_in))
    row('Check-out:', str(check_out))
    row('Nights:', str(nights))
    row('Guests:', str(guests))
    row('Room Type:', str(room_type))

    # Price breakdown
    y += 3
    pdf.set_xy(10, y)
    pdf.set_fill_color(240, 240, 240)
    pdf.rect(10, y, 190, 8, 'F')
    pdf.set_font('Arial', 'B', 11)
    pdf.cell(0, 8, 'Price Breakdown', 0, 1)
    y += 10
    pdf.set_font('Arial', '', 11)
    price_per_night = float(service_data.get('price_per_night') or 0)
    nights_val = int(nights or 1)
    subtotal = price_per_night * nights_val
    taxes = round(subtotal * 0.10, 2)  # 10% illustrative taxes
    fees = round(subtotal * 0.05, 2)   # 5% service fee
    computed_total = round(subtotal + taxes + fees, 2)
    # Prefer provided amount if present
    total_amount = float(amount or computed_total)
    cur = currency or service_data.get('currency') or 'INR'

    def money(v: float) -> str:
        try:
            return f"INR {v:,.2f}" if cur.upper() == 'INR' else f"{cur} {v:,.2f}"
        except Exception:
            return str(v)

    # 2-column breakdown
    pdf.set_xy(12, y)
    pdf.cell(90, 7, f"Room ({nights_val} night(s))", 0, 0)
    pdf.cell(0, 7, money(subtotal), 0, 1, 'R')
    y += 7
    pdf.set_xy(12, y)
    pdf.cell(90, 7, "Taxes (10%)", 0, 0)
    pdf.cell(0, 7, money(taxes), 0, 1, 'R')
    y += 7
    pdf.set_xy(12, y)
    pdf.cell(90, 7, "Service Fee (5%)", 0, 0)
    pdf.cell(0, 7, money(fees), 0, 1, 'R')
    y += 7
    pdf.set_font('Arial', 'B', 12)
    pdf.set_xy(12, y)
    pdf.cell(90, 8, "Total Paid", 0, 0)
    pdf.cell(0, 8, money(total_amount), 0, 1, 'R')
    y += 10

    # Payment details
    pdf.set_xy(10, y)
    pdf.set_fill_color(240, 240, 240)
    pdf.rect(10, y, 190, 8, 'F')
    pdf.set_font('Arial', 'B', 11)
    pdf.cell(0, 8, 'Payment', 0, 1)
    y += 12
    method = guest_info.get('method') or 'Card'
    credential = guest_info.get('credential') or ''
    masked = _mask_credential(method, credential)
    row('Method:', method)
    row('Credential:', masked)

    # QR verification
    try:
        verify_url = _build_qr_verification_url(booking_ref, 'hotel')
        qr = None  # qrcode disabled
        qr.add_data(verify_url)
        qr.make(fit=True)
        qr_img = qr.make_image(fill_color="black", back_color="white")
        qr_temp_path = receipts_dir / f"qr_{booking_ref}.png"
        qr_img.save(str(qr_temp_path))
        pdf.image(str(qr_temp_path), x=165, y=10, w=30, h=30)
        try:
            qr_temp_path.unlink()
        except Exception:
            pass
    except Exception:
        pass

    # Footer note
    y = max(y + 6, 250)
    pdf.set_xy(10, y)
    pdf.set_text_color(100, 100, 100)
    pdf.set_font('Arial', 'I', 9)
    pdf.multi_cell(0, 5, '* This is an electronically generated receipt. For queries, contact support@wanderlite.com')

    pdf.output(str(file_path))
    return f"/uploads/receipts/{filename}"

def _generate_restaurant_receipt_pdf(service_data: dict, booking_ref: str, guest_info: dict, amount: float, currency: str, upload_dir: Path) -> str:
    """Generate a branded restaurant reservation receipt PDF. Returns an absolute '/uploads/receipts/..' URL path."""
    receipts_dir = upload_dir / 'receipts'
    receipts_dir.mkdir(parents=True, exist_ok=True)

    filename = f"restaurant_receipt_{booking_ref}.pdf"
    file_path = receipts_dir / filename

    pdf = None  # FPDF disabled
    pdf.add_page()

    # Header
    pdf.set_fill_color(230, 126, 34)  # Orange
    pdf.rect(0, 0, 210, 28, 'F')
    pdf.set_text_color(255, 255, 255)
    pdf.set_font('Arial', 'B', 16)
    pdf.set_xy(10, 8)
    pdf.cell(0, 10, 'WanderLite - Dining Receipt', 0, 1, 'L')

    pdf.set_text_color(0, 0, 0)
    y = 40
    def row(lbl: str, val: str):
        nonlocal y
        pdf.set_xy(10, y)
        pdf.set_font('Arial', 'B', 11)
        pdf.cell(45, 7, lbl)
        pdf.set_font('Arial', '', 11)
        pdf.cell(0, 7, val, 0, 1)
        y += 7

    row('Receipt No.:', booking_ref)
    row('Issue Date:', datetime.now().strftime('%Y-%m-%d %H:%M'))
    row('Guest:', str(guest_info.get('full_name') or 'N/A'))
    row('Email:', str(guest_info.get('email') or 'N/A'))
    row('Phone:', str(guest_info.get('phone') or 'N/A'))

    # Restaurant details
    y += 3
    pdf.set_xy(10, y)
    pdf.set_fill_color(240, 240, 240)
    pdf.rect(10, y, 190, 8, 'F')
    pdf.set_font('Arial', 'B', 11)
    pdf.cell(0, 8, 'Reservation', 0, 1)
    y += 12
    name = service_data.get('name', 'Restaurant')
    cuisine = service_data.get('cuisine', '')
    reservation_time = service_data.get('reservation_time') or service_data.get('reservationDate') or service_data.get('timeSlot') or 'TBA'
    guests = service_data.get('guests') or 2
    row('Restaurant:', name)
    if cuisine:
        row('Cuisine:', cuisine)
    row('Guests:', str(guests))
    row('Date & Time:', str(reservation_time))

    # Payment summary
    y += 3
    pdf.set_xy(10, y)
    pdf.set_fill_color(240, 240, 240)
    pdf.rect(10, y, 190, 8, 'F')
    pdf.set_font('Arial', 'B', 11)
    pdf.cell(0, 8, 'Payment', 0, 1)
    y += 12
    method = guest_info.get('method') or 'Card'
    credential = guest_info.get('credential') or ''
    masked = _mask_credential(method, credential)
    cur = currency or service_data.get('currency') or 'INR'
    def money(v: float) -> str:
        try:
            return f"INR {v:,.2f}" if cur.upper() == 'INR' else f"{cur} {v:,.2f}"
        except Exception:
            return str(v)
    row('Amount Paid:', money(float(amount or 0)))
    row('Method:', method)
    row('Credential:', masked)

    # QR
    try:
        verify_url = _build_qr_verification_url(booking_ref, 'restaurant')
        qr = None  # qrcode disabled
        qr.add_data(verify_url)
        qr.make(fit=True)
        qr_img = qr.make_image(fill_color="black", back_color="white")
        qr_temp_path = receipts_dir / f"qr_{booking_ref}.png"
        qr_img.save(str(qr_temp_path))
        pdf.image(str(qr_temp_path), x=165, y=10, w=30, h=30)
        try:
            qr_temp_path.unlink()
        except Exception:
            pass
    except Exception:
        pass

    # Footer
    y = max(y + 6, 250)
    pdf.set_xy(10, y)
    pdf.set_text_color(100, 100, 100)
    pdf.set_font('Arial', 'I', 9)
    pdf.multi_cell(0, 5, '* Reservation policies may apply. Contact the restaurant for changes.')

    pdf.output(str(file_path))
    return f"/uploads/receipts/{filename}"

@api_router.post("/payment/confirm", response_model=PaymentResponse)
async def confirm_payment(payload: PaymentRequest, db: Session = Depends(get_db)):
    try:
        upload_dir = Path('uploads')
        upload_dir.mkdir(exist_ok=True)
        
        booking_ref = payload.booking_ref or f"WL-{datetime.now(timezone.utc).strftime('%Y%m%d')}-{str(uuid.uuid4())[:8].upper()}"
        
        # Check if this is a service booking (flight/hotel/restaurant)
        service_booking = None
        if payload.booking_ref:
            service_booking = db.query(ServiceBookingModel).filter(
                ServiceBookingModel.booking_ref == payload.booking_ref
            ).first()
        
        # Generate appropriate ticket/voucher based on service type
        ticket_url = None
        receipt_url: Optional[str] = None
        try:
            if service_booking:
                import json
                service_data = json.loads(service_booking.service_json)
                guest_info = {
                    'full_name': payload.full_name,
                    'email': payload.email,
                    'phone': payload.phone,
                    'method': payload.method,
                    'credential': payload.credential,
                }
                
                if service_booking.service_type == 'flight':
                    ticket_url = _generate_flight_ticket_pdf(service_data, booking_ref, guest_info, upload_dir)
                    # For flights we keep the generic payment receipt as well
                elif service_booking.service_type == 'hotel':
                    # Generate a rich hotel receipt and also provide a hotel voucher PDF as e-ticket
                    receipt_url = _generate_hotel_receipt_pdf(service_data, booking_ref, guest_info, payload.amount, payload.__dict__.get('currency', 'INR'), upload_dir)
                    ticket_url = _generate_hotel_voucher_pdf(service_data, booking_ref, guest_info, upload_dir)
                elif service_booking.service_type == 'restaurant':
                    # Generate a branded dining receipt
                    receipt_url = _generate_restaurant_receipt_pdf(service_data, booking_ref, guest_info, payload.amount, payload.__dict__.get('currency', 'INR'), upload_dir)
                
                # Update service booking status to Confirmed
                service_booking.status = 'Confirmed'
                db.commit()
        except Exception as e:
            logger.warning(f"Failed to generate specialized receipt/ticket: {e}")
            # Continue with generic receipt generation
        
        # Generate a generic payment receipt only if not already generated a specialized one
        if not receipt_url:
            receipt_url = _generate_receipt_pdf(payload, upload_dir)
        
        # Save receipt record to database
        receipt_record = PaymentReceiptModel(
            user_id=None,  # TODO: link to current user if authenticated
            booking_ref=booking_ref,
            destination=payload.destination,
            start_date=payload.start_date,
            end_date=payload.end_date,
            travelers=payload.travelers,
            full_name=payload.full_name,
            email=payload.email,
            phone=payload.phone,
            payment_method=payload.method,
            amount=payload.amount,
            receipt_url=receipt_url,
        )
        db.add(receipt_record)
        db.commit()
        
        # Return both receipt and ticket (if applicable)
        response_data = {
            'status': 'success',
            'booking_ref': booking_ref,
            'receipt_url': receipt_url
        }
        
        if ticket_url:
            response_data['ticket_url'] = ticket_url
        
        return PaymentResponse(**response_data)
    except Exception as e:
        logger.exception("Payment confirmation failed")
        raise HTTPException(status_code=500, detail=f"Failed to confirm payment: {str(e)}")


@api_router.get("/tickets/verify")
async def verify_ticket(token: str, db: Session = Depends(get_db)):
    """Decrypt QR token and return real-time booking details for verification."""
    try:
        data = _qr_decrypt(token)
        booking_ref = data.get('br')
        service_type = data.get('stype')
        if not booking_ref:
            raise HTTPException(status_code=400, detail="Invalid token")

        # Try service booking by booking_ref
        service_booking = db.query(ServiceBookingModel).filter(
            ServiceBookingModel.booking_ref == booking_ref
        ).first()
        service_json = None
        if service_booking:
            try:
                service_json = json.loads(service_booking.service_json)
            except Exception:
                service_json = None

        # Try receipt by booking_ref for payer details
        receipt = db.query(PaymentReceiptModel).filter(
            PaymentReceiptModel.booking_ref == booking_ref
        ).order_by(PaymentReceiptModel.created_at.desc()).first()

        return {
            'status': 'valid',
            'booking_ref': booking_ref,
            'service_type': service_type,
            'service': service_json,
            'receipt': {
                'full_name': receipt.full_name if receipt else None,
                'email': receipt.email if receipt else None,
                'phone': receipt.phone if receipt else None,
                'amount': receipt.amount if receipt else None,
                'destination': receipt.destination if receipt else None,
                'start_date': receipt.start_date if receipt else None,
                'end_date': receipt.end_date if receipt else None,
                'travelers': receipt.travelers if receipt else None,
            } if receipt else None
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Ticket verification failed")
        raise HTTPException(status_code=400, detail=f"Invalid or expired token: {e}")


@api_router.get("/receipts", response_model=List[ReceiptRecord])
async def list_receipts(db: Session = Depends(get_db)):
    """List all payment receipts (for now returns all; TODO: filter by user_id)."""
    rows = db.query(PaymentReceiptModel).order_by(PaymentReceiptModel.created_at.desc()).all()
    return [
        ReceiptRecord(
            id=r.id,
            booking_ref=r.booking_ref,
            destination=r.destination,
            start_date=r.start_date,
            end_date=r.end_date,
            travelers=r.travelers,
            full_name=r.full_name,
            email=r.email,
            phone=r.phone,
            payment_method=r.payment_method,
            amount=r.amount,
            receipt_url=r.receipt_url,
            created_at=r.created_at,
        ) for r in rows
    ]

@api_router.post("/status", response_model=StatusCheck)
async def create_status_check(input: StatusCheckCreate, db: Session = Depends(get_db)):
    obj = StatusCheckModel(client_name=input.client_name)
    db.add(obj)
    db.commit()
    return StatusCheck(id=obj.id, client_name=obj.client_name, timestamp=obj.timestamp)

@api_router.get("/status", response_model=List[StatusCheck])
async def get_status_checks(db: Session = Depends(get_db)):
    rows = db.query(StatusCheckModel).order_by(StatusCheckModel.timestamp.desc()).all()
    return [StatusCheck(id=r.id, client_name=r.client_name, timestamp=r.timestamp) for r in rows]

# Authentication functions
def verify_password(plain_password, hashed_password):
    return pwd_context.verify(plain_password, hashed_password)

def get_password_hash(password):
    return pwd_context.hash(password)

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None):
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=15)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(credentials.credentials, SECRET_KEY, algorithms=[ALGORITHM])
        email: str = payload.get("sub")
        if email is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception

    # Lookup user in MySQL
    with SessionLocal() as dbs:
        user_row = dbs.query(UserModel).filter(UserModel.email == email).first()
    if user_row is None:
        raise credentials_exception
    return User(
        id=user_row.id,
        email=user_row.email,
        username=user_row.username,
        hashed_password=None,
        created_at=user_row.created_at,
        profile_image=None,
    )


@api_router.get("/auth/me", response_model=UserPublic)
async def auth_me(current_user: User = Depends(get_current_user)):
    # Load fresh row to include all profile fields
    with SessionLocal() as dbs:
        row = dbs.query(UserModel).filter(UserModel.id == current_user.id).first()
        if not row:
            raise HTTPException(status_code=404, detail="User not found")
        return UserPublic(
            id=row.id,
            email=row.email,
            username=row.username,
            created_at=row.created_at,
            name=row.name,
            phone=row.phone,
            profile_image=row.profile_image,
            favorite_travel_type=row.favorite_travel_type,
            preferred_budget_range=row.preferred_budget_range,
            climate_preference=row.climate_preference,
            food_preference=row.food_preference,
            language_preference=row.language_preference,
            notifications_enabled=row.notifications_enabled,
            is_kyc_completed=row.is_kyc_completed,
            payment_profile_completed=row.payment_profile_completed,
        )


@api_router.put("/profile", response_model=UserPublic)
async def update_profile(payload: ProfileUpdate, current_user: User = Depends(get_current_user)):
    with SessionLocal() as dbs:
        row = dbs.query(UserModel).filter(UserModel.id == current_user.id).first()
        if not row:
            raise HTTPException(status_code=404, detail="User not found")
        if payload.name is not None:
            row.name = payload.name
        if payload.username is not None and payload.username.strip():
            row.username = payload.username.strip()
        if payload.phone is not None:
            row.phone = payload.phone
        if payload.favorite_travel_type is not None:
            row.favorite_travel_type = payload.favorite_travel_type
        if payload.preferred_budget_range is not None:
            row.preferred_budget_range = payload.preferred_budget_range
        if payload.climate_preference is not None:
            row.climate_preference = payload.climate_preference
        if payload.food_preference is not None:
            row.food_preference = payload.food_preference
        if payload.language_preference is not None:
            row.language_preference = payload.language_preference
        if payload.notifications_enabled is not None:
            row.notifications_enabled = 1 if payload.notifications_enabled else 0
        dbs.commit()
        dbs.refresh(row)
        return UserPublic(
            id=row.id,
            email=row.email,
            username=row.username,
            created_at=row.created_at,
            name=row.name,
            phone=row.phone,
            profile_image=row.profile_image,
            favorite_travel_type=row.favorite_travel_type,
            preferred_budget_range=row.preferred_budget_range,
            climate_preference=row.climate_preference,
            food_preference=row.food_preference,
            language_preference=row.language_preference,
            notifications_enabled=row.notifications_enabled,
        )


@api_router.post("/profile/avatar")
async def upload_avatar(file: UploadFile = File(...), current_user: User = Depends(get_current_user)):
    upload_dir = Path("uploads")
    upload_dir.mkdir(exist_ok=True)
    file_extension = Path(file.filename).suffix
    file_name = f"avatar_{current_user.id}{file_extension}"
    file_path = upload_dir / file_name
    with open(file_path, "wb") as buffer:
        content = await file.read()
        buffer.write(content)
    # Save URL to DB
    url = f"/uploads/{file_name}"
    with SessionLocal() as dbs:
        row = dbs.query(UserModel).filter(UserModel.id == current_user.id).first()
        if row:
            row.profile_image = url
            dbs.commit()
    return {"image_url": url}


@api_router.put("/auth/password")
async def change_password(payload: PasswordChange, current_user: User = Depends(get_current_user)):
    with SessionLocal() as dbs:
        row = dbs.query(UserModel).filter(UserModel.id == current_user.id).first()
        if not row or not verify_password(payload.current_password, row.hashed_password):
            raise HTTPException(status_code=400, detail="Current password is incorrect")
        row.hashed_password = get_password_hash(payload.new_password)
        dbs.commit()
    return {"message": "Password updated"}


@api_router.delete("/auth/account")
async def delete_account(current_user: User = Depends(get_current_user)):
    with SessionLocal() as dbs:
        # Delete trips first (FK safe)
        dbs.query(TripModel).filter(TripModel.user_id == current_user.id).delete()
        dbs.query(UserModel).filter(UserModel.id == current_user.id).delete()
        dbs.commit()
    return {"message": "Account deleted"}

# Authentication endpoints
@api_router.post("/auth/signup", response_model=Token)
async def signup(user: UserCreate, db: Session = Depends(get_db)):
    # Check if user already exists
    existing_user = db.query(UserModel).filter(UserModel.email == user.email).first()
    if existing_user:
        raise HTTPException(status_code=400, detail="Email already registered")

    # Create new user
    hashed_password = get_password_hash(user.password)
    new_user = UserModel(email=user.email, username=user.username, hashed_password=hashed_password)
    db.add(new_user)
    db.commit()

    # Issue access token on signup
    access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": new_user.email}, expires_delta=access_token_expires
    )
    return Token(access_token=access_token, token_type="bearer")

# Auth Login - Development mode endpoint
@api_router.post("/auth/login")
def login_dev(req: LoginRequest):
    # Development mode: accept any valid credentials and create user if needed
    if not req.email or not req.password:
        raise HTTPException(status_code=400, detail="Email and password required")
    
    # Get database session
    db = next(get_db())
    
    # Check if user exists, if not create them
    user = db.query(UserModel).filter(UserModel.email == req.email).first()
    if not user:
        # Create new user for development
        user = UserModel(
            id=str(uuid.uuid4()),
            email=req.email,
            username=req.email.split('@')[0],
            hashed_password=get_password_hash(req.password),
            created_at=datetime.now(timezone.utc)
        )
        db.add(user)
        db.commit()
        db.refresh(user)
    
    # Create JWT token using the same SECRET_KEY
    to_encode = {"sub": user.email}
    access_token = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    
    return {"access_token": access_token, "token_type": "bearer", "user": {"email": user.email}}


# =============================
# KYC Endpoints
# =============================
@api_router.post("/kyc")
async def submit_kyc(
    full_name: str = Form(...),
    dob: str = Form(...),
    gender: str = Form(...),
    nationality: str = Form(...),
    id_type: str = Form(...),
    id_number: str = Form(...),
    address_line: str = Form(...),
    city: str = Form(...),
    state: str = Form(...),
    country: str = Form(...),
    pincode: str = Form(...),
    id_proof_front: Optional[UploadFile] = File(None),
    id_proof_back: Optional[UploadFile] = File(None),
    selfie: Optional[UploadFile] = File(None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Submit KYC details with optional file uploads"""
    
    # Check if KYC already exists
    existing = db.query(KYCDetailsModel).filter(KYCDetailsModel.user_id == current_user.id).first()
    if existing:
        raise HTTPException(status_code=400, detail="KYC already submitted")
    
    # Hash ID number with user-specific salt
    id_hash = hash_id_number(id_number, current_user.id)
    
    # Handle file uploads
    id_front_path = None
    id_back_path = None
    selfie_path_var = None
    
    uploads_dir = ROOT_DIR / "uploads" / "kyc" / str(current_user.id)
    uploads_dir.mkdir(parents=True, exist_ok=True)
    
    if id_proof_front:
        front_path = uploads_dir / f"id_front_{uuid.uuid4().hex[:8]}.jpg"
        with open(front_path, "wb") as f:
            f.write(await id_proof_front.read())
        id_front_path = f"/uploads/kyc/{current_user.id}/{front_path.name}"
    
    if id_proof_back:
        back_path = uploads_dir / f"id_back_{uuid.uuid4().hex[:8]}.jpg"
        with open(back_path, "wb") as f:
            f.write(await id_proof_back.read())
        id_back_path = f"/uploads/kyc/{current_user.id}/{back_path.name}"
    
    if selfie:
        selfie_file = uploads_dir / f"selfie_{uuid.uuid4().hex[:8]}.jpg"
        with open(selfie_file, "wb") as f:
            f.write(await selfie.read())
        selfie_path_var = f"/uploads/kyc/{current_user.id}/{selfie_file.name}"
    
    # Create KYC record (pending admin verification)
    kyc_record = KYCDetailsModel(
        user_id=current_user.id,
        full_name=full_name,
        dob=dob,
        gender=gender,
        nationality=nationality,
        id_type=id_type,
        id_number_hash=id_hash,
        id_proof_front_path=id_front_path,
        id_proof_back_path=id_back_path,
        selfie_path=selfie_path_var,
        address_line=address_line,
        city=city,
        state=state,
        country=country,
        pincode=pincode,
        verification_status="pending",  # Requires admin verification
        submitted_at=datetime.now(timezone.utc),
        verified_at=None,  # Will be set when admin approves
        created_at=datetime.now(timezone.utc)
    )
    db.add(kyc_record)
    
    # Note: is_kyc_completed will be set to 1 only when admin approves
    
    db.commit()
    
    return {
        "message": "KYC submitted successfully. Pending admin verification.",
        "status": "pending",
        "is_kyc_completed": False
    }


@api_router.get("/kyc/status", response_model=KYCStatus)
async def get_kyc_status(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Get KYC verification status"""
    kyc = db.query(KYCDetailsModel).filter(KYCDetailsModel.user_id == current_user.id).first()
    
    if not kyc:
        return KYCStatus(is_completed=False)
    
    return KYCStatus(
        is_completed=True,
        verification_status=kyc.verification_status,
        full_name=kyc.full_name,
        created_at=kyc.created_at
    )


# =============================
# Payment Profile Endpoints
# =============================
@api_router.post("/payment-profile")
async def submit_payment_profile(
    profile: PaymentProfileSubmit,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Submit payment profile with encrypted bank details"""
    
    # Check if profile already exists
    existing = db.query(PaymentProfileModel).filter(PaymentProfileModel.user_id == current_user.id).first()
    if existing:
        raise HTTPException(status_code=400, detail="Payment profile already exists")
    
    # Encrypt sensitive fields
    account_encrypted = encrypt_field(profile.account_number)
    ifsc_encrypted = encrypt_field(profile.ifsc)
    upi_encrypted = encrypt_field(profile.upi) if profile.upi else None
    
    # Create payment profile
    payment_profile = PaymentProfileModel(
        user_id=current_user.id,
        account_holder_name=profile.account_holder_name,
        bank_name=profile.bank_name,
        account_number_encrypted=account_encrypted,
        ifsc_encrypted=ifsc_encrypted,
        upi_encrypted=upi_encrypted,
        default_method=profile.default_method,
        created_at=datetime.now(timezone.utc)
    )
    db.add(payment_profile)
    
    # Update user payment profile flag
    user_row = db.query(UserModel).filter(UserModel.id == current_user.id).first()
    if user_row:
        user_row.payment_profile_completed = 1
    
    db.commit()
    
    return {
        "message": "Payment profile saved successfully",
        "is_payment_profile_completed": True
    }


@api_router.get("/payment-profile/status", response_model=PaymentProfileStatus)
async def get_payment_profile_status(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Get payment profile status (never return decrypted data)"""
    profile = db.query(PaymentProfileModel).filter(PaymentProfileModel.user_id == current_user.id).first()
    
    if not profile:
        return PaymentProfileStatus(is_completed=False, is_payment_profile_completed=False)
    
    # Decrypt only to get last 4 digits for display
    account_number = decrypt_field(profile.account_number_encrypted)
    last_4 = account_number[-4:] if len(account_number) >= 4 else "****"
    
    return PaymentProfileStatus(
        is_completed=True,
        is_payment_profile_completed=True,
        account_holder_name=profile.account_holder_name,
        bank_name=profile.bank_name,
        account_last_4=last_4,
        default_method=profile.default_method,
        created_at=profile.created_at
    )


# =============================
# Mock Payment Endpoint
# =============================
@api_router.post("/payments/mock")
async def mock_payment(
    request: MockPaymentRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Simulate payment processing (always succeeds for demo)"""
    
    # Get booking details
    booking = db.query(ServiceBookingModel).filter(ServiceBookingModel.id == request.booking_id).first()
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")
    
    # Determine payment method
    payment_method = request.payment_method
    if not payment_method:
        # Check if user has payment profile
        profile = db.query(PaymentProfileModel).filter(PaymentProfileModel.user_id == current_user.id).first()
        if profile:
            payment_method = f"saved_{profile.default_method}"
        else:
            payment_method = "one_time_card"
    
    # Create transaction record
    transaction = TransactionModel(
        user_id=current_user.id,
        booking_id=request.booking_id,
        service_type=request.service_type or booking.service_type,
        amount=request.amount,
        currency=request.currency,
        payment_method=payment_method,
        status="success",
        created_at=datetime.now(timezone.utc)
    )
    db.add(transaction)
    
    # Update booking status to paid
    booking.status = "Paid"
    
    db.commit()
    
    return {
        "transaction_id": transaction.id,
        "status": "completed",
        "payment_method": payment_method,
        "amount": request.amount,
        "currency": request.currency
    }


# =============================
# Transactions History
# =============================
@api_router.get("/transactions", response_model=List[TransactionRecord])
async def get_transactions(
    service_type: Optional[str] = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get user transaction history with optional filtering"""
    query = db.query(TransactionModel).filter(TransactionModel.user_id == current_user.id)
    
    if service_type:
        query = query.filter(TransactionModel.service_type == service_type)
    
    transactions = query.order_by(TransactionModel.created_at.desc()).all()
    
    return [
        TransactionRecord(
            id=t.id,
            booking_id=t.booking_id,
            service_type=t.service_type,
            amount=t.amount,
            currency=t.currency,
            payment_method=t.payment_method,
            status=t.status,
            created_at=t.created_at
        )
        for t in transactions
    ]


# =============================
# User Notifications
# =============================
@api_router.get("/notifications")
async def get_user_notifications(
    page: int = 1,
    limit: int = 20,
    unread_only: bool = False,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get notifications for the current user"""
    query = db.query(NotificationModel).filter(NotificationModel.user_id == current_user.id)
    
    if unread_only:
        query = query.filter(NotificationModel.is_read == 0)
    
    total = query.count()
    notifications = query.order_by(NotificationModel.created_at.desc()).offset((page-1)*limit).limit(limit).all()
    
    return {
        "notifications": [
            {
                "id": n.id,
                "title": n.title,
                "message": n.message,
                "type": n.notification_type,
                "is_read": bool(n.is_read),
                "created_at": n.created_at.isoformat() if n.created_at else None
            } for n in notifications
        ],
        "total": total,
        "unread_count": db.query(NotificationModel).filter(
            NotificationModel.user_id == current_user.id,
            NotificationModel.is_read == 0
        ).count()
    }


@api_router.get("/notifications/unread-count")
async def get_unread_count(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get count of unread notifications"""
    count = db.query(NotificationModel).filter(
        NotificationModel.user_id == current_user.id,
        NotificationModel.is_read == 0
    ).count()
    return {"unread_count": count}


@api_router.post("/notifications/{notification_id}/read")
async def mark_notification_read(
    notification_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Mark a notification as read"""
    notification = db.query(NotificationModel).filter(
        NotificationModel.id == notification_id,
        NotificationModel.user_id == current_user.id
    ).first()
    
    if not notification:
        raise HTTPException(status_code=404, detail="Notification not found")
    
    notification.is_read = 1
    db.commit()
    return {"message": "Notification marked as read"}


@api_router.post("/notifications/mark-all-read")
async def mark_all_read(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Mark all notifications as read"""
    db.query(NotificationModel).filter(
        NotificationModel.user_id == current_user.id,
        NotificationModel.is_read == 0
    ).update({NotificationModel.is_read: 1})
    db.commit()
    return {"message": "All notifications marked as read"}


@api_router.delete("/notifications/{notification_id}")
async def delete_notification(
    notification_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Delete a notification"""
    notification = db.query(NotificationModel).filter(
        NotificationModel.id == notification_id,
        NotificationModel.user_id == current_user.id
    ).first()
    
    if not notification:
        raise HTTPException(status_code=404, detail="Notification not found")
    
    db.delete(notification)
    db.commit()
    return {"message": "Notification deleted"}


# Trip endpoints
@api_router.post("/trips", response_model=Trip)
async def create_trip(trip: TripCreate, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    new_trip = TripModel(
        user_id=current_user.id,
        destination=trip.destination,
        days=trip.days,
        budget=trip.budget,
        currency=trip.currency,
        total_cost=trip.total_cost or 0,
        start_date=trip.start_date,
        end_date=trip.end_date,
        travelers=trip.travelers,
        itinerary_json=json.dumps(trip.itinerary),
        images_json=json.dumps([]),
    )
    db.add(new_trip)
    db.commit()
    return Trip(
        id=new_trip.id,
        user_id=new_trip.user_id,
        destination=new_trip.destination,
        days=new_trip.days,
        budget=new_trip.budget,
        currency=new_trip.currency,
        total_cost=new_trip.total_cost,
        start_date=new_trip.start_date,
        end_date=new_trip.end_date,
        travelers=new_trip.travelers,
        itinerary=json.loads(new_trip.itinerary_json),
        created_at=new_trip.created_at,
        images=json.loads(new_trip.images_json),
    )

@api_router.get("/trips", response_model=List[Trip])
async def get_user_trips(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    rows = db.query(TripModel).filter(TripModel.user_id == current_user.id).order_by(TripModel.created_at.desc()).all()
    return [
        Trip(
            id=r.id,
            user_id=r.user_id,
            destination=r.destination,
            days=r.days,
            budget=r.budget,
            currency=r.currency,
            total_cost=r.total_cost,
            start_date=r.start_date,
            end_date=r.end_date,
            travelers=r.travelers,
            itinerary=json.loads(r.itinerary_json or "[]"),
            created_at=r.created_at,
            images=json.loads(r.images_json or "[]"),
        ) for r in rows
    ]

@api_router.get("/trips/{trip_id}", response_model=Trip)
async def get_trip(trip_id: str, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    r = db.query(TripModel).filter(TripModel.id == trip_id, TripModel.user_id == current_user.id).first()
    if not r:
        raise HTTPException(status_code=404, detail="Trip not found")
    return Trip(
        id=r.id,
        user_id=r.user_id,
        destination=r.destination,
        days=r.days,
        budget=r.budget,
        currency=r.currency,
        total_cost=r.total_cost,
        start_date=r.start_date,
        end_date=r.end_date,
        travelers=r.travelers,
        itinerary=json.loads(r.itinerary_json or "[]"),
        created_at=r.created_at,
        images=json.loads(r.images_json or "[]"),
    )

class TripUpdate(BaseModel):
    destination: Optional[str] = None
    days: Optional[int] = None
    budget: Optional[str] = None
    currency: Optional[str] = None
    total_cost: Optional[float] = None
    start_date: Optional[datetime] = None
    end_date: Optional[datetime] = None
    travelers: Optional[int] = None
    itinerary: Optional[List[dict]] = None
    images: Optional[List[str]] = None


@api_router.put("/trips/{trip_id}", response_model=Trip)
async def update_trip(trip_id: str, trip_update: TripUpdate, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    r = db.query(TripModel).filter(TripModel.id == trip_id, TripModel.user_id == current_user.id).first()
    if not r:
        raise HTTPException(status_code=404, detail="Trip not found")

    if trip_update.destination is not None:
        r.destination = trip_update.destination
    if trip_update.days is not None:
        r.days = trip_update.days
    if trip_update.budget is not None:
        r.budget = trip_update.budget
    if trip_update.currency is not None:
        r.currency = trip_update.currency
    if trip_update.total_cost is not None:
        r.total_cost = trip_update.total_cost
    if trip_update.start_date is not None:
        r.start_date = trip_update.start_date
    if trip_update.end_date is not None:
        r.end_date = trip_update.end_date
    if trip_update.travelers is not None:
        r.travelers = trip_update.travelers
    if trip_update.itinerary is not None:
        r.itinerary_json = json.dumps(trip_update.itinerary)
    if trip_update.images is not None:
        r.images_json = json.dumps(trip_update.images)
    r.updated_at = datetime.now(timezone.utc)

    db.commit()
    db.refresh(r)
    return Trip(
        id=r.id,
        user_id=r.user_id,
        destination=r.destination,
        days=r.days,
        budget=r.budget,
        currency=r.currency,
        total_cost=r.total_cost,
        start_date=r.start_date,
        end_date=r.end_date,
        travelers=r.travelers,
        itinerary=json.loads(r.itinerary_json or "[]"),
        created_at=r.created_at,
        images=json.loads(r.images_json or "[]"),
    )

@api_router.delete("/trips/{trip_id}")
async def delete_trip(trip_id: str, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    r = db.query(TripModel).filter(TripModel.id == trip_id, TripModel.user_id == current_user.id).first()
    if not r:
        raise HTTPException(status_code=404, detail="Trip not found")
    db.delete(r)
    db.commit()
    return {"message": "Trip deleted successfully"}

# Bookings endpoints
@api_router.post("/bookings", response_model=Booking)
async def create_booking(payload: BookingCreate, db: Session = Depends(get_db)):
    booking_ref = f"WL-{datetime.now(timezone.utc).strftime('%Y%m%d')}-{str(uuid.uuid4())[:8].upper()}"
    booking = BookingModel(
        user_id="guest",  # Default user for bookings without authentication
        trip_id=payload.trip_id,
        destination=payload.destination,
        start_date=payload.start_date,
        end_date=payload.end_date,
        travelers=payload.travelers,
        package_type=payload.package_type,
        hotel_name=payload.hotel_name,
        flight_number=payload.flight_number,
        total_price=payload.total_price,
        currency=payload.currency,
        booking_ref=booking_ref,
        status="Confirmed",
    )
    db.add(booking)
    db.commit()
    db.refresh(booking)
    
    # Auto-generate smart packing checklist
    try:
        _generate_checklist_for_booking(booking.id, booking.destination, db)
    except Exception as e:
        logger.warning(f"Failed to generate checklist for booking {booking.id}: {e}")
    
    return Booking(
        id=booking.id,
        destination=booking.destination,
        start_date=booking.start_date,
        end_date=booking.end_date,
        travelers=booking.travelers,
        package_type=booking.package_type,
        hotel_name=booking.hotel_name,
        flight_number=booking.flight_number,
        total_price=booking.total_price,
        currency=booking.currency,
        booking_ref=booking.booking_ref,
        status=booking.status,
        created_at=booking.created_at,
    )

@api_router.get("/bookings", response_model=List[Booking])
async def list_bookings(status: Optional[str] = None, db: Session = Depends(get_db)):
    query = db.query(BookingModel)
    if status:
        query = query.filter(BookingModel.status == status)
    rows = query.order_by(BookingModel.created_at.desc()).all()
    return [
        Booking(
            id=r.id,
            destination=r.destination,
            start_date=r.start_date,
            end_date=r.end_date,
            travelers=r.travelers,
            package_type=r.package_type,
            hotel_name=r.hotel_name,
            flight_number=r.flight_number,
            total_price=r.total_price,
            currency=r.currency,
            booking_ref=r.booking_ref,
            status=r.status,
            created_at=r.created_at,
        ) for r in rows
    ]

@api_router.delete("/bookings/{booking_id}")
async def delete_booking(booking_id: str, db: Session = Depends(get_db)):
    r = db.query(BookingModel).filter(BookingModel.id == booking_id).first()
    if not r:
        raise HTTPException(status_code=404, detail="Booking not found")
    db.delete(r)
    db.commit()
    return {"message": "Booking deleted"}

@api_router.put("/bookings/{booking_id}/status", response_model=Booking)
async def update_booking_status(booking_id: str, payload: BookingStatusUpdate, db: Session = Depends(get_db)):
    r = db.query(BookingModel).filter(BookingModel.id == booking_id).first()
    if not r:
        raise HTTPException(status_code=404, detail="Booking not found")
    
    if payload.status not in ["Confirmed", "Cancelled", "Completed"]:
        raise HTTPException(status_code=400, detail="Invalid status. Must be Confirmed, Cancelled, or Completed.")
    
    r.status = payload.status
    if payload.status == "Cancelled":
        r.cancelled_at = datetime.now(timezone.utc)
    elif payload.status == "Completed":
        r.completed_at = datetime.now(timezone.utc)
    
    db.commit()
    db.refresh(r)
    
    return Booking(
        id=r.id,
        destination=r.destination,
        start_date=r.start_date,
        end_date=r.end_date,
        travelers=r.travelers,
        package_type=r.package_type,
        hotel_name=r.hotel_name,
        flight_number=r.flight_number,
        total_price=r.total_price,
        currency=r.currency,
        booking_ref=r.booking_ref,
        status=r.status,
        created_at=r.created_at,
    )

# Checklist endpoints
@api_router.post("/checklist/items", response_model=ChecklistItem)
async def create_checklist_item(payload: ChecklistItemCreate, db: Session = Depends(get_db)):
    item = ChecklistItemModel(
        user_id=None,  # TODO: associate with current user
        booking_id=payload.booking_id,
        trip_id=payload.trip_id,
        item_name=payload.item_name,
        category=payload.category,
        is_auto_generated=0
    )
    db.add(item)
    db.commit()
    db.refresh(item)
    return ChecklistItem(
        id=item.id,
        booking_id=item.booking_id,
        trip_id=item.trip_id,
        item_name=item.item_name,
        category=item.category,
        is_packed=bool(item.is_packed),
        is_auto_generated=bool(item.is_auto_generated),
        created_at=item.created_at,
    )

@api_router.get("/checklist/items", response_model=List[ChecklistItem])
async def list_checklist_items(booking_id: Optional[str] = None, trip_id: Optional[str] = None, db: Session = Depends(get_db)):
    query = db.query(ChecklistItemModel)
    if booking_id:
        query = query.filter(ChecklistItemModel.booking_id == booking_id)
    if trip_id:
        query = query.filter(ChecklistItemModel.trip_id == trip_id)
    rows = query.order_by(ChecklistItemModel.category, ChecklistItemModel.item_name).all()
    return [
        ChecklistItem(
            id=r.id,
            booking_id=r.booking_id,
            trip_id=r.trip_id,
            item_name=r.item_name,
            category=r.category,
            is_packed=bool(r.is_packed),
            is_auto_generated=bool(r.is_auto_generated),
            created_at=r.created_at,
        ) for r in rows
    ]

@api_router.put("/checklist/items/{item_id}")
async def toggle_checklist_item(item_id: str, db: Session = Depends(get_db)):
    r = db.query(ChecklistItemModel).filter(ChecklistItemModel.id == item_id).first()
    if not r:
        raise HTTPException(status_code=404, detail="Checklist item not found")
    r.is_packed = 1 if r.is_packed == 0 else 0
    db.commit()
    return {"id": r.id, "is_packed": bool(r.is_packed)}

@api_router.delete("/checklist/items/{item_id}")
async def delete_checklist_item(item_id: str, db: Session = Depends(get_db)):
    r = db.query(ChecklistItemModel).filter(ChecklistItemModel.id == item_id).first()
    if not r:
        raise HTTPException(status_code=404, detail="Checklist item not found")
    db.delete(r)
    db.commit()
    return {"message": "Checklist item deleted"}

# Gallery endpoints
@api_router.post("/gallery", response_model=GalleryPost)
async def create_gallery_post(
    caption: Optional[str] = Form(None),
    location: Optional[str] = Form(None),
    tags: Optional[str] = Form(None),  # JSON-encoded list of strings
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    upload_dir = Path("uploads")
    upload_dir.mkdir(exist_ok=True)
    file_ext = Path(file.filename).suffix
    file_name = f"gallery_{current_user.id}_{uuid.uuid4()}{file_ext}"
    file_path = upload_dir / file_name
    with open(file_path, "wb") as buffer:
        content = await file.read()
        buffer.write(content)
    image_url = f"/uploads/{file_name}"

    tags_list = []
    try:
        if tags:
            tags_list = json.loads(tags)
            if not isinstance(tags_list, list):
                tags_list = []
    except Exception:
        tags_list = []

    row = GalleryPostModel(
        user_id=current_user.id,
        image_url=image_url,
        caption=caption,
        location=location,
        tags_json=json.dumps(tags_list),
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return GalleryPost(
        id=row.id,
        image_url=row.image_url,
        caption=row.caption,
        location=row.location,
        tags=json.loads(row.tags_json or "[]"),
        likes=row.likes,
        created_at=row.created_at,
    )

@api_router.get("/gallery", response_model=List[GalleryPost])
async def list_gallery_posts(limit: int = 50, db: Session = Depends(get_db)):
    rows = db.query(GalleryPostModel).order_by(GalleryPostModel.created_at.desc()).limit(limit).all()
    return [
        GalleryPost(
            id=r.id,
            image_url=r.image_url,
            caption=r.caption,
            location=r.location,
            tags=json.loads(r.tags_json or "[]"),
            likes=r.likes,
            created_at=r.created_at,
        ) for r in rows
    ]

@api_router.post("/gallery/{post_id}/like")
async def like_gallery_post(post_id: str, db: Session = Depends(get_db)):
    r = db.query(GalleryPostModel).filter(GalleryPostModel.id == post_id).first()
    if not r:
        raise HTTPException(status_code=404, detail="Post not found")
    r.likes = (r.likes or 0) + 1
    db.commit()
    return {"likes": r.likes}

@api_router.delete("/gallery/{post_id}")
async def delete_gallery_post(post_id: str, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    r = db.query(GalleryPostModel).filter(GalleryPostModel.id == post_id, GalleryPostModel.user_id == current_user.id).first()
    if not r:
        raise HTTPException(status_code=404, detail="Post not found or not owned by user")
    db.delete(r)
    db.commit()
    return {"message": "Post deleted"}

# Analytics endpoint
class AnalyticsSummary(BaseModel):
    total_trips: int
    total_spend: float
    avg_days: float
    top_destinations: List[dict]

@api_router.get("/analytics/summary", response_model=AnalyticsSummary)
async def analytics_summary(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    trips = db.query(TripModel).filter(TripModel.user_id == current_user.id).all()
    total_trips = len(trips)
    total_spend = sum([t.total_cost or 0 for t in trips])
    avg_days = (sum([t.days or 0 for t in trips]) / total_trips) if total_trips > 0 else 0
    # Top destinations
    dest_counts = {}
    for t in trips:
        dest_counts[t.destination] = dest_counts.get(t.destination, 0) + 1
    top_destinations = sorted([
        {"destination": d, "count": c} for d, c in dest_counts.items()
    ], key=lambda x: x["count"], reverse=True)[:5]
    return AnalyticsSummary(
        total_trips=total_trips,
        total_spend=total_spend,
        avg_days=avg_days,
        top_destinations=top_destinations,
    )

# Destinations endpoint with real API integration using OpenTripMap
@api_router.get("/destinations", response_model=List[Destination])
async def get_destinations(category: Optional[str] = None, search: Optional[str] = None):
    # Define popular destinations with coordinates, categories, and images (matching mock.js format)
    cities = [
        {"name": "Goa, India", "lat": 15.2993, "lon": 74.1240, "category": "Beach", "image": "https://images.unsplash.com/photo-1512343879784-a960bf40e7f2?w=800&q=80", "shortDescription": "Sun, sand, and endless beaches"},
        {"name": "Paris, France", "lat": 48.8566, "lon": 2.3522, "category": "Heritage", "image": "https://images.unsplash.com/photo-1431274172761-fca41d930114?w=800&q=80", "shortDescription": "The city of lights and love"},
        {"name": "Tokyo, Japan", "lat": 35.6762, "lon": 139.6503, "category": "Adventure", "image": "https://images.unsplash.com/photo-1526481280693-3bfa7568e0f3?w=800&q=80", "shortDescription": "Where tradition meets technology"},
        {"name": "Bali, Indonesia", "lat": -8.3405, "lon": 115.0920, "category": "Beach", "image": "https://images.pexels.com/photos/3601425/pexels-photo-3601425.jpeg?w=800&q=80", "shortDescription": "Island of the Gods"},
        {"name": "Santorini, Greece", "lat": 36.3932, "lon": 25.4615, "category": "Heritage", "image": "https://images.unsplash.com/photo-1613395877344-13d4a8e0d49e?w=800&q=80", "shortDescription": "Whitewashed beauty of the Aegean"},
        {"name": "Dubai, UAE", "lat": 25.2048, "lon": 55.2708, "category": "Adventure", "image": "https://images.unsplash.com/photo-1605130284535-11dd9eedc58a?w=800&q=80", "shortDescription": "Futuristic luxury in the desert"},
        {"name": "Maldives", "lat": 3.2028, "lon": 73.2207, "category": "Beach", "image": "https://images.unsplash.com/photo-1637576308588-6647bf80944d?w=800&q=80", "shortDescription": "Tropical paradise with crystal waters"},
        {"name": "Kashmir, India", "lat": 34.0837, "lon": 74.7973, "category": "Mountain", "image": "https://images.unsplash.com/photo-1694084086064-9cdd1ef07d71?w=800&q=80", "shortDescription": "Paradise on Earth"},
    ]

    destinations = []

    for city in cities:
        if category and city["category"].lower() != category.lower():
            continue
        if search and search.lower() not in city["name"].lower():
            continue

        try:
            # Fetch city details from OpenTripMap with timeout (2 seconds)
            geoname_data = {}
            try:
                geoname_url = f"https://api.opentripmap.com/0.1/en/places/geoname?name={city['name']}"
                geoname_response = requests.get(geoname_url, timeout=2)
                geoname_data = geoname_response.json() if geoname_response.status_code == 200 else {}
            except (requests.Timeout, requests.ConnectionError):
                pass  # Skip external API on timeout, use defaults

            # Fetch nearby attractions with timeout (2 seconds)
            attractions = []
            try:
                radius_url = f"https://api.opentripmap.com/0.1/en/places/radius?radius=5000&lon={city['lon']}&lat={city['lat']}&kinds=museums,historical_places,natural,beaches,urban_environment&limit=5"
                radius_response = requests.get(radius_url, timeout=2)
                if radius_response.status_code == 200:
                    places_data = radius_response.json()
                    attractions = [feature["properties"]["name"] for feature in places_data.get("features", []) if "properties" in feature and "name" in feature["properties"]]
            except (requests.Timeout, requests.ConnectionError):
                pass  # Skip external API on timeout

            # Fetch real weather data with timeout (2 seconds)
            weather_api_key = os.environ.get('OPENWEATHER_API_KEY')
            weather = {"temp": 25, "condition": "Sunny", "humidity": 60}  # Default mock
            if weather_api_key:
                try:
                    weather_url = f"http://api.openweathermap.org/data/2.5/weather?q={city['name']}&appid={weather_api_key}&units=metric"
                    weather_response = requests.get(weather_url, timeout=2)
                    if weather_response.status_code == 200:
                        weather_data = weather_response.json()
                        weather = {
                            "temp": weather_data["main"]["temp"],
                            "condition": weather_data["weather"][0]["description"],
                            "humidity": weather_data["main"]["humidity"]
                        }
                except (requests.Timeout, requests.ConnectionError):
                    pass  # Use default mock on timeout

            # Map to Destination model
            dest = {
                "id": geoname_data.get("xid", str(uuid.uuid4())),
                "name": city["name"],  # Use full name with country
                "category": city["category"],
                "image": city.get("image", "https://via.placeholder.com/800x600"),
                "short_description": city.get("shortDescription", f"Explore the wonders of {city['name']}"),
                "description": geoname_data.get("wikipedia_extracts", {}).get("text", f"A beautiful destination with rich culture and attractions. {city['name']} offers unforgettable experiences for every traveler."),
                "best_time": "Varies by season",
                "weather": weather,
                "attractions": attractions if attractions else ["Historic Sites", "Cultural Landmarks", "Natural Beauty"],
                "activities": ["Sightseeing", "Local cuisine", "Cultural experiences", "Photography"]
            }
            destinations.append(Destination(**dest))
        except Exception as e:
            logger.error(f"Error fetching data for {city['name']}: {e}")
            continue

    return destinations


# =============================
# Service Booking Endpoints (Flights, Hotels, Restaurants)
# =============================

def _generate_mock_flights(origin: str, destination: str, date: Optional[str], travelers: int):
    """Generate mock flight data"""
    airlines = [
        {"name": "IndiGo", "code": "6E"},
        {"name": "Air India", "code": "AI"},
        {"name": "SpiceJet", "code": "SG"},
        {"name": "Vistara", "code": "UK"},
        {"name": "GoAir", "code": "G8"}
    ]
    
    flights = []
    base_date = datetime.now() if not date else datetime.strptime(date, "%Y-%m-%d")
    
    for i, airline in enumerate(airlines):
        dep_hour = 6 + (i * 3)
        arr_hour = dep_hour + 2 + (i % 3)
        
        flight = {
            "id": f"FL{uuid.uuid4().hex[:8].upper()}",
            "airline": airline["name"],
            "flight_number": f"{airline['code']}{1000 + i}",
            "origin": origin,
            "destination": destination,
            "departure_time": base_date.replace(hour=dep_hour, minute=0).isoformat(),
            "arrival_time": base_date.replace(hour=arr_hour, minute=30).isoformat(),
            "duration": f"{arr_hour - dep_hour}h 30m",
            "price": 3500 + (i * 800),
            "currency": "INR",
            "seats_available": 45 - (i * 5),
            "refund_policy": "Free cancellation up to 24 hours" if i % 2 == 0 else "Non-refundable",
            "baggage": "15kg check-in, 7kg cabin"
        }
        flights.append(flight)
    
    return flights


def _generate_mock_hotels(destination: str, check_in: Optional[str], check_out: Optional[str], 
                          guests: int, min_rating: Optional[float], max_price: Optional[float]):
    """Generate mock hotel data"""
    hotels_db = [
        {
            "name": "Grand Palace Hotel",
            "location": f"Central {destination}",
            "rating": 4.5,
            "price_per_night": 3500,
            "amenities": ["Free WiFi", "Pool", "Spa", "Restaurant", "Gym"],
            "image_url": "https://via.placeholder.com/400x300/3498db/ffffff?text=Grand+Palace"
        },
        {
            "name": "Comfort Inn & Suites",
            "location": f"Near Airport, {destination}",
            "rating": 4.0,
            "price_per_night": 2200,
            "amenities": ["Free WiFi", "Breakfast", "Parking", "Airport Shuttle"],
            "image_url": "https://via.placeholder.com/400x300/2ecc71/ffffff?text=Comfort+Inn"
        },
        {
            "name": "Luxury Resort & Spa",
            "location": f"Beachfront, {destination}",
            "rating": 5.0,
            "price_per_night": 8500,
            "amenities": ["Private Beach", "Infinity Pool", "Fine Dining", "Spa", "Concierge"],
            "image_url": "https://via.placeholder.com/400x300/e74c3c/ffffff?text=Luxury+Resort"
        },
        {
            "name": "Budget Stay Hotel",
            "location": f"Downtown {destination}",
            "rating": 3.5,
            "price_per_night": 1200,
            "amenities": ["Free WiFi", "AC", "24/7 Reception"],
            "image_url": "https://via.placeholder.com/400x300/f39c12/ffffff?text=Budget+Stay"
        },
        {
            "name": "Heritage Boutique Hotel",
            "location": f"Old City, {destination}",
            "rating": 4.8,
            "price_per_night": 4500,
            "amenities": ["Cultural Tours", "Rooftop Restaurant", "Free WiFi", "Heritage Architecture"],
            "image_url": "https://via.placeholder.com/400x300/9b59b6/ffffff?text=Heritage+Boutique"
        }
    ]
    
    # Filter by rating and price
    filtered = []
    for hotel in hotels_db:
        if min_rating and hotel["rating"] < min_rating:
            continue
        if max_price and hotel["price_per_night"] > max_price:
            continue
        
        hotel_copy = hotel.copy()
        hotel_copy["id"] = f"HT{uuid.uuid4().hex[:8].upper()}"
        hotel_copy["destination"] = destination
        hotel_copy["currency"] = "INR"
        hotel_copy["rooms_available"] = 12
        filtered.append(hotel_copy)
    
    return filtered if filtered else hotels_db[:3]  # Return at least 3 hotels


def _generate_mock_restaurants(destination: str, cuisine: Optional[str], budget: Optional[str]):
    """Generate mock restaurant data"""
    restaurants_db = [
        {
            "name": "Spice Junction",
            "cuisine": "Indian",
            "specialty_dish": "Butter Chicken with Naan",
            "timings": "11:00 AM - 11:00 PM",
            "average_cost": 800,
            "budget_category": "mid-range",
            "rating": 4.3,
            "distance": "1.2 km",
            "image_url": "https://via.placeholder.com/400x300/e67e22/ffffff?text=Spice+Junction"
        },
        {
            "name": "Ocean Breeze Seafood",
            "cuisine": "Seafood",
            "specialty_dish": "Grilled Lobster",
            "timings": "12:00 PM - 10:00 PM",
            "average_cost": 2500,
            "budget_category": "fine-dining",
            "rating": 4.7,
            "distance": "3.5 km",
            "image_url": "https://via.placeholder.com/400x300/3498db/ffffff?text=Ocean+Breeze"
        },
        {
            "name": "Quick Bites Cafe",
            "cuisine": "Continental",
            "specialty_dish": "Club Sandwich",
            "timings": "8:00 AM - 8:00 PM",
            "average_cost": 350,
            "budget_category": "budget",
            "rating": 3.9,
            "distance": "0.5 km",
            "image_url": "https://via.placeholder.com/400x300/95a5a6/ffffff?text=Quick+Bites"
        },
        {
            "name": "Maharaja's Kitchen",
            "cuisine": "Indian",
            "specialty_dish": "Royal Thali",
            "timings": "12:00 PM - 11:00 PM",
            "average_cost": 1200,
            "budget_category": "mid-range",
            "rating": 4.5,
            "distance": "2.0 km",
            "image_url": "https://via.placeholder.com/400x300/c0392b/ffffff?text=Maharaja+Kitchen"
        },
        {
            "name": "Pasta Paradise",
            "cuisine": "Italian",
            "specialty_dish": "Truffle Pasta",
            "timings": "11:00 AM - 10:00 PM",
            "average_cost": 1800,
            "budget_category": "fine-dining",
            "rating": 4.6,
            "distance": "4.0 km",
            "image_url": "https://via.placeholder.com/400x300/27ae60/ffffff?text=Pasta+Paradise"
        }
    ]
    
    # Filter by cuisine and budget
    filtered = []
    for restaurant in restaurants_db:
        if cuisine and restaurant["cuisine"].lower() != cuisine.lower():
            continue
        if budget and restaurant["budget_category"] != budget:
            continue
        
        restaurant_copy = restaurant.copy()
        restaurant_copy["id"] = f"RS{uuid.uuid4().hex[:8].upper()}"
        restaurant_copy["destination"] = destination
        restaurant_copy["currency"] = "INR"
        filtered.append(restaurant_copy)
    
    return filtered if filtered else restaurants_db[:4]


@api_router.post("/search/flights")
async def search_flights(query: FlightSearchQuery):
    """Search for available flights"""
    flights = _generate_mock_flights(query.origin, query.destination, query.date, query.travelers)
    return {"flights": flights, "count": len(flights)}


@api_router.post("/search/hotels")
async def search_hotels(query: HotelSearchQuery):
    """Search for available hotels"""
    hotels = _generate_mock_hotels(
        query.destination, 
        query.check_in, 
        query.check_out, 
        query.guests,
        query.min_rating,
        query.max_price
    )
    return {"hotels": hotels, "count": len(hotels)}


# Old restaurant search endpoint removed - using new restaurant_router instead


# =============================
# AI Assistant Endpoint
# =============================
# OLD AI Chat Endpoint - DISABLED (using new Gemini proxy instead)
# =============================

# class ChatMessage(BaseModel):
#     role: str
#     content: str

# class ChatRequest(BaseModel):
#     messages: List[ChatMessage]

# def _summarize_flights(origin: str, destination: str, db_data: List[dict]) -> str:
#     lines = [f"Here are sample flights from {origin} to {destination}:"]
#     for f in db_data[:3]:
#         lines.append(f"- {f['airline']} {f['flight_number']} {f['departure_time'][11:16]}->{f['arrival_time'][11:16]} | {f['duration']} | INR {f['price']}")
#     return "\n".join(lines)

# @api_router.post("/ai/chat")
# async def ai_chat_old(req: ChatRequest):
#     user_msg = next((m.content for m in reversed(req.messages) if m.role == 'user'), '')
#     user_lower = user_msg.lower()

#     # Heuristic: if user asks for flights/hotels/restaurants, use our mock search to build an answer
#     try:
#         if 'flight' in user_lower and (' from ' in user_lower or ' to ' in user_lower):
#             # naive parse: "flights from X to Y"
#             origin = 'Delhi'
#             destination = 'Goa'
#             try:
#                 parts = user_lower.replace('flights', '').replace('flight', '')
#                 if 'from' in parts and 'to' in parts:
#                     origin = parts.split('from')[1].split('to')[0].strip().title()
#                     destination = parts.split('to')[1].strip().title()
#             except Exception:
#                 pass
#             flights = _generate_mock_flights(origin, destination, None, 1)
#             return { 'answer': _summarize_flights(origin, destination, flights) }

#         if 'hotel' in user_lower:
#             dest = 'Goa'
#             try:
#                 # pick last word as destination rudimentarily
#                 dest = user_msg.strip().split()[-1]
#             except Exception:
#                 pass
#             hotels = _generate_mock_hotels(dest, None, None, 2, None, None)
#             top = hotels[:3]
#             ans = "Top hotels in {d}:\n".format(d=dest)
#             ans += "\n".join([f"- {h['name']} ({h['rating']}/5) INR {h['price_per_night']}/night" for h in top])
#             return { 'answer': ans }

#         if 'restaurant' in user_lower or 'dining' in user_lower:
#             dest = 'Goa'
#             restaurants = _generate_mock_restaurants(dest, None, None)
#             top = restaurants[:3]
#             ans = "Popular restaurants in {d}:\n".format(d=dest)
#             ans += "\n".join([f"- {r['name']} ({r['cuisine']}) avg INR {r['average_cost']}" for r in top])
#             return { 'answer': ans }
#     except Exception:
#         pass

#     # Fallback to Hugging Face Inference API if configured
#     if HF_API_KEY:
#         try:
#             prompt = "You are a helpful travel assistant. Answer concisely.\n" + user_msg
#             async with httpx.AsyncClient(timeout=30) as client:
#                 resp = await client.post(
#                     'https://api-inference.huggingface.co/models/mistralai/Mistral-7B-Instruct-v0.3',
#                     headers={ 'Authorization': f'Bearer {HF_API_KEY}' },
#                     json={ 'inputs': prompt, 'parameters': { 'max_new_tokens': 200, 'temperature': 0.7 } }
#                 )
#             data = resp.json()
#             if isinstance(data, list) and data and 'generated_text' in data[0]:
#                 return { 'answer': data[0]['generated_text'][-600:] }
#             if isinstance(data, dict) and 'generated_text' in data:
#                 return { 'answer': data['generated_text'] }
#         except Exception as e:
#             logger.warning(f"HF inference failed: {e}")

#     # Final fallback
#     return { 'answer': "I can help with destinations, flights, hotels, and restaurants. Ask me for flights from City A to City B, or hotels in a city." }


@api_router.post("/service/bookings")
@api_router.post("/bookings/service")  # Alias for frontend compatibility
async def create_service_booking(
    booking: ServiceBookingCreate,
    current_user: User = Depends(get_current_user)
):
    """Create a new service booking (flight/hotel/restaurant) with KYC check"""
    db: Session = next(get_db())
    
    # Check if KYC is completed
    user = db.query(UserModel).filter(UserModel.id == current_user.id).first()
    if not user or not user.is_kyc_completed:
        raise HTTPException(
            status_code=403,
            detail="Please complete KYC verification before booking"
        )
    
    booking_ref = f"{booking.service_type[:2].upper()}{uuid.uuid4().hex[:8].upper()}"
    
    db_booking = ServiceBookingModel(
        id=str(uuid.uuid4()),
        user_id=current_user.id,
        service_type=booking.service_type,
        service_json=booking.service_json,
        total_price=booking.total_price,
        currency=booking.currency,
        booking_ref=booking_ref,
        status="Pending",
        created_at=datetime.now(timezone.utc)
    )
    
    db.add(db_booking)
    db.commit()
    db.refresh(db_booking)
    
    return ServiceBookingResponse(
        id=db_booking.id,
        user_id=db_booking.user_id,
        service_type=db_booking.service_type,
        service_json=db_booking.service_json,
        total_price=db_booking.total_price,
        currency=db_booking.currency,
        booking_ref=db_booking.booking_ref,
        status=db_booking.status,
        created_at=db_booking.created_at
    )


@api_router.get("/service/bookings")
async def get_service_bookings(current_user: User = Depends(get_current_user)):
    """Get all service bookings for the current user"""
    db: Session = next(get_db())
    
    bookings = db.query(ServiceBookingModel).filter(
        ServiceBookingModel.user_id == current_user.id
    ).order_by(ServiceBookingModel.created_at.desc()).all()
    
    return {
        "bookings": [
            ServiceBookingResponse(
                id=b.id,
                user_id=b.user_id,
                service_type=b.service_type,
                service_json=b.service_json,
                total_price=b.total_price,
                currency=b.currency,
                booking_ref=b.booking_ref,
                status=b.status,
                created_at=b.created_at
            )
            for b in bookings
        ]
    }


# Weather API endpoint
@api_router.get("/weather/{location}")
async def get_weather(location: str):
    # Using OpenWeatherMap API (free tier)
    api_key = os.environ.get('OPENWEATHER_API_KEY')
    if not api_key:
        # Return mock data if no API key
        return {"temp": 25, "condition": "Sunny", "humidity": 60}

# Geolocation reverse lookup -> city name
@api_router.get("/geolocate")
async def reverse_geolocate(lat: float, lon: float):
    api_key = os.environ.get('OPENWEATHER_API_KEY')
    if not api_key:
        return {"city": None}
    try:
        url = f"http://api.openweathermap.org/geo/1.0/reverse?lat={lat}&lon={lon}&limit=1&appid={api_key}"
        response = requests.get(url)
        if response.status_code == 200:
            data = response.json()
            if isinstance(data, list) and data:
                item = data[0]
                return {"city": item.get("name"), "country": item.get("country")}
    except Exception:
        pass
    return {"city": None}

    try:
        url = f"http://api.openweathermap.org/data/2.5/weather?q={location}&appid={api_key}&units=metric"
        response = requests.get(url)
        data = response.json()

        return {
            "temp": data["main"]["temp"],
            "condition": data["weather"][0]["description"],
            "humidity": data["main"]["humidity"]
        }
    except:
        return {"temp": 25, "condition": "Sunny", "humidity": 60}

# Currency conversion endpoint
@api_router.get("/currency/convert")
async def convert_currency(amount: float, from_currency: str, to_currency: str):
    # Using free currency API (CurrencyAPI)
    api_key = os.environ.get('CURRENCY_API_KEY')
    if not api_key:
        # Mock conversion rates
        rates = {"USD": 1, "EUR": 0.92, "GBP": 0.79, "INR": 83.12, "JPY": 149.50, "AED": 3.67}
        if from_currency in rates and to_currency in rates:
            return {"converted_amount": amount * (rates[to_currency] / rates[from_currency])}
        return {"converted_amount": amount}

    try:
        url = f"https://api.currencyapi.com/v3/latest?apikey={api_key}&base_currency={from_currency}&currencies={to_currency}"
        response = requests.get(url)
        if response.status_code == 200:
            data = response.json()
            rate = data["data"][to_currency]["value"]
            return {"converted_amount": amount * rate}
        else:
            # Fallback to mock rates if API fails
            rates = {"USD": 1, "EUR": 0.92, "GBP": 0.79, "INR": 83.12, "JPY": 149.50, "AED": 3.67}
            if from_currency in rates and to_currency in rates:
                return {"converted_amount": amount * (rates[to_currency] / rates[from_currency])}
            return {"converted_amount": amount}
    except Exception as e:
        logger.error(f"Currency conversion error: {e}")
        # Fallback to mock rates
        rates = {"USD": 1, "EUR": 0.92, "GBP": 0.79, "INR": 83.12, "JPY": 149.50, "AED": 3.67}
        if from_currency in rates and to_currency in rates:
            return {"converted_amount": amount * (rates[to_currency] / rates[from_currency])}
        return {"converted_amount": amount}

# Image upload endpoint
@api_router.post("/upload/image")
async def upload_image(file: UploadFile = File(...), current_user: User = Depends(get_current_user)):
    # For now, save to local directory - in production use cloud storage
    upload_dir = Path("uploads")
    upload_dir.mkdir(exist_ok=True)

    file_extension = Path(file.filename).suffix
    file_name = f"{current_user.id}_{uuid.uuid4()}{file_extension}"
    file_path = upload_dir / file_name

    with open(file_path, "wb") as buffer:
        content = await file.read()
        buffer.write(content)

    # Return the file URL (in production, this would be cloud storage URL)
    return {"image_url": f"/uploads/{file_name}"}

# Include the router in the main app
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

# Serve uploaded files statically in development
upload_dir = Path("uploads")
upload_dir.mkdir(exist_ok=True)
app.mount("/uploads", StaticFiles(directory=str(upload_dir)), name="uploads")

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# ===============================================
# AI Assistant Endpoints - Data for Recommendations
# ===============================================

class AIDataRequest(BaseModel):
    data_type: str  # 'hotels', 'flights', 'restaurants'
    location: Optional[str] = None
    limit: Optional[int] = 10

@app.get("/api/ai/data/hotels")
async def get_hotels_for_ai(location: Optional[str] = None, limit: int = 10):
    """
    Get sample hotel data for AI recommendations
    """
    # In a real app, this would query your hotel database
    # For now, return structured sample data
    hotels = [
        {
            "name": "Paradise Inn",
            "location": location or "Goa",
            "price_per_night": 3500,
            "rating": 4.5,
            "amenities": ["Pool", "WiFi", "Breakfast", "Beach Access"],
            "type": "Beach Resort",
            "best_for": "Couples, Families"
        },
        {
            "name": "Mountain View Lodge",
            "location": location or "Manali",
            "price_per_night": 4200,
            "rating": 4.7,
            "amenities": ["Mountain View", "WiFi", "Parking", "Restaurant"],
            "type": "Mountain Resort",
            "best_for": "Adventure, Solo Travelers"
        },
        {
            "name": "City Comfort Hotel",
            "location": location or "Mumbai",
            "price_per_night": 5500,
            "rating": 4.3,
            "amenities": ["WiFi", "Gym", "Business Center", "Airport Shuttle"],
            "type": "Business Hotel",
            "best_for": "Business Travelers"
        },
        {
            "name": "Heritage Palace",
            "location": location or "Jaipur",
            "price_per_night": 6800,
            "rating": 4.8,
            "amenities": ["Pool", "Spa", "Restaurant", "Cultural Tours"],
            "type": "Heritage Hotel",
            "best_for": "Couples, Luxury Travelers"
        },
        {
            "name": "Backpacker's Haven",
            "location": location or "Delhi",
            "price_per_night": 1200,
            "rating": 4.0,
            "amenities": ["WiFi", "Common Kitchen", "Lounge", "Tours"],
            "type": "Hostel",
            "best_for": "Solo Travelers, Budget"
        }
    ]
    return {"hotels": hotels[:limit], "count": len(hotels[:limit])}

@app.get("/api/ai/data/flights")
async def get_flights_for_ai(origin: Optional[str] = None, destination: Optional[str] = None, limit: int = 10):
    """
    Get sample flight data for AI recommendations
    """
    flights = [
        {
            "airline": "IndiGo",
            "flight_number": "6E-123",
            "origin": origin or "Delhi",
            "destination": destination or "Mumbai",
            "price": 4500,
            "duration": "2h 15m",
            "class": "Economy",
            "stops": 0
        },
        {
            "airline": "Air India",
            "flight_number": "AI-456",
            "origin": origin or "Delhi",
            "destination": destination or "Mumbai",
            "price": 6200,
            "duration": "2h 10m",
            "class": "Business",
            "stops": 0
        },
        {
            "airline": "SpiceJet",
            "flight_number": "SG-789",
            "origin": origin or "Delhi",
            "destination": destination or "Mumbai",
            "price": 3800,
            "duration": "2h 30m",
            "class": "Economy",
            "stops": 0
        },
        {
            "airline": "Vistara",
            "flight_number": "UK-234",
            "origin": origin or "Delhi",
            "destination": destination or "Mumbai",
            "price": 5500,
            "duration": "2h 20m",
            "class": "Premium Economy",
            "stops": 0
        }
    ]
    return {"flights": flights[:limit], "count": len(flights[:limit])}

@app.get("/api/ai/data/restaurants")
async def get_restaurants_for_ai(location: Optional[str] = None, cuisine: Optional[str] = None, limit: int = 10):
    """
    Get sample restaurant data for AI recommendations
    """
    restaurants = [
        {
            "name": "Spice Garden",
            "location": location or "Delhi",
            "cuisine": cuisine or "Indian",
            "price_range": "INR 800-1500",
            "rating": 4.6,
            "specialties": ["Butter Chicken", "Dal Makhani", "Naan"],
            "best_for": "Families, Traditional Dining"
        },
        {
            "name": "Coastal Breeze",
            "location": location or "Goa",
            "cuisine": cuisine or "Seafood",
            "price_range": "INR 1200-2000",
            "rating": 4.7,
            "specialties": ["Goan Fish Curry", "Prawns", "Calamari"],
            "best_for": "Seafood Lovers, Beach Dining"
        },
        {
            "name": "Taj Mahal Restaurant",
            "location": location or "Agra",
            "cuisine": cuisine or "Mughlai",
            "price_range": "INR 600-1200",
            "rating": 4.5,
            "specialties": ["Biryani", "Kebabs", "Korma"],
            "best_for": "Traditional Food, Groups"
        },
        {
            "name": "Green Leaf Cafe",
            "location": location or "Bangalore",
            "cuisine": cuisine or "Vegetarian",
            "price_range": "INR 400-800",
            "rating": 4.4,
            "specialties": ["South Indian", "Dosa", "Idli"],
            "best_for": "Vegetarians, Healthy Eating"
        }
    ]
    return {"restaurants": restaurants[:limit], "count": len(restaurants[:limit])}

@app.get("/api/ai/policies")
async def get_policies():
    """
    Get booking and refund policies for AI to explain
    """
    policies = {
        "booking": {
            "hotels": "Book hotels with ease! Pay online or at the property. Most bookings are confirmed instantly. You'll receive a voucher via email.",
            "flights": "Flight tickets are confirmed immediately after payment. E-tickets will be sent to your email. Please check baggage allowance.",
            "restaurants": "Restaurant reservations are confirmed based on availability. You'll receive a confirmation via email and SMS."
        },
        "cancellation": {
            "hotels": "Free cancellation up to 24 hours before check-in for most hotels. Some may have different policies - check booking details.",
            "flights": "Cancellation fees depend on airline and fare type. Refunds processed in 7-14 business days. Check fare rules before booking.",
            "restaurants": "Cancel up to 2 hours before reservation time for full refund. Late cancellations may incur charges."
        },
        "refund": {
            "general": "Refunds are processed within 7-14 business days to the original payment method. Cancellation fees (if any) will be deducted."
        }
    }
    return policies


# ===============================================
# AI Chat Proxy - Calls Google Gemini server-side
# ===============================================

class AIChatRequest(BaseModel):
    message: str
    context: Optional[dict] = {}
    
    model_config = ConfigDict(extra='allow')

_AI_SYSTEM_CONTEXT = (
    "You are WanderLite AI — an advanced, friendly, and knowledgeable travel assistant integrated into a travel "
    "planning website.\n\n"
    "Your role:\n"
    "- Help users find destinations, hotels, flights, and restaurants based on their preferences.\n"
    "- Provide personalized suggestions based on location, budget, and travel type (solo, family, group, romantic).\n"
    "- Explain booking and refund policies in simple terms.\n"
    "- Handle trip planning, itinerary creation, and group coordination.\n"
    "- Keep tone: friendly, clear, and human-like — never robotic.\n"
    "- Format answers neatly with bullet points, emojis, and short paragraphs.\n\n"
    "Rules:\n"
    "- Stay within travel, hotels, restaurants, and flights context.\n"
    "- Never provide fake payment or transaction details.\n"
    "- If unrelated questions arise, politely redirect to travel assistance.\n"
    "- If you need data (like hotel list or flight options), say: \"Would you like me to show WanderLite's latest results?\"\n"
    "- Ask clarifying questions before giving recommendations when needed.\n\n"
    "System Context:\n- App name: WanderLite\n- Developer: Bro\n"
)

@app.post("/api/ai/chat")
async def ai_chat(req: AIChatRequest):
    logger.info(f"AI Chat Request: message={req.message[:50]}..., context={req.context}")
    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        raise HTTPException(status_code=500, detail="GEMINI_API_KEY not configured on server")

    # Build prompt with system context and optional user context
    ctx_parts = []
    if req.context:
        try:
            ctx_parts.append("Context: " + json.dumps(req.context, ensure_ascii=False))
        except Exception:
            pass
    full_prompt = _AI_SYSTEM_CONTEXT + ("\n\n" + "\n".join(ctx_parts) if ctx_parts else "") + "\n\n" + req.message

    payload = {
        "contents": [
            {
                "role": "user",
                "parts": [{"text": full_prompt}],
            }
        ],
        "generationConfig": {
            "temperature": 0.7,
            "topK": 40,
            "topP": 0.95,
            "maxOutputTokens": 1024,
        },
        "safetySettings": [
            {"category": "HARM_CATEGORY_HARASSMENT", "threshold": "BLOCK_MEDIUM_AND_ABOVE"},
            {"category": "HARM_CATEGORY_HATE_SPEECH", "threshold": "BLOCK_MEDIUM_AND_ABOVE"},
            {"category": "HARM_CATEGORY_SEXUALLY_EXPLICIT", "threshold": "BLOCK_MEDIUM_AND_ABOVE"},
            {"category": "HARM_CATEGORY_DANGEROUS_CONTENT", "threshold": "BLOCK_MEDIUM_AND_ABOVE"},
        ],
    }

    # First, try to get the list of available models
    try:
        list_url = f"https://generativelanguage.googleapis.com/v1beta/models?key={api_key}"
        async with httpx.AsyncClient(timeout=30) as client:
            list_resp = await client.get(list_url)
        
        if list_resp.status_code == 200:
            models_data = list_resp.json()
            available_models = []
            
            # Extract model names that support generateContent
            for model in models_data.get("models", []):
                model_name = model.get("name", "").replace("models/", "")
                supported_methods = model.get("supportedGenerationMethods", [])
                if "generateContent" in supported_methods:
                    available_models.append(model_name)
            
            logger.info(f"Available Gemini models: {available_models}")
            
            # Prioritize older/stable models that are less likely to have quota issues
            priority_models = ["gemini-1.5-flash", "gemini-1.5-pro", "gemini-pro", "gemini-1.0-pro"]
            ordered_models = [m for m in priority_models if m in available_models]
            # Add remaining available models
            ordered_models.extend([m for m in available_models if m not in ordered_models])
            
            # Try each available model
            for model_name in ordered_models[:5]:  # Try first 5 models
                try:
                    url = f"https://generativelanguage.googleapis.com/v1beta/models/{model_name}:generateContent?key={api_key}"
                    logger.info(f"Trying available model: {model_name}")
                    
                    async with httpx.AsyncClient(timeout=30) as client:
                        resp = await client.post(url, json=payload)
                    
                    if resp.status_code == 200:
                        data = resp.json()
                        answer = (
                            (data.get("candidates") or [{}])[0]
                            .get("content", {})
                            .get("parts", [{}])[0]
                            .get("text")
                        )
                        if answer:
                            logger.info(f"✅ Success with available model: {model_name}")
                            return {"answer": answer}
                    elif resp.status_code == 429:
                        detail = resp.json() if resp.headers.get("content-type", "").startswith("application/json") else resp.text
                        logger.warning(f"⏳ {model_name}: Quota exceeded - trying next model")
                        continue
                    else:
                        detail = resp.json() if resp.headers.get("content-type", "").startswith("application/json") else resp.text
                        logger.warning(f"❌ Available model {model_name} failed: {resp.status_code} {detail}")
                        continue
                        
                except Exception as e:
                    logger.warning(f"Available model {model_name} error: {str(e)}")
                    continue
    
    except Exception as e:
        logger.warning(f"Could not list available models: {str(e)}")
    
    # If listing models failed, try hardcoded stable models
    fallback_models = [
        "gemini-1.5-flash",
        "gemini-1.5-pro", 
        "gemini-pro",
        "gemini-1.0-pro",
        "gemini-1.5-flash-8b-001",
        "gemini-1.5-flash-002", 
        "gemini-1.5-pro-002",
        "gemini-1.0-pro-002",
    ]
    
    for model_name in fallback_models:
        try:
            url = f"https://generativelanguage.googleapis.com/v1beta/models/{model_name}:generateContent?key={api_key}"
            logger.info(f"Trying fallback model: {model_name}")
            
            async with httpx.AsyncClient(timeout=30) as client:
                resp = await client.post(url, json=payload)
            
            if resp.status_code == 200:
                data = resp.json()
                answer = (
                    (data.get("candidates") or [{}])[0]
                    .get("content", {})
                    .get("parts", [{}])[0]
                    .get("text")
                )
                if answer:
                    logger.info(f"✅ Success with fallback model: {model_name}")
                    return {"answer": answer}
            elif resp.status_code == 429:
                detail = resp.json() if resp.headers.get("content-type", "").startswith("application/json") else resp.text
                logger.warning(f"⏳ Fallback {model_name}: Quota exceeded - trying next model")
                continue
            else:
                detail = resp.json() if resp.headers.get("content-type", "").startswith("application/json") else resp.text
                logger.warning(f"❌ Fallback model {model_name} failed: {resp.status_code} {detail}")
                continue
                
        except Exception as e:
            logger.warning(f"Fallback model {model_name} error: {str(e)}")
            continue
    
    # If all models failed due to quota, return helpful message
    logger.error("All Gemini models failed - likely quota exceeded")
    return {"answer": "I'm currently experiencing high demand and have temporarily reached my response limits. Please try again in a few minutes! In the meantime, feel free to explore our destinations, hotels, and flights. How can I help you plan your perfect trip? 🌍✈️"}


@app.on_event("startup")
def on_startup():
    # Create tables if not exist
    Base.metadata.create_all(bind=engine)
    # Best-effort schema migrations for added columns
    try:
        with engine.connect() as conn:
            # Add status column if missing
            try:
                conn.execute(text("ALTER TABLE bookings ADD COLUMN status VARCHAR(20) DEFAULT 'Confirmed'"))
            except Exception:
                pass
            # Add cancelled_at column if missing
            try:
                conn.execute(text("ALTER TABLE bookings ADD COLUMN cancelled_at DATETIME NULL"))
            except Exception:
                pass
            # Add completed_at column if missing
            try:
                conn.execute(text("ALTER TABLE bookings ADD COLUMN completed_at DATETIME NULL"))
            except Exception:
                pass
            # Add is_blocked column if missing
            try:
                conn.execute(text("ALTER TABLE users ADD COLUMN is_blocked INTEGER DEFAULT 0"))
            except Exception:
                pass
    except Exception as e:
        logger.warning(f"Schema migration checks failed: {e}")
    logger.info("Database tables created/verified successfully")


# =============================
# ADMIN PANEL API ROUTES
# =============================
admin_router = APIRouter(prefix="/api/admin", tags=["admin"])

ADMIN_SECRET_KEY = os.environ.get('ADMIN_SECRET_KEY', 'admin-super-secret-key-2025')


def create_admin_token(admin_id: int, email: str, role: str) -> str:
    """Create JWT token for admin"""
    expire = datetime.now(timezone.utc) + timedelta(hours=8)
    payload = {
        "sub": str(admin_id),
        "email": email,
        "role": role,
        "scope": "admin",
        "exp": expire
    }
    return jwt.encode(payload, ADMIN_SECRET_KEY, algorithm=ALGORITHM)


def verify_admin_token(credentials: HTTPAuthorizationCredentials = Depends(security)) -> dict:
    """Verify admin JWT token"""
    try:
        payload = jwt.decode(credentials.credentials, ADMIN_SECRET_KEY, algorithms=[ALGORITHM])
        if payload.get("scope") != "admin":
            raise HTTPException(status_code=403, detail="Not an admin token")
        return payload
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid admin credentials")


async def get_current_admin(
    token_data: dict = Depends(verify_admin_token),
    db: Session = Depends(get_db)
) -> AdminModel:
    """Get current admin from token"""
    admin = db.query(AdminModel).filter(AdminModel.id == int(token_data["sub"])).first()
    if not admin or not admin.is_active:
        raise HTTPException(status_code=401, detail="Admin not found or inactive")
    return admin


def log_admin_action(db: Session, admin_id: int, action: str, entity_type: str = None, 
                     entity_id: str = None, details: str = None, ip_address: str = None):
    """Log admin action for audit trail"""
    log = AuditLogModel(
        admin_id=admin_id,
        action=action,
        entity_type=entity_type,
        entity_id=entity_id,
        details=details,
        ip_address=ip_address
    )
    db.add(log)
    db.commit()


# =============================
# Admin Authentication
# =============================
@admin_router.post("/login", response_model=AdminToken)
async def admin_login(credentials: AdminLogin, db: Session = Depends(get_db)):
    """Admin login - separate from user login"""
    admin = db.query(AdminModel).filter(AdminModel.email == credentials.email).first()
    
    if not admin:
        raise HTTPException(status_code=401, detail="Invalid credentials")
    
    if not pwd_context.verify(credentials.password, admin.hashed_password):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    
    if not admin.is_active:
        raise HTTPException(status_code=403, detail="Admin account is disabled")
    
    # Update last login
    admin.last_login = datetime.now(timezone.utc)
    db.commit()
    
    token = create_admin_token(admin.id, admin.email, admin.role)
    
    return AdminToken(
        access_token=token,
        token_type="bearer",
        admin={
            "id": admin.id,
            "email": admin.email,
            "username": admin.username,
            "role": admin.role
        }
    )


@admin_router.get("/me", response_model=AdminPublic)
async def get_admin_profile(admin: AdminModel = Depends(get_current_admin)):
    """Get current admin profile"""
    return AdminPublic(
        id=admin.id,
        email=admin.email,
        username=admin.username,
        role=admin.role,
        is_active=bool(admin.is_active),
        last_login=admin.last_login,
        created_at=admin.created_at
    )


@admin_router.post("/change-password")
async def admin_change_password(
    data: AdminPasswordChange,
    admin: AdminModel = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """Change admin password"""
    if not pwd_context.verify(data.current_password, admin.hashed_password):
        raise HTTPException(status_code=400, detail="Current password is incorrect")
    
    admin.hashed_password = pwd_context.hash(data.new_password)
    admin.updated_at = datetime.now(timezone.utc)
    db.commit()
    
    log_admin_action(db, admin.id, "password_change", "admin", str(admin.id))
    
    return {"message": "Password changed successfully"}


# =============================
# Dashboard Statistics
# =============================
@admin_router.get("/dashboard", response_model=DashboardStats)
async def get_dashboard_stats(
    admin: AdminModel = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """Get dashboard statistics"""
    # Total users
    total_users = db.query(UserModel).count()
    
    # Total bookings (service + regular)
    service_bookings = db.query(ServiceBookingModel).count()
    regular_bookings = db.query(BookingModel).count()
    total_bookings = service_bookings + regular_bookings
    
    # Total revenue (from transactions)
    total_revenue = db.query(TransactionModel).filter(
        TransactionModel.status == "success"
    ).with_entities(
        text("COALESCE(SUM(amount), 0)")
    ).scalar() or 0
    
    # Pending KYC
    pending_kyc = db.query(KYCDetailsModel).filter(
        KYCDetailsModel.verification_status == "pending"
    ).count()
    
    # Active trips
    active_trips = db.query(TripModel).count()
    
    # Recent bookings
    recent_bookings = db.query(ServiceBookingModel).order_by(
        ServiceBookingModel.created_at.desc()
    ).limit(5).all()
    
    recent_bookings_data = []
    for b in recent_bookings:
        user = db.query(UserModel).filter(UserModel.id == b.user_id).first()
        recent_bookings_data.append({
            "id": b.id,
            "booking_ref": b.booking_ref,
            "service_type": b.service_type,
            "total_price": b.total_price,
            "status": b.status,
            "user_email": user.email if user else "N/A",
            "created_at": b.created_at.isoformat() if b.created_at else None
        })
    
    # Bookings by day (last 7 days)
    # For SQLite compatibility
    bookings_by_day = []
    for i in range(7):
        from datetime import date as dt_date
        day = datetime.now(timezone.utc).date() - timedelta(days=6-i)
        count = db.query(ServiceBookingModel).filter(
            text(f"DATE(created_at) = '{day}'")
        ).count()
        bookings_by_day.append({
            "date": day.isoformat(),
            "count": count
        })
    
    # Top destinations
    top_destinations = []
    try:
        destinations = db.query(DestinationModel).filter(
            DestinationModel.is_active == 1
        ).limit(5).all()
        for d in destinations:
            top_destinations.append({
                "name": d.name,
                "category": d.category,
                "bookings": 0  # Would need to join with bookings
            })
    except:
        pass
    
    return DashboardStats(
        total_users=total_users,
        total_bookings=total_bookings,
        total_revenue=float(total_revenue),
        pending_kyc=pending_kyc,
        active_trips=active_trips,
        recent_bookings=recent_bookings_data,
        bookings_by_day=bookings_by_day,
        revenue_by_month=[],
        top_destinations=top_destinations
    )


# =============================
# User Management
# =============================
@admin_router.get("/users", response_model=List[UserListItem])
async def list_users(
    page: int = 1,
    limit: int = 20,
    search: Optional[str] = None,
    kyc_status: Optional[str] = None,
    admin: AdminModel = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """List all users with filtering"""
    query = db.query(UserModel)
    
    if search:
        query = query.filter(
            (UserModel.email.contains(search)) | 
            (UserModel.username.contains(search)) |
            (UserModel.name.contains(search))
        )
    
    if kyc_status == "completed":
        query = query.filter(UserModel.is_kyc_completed == 1)
    elif kyc_status == "pending":
        query = query.filter(UserModel.is_kyc_completed == 0)
    
    users = query.order_by(UserModel.created_at.desc()).offset((page-1)*limit).limit(limit).all()
    
    return [
        UserListItem(
            id=u.id,
            email=u.email,
            username=u.username,
            name=u.name,
            phone=u.phone,
            is_kyc_completed=u.is_kyc_completed or 0,
            is_blocked=getattr(u, 'is_blocked', 0) or 0,
            created_at=u.created_at
        ) for u in users
    ]


@admin_router.get("/users/{user_id}", response_model=UserDetail)
async def get_user_detail(
    user_id: str,
    admin: AdminModel = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """Get detailed user information"""
    user = db.query(UserModel).filter(UserModel.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Get KYC details
    kyc = db.query(KYCDetailsModel).filter(KYCDetailsModel.user_id == user_id).first()
    kyc_data = None
    if kyc:
        kyc_data = {
            "id": kyc.id,
            "full_name": kyc.full_name,
            "dob": kyc.dob,
            "gender": kyc.gender,
            "nationality": kyc.nationality,
            "id_type": kyc.id_type,
            "address": f"{kyc.address_line}, {kyc.city}, {kyc.state}, {kyc.country} - {kyc.pincode}",
            "verification_status": kyc.verification_status,
            "submitted_at": kyc.submitted_at.isoformat() if kyc.submitted_at else None,
            "id_proof_front": kyc.id_proof_front_path,
            "id_proof_back": kyc.id_proof_back_path,
            "selfie": kyc.selfie_path
        }
    
    # Get bookings
    bookings = db.query(ServiceBookingModel).filter(
        ServiceBookingModel.user_id == user_id
    ).order_by(ServiceBookingModel.created_at.desc()).limit(10).all()
    
    bookings_data = [
        {
            "id": b.id,
            "booking_ref": b.booking_ref,
            "service_type": b.service_type,
            "total_price": b.total_price,
            "status": b.status,
            "created_at": b.created_at.isoformat() if b.created_at else None
        } for b in bookings
    ]
    
    # Get transactions
    transactions = db.query(TransactionModel).filter(
        TransactionModel.user_id == user_id
    ).order_by(TransactionModel.created_at.desc()).limit(10).all()
    
    transactions_data = [
        {
            "id": t.id,
            "amount": t.amount,
            "currency": t.currency,
            "payment_method": t.payment_method,
            "status": t.status,
            "created_at": t.created_at.isoformat() if t.created_at else None
        } for t in transactions
    ]
    
    return UserDetail(
        id=user.id,
        email=user.email,
        username=user.username,
        name=user.name,
        phone=user.phone,
        is_kyc_completed=user.is_kyc_completed or 0,
        payment_profile_completed=user.payment_profile_completed or 0,
        is_blocked=getattr(user, 'is_blocked', 0) or 0,
        created_at=user.created_at,
        kyc_details=kyc_data,
        bookings=bookings_data,
        transactions=transactions_data
    )


@admin_router.post("/users/{user_id}/block")
async def block_user(
    user_id: str,
    admin: AdminModel = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """Block a user"""
    user = db.query(UserModel).filter(UserModel.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Use raw SQL for SQLite compatibility
    db.execute(text(f"UPDATE users SET is_blocked = 1 WHERE id = '{user_id}'"))
    db.commit()
    
    log_admin_action(db, admin.id, "block_user", "user", user_id, f"Blocked user {user.email}")
    
    return {"message": f"User {user.email} has been blocked"}


@admin_router.post("/users/{user_id}/unblock")
async def unblock_user(
    user_id: str,
    admin: AdminModel = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """Unblock a user"""
    user = db.query(UserModel).filter(UserModel.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    db.execute(text(f"UPDATE users SET is_blocked = 0 WHERE id = '{user_id}'"))
    db.commit()
    
    log_admin_action(db, admin.id, "unblock_user", "user", user_id, f"Unblocked user {user.email}")
    
    return {"message": f"User {user.email} has been unblocked"}


# =============================
# KYC Verification Management
# =============================
@admin_router.get("/kyc/counts")
async def get_kyc_counts(
    admin: AdminModel = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """Get counts of KYC requests by status"""
    pending_count = db.query(KYCDetailsModel).filter(KYCDetailsModel.verification_status == "pending").count()
    verified_count = db.query(KYCDetailsModel).filter(KYCDetailsModel.verification_status == "verified").count()
    rejected_count = db.query(KYCDetailsModel).filter(KYCDetailsModel.verification_status == "rejected").count()
    
    return {
        "pending": pending_count,
        "verified": verified_count,
        "rejected": rejected_count
    }


@admin_router.get("/kyc", response_model=List[KYCReviewItem])
async def list_kyc_requests(
    status: Optional[str] = None,
    page: int = 1,
    limit: int = 20,
    admin: AdminModel = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """List KYC verification requests"""
    query = db.query(KYCDetailsModel)
    
    if status:
        query = query.filter(KYCDetailsModel.verification_status == status)
    
    kyc_list = query.order_by(KYCDetailsModel.created_at.desc()).offset((page-1)*limit).limit(limit).all()
    
    result = []
    for kyc in kyc_list:
        user = db.query(UserModel).filter(UserModel.id == kyc.user_id).first()
        result.append(KYCReviewItem(
            id=kyc.id,
            user_id=kyc.user_id,
            user_email=user.email if user else "N/A",
            user_name=user.username if user else "N/A",
            full_name=kyc.full_name,
            id_type=kyc.id_type,
            verification_status=kyc.verification_status,
            submitted_at=kyc.submitted_at,
            created_at=kyc.created_at
        ))
    
    return result


@admin_router.get("/kyc/{kyc_id}")
async def get_kyc_detail(
    kyc_id: int,
    admin: AdminModel = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """Get detailed KYC information for review"""
    kyc = db.query(KYCDetailsModel).filter(KYCDetailsModel.id == kyc_id).first()
    if not kyc:
        raise HTTPException(status_code=404, detail="KYC record not found")
    
    user = db.query(UserModel).filter(UserModel.id == kyc.user_id).first()
    
    return {
        "id": kyc.id,
        "user_id": kyc.user_id,
        "user_email": user.email if user else "N/A",
        "user_name": user.username if user else "N/A",
        "full_name": kyc.full_name,
        "dob": kyc.dob,
        "gender": kyc.gender,
        "nationality": kyc.nationality,
        "id_type": kyc.id_type,
        "address_line": kyc.address_line,
        "city": kyc.city,
        "state": kyc.state,
        "country": kyc.country,
        "pincode": kyc.pincode,
        "verification_status": kyc.verification_status,
        "id_proof_front_path": kyc.id_proof_front_path,
        "id_proof_back_path": kyc.id_proof_back_path,
        "selfie_path": kyc.selfie_path,
        "submitted_at": kyc.submitted_at.isoformat() if kyc.submitted_at else None,
        "verified_at": kyc.verified_at.isoformat() if kyc.verified_at else None,
        "created_at": kyc.created_at.isoformat() if kyc.created_at else None
    }


@admin_router.post("/kyc/{kyc_id}/review")
async def review_kyc(
    kyc_id: int,
    action: KYCReviewAction,
    admin: AdminModel = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """Approve or reject KYC"""
    kyc = db.query(KYCDetailsModel).filter(KYCDetailsModel.id == kyc_id).first()
    if not kyc:
        raise HTTPException(status_code=404, detail="KYC record not found")
    
    if action.action == "approve":
        kyc.verification_status = "verified"
        kyc.verified_at = datetime.now(timezone.utc)
        
        # Update user KYC status
        user = db.query(UserModel).filter(UserModel.id == kyc.user_id).first()
        if user:
            user.is_kyc_completed = 1
        
        log_admin_action(db, admin.id, "approve_kyc", "kyc", str(kyc_id), f"Approved KYC for user {kyc.user_id}")
        
    elif action.action == "reject":
        kyc.verification_status = "rejected"
        log_admin_action(db, admin.id, "reject_kyc", "kyc", str(kyc_id), f"Rejected KYC for user {kyc.user_id}: {action.reason}")
    
    kyc.updated_at = datetime.now(timezone.utc)
    db.commit()
    
    return {"message": f"KYC {action.action}d successfully"}


# =============================
# Booking Management
# =============================
@admin_router.get("/bookings", response_model=List[BookingListItem])
async def list_bookings(
    service_type: Optional[str] = None,
    status: Optional[str] = None,
    page: int = 1,
    limit: int = 20,
    admin: AdminModel = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """List all bookings"""
    query = db.query(ServiceBookingModel)
    
    if service_type:
        query = query.filter(ServiceBookingModel.service_type == service_type)
    if status:
        query = query.filter(ServiceBookingModel.status == status)
    
    bookings = query.order_by(ServiceBookingModel.created_at.desc()).offset((page-1)*limit).limit(limit).all()
    
    result = []
    for b in bookings:
        user = db.query(UserModel).filter(UserModel.id == b.user_id).first() if b.user_id else None
        result.append(BookingListItem(
            id=b.id,
            user_id=b.user_id,
            user_email=user.email if user else "Guest",
            service_type=b.service_type,
            booking_ref=b.booking_ref,
            total_price=b.total_price,
            currency=b.currency,
            status=b.status,
            created_at=b.created_at
        ))
    
    return result


@admin_router.get("/bookings/{booking_id}")
async def get_booking_detail(
    booking_id: str,
    admin: AdminModel = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """Get detailed booking information"""
    booking = db.query(ServiceBookingModel).filter(ServiceBookingModel.id == booking_id).first()
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")
    
    user = db.query(UserModel).filter(UserModel.id == booking.user_id).first() if booking.user_id else None
    
    # Parse service JSON
    service_details = {}
    try:
        service_details = json.loads(booking.service_json)
    except:
        pass
    
    # Get related receipt
    receipt = db.query(PaymentReceiptModel).filter(
        PaymentReceiptModel.booking_ref == booking.booking_ref
    ).first()
    
    return {
        "id": booking.id,
        "user_id": booking.user_id,
        "user_email": user.email if user else "Guest",
        "service_type": booking.service_type,
        "booking_ref": booking.booking_ref,
        "total_price": booking.total_price,
        "currency": booking.currency,
        "status": booking.status,
        "service_details": service_details,
        "receipt_url": receipt.receipt_url if receipt else None,
        "created_at": booking.created_at.isoformat() if booking.created_at else None
    }


@admin_router.post("/bookings/{booking_id}/status")
async def update_booking_status(
    booking_id: str,
    status: str,
    admin: AdminModel = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """Update booking status"""
    booking = db.query(ServiceBookingModel).filter(ServiceBookingModel.id == booking_id).first()
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")
    
    old_status = booking.status
    booking.status = status
    db.commit()
    
    log_admin_action(db, admin.id, "update_booking_status", "booking", booking_id, 
                     f"Changed status from {old_status} to {status}")
    
    return {"message": f"Booking status updated to {status}"}


@admin_router.post("/bookings/{booking_id}/cancel")
async def cancel_booking(
    booking_id: str,
    admin: AdminModel = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """Cancel a booking"""
    booking = db.query(ServiceBookingModel).filter(ServiceBookingModel.id == booking_id).first()
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")
    
    booking.status = "Cancelled"
    db.commit()
    
    log_admin_action(db, admin.id, "cancel_booking", "booking", booking_id, 
                     f"Cancelled booking {booking.booking_ref}")
    
    return {"message": "Booking cancelled successfully"}


# =============================
# Transaction Management
# =============================
@admin_router.get("/transactions", response_model=List[TransactionListItem])
async def list_transactions(
    status: Optional[str] = None,
    payment_method: Optional[str] = None,
    page: int = 1,
    limit: int = 20,
    admin: AdminModel = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """List all transactions"""
    query = db.query(TransactionModel)
    
    if status:
        query = query.filter(TransactionModel.status == status)
    if payment_method:
        query = query.filter(TransactionModel.payment_method.contains(payment_method))
    
    transactions = query.order_by(TransactionModel.created_at.desc()).offset((page-1)*limit).limit(limit).all()
    
    result = []
    for t in transactions:
        user = db.query(UserModel).filter(UserModel.id == t.user_id).first()
        result.append(TransactionListItem(
            id=t.id,
            user_id=t.user_id,
            user_email=user.email if user else "N/A",
            booking_id=t.booking_id,
            service_type=t.service_type,
            amount=t.amount,
            currency=t.currency,
            payment_method=t.payment_method,
            status=t.status,
            created_at=t.created_at
        ))
    
    return result


# =============================
# Destination Management (CRUD)
# =============================
@admin_router.get("/destinations")
async def list_destinations(
    admin: AdminModel = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """List all destinations"""
    destinations = db.query(DestinationModel).order_by(DestinationModel.created_at.desc()).all()
    return [
        {
            "id": d.id,
            "name": d.name,
            "description": d.description,
            "category": d.category,
            "country": d.country,
            "state": d.state,
            "city": d.city,
            "image_url": d.image_url,
            "is_active": d.is_active,
            "created_at": d.created_at.isoformat() if d.created_at else None
        } for d in destinations
    ]


@admin_router.post("/destinations")
async def create_destination(
    data: DestinationCreate,
    admin: AdminModel = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """Create a new destination"""
    destination = DestinationModel(
        name=data.name,
        description=data.description,
        category=data.category,
        country=data.country,
        state=data.state,
        city=data.city,
        image_url=data.image_url,
        latitude=data.latitude,
        longitude=data.longitude,
        is_active=data.is_active
    )
    db.add(destination)
    db.commit()
    db.refresh(destination)
    
    log_admin_action(db, admin.id, "create_destination", "destination", str(destination.id), 
                     f"Created destination: {data.name}")
    
    return {"message": "Destination created", "id": destination.id}


@admin_router.put("/destinations/{dest_id}")
async def update_destination(
    dest_id: int,
    data: DestinationUpdate,
    admin: AdminModel = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """Update a destination"""
    destination = db.query(DestinationModel).filter(DestinationModel.id == dest_id).first()
    if not destination:
        raise HTTPException(status_code=404, detail="Destination not found")
    
    if data.name is not None:
        destination.name = data.name
    if data.description is not None:
        destination.description = data.description
    if data.category is not None:
        destination.category = data.category
    if data.country is not None:
        destination.country = data.country
    if data.state is not None:
        destination.state = data.state
    if data.city is not None:
        destination.city = data.city
    if data.image_url is not None:
        destination.image_url = data.image_url
    if data.latitude is not None:
        destination.latitude = data.latitude
    if data.longitude is not None:
        destination.longitude = data.longitude
    if data.is_active is not None:
        destination.is_active = data.is_active
    
    destination.updated_at = datetime.now(timezone.utc)
    db.commit()
    
    log_admin_action(db, admin.id, "update_destination", "destination", str(dest_id), 
                     f"Updated destination: {destination.name}")
    
    return {"message": "Destination updated"}


@admin_router.delete("/destinations/{dest_id}")
async def delete_destination(
    dest_id: int,
    admin: AdminModel = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """Delete a destination"""
    destination = db.query(DestinationModel).filter(DestinationModel.id == dest_id).first()
    if not destination:
        raise HTTPException(status_code=404, detail="Destination not found")
    
    name = destination.name
    db.delete(destination)
    db.commit()
    
    log_admin_action(db, admin.id, "delete_destination", "destination", str(dest_id), 
                     f"Deleted destination: {name}")
    
    return {"message": "Destination deleted"}


# =============================
# Notifications Management
# =============================
@admin_router.post("/notifications")
async def send_notification(
    data: NotificationCreate,
    admin: AdminModel = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """Send notification to users"""
    notification_data = {
        "type": "notification",
        "title": data.title,
        "message": data.message,
        "notification_type": data.notification_type,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    
    if data.user_id:
        # Send to specific user
        notification = NotificationModel(
            user_id=data.user_id,
            admin_id=admin.id,
            title=data.title,
            message=data.message,
            notification_type=data.notification_type
        )
        db.add(notification)
        db.commit()
        
        # Send real-time notification via WebSocket
        notification_data["id"] = notification.id
        await notification_manager.send_to_user(data.user_id, notification_data)
        count = 1
    else:
        # Send to all users
        users = db.query(UserModel).all()
        count = 0
        user_ids = []
        for user in users:
            notification = NotificationModel(
                user_id=user.id,
                admin_id=admin.id,
                title=data.title,
                message=data.message,
                notification_type=data.notification_type
            )
            db.add(notification)
            user_ids.append(user.id)
            count += 1
        
        db.commit()
        
        # Broadcast to all connected users
        await notification_manager.broadcast_to_all(notification_data)
    
    log_admin_action(db, admin.id, "send_notification", "notification", None, 
                     f"Sent notification to {count} user(s): {data.title}")
    
    return {"message": f"Notification sent to {count} user(s)"}


@admin_router.get("/notifications")
async def list_notifications(
    page: int = 1,
    limit: int = 50,
    admin: AdminModel = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """List sent notifications"""
    notifications = db.query(NotificationModel).order_by(
        NotificationModel.created_at.desc()
    ).offset((page-1)*limit).limit(limit).all()
    
    return [
        {
            "id": n.id,
            "user_id": n.user_id,
            "title": n.title,
            "message": n.message,
            "notification_type": n.notification_type,
            "is_read": n.is_read,
            "created_at": n.created_at.isoformat() if n.created_at else None
        } for n in notifications
    ]


# =============================
# Reports & Logs
# =============================
@admin_router.get("/reports/bookings")
async def booking_report(
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    admin: AdminModel = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """Get booking report"""
    query = db.query(ServiceBookingModel)
    
    if start_date:
        query = query.filter(ServiceBookingModel.created_at >= start_date)
    if end_date:
        query = query.filter(ServiceBookingModel.created_at <= end_date)
    
    total = query.count()
    by_type = {}
    by_status = {}
    total_revenue = 0
    
    bookings = query.all()
    for b in bookings:
        by_type[b.service_type] = by_type.get(b.service_type, 0) + 1
        by_status[b.status] = by_status.get(b.status, 0) + 1
        if b.status in ["Confirmed", "Paid", "Completed"]:
            total_revenue += b.total_price
    
    return {
        "total_bookings": total,
        "by_service_type": by_type,
        "by_status": by_status,
        "total_revenue": total_revenue
    }


@admin_router.get("/reports/users")
async def user_report(
    admin: AdminModel = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """Get user growth report"""
    total_users = db.query(UserModel).count()
    kyc_completed = db.query(UserModel).filter(UserModel.is_kyc_completed == 1).count()
    
    # Users by month (last 6 months)
    users_by_month = []
    for i in range(6):
        month_start = datetime.now(timezone.utc).replace(day=1) - timedelta(days=30*i)
        month_end = month_start + timedelta(days=30)
        count = db.query(UserModel).filter(
            UserModel.created_at >= month_start,
            UserModel.created_at < month_end
        ).count()
        users_by_month.append({
            "month": month_start.strftime("%Y-%m"),
            "count": count
        })
    
    return {
        "total_users": total_users,
        "kyc_completed": kyc_completed,
        "kyc_pending": total_users - kyc_completed,
        "users_by_month": list(reversed(users_by_month))
    }


@admin_router.get("/audit-logs", response_model=List[AuditLogItem])
async def get_audit_logs(
    page: int = 1,
    limit: int = 50,
    action: Optional[str] = None,
    admin: AdminModel = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """Get admin audit logs"""
    query = db.query(AuditLogModel)
    
    if action:
        query = query.filter(AuditLogModel.action.contains(action))
    
    logs = query.order_by(AuditLogModel.created_at.desc()).offset((page-1)*limit).limit(limit).all()
    
    result = []
    for log in logs:
        admin_user = db.query(AdminModel).filter(AdminModel.id == log.admin_id).first() if log.admin_id else None
        result.append(AuditLogItem(
            id=log.id,
            admin_id=log.admin_id,
            admin_email=admin_user.email if admin_user else "System",
            action=log.action,
            entity_type=log.entity_type,
            entity_id=log.entity_id,
            details=log.details,
            ip_address=log.ip_address,
            created_at=log.created_at
        ))
    
    return result


# =============================
# Platform Settings
# =============================
@admin_router.get("/settings")
async def get_platform_settings(
    admin: AdminModel = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """Get platform settings"""
    settings = db.query(PlatformSettingModel).all()
    return {s.setting_key: s.setting_value for s in settings}


@admin_router.put("/settings")
async def update_platform_settings(
    data: PlatformSettingUpdate,
    admin: AdminModel = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """Update platform settings"""
    if data.maintenance_mode is not None:
        setting = db.query(PlatformSettingModel).filter(
            PlatformSettingModel.setting_key == "maintenance_mode"
        ).first()
        if setting:
            setting.setting_value = str(data.maintenance_mode).lower()
            setting.updated_by = admin.id
            setting.updated_at = datetime.now(timezone.utc)
    
    if data.bookings_enabled is not None:
        setting = db.query(PlatformSettingModel).filter(
            PlatformSettingModel.setting_key == "bookings_enabled"
        ).first()
        if setting:
            setting.setting_value = str(data.bookings_enabled).lower()
            setting.updated_by = admin.id
            setting.updated_at = datetime.now(timezone.utc)
    
    if data.new_user_registration is not None:
        setting = db.query(PlatformSettingModel).filter(
            PlatformSettingModel.setting_key == "new_user_registration"
        ).first()
        if setting:
            setting.setting_value = str(data.new_user_registration).lower()
            setting.updated_by = admin.id
            setting.updated_at = datetime.now(timezone.utc)
    
    db.commit()
    
    log_admin_action(db, admin.id, "update_settings", "settings", None, "Updated platform settings")
    
    return {"message": "Settings updated"}


# =============================
# Receipts & Tickets
# =============================
@admin_router.get("/receipts")
async def list_receipts(
    page: int = 1,
    limit: int = 20,
    admin: AdminModel = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """List all payment receipts"""
    receipts = db.query(PaymentReceiptModel).order_by(
        PaymentReceiptModel.created_at.desc()
    ).offset((page-1)*limit).limit(limit).all()
    
    return [
        {
            "id": r.id,
            "booking_ref": r.booking_ref,
            "full_name": r.full_name,
            "email": r.email,
            "amount": r.amount,
            "payment_method": r.payment_method,
            "receipt_url": r.receipt_url,
            "created_at": r.created_at.isoformat() if r.created_at else None
        } for r in receipts
    ]


# =============================
# Bus Booking API Router
# =============================
bus_router = APIRouter(prefix="/api/bus", tags=["bus"])


def generate_pnr():
    """Generate a unique PNR number"""
    import random
    import string
    prefix = "WL"
    chars = ''.join(random.choices(string.ascii_uppercase + string.digits, k=8))
    return f"{prefix}{chars}"


# Cities endpoints
@bus_router.get("/cities")
async def get_bus_cities(
    search: Optional[str] = None,
    db: Session = Depends(get_db)
):
    """Get list of bus cities"""
    query = db.query(BusCityModel).filter(BusCityModel.is_active == 1)
    if search:
        query = query.filter(BusCityModel.name.ilike(f"%{search}%"))
    cities = query.order_by(BusCityModel.name).all()
    return [{"id": c.id, "name": c.name, "state": c.state} for c in cities]


# Search buses
@bus_router.post("/search")
async def search_buses(
    request: BusSearchRequest,
    db: Session = Depends(get_db)
):
    """Search available buses for a route and date"""
    # Find the route
    route = db.query(BusRouteModel).filter(
        BusRouteModel.from_city_id == request.from_city_id,
        BusRouteModel.to_city_id == request.to_city_id,
        BusRouteModel.is_active == 1
    ).first()
    
    if not route:
        return {"buses": [], "message": "No routes found"}
    
    # Get day of week (0=Monday, 6=Sunday) for Python, but also check 1-7 format
    from datetime import datetime as dt
    journey_dt = dt.strptime(request.journey_date, "%Y-%m-%d")
    day_of_week = journey_dt.weekday()  # 0-6
    day_of_week_1based = day_of_week + 1  # 1-7 format
    
    # Find schedules for this route on the selected day (check both formats)
    schedules = db.query(BusScheduleModel).filter(
        BusScheduleModel.route_id == route.id,
        BusScheduleModel.is_active == 1
    ).filter(
        (BusScheduleModel.days_of_week.contains(str(day_of_week))) | 
        (BusScheduleModel.days_of_week.contains(str(day_of_week_1based)))
    ).all()
    
    results = []
    from_city = db.query(BusCityModel).filter(BusCityModel.id == request.from_city_id).first()
    to_city = db.query(BusCityModel).filter(BusCityModel.id == request.to_city_id).first()
    
    for schedule in schedules:
        bus = db.query(BusModel).filter(BusModel.id == schedule.bus_id).first()
        operator = db.query(BusOperatorModel).filter(BusOperatorModel.id == bus.operator_id).first()
        
        # Count available seats
        total_seats = db.query(BusSeatModel).filter(BusSeatModel.bus_id == bus.id, BusSeatModel.is_active == 1).count()
        booked_seats = db.query(BusSeatAvailabilityModel).filter(
            BusSeatAvailabilityModel.schedule_id == schedule.id,
            BusSeatAvailabilityModel.journey_date == request.journey_date,
            BusSeatAvailabilityModel.status.in_(["booked", "locked"])
        ).count()
        available_seats = total_seats - booked_seats
        
        # Get boarding points
        boarding_points = db.query(BusBoardingPointModel).filter(
            BusBoardingPointModel.schedule_id == schedule.id,
            BusBoardingPointModel.point_type == "boarding",
            BusBoardingPointModel.is_active == 1
        ).all()
        
        dropping_points = db.query(BusBoardingPointModel).filter(
            BusBoardingPointModel.schedule_id == schedule.id,
            BusBoardingPointModel.point_type == "dropping",
            BusBoardingPointModel.is_active == 1
        ).all()
        
        results.append({
            "schedule_id": schedule.id,
            "bus_id": bus.id,
            "operator_name": operator.name,
            "operator_logo": operator.logo_url,
            "operator_rating": operator.rating,
            "bus_type": bus.bus_type,
            "bus_number": bus.bus_number,
            "seat_layout": bus.seat_layout,
            "has_upper_deck": bus.has_upper_deck,
            "departure_time": schedule.departure_time,
            "arrival_time": schedule.arrival_time,
            "duration_mins": schedule.duration_mins,
            "is_night_bus": schedule.is_night_bus,
            "next_day_arrival": schedule.next_day_arrival,
            "base_price": schedule.base_price,
            "available_seats": available_seats,
            "total_seats": total_seats,
            "amenities": json.loads(bus.amenities) if bus.amenities else [],
            "cancellation_policy": operator.cancellation_policy,
            "boarding_points": [{"id": bp.id, "name": bp.point_name, "time": bp.time, "address": bp.address} for bp in boarding_points],
            "dropping_points": [{"id": dp.id, "name": dp.point_name, "time": dp.time, "address": dp.address} for dp in dropping_points],
            "from_city": from_city.name if from_city else "",
            "to_city": to_city.name if to_city else ""
        })
    
    return {"buses": results, "total": len(results)}


# Get seat layout for a bus
@bus_router.get("/seats/{schedule_id}/{journey_date}")
async def get_seat_layout(
    schedule_id: int,
    journey_date: str,
    db: Session = Depends(get_db)
):
    """Get seat layout and availability for a schedule"""
    try:
        schedule = db.query(BusScheduleModel).filter(BusScheduleModel.id == schedule_id).first()
        if not schedule:
            raise HTTPException(status_code=404, detail="Schedule not found")
        
        bus = db.query(BusModel).filter(BusModel.id == schedule.bus_id).first()
        if not bus:
            raise HTTPException(status_code=404, detail="Bus not found")
            
        seats = db.query(BusSeatModel).filter(BusSeatModel.bus_id == bus.id, BusSeatModel.is_active == 1).all()
        
        seat_data = []
        for seat in seats:
            # Check availability
            availability = db.query(BusSeatAvailabilityModel).filter(
                BusSeatAvailabilityModel.schedule_id == schedule_id,
                BusSeatAvailabilityModel.seat_id == seat.id,
                BusSeatAvailabilityModel.journey_date == journey_date
            ).first()
            
            status = "available"
            if availability:
                if availability.status == "booked":
                    status = "booked"
                elif availability.status == "locked":
                    # Check if lock expired
                    if availability.locked_until:
                        # Handle both naive and aware datetimes
                        lock_time = availability.locked_until
                        now = datetime.now()
                        if lock_time.tzinfo is not None:
                            now = datetime.now(timezone.utc)
                        if lock_time > now:
                            status = "locked"
                        else:
                            status = "available"
                    else:
                        status = "available"
                elif availability.status == "blocked":
                    status = "blocked"
            
            seat_data.append({
                "id": seat.id,
                "seat_number": seat.seat_number,
                "seat_type": seat.seat_type,
                "deck": seat.deck,
                "row": seat.row_number,
                "column": seat.column_number,
                "position": seat.position,
                "price_modifier": float(seat.price_modifier) if seat.price_modifier else 0.0,
                "is_female_only": seat.is_female_only,
                "status": status,
                "price": float(schedule.base_price) + (float(seat.price_modifier) if seat.price_modifier else 0.0)
            })
        
        return {
            "bus_type": bus.bus_type,
            "seat_layout": bus.seat_layout,
            "has_upper_deck": bus.has_upper_deck,
            "total_seats": len(seats),
            "base_price": float(schedule.base_price),
            "seats": seat_data
        }
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error in get_seat_layout: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


# Lock seats temporarily
@bus_router.post("/seats/lock")
async def lock_seats(
    request: BusSeatLockRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Temporarily lock selected seats for 5 minutes"""
    locked_seats = []
    lock_until = datetime.now(timezone.utc) + timedelta(minutes=5)
    
    for seat_id in request.seat_ids:
        # Check if seat is available
        existing = db.query(BusSeatAvailabilityModel).filter(
            BusSeatAvailabilityModel.schedule_id == request.schedule_id,
            BusSeatAvailabilityModel.seat_id == seat_id,
            BusSeatAvailabilityModel.journey_date == request.journey_date
        ).first()
        
        if existing:
            if existing.status == "booked":
                raise HTTPException(status_code=400, detail=f"Seat already booked")
            elif existing.status == "locked" and existing.locked_until > datetime.now(timezone.utc):
                if existing.locked_by != current_user.id:
                    raise HTTPException(status_code=400, detail=f"Seat is temporarily unavailable")
            # Update lock
            existing.status = "locked"
            existing.locked_by = current_user.id
            existing.locked_until = lock_until
        else:
            # Create new lock
            availability = BusSeatAvailabilityModel(
                schedule_id=request.schedule_id,
                seat_id=seat_id,
                journey_date=request.journey_date,
                status="locked",
                locked_by=current_user.id,
                locked_until=lock_until
            )
            db.add(availability)
        
        locked_seats.append(seat_id)
    
    db.commit()
    return {"locked_seats": locked_seats, "expires_at": lock_until.isoformat()}


# Create booking
@bus_router.post("/book")
async def create_bus_booking(
    booking: BusBookingCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Create a bus booking"""
    schedule = db.query(BusScheduleModel).filter(BusScheduleModel.id == booking.schedule_id).first()
    if not schedule:
        raise HTTPException(status_code=404, detail="Schedule not found")
    
    bus = db.query(BusModel).filter(BusModel.id == schedule.bus_id).first()
    operator = db.query(BusOperatorModel).filter(BusOperatorModel.id == bus.operator_id).first()
    route = db.query(BusRouteModel).filter(BusRouteModel.id == schedule.route_id).first()
    
    # Calculate total amount
    total_amount = 0
    for passenger in booking.passengers:
        seat = db.query(BusSeatModel).filter(BusSeatModel.id == passenger.seat_id).first()
        if not seat:
            raise HTTPException(status_code=400, detail=f"Invalid seat ID: {passenger.seat_id}")
        seat_price = schedule.base_price + seat.price_modifier
        total_amount += seat_price
    
    # Generate PNR
    pnr = generate_pnr()
    
    # Create booking
    new_booking = BusBookingModel(
        user_id=current_user.id,
        schedule_id=booking.schedule_id,
        journey_date=booking.journey_date,
        pnr=pnr,
        booking_status="confirmed",
        total_amount=total_amount,
        discount_amount=0,
        final_amount=total_amount,
        payment_status="paid",  # Mock payment
        payment_method=booking.payment_method,
        transaction_id=f"TXN{uuid.uuid4().hex[:12].upper()}",
        boarding_point_id=booking.boarding_point_id,
        dropping_point_id=booking.dropping_point_id,
        contact_name=booking.contact_name,
        contact_email=booking.contact_email,
        contact_phone=booking.contact_phone
    )
    db.add(new_booking)
    db.flush()
    
    # Create passengers and mark seats as booked
    for passenger in booking.passengers:
        seat = db.query(BusSeatModel).filter(BusSeatModel.id == passenger.seat_id).first()
        seat_price = schedule.base_price + seat.price_modifier
        
        # Create passenger record
        new_passenger = BusPassengerModel(
            booking_id=new_booking.id,
            seat_id=passenger.seat_id,
            name=passenger.name,
            age=passenger.age,
            gender=passenger.gender,
            id_type=passenger.id_type,
            id_number=passenger.id_number,
            seat_price=seat_price
        )
        db.add(new_passenger)
        
        # Update seat availability
        availability = db.query(BusSeatAvailabilityModel).filter(
            BusSeatAvailabilityModel.schedule_id == booking.schedule_id,
            BusSeatAvailabilityModel.seat_id == passenger.seat_id,
            BusSeatAvailabilityModel.journey_date == booking.journey_date
        ).first()
        
        if availability:
            availability.status = "booked"
            availability.booking_id = new_booking.id
            availability.locked_by = None
            availability.locked_until = None
        else:
            new_availability = BusSeatAvailabilityModel(
                schedule_id=booking.schedule_id,
                seat_id=passenger.seat_id,
                journey_date=booking.journey_date,
                status="booked",
                booking_id=new_booking.id
            )
            db.add(new_availability)
    
    db.commit()
    
    return {"booking_id": new_booking.id, "pnr": pnr, "message": "Booking confirmed"}


# Get booking details / ticket
@bus_router.get("/booking/{booking_id}")
async def get_bus_booking(
    booking_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get bus booking details"""
    booking = db.query(BusBookingModel).filter(
        BusBookingModel.id == booking_id,
        BusBookingModel.user_id == current_user.id
    ).first()
    
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")
    
    schedule = db.query(BusScheduleModel).filter(BusScheduleModel.id == booking.schedule_id).first()
    bus = db.query(BusModel).filter(BusModel.id == schedule.bus_id).first()
    operator = db.query(BusOperatorModel).filter(BusOperatorModel.id == bus.operator_id).first()
    route = db.query(BusRouteModel).filter(BusRouteModel.id == schedule.route_id).first()
    from_city = db.query(BusCityModel).filter(BusCityModel.id == route.from_city_id).first()
    to_city = db.query(BusCityModel).filter(BusCityModel.id == route.to_city_id).first()
    
    boarding_point = db.query(BusBoardingPointModel).filter(BusBoardingPointModel.id == booking.boarding_point_id).first()
    dropping_point = db.query(BusBoardingPointModel).filter(BusBoardingPointModel.id == booking.dropping_point_id).first()
    
    passengers = db.query(BusPassengerModel).filter(BusPassengerModel.booking_id == booking.id).all()
    passenger_list = []
    for p in passengers:
        seat = db.query(BusSeatModel).filter(BusSeatModel.id == p.seat_id).first()
        passenger_list.append({
            "name": p.name,
            "age": p.age,
            "gender": p.gender,
            "seat_number": seat.seat_number if seat else "",
            "seat_type": seat.seat_type if seat else "",
            "seat_price": p.seat_price
        })
    
    return {
        "id": booking.id,
        "pnr": booking.pnr,
        "booking_status": booking.booking_status,
        "journey_date": booking.journey_date,
        "total_amount": booking.total_amount,
        "discount_amount": booking.discount_amount,
        "final_amount": booking.final_amount,
        "payment_status": booking.payment_status,
        "payment_method": booking.payment_method,
        "transaction_id": booking.transaction_id,
        "operator_name": operator.name,
        "operator_logo": operator.logo_url,
        "operator_rating": operator.rating,
        "bus_type": bus.bus_type,
        "bus_number": bus.bus_number,
        "from_city": from_city.name,
        "to_city": to_city.name,
        "departure_time": schedule.departure_time,
        "arrival_time": schedule.arrival_time,
        "duration_mins": schedule.duration_mins,
        "is_night_bus": schedule.is_night_bus,
        "next_day_arrival": schedule.next_day_arrival,
        "boarding_point": boarding_point.point_name if boarding_point else "",
        "boarding_time": boarding_point.time if boarding_point else "",
        "boarding_address": boarding_point.address if boarding_point else "",
        "dropping_point": dropping_point.point_name if dropping_point else "",
        "dropping_time": dropping_point.time if dropping_point else "",
        "dropping_address": dropping_point.address if dropping_point else "",
        "passengers": passenger_list,
        "contact_name": booking.contact_name,
        "contact_email": booking.contact_email,
        "contact_phone": booking.contact_phone,
        "amenities": json.loads(bus.amenities) if bus.amenities else [],
        "cancellation_policy": operator.cancellation_policy,
        "created_at": booking.created_at.isoformat() if booking.created_at else None
    }


# Get user's bus bookings
@bus_router.get("/my-bookings")
async def get_my_bus_bookings(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get all bus bookings for current user"""
    bookings = db.query(BusBookingModel).filter(
        BusBookingModel.user_id == current_user.id
    ).order_by(BusBookingModel.created_at.desc()).all()
    
    results = []
    for booking in bookings:
        schedule = db.query(BusScheduleModel).filter(BusScheduleModel.id == booking.schedule_id).first()
        bus = db.query(BusModel).filter(BusModel.id == schedule.bus_id).first()
        operator = db.query(BusOperatorModel).filter(BusOperatorModel.id == bus.operator_id).first()
        route = db.query(BusRouteModel).filter(BusRouteModel.id == schedule.route_id).first()
        from_city = db.query(BusCityModel).filter(BusCityModel.id == route.from_city_id).first()
        to_city = db.query(BusCityModel).filter(BusCityModel.id == route.to_city_id).first()
        
        passengers = db.query(BusPassengerModel).filter(BusPassengerModel.booking_id == booking.id).all()
        
        results.append({
            "id": booking.id,
            "pnr": booking.pnr,
            "booking_status": booking.booking_status,
            "journey_date": booking.journey_date,
            "final_amount": booking.final_amount,
            "operator_name": operator.name,
            "bus_type": bus.bus_type,
            "from_city": from_city.name,
            "to_city": to_city.name,
            "departure_time": schedule.departure_time,
            "passenger_count": len(passengers),
            "created_at": booking.created_at.isoformat() if booking.created_at else None
        })
    
    return results


# Cancel booking
@bus_router.post("/cancel")
async def cancel_bus_booking(
    request: BusCancellationRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Cancel a bus booking"""
    booking = db.query(BusBookingModel).filter(
        BusBookingModel.id == request.booking_id,
        BusBookingModel.user_id == current_user.id
    ).first()
    
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")
    
    if booking.booking_status == "cancelled":
        raise HTTPException(status_code=400, detail="Booking already cancelled")
    
    if booking.booking_status == "completed":
        raise HTTPException(status_code=400, detail="Cannot cancel completed journey")
    
    schedule = db.query(BusScheduleModel).filter(BusScheduleModel.id == booking.schedule_id).first()
    
    # Calculate refund based on time before departure
    from datetime import datetime as dt
    journey_dt = dt.strptime(f"{booking.journey_date} {schedule.departure_time}", "%Y-%m-%d %H:%M")
    now = dt.now()
    hours_before = (journey_dt - now).total_seconds() / 3600
    
    refund_percentage = 0
    if hours_before > 24:
        refund_percentage = 90
    elif hours_before > 12:
        refund_percentage = 50
    elif hours_before > 6:
        refund_percentage = 25
    # No refund if less than 6 hours
    
    refund_amount = (booking.final_amount * refund_percentage) / 100
    
    # Update booking
    booking.booking_status = "cancelled"
    booking.cancelled_at = datetime.now(timezone.utc)
    booking.refund_amount = refund_amount
    booking.refund_status = "processed" if refund_amount > 0 else "no_refund"
    
    # Release seats
    passengers = db.query(BusPassengerModel).filter(BusPassengerModel.booking_id == booking.id).all()
    for passenger in passengers:
        availability = db.query(BusSeatAvailabilityModel).filter(
            BusSeatAvailabilityModel.booking_id == booking.id,
            BusSeatAvailabilityModel.seat_id == passenger.seat_id
        ).first()
        if availability:
            db.delete(availability)
    
    db.commit()
    
    return {
        "message": "Booking cancelled",
        "refund_percentage": refund_percentage,
        "refund_amount": refund_amount,
        "refund_status": booking.refund_status
    }


# Get live tracking
@bus_router.get("/tracking/{booking_id}")
async def get_bus_tracking(
    booking_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get live tracking for a booked bus"""
    booking = db.query(BusBookingModel).filter(
        BusBookingModel.id == booking_id,
        BusBookingModel.user_id == current_user.id
    ).first()
    
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")
    
    if booking.booking_status != "confirmed":
        raise HTTPException(status_code=400, detail="Tracking only available for confirmed bookings")
    
    tracking = db.query(BusLiveTrackingModel).filter(
        BusLiveTrackingModel.schedule_id == booking.schedule_id,
        BusLiveTrackingModel.journey_date == booking.journey_date
    ).first()
    
    if not tracking:
        return {
            "status": "not_started",
            "message": "Bus tracking will be available once the journey starts"
        }
    
    return {
        "status": tracking.status,
        "latitude": tracking.current_latitude,
        "longitude": tracking.current_longitude,
        "speed_kmph": tracking.speed_kmph,
        "eta_mins": tracking.eta_mins,
        "last_updated": tracking.last_updated.isoformat() if tracking.last_updated else None
    }


# Register bus router
app.include_router(bus_router)


# =============================
# Flight Booking Router (Advanced MakeMyTrip-style)
# =============================
flight_router = APIRouter(prefix="/api/flight", tags=["Flights"])


def generate_pnr_flight():
    """Generate a 6-character alphanumeric PNR"""
    import random
    import string
    chars = string.ascii_uppercase + string.digits
    return ''.join(random.choices(chars, k=6))


def generate_booking_reference():
    """Generate booking reference"""
    import random
    return f"WL{random.randint(100000, 999999)}"


def generate_ticket_number():
    """Generate ticket number"""
    import random
    return f"{random.randint(100, 999)}-{random.randint(1000000000, 9999999999)}"


# Get all airports
@flight_router.get("/airports")
async def get_airports(db: Session = Depends(get_db)):
    """Get all active airports"""
    airports = db.query(AirportModel).filter(AirportModel.is_active == 1).order_by(AirportModel.city).all()
    return [
        {
            "id": a.id,
            "code": a.code,
            "name": a.name,
            "city": a.city,
            "country": a.country,
            "latitude": a.latitude,
            "longitude": a.longitude
        }
        for a in airports
    ]


# Get all airlines
@flight_router.get("/airlines")
async def get_airlines(db: Session = Depends(get_db)):
    """Get all active airlines"""
    airlines = db.query(AirlineModel).filter(AirlineModel.is_active == 1).order_by(AirlineModel.name).all()
    return [
        {
            "id": a.id,
            "code": a.code,
            "name": a.name,
            "logo_url": a.logo_url,
            "country": a.country
        }
        for a in airlines
    ]


# Search flights
@flight_router.post("/search")
async def search_flights(
    search: FlightSearchRequest,
    db: Session = Depends(get_db)
):
    """Search for available flights"""
    # Find origin airport(s) by code or city
    origin_airports = db.query(AirportModel).filter(
        (AirportModel.code == search.origin_code.upper()) |
        (AirportModel.city.ilike(f"%{search.origin_code}%"))
    ).all()
    
    if not origin_airports:
        raise HTTPException(status_code=404, detail="Origin airport/city not found")
    
    # Find destination airport(s)
    dest_airports = db.query(AirportModel).filter(
        (AirportModel.code == search.destination_code.upper()) |
        (AirportModel.city.ilike(f"%{search.destination_code}%"))
    ).all()
    
    if not dest_airports:
        raise HTTPException(status_code=404, detail="Destination airport/city not found")
    
    origin_ids = [a.id for a in origin_airports]
    dest_ids = [a.id for a in dest_airports]
    
    # Get day of week (1=Monday, 7=Sunday)
    from datetime import datetime as dt
    search_date = dt.strptime(search.departure_date, "%Y-%m-%d")
    day_of_week = search_date.isoweekday()
    
    # Find routes
    routes = db.query(FlightRouteModel).filter(
        FlightRouteModel.origin_airport_id.in_(origin_ids),
        FlightRouteModel.destination_airport_id.in_(dest_ids),
        FlightRouteModel.is_active == 1
    ).all()
    
    if not routes:
        return {"outbound": [], "return": []}
    
    route_ids = [r.id for r in routes]
    
    # Find flights operating on this day
    flights = db.query(FlightModel).filter(
        FlightModel.route_id.in_(route_ids),
        FlightModel.is_active == 1
    ).all()
    
    # Filter by day of week
    valid_flights = [f for f in flights if str(day_of_week) in f.days_of_week.split(',')]
    
    # Check for schedules on this date
    results = []
    for flight in valid_flights:
        schedule = db.query(FlightScheduleModel).filter(
            FlightScheduleModel.flight_id == flight.id,
            FlightScheduleModel.flight_date == search.departure_date
        ).first()
        
        # If no schedule exists yet, create one dynamically
        if not schedule:
            # Get route and aircraft info
            route = db.query(FlightRouteModel).filter(FlightRouteModel.id == flight.route_id).first()
            aircraft = db.query(AircraftModel).filter(AircraftModel.id == flight.aircraft_id).first()
            
            # Create departure and arrival datetime
            dep_hour, dep_min = map(int, flight.departure_time.split(':'))
            arr_hour, arr_min = map(int, flight.arrival_time.split(':'))
            
            dep_datetime = search_date.replace(hour=dep_hour, minute=dep_min)
            arr_datetime = search_date.replace(hour=arr_hour, minute=arr_min)
            if flight.is_overnight:
                arr_datetime = arr_datetime + timedelta(days=1)
            
            schedule = FlightScheduleModel(
                flight_id=flight.id,
                flight_date=search.departure_date,
                departure_datetime=dep_datetime,
                arrival_datetime=arr_datetime,
                status="scheduled",
                economy_price=flight.base_price_economy,
                business_price=flight.base_price_business,
                available_economy=aircraft.economy_seats if aircraft else 150,
                available_business=aircraft.business_seats if aircraft else 12,
                gate=f"G{random.randint(1, 30)}",
                terminal=f"T{random.randint(1, 3)}"
            )
            db.add(schedule)
            db.commit()
            db.refresh(schedule)
        
        # Get related info
        airline = db.query(AirlineModel).filter(AirlineModel.id == flight.airline_id).first()
        route = db.query(FlightRouteModel).filter(FlightRouteModel.id == flight.route_id).first()
        origin = db.query(AirportModel).filter(AirportModel.id == route.origin_airport_id).first()
        dest = db.query(AirportModel).filter(AirportModel.id == route.destination_airport_id).first()
        
        # Check availability based on class
        if search.seat_class == "economy" and schedule.available_economy < (search.passengers_adult + search.passengers_child):
            continue
        if search.seat_class == "business" and (schedule.available_business or 0) < (search.passengers_adult + search.passengers_child):
            continue
        
        results.append({
            "schedule_id": schedule.id,
            "flight_id": flight.id,
            "flight_number": flight.flight_number,
            "airline_id": airline.id,
            "airline_name": airline.name,
            "airline_code": airline.code,
            "airline_logo": airline.logo_url,
            "origin_code": origin.code,
            "origin_city": origin.city,
            "origin_airport": origin.name,
            "destination_code": dest.code,
            "destination_city": dest.city,
            "destination_airport": dest.name,
            "departure_time": flight.departure_time,
            "arrival_time": flight.arrival_time,
            "departure_datetime": schedule.departure_datetime.isoformat(),
            "arrival_datetime": schedule.arrival_datetime.isoformat(),
            "duration_mins": flight.duration_mins,
            "stops": flight.stops,
            "stop_airports": flight.stop_airports,
            "is_overnight": flight.is_overnight,
            "is_refundable": flight.is_refundable,
            "baggage_allowance": flight.baggage_allowance,
            "meal_included": flight.meal_included,
            "economy_price": schedule.economy_price,
            "business_price": schedule.business_price,
            "available_economy": schedule.available_economy,
            "available_business": schedule.available_business or 0,
            "gate": schedule.gate,
            "terminal": schedule.terminal,
            "status": schedule.status
        })
    
    # Sort by price
    results.sort(key=lambda x: x["economy_price"] if search.seat_class == "economy" else (x["business_price"] or 99999))
    
    response = {"outbound": results, "return": []}
    
    # Handle return flights for round trip
    if search.trip_type == "round_trip" and search.return_date:
        # Swap origin and destination for return search
        return_search = FlightSearchRequest(
            origin_code=search.destination_code,
            destination_code=search.origin_code,
            departure_date=search.return_date,
            trip_type="one_way",
            passengers_adult=search.passengers_adult,
            passengers_child=search.passengers_child,
            passengers_infant=search.passengers_infant,
            seat_class=search.seat_class
        )
        return_results = await search_flights(return_search, db)
        response["return"] = return_results.get("outbound", [])
    
    return response


# Get seat layout for a flight schedule
@flight_router.get("/seats/{schedule_id}")
async def get_flight_seats(
    schedule_id: int,
    seat_class: str = "economy",
    db: Session = Depends(get_db)
):
    """Get seat layout and availability for a flight schedule"""
    schedule = db.query(FlightScheduleModel).filter(FlightScheduleModel.id == schedule_id).first()
    if not schedule:
        raise HTTPException(status_code=404, detail="Schedule not found")
    
    flight = db.query(FlightModel).filter(FlightModel.id == schedule.flight_id).first()
    aircraft = db.query(AircraftModel).filter(AircraftModel.id == flight.aircraft_id).first()
    
    # Get seats for this aircraft
    seats = db.query(FlightSeatModel).filter(
        FlightSeatModel.aircraft_id == aircraft.id,
        FlightSeatModel.seat_class == seat_class,
        FlightSeatModel.is_active == 1
    ).order_by(FlightSeatModel.row_number, FlightSeatModel.column_letter).all()
    
    seat_data = []
    base_price = schedule.economy_price if seat_class == "economy" else (schedule.business_price or schedule.economy_price * 3)
    
    for seat in seats:
        # Check availability
        availability = db.query(FlightSeatAvailabilityModel).filter(
            FlightSeatAvailabilityModel.schedule_id == schedule_id,
            FlightSeatAvailabilityModel.seat_id == seat.id
        ).first()
        
        status = "available"
        if availability:
            if availability.status == "booked":
                status = "booked"
            elif availability.status == "locked":
                if availability.locked_until:
                    lock_time = availability.locked_until
                    now = datetime.now()
                    if lock_time > now:
                        status = "locked"
                    else:
                        status = "available"
            elif availability.status == "blocked":
                status = "blocked"
        
        seat_data.append({
            "id": seat.id,
            "seat_number": seat.seat_number,
            "seat_class": seat.seat_class,
            "seat_type": seat.seat_type,
            "row_number": seat.row_number,
            "column_letter": seat.column_letter,
            "is_extra_legroom": seat.is_extra_legroom,
            "is_emergency_exit": seat.is_emergency_exit,
            "price_modifier": seat.price_modifier,
            "status": status,
            "price": base_price + seat.price_modifier
        })
    
    return {
        "aircraft_model": aircraft.model,
        "seat_layout": aircraft.seat_layout,
        "seat_class": seat_class,
        "base_price": base_price,
        "total_seats": len(seats),
        "seats": seat_data
    }


# Lock seats temporarily
@flight_router.post("/seats/lock")
async def lock_flight_seats(
    request: FlightSeatLockRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Temporarily lock selected seats for 7 minutes"""
    locked_seats = []
    lock_until = datetime.now() + timedelta(minutes=7)
    
    for seat_id in request.seat_ids:
        existing = db.query(FlightSeatAvailabilityModel).filter(
            FlightSeatAvailabilityModel.schedule_id == request.schedule_id,
            FlightSeatAvailabilityModel.seat_id == seat_id
        ).first()
        
        if existing:
            if existing.status == "booked":
                raise HTTPException(status_code=400, detail=f"Seat already booked")
            elif existing.status == "locked" and existing.locked_until and existing.locked_until > datetime.now():
                if existing.locked_by != current_user.id:
                    raise HTTPException(status_code=400, detail=f"Seat is temporarily unavailable")
            existing.status = "locked"
            existing.locked_by = current_user.id
            existing.locked_until = lock_until
        else:
            availability = FlightSeatAvailabilityModel(
                schedule_id=request.schedule_id,
                seat_id=seat_id,
                status="locked",
                locked_by=current_user.id,
                locked_until=lock_until
            )
            db.add(availability)
        
        locked_seats.append(seat_id)
    
    db.commit()
    return {"locked_seats": locked_seats, "expires_at": lock_until.isoformat()}


# Create flight booking
@flight_router.post("/book")
async def create_flight_booking(
    booking: FlightBookingCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Create a flight booking"""
    pnr = generate_pnr_flight()
    booking_ref = generate_booking_reference()
    
    total_amount = 0
    
    # Validate all segments and calculate total
    for segment_data in booking.segments:
        schedule = db.query(FlightScheduleModel).filter(
            FlightScheduleModel.id == segment_data["schedule_id"]
        ).first()
        if not schedule:
            raise HTTPException(status_code=404, detail="Flight schedule not found")
        
        for passenger in segment_data["passengers"]:
            seat_class = passenger.get("seat_class", "economy")
            base_price = schedule.economy_price if seat_class == "economy" else (schedule.business_price or schedule.economy_price * 3)
            
            # Add seat price modifier if seat selected
            seat_modifier = 0
            if passenger.get("seat_id"):
                seat = db.query(FlightSeatModel).filter(FlightSeatModel.id == passenger["seat_id"]).first()
                if seat:
                    seat_modifier = seat.price_modifier
            
            # Pricing based on passenger type
            if passenger["passenger_type"] == "infant":
                total_amount += (base_price + seat_modifier) * 0.1  # 10% for infants
            elif passenger["passenger_type"] == "child":
                total_amount += (base_price + seat_modifier) * 0.75  # 75% for children
            else:
                total_amount += base_price + seat_modifier
    
    # Add taxes and fees (mock)
    taxes = total_amount * 0.12  # 12% taxes
    convenience_fee = 199
    final_amount = total_amount + taxes + convenience_fee
    
    # Create booking
    new_booking = FlightBookingModel(
        user_id=current_user.id,
        booking_reference=booking_ref,
        pnr=pnr,
        trip_type=booking.trip_type,
        booking_status="confirmed",
        total_amount=total_amount,
        discount_amount=0,
        final_amount=final_amount,
        payment_status="paid",
        payment_method=booking.payment_method,
        transaction_id=f"TXN{uuid.uuid4().hex[:12].upper()}",
        contact_name=booking.contact_name,
        contact_email=booking.contact_email,
        contact_phone=booking.contact_phone
    )
    db.add(new_booking)
    db.flush()
    
    # Create segments and passengers
    for idx, segment_data in enumerate(booking.segments):
        schedule = db.query(FlightScheduleModel).filter(
            FlightScheduleModel.id == segment_data["schedule_id"]
        ).first()
        
        segment_type = "outbound"
        if booking.trip_type == "round_trip" and idx == 1:
            segment_type = "return"
        elif booking.trip_type == "multi_city":
            segment_type = "multi_city"
        
        segment_pnr = generate_pnr_flight()
        
        segment = FlightSegmentModel(
            booking_id=new_booking.id,
            segment_order=idx + 1,
            schedule_id=segment_data["schedule_id"],
            segment_type=segment_type,
            segment_pnr=segment_pnr
        )
        db.add(segment)
        db.flush()
        
        # Create passengers for this segment
        for passenger in segment_data["passengers"]:
            seat_class = passenger.get("seat_class", "economy")
            base_price = schedule.economy_price if seat_class == "economy" else (schedule.business_price or schedule.economy_price * 3)
            
            seat_number = None
            if passenger.get("seat_id"):
                seat = db.query(FlightSeatModel).filter(FlightSeatModel.id == passenger["seat_id"]).first()
                if seat:
                    seat_number = seat.seat_number
                    base_price += seat.price_modifier
                    
                    # Mark seat as booked
                    availability = db.query(FlightSeatAvailabilityModel).filter(
                        FlightSeatAvailabilityModel.schedule_id == segment_data["schedule_id"],
                        FlightSeatAvailabilityModel.seat_id == passenger["seat_id"]
                    ).first()
                    
                    if availability:
                        availability.status = "booked"
                    else:
                        availability = FlightSeatAvailabilityModel(
                            schedule_id=segment_data["schedule_id"],
                            seat_id=passenger["seat_id"],
                            status="booked"
                        )
                        db.add(availability)
            
            # Calculate fare
            fare_amount = base_price
            if passenger["passenger_type"] == "infant":
                fare_amount = base_price * 0.1
            elif passenger["passenger_type"] == "child":
                fare_amount = base_price * 0.75
            
            new_passenger = FlightPassengerModel(
                booking_id=new_booking.id,
                segment_id=segment.id,
                seat_id=passenger.get("seat_id"),
                passenger_type=passenger["passenger_type"],
                title=passenger["title"],
                first_name=passenger["first_name"],
                last_name=passenger["last_name"],
                date_of_birth=passenger.get("date_of_birth"),
                gender=passenger["gender"],
                nationality=passenger.get("nationality"),
                passport_number=passenger.get("passport_number"),
                seat_number=seat_number,
                seat_class=seat_class,
                meal_preference=passenger.get("meal_preference"),
                special_assistance=passenger.get("special_assistance"),
                ticket_number=generate_ticket_number(),
                fare_amount=fare_amount
            )
            db.add(new_passenger)
        
        # Update available seats
        passenger_count = len([p for p in segment_data["passengers"] if p["passenger_type"] != "infant"])
        if seat_class == "economy":
            schedule.available_economy = max(0, schedule.available_economy - passenger_count)
        else:
            if schedule.available_business:
                schedule.available_business = max(0, schedule.available_business - passenger_count)
    
    db.commit()
    
    return {
        "booking_id": new_booking.id,
        "booking_reference": booking_ref,
        "pnr": pnr,
        "total_amount": total_amount,
        "taxes": taxes,
        "convenience_fee": convenience_fee,
        "final_amount": final_amount,
        "status": "confirmed"
    }


# Get booking details
@flight_router.get("/booking/{booking_id}")
async def get_flight_booking(
    booking_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get flight booking details"""
    booking = db.query(FlightBookingModel).filter(
        FlightBookingModel.id == booking_id,
        FlightBookingModel.user_id == current_user.id
    ).first()
    
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")
    
    # Get segments with flight details
    segments = db.query(FlightSegmentModel).filter(
        FlightSegmentModel.booking_id == booking.id
    ).order_by(FlightSegmentModel.segment_order).all()
    
    segment_data = []
    for segment in segments:
        schedule = db.query(FlightScheduleModel).filter(FlightScheduleModel.id == segment.schedule_id).first()
        flight = db.query(FlightModel).filter(FlightModel.id == schedule.flight_id).first()
        airline = db.query(AirlineModel).filter(AirlineModel.id == flight.airline_id).first()
        route = db.query(FlightRouteModel).filter(FlightRouteModel.id == flight.route_id).first()
        origin = db.query(AirportModel).filter(AirportModel.id == route.origin_airport_id).first()
        dest = db.query(AirportModel).filter(AirportModel.id == route.destination_airport_id).first()
        aircraft = db.query(AircraftModel).filter(AircraftModel.id == flight.aircraft_id).first()
        
        # Get passengers for this segment
        passengers = db.query(FlightPassengerModel).filter(
            FlightPassengerModel.segment_id == segment.id
        ).all()
        
        passenger_data = [{
            "id": p.id,
            "passenger_type": p.passenger_type,
            "title": p.title,
            "first_name": p.first_name,
            "last_name": p.last_name,
            "gender": p.gender,
            "seat_number": p.seat_number,
            "seat_class": p.seat_class,
            "ticket_number": p.ticket_number,
            "fare_amount": p.fare_amount
        } for p in passengers]
        
        segment_data.append({
            "segment_id": segment.id,
            "segment_order": segment.segment_order,
            "segment_type": segment.segment_type,
            "segment_pnr": segment.segment_pnr,
            "flight_number": flight.flight_number,
            "airline_name": airline.name,
            "airline_code": airline.code,
            "airline_logo": airline.logo_url,
            "aircraft_model": aircraft.model,
            "origin_code": origin.code,
            "origin_city": origin.city,
            "origin_airport": origin.name,
            "destination_code": dest.code,
            "destination_city": dest.city,
            "destination_airport": dest.name,
            "departure_time": flight.departure_time,
            "arrival_time": flight.arrival_time,
            "departure_datetime": schedule.departure_datetime.isoformat(),
            "arrival_datetime": schedule.arrival_datetime.isoformat(),
            "duration_mins": flight.duration_mins,
            "gate": schedule.gate,
            "terminal": schedule.terminal,
            "status": schedule.status,
            "passengers": passenger_data
        })
    
    return {
        "id": booking.id,
        "booking_reference": booking.booking_reference,
        "pnr": booking.pnr,
        "trip_type": booking.trip_type,
        "booking_status": booking.booking_status,
        "total_amount": booking.total_amount,
        "final_amount": booking.final_amount,
        "payment_status": booking.payment_status,
        "contact_name": booking.contact_name,
        "contact_email": booking.contact_email,
        "contact_phone": booking.contact_phone,
        "segments": segment_data,
        "created_at": booking.created_at.isoformat()
    }


# Get booking by reference (PNR or booking_reference)
@flight_router.get("/booking/ref/{ref}")
async def get_flight_booking_by_ref(
    ref: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get flight booking details by PNR or booking reference"""
    # Try to find by PNR first
    booking = db.query(FlightBookingModel).filter(
        FlightBookingModel.pnr == ref,
        FlightBookingModel.user_id == current_user.id
    ).first()
    
    # If not found, try booking reference
    if not booking:
        booking = db.query(FlightBookingModel).filter(
            FlightBookingModel.booking_reference == ref,
            FlightBookingModel.user_id == current_user.id
        ).first()
    
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")
    
    # Get segments with flight details
    segments = db.query(FlightSegmentModel).filter(
        FlightSegmentModel.booking_id == booking.id
    ).order_by(FlightSegmentModel.segment_order).all()
    
    segment_data = []
    for segment in segments:
        schedule = db.query(FlightScheduleModel).filter(FlightScheduleModel.id == segment.schedule_id).first()
        flight = db.query(FlightModel).filter(FlightModel.id == schedule.flight_id).first()
        airline = db.query(AirlineModel).filter(AirlineModel.id == flight.airline_id).first()
        route = db.query(FlightRouteModel).filter(FlightRouteModel.id == flight.route_id).first()
        origin = db.query(AirportModel).filter(AirportModel.id == route.origin_airport_id).first()
        dest = db.query(AirportModel).filter(AirportModel.id == route.destination_airport_id).first()
        aircraft = db.query(AircraftModel).filter(AircraftModel.id == flight.aircraft_id).first()
        
        # Get passengers for this segment
        passengers = db.query(FlightPassengerModel).filter(
            FlightPassengerModel.segment_id == segment.id
        ).all()
        
        passenger_data = [{
            "id": p.id,
            "passenger_type": p.passenger_type,
            "title": p.title,
            "first_name": p.first_name,
            "last_name": p.last_name,
            "gender": p.gender,
            "seat_number": p.seat_number,
            "seat_class": p.seat_class,
            "ticket_number": p.ticket_number,
            "fare_amount": p.fare_amount,
            "meal_preference": p.meal_preference
        } for p in passengers]
        
        segment_data.append({
            "segment_id": segment.id,
            "segment_order": segment.segment_order,
            "segment_type": segment.segment_type,
            "segment_pnr": segment.segment_pnr,
            "flight_number": flight.flight_number,
            "airline_name": airline.name,
            "airline_code": airline.code,
            "airline_logo": airline.logo_url,
            "aircraft_model": aircraft.model,
            "origin_code": origin.code,
            "origin_city": origin.city,
            "origin_airport": origin.name,
            "destination_code": dest.code,
            "destination_city": dest.city,
            "destination_airport": dest.name,
            "departure_time": flight.departure_time,
            "arrival_time": flight.arrival_time,
            "departure_datetime": schedule.departure_datetime.isoformat() if schedule.departure_datetime else None,
            "arrival_datetime": schedule.arrival_datetime.isoformat() if schedule.arrival_datetime else None,
            "departure_date": schedule.departure_datetime.strftime("%Y-%m-%d") if schedule.departure_datetime else None,
            "arrival_date": schedule.arrival_datetime.strftime("%Y-%m-%d") if schedule.arrival_datetime else None,
            "duration_mins": flight.duration_mins,
            "gate": schedule.gate,
            "terminal": schedule.terminal,
            "status": schedule.status,
            "passengers": passenger_data,
            "baggage": "15kg Cabin, 25kg Check-in"
        })
    
    return {
        "id": booking.id,
        "booking_reference": booking.booking_reference,
        "pnr": booking.pnr,
        "trip_type": booking.trip_type,
        "booking_status": booking.booking_status,
        "total_amount": booking.total_amount,
        "discount_amount": booking.discount_amount,
        "final_amount": booking.final_amount,
        "payment_status": booking.payment_status,
        "payment_method": booking.payment_method,
        "contact_name": booking.contact_name,
        "contact_email": booking.contact_email,
        "contact_phone": booking.contact_phone,
        "passengers": [p for seg in segment_data for p in seg["passengers"]],
        "segments": segment_data,
        "seat_class": segment_data[0]["passengers"][0]["seat_class"] if segment_data and segment_data[0]["passengers"] else "economy",
        "created_at": booking.created_at.isoformat()
    }


# Get user's flight bookings
@flight_router.get("/my-bookings")
async def get_my_flight_bookings(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get all flight bookings for the current user"""
    bookings = db.query(FlightBookingModel).filter(
        FlightBookingModel.user_id == current_user.id
    ).order_by(FlightBookingModel.created_at.desc()).all()
    
    result = []
    for booking in bookings:
        # Get first segment for summary
        segment = db.query(FlightSegmentModel).filter(
            FlightSegmentModel.booking_id == booking.id,
            FlightSegmentModel.segment_order == 1
        ).first()
        
        if segment:
            schedule = db.query(FlightScheduleModel).filter(FlightScheduleModel.id == segment.schedule_id).first()
            flight = db.query(FlightModel).filter(FlightModel.id == schedule.flight_id).first()
            airline = db.query(AirlineModel).filter(AirlineModel.id == flight.airline_id).first()
            route = db.query(FlightRouteModel).filter(FlightRouteModel.id == flight.route_id).first()
            origin = db.query(AirportModel).filter(AirportModel.id == route.origin_airport_id).first()
            dest = db.query(AirportModel).filter(AirportModel.id == route.destination_airport_id).first()
            
            passenger_count = db.query(FlightPassengerModel).filter(
                FlightPassengerModel.booking_id == booking.id
            ).count()
            
            result.append({
                "id": booking.id,
                "booking_reference": booking.booking_reference,
                "pnr": booking.pnr,
                "trip_type": booking.trip_type,
                "booking_status": booking.booking_status,
                "flight_number": flight.flight_number,
                "airline_name": airline.name,
                "airline_logo": airline.logo_url,
                "origin_code": origin.code,
                "origin_city": origin.city,
                "destination_code": dest.code,
                "destination_city": dest.city,
                "departure_datetime": schedule.departure_datetime.isoformat(),
                "final_amount": booking.final_amount,
                "passenger_count": passenger_count,
                "created_at": booking.created_at.isoformat()
            })
    
    return result


# Cancel flight booking
@flight_router.post("/cancel")
async def cancel_flight_booking(
    request: FlightCancellationRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Cancel a flight booking with refund calculation"""
    booking = db.query(FlightBookingModel).filter(
        FlightBookingModel.id == request.booking_id,
        FlightBookingModel.user_id == current_user.id
    ).first()
    
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")
    
    if booking.booking_status == "cancelled":
        raise HTTPException(status_code=400, detail="Booking already cancelled")
    
    # Get first segment to check departure time
    segment = db.query(FlightSegmentModel).filter(
        FlightSegmentModel.booking_id == booking.id,
        FlightSegmentModel.segment_order == 1
    ).first()
    
    schedule = db.query(FlightScheduleModel).filter(FlightScheduleModel.id == segment.schedule_id).first()
    
    # Calculate refund based on time to departure
    now = datetime.now()
    departure = schedule.departure_datetime
    hours_to_departure = (departure - now).total_seconds() / 3600
    
    refund_percentage = 0
    if hours_to_departure > 48:
        refund_percentage = 80
    elif hours_to_departure > 24:
        refund_percentage = 50
    elif hours_to_departure > 6:
        refund_percentage = 25
    
    refund_amount = booking.final_amount * refund_percentage / 100
    
    # Update booking status
    booking.booking_status = "cancelled"
    booking.cancelled_at = datetime.now()
    booking.refund_amount = refund_amount
    
    # Release seats
    segments = db.query(FlightSegmentModel).filter(FlightSegmentModel.booking_id == booking.id).all()
    for seg in segments:
        passengers = db.query(FlightPassengerModel).filter(FlightPassengerModel.segment_id == seg.id).all()
        for passenger in passengers:
            if passenger.seat_id:
                availability = db.query(FlightSeatAvailabilityModel).filter(
                    FlightSeatAvailabilityModel.schedule_id == seg.schedule_id,
                    FlightSeatAvailabilityModel.seat_id == passenger.seat_id
                ).first()
                if availability:
                    availability.status = "available"
                    availability.locked_by = None
                    availability.locked_until = None
        
        # Restore seat count
        schedule = db.query(FlightScheduleModel).filter(FlightScheduleModel.id == seg.schedule_id).first()
        passenger_count = len([p for p in passengers if p.passenger_type != "infant"])
        if passengers and passengers[0].seat_class == "economy":
            schedule.available_economy += passenger_count
        else:
            if schedule.available_business is not None:
                schedule.available_business += passenger_count
    
    db.commit()
    
    return {
        "booking_id": booking.id,
        "status": "cancelled",
        "refund_percentage": refund_percentage,
        "refund_amount": refund_amount,
        "message": f"Booking cancelled. {refund_percentage}% refund of ₹{refund_amount:.0f} will be processed."
    }


# Get flight tracking
@flight_router.get("/tracking/{schedule_id}")
async def get_flight_tracking(
    schedule_id: int,
    db: Session = Depends(get_db)
):
    """Get simulated live flight tracking"""
    schedule = db.query(FlightScheduleModel).filter(FlightScheduleModel.id == schedule_id).first()
    if not schedule:
        raise HTTPException(status_code=404, detail="Schedule not found")
    
    flight = db.query(FlightModel).filter(FlightModel.id == schedule.flight_id).first()
    route = db.query(FlightRouteModel).filter(FlightRouteModel.id == flight.route_id).first()
    origin = db.query(AirportModel).filter(AirportModel.id == route.origin_airport_id).first()
    dest = db.query(AirportModel).filter(AirportModel.id == route.destination_airport_id).first()
    
    now = datetime.now()
    dep = schedule.departure_datetime
    arr = schedule.arrival_datetime
    
    # Calculate progress
    if now < dep:
        progress = 0
        status = "scheduled"
        if (dep - now).total_seconds() < 3600:
            status = "boarding"
    elif now > arr:
        progress = 100
        status = "landed"
    else:
        total_duration = (arr - dep).total_seconds()
        elapsed = (now - dep).total_seconds()
        progress = min(100, (elapsed / total_duration) * 100)
        status = "in_air"
    
    # Interpolate position
    if origin.latitude and origin.longitude and dest.latitude and dest.longitude:
        current_lat = origin.latitude + (dest.latitude - origin.latitude) * (progress / 100)
        current_lng = origin.longitude + (dest.longitude - origin.longitude) * (progress / 100)
    else:
        current_lat = None
        current_lng = None
    
    # Calculate ETA
    if progress < 100:
        remaining_mins = int((arr - now).total_seconds() / 60)
    else:
        remaining_mins = 0
    
    return {
        "schedule_id": schedule_id,
        "flight_number": flight.flight_number,
        "status": status,
        "progress_percentage": round(progress, 1),
        "current_latitude": current_lat,
        "current_longitude": current_lng,
        "altitude_ft": 35000 if status == "in_air" else 0,
        "speed_kmph": 850 if status == "in_air" else 0,
        "origin": {"code": origin.code, "city": origin.city, "lat": origin.latitude, "lng": origin.longitude},
        "destination": {"code": dest.code, "city": dest.city, "lat": dest.latitude, "lng": dest.longitude},
        "departure_time": schedule.departure_datetime.isoformat(),
        "arrival_time": schedule.arrival_datetime.isoformat(),
        "eta_mins": remaining_mins
    }


# Seed flight data
@flight_router.post("/seed")
async def seed_flight_data(db: Session = Depends(get_db)):
    """Seed flight database with sample data"""
    import random
    
    # Check if already seeded
    existing = db.query(AirportModel).first()
    if existing:
        return {"message": "Flight data already seeded"}
    
    # Indian airports
    airports_data = [
        {"code": "DEL", "name": "Indira Gandhi International Airport", "city": "Delhi", "country": "India", "lat": 28.5562, "lng": 77.1000, "tz": "Asia/Kolkata"},
        {"code": "BOM", "name": "Chhatrapati Shivaji Maharaj International Airport", "city": "Mumbai", "country": "India", "lat": 19.0896, "lng": 72.8656, "tz": "Asia/Kolkata"},
        {"code": "BLR", "name": "Kempegowda International Airport", "city": "Bangalore", "country": "India", "lat": 13.1986, "lng": 77.7066, "tz": "Asia/Kolkata"},
        {"code": "MAA", "name": "Chennai International Airport", "city": "Chennai", "country": "India", "lat": 12.9941, "lng": 80.1709, "tz": "Asia/Kolkata"},
        {"code": "HYD", "name": "Rajiv Gandhi International Airport", "city": "Hyderabad", "country": "India", "lat": 17.2403, "lng": 78.4294, "tz": "Asia/Kolkata"},
        {"code": "CCU", "name": "Netaji Subhas Chandra Bose International Airport", "city": "Kolkata", "country": "India", "lat": 22.6547, "lng": 88.4467, "tz": "Asia/Kolkata"},
        {"code": "COK", "name": "Cochin International Airport", "city": "Kochi", "country": "India", "lat": 10.1520, "lng": 76.4019, "tz": "Asia/Kolkata"},
        {"code": "PNQ", "name": "Pune Airport", "city": "Pune", "country": "India", "lat": 18.5822, "lng": 73.9197, "tz": "Asia/Kolkata"},
        {"code": "GOI", "name": "Goa International Airport", "city": "Goa", "country": "India", "lat": 15.3808, "lng": 73.8314, "tz": "Asia/Kolkata"},
        {"code": "AMD", "name": "Sardar Vallabhbhai Patel International Airport", "city": "Ahmedabad", "country": "India", "lat": 23.0772, "lng": 72.6347, "tz": "Asia/Kolkata"},
        {"code": "JAI", "name": "Jaipur International Airport", "city": "Jaipur", "country": "India", "lat": 26.8242, "lng": 75.8122, "tz": "Asia/Kolkata"},
        {"code": "LKO", "name": "Chaudhary Charan Singh International Airport", "city": "Lucknow", "country": "India", "lat": 26.7606, "lng": 80.8893, "tz": "Asia/Kolkata"},
        # International
        {"code": "DXB", "name": "Dubai International Airport", "city": "Dubai", "country": "UAE", "lat": 25.2532, "lng": 55.3657, "tz": "Asia/Dubai"},
        {"code": "SIN", "name": "Singapore Changi Airport", "city": "Singapore", "country": "Singapore", "lat": 1.3644, "lng": 103.9915, "tz": "Asia/Singapore"},
        {"code": "LHR", "name": "London Heathrow Airport", "city": "London", "country": "UK", "lat": 51.4700, "lng": -0.4543, "tz": "Europe/London"},
    ]
    
    for a in airports_data:
        airport = AirportModel(
            code=a["code"], name=a["name"], city=a["city"], country=a["country"],
            latitude=a["lat"], longitude=a["lng"], timezone=a["tz"]
        )
        db.add(airport)
    db.flush()
    
    # Airlines
    airlines_data = [
        {"code": "6E", "name": "IndiGo", "logo": "/images/airlines/indigo.png", "country": "India"},
        {"code": "AI", "name": "Air India", "logo": "/images/airlines/airindia.png", "country": "India"},
        {"code": "SG", "name": "SpiceJet", "logo": "/images/airlines/spicejet.png", "country": "India"},
        {"code": "UK", "name": "Vistara", "logo": "/images/airlines/vistara.png", "country": "India"},
        {"code": "I5", "name": "Air India Express", "logo": "/images/airlines/airindia-express.png", "country": "India"},
        {"code": "G8", "name": "Go First", "logo": "/images/airlines/gofirst.png", "country": "India"},
        {"code": "EK", "name": "Emirates", "logo": "/images/airlines/emirates.png", "country": "UAE"},
        {"code": "SQ", "name": "Singapore Airlines", "logo": "/images/airlines/singapore.png", "country": "Singapore"},
    ]
    
    for a in airlines_data:
        airline = AirlineModel(code=a["code"], name=a["name"], logo_url=a["logo"], country=a["country"])
        db.add(airline)
    db.flush()
    
    # Aircraft
    aircraft_data = [
        {"model": "Airbus A320", "manufacturer": "Airbus", "total": 180, "economy": 168, "business": 12, "layout": "3-3"},
        {"model": "Airbus A321", "manufacturer": "Airbus", "total": 220, "economy": 200, "business": 20, "layout": "3-3"},
        {"model": "Boeing 737-800", "manufacturer": "Boeing", "total": 189, "economy": 177, "business": 12, "layout": "3-3"},
        {"model": "Boeing 787 Dreamliner", "manufacturer": "Boeing", "total": 256, "economy": 232, "business": 24, "layout": "3-3-3"},
        {"model": "Airbus A320neo", "manufacturer": "Airbus", "total": 186, "economy": 174, "business": 12, "layout": "3-3"},
    ]
    
    for a in aircraft_data:
        aircraft = AircraftModel(
            model=a["model"], manufacturer=a["manufacturer"], total_seats=a["total"],
            economy_seats=a["economy"], business_seats=a["business"], seat_layout=a["layout"]
        )
        db.add(aircraft)
    db.flush()
    
    # Generate seats for each aircraft
    aircraft_list = db.query(AircraftModel).all()
    for aircraft in aircraft_list:
        layout = aircraft.seat_layout.split('-')
        cols_per_side = int(layout[0])
        total_cols = cols_per_side * 2
        
        # Column letters based on layout
        if total_cols == 6:
            columns = ['A', 'B', 'C', 'D', 'E', 'F']
        else:
            columns = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'J'][:total_cols]
        
        # Business class rows (first 2-4 rows)
        business_rows = aircraft.business_seats // total_cols if aircraft.business_seats > 0 else 0
        
        row = 1
        # Business class seats
        for r in range(business_rows):
            for col in columns:
                seat_type = "window" if col in ['A', columns[-1]] else ("aisle" if col in ['C', 'D'] else "middle")
                seat = FlightSeatModel(
                    aircraft_id=aircraft.id,
                    seat_number=f"{row}{col}",
                    seat_class="business",
                    seat_type=seat_type,
                    row_number=row,
                    column_letter=col,
                    is_extra_legroom=1,
                    price_modifier=500
                )
                db.add(seat)
            row += 1
        
        # Economy class seats
        economy_rows = aircraft.economy_seats // total_cols
        for r in range(economy_rows):
            for col in columns:
                seat_type = "window" if col in ['A', columns[-1]] else ("aisle" if col in ['C', 'D'] else "middle")
                is_extra_legroom = 1 if row in [business_rows + 1, business_rows + 12, business_rows + 13] else 0
                is_emergency = 1 if row in [business_rows + 12, business_rows + 13] else 0
                price_mod = 200 if is_extra_legroom else (50 if seat_type == "window" else 0)
                
                seat = FlightSeatModel(
                    aircraft_id=aircraft.id,
                    seat_number=f"{row}{col}",
                    seat_class="economy",
                    seat_type=seat_type,
                    row_number=row,
                    column_letter=col,
                    is_extra_legroom=is_extra_legroom,
                    is_emergency_exit=is_emergency,
                    price_modifier=price_mod
                )
                db.add(seat)
            row += 1
    
    db.flush()
    
    # Routes (major Indian routes)
    airport_map = {a.code: a.id for a in db.query(AirportModel).all()}
    
    routes_data = [
        ("DEL", "BOM", 1148, 130), ("BOM", "DEL", 1148, 130),
        ("DEL", "BLR", 1740, 165), ("BLR", "DEL", 1740, 165),
        ("DEL", "MAA", 1760, 170), ("MAA", "DEL", 1760, 170),
        ("DEL", "HYD", 1260, 140), ("HYD", "DEL", 1260, 140),
        ("BOM", "BLR", 842, 95), ("BLR", "BOM", 842, 95),
        ("BOM", "MAA", 1028, 110), ("MAA", "BOM", 1028, 110),
        ("BOM", "HYD", 617, 80), ("HYD", "BOM", 617, 80),
        ("BLR", "MAA", 284, 55), ("MAA", "BLR", 284, 55),
        ("BLR", "HYD", 502, 70), ("HYD", "BLR", 502, 70),
        ("DEL", "CCU", 1305, 145), ("CCU", "DEL", 1305, 145),
        ("BOM", "GOI", 439, 65), ("GOI", "BOM", 439, 65),
        ("DEL", "GOI", 1500, 155), ("GOI", "DEL", 1500, 155),
        ("BLR", "COK", 340, 60), ("COK", "BLR", 340, 60),
        ("MAA", "COK", 520, 75), ("COK", "MAA", 520, 75),
        # International
        ("DEL", "DXB", 2200, 210), ("DXB", "DEL", 2200, 210),
        ("BOM", "DXB", 1930, 190), ("DXB", "BOM", 1930, 190),
        ("DEL", "SIN", 4150, 330), ("SIN", "DEL", 4150, 330),
        ("BOM", "LHR", 7200, 540), ("LHR", "BOM", 7200, 540),
    ]
    
    for origin, dest, dist, dur in routes_data:
        if origin in airport_map and dest in airport_map:
            route = FlightRouteModel(
                origin_airport_id=airport_map[origin],
                destination_airport_id=airport_map[dest],
                distance_km=dist,
                estimated_duration_mins=dur
            )
            db.add(route)
    
    db.flush()
    
    # Flights
    airline_map = {a.code: a.id for a in db.query(AirlineModel).all()}
    aircraft_list = db.query(AircraftModel).all()
    routes = db.query(FlightRouteModel).all()
    
    flight_times = [
        ("06:00", "08:10"), ("07:30", "09:40"), ("09:00", "11:15"),
        ("10:30", "12:45"), ("12:00", "14:10"), ("14:30", "16:45"),
        ("16:00", "18:15"), ("18:30", "20:40"), ("20:00", "22:10"),
        ("22:30", "00:45"),  # Overnight
    ]
    
    for route in routes:
        origin = db.query(AirportModel).filter(AirportModel.id == route.origin_airport_id).first()
        dest = db.query(AirportModel).filter(AirportModel.id == route.destination_airport_id).first()
        
        # Create 2-4 flights per route
        num_flights = random.randint(2, 4)
        used_times = set()
        
        for _ in range(num_flights):
            airline_code = random.choice(list(airline_map.keys())[:6])  # Indian airlines
            if route.distance_km and route.distance_km > 3000:
                airline_code = random.choice(["AI", "EK", "SQ"])  # International
            
            aircraft = random.choice(aircraft_list)
            
            # Pick unique departure time
            time_idx = random.randint(0, len(flight_times) - 1)
            while time_idx in used_times and len(used_times) < len(flight_times):
                time_idx = random.randint(0, len(flight_times) - 1)
            used_times.add(time_idx)
            
            dep_time, arr_time = flight_times[time_idx]
            
            # Adjust arrival time based on actual duration
            dep_hour, dep_min = map(int, dep_time.split(':'))
            total_mins = dep_hour * 60 + dep_min + route.estimated_duration_mins
            arr_hour = (total_mins // 60) % 24
            arr_min = total_mins % 60
            arr_time = f"{arr_hour:02d}:{arr_min:02d}"
            is_overnight = 1 if total_mins >= 24 * 60 else 0
            
            flight_num = f"{airline_code}{random.randint(100, 999)}"
            base_price = max(2500, route.distance_km * 3 + random.randint(-500, 500)) if route.distance_km else random.randint(3000, 8000)
            
            flight = FlightModel(
                flight_number=flight_num,
                airline_id=airline_map[airline_code],
                route_id=route.id,
                aircraft_id=aircraft.id,
                departure_time=dep_time,
                arrival_time=arr_time,
                duration_mins=route.estimated_duration_mins,
                stops=0,
                days_of_week="1,2,3,4,5,6,7",
                base_price_economy=base_price,
                base_price_business=base_price * 3,
                is_overnight=is_overnight,
                is_refundable=random.choice([0, 1]),
                meal_included=random.choice([0, 1])
            )
            db.add(flight)
    
    db.commit()
    
    # Count created entities
    airport_count = db.query(AirportModel).count()
    airline_count = db.query(AirlineModel).count()
    aircraft_count = db.query(AircraftModel).count()
    route_count = db.query(FlightRouteModel).count()
    flight_count = db.query(FlightModel).count()
    seat_count = db.query(FlightSeatModel).count()
    
    return {
        "message": "Flight data seeded successfully",
        "airports": airport_count,
        "airlines": airline_count,
        "aircraft": aircraft_count,
        "routes": route_count,
        "flights": flight_count,
        "seats": seat_count
    }


# Register flight router
app.include_router(flight_router)


# =============================
# Hotel Booking Router (Advanced Booking.com/MakeMyTrip-style)
# =============================
hotel_router = APIRouter(prefix="/api/hotel", tags=["Hotels"])


def generate_hotel_booking_ref():
    """Generate unique hotel booking reference"""
    chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
    return "HTL" + ''.join(random.choices(chars, k=9))


def parse_json_field(field_value, default=None):
    """Safely parse JSON field"""
    if field_value is None:
        return default if default is not None else []
    if isinstance(field_value, (list, dict)):
        return field_value
    try:
        return json.loads(field_value)
    except:
        return default if default is not None else []


@hotel_router.get("/cities")
async def get_hotel_cities(
    search: Optional[str] = None,
    db: Session = Depends(get_db)
):
    """Get list of cities with hotels"""
    query = db.query(
        HotelModel.city,
        HotelModel.state,
        HotelModel.country,
        func.count(HotelModel.id).label("hotel_count")
    ).filter(HotelModel.is_active == 1).group_by(
        HotelModel.city, HotelModel.state, HotelModel.country
    )
    
    if search:
        query = query.filter(HotelModel.city.ilike(f"%{search}%"))
    
    cities = query.order_by(func.count(HotelModel.id).desc()).limit(50).all()
    
    return [
        {
            "city": c.city,
            "state": c.state,
            "country": c.country,
            "hotel_count": c.hotel_count
        }
        for c in cities
    ]


@hotel_router.post("/search")
async def search_hotels(
    request: HotelSearchRequest,
    db: Session = Depends(get_db)
):
    """Search hotels with advanced filters"""
    
    # Calculate nights (default to 1 if dates not provided)
    nights = 1
    if request.check_in_date and request.check_out_date:
        check_in = datetime.strptime(request.check_in_date, "%Y-%m-%d")
        check_out = datetime.strptime(request.check_out_date, "%Y-%m-%d")
        nights = max(1, (check_out - check_in).days)
    
    # Base query
    query = db.query(HotelModel).filter(
        HotelModel.is_active == 1,
        HotelModel.city.ilike(f"%{request.city}%")
    )
    
    # Apply filters
    if request.star_rating:
        query = query.filter(HotelModel.star_category.in_(request.star_rating))
    
    if request.min_price:
        query = query.filter(HotelModel.price_per_night >= request.min_price)
    
    if request.max_price:
        query = query.filter(HotelModel.price_per_night <= request.max_price)
    
    if request.hotel_type:
        query = query.filter(HotelModel.hotel_type.ilike(f"%{request.hotel_type}%"))
    
    if request.free_cancellation:
        query = query.filter(HotelModel.free_cancellation == 1)
    
    if request.breakfast_included:
        query = query.filter(HotelModel.breakfast_included == 1)
    
    # Sorting
    if request.sort_by == "price_low":
        query = query.order_by(HotelModel.price_per_night.asc())
    elif request.sort_by == "price_high":
        query = query.order_by(HotelModel.price_per_night.desc())
    elif request.sort_by == "rating":
        query = query.order_by(HotelModel.rating.desc())
    elif request.sort_by == "distance":
        query = query.order_by(HotelModel.distance_from_center.asc())
    else:
        query = query.order_by(HotelModel.reviews_count.desc(), HotelModel.rating.desc())
    
    # Pagination
    total = query.count()
    offset = (request.page - 1) * request.limit
    hotels = query.offset(offset).limit(request.limit).all()
    
    # Format response
    results = []
    for hotel in hotels:
        amenities = parse_json_field(hotel.amenities, [])
        images = parse_json_field(hotel.images, [])
        primary_image = images[0]["url"] if images and isinstance(images[0], dict) else (images[0] if images else None)
        
        results.append({
            "id": hotel.id,
            "name": hotel.name,
            "slug": hotel.slug,
            "star_category": hotel.star_category,
            "hotel_type": hotel.hotel_type,
            "city": hotel.city,
            "state": hotel.state,
            "address": hotel.address,
            "latitude": hotel.latitude,
            "longitude": hotel.longitude,
            "rating": hotel.rating,
            "reviews_count": hotel.reviews_count,
            "price_per_night": hotel.price_per_night,
            "total_price": hotel.price_per_night * nights * request.rooms,
            "original_price": hotel.original_price,
            "currency": hotel.currency,
            "primary_image": primary_image,
            "amenities": [a["name"] if isinstance(a, dict) else a for a in amenities[:6]],
            "free_cancellation": hotel.free_cancellation == 1,
            "breakfast_included": hotel.breakfast_included == 1,
            "distance_from_center": hotel.distance_from_center,
            "landmark": hotel.landmark,
            "nights": nights
        })
    
    return {
        "hotels": results,
        "total": total,
        "page": request.page,
        "limit": request.limit,
        "pages": (total + request.limit - 1) // request.limit,
        "search_params": {
            "city": request.city,
            "check_in": request.check_in_date,
            "check_out": request.check_out_date,
            "nights": nights,
            "adults": request.adults,
            "children": request.children,
            "rooms": request.rooms
        }
    }


@hotel_router.get("/detail/{hotel_id}")
async def get_hotel_detail(
    hotel_id: int,
    db: Session = Depends(get_db)
):
    """Get detailed hotel information"""
    hotel = db.query(HotelModel).filter(
        HotelModel.id == hotel_id,
        HotelModel.is_active == 1
    ).first()
    
    if not hotel:
        raise HTTPException(status_code=404, detail="Hotel not found")
    
    return {
        "id": hotel.id,
        "name": hotel.name,
        "slug": hotel.slug,
        "description": hotel.description,
        "star_category": hotel.star_category,
        "hotel_type": hotel.hotel_type,
        "city": hotel.city,
        "state": hotel.state,
        "country": hotel.country,
        "address": hotel.address,
        "latitude": hotel.latitude,
        "longitude": hotel.longitude,
        "landmark": hotel.landmark,
        "distance_from_center": hotel.distance_from_center,
        "rating": hotel.rating,
        "reviews_count": hotel.reviews_count,
        "price_per_night": hotel.price_per_night,
        "original_price": hotel.original_price,
        "currency": hotel.currency,
        "amenities": parse_json_field(hotel.amenities, []),
        "images": parse_json_field(hotel.images, []),
        "policies": parse_json_field(hotel.policies, []),
        "check_in_time": hotel.check_in_time,
        "check_out_time": hotel.check_out_time,
        "contact_phone": hotel.contact_phone,
        "contact_email": hotel.contact_email,
        "gst_number": hotel.gst_number,
        "free_cancellation": hotel.free_cancellation == 1,
        "breakfast_included": hotel.breakfast_included == 1,
        "total_rooms": hotel.total_rooms
    }


@hotel_router.get("/detail/slug/{slug}")
async def get_hotel_by_slug(
    slug: str,
    db: Session = Depends(get_db)
):
    """Get hotel by slug"""
    hotel = db.query(HotelModel).filter(
        HotelModel.slug == slug,
        HotelModel.is_active == 1
    ).first()
    
    if not hotel:
        raise HTTPException(status_code=404, detail="Hotel not found")
    
    return await get_hotel_detail(hotel.id, db)


# Alternative endpoint without /detail/ prefix (for frontend compatibility)
@hotel_router.get("/{hotel_id}", response_model=None)
async def get_hotel_by_id(
    hotel_id: int,
    db: Session = Depends(get_db)
):
    """Get hotel by ID (alias for /detail/{hotel_id})"""
    return await get_hotel_detail(hotel_id, db)


@hotel_router.get("/{hotel_id}/rooms")
async def get_hotel_rooms(
    hotel_id: int,
    check_in: Optional[str] = None,
    check_out: Optional[str] = None,
    guests: int = 2,
    db: Session = Depends(get_db)
):
    """Get available rooms for a hotel"""
    rooms = db.query(HotelRoomModel).filter(
        HotelRoomModel.hotel_id == hotel_id,
        HotelRoomModel.is_active == 1,
        HotelRoomModel.max_guests >= guests
    ).order_by(HotelRoomModel.price_per_night.asc()).all()
    
    results = []
    for room in rooms:
        results.append({
            "id": room.id,
            "hotel_id": room.hotel_id,
            "room_type": room.room_type,
            "room_name": room.room_name,
            "description": room.description,
            "max_guests": room.max_guests,
            "max_adults": room.max_adults,
            "max_children": room.max_children,
            "bed_type": room.bed_type,
            "room_size_sqft": room.room_size_sqft,
            "view_type": room.view_type,
            "price_per_night": room.price_per_night,
            "original_price": room.original_price,
            "discount_percent": room.discount_percent,
            "amenities": parse_json_field(room.amenities, []),
            "images": parse_json_field(room.images, []),
            "inclusions": parse_json_field(room.inclusions, []),
            "cancellation_policy": room.cancellation_policy,
            "available_rooms": room.available_rooms,
            "is_refundable": room.is_refundable == 1
        })
    
    return {"rooms": results, "count": len(results)}


@hotel_router.post("/book")
async def create_hotel_booking(
    booking: HotelBookingCreate,
    current_user: UserModel = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Create a new hotel booking"""
    
    # Validate hotel
    hotel = db.query(HotelModel).filter(HotelModel.id == booking.hotel_id).first()
    if not hotel:
        raise HTTPException(status_code=404, detail="Hotel not found")
    
    # Validate room
    room = db.query(HotelRoomModel).filter(
        HotelRoomModel.id == booking.room_id,
        HotelRoomModel.hotel_id == booking.hotel_id
    ).first()
    if not room:
        raise HTTPException(status_code=404, detail="Room not found")
    
    # Check availability
    if room.available_rooms < booking.rooms_booked:
        raise HTTPException(status_code=400, detail="Not enough rooms available")
    
    # Calculate nights
    check_in = datetime.strptime(booking.check_in_date, "%Y-%m-%d")
    check_out = datetime.strptime(booking.check_out_date, "%Y-%m-%d")
    nights = max(1, (check_out - check_in).days)
    
    # Calculate pricing
    base_price = room.price_per_night * nights * booking.rooms_booked
    taxes = round(base_price * 0.18, 2)  # 18% GST
    service_charge = round(base_price * 0.02, 2)  # 2% service charge
    total_amount = round(base_price + taxes + service_charge, 2)
    
    # Generate booking ID and reference
    booking_id = str(uuid.uuid4())
    booking_reference = generate_hotel_booking_ref()
    
    # Generate QR code
    qr_data = json.dumps({
        "booking_ref": booking_reference,
        "hotel": hotel.name,
        "guest": booking.guest_name,
        "check_in": booking.check_in_date,
        "check_out": booking.check_out_date
    })
    
    # Create booking
    new_booking = HotelBookingModel(
        booking_id=booking_id,
        booking_reference=booking_reference,
        user_id=current_user.id,
        hotel_id=booking.hotel_id,
        room_id=booking.room_id,
        check_in_date=booking.check_in_date,
        check_out_date=booking.check_out_date,
        check_in_time=hotel.check_in_time,
        check_out_time=hotel.check_out_time,
        nights=nights,
        rooms_booked=booking.rooms_booked,
        adults=booking.adults,
        children=booking.children,
        guest_name=booking.guest_name,
        guest_email=booking.guest_email,
        guest_phone=booking.guest_phone,
        guest_nationality=booking.guest_nationality,
        special_requests=booking.special_requests,
        base_price=base_price,
        taxes=taxes,
        service_charge=service_charge,
        total_amount=total_amount,
        qr_code=qr_data
    )
    
    db.add(new_booking)
    
    # Update room availability
    room.available_rooms -= booking.rooms_booked
    
    db.commit()
    db.refresh(new_booking)
    
    return {
        "booking_id": new_booking.booking_id,
        "booking_reference": new_booking.booking_reference,
        "hotel_name": hotel.name,
        "hotel_address": hotel.address,
        "hotel_phone": hotel.contact_phone,
        "hotel_email": hotel.contact_email,
        "hotel_star": hotel.star_category,
        "hotel_gst": hotel.gst_number,
        "room_type": room.room_type,
        "room_name": room.room_name,
        "bed_type": room.bed_type,
        "check_in_date": new_booking.check_in_date,
        "check_out_date": new_booking.check_out_date,
        "check_in_time": new_booking.check_in_time,
        "check_out_time": new_booking.check_out_time,
        "nights": new_booking.nights,
        "rooms_booked": new_booking.rooms_booked,
        "adults": new_booking.adults,
        "children": new_booking.children,
        "guest_name": new_booking.guest_name,
        "guest_email": new_booking.guest_email,
        "guest_phone": new_booking.guest_phone,
        "guest_nationality": new_booking.guest_nationality,
        "special_requests": new_booking.special_requests,
        "base_price": new_booking.base_price,
        "taxes": new_booking.taxes,
        "service_charge": new_booking.service_charge,
        "discount_amount": new_booking.discount_amount,
        "total_amount": new_booking.total_amount,
        "currency": new_booking.currency,
        "payment_status": new_booking.payment_status,
        "booking_status": new_booking.booking_status,
        "qr_code": new_booking.qr_code,
        "created_at": new_booking.created_at
    }


@hotel_router.get("/booking/{booking_ref}")
async def get_hotel_booking(
    booking_ref: str,
    current_user: UserModel = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get hotel booking details by reference"""
    booking = db.query(HotelBookingModel).filter(
        or_(
            HotelBookingModel.booking_reference == booking_ref,
            HotelBookingModel.booking_id == booking_ref
        ),
        HotelBookingModel.user_id == current_user.id
    ).first()
    
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")
    
    hotel = db.query(HotelModel).filter(HotelModel.id == booking.hotel_id).first()
    room = db.query(HotelRoomModel).filter(HotelRoomModel.id == booking.room_id).first()
    
    return {
        "booking_id": booking.booking_id,
        "booking_reference": booking.booking_reference,
        "hotel_name": hotel.name if hotel else None,
        "hotel_address": hotel.address if hotel else None,
        "hotel_phone": hotel.contact_phone if hotel else None,
        "hotel_email": hotel.contact_email if hotel else None,
        "hotel_star": hotel.star_category if hotel else None,
        "hotel_gst": hotel.gst_number if hotel else None,
        "hotel_city": hotel.city if hotel else None,
        "hotel_state": hotel.state if hotel else None,
        "hotel_images": parse_json_field(hotel.images, []) if hotel else [],
        "room_type": room.room_type if room else None,
        "room_name": room.room_name if room else None,
        "bed_type": room.bed_type if room else None,
        "check_in_date": booking.check_in_date,
        "check_out_date": booking.check_out_date,
        "check_in_time": booking.check_in_time,
        "check_out_time": booking.check_out_time,
        "nights": booking.nights,
        "rooms_booked": booking.rooms_booked,
        "adults": booking.adults,
        "children": booking.children,
        "guest_name": booking.guest_name,
        "guest_email": booking.guest_email,
        "guest_phone": booking.guest_phone,
        "guest_nationality": booking.guest_nationality,
        "special_requests": booking.special_requests,
        "base_price": booking.base_price,
        "taxes": booking.taxes,
        "service_charge": booking.service_charge,
        "discount_amount": booking.discount_amount,
        "total_amount": booking.total_amount,
        "currency": booking.currency,
        "payment_status": booking.payment_status,
        "payment_method": booking.payment_method,
        "transaction_id": booking.transaction_id,
        "booking_status": booking.booking_status,
        "qr_code": booking.qr_code,
        "created_at": booking.created_at,
        "cancellation_policy": room.cancellation_policy if room else None
    }


@hotel_router.get("/my-bookings")
async def get_my_hotel_bookings(
    status: Optional[str] = None,
    current_user: UserModel = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get user's hotel bookings"""
    query = db.query(HotelBookingModel).filter(
        HotelBookingModel.user_id == current_user.id
    )
    
    if status:
        query = query.filter(HotelBookingModel.booking_status == status)
    
    bookings = query.order_by(HotelBookingModel.created_at.desc()).all()
    
    results = []
    for booking in bookings:
        hotel = db.query(HotelModel).filter(HotelModel.id == booking.hotel_id).first()
        room = db.query(HotelRoomModel).filter(HotelRoomModel.id == booking.room_id).first()
        
        images = parse_json_field(hotel.images, []) if hotel else []
        primary_image = images[0]["url"] if images and isinstance(images[0], dict) else (images[0] if images else None)
        
        results.append({
            "booking_id": booking.booking_id,
            "booking_reference": booking.booking_reference,
            "hotel_name": hotel.name if hotel else None,
            "hotel_city": hotel.city if hotel else None,
            "hotel_star": hotel.star_category if hotel else None,
            "hotel_image": primary_image,
            "room_type": room.room_type if room else None,
            "check_in_date": booking.check_in_date,
            "check_out_date": booking.check_out_date,
            "nights": booking.nights,
            "total_amount": booking.total_amount,
            "currency": booking.currency,
            "booking_status": booking.booking_status,
            "payment_status": booking.payment_status,
            "created_at": booking.created_at
        })
    
    return {"bookings": results, "count": len(results)}


@hotel_router.post("/booking/{booking_ref}/cancel")
async def cancel_hotel_booking(
    booking_ref: str,
    reason: Optional[str] = None,
    current_user: UserModel = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Cancel a hotel booking"""
    booking = db.query(HotelBookingModel).filter(
        HotelBookingModel.booking_reference == booking_ref,
        HotelBookingModel.user_id == current_user.id
    ).first()
    
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")
    
    if booking.booking_status == "cancelled":
        raise HTTPException(status_code=400, detail="Booking already cancelled")
    
    if booking.booking_status == "completed":
        raise HTTPException(status_code=400, detail="Cannot cancel completed booking")
    
    # Calculate refund based on policy
    check_in = datetime.strptime(booking.check_in_date, "%Y-%m-%d")
    days_until_checkin = (check_in - datetime.now()).days
    
    if days_until_checkin > 7:
        refund_percent = 100
    elif days_until_checkin > 3:
        refund_percent = 75
    elif days_until_checkin > 1:
        refund_percent = 50
    else:
        refund_percent = 0
    
    refund_amount = round(booking.total_amount * refund_percent / 100, 2)
    
    # Update booking
    booking.booking_status = "cancelled"
    booking.cancellation_reason = reason
    booking.cancelled_at = datetime.now(timezone.utc)
    booking.refund_amount = refund_amount
    booking.refund_status = "pending" if refund_amount > 0 else None
    
    # Restore room availability
    room = db.query(HotelRoomModel).filter(HotelRoomModel.id == booking.room_id).first()
    if room:
        room.available_rooms += booking.rooms_booked
    
    db.commit()
    
    return {
        "message": "Booking cancelled successfully",
        "booking_reference": booking.booking_reference,
        "refund_amount": refund_amount,
        "refund_percent": refund_percent,
        "refund_status": booking.refund_status
    }


@hotel_router.post("/booking/{booking_ref}/payment")
async def update_hotel_payment(
    booking_ref: str,
    payment_method: str,
    transaction_id: str,
    current_user: UserModel = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Update payment status for hotel booking"""
    booking = db.query(HotelBookingModel).filter(
        HotelBookingModel.booking_reference == booking_ref,
        HotelBookingModel.user_id == current_user.id
    ).first()
    
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")
    
    booking.payment_status = "paid"
    booking.payment_method = payment_method
    booking.transaction_id = transaction_id
    booking.payment_date = datetime.now(timezone.utc)
    
    db.commit()
    
    return {
        "message": "Payment updated successfully",
        "booking_reference": booking.booking_reference,
        "payment_status": booking.payment_status
    }


@hotel_router.get("/{hotel_id}/reviews")
async def get_hotel_reviews(
    hotel_id: int,
    page: int = 1,
    limit: int = 10,
    db: Session = Depends(get_db)
):
    """Get hotel reviews"""
    query = db.query(HotelReviewModel).filter(
        HotelReviewModel.hotel_id == hotel_id,
        HotelReviewModel.is_active == 1
    )
    
    total = query.count()
    offset = (page - 1) * limit
    reviews = query.order_by(HotelReviewModel.created_at.desc()).offset(offset).limit(limit).all()
    
    results = []
    for review in reviews:
        user = db.query(UserModel).filter(UserModel.id == review.user_id).first()
        results.append({
            "id": review.id,
            "hotel_id": review.hotel_id,
            "user_name": user.full_name if user else "Anonymous",
            "rating": review.rating,
            "cleanliness_rating": review.cleanliness_rating,
            "service_rating": review.service_rating,
            "location_rating": review.location_rating,
            "value_rating": review.value_rating,
            "title": review.title,
            "review_text": review.review_text,
            "pros": review.pros,
            "cons": review.cons,
            "travel_type": review.travel_type,
            "is_verified": review.is_verified == 1,
            "helpful_count": review.helpful_count,
            "created_at": review.created_at
        })
    
    # Calculate rating breakdown
    all_reviews = db.query(HotelReviewModel).filter(
        HotelReviewModel.hotel_id == hotel_id,
        HotelReviewModel.is_active == 1
    ).all()
    
    rating_breakdown = {5: 0, 4: 0, 3: 0, 2: 0, 1: 0}
    avg_cleanliness = avg_service = avg_location = avg_value = 0
    
    if all_reviews:
        for r in all_reviews:
            rating_breakdown[int(r.rating)] = rating_breakdown.get(int(r.rating), 0) + 1
            if r.cleanliness_rating:
                avg_cleanliness += r.cleanliness_rating
            if r.service_rating:
                avg_service += r.service_rating
            if r.location_rating:
                avg_location += r.location_rating
            if r.value_rating:
                avg_value += r.value_rating
        
        count = len(all_reviews)
        avg_cleanliness = round(avg_cleanliness / count, 1) if avg_cleanliness else 0
        avg_service = round(avg_service / count, 1) if avg_service else 0
        avg_location = round(avg_location / count, 1) if avg_location else 0
        avg_value = round(avg_value / count, 1) if avg_value else 0
    
    return {
        "reviews": results,
        "total": total,
        "page": page,
        "pages": (total + limit - 1) // limit,
        "rating_breakdown": rating_breakdown,
        "category_ratings": {
            "cleanliness": avg_cleanliness,
            "service": avg_service,
            "location": avg_location,
            "value": avg_value
        }
    }


@hotel_router.post("/{hotel_id}/reviews")
async def create_hotel_review(
    hotel_id: int,
    review: HotelReviewCreate,
    current_user: UserModel = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Create a hotel review"""
    # Check if user has a booking for this hotel
    has_booking = db.query(HotelBookingModel).filter(
        HotelBookingModel.hotel_id == hotel_id,
        HotelBookingModel.user_id == current_user.id,
        HotelBookingModel.booking_status.in_(["confirmed", "completed"])
    ).first()
    
    new_review = HotelReviewModel(
        hotel_id=hotel_id,
        booking_id=review.booking_id,
        user_id=current_user.id,
        rating=review.rating,
        cleanliness_rating=review.cleanliness_rating,
        service_rating=review.service_rating,
        location_rating=review.location_rating,
        value_rating=review.value_rating,
        title=review.title,
        review_text=review.review_text,
        pros=review.pros,
        cons=review.cons,
        travel_type=review.travel_type,
        is_verified=1 if has_booking else 0
    )
    
    db.add(new_review)
    
    # Update hotel rating
    hotel = db.query(HotelModel).filter(HotelModel.id == hotel_id).first()
    if hotel:
        all_ratings = db.query(func.avg(HotelReviewModel.rating)).filter(
            HotelReviewModel.hotel_id == hotel_id,
            HotelReviewModel.is_active == 1
        ).scalar()
        hotel.rating = round(float(all_ratings or 0), 1)
        hotel.reviews_count = db.query(HotelReviewModel).filter(
            HotelReviewModel.hotel_id == hotel_id,
            HotelReviewModel.is_active == 1
        ).count() + 1
    
    db.commit()
    db.refresh(new_review)
    
    return {"message": "Review submitted successfully", "review_id": new_review.id}


@hotel_router.post("/wishlist/{hotel_id}")
async def toggle_hotel_wishlist(
    hotel_id: int,
    current_user: UserModel = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Add/remove hotel from wishlist"""
    existing = db.query(HotelWishlistModel).filter(
        HotelWishlistModel.user_id == current_user.id,
        HotelWishlistModel.hotel_id == hotel_id
    ).first()
    
    if existing:
        db.delete(existing)
        db.commit()
        return {"message": "Removed from wishlist", "in_wishlist": False}
    else:
        wishlist = HotelWishlistModel(user_id=current_user.id, hotel_id=hotel_id)
        db.add(wishlist)
        db.commit()
        return {"message": "Added to wishlist", "in_wishlist": True}


@hotel_router.get("/wishlist")
async def get_hotel_wishlist(
    current_user: UserModel = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get user's hotel wishlist"""
    wishlists = db.query(HotelWishlistModel).filter(
        HotelWishlistModel.user_id == current_user.id
    ).all()
    
    results = []
    for w in wishlists:
        hotel = db.query(HotelModel).filter(HotelModel.id == w.hotel_id).first()
        if hotel:
            images = parse_json_field(hotel.images, [])
            primary_image = images[0]["url"] if images and isinstance(images[0], dict) else (images[0] if images else None)
            results.append({
                "id": hotel.id,
                "name": hotel.name,
                "city": hotel.city,
                "star_category": hotel.star_category,
                "rating": hotel.rating,
                "price_per_night": hotel.price_per_night,
                "primary_image": primary_image
            })
    
    return {"wishlist": results, "count": len(results)}


@hotel_router.get("/featured")
async def get_featured_hotels(
    limit: int = 10,
    db: Session = Depends(get_db)
):
    """Get featured hotels"""
    hotels = db.query(HotelModel).filter(
        HotelModel.is_active == 1,
        HotelModel.is_featured == 1
    ).order_by(HotelModel.rating.desc()).limit(limit).all()
    
    results = []
    for hotel in hotels:
        images = parse_json_field(hotel.images, [])
        primary_image = images[0]["url"] if images and isinstance(images[0], dict) else (images[0] if images else None)
        results.append({
            "id": hotel.id,
            "name": hotel.name,
            "slug": hotel.slug,
            "city": hotel.city,
            "state": hotel.state,
            "star_category": hotel.star_category,
            "rating": hotel.rating,
            "reviews_count": hotel.reviews_count,
            "price_per_night": hotel.price_per_night,
            "original_price": hotel.original_price,
            "primary_image": primary_image,
            "free_cancellation": hotel.free_cancellation == 1
        })
    
    return {"hotels": results}


@hotel_router.get("/popular-cities")
async def get_popular_hotel_cities(
    limit: int = 12,
    db: Session = Depends(get_db)
):
    """Get popular cities for hotels"""
    cities = db.query(
        HotelModel.city,
        HotelModel.state,
        func.count(HotelModel.id).label("hotel_count"),
        func.min(HotelModel.price_per_night).label("starting_price")
    ).filter(
        HotelModel.is_active == 1
    ).group_by(
        HotelModel.city, HotelModel.state
    ).order_by(
        func.count(HotelModel.id).desc()
    ).limit(limit).all()
    
    # City images mapping
    city_images = {
        "Mumbai": "https://images.unsplash.com/photo-1570168007204-dfb528c6958f?w=800",
        "Delhi": "https://images.unsplash.com/photo-1587474260584-136574528ed5?w=800",
        "New Delhi": "https://images.unsplash.com/photo-1587474260584-136574528ed5?w=800",
        "Bangalore": "https://images.unsplash.com/photo-1596176530529-78163a4f7af2?w=800",
        "Goa": "https://images.unsplash.com/photo-1512343879784-a960bf40e7f2?w=800",
        "Jaipur": "https://images.unsplash.com/photo-1477587458883-47145ed94245?w=800",
        "Chennai": "https://images.unsplash.com/photo-1582510003544-4d00b7f74220?w=800",
        "Kolkata": "https://images.unsplash.com/photo-1558431382-27e303142255?w=800",
        "Hyderabad": "https://images.unsplash.com/photo-1572711679396-4cf9f5be3c85?w=800",
        "Pune": "https://images.unsplash.com/photo-1580581096469-8afb38397839?w=800",
        "Ahmedabad": "https://images.unsplash.com/photo-1569154941061-e231b4725ef1?w=800",
        "Kochi": "https://images.unsplash.com/photo-1602216056096-3b40cc0c9944?w=800",
        "Ernakulam": "https://images.unsplash.com/photo-1602216056096-3b40cc0c9944?w=800",
        "Udaipur": "https://images.unsplash.com/photo-1568495248636-6432b97bd949?w=800",
        "Agra": "https://images.unsplash.com/photo-1564507592333-c60657eea523?w=800",
        "Varanasi": "https://images.unsplash.com/photo-1561361513-2d000a50f0dc?w=800",
    }
    
    default_image = "https://images.unsplash.com/photo-1455587734955-081b22074882?w=800"
    
    results = []
    for city in cities:
        results.append({
            "city": city.city,
            "state": city.state,
            "hotel_count": city.hotel_count,
            "starting_price": city.starting_price,
            "image": city_images.get(city.city, default_image)
        })
    
    return {"cities": results}


# Hotel Data Seed Endpoint
@hotel_router.post("/seed")
async def seed_hotel_data(db: Session = Depends(get_db)):
    """Seed hotel data from Kaggle dataset"""
    import pandas as pd
    import re
    
    # Check if data already exists
    existing = db.query(HotelModel).count()
    if existing > 0:
        return {"message": "Hotel data already seeded", "hotels": existing}
    
    # Load dataset
    dataset_path = os.path.join(os.path.dirname(__file__), "hotels_dataset.csv")
    if not os.path.exists(dataset_path):
        raise HTTPException(status_code=500, detail="Dataset file not found")
    
    df = pd.read_csv(dataset_path)
    
    # Clean and process data
    df = df.drop_duplicates(subset=['Hotel Name'], keep='first')
    df = df.dropna(subset=['Hotel Name', 'City', 'State'])
    
    # Star category mapping
    star_map = {"1 Star": 1, "2 Star": 2, "3 Star": 3, "4 Star": 4, "5 Star": 5}
    
    # Price ranges by star category
    price_ranges = {
        1: (800, 2000),
        2: (1500, 4000),
        3: (3000, 8000),
        4: (6000, 15000),
        5: (12000, 50000)
    }
    
    # Amenities by star category
    amenities_by_star = {
        1: [
            {"name": "Free WiFi", "icon": "Wifi", "category": "connectivity"},
            {"name": "24/7 Front Desk", "icon": "Clock", "category": "service"},
            {"name": "Room Service", "icon": "Utensils", "category": "dining"},
            {"name": "Housekeeping", "icon": "Sparkles", "category": "service"}
        ],
        2: [
            {"name": "Free WiFi", "icon": "Wifi", "category": "connectivity"},
            {"name": "Air Conditioning", "icon": "Thermometer", "category": "comfort"},
            {"name": "TV", "icon": "Tv", "category": "entertainment"},
            {"name": "24/7 Front Desk", "icon": "Clock", "category": "service"},
            {"name": "Room Service", "icon": "Utensils", "category": "dining"},
            {"name": "Parking", "icon": "Car", "category": "facility"}
        ],
        3: [
            {"name": "Free WiFi", "icon": "Wifi", "category": "connectivity"},
            {"name": "Air Conditioning", "icon": "Thermometer", "category": "comfort"},
            {"name": "Smart TV", "icon": "Tv", "category": "entertainment"},
            {"name": "24/7 Front Desk", "icon": "Clock", "category": "service"},
            {"name": "Room Service", "icon": "Utensils", "category": "dining"},
            {"name": "Restaurant", "icon": "UtensilsCrossed", "category": "dining"},
            {"name": "Parking", "icon": "Car", "category": "facility"},
            {"name": "Laundry Service", "icon": "Shirt", "category": "service"},
            {"name": "Elevator", "icon": "ArrowUpDown", "category": "facility"}
        ],
        4: [
            {"name": "High-Speed WiFi", "icon": "Wifi", "category": "connectivity"},
            {"name": "Air Conditioning", "icon": "Thermometer", "category": "comfort"},
            {"name": "Smart TV", "icon": "Tv", "category": "entertainment"},
            {"name": "24/7 Concierge", "icon": "Clock", "category": "service"},
            {"name": "In-Room Dining", "icon": "Utensils", "category": "dining"},
            {"name": "Multi-Cuisine Restaurant", "icon": "UtensilsCrossed", "category": "dining"},
            {"name": "Swimming Pool", "icon": "Waves", "category": "recreation"},
            {"name": "Fitness Center", "icon": "Dumbbell", "category": "recreation"},
            {"name": "Spa", "icon": "Sparkles", "category": "wellness"},
            {"name": "Valet Parking", "icon": "Car", "category": "facility"},
            {"name": "Business Center", "icon": "Briefcase", "category": "business"},
            {"name": "Banquet Hall", "icon": "Building", "category": "events"}
        ],
        5: [
            {"name": "Premium WiFi", "icon": "Wifi", "category": "connectivity"},
            {"name": "Climate Control", "icon": "Thermometer", "category": "comfort"},
            {"name": "65\" Smart TV", "icon": "Tv", "category": "entertainment"},
            {"name": "Butler Service", "icon": "User", "category": "service"},
            {"name": "24/7 Room Service", "icon": "Utensils", "category": "dining"},
            {"name": "Fine Dining Restaurants", "icon": "UtensilsCrossed", "category": "dining"},
            {"name": "Infinity Pool", "icon": "Waves", "category": "recreation"},
            {"name": "World-Class Gym", "icon": "Dumbbell", "category": "recreation"},
            {"name": "Luxury Spa", "icon": "Sparkles", "category": "wellness"},
            {"name": "Valet Parking", "icon": "Car", "category": "facility"},
            {"name": "Executive Lounge", "icon": "Briefcase", "category": "business"},
            {"name": "Helipad", "icon": "Plane", "category": "facility"},
            {"name": "Private Beach", "icon": "Umbrella", "category": "recreation"},
            {"name": "Golf Course", "icon": "Circle", "category": "recreation"},
            {"name": "Kids Club", "icon": "Baby", "category": "family"}
        ]
    }
    
    # Room types by star category
    room_types_by_star = {
        1: [
            {"type": "Standard", "name": "Standard Room", "bed": "Double Bed", "size": 180, "price_mult": 1.0, "guests": 2},
            {"type": "Deluxe", "name": "Deluxe Room", "bed": "Queen Bed", "size": 220, "price_mult": 1.3, "guests": 2}
        ],
        2: [
            {"type": "Standard", "name": "Standard Room", "bed": "Double Bed", "size": 200, "price_mult": 1.0, "guests": 2},
            {"type": "Deluxe", "name": "Deluxe Room", "bed": "Queen Bed", "size": 250, "price_mult": 1.3, "guests": 2},
            {"type": "Family", "name": "Family Room", "bed": "2 Double Beds", "size": 320, "price_mult": 1.6, "guests": 4}
        ],
        3: [
            {"type": "Standard", "name": "Standard Room", "bed": "Queen Bed", "size": 250, "price_mult": 1.0, "guests": 2},
            {"type": "Superior", "name": "Superior Room", "bed": "King Bed", "size": 300, "price_mult": 1.25, "guests": 2},
            {"type": "Deluxe", "name": "Deluxe Room", "bed": "King Bed", "size": 350, "price_mult": 1.5, "guests": 3},
            {"type": "Suite", "name": "Junior Suite", "bed": "King Bed", "size": 450, "price_mult": 2.0, "guests": 3}
        ],
        4: [
            {"type": "Superior", "name": "Superior Room", "bed": "King Bed", "size": 320, "price_mult": 1.0, "guests": 2},
            {"type": "Deluxe", "name": "Deluxe Room", "bed": "King Bed", "size": 380, "price_mult": 1.3, "guests": 2},
            {"type": "Premium", "name": "Premium Room", "bed": "King Bed", "size": 420, "price_mult": 1.5, "guests": 3},
            {"type": "Suite", "name": "Executive Suite", "bed": "King Bed", "size": 550, "price_mult": 2.0, "guests": 3},
            {"type": "Family Suite", "name": "Family Suite", "bed": "2 King Beds", "size": 650, "price_mult": 2.5, "guests": 5}
        ],
        5: [
            {"type": "Deluxe", "name": "Luxury Room", "bed": "King Bed", "size": 400, "price_mult": 1.0, "guests": 2},
            {"type": "Premium", "name": "Grand Room", "bed": "King Bed", "size": 480, "price_mult": 1.3, "guests": 2},
            {"type": "Suite", "name": "Executive Suite", "bed": "King Bed", "size": 600, "price_mult": 1.8, "guests": 3},
            {"type": "Club Suite", "name": "Club Suite", "bed": "King Bed", "size": 750, "price_mult": 2.2, "guests": 3},
            {"type": "Presidential", "name": "Presidential Suite", "bed": "Super King Bed", "size": 1200, "price_mult": 4.0, "guests": 4},
            {"type": "Villa", "name": "Private Villa", "bed": "2 King Beds", "size": 2000, "price_mult": 6.0, "guests": 6}
        ]
    }
    
    # Hotel images by star category (high quality Unsplash images)
    hotel_images = {
        1: [
            "https://images.unsplash.com/photo-1566073771259-6a8506099945?w=1200&q=80",
            "https://images.unsplash.com/photo-1582719508461-905c673771fd?w=1200&q=80",
            "https://images.unsplash.com/photo-1520250497591-112f2f40a3f4?w=1200&q=80"
        ],
        2: [
            "https://images.unsplash.com/photo-1551882547-ff40c63fe5fa?w=1200&q=80",
            "https://images.unsplash.com/photo-1564501049412-61c2a3083791?w=1200&q=80",
            "https://images.unsplash.com/photo-1571003123894-1f0594d2b5d9?w=1200&q=80",
            "https://images.unsplash.com/photo-1584132967334-10e028bd69f7?w=1200&q=80"
        ],
        3: [
            "https://images.unsplash.com/photo-1542314831-068cd1dbfeeb?w=1200&q=80",
            "https://images.unsplash.com/photo-1445019980597-93fa8acb246c?w=1200&q=80",
            "https://images.unsplash.com/photo-1584132915807-fd1f5fbc078f?w=1200&q=80",
            "https://images.unsplash.com/photo-1568084680786-a84f91d1153c?w=1200&q=80",
            "https://images.unsplash.com/photo-1578683010236-d716f9a3f461?w=1200&q=80"
        ],
        4: [
            "https://images.unsplash.com/photo-1596436889106-be35e843f974?w=1200&q=80",
            "https://images.unsplash.com/photo-1566665797739-1674de7a421a?w=1200&q=80",
            "https://images.unsplash.com/photo-1560200353-ce0a76b1d438?w=1200&q=80",
            "https://images.unsplash.com/photo-1582719478250-c89cae4dc85b?w=1200&q=80",
            "https://images.unsplash.com/photo-1549294413-26f195200c16?w=1200&q=80",
            "https://images.unsplash.com/photo-1611892440504-42a792e24d32?w=1200&q=80"
        ],
        5: [
            "https://images.unsplash.com/photo-1613490493576-7fde63acd811?w=1200&q=80",
            "https://images.unsplash.com/photo-1580587771525-78b9dba3b914?w=1200&q=80",
            "https://images.unsplash.com/photo-1615460549969-36fa19521a4f?w=1200&q=80",
            "https://images.unsplash.com/photo-1602002418082-a4443e081dd1?w=1200&q=80",
            "https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=1200&q=80",
            "https://images.unsplash.com/photo-1618773928121-c32242e63f39?w=1200&q=80",
            "https://images.unsplash.com/photo-1631049307264-da0ec9d70304?w=1200&q=80"
        ]
    }
    
    # Policies
    default_policies = [
        {"title": "Check-in Time", "description": "Check-in starts at 2:00 PM. Early check-in subject to availability.", "category": "check_in"},
        {"title": "Check-out Time", "description": "Check-out by 11:00 AM. Late check-out subject to availability and charges.", "category": "check_out"},
        {"title": "Cancellation Policy", "description": "Free cancellation up to 48 hours before check-in. 50% charge for cancellations within 24-48 hours. No refund for no-shows.", "category": "cancellation"},
        {"title": "ID Proof Required", "description": "Valid government-issued photo ID mandatory for all guests at check-in.", "category": "documents"},
        {"title": "Children Policy", "description": "Children under 5 years stay free. Extra bed charges may apply for older children.", "category": "children"},
        {"title": "Pet Policy", "description": "Pets are not allowed. Service animals are welcome with proper documentation.", "category": "pets"},
        {"title": "Smoking Policy", "description": "Smoking is prohibited in all indoor areas. Designated smoking zones available.", "category": "smoking"}
    ]
    
    hotels_created = 0
    rooms_created = 0
    
    for _, row in df.iterrows():
        try:
            # Get star category
            star_category = star_map.get(row['Category'], 3)
            
            # Generate price
            price_range = price_ranges[star_category]
            base_price = random.randint(price_range[0], price_range[1])
            original_price = int(base_price * random.uniform(1.1, 1.3)) if random.random() > 0.5 else None
            
            # Generate slug
            hotel_name = str(row['Hotel Name']).strip()
            city = str(row['City']).strip()
            slug = re.sub(r'[^a-z0-9]+', '-', hotel_name.lower()).strip('-')
            slug = f"{slug}-{city.lower()}-{hotels_created}"
            
            # Random coordinates for the city (approximate)
            city_coords = {
                "Mumbai": (19.0760, 72.8777),
                "Delhi": (28.7041, 77.1025),
                "New Delhi": (28.6139, 77.2090),
                "Bangalore": (12.9716, 77.5946),
                "Chennai": (13.0827, 80.2707),
                "Hyderabad": (17.3850, 78.4867),
                "Kolkata": (22.5726, 88.3639),
                "Pune": (18.5204, 73.8567),
                "Ahmedabad": (23.0225, 72.5714),
                "Jaipur": (26.9124, 75.7873),
                "Goa": (15.2993, 74.1240),
            }
            
            base_lat, base_lng = city_coords.get(city, (20.5937, 78.9629))
            lat = base_lat + random.uniform(-0.05, 0.05)
            lng = base_lng + random.uniform(-0.05, 0.05)
            
            # Create hotel
            hotel = HotelModel(
                name=hotel_name,
                slug=slug,
                description=f"Welcome to {hotel_name}, a {star_category}-star hotel located in {city}, {row['State']}. Experience comfort and hospitality at its finest.",
                star_category=star_category,
                hotel_type=row.get('Hotel Type', 'Hotel'),
                city=city,
                state=str(row['State']).strip(),
                country="India",
                address=str(row.get('Address', '')).strip() if pd.notna(row.get('Address')) else None,
                latitude=lat,
                longitude=lng,
                landmark=f"Near City Center, {city}",
                distance_from_center=round(random.uniform(0.5, 15), 1),
                rating=round(random.uniform(3.5, 4.9), 1) if star_category >= 3 else round(random.uniform(2.5, 4.0), 1),
                reviews_count=random.randint(50, 2000),
                price_per_night=base_price,
                original_price=original_price,
                currency="INR",
                amenities=json.dumps(amenities_by_star[star_category]),
                images=json.dumps([{"url": img, "caption": f"Hotel view {i+1}", "is_primary": i==0} for i, img in enumerate(hotel_images[star_category])]),
                policies=json.dumps(default_policies),
                check_in_time="14:00",
                check_out_time="11:00",
                contact_phone=f"+91-{random.randint(7000000000, 9999999999)}",
                contact_email=f"reservations@{slug.split('-')[0]}.com",
                gst_number=f"GST{random.randint(10, 99)}{''.join(random.choices('ABCDEFGHIJKLMNOPQRSTUVWXYZ', k=4))}{random.randint(1000, 9999)}Z{random.randint(1, 9)}",
                is_featured=1 if star_category >= 4 and random.random() > 0.7 else 0,
                free_cancellation=1 if random.random() > 0.3 else 0,
                breakfast_included=1 if star_category >= 3 and random.random() > 0.5 else 0,
                total_rooms=int(row.get('Total Rooms', random.randint(30, 200))) if pd.notna(row.get('Total Rooms')) else random.randint(30, 200)
            )
            
            db.add(hotel)
            db.flush()
            hotels_created += 1
            
            # Create rooms for this hotel
            for room_config in room_types_by_star[star_category]:
                room_price = int(base_price * room_config["price_mult"])
                room_original = int(room_price * 1.2) if original_price else None
                
                room_amenities = ["Air Conditioning", "TV", "WiFi", "Wardrobe", "Bathroom"]
                if star_category >= 3:
                    room_amenities.extend(["Mini Bar", "Safe", "Iron", "Hairdryer"])
                if star_category >= 4:
                    room_amenities.extend(["Coffee Maker", "Bathrobe", "Slippers", "Work Desk"])
                if star_category >= 5:
                    room_amenities.extend(["Butler Service", "Premium Toiletries", "Pillow Menu", "Nespresso Machine"])
                
                inclusions = ["Daily Housekeeping"]
                if hotel.breakfast_included:
                    inclusions.append("Complimentary Breakfast")
                if star_category >= 3:
                    inclusions.append("Free WiFi")
                if star_category >= 4:
                    inclusions.extend(["Welcome Drink", "Airport Transfer Discount"])
                
                room = HotelRoomModel(
                    hotel_id=hotel.id,
                    room_type=room_config["type"],
                    room_name=room_config["name"],
                    description=f"Comfortable {room_config['name'].lower()} featuring {room_config['bed'].lower()} and modern amenities.",
                    max_guests=room_config["guests"],
                    max_adults=min(room_config["guests"], 3),
                    max_children=max(0, room_config["guests"] - 2),
                    bed_type=room_config["bed"],
                    room_size_sqft=room_config["size"],
                    view_type=random.choice(["City View", "Garden View", "Pool View", "Mountain View"]) if star_category >= 3 else None,
                    price_per_night=room_price,
                    original_price=room_original,
                    discount_percent=round((1 - room_price/room_original) * 100, 0) if room_original else 0,
                    amenities=json.dumps(room_amenities),
                    images=json.dumps([hotel_images[star_category][i % len(hotel_images[star_category])] for i in range(3)]),
                    inclusions=json.dumps(inclusions),
                    cancellation_policy="Free cancellation up to 48 hours before check-in",
                    total_rooms=random.randint(5, 20),
                    available_rooms=random.randint(3, 15),
                    is_refundable=1 if random.random() > 0.2 else 0
                )
                db.add(room)
                rooms_created += 1
            
        except Exception as e:
            logging.error(f"Error processing hotel: {e}")
            continue
    
    db.commit()
    
    return {
        "message": "Hotel data seeded successfully",
        "hotels": hotels_created,
        "rooms": rooms_created
    }


# Register hotel router
app.include_router(hotel_router)


# =============================
# Advanced Restaurant Booking Router
# =============================
restaurant_router = APIRouter(prefix="/api/restaurant", tags=["Restaurants"])

# Restaurant Images for variety
RESTAURANT_IMAGES = [
    "https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=800&q=80",
    "https://images.unsplash.com/photo-1552566626-52f8b828add9?w=800&q=80",
    "https://images.unsplash.com/photo-1514933651103-005eec06c04b?w=800&q=80",
    "https://images.unsplash.com/photo-1555396273-367ea4eb4db5?w=800&q=80",
    "https://images.unsplash.com/photo-1466978913421-dad2ebd01d17?w=800&q=80",
    "https://images.unsplash.com/photo-1559339352-11d035aa65de?w=800&q=80",
    "https://images.unsplash.com/photo-1544148103-0773bf10d330?w=800&q=80",
    "https://images.unsplash.com/photo-1537047902294-62a40c20a6ae?w=800&q=80",
    "https://images.unsplash.com/photo-1550966871-3ed3cdb5ed0c?w=800&q=80",
    "https://images.unsplash.com/photo-1424847651672-bf20a4b0982b?w=800&q=80",
    "https://images.unsplash.com/photo-1578474846511-04ba529f0b88?w=800&q=80",
    "https://images.unsplash.com/photo-1590846406792-0adc7f938f1d?w=800&q=80",
    "https://images.unsplash.com/photo-1564759298141-cef86f51d4d4?w=800&q=80",
    "https://images.unsplash.com/photo-1551632436-cbf8dd35adfa?w=800&q=80",
    "https://images.unsplash.com/photo-1540189549336-e6e99c3679fe?w=800&q=80"
]

FOOD_IMAGES = {
    "south_indian": [
        "https://images.unsplash.com/photo-1630383249896-424e482df921?w=400&q=80",
        "https://images.unsplash.com/photo-1589301760014-d929f3979dbc?w=400&q=80",
        "https://images.unsplash.com/photo-1567337710282-00832b415979?w=400&q=80"
    ],
    "north_indian": [
        "https://images.unsplash.com/photo-1585937421612-70a008356fbe?w=400&q=80",
        "https://images.unsplash.com/photo-1596797038530-2c107229654b?w=400&q=80",
        "https://images.unsplash.com/photo-1631515243349-e0cb75fb8d3a?w=400&q=80"
    ],
    "biryani": [
        "https://images.unsplash.com/photo-1563379091339-03b21ab4a4f8?w=400&q=80",
        "https://images.unsplash.com/photo-1589302168068-964664d93dc0?w=400&q=80"
    ],
    "fast_food": [
        "https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=400&q=80",
        "https://images.unsplash.com/photo-1550547660-d9450f859349?w=400&q=80"
    ],
    "street_food": [
        "https://images.unsplash.com/photo-1601050690597-df0568f70950?w=400&q=80",
        "https://images.unsplash.com/photo-1606491956689-2ea866880c84?w=400&q=80"
    ],
    "bakery": [
        "https://images.unsplash.com/photo-1558961363-fa8fdf82db35?w=400&q=80",
        "https://images.unsplash.com/photo-1509440159596-0249088772ff?w=400&q=80"
    ]
}

MENU_ITEMS_BY_CUISINE = {
    "south_indian": [
        {"name": "Masala Dosa", "price": 120, "is_veg": True, "prep_time": 15, "description": "Crispy rice crepe with potato filling"},
        {"name": "Idli Sambar", "price": 80, "is_veg": True, "prep_time": 10, "description": "Steamed rice cakes with lentil soup"},
        {"name": "Vada", "price": 60, "is_veg": True, "prep_time": 12, "description": "Crispy fried lentil donuts"},
        {"name": "Uttapam", "price": 100, "is_veg": True, "prep_time": 15, "description": "Thick rice pancake with vegetables"},
        {"name": "Pongal", "price": 90, "is_veg": True, "prep_time": 15, "description": "Rice and lentil porridge"},
        {"name": "Rava Dosa", "price": 110, "is_veg": True, "prep_time": 12, "description": "Semolina crepe"},
        {"name": "Filter Coffee", "price": 40, "is_veg": True, "prep_time": 5, "description": "Traditional South Indian coffee"},
        {"name": "Rasam Rice", "price": 100, "is_veg": True, "prep_time": 15, "description": "Tangy soup with rice"},
    ],
    "north_indian": [
        {"name": "Butter Chicken", "price": 320, "is_veg": False, "prep_time": 25, "description": "Creamy tomato-based chicken curry"},
        {"name": "Paneer Butter Masala", "price": 280, "is_veg": True, "prep_time": 20, "description": "Cottage cheese in rich tomato gravy"},
        {"name": "Dal Makhani", "price": 220, "is_veg": True, "prep_time": 30, "description": "Creamy black lentils"},
        {"name": "Tandoori Roti", "price": 30, "is_veg": True, "prep_time": 8, "description": "Clay oven baked bread"},
        {"name": "Butter Naan", "price": 50, "is_veg": True, "prep_time": 8, "description": "Soft leavened bread"},
        {"name": "Chicken Tikka", "price": 280, "is_veg": False, "prep_time": 20, "description": "Grilled marinated chicken"},
        {"name": "Chole Bhature", "price": 150, "is_veg": True, "prep_time": 18, "description": "Spiced chickpeas with fried bread"},
        {"name": "Rajma Chawal", "price": 160, "is_veg": True, "prep_time": 20, "description": "Kidney beans curry with rice"},
    ],
    "biryani": [
        {"name": "Hyderabadi Chicken Biryani", "price": 280, "is_veg": False, "prep_time": 35, "description": "Fragrant rice with spiced chicken"},
        {"name": "Mutton Biryani", "price": 350, "is_veg": False, "prep_time": 40, "description": "Rice layered with tender mutton"},
        {"name": "Veg Biryani", "price": 200, "is_veg": True, "prep_time": 30, "description": "Aromatic rice with vegetables"},
        {"name": "Chicken 65 Biryani", "price": 300, "is_veg": False, "prep_time": 35, "description": "Biryani topped with Chicken 65"},
        {"name": "Egg Biryani", "price": 180, "is_veg": False, "prep_time": 25, "description": "Biryani with boiled eggs"},
        {"name": "Raita", "price": 50, "is_veg": True, "prep_time": 5, "description": "Yogurt with cucumber"},
    ],
    "fast_food": [
        {"name": "Veg Burger", "price": 120, "is_veg": True, "prep_time": 10, "description": "Crispy veggie patty burger"},
        {"name": "Chicken Burger", "price": 150, "is_veg": False, "prep_time": 12, "description": "Juicy chicken burger"},
        {"name": "French Fries", "price": 80, "is_veg": True, "prep_time": 8, "description": "Crispy golden fries"},
        {"name": "Pizza Margherita", "price": 250, "is_veg": True, "prep_time": 20, "description": "Classic cheese pizza"},
        {"name": "Chicken Wings", "price": 200, "is_veg": False, "prep_time": 15, "description": "Spicy fried wings"},
        {"name": "Pasta Alfredo", "price": 180, "is_veg": True, "prep_time": 15, "description": "Creamy white sauce pasta"},
    ],
    "street_food": [
        {"name": "Pani Puri", "price": 60, "is_veg": True, "prep_time": 5, "description": "Crispy shells with spiced water"},
        {"name": "Bhel Puri", "price": 70, "is_veg": True, "prep_time": 5, "description": "Puffed rice snack"},
        {"name": "Pav Bhaji", "price": 120, "is_veg": True, "prep_time": 15, "description": "Spiced vegetable mash with bread"},
        {"name": "Vada Pav", "price": 40, "is_veg": True, "prep_time": 8, "description": "Mumbai's favorite snack"},
        {"name": "Samosa", "price": 30, "is_veg": True, "prep_time": 10, "description": "Crispy potato-filled pastry"},
        {"name": "Chole Tikki", "price": 80, "is_veg": True, "prep_time": 12, "description": "Potato patty with chickpeas"},
    ],
    "bakery": [
        {"name": "Chocolate Cake", "price": 150, "is_veg": True, "prep_time": 5, "description": "Rich chocolate slice"},
        {"name": "Croissant", "price": 80, "is_veg": True, "prep_time": 3, "description": "Buttery flaky pastry"},
        {"name": "Brownie", "price": 100, "is_veg": True, "prep_time": 3, "description": "Fudgy chocolate brownie"},
        {"name": "Cold Coffee", "price": 120, "is_veg": True, "prep_time": 5, "description": "Chilled coffee with ice cream"},
        {"name": "Sandwich", "price": 100, "is_veg": True, "prep_time": 8, "description": "Grilled vegetable sandwich"},
        {"name": "Cookies", "price": 60, "is_veg": True, "prep_time": 2, "description": "Fresh baked cookies"},
    ]
}

RESTAURANT_AMENITIES = [
    {"name": "Free WiFi", "icon": "wifi"},
    {"name": "Parking", "icon": "car"},
    {"name": "Air Conditioning", "icon": "wind"},
    {"name": "Outdoor Seating", "icon": "sun"},
    {"name": "Live Music", "icon": "music"},
    {"name": "Private Dining", "icon": "lock"},
    {"name": "Wheelchair Accessible", "icon": "accessibility"},
    {"name": "Kids Play Area", "icon": "baby"},
    {"name": "Valet Parking", "icon": "key"},
    {"name": "Rooftop", "icon": "cloud"},
    {"name": "Party Hall", "icon": "party-popper"},
    {"name": "Buffet", "icon": "utensils"},
]


@restaurant_router.get("/cities")
async def get_restaurant_cities(db: Session = Depends(get_db)):
    """Get all cities with restaurants"""
    cities = db.query(
        RestaurantModel.city,
        func.count(RestaurantModel.id).label('count')
    ).filter(
        RestaurantModel.is_active == 1
    ).group_by(
        RestaurantModel.city
    ).order_by(
        func.count(RestaurantModel.id).desc()
    ).all()
    
    return [{"city": c[0], "restaurant_count": c[1]} for c in cities]


@restaurant_router.get("/popular-cities")
async def get_popular_cities(limit: int = 12, db: Session = Depends(get_db)):
    """Get popular cities for restaurants"""
    cities = db.query(
        RestaurantModel.city,
        func.count(RestaurantModel.id).label('count')
    ).filter(
        RestaurantModel.is_active == 1
    ).group_by(
        RestaurantModel.city
    ).order_by(
        func.count(RestaurantModel.id).desc()
    ).limit(limit).all()
    
    city_images = {
        "Kolkata": "https://images.unsplash.com/photo-1558431382-27e303142255?w=400&q=80",
        "Mumbai": "https://images.unsplash.com/photo-1570168007204-dfb528c6958f?w=400&q=80",
        "Delhi": "https://images.unsplash.com/photo-1587474260584-136574528ed5?w=400&q=80",
        "Chennai": "https://images.unsplash.com/photo-1582510003544-4d00b7f74220?w=400&q=80",
        "Bangalore": "https://images.unsplash.com/photo-1596176530529-78163a4f7af2?w=400&q=80",
        "Hyderabad": "https://images.unsplash.com/photo-1572445271230-a8a90d2b6405?w=400&q=80",
        "Pune": "https://images.unsplash.com/photo-1567157577867-05ccb1388e66?w=400&q=80",
        "Jaipur": "https://images.unsplash.com/photo-1477587458883-47145ed94245?w=400&q=80",
        "Lucknow": "https://images.unsplash.com/photo-1578662996442-48f60103fc96?w=400&q=80",
        "Ahmedabad": "https://images.unsplash.com/photo-1569154941061-e231b4725ef1?w=400&q=80"
    }
    
    return [{
        "city": c[0],
        "restaurant_count": c[1],
        "image": city_images.get(c[0], f"https://source.unsplash.com/400x300/?{c[0]},india,city")
    } for c in cities]


@restaurant_router.get("/featured")
async def get_featured_restaurants(city: Optional[str] = None, limit: int = 8, db: Session = Depends(get_db)):
    """Get featured/trending restaurants"""
    query = db.query(RestaurantModel).filter(
        RestaurantModel.is_active == 1,
        RestaurantModel.is_featured == 1
    )
    
    if city:
        query = query.filter(RestaurantModel.city.ilike(f"%{city}%"))
    
    restaurants = query.order_by(RestaurantModel.rating.desc()).limit(limit).all()
    
    return [{
        "id": r.id,
        "name": r.name,
        "city": r.city,
        "cuisines": r.cuisines or [],
        "rating": r.rating,
        "price_for_two": r.price_for_two,
        "is_pure_veg": bool(r.is_pure_veg),
        "cover_image": r.cover_image or RESTAURANT_IMAGES[r.id % len(RESTAURANT_IMAGES)],
        "is_trending": bool(r.is_trending)
    } for r in restaurants]


@restaurant_router.get("/popular")
async def get_popular_restaurants(city: Optional[str] = None, limit: int = 12, db: Session = Depends(get_db)):
    """Get popular restaurants - alias for featured"""
    query = db.query(RestaurantModel).filter(
        RestaurantModel.is_active == 1
    )
    
    if city:
        query = query.filter(RestaurantModel.city.ilike(f"%{city}%"))
    
    # Get top rated restaurants
    restaurants = query.order_by(RestaurantModel.rating.desc()).limit(limit).all()
    
    return {
        "restaurants": [{
            "id": r.id,
            "name": r.name,
            "city": r.city,
            "cuisines": r.cuisines,
            "rating": r.rating,
            "price_for_two": r.price_for_two,
            "is_pure_veg": bool(r.is_pure_veg),
            "cover_image": r.cover_image or RESTAURANT_IMAGES[r.id % len(RESTAURANT_IMAGES)],
            "is_trending": bool(r.is_trending),
            "address": r.address
        } for r in restaurants]
    }


@restaurant_router.post("/search")
async def search_restaurants(request: RestaurantSearchRequest, db: Session = Depends(get_db)):
    """Search restaurants with filters"""
    query = db.query(RestaurantModel).filter(
        RestaurantModel.is_active == 1,
        RestaurantModel.city.ilike(f"%{request.city}%")
    )
    
    # Apply filters
    if request.cuisines:
        # Filter by cuisines (JSON array contains)
        for cuisine in request.cuisines:
            query = query.filter(RestaurantModel.cuisines.contains(cuisine))
    
    if request.is_pure_veg is not None:
        query = query.filter(RestaurantModel.is_pure_veg == (1 if request.is_pure_veg else 0))
    
    if request.has_bar is not None:
        query = query.filter(RestaurantModel.has_bar == (1 if request.has_bar else 0))
    
    if request.price_category:
        query = query.filter(RestaurantModel.price_category == request.price_category)
    
    if request.min_rating:
        query = query.filter(RestaurantModel.rating >= request.min_rating)
    
    if request.has_outdoor_seating is not None:
        query = query.filter(RestaurantModel.has_outdoor_seating == (1 if request.has_outdoor_seating else 0))
    
    if request.has_ac is not None:
        query = query.filter(RestaurantModel.has_ac == (1 if request.has_ac else 0))
    
    # Sorting
    if request.sort_by == "rating":
        query = query.order_by(RestaurantModel.rating.desc())
    elif request.sort_by == "price_low":
        query = query.order_by(RestaurantModel.price_for_two.asc())
    elif request.sort_by == "price_high":
        query = query.order_by(RestaurantModel.price_for_two.desc())
    else:
        query = query.order_by(RestaurantModel.popularity_score.desc(), RestaurantModel.rating.desc())
    
    # Get total count
    total = query.count()
    
    # Pagination
    offset = (request.page - 1) * request.limit
    restaurants = query.offset(offset).limit(request.limit).all()
    
    return {
        "total": total,
        "page": request.page,
        "limit": request.limit,
        "total_pages": (total + request.limit - 1) // request.limit,
        "restaurants": [{
            "id": r.id,
            "name": r.name,
            "slug": r.slug,
            "city": r.city,
            "locality": r.locality,
            "address": r.address,
            "cuisines": r.cuisines or [],
            "restaurant_type": r.restaurant_type,
            "rating": r.rating,
            "total_reviews": r.total_reviews,
            "price_for_two": r.price_for_two,
            "price_category": r.price_category,
            "is_pure_veg": bool(r.is_pure_veg),
            "has_bar": bool(r.has_bar),
            "is_family_friendly": bool(r.is_family_friendly),
            "has_outdoor_seating": bool(r.has_outdoor_seating),
            "has_ac": bool(r.has_ac),
            "has_delivery": bool(r.has_delivery),
            "avg_delivery_time": r.avg_delivery_time,
            "opening_time": r.opening_time,
            "closing_time": r.closing_time,
            "is_open_now": bool(r.is_open_now),
            "cover_image": r.cover_image or RESTAURANT_IMAGES[r.id % len(RESTAURANT_IMAGES)],
            "images": r.images or [RESTAURANT_IMAGES[(r.id + i) % len(RESTAURANT_IMAGES)] for i in range(4)],
            "amenities": [a.get("name", a) if isinstance(a, dict) else a for a in (r.amenities or [])],
            "is_featured": bool(r.is_featured),
            "is_trending": bool(r.is_trending)
        } for r in restaurants]
    }


@restaurant_router.get("/{restaurant_id}")
async def get_restaurant_detail(restaurant_id: int, db: Session = Depends(get_db)):
    """Get restaurant details"""
    restaurant = db.query(RestaurantModel).filter(
        RestaurantModel.id == restaurant_id,
        RestaurantModel.is_active == 1
    ).first()
    
    if not restaurant:
        raise HTTPException(status_code=404, detail="Restaurant not found")
    
    return {
        "id": restaurant.id,
        "name": restaurant.name,
        "slug": restaurant.slug,
        "description": restaurant.description,
        "city": restaurant.city,
        "locality": restaurant.locality,
        "address": restaurant.address,
        "latitude": restaurant.latitude,
        "longitude": restaurant.longitude,
        "cuisines": restaurant.cuisines or [],
        "restaurant_type": restaurant.restaurant_type,
        "rating": restaurant.rating,
        "total_reviews": restaurant.total_reviews,
        "food_rating": restaurant.food_rating,
        "service_rating": restaurant.service_rating,
        "ambience_rating": restaurant.ambience_rating,
        "price_for_two": restaurant.price_for_two,
        "price_category": restaurant.price_category,
        "is_pure_veg": bool(restaurant.is_pure_veg),
        "has_bar": bool(restaurant.has_bar),
        "is_family_friendly": bool(restaurant.is_family_friendly),
        "has_outdoor_seating": bool(restaurant.has_outdoor_seating),
        "has_ac": bool(restaurant.has_ac),
        "has_wifi": bool(restaurant.has_wifi),
        "has_parking": bool(restaurant.has_parking),
        "accepts_reservations": bool(restaurant.accepts_reservations),
        "has_live_music": bool(restaurant.has_live_music),
        "has_private_dining": bool(restaurant.has_private_dining),
        "has_delivery": bool(restaurant.has_delivery),
        "has_takeaway": bool(restaurant.has_takeaway),
        "avg_delivery_time": restaurant.avg_delivery_time,
        "opening_time": restaurant.opening_time,
        "closing_time": restaurant.closing_time,
        "is_open_now": bool(restaurant.is_open_now),
        "weekly_off": restaurant.weekly_off,
        "images": restaurant.images or [{"url": RESTAURANT_IMAGES[(restaurant.id + i) % len(RESTAURANT_IMAGES)], "caption": f"Restaurant view {i+1}"} for i in range(6)],
        "logo_url": restaurant.logo_url,
        "cover_image": restaurant.cover_image or RESTAURANT_IMAGES[restaurant.id % len(RESTAURANT_IMAGES)],
        "phone": restaurant.phone,
        "email": restaurant.email,
        "website": restaurant.website,
        "amenities": restaurant.amenities or RESTAURANT_AMENITIES[:6],
        "is_featured": bool(restaurant.is_featured),
        "is_trending": bool(restaurant.is_trending)
    }


@restaurant_router.get("/{restaurant_id}/tables")
async def get_restaurant_tables(restaurant_id: int, db: Session = Depends(get_db)):
    """Get restaurant tables"""
    tables = db.query(RestaurantTableModel).filter(
        RestaurantTableModel.restaurant_id == restaurant_id,
        RestaurantTableModel.is_active == 1
    ).all()
    
    return {
        "tables": [{
            "id": t.id,
            "table_number": t.table_number,
            "capacity": t.capacity,
            "table_type": t.table_type,
            "seating_type": t.seating_type,
            "is_ac": bool(t.is_ac),
            "floor": t.floor,
            "description": t.description,
            "min_booking_amount": t.min_booking_amount
        } for t in tables]
    }


@restaurant_router.get("/{restaurant_id}/time-slots")
async def get_time_slots(restaurant_id: int, date: str, db: Session = Depends(get_db)):
    """Get available time slots for a date"""
    restaurant = db.query(RestaurantModel).filter(RestaurantModel.id == restaurant_id).first()
    if not restaurant:
        raise HTTPException(status_code=404, detail="Restaurant not found")
    
    # Generate time slots based on restaurant hours
    slots = []
    opening = int(restaurant.opening_time.split(":")[0])
    closing = int(restaurant.closing_time.split(":")[0])
    
    for hour in range(opening, closing):
        for minute in ["00", "30"]:
            slot_time = f"{hour:02d}:{minute}"
            is_peak = (12 <= hour <= 14) or (19 <= hour <= 22)
            
            slots.append({
                "slot_time": slot_time,
                "slot_type": "lunch" if hour < 16 else "dinner",
                "is_peak_hour": is_peak,
                "peak_hour_charge_percent": 15 if is_peak else 0,
                "is_available": True,
                "available_tables": random.randint(3, 10)
            })
    
    return {"date": date, "slots": slots}


@restaurant_router.get("/{restaurant_id}/menu")
async def get_restaurant_menu(restaurant_id: int, db: Session = Depends(get_db)):
    """Get restaurant menu"""
    restaurant = db.query(RestaurantModel).filter(RestaurantModel.id == restaurant_id).first()
    if not restaurant:
        raise HTTPException(status_code=404, detail="Restaurant not found")
    
    # Get menu items
    items = db.query(MenuItemModel).filter(
        MenuItemModel.restaurant_id == restaurant_id,
        MenuItemModel.is_active == 1
    ).all()
    
    # Get categories
    categories = db.query(MenuCategoryModel).filter(
        MenuCategoryModel.restaurant_id == restaurant_id,
        MenuCategoryModel.is_active == 1
    ).order_by(MenuCategoryModel.display_order).all()
    
    # Group items by category
    menu = []
    for cat in categories:
        cat_items = [i for i in items if i.category_id == cat.id]
        menu.append({
            "category": {
                "id": cat.id,
                "name": cat.name,
                "description": cat.description,
                "image_url": cat.image_url
            },
            "items": [{
                "id": item.id,
                "name": item.name,
                "description": item.description,
                "price": item.price,
                "discounted_price": item.discounted_price,
                "is_veg": bool(item.is_veg),
                "is_bestseller": bool(item.is_bestseller),
                "is_chef_special": bool(item.is_chef_special),
                "is_new": bool(item.is_new),
                "spice_level": item.spice_level,
                "prep_time_mins": item.prep_time_mins,
                "serves": item.serves,
                "image_url": item.image_url,
                "available_for_preorder": bool(item.available_for_preorder),
                "is_available": bool(item.is_available)
            } for item in cat_items]
        })
    
    return {"menu": menu}


@restaurant_router.post("/book")
async def book_table(
    booking: TableBookingCreate,
    current_user: UserModel = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Book a table at restaurant"""
    restaurant = db.query(RestaurantModel).filter(RestaurantModel.id == booking.restaurant_id).first()
    if not restaurant:
        raise HTTPException(status_code=404, detail="Restaurant not found")
    
    # Generate booking reference
    booking_ref = f"RB{datetime.now().strftime('%Y%m%d')}{random.randint(10000, 99999)}"
    
    # Calculate pricing
    base_amount = 200 if booking.guests_count <= 2 else 100 * booking.guests_count  # Cover charge
    
    # Check if peak hour
    hour = int(booking.time_slot.split(":")[0])
    is_peak = (12 <= hour <= 14) or (19 <= hour <= 22)
    peak_charge = base_amount * 0.15 if is_peak else 0
    
    service_charge = (base_amount + peak_charge) * 0.05
    gst = (base_amount + peak_charge + service_charge) * 0.05
    total = base_amount + peak_charge + service_charge + gst
    
    # Generate QR code
    qr_data = f"WANDERLITE-REST-{booking_ref}"
    qr = qrcode.QRCode(version=1, box_size=10, border=5)
    qr.add_data(qr_data)
    qr.make(fit=True)
    qr_img = qr.make_image(fill_color="black", back_color="white")
    buffer = BytesIO()
    qr_img.save(buffer, format='PNG')
    qr_base64 = base64.b64encode(buffer.getvalue()).decode()
    
    # Create booking
    new_booking = RestaurantBookingModel(
        booking_reference=booking_ref,
        user_id=current_user.id,
        restaurant_id=booking.restaurant_id,
        booking_date=datetime.strptime(booking.booking_date, "%Y-%m-%d").date(),
        time_slot=booking.time_slot,
        guests_count=booking.guests_count,
        table_id=booking.table_id,
        seating_preference=booking.seating_preference,
        guest_name=booking.guest_name,
        guest_phone=booking.guest_phone,
        guest_email=booking.guest_email,
        special_requests=booking.special_requests,
        occasion=booking.occasion,
        base_amount=base_amount,
        peak_hour_charge=peak_charge,
        service_charge=service_charge,
        gst=gst,
        total_amount=total,
        payment_method=booking.payment_method or "pay_at_restaurant",
        payment_status="pending" if booking.payment_method == "pay_at_restaurant" else "paid",
        booking_status="confirmed",
        qr_code=qr_base64
    )
    
    db.add(new_booking)
    db.commit()
    db.refresh(new_booking)
    
    return {
        "booking": {
            "id": new_booking.id,
            "booking_reference": booking_ref,
            "restaurant_id": restaurant.id,
            "restaurant_name": restaurant.name,
            "restaurant_address": restaurant.address,
            "restaurant_phone": restaurant.phone,
            "booking_date": booking.booking_date,
            "time_slot": booking.time_slot,
            "guests_count": booking.guests_count,
            "guest_name": booking.guest_name,
            "guest_phone": booking.guest_phone,
            "guest_email": booking.guest_email,
            "special_requests": booking.special_requests,
            "occasion": booking.occasion,
            "base_amount": base_amount,
            "peak_hour_charge": peak_charge,
            "service_charge": service_charge,
            "gst": gst,
            "total_amount": total,
            "payment_status": new_booking.payment_status,
            "payment_method": new_booking.payment_method,
            "booking_status": "confirmed",
            "qr_code": qr_base64,
            "created_at": new_booking.created_at.isoformat()
        }
    }


@restaurant_router.post("/pre-order")
async def create_pre_order(
    order: PreOrderCreate,
    current_user: UserModel = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Create a pre-order for food"""
    restaurant = db.query(RestaurantModel).filter(RestaurantModel.id == order.restaurant_id).first()
    if not restaurant:
        raise HTTPException(status_code=404, detail="Restaurant not found")
    
    # Generate order reference
    order_ref = f"PO{datetime.now().strftime('%Y%m%d')}{random.randint(10000, 99999)}"
    
    # Calculate totals
    subtotal = 0
    items_list = []
    max_prep_time = 0
    
    for item_order in order.items:
        item = db.query(MenuItemModel).filter(MenuItemModel.id == item_order.get("item_id")).first()
        if item:
            item_total = item.price * item_order.get("quantity", 1)
            subtotal += item_total
            max_prep_time = max(max_prep_time, item.prep_time_mins)
            items_list.append({
                "item_id": item.id,
                "name": item.name,
                "quantity": item_order.get("quantity", 1),
                "price": item.price,
                "total": item_total,
                "is_veg": bool(item.is_veg)
            })
    
    gst = subtotal * 0.05
    packaging = 30 if subtotal > 0 else 0
    total = subtotal + gst + packaging
    
    # Calculate ready time
    arrival_dt = datetime.strptime(f"{order.order_date} {order.arrival_time}", "%Y-%m-%d %H:%M")
    ready_dt = arrival_dt - timedelta(minutes=5)
    
    # Generate QR code
    qr_data = f"WANDERLITE-PREORDER-{order_ref}"
    qr = qrcode.QRCode(version=1, box_size=10, border=5)
    qr.add_data(qr_data)
    qr.make(fit=True)
    qr_img = qr.make_image(fill_color="black", back_color="white")
    buffer = BytesIO()
    qr_img.save(buffer, format='PNG')
    qr_base64 = base64.b64encode(buffer.getvalue()).decode()
    
    # Create pre-order
    new_order = PreOrderModel(
        order_reference=order_ref,
        user_id=current_user.id,
        restaurant_id=order.restaurant_id,
        booking_id=order.booking_id,
        order_date=datetime.strptime(order.order_date, "%Y-%m-%d").date(),
        arrival_time=order.arrival_time,
        guests_count=order.guests_count,
        guest_name=order.guest_name,
        guest_phone=order.guest_phone,
        special_instructions=order.special_instructions,
        items=items_list,
        estimated_prep_time=max_prep_time,
        ready_by_time=ready_dt.strftime("%H:%M"),
        subtotal=subtotal,
        gst=gst,
        packaging_charge=packaging,
        total_amount=total,
        payment_method=order.payment_method or "pay_at_restaurant",
        payment_status="pending",
        order_status="confirmed",
        qr_code=qr_base64
    )
    
    db.add(new_order)
    db.commit()
    db.refresh(new_order)
    
    return {
        "id": new_order.id,
        "order_reference": order_ref,
        "restaurant_id": restaurant.id,
        "restaurant_name": restaurant.name,
        "order_date": order.order_date,
        "arrival_time": order.arrival_time,
        "guests_count": order.guests_count,
        "guest_name": order.guest_name,
        "items": items_list,
        "estimated_prep_time": max_prep_time,
        "ready_by_time": ready_dt.strftime("%H:%M"),
        "subtotal": subtotal,
        "gst": gst,
        "packaging_charge": packaging,
        "total_amount": total,
        "payment_status": "pending",
        "order_status": "confirmed",
        "qr_code": qr_base64,
        "created_at": new_order.created_at.isoformat()
    }


@restaurant_router.post("/queue/join")
async def join_queue(
    request: JoinQueueRequest,
    current_user: UserModel = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Join restaurant waiting queue"""
    restaurant = db.query(RestaurantModel).filter(RestaurantModel.id == request.restaurant_id).first()
    if not restaurant:
        raise HTTPException(status_code=404, detail="Restaurant not found")
    
    today = datetime.now().date()
    
    # Get current queue position
    last_queue = db.query(RestaurantQueueModel).filter(
        RestaurantQueueModel.restaurant_id == request.restaurant_id,
        RestaurantQueueModel.queue_date == today,
        RestaurantQueueModel.status == "waiting"
    ).order_by(RestaurantQueueModel.position.desc()).first()
    
    position = (last_queue.position + 1) if last_queue else 1
    queue_number = f"Q{position:03d}"
    
    # Estimate wait time (15 mins per party ahead)
    wait_time = position * 15
    
    # Generate QR code
    qr_data = f"WANDERLITE-QUEUE-{queue_number}-{today}"
    qr = qrcode.QRCode(version=1, box_size=10, border=5)
    qr.add_data(qr_data)
    qr.make(fit=True)
    qr_img = qr.make_image(fill_color="black", back_color="white")
    buffer = BytesIO()
    qr_img.save(buffer, format='PNG')
    qr_base64 = base64.b64encode(buffer.getvalue()).decode()
    
    # Create queue entry
    queue_entry = RestaurantQueueModel(
        queue_number=queue_number,
        user_id=current_user.id,
        restaurant_id=request.restaurant_id,
        queue_date=today,
        guests_count=request.guests_count,
        guest_name=request.guest_name,
        guest_phone=request.guest_phone,
        position=position,
        estimated_wait_mins=wait_time,
        status="waiting",
        qr_code=qr_base64
    )
    
    db.add(queue_entry)
    db.commit()
    db.refresh(queue_entry)
    
    return {
        "id": queue_entry.id,
        "queue_number": queue_number,
        "restaurant_id": restaurant.id,
        "restaurant_name": restaurant.name,
        "queue_date": today.isoformat(),
        "join_time": queue_entry.join_time.isoformat(),
        "guests_count": request.guests_count,
        "guest_name": request.guest_name,
        "position": position,
        "people_ahead": position - 1,
        "estimated_wait_mins": wait_time,
        "status": "waiting",
        "qr_code": qr_base64
    }


@restaurant_router.get("/queue/{queue_id}/status")
async def get_queue_status(queue_id: int, db: Session = Depends(get_db)):
    """Get queue status and position"""
    queue = db.query(RestaurantQueueModel).filter(RestaurantQueueModel.id == queue_id).first()
    if not queue:
        raise HTTPException(status_code=404, detail="Queue entry not found")
    
    restaurant = db.query(RestaurantModel).filter(RestaurantModel.id == queue.restaurant_id).first()
    
    # Calculate current position
    ahead = db.query(RestaurantQueueModel).filter(
        RestaurantQueueModel.restaurant_id == queue.restaurant_id,
        RestaurantQueueModel.queue_date == queue.queue_date,
        RestaurantQueueModel.status == "waiting",
        RestaurantQueueModel.position < queue.position
    ).count()
    
    return {
        "id": queue.id,
        "queue_number": queue.queue_number,
        "restaurant_name": restaurant.name if restaurant else "Unknown",
        "position": ahead + 1,
        "people_ahead": ahead,
        "estimated_wait_mins": ahead * 15,
        "status": queue.status,
        "join_time": queue.join_time.isoformat()
    }


@restaurant_router.post("/queue/{queue_id}/leave")
async def leave_queue(
    queue_id: int,
    current_user: UserModel = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Leave the waiting queue"""
    queue = db.query(RestaurantQueueModel).filter(
        RestaurantQueueModel.id == queue_id,
        RestaurantQueueModel.user_id == current_user.id
    ).first()
    
    if not queue:
        raise HTTPException(status_code=404, detail="Queue entry not found")
    
    queue.status = "left"
    queue.left_at = datetime.utcnow()
    db.commit()
    
    return {"message": "Successfully left the queue", "queue_number": queue.queue_number}


@restaurant_router.get("/booking/{booking_ref}")
async def get_restaurant_booking_by_ref(
    booking_ref: str,
    current_user: UserModel = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get a restaurant booking by booking reference"""
    booking = db.query(RestaurantBookingModel).filter(
        RestaurantBookingModel.booking_reference == booking_ref,
        RestaurantBookingModel.user_id == current_user.id
    ).first()
    
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")
    
    restaurant = db.query(RestaurantModel).filter(RestaurantModel.id == booking.restaurant_id).first()
    table = db.query(RestaurantTableModel).filter(RestaurantTableModel.id == booking.table_id).first() if booking.table_id else None
    
    # Get pre-order items if any
    pre_order_items = []
    if booking.pre_order_id:
        pre_order = db.query(RestaurantPreOrderModel).filter(RestaurantPreOrderModel.id == booking.pre_order_id).first()
        if pre_order:
            items = db.query(RestaurantPreOrderItemModel).filter(
                RestaurantPreOrderItemModel.pre_order_id == pre_order.id
            ).all()
            for item in items:
                menu_item = db.query(MenuItemModel).filter(MenuItemModel.id == item.menu_item_id).first()
                pre_order_items.append({
                    "id": item.id,
                    "name": menu_item.name if menu_item else "Unknown Item",
                    "quantity": item.quantity,
                    "price": item.unit_price,
                    "total": item.total_price
                })
    
    return {
        "booking": {
            "id": booking.id,
            "booking_reference": booking.booking_reference,
            "restaurant_id": booking.restaurant_id,
            "restaurant_name": restaurant.name if restaurant else "Unknown",
            "restaurant_city": restaurant.city if restaurant else "",
            "restaurant_address": restaurant.address if restaurant else "",
            "restaurant_cuisines": restaurant.cuisines if restaurant else "",
            "restaurant_rating": restaurant.rating if restaurant else 4.0,
            "booking_date": booking.booking_date.isoformat(),
            "time_slot": booking.time_slot,
            "guests_count": booking.guests_count,
            "table_number": table.table_number if table else None,
            "table_capacity": table.capacity if table else None,
            "table_type": table.table_type if table else None,
            "seating_preference": booking.seating_preference,
            "guest_name": booking.guest_name,
            "guest_email": booking.guest_email,
            "guest_phone": booking.guest_phone,
            "special_requests": booking.special_requests,
            "occasion": booking.occasion,
            "total_amount": booking.total_amount,
            "booking_status": booking.booking_status,
            "payment_status": booking.payment_status,
            "qr_code": booking.qr_code,
            "pre_order_items": pre_order_items,
            "created_at": booking.created_at.isoformat()
        }
    }


@restaurant_router.get("/my-bookings")
async def get_my_bookings(
    current_user: UserModel = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get user's restaurant bookings"""
    bookings = db.query(RestaurantBookingModel).filter(
        RestaurantBookingModel.user_id == current_user.id
    ).order_by(RestaurantBookingModel.created_at.desc()).all()
    
    result = []
    for b in bookings:
        restaurant = db.query(RestaurantModel).filter(RestaurantModel.id == b.restaurant_id).first()
        result.append({
            "id": b.id,
            "booking_reference": b.booking_reference,
            "restaurant_name": restaurant.name if restaurant else "Unknown",
            "restaurant_image": restaurant.cover_image if restaurant else None,
            "booking_date": b.booking_date.isoformat(),
            "time_slot": b.time_slot,
            "guests_count": b.guests_count,
            "total_amount": b.total_amount,
            "booking_status": b.booking_status,
            "payment_status": b.payment_status,
            "created_at": b.created_at.isoformat()
        })
    
    return {"bookings": result}


@restaurant_router.get("/{restaurant_id}/reviews")
async def get_restaurant_reviews(restaurant_id: int, page: int = 1, limit: int = 10, db: Session = Depends(get_db)):
    """Get restaurant reviews"""
    offset = (page - 1) * limit
    
    reviews = db.query(RestaurantReviewModel).filter(
        RestaurantReviewModel.restaurant_id == restaurant_id,
        RestaurantReviewModel.is_active == 1
    ).order_by(RestaurantReviewModel.created_at.desc()).offset(offset).limit(limit).all()
    
    total = db.query(RestaurantReviewModel).filter(
        RestaurantReviewModel.restaurant_id == restaurant_id,
        RestaurantReviewModel.is_active == 1
    ).count()
    
    result = []
    for r in reviews:
        user = db.query(UserModel).filter(UserModel.id == r.user_id).first()
        result.append({
            "id": r.id,
            "user_name": user.name if user else "Anonymous",
            "overall_rating": r.overall_rating,
            "food_rating": r.food_rating,
            "service_rating": r.service_rating,
            "ambience_rating": r.ambience_rating,
            "title": r.title,
            "review_text": r.review_text,
            "dining_type": r.dining_type,
            "visit_type": r.visit_type,
            "images": r.images or [],
            "is_verified": bool(r.is_verified),
            "helpful_count": r.helpful_count,
            "created_at": r.created_at.isoformat()
        })
    
    return {
        "total": total,
        "page": page,
        "reviews": result
    }


@restaurant_router.post("/seed")
async def seed_restaurants(db: Session = Depends(get_db)):
    """Seed restaurant data from CSV dataset"""
    import pandas as pd
    
    csv_path = os.path.join(os.path.dirname(__file__), "restaurants_dataset.csv")
    if not os.path.exists(csv_path):
        raise HTTPException(status_code=404, detail="Dataset file not found")
    
    df = pd.read_csv(csv_path)
    
    # Clear existing data
    db.query(MenuItemModel).delete()
    db.query(MenuCategoryModel).delete()
    db.query(RestaurantTableModel).delete()
    db.query(RestaurantModel).delete()
    db.commit()
    
    restaurants_created = 0
    tables_created = 0
    menu_items_created = 0
    
    # Limit to 5000 restaurants for performance
    df = df.head(5000)
    
    for idx, row in df.iterrows():
        try:
            # Determine cuisines from flags
            cuisines = []
            if row.get('south_indian_or_not') == 1:
                cuisines.append("South Indian")
            if row.get('north_indian_or_not') == 1:
                cuisines.append("North Indian")
            if row.get('biryani_or_not') == 1:
                cuisines.append("Biryani")
            if row.get('fast_food_or_not') == 1:
                cuisines.append("Fast Food")
            if row.get('street_food') == 1:
                cuisines.append("Street Food")
            if row.get('bakery_or_not') == 1:
                cuisines.append("Bakery")
            
            if not cuisines:
                cuisines = ["Multi-Cuisine"]
            
            # Determine price category
            price = row.get('average_price', 200)
            if price < 150:
                price_cat = "budget"
            elif price < 400:
                price_cat = "moderate"
            elif price < 800:
                price_cat = "expensive"
            else:
                price_cat = "premium"
            
            # Determine restaurant type
            if "Bakery" in cuisines:
                rest_type = "Cafe"
            elif "Fast Food" in cuisines:
                rest_type = "Quick Service"
            elif "Street Food" in cuisines:
                rest_type = "Street Food"
            elif price > 500:
                rest_type = "Fine Dining"
            else:
                rest_type = "Casual Dining"
            
            # Generate amenities
            amenities = random.sample(RESTAURANT_AMENITIES, random.randint(3, 7))
            
            # Create restaurant
            restaurant = RestaurantModel(
                name=row['restaurant_name'],
                slug=row['restaurant_name'].lower().replace(' ', '-').replace("'", "")[:50],
                description=f"A popular {', '.join(cuisines[:2])} restaurant in {row['location']}",
                city=row['location'],
                locality=f"{row['location']} Central",
                address=f"123, Main Road, {row['location']}",
                latitude=random.uniform(8.0, 35.0),
                longitude=random.uniform(68.0, 97.0),
                cuisines=cuisines,
                restaurant_type=rest_type,
                rating=min(float(row.get('rating', 4.0)), 5.0),
                total_reviews=random.randint(50, 500),
                food_rating=min(float(row.get('rating', 4.0)) + random.uniform(-0.2, 0.2), 5.0),
                service_rating=min(float(row.get('rating', 4.0)) + random.uniform(-0.3, 0.3), 5.0),
                ambience_rating=min(float(row.get('rating', 4.0)) + random.uniform(-0.2, 0.2), 5.0),
                price_for_two=int(price * 2),
                price_category=price_cat,
                is_pure_veg=1 if row.get('south_indian_or_not') == 1 and row.get('biryani_or_not') == 0 else random.randint(0, 1),
                has_bar=1 if price > 400 and random.random() > 0.5 else 0,
                is_family_friendly=1,
                has_outdoor_seating=random.randint(0, 1),
                has_ac=1 if price > 200 else random.randint(0, 1),
                has_wifi=random.randint(0, 1),
                has_parking=random.randint(0, 1),
                accepts_reservations=1,
                has_live_music=1 if price > 500 and random.random() > 0.7 else 0,
                has_private_dining=1 if price > 400 and random.random() > 0.6 else 0,
                has_delivery=1,
                has_takeaway=1,
                avg_delivery_time=int(row.get('average _delivery_time', 30)),
                opening_time="09:00" if "Bakery" in cuisines else "11:00",
                closing_time="22:00" if "Bakery" in cuisines else "23:00",
                is_open_now=1,
                images=[{"url": RESTAURANT_IMAGES[(idx + i) % len(RESTAURANT_IMAGES)], "caption": f"View {i+1}"} for i in range(5)],
                cover_image=RESTAURANT_IMAGES[idx % len(RESTAURANT_IMAGES)],
                phone=f"+91 {random.randint(7000000000, 9999999999)}",
                email=f"info@{row['restaurant_name'].lower().replace(' ', '')[:10]}.com",
                amenities=amenities,
                popularity_score=random.randint(50, 100),
                is_featured=1 if random.random() > 0.9 else 0,
                is_trending=1 if random.random() > 0.85 else 0
            )
            
            db.add(restaurant)
            db.flush()
            restaurants_created += 1
            
            # Create tables (3-8 per restaurant)
            for t in range(random.randint(3, 8)):
                table_types = ["standard", "booth", "window", "private"]
                seating_types = ["indoor", "outdoor"] if restaurant.has_outdoor_seating else ["indoor"]
                
                table = RestaurantTableModel(
                    restaurant_id=restaurant.id,
                    table_number=f"T{t+1}",
                    capacity=random.choice([2, 4, 4, 6, 8]),
                    table_type=random.choice(table_types),
                    seating_type=random.choice(seating_types),
                    is_ac=1 if restaurant.has_ac else 0,
                    floor=random.randint(0, 1),
                    min_booking_amount=0
                )
                db.add(table)
                tables_created += 1
            
            # Create menu categories and items
            for cuisine_key, items in MENU_ITEMS_BY_CUISINE.items():
                # Check if cuisine matches restaurant
                cuisine_map = {
                    "south_indian": "South Indian",
                    "north_indian": "North Indian",
                    "biryani": "Biryani",
                    "fast_food": "Fast Food",
                    "street_food": "Street Food",
                    "bakery": "Bakery"
                }
                
                if cuisine_map.get(cuisine_key) in cuisines or cuisines == ["Multi-Cuisine"]:
                    # Create category
                    category = MenuCategoryModel(
                        restaurant_id=restaurant.id,
                        name=cuisine_map.get(cuisine_key, cuisine_key.replace("_", " ").title()),
                        description=f"Delicious {cuisine_map.get(cuisine_key, cuisine_key)} dishes",
                        display_order=list(MENU_ITEMS_BY_CUISINE.keys()).index(cuisine_key)
                    )
                    db.add(category)
                    db.flush()
                    
                    # Add items
                    for item_data in items:
                        # Get image
                        images = FOOD_IMAGES.get(cuisine_key, FOOD_IMAGES["north_indian"])
                        
                        item = MenuItemModel(
                            restaurant_id=restaurant.id,
                            category_id=category.id,
                            name=item_data["name"],
                            description=item_data.get("description", ""),
                            price=item_data["price"] * (1 + (price - 200) / 500),  # Adjust for restaurant price level
                            is_veg=1 if item_data.get("is_veg", True) else 0,
                            is_bestseller=1 if random.random() > 0.8 else 0,
                            is_chef_special=1 if random.random() > 0.9 else 0,
                            spice_level=random.randint(1, 4),
                            prep_time_mins=item_data.get("prep_time", 15),
                            serves=1,
                            image_url=random.choice(images),
                            available_for_preorder=1,
                            is_available=1
                        )
                        db.add(item)
                        menu_items_created += 1
            
            if restaurants_created % 500 == 0:
                db.commit()
                
        except Exception as e:
            print(f"Error processing restaurant {idx}: {e}")
            continue
    
    db.commit()
    
    return {
        "message": "Restaurant data seeded successfully",
        "restaurants": restaurants_created,
        "tables": tables_created,
        "menu_items": menu_items_created
    }


# Register restaurant router
app.include_router(restaurant_router)


# =============================
# Admin Bus Management Endpoints
# =============================
@admin_router.get("/bus/cities")
async def admin_get_cities(
    admin: AdminModel = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """Get all bus cities"""
    cities = db.query(BusCityModel).order_by(BusCityModel.name).all()
    return [{"id": c.id, "name": c.name, "state": c.state, "is_active": c.is_active} for c in cities]


@admin_router.post("/bus/cities")
async def admin_create_city(
    city: BusCityCreate,
    admin: AdminModel = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """Create a new bus city"""
    new_city = BusCityModel(
        name=city.name,
        state=city.state,
        country=city.country,
        latitude=city.latitude,
        longitude=city.longitude
    )
    db.add(new_city)
    db.commit()
    return {"id": new_city.id, "message": "City created"}


@admin_router.get("/bus/operators")
async def admin_get_operators(
    admin: AdminModel = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """Get all bus operators"""
    operators = db.query(BusOperatorModel).order_by(BusOperatorModel.name).all()
    return [{
        "id": o.id,
        "name": o.name,
        "rating": o.rating,
        "is_active": o.is_active,
        "contact_phone": o.contact_phone,
        "contact_email": o.contact_email
    } for o in operators]


@admin_router.post("/bus/operators")
async def admin_create_operator(
    operator: BusOperatorCreate,
    admin: AdminModel = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """Create a new bus operator"""
    new_operator = BusOperatorModel(
        name=operator.name,
        logo_url=operator.logo_url,
        rating=operator.rating,
        contact_phone=operator.contact_phone,
        contact_email=operator.contact_email,
        cancellation_policy=operator.cancellation_policy,
        amenities=operator.amenities
    )
    db.add(new_operator)
    db.commit()
    return {"id": new_operator.id, "message": "Operator created"}


@admin_router.get("/bus/routes")
async def admin_get_routes(
    admin: AdminModel = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """Get all bus routes"""
    routes = db.query(BusRouteModel).all()
    result = []
    for r in routes:
        from_city = db.query(BusCityModel).filter(BusCityModel.id == r.from_city_id).first()
        to_city = db.query(BusCityModel).filter(BusCityModel.id == r.to_city_id).first()
        result.append({
            "id": r.id,
            "from_city_id": r.from_city_id,
            "from_city": from_city.name if from_city else "",
            "to_city_id": r.to_city_id,
            "to_city": to_city.name if to_city else "",
            "distance_km": r.distance_km,
            "is_active": r.is_active
        })
    return result


@admin_router.post("/bus/routes")
async def admin_create_route(
    route: BusRouteCreate,
    admin: AdminModel = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """Create a new bus route"""
    new_route = BusRouteModel(
        from_city_id=route.from_city_id,
        to_city_id=route.to_city_id,
        distance_km=route.distance_km,
        estimated_duration_mins=route.estimated_duration_mins
    )
    db.add(new_route)
    db.commit()
    return {"id": new_route.id, "message": "Route created"}


@admin_router.get("/bus/buses")
async def admin_get_buses(
    admin: AdminModel = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """Get all buses"""
    buses = db.query(BusModel).all()
    result = []
    for b in buses:
        operator = db.query(BusOperatorModel).filter(BusOperatorModel.id == b.operator_id).first()
        result.append({
            "id": b.id,
            "operator_id": b.operator_id,
            "operator_name": operator.name if operator else "",
            "bus_number": b.bus_number,
            "bus_type": b.bus_type,
            "total_seats": b.total_seats,
            "seat_layout": b.seat_layout,
            "is_active": b.is_active
        })
    return result


@admin_router.post("/bus/buses")
async def admin_create_bus(
    bus: BusCreate,
    admin: AdminModel = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """Create a new bus with seat layout"""
    new_bus = BusModel(
        operator_id=bus.operator_id,
        bus_number=bus.bus_number,
        bus_type=bus.bus_type,
        total_seats=bus.total_seats,
        seat_layout=bus.seat_layout,
        has_upper_deck=bus.has_upper_deck,
        amenities=bus.amenities
    )
    db.add(new_bus)
    db.flush()
    
    # Generate seats based on layout
    if bus.seat_layout == "2+2":
        # Standard seater bus
        rows = (bus.total_seats + 3) // 4
        seat_num = 1
        for row in range(1, rows + 1):
            for col in range(1, 5):
                if seat_num > bus.total_seats:
                    break
                position = "window" if col in [1, 4] else "aisle"
                seat = BusSeatModel(
                    bus_id=new_bus.id,
                    seat_number=f"{row}{chr(64+col)}",
                    seat_type="seater",
                    deck="lower",
                    row_number=row,
                    column_number=col,
                    position=position
                )
                db.add(seat)
                seat_num += 1
    elif bus.seat_layout == "sleeper":
        # Sleeper bus with upper and lower deck
        lower_seats = bus.total_seats // 2
        upper_seats = bus.total_seats - lower_seats
        
        # Lower deck
        rows = (lower_seats + 1) // 2
        for row in range(1, rows + 1):
            for col in [1, 2]:
                seat = BusSeatModel(
                    bus_id=new_bus.id,
                    seat_number=f"L{row}{col}",
                    seat_type="sleeper",
                    deck="lower",
                    row_number=row,
                    column_number=col,
                    position="window" if col == 1 else "aisle"
                )
                db.add(seat)
        
        # Upper deck
        rows = (upper_seats + 1) // 2
        for row in range(1, rows + 1):
            for col in [1, 2]:
                seat = BusSeatModel(
                    bus_id=new_bus.id,
                    seat_number=f"U{row}{col}",
                    seat_type="sleeper",
                    deck="upper",
                    row_number=row,
                    column_number=col,
                    position="window" if col == 1 else "aisle",
                    price_modifier=50  # Upper deck slightly cheaper
                )
                db.add(seat)
    else:
        # Default 2+1 layout
        rows = (bus.total_seats + 2) // 3
        seat_num = 1
        for row in range(1, rows + 1):
            for col in range(1, 4):
                if seat_num > bus.total_seats:
                    break
                position = "window" if col in [1, 3] else "aisle"
                seat = BusSeatModel(
                    bus_id=new_bus.id,
                    seat_number=f"{row}{chr(64+col)}",
                    seat_type="seater",
                    deck="lower",
                    row_number=row,
                    column_number=col,
                    position=position
                )
                db.add(seat)
                seat_num += 1
    
    db.commit()
    return {"id": new_bus.id, "message": "Bus created with seats"}


@admin_router.get("/bus/schedules")
async def admin_get_schedules(
    admin: AdminModel = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """Get all bus schedules"""
    schedules = db.query(BusScheduleModel).all()
    result = []
    for s in schedules:
        bus = db.query(BusModel).filter(BusModel.id == s.bus_id).first()
        route = db.query(BusRouteModel).filter(BusRouteModel.id == s.route_id).first()
        from_city = db.query(BusCityModel).filter(BusCityModel.id == route.from_city_id).first() if route else None
        to_city = db.query(BusCityModel).filter(BusCityModel.id == route.to_city_id).first() if route else None
        operator = db.query(BusOperatorModel).filter(BusOperatorModel.id == bus.operator_id).first() if bus else None
        
        result.append({
            "id": s.id,
            "bus_id": s.bus_id,
            "bus_number": bus.bus_number if bus else "",
            "operator_name": operator.name if operator else "",
            "route_id": s.route_id,
            "from_city": from_city.name if from_city else "",
            "to_city": to_city.name if to_city else "",
            "departure_time": s.departure_time,
            "arrival_time": s.arrival_time,
            "base_price": s.base_price,
            "is_night_bus": s.is_night_bus,
            "is_active": s.is_active
        })
    return result


@admin_router.post("/bus/schedules")
async def admin_create_schedule(
    schedule: BusScheduleCreate,
    admin: AdminModel = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """Create a new bus schedule"""
    new_schedule = BusScheduleModel(
        bus_id=schedule.bus_id,
        route_id=schedule.route_id,
        departure_time=schedule.departure_time,
        arrival_time=schedule.arrival_time,
        duration_mins=schedule.duration_mins,
        days_of_week=schedule.days_of_week,
        base_price=schedule.base_price,
        is_night_bus=schedule.is_night_bus,
        next_day_arrival=schedule.next_day_arrival
    )
    db.add(new_schedule)
    db.commit()
    return {"id": new_schedule.id, "message": "Schedule created"}


@admin_router.post("/bus/boarding-points")
async def admin_create_boarding_point(
    point: BusBoardingPointCreate,
    admin: AdminModel = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """Create a boarding/dropping point"""
    new_point = BusBoardingPointModel(
        schedule_id=point.schedule_id,
        city_id=point.city_id,
        point_name=point.point_name,
        address=point.address,
        time=point.time,
        latitude=point.latitude,
        longitude=point.longitude,
        point_type=point.point_type
    )
    db.add(new_point)
    db.commit()
    return {"id": new_point.id, "message": "Boarding point created"}


@admin_router.get("/bus/bookings")
async def admin_get_bus_bookings(
    page: int = 1,
    limit: int = 20,
    status: Optional[str] = None,
    admin: AdminModel = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """Get all bus bookings"""
    query = db.query(BusBookingModel)
    if status:
        query = query.filter(BusBookingModel.booking_status == status)
    
    bookings = query.order_by(BusBookingModel.created_at.desc()).offset((page-1)*limit).limit(limit).all()
    
    result = []
    for b in bookings:
        schedule = db.query(BusScheduleModel).filter(BusScheduleModel.id == b.schedule_id).first()
        bus = db.query(BusModel).filter(BusModel.id == schedule.bus_id).first() if schedule else None
        operator = db.query(BusOperatorModel).filter(BusOperatorModel.id == bus.operator_id).first() if bus else None
        passengers = db.query(BusPassengerModel).filter(BusPassengerModel.booking_id == b.id).count()
        
        result.append({
            "id": b.id,
            "pnr": b.pnr,
            "user_id": b.user_id,
            "journey_date": b.journey_date,
            "operator_name": operator.name if operator else "",
            "final_amount": b.final_amount,
            "booking_status": b.booking_status,
            "payment_status": b.payment_status,
            "passengers": passengers,
            "created_at": b.created_at.isoformat() if b.created_at else None
        })
    
    return result


# =============================
# Admin Flight Endpoints
# =============================

@admin_router.get("/flight/airports")
async def admin_get_airports(
    admin: AdminModel = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """Get all airports"""
    airports = db.query(AirportModel).all()
    return [{"id": a.id, "code": a.code, "name": a.name, "city": a.city, 
             "country": a.country, "timezone": a.timezone, "latitude": a.latitude, 
             "longitude": a.longitude, "is_active": a.is_active} for a in airports]

@admin_router.post("/flight/airports")
async def admin_create_airport(
    data: AirportCreate,
    admin: AdminModel = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """Create a new airport"""
    existing = db.query(AirportModel).filter(AirportModel.code == data.code).first()
    if existing:
        raise HTTPException(status_code=400, detail="Airport code already exists")
    
    airport = AirportModel(
        code=data.code.upper(),
        name=data.name,
        city=data.city,
        country=data.country,
        timezone=data.timezone,
        latitude=data.latitude,
        longitude=data.longitude,
        is_active=True
    )
    db.add(airport)
    db.commit()
    db.refresh(airport)
    return {"message": "Airport created", "id": airport.id}

@admin_router.put("/flight/airports/{airport_id}")
async def admin_update_airport(
    airport_id: int,
    data: AirportCreate,
    admin: AdminModel = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """Update an airport"""
    airport = db.query(AirportModel).filter(AirportModel.id == airport_id).first()
    if not airport:
        raise HTTPException(status_code=404, detail="Airport not found")
    
    airport.code = data.code.upper()
    airport.name = data.name
    airport.city = data.city
    airport.country = data.country
    airport.timezone = data.timezone
    airport.latitude = data.latitude
    airport.longitude = data.longitude
    db.commit()
    return {"message": "Airport updated"}

@admin_router.delete("/flight/airports/{airport_id}")
async def admin_delete_airport(
    airport_id: int,
    admin: AdminModel = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """Delete an airport"""
    airport = db.query(AirportModel).filter(AirportModel.id == airport_id).first()
    if not airport:
        raise HTTPException(status_code=404, detail="Airport not found")
    
    db.delete(airport)
    db.commit()
    return {"message": "Airport deleted"}

@admin_router.get("/flight/airlines")
async def admin_get_airlines(
    admin: AdminModel = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """Get all airlines"""
    airlines = db.query(AirlineModel).all()
    return [{"id": a.id, "code": a.code, "name": a.name, "logo_url": a.logo_url, 
             "country": a.country, "is_active": a.is_active} for a in airlines]

@admin_router.post("/flight/airlines")
async def admin_create_airline(
    data: AirlineCreate,
    admin: AdminModel = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """Create a new airline"""
    existing = db.query(AirlineModel).filter(AirlineModel.code == data.code).first()
    if existing:
        raise HTTPException(status_code=400, detail="Airline code already exists")
    
    airline = AirlineModel(
        code=data.code.upper(),
        name=data.name,
        logo_url=data.logo_url,
        country=data.country,
        is_active=True
    )
    db.add(airline)
    db.commit()
    db.refresh(airline)
    return {"message": "Airline created", "id": airline.id}

@admin_router.put("/flight/airlines/{airline_id}")
async def admin_update_airline(
    airline_id: int,
    data: AirlineCreate,
    admin: AdminModel = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """Update an airline"""
    airline = db.query(AirlineModel).filter(AirlineModel.id == airline_id).first()
    if not airline:
        raise HTTPException(status_code=404, detail="Airline not found")
    
    airline.code = data.code.upper()
    airline.name = data.name
    airline.logo_url = data.logo_url
    airline.country = data.country
    db.commit()
    return {"message": "Airline updated"}

@admin_router.delete("/flight/airlines/{airline_id}")
async def admin_delete_airline(
    airline_id: int,
    admin: AdminModel = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """Delete an airline"""
    airline = db.query(AirlineModel).filter(AirlineModel.id == airline_id).first()
    if not airline:
        raise HTTPException(status_code=404, detail="Airline not found")
    
    db.delete(airline)
    db.commit()
    return {"message": "Airline deleted"}

@admin_router.get("/flight/aircraft")
async def admin_get_aircraft(
    admin: AdminModel = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """Get all aircraft"""
    aircraft = db.query(AircraftModel).all()
    return [{"id": a.id, "model": a.model, "manufacturer": a.manufacturer, 
             "total_seats": a.total_seats, "seat_layout": a.seat_layout,
             "has_business_class": a.has_business_class} for a in aircraft]

@admin_router.post("/flight/aircraft")
async def admin_create_aircraft(
    data: AircraftCreate,
    admin: AdminModel = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """Create a new aircraft"""
    aircraft = AircraftModel(
        model=data.model,
        manufacturer=data.manufacturer,
        total_seats=data.total_seats,
        seat_layout=data.seat_layout,
        has_business_class=data.has_business_class
    )
    db.add(aircraft)
    db.commit()
    db.refresh(aircraft)
    return {"message": "Aircraft created", "id": aircraft.id}

@admin_router.get("/flight/routes")
async def admin_get_flight_routes(
    admin: AdminModel = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """Get all flight routes"""
    routes = db.query(FlightRouteModel).all()
    result = []
    for r in routes:
        origin = db.query(AirportModel).filter(AirportModel.id == r.origin_airport_id).first()
        dest = db.query(AirportModel).filter(AirportModel.id == r.destination_airport_id).first()
        result.append({
            "id": r.id,
            "origin_airport_id": r.origin_airport_id,
            "origin": {"code": origin.code, "city": origin.city} if origin else None,
            "destination_airport_id": r.destination_airport_id,
            "destination": {"code": dest.code, "city": dest.city} if dest else None,
            "distance_km": r.distance_km,
            "duration_mins": r.duration_mins,
            "is_active": r.is_active
        })
    return result

@admin_router.post("/flight/routes")
async def admin_create_flight_route(
    data: FlightRouteCreate,
    admin: AdminModel = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """Create a new flight route"""
    # Verify airports exist
    origin = db.query(AirportModel).filter(AirportModel.id == data.origin_airport_id).first()
    dest = db.query(AirportModel).filter(AirportModel.id == data.destination_airport_id).first()
    
    if not origin or not dest:
        raise HTTPException(status_code=400, detail="Invalid airport IDs")
    
    route = FlightRouteModel(
        origin_airport_id=data.origin_airport_id,
        destination_airport_id=data.destination_airport_id,
        distance_km=data.distance_km,
        duration_mins=data.duration_mins,
        is_active=True
    )
    db.add(route)
    db.commit()
    db.refresh(route)
    return {"message": "Route created", "id": route.id}

@admin_router.get("/flight/flights")
async def admin_get_flights(
    page: int = 1,
    limit: int = 20,
    status: Optional[str] = None,
    admin: AdminModel = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """Get all flights with pagination"""
    query = db.query(FlightModel)
    if status:
        query = query.filter(FlightModel.status == status)
    
    flights = query.order_by(FlightModel.departure_datetime.desc()).offset((page-1)*limit).limit(limit).all()
    
    result = []
    for f in flights:
        airline = db.query(AirlineModel).filter(AirlineModel.id == f.airline_id).first()
        route = db.query(FlightRouteModel).filter(FlightRouteModel.id == f.route_id).first()
        origin = db.query(AirportModel).filter(AirportModel.id == route.origin_airport_id).first() if route else None
        dest = db.query(AirportModel).filter(AirportModel.id == route.destination_airport_id).first() if route else None
        
        result.append({
            "id": f.id,
            "flight_number": f.flight_number,
            "airline": {"code": airline.code, "name": airline.name, "logo": airline.logo_url} if airline else None,
            "origin": {"code": origin.code, "city": origin.city, "name": origin.name} if origin else None,
            "destination": {"code": dest.code, "city": dest.city, "name": dest.name} if dest else None,
            "departure_datetime": f.departure_datetime.isoformat() if f.departure_datetime else None,
            "arrival_datetime": f.arrival_datetime.isoformat() if f.arrival_datetime else None,
            "base_price_economy": f.base_price_economy,
            "base_price_business": f.base_price_business,
            "status": f.status,
            "stops": f.stops
        })
    
    return result

@admin_router.post("/flight/flights")
async def admin_create_flight(
    data: FlightCreate,
    admin: AdminModel = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """Create a new flight"""
    # Verify references
    airline = db.query(AirlineModel).filter(AirlineModel.id == data.airline_id).first()
    route = db.query(FlightRouteModel).filter(FlightRouteModel.id == data.route_id).first()
    aircraft = db.query(AircraftModel).filter(AircraftModel.id == data.aircraft_id).first()
    
    if not airline:
        raise HTTPException(status_code=400, detail="Invalid airline ID")
    if not route:
        raise HTTPException(status_code=400, detail="Invalid route ID")
    if not aircraft:
        raise HTTPException(status_code=400, detail="Invalid aircraft ID")
    
    flight = FlightModel(
        flight_number=data.flight_number.upper(),
        airline_id=data.airline_id,
        route_id=data.route_id,
        aircraft_id=data.aircraft_id,
        departure_datetime=data.departure_datetime,
        arrival_datetime=data.arrival_datetime,
        base_price_economy=data.base_price_economy,
        base_price_business=data.base_price_business,
        status=data.status or "scheduled",
        stops=data.stops or 0,
        gate=data.gate,
        terminal=data.terminal
    )
    db.add(flight)
    db.commit()
    db.refresh(flight)
    
    # Initialize seat availability for this flight
    seats = db.query(FlightSeatModel).filter(FlightSeatModel.aircraft_id == data.aircraft_id).all()
    for seat in seats:
        availability = FlightSeatAvailabilityModel(
            flight_id=flight.id,
            seat_id=seat.id,
            status="available"
        )
        db.add(availability)
    db.commit()
    
    return {"message": "Flight created", "id": flight.id}

@admin_router.put("/flight/flights/{flight_id}")
async def admin_update_flight(
    flight_id: int,
    status: str,
    gate: Optional[str] = None,
    terminal: Optional[str] = None,
    admin: AdminModel = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """Update flight status"""
    flight = db.query(FlightModel).filter(FlightModel.id == flight_id).first()
    if not flight:
        raise HTTPException(status_code=404, detail="Flight not found")
    
    flight.status = status
    if gate:
        flight.gate = gate
    if terminal:
        flight.terminal = terminal
    
    db.commit()
    return {"message": "Flight updated"}

@admin_router.get("/flight/bookings")
async def admin_get_flight_bookings(
    page: int = 1,
    limit: int = 20,
    status: Optional[str] = None,
    admin: AdminModel = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """Get all flight bookings"""
    query = db.query(FlightBookingModel)
    if status:
        query = query.filter(FlightBookingModel.status == status)
    
    bookings = query.order_by(FlightBookingModel.created_at.desc()).offset((page-1)*limit).limit(limit).all()
    
    result = []
    for b in bookings:
        user = db.query(User).filter(User.id == b.user_id).first()
        passengers = db.query(FlightPassengerModel).filter(FlightPassengerModel.booking_id == b.id).all()
        
        # Get flight info for first passenger
        first_passenger = passengers[0] if passengers else None
        flight = db.query(FlightModel).filter(FlightModel.id == first_passenger.flight_id).first() if first_passenger else None
        airline = db.query(AirlineModel).filter(AirlineModel.id == flight.airline_id).first() if flight else None
        
        result.append({
            "id": b.id,
            "booking_reference": b.booking_reference,
            "pnr": b.pnr,
            "user": {"id": user.id, "name": user.name, "email": user.email} if user else None,
            "flight_number": flight.flight_number if flight else None,
            "airline": airline.name if airline else None,
            "trip_type": b.trip_type,
            "total_passengers": b.total_passengers,
            "total_amount": b.total_amount,
            "status": b.status,
            "payment_status": b.payment_status,
            "created_at": b.created_at.isoformat() if b.created_at else None
        })
    
    return result

@admin_router.get("/flight/bookings/{booking_id}")
async def admin_get_flight_booking_detail(
    booking_id: int,
    admin: AdminModel = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """Get detailed flight booking info"""
    booking = db.query(FlightBookingModel).filter(FlightBookingModel.id == booking_id).first()
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")
    
    user = db.query(User).filter(User.id == booking.user_id).first()
    passengers = db.query(FlightPassengerModel).filter(FlightPassengerModel.booking_id == booking.id).all()
    
    passenger_details = []
    for p in passengers:
        flight = db.query(FlightModel).filter(FlightModel.id == p.flight_id).first()
        seat = db.query(FlightSeatModel).filter(FlightSeatModel.id == p.seat_id).first()
        route = db.query(FlightRouteModel).filter(FlightRouteModel.id == flight.route_id).first() if flight else None
        origin = db.query(AirportModel).filter(AirportModel.id == route.origin_airport_id).first() if route else None
        dest = db.query(AirportModel).filter(AirportModel.id == route.destination_airport_id).first() if route else None
        
        passenger_details.append({
            "id": p.id,
            "full_name": p.full_name,
            "gender": p.gender,
            "dob": p.dob,
            "nationality": p.nationality,
            "passport_number": p.passport_number,
            "seat": seat.seat_number if seat else None,
            "seat_class": seat.seat_class if seat else None,
            "flight": {
                "number": flight.flight_number if flight else None,
                "origin": origin.code if origin else None,
                "destination": dest.code if dest else None,
                "departure": flight.departure_datetime.isoformat() if flight else None,
                "arrival": flight.arrival_datetime.isoformat() if flight else None
            }
        })
    
    return {
        "id": booking.id,
        "booking_reference": booking.booking_reference,
        "pnr": booking.pnr,
        "user": {"id": user.id, "name": user.name, "email": user.email, "phone": user.phone} if user else None,
        "trip_type": booking.trip_type,
        "total_passengers": booking.total_passengers,
        "total_amount": booking.total_amount,
        "status": booking.status,
        "payment_status": booking.payment_status,
        "contact_name": booking.contact_name,
        "contact_email": booking.contact_email,
        "contact_phone": booking.contact_phone,
        "passengers": passenger_details,
        "created_at": booking.created_at.isoformat() if booking.created_at else None
    }

@admin_router.post("/flight/bookings/{booking_id}/status")
async def admin_update_flight_booking_status(
    booking_id: int,
    status: str,
    admin: AdminModel = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """Update flight booking status"""
    booking = db.query(FlightBookingModel).filter(FlightBookingModel.id == booking_id).first()
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")
    
    valid_statuses = ["confirmed", "cancelled", "completed", "refunded"]
    if status not in valid_statuses:
        raise HTTPException(status_code=400, detail=f"Invalid status. Must be one of: {valid_statuses}")
    
    booking.status = status
    db.commit()
    
    return {"message": f"Booking status updated to {status}"}

@admin_router.post("/flight/tracking/{flight_id}")
async def admin_update_flight_tracking(
    flight_id: int,
    latitude: float,
    longitude: float,
    altitude: Optional[int] = None,
    speed: Optional[int] = None,
    heading: Optional[int] = None,
    status: Optional[str] = None,
    admin: AdminModel = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """Update live flight tracking data"""
    flight = db.query(FlightModel).filter(FlightModel.id == flight_id).first()
    if not flight:
        raise HTTPException(status_code=404, detail="Flight not found")
    
    # Update or create tracking record
    tracking = db.query(FlightLiveTrackingModel).filter(FlightLiveTrackingModel.flight_id == flight_id).first()
    
    if tracking:
        tracking.current_latitude = latitude
        tracking.current_longitude = longitude
        tracking.altitude_ft = altitude or tracking.altitude_ft
        tracking.speed_knots = speed or tracking.speed_knots
        tracking.heading = heading or tracking.heading
        tracking.status = status or tracking.status
        tracking.updated_at = datetime.utcnow()
    else:
        tracking = FlightLiveTrackingModel(
            flight_id=flight_id,
            current_latitude=latitude,
            current_longitude=longitude,
            altitude_ft=altitude or 0,
            speed_knots=speed or 0,
            heading=heading or 0,
            status=status or "in_air"
        )
        db.add(tracking)
    
    db.commit()
    return {"message": "Tracking updated"}


# Register admin router
app.include_router(admin_router)


# =============================
# WebSocket Endpoint for Real-Time Notifications
# =============================
@app.websocket("/ws/notifications/{token}")
async def websocket_notification_endpoint(websocket: WebSocket, token: str):
    """WebSocket endpoint for real-time notifications"""
    # Validate token and get user
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id = payload.get("sub")
        if not user_id:
            await websocket.close(code=4001, reason="Invalid token")
            return
    except JWTError as e:
        await websocket.close(code=4001, reason="Invalid token")
        return
    
    # Connect the WebSocket
    await notification_manager.connect(websocket, user_id)
    
    try:
        # Send initial unread count
        db = SessionLocal()
        try:
            unread_count = db.query(NotificationModel).filter(
                NotificationModel.user_id == user_id,
                NotificationModel.is_read == 0
            ).count()
            await websocket.send_json({
                "type": "init",
                "unread_count": unread_count
            })
        finally:
            db.close()
        
        # Keep connection alive and listen for pings
        while True:
            try:
                data = await asyncio.wait_for(websocket.receive_text(), timeout=30)
                # Handle ping/pong to keep connection alive
                if data == "ping":
                    await websocket.send_text("pong")
            except asyncio.TimeoutError:
                # Send heartbeat
                try:
                    await websocket.send_json({"type": "heartbeat"})
                except:
                    break
    except WebSocketDisconnect:
        notification_manager.disconnect(websocket, user_id)
    except Exception as e:
        logging.error(f"WebSocket error for user {user_id}: {e}")
        notification_manager.disconnect(websocket, user_id)


# =============================
# Bus Data Seed Endpoint
# =============================
@app.post("/api/bus/seed", tags=["bus"])
async def seed_bus_data(db: Session = Depends(get_db)):
    """Seed initial bus data for demo purposes"""
    
    # Check if data already exists
    existing_cities = db.query(BusCityModel).count()
    if existing_cities > 0:
        return {"message": "Bus data already seeded", "cities": existing_cities}
    
    # Indian Cities with coordinates
    cities_data = [
        {"name": "Chennai", "state": "Tamil Nadu", "country": "India", "latitude": 13.0827, "longitude": 80.2707},
        {"name": "Bangalore", "state": "Karnataka", "country": "India", "latitude": 12.9716, "longitude": 77.5946},
        {"name": "Mumbai", "state": "Maharashtra", "country": "India", "latitude": 19.0760, "longitude": 72.8777},
        {"name": "Delhi", "state": "Delhi", "country": "India", "latitude": 28.7041, "longitude": 77.1025},
        {"name": "Hyderabad", "state": "Telangana", "country": "India", "latitude": 17.3850, "longitude": 78.4867},
        {"name": "Pune", "state": "Maharashtra", "country": "India", "latitude": 18.5204, "longitude": 73.8567},
        {"name": "Coimbatore", "state": "Tamil Nadu", "country": "India", "latitude": 11.0168, "longitude": 76.9558},
        {"name": "Madurai", "state": "Tamil Nadu", "country": "India", "latitude": 9.9252, "longitude": 78.1198},
        {"name": "Mysore", "state": "Karnataka", "country": "India", "latitude": 12.2958, "longitude": 76.6394},
        {"name": "Trichy", "state": "Tamil Nadu", "country": "India", "latitude": 10.7905, "longitude": 78.7047},
        {"name": "Salem", "state": "Tamil Nadu", "country": "India", "latitude": 11.6643, "longitude": 78.1460},
        {"name": "Vijayawada", "state": "Andhra Pradesh", "country": "India", "latitude": 16.5062, "longitude": 80.6480},
        {"name": "Tirupati", "state": "Andhra Pradesh", "country": "India", "latitude": 13.6288, "longitude": 79.4192},
        {"name": "Kochi", "state": "Kerala", "country": "India", "latitude": 9.9312, "longitude": 76.2673},
        {"name": "Trivandrum", "state": "Kerala", "country": "India", "latitude": 8.5241, "longitude": 76.9366},
    ]
    
    # Create cities
    city_map = {}
    for city_data in cities_data:
        city = BusCityModel(**city_data)
        db.add(city)
        db.flush()
        city_map[city_data["name"]] = city.id
    
    # Bus Operators
    operators_data = [
        {
            "name": "SRS Travels",
            "logo_url": "/images/srs-logo.png",
            "rating": 4.2,
            "cancellation_policy": "Free cancellation up to 24 hours before departure. 50% refund within 12-24 hours.",
            "amenities": "WiFi,Charging Point,Water Bottle,Blanket,Snacks"
        },
        {
            "name": "VRL Travels",
            "logo_url": "/images/vrl-logo.png",
            "rating": 4.5,
            "cancellation_policy": "90% refund if cancelled 48 hours before. 50% refund within 24-48 hours.",
            "amenities": "WiFi,Charging Point,Water Bottle,Blanket,GPS Tracking"
        },
        {
            "name": "KPN Travels",
            "logo_url": "/images/kpn-logo.png",
            "rating": 4.3,
            "cancellation_policy": "Free cancellation up to 6 hours before departure.",
            "amenities": "Charging Point,Water Bottle,Reading Light,Emergency Exit"
        },
        {
            "name": "Orange Travels",
            "logo_url": "/images/orange-logo.png",
            "rating": 4.0,
            "cancellation_policy": "75% refund up to 24 hours before departure.",
            "amenities": "WiFi,Charging Point,Blanket,TV,Snacks"
        },
        {
            "name": "KSRTC",
            "logo_url": "/images/ksrtc-logo.png",
            "rating": 3.8,
            "cancellation_policy": "No refunds for government buses.",
            "amenities": "Charging Point,Reading Light"
        },
        {
            "name": "Parveen Travels",
            "logo_url": "/images/parveen-logo.png",
            "rating": 4.4,
            "cancellation_policy": "85% refund up to 12 hours before departure.",
            "amenities": "WiFi,Charging Point,Water Bottle,Blanket,Pillow"
        }
    ]
    
    operator_map = {}
    for op_data in operators_data:
        operator = BusOperatorModel(**op_data)
        db.add(operator)
        db.flush()
        operator_map[op_data["name"]] = operator.id
    
    # Routes (one-way distances in km and time in minutes)
    routes_data = [
        {"from": "Chennai", "to": "Bangalore", "distance": 350, "duration": 360},
        {"from": "Chennai", "to": "Coimbatore", "distance": 500, "duration": 480},
        {"from": "Chennai", "to": "Madurai", "distance": 460, "duration": 450},
        {"from": "Chennai", "to": "Trichy", "distance": 320, "duration": 300},
        {"from": "Chennai", "to": "Hyderabad", "distance": 630, "duration": 600},
        {"from": "Chennai", "to": "Tirupati", "distance": 135, "duration": 180},
        {"from": "Bangalore", "to": "Chennai", "distance": 350, "duration": 360},
        {"from": "Bangalore", "to": "Mysore", "distance": 150, "duration": 180},
        {"from": "Bangalore", "to": "Hyderabad", "distance": 570, "duration": 540},
        {"from": "Bangalore", "to": "Mumbai", "distance": 980, "duration": 900},
        {"from": "Bangalore", "to": "Coimbatore", "distance": 360, "duration": 360},
        {"from": "Bangalore", "to": "Kochi", "distance": 560, "duration": 540},
        {"from": "Mumbai", "to": "Pune", "distance": 150, "duration": 180},
        {"from": "Mumbai", "to": "Bangalore", "distance": 980, "duration": 900},
        {"from": "Mumbai", "to": "Hyderabad", "distance": 710, "duration": 660},
        {"from": "Delhi", "to": "Mumbai", "distance": 1400, "duration": 1200},
        {"from": "Hyderabad", "to": "Bangalore", "distance": 570, "duration": 540},
        {"from": "Hyderabad", "to": "Vijayawada", "distance": 275, "duration": 300},
        {"from": "Coimbatore", "to": "Chennai", "distance": 500, "duration": 480},
        {"from": "Coimbatore", "to": "Kochi", "distance": 195, "duration": 240},
        {"from": "Kochi", "to": "Trivandrum", "distance": 200, "duration": 240},
    ]
    
    route_map = {}
    for route_data in routes_data:
        route = BusRouteModel(
            from_city_id=city_map[route_data["from"]],
            to_city_id=city_map[route_data["to"]],
            distance_km=route_data["distance"],
            estimated_duration_mins=route_data["duration"]
        )
        db.add(route)
        db.flush()
        route_key = f"{route_data['from']}-{route_data['to']}"
        route_map[route_key] = route.id
    
    # Buses and their seat configurations
    buses_data = [
        {"operator": "SRS Travels", "number": "TN01AB1234", "type": "Sleeper", "seats": 30, "layout": "2+1", "upper_deck": True},
        {"operator": "SRS Travels", "number": "TN01AB1235", "type": "AC Seater", "seats": 44, "layout": "2+2", "upper_deck": False},
        {"operator": "VRL Travels", "number": "KA01CD5678", "type": "AC Sleeper", "seats": 36, "layout": "2+1", "upper_deck": True},
        {"operator": "VRL Travels", "number": "KA01CD5679", "type": "Multi-Axle Volvo", "seats": 40, "layout": "2+2", "upper_deck": False},
        {"operator": "KPN Travels", "number": "TN02EF9012", "type": "Semi Sleeper", "seats": 38, "layout": "2+2", "upper_deck": False},
        {"operator": "KPN Travels", "number": "TN02EF9013", "type": "AC Sleeper", "seats": 30, "layout": "2+1", "upper_deck": True},
        {"operator": "Orange Travels", "number": "AP03GH3456", "type": "Volvo AC", "seats": 44, "layout": "2+2", "upper_deck": False},
        {"operator": "Orange Travels", "number": "AP03GH3457", "type": "Sleeper", "seats": 36, "layout": "2+1", "upper_deck": True},
        {"operator": "KSRTC", "number": "KA04IJ7890", "type": "Non AC Seater", "seats": 52, "layout": "2+3", "upper_deck": False},
        {"operator": "KSRTC", "number": "KA04IJ7891", "type": "AC Seater", "seats": 44, "layout": "2+2", "upper_deck": False},
        {"operator": "Parveen Travels", "number": "TN05KL1122", "type": "Multi-Axle AC Sleeper", "seats": 30, "layout": "2+1", "upper_deck": True},
        {"operator": "Parveen Travels", "number": "TN05KL1123", "type": "Volvo B11R", "seats": 40, "layout": "2+2", "upper_deck": False},
    ]
    
    # Helper function to generate seat layouts
    def create_bus_seats(db_session, bus_id, layout, total_seats, has_upper_deck):
        """Generate seats for a bus based on layout"""
        seats_per_row = sum(int(x) for x in layout.split('+'))
        decks = ["lower", "upper"] if has_upper_deck else ["lower"]
        seats_per_deck = total_seats // len(decks)
        rows_per_deck = max(1, seats_per_deck // seats_per_row)
        
        seat_num = 1
        for deck in decks:
            for row in range(1, rows_per_deck + 1):
                col = 1
                for section in layout.split('+'):
                    for _ in range(int(section)):
                        position = "window" if col == 1 or col == seats_per_row else "aisle"
                        
                        seat = BusSeatModel(
                            bus_id=bus_id,
                            seat_number=f"{deck[0].upper()}{seat_num}",
                            seat_type="sleeper" if has_upper_deck else "seater",
                            deck=deck,
                            row_number=row,
                            column_number=col,
                            position=position,
                            price_modifier=1.1 if position == "window" else 1.0,
                            is_female_only=row == rows_per_deck and col == 1
                        )
                        db_session.add(seat)
                        seat_num += 1
                        col += 1
    
    bus_map = {}
    for bus_data in buses_data:
        bus = BusModel(
            operator_id=operator_map[bus_data["operator"]],
            bus_number=bus_data["number"],
            bus_type=bus_data["type"],
            total_seats=bus_data["seats"],
            seat_layout=bus_data["layout"],
            has_upper_deck=bus_data["upper_deck"]
        )
        db.add(bus)
        db.flush()
        bus_map[bus_data["number"]] = bus.id
        
        # Generate seats for this bus
        create_bus_seats(db, bus.id, bus_data["layout"], bus_data["seats"], bus_data["upper_deck"])
    
    # Schedules with departure times
    schedules_data = [
        # Chennai - Bangalore (Multiple timings)
        {"bus": "TN01AB1234", "route": "Chennai-Bangalore", "dep": "21:00", "arr": "05:00", "days": "1,2,3,4,5,6,7", "price": 850, "night": True, "next_day": True},
        {"bus": "TN01AB1235", "route": "Chennai-Bangalore", "dep": "06:00", "arr": "12:00", "days": "1,2,3,4,5,6,7", "price": 650, "night": False, "next_day": False},
        {"bus": "KA01CD5678", "route": "Chennai-Bangalore", "dep": "22:30", "arr": "06:30", "days": "1,2,3,4,5,6,7", "price": 1100, "night": True, "next_day": True},
        {"bus": "KA01CD5679", "route": "Chennai-Bangalore", "dep": "08:00", "arr": "14:00", "days": "1,2,3,4,5,6,7", "price": 900, "night": False, "next_day": False},
        # Chennai - Coimbatore
        {"bus": "TN02EF9012", "route": "Chennai-Coimbatore", "dep": "21:30", "arr": "06:30", "days": "1,2,3,4,5,6,7", "price": 750, "night": True, "next_day": True},
        {"bus": "TN02EF9013", "route": "Chennai-Coimbatore", "dep": "22:00", "arr": "07:00", "days": "1,2,3,4,5,6,7", "price": 950, "night": True, "next_day": True},
        # Chennai - Hyderabad
        {"bus": "AP03GH3456", "route": "Chennai-Hyderabad", "dep": "18:00", "arr": "06:00", "days": "1,2,3,4,5,6,7", "price": 1200, "night": True, "next_day": True},
        {"bus": "AP03GH3457", "route": "Chennai-Hyderabad", "dep": "20:00", "arr": "08:00", "days": "1,2,3,4,5,6,7", "price": 1050, "night": True, "next_day": True},
        # Bangalore - Chennai
        {"bus": "TN01AB1234", "route": "Bangalore-Chennai", "dep": "21:00", "arr": "05:00", "days": "1,2,3,4,5,6,7", "price": 850, "night": True, "next_day": True},
        {"bus": "KA01CD5679", "route": "Bangalore-Chennai", "dep": "07:00", "arr": "13:00", "days": "1,2,3,4,5,6,7", "price": 900, "night": False, "next_day": False},
        # Bangalore - Mysore
        {"bus": "KA04IJ7890", "route": "Bangalore-Mysore", "dep": "06:00", "arr": "09:00", "days": "1,2,3,4,5,6,7", "price": 350, "night": False, "next_day": False},
        {"bus": "KA04IJ7891", "route": "Bangalore-Mysore", "dep": "08:00", "arr": "11:00", "days": "1,2,3,4,5,6,7", "price": 450, "night": False, "next_day": False},
        # Bangalore - Hyderabad
        {"bus": "KA01CD5678", "route": "Bangalore-Hyderabad", "dep": "20:00", "arr": "05:00", "days": "1,2,3,4,5,6,7", "price": 1100, "night": True, "next_day": True},
        # Bangalore - Kochi
        {"bus": "TN05KL1122", "route": "Bangalore-Kochi", "dep": "21:30", "arr": "06:30", "days": "1,2,3,4,5,6,7", "price": 950, "night": True, "next_day": True},
        # Mumbai - Pune
        {"bus": "TN05KL1123", "route": "Mumbai-Pune", "dep": "06:00", "arr": "09:00", "days": "1,2,3,4,5,6,7", "price": 450, "night": False, "next_day": False},
        {"bus": "AP03GH3456", "route": "Mumbai-Pune", "dep": "18:00", "arr": "21:00", "days": "1,2,3,4,5,6,7", "price": 500, "night": False, "next_day": False},
        # Hyderabad - Vijayawada
        {"bus": "AP03GH3457", "route": "Hyderabad-Vijayawada", "dep": "06:00", "arr": "11:00", "days": "1,2,3,4,5,6,7", "price": 450, "night": False, "next_day": False},
        # Coimbatore - Kochi
        {"bus": "TN02EF9012", "route": "Coimbatore-Kochi", "dep": "07:00", "arr": "11:00", "days": "1,2,3,4,5,6,7", "price": 400, "night": False, "next_day": False},
    ]
    
    schedule_map = {}
    for sched_data in schedules_data:
        if sched_data["route"] not in route_map:
            continue
        schedule = BusScheduleModel(
            bus_id=bus_map[sched_data["bus"]],
            route_id=route_map[sched_data["route"]],
            departure_time=sched_data["dep"],
            arrival_time=sched_data["arr"],
            duration_mins=int(sched_data["arr"].split(':')[0]) * 60 - int(sched_data["dep"].split(':')[0]) * 60 if not sched_data["next_day"] else 480,
            days_of_week=sched_data["days"],
            base_price=sched_data["price"],
            is_night_bus=sched_data["night"],
            next_day_arrival=sched_data["next_day"]
        )
        db.add(schedule)
        db.flush()
        schedule_map[f"{sched_data['bus']}-{sched_data['route']}"] = schedule.id
        
        # Add boarding and dropping points for each schedule
        route_cities = sched_data["route"].split("-")
        from_city = route_cities[0]
        to_city = route_cities[1]
        
        # Boarding points (from city)
        boarding_points = [
            {"city": from_city, "name": f"{from_city} Central Bus Stand", "address": f"Central Bus Station, {from_city}", "time": sched_data["dep"], "type": "boarding"},
            {"city": from_city, "name": f"{from_city} Koyambedu" if from_city == "Chennai" else f"{from_city} Main Terminal", "address": f"Main Terminal, {from_city}", "time": add_minutes_to_time(sched_data["dep"], 15), "type": "boarding"},
        ]
        
        # Dropping points (to city)
        dropping_points = [
            {"city": to_city, "name": f"{to_city} Central Bus Stand", "address": f"Central Bus Station, {to_city}", "time": sched_data["arr"], "type": "dropping"},
            {"city": to_city, "name": f"{to_city} Railway Station", "address": f"Near Railway Station, {to_city}", "time": add_minutes_to_time(sched_data["arr"], -15), "type": "dropping"},
        ]
        
        for bp in boarding_points:
            point = BusBoardingPointModel(
                schedule_id=schedule.id,
                city_id=city_map[bp["city"]],
                point_name=bp["name"],
                address=bp["address"],
                time=bp["time"],
                point_type=bp["type"]
            )
            db.add(point)
        
        for dp in dropping_points:
            point = BusBoardingPointModel(
                schedule_id=schedule.id,
                city_id=city_map[dp["city"]],
                point_name=dp["name"],
                address=dp["address"],
                time=dp["time"],
                point_type=dp["type"]
            )
            db.add(point)
    
    db.commit()
    
    return {
        "message": "Bus data seeded successfully",
        "cities": len(cities_data),
        "operators": len(operators_data),
        "routes": len(routes_data),
        "buses": len(buses_data),
        "schedules": len(schedule_map)
    }


def add_minutes_to_time(time_str: str, minutes: int) -> str:
    """Add minutes to a time string (HH:MM)"""
    hours, mins = map(int, time_str.split(':'))
    total_mins = hours * 60 + mins + minutes
    new_hours = (total_mins // 60) % 24
    new_mins = total_mins % 60
    return f"{new_hours:02d}:{new_mins:02d}"


if __name__ == "__main__":
    import uvicorn
    # Get port and host from environment
    port = int(os.environ.get('PORT', 8000))
    host = os.environ.get('HOST', '0.0.0.0')
    
    logger.info(f"Starting server on {host}:{port}")
    uvicorn.run(app, host=host, port=port)

