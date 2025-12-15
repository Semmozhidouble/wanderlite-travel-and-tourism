#!/usr/bin/env python3
"""
Database migration script to add KYC and Payment Profile features
"""
import sqlite3
from pathlib import Path

# Find the database file
db_path = Path(__file__).parent / 'wanderlite.db'

if not db_path.exists():
    print(f"❌ Database not found at {db_path}")
    print("Looking for alternative locations...")
    # Try parent directory
    db_path = Path(__file__).parent.parent / 'wanderlite.db'
    if not db_path.exists():
        print("Please specify the correct database path")
        exit(1)

print(f"✅ Found database at: {db_path}")

conn = sqlite3.connect(db_path)
cursor = conn.cursor()

try:
    print("\n🔧 Starting database migration...")
    
    # 1. Add new columns to users table
    print("\n1️⃣  Adding KYC columns to users table...")
    try:
        cursor.execute("ALTER TABLE users ADD COLUMN is_kyc_completed INTEGER DEFAULT 0")
        print("   ✅ Added is_kyc_completed column")
    except sqlite3.OperationalError as e:
        if "duplicate column" in str(e).lower():
            print("   ⚠️  is_kyc_completed already exists")
        else:
            raise
    
    try:
        cursor.execute("ALTER TABLE users ADD COLUMN payment_profile_completed INTEGER DEFAULT 0")
        print("   ✅ Added payment_profile_completed column")
    except sqlite3.OperationalError as e:
        if "duplicate column" in str(e).lower():
            print("   ⚠️  payment_profile_completed already exists")
        else:
            raise
    
    # 2. Create kyc_details table
    print("\n2️⃣  Creating kyc_details table...")
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS kyc_details (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id VARCHAR(36) UNIQUE NOT NULL,
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
            created_at DATETIME,
            updated_at DATETIME,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )
    """)
    print("   ✅ Created kyc_details table")
    
    # 3. Create payment_profiles table
    print("\n3️⃣  Creating payment_profiles table...")
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS payment_profiles (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id VARCHAR(36) UNIQUE NOT NULL,
            account_holder_name VARCHAR(255),
            bank_name VARCHAR(255),
            account_number_encrypted TEXT,
            ifsc_encrypted TEXT,
            upi_encrypted TEXT,
            default_method VARCHAR(20),
            created_at DATETIME,
            updated_at DATETIME,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )
    """)
    print("   ✅ Created payment_profiles table")
    
    # 4. Create transactions table
    print("\n4️⃣  Creating transactions table...")
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS transactions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id VARCHAR(36) NOT NULL,
            booking_id VARCHAR(36),
            service_type VARCHAR(50),
            amount DECIMAL(10, 2),
            currency VARCHAR(10) DEFAULT 'INR',
            payment_method VARCHAR(50),
            status VARCHAR(50) DEFAULT 'pending',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )
    """)
    print("   ✅ Created transactions table")
    
    # 5. Create uploads directory
    print("\n5️⃣  Creating uploads directories...")
    uploads_dir = Path(__file__).parent / 'uploads' / 'kyc'
    uploads_dir.mkdir(parents=True, exist_ok=True)
    print(f"   ✅ Created {uploads_dir}")
    
    # Commit changes
    conn.commit()
    print("\n✅ Migration completed successfully!")
    print("\n📊 Database schema updated:")
    print("   - users: +2 columns (is_kyc_completed, payment_profile_completed)")
    print("   - kyc_details: new table")
    print("   - payment_profiles: new table")
    print("   - transactions: new table")
    
except Exception as e:
    conn.rollback()
    print(f"\n❌ Migration failed: {e}")
    raise
finally:
    conn.close()

print("\n🎉 You can now restart the backend server!")
