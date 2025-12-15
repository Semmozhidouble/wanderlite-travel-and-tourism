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
    
    # 6. Create admins table for admin panel
    print("\n6️⃣  Creating admins table...")
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS admins (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            email VARCHAR(255) UNIQUE NOT NULL,
            username VARCHAR(100) NOT NULL,
            hashed_password VARCHAR(255) NOT NULL,
            role VARCHAR(30) DEFAULT 'support',
            is_active INTEGER DEFAULT 1,
            last_login DATETIME,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME
        )
    """)
    print("   ✅ Created admins table")
    
    # 7. Create audit_logs table
    print("\n7️⃣  Creating audit_logs table...")
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS audit_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            admin_id INTEGER,
            action VARCHAR(100) NOT NULL,
            entity_type VARCHAR(50),
            entity_id VARCHAR(36),
            details TEXT,
            ip_address VARCHAR(45),
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (admin_id) REFERENCES admins(id)
        )
    """)
    print("   ✅ Created audit_logs table")
    
    # 8. Create notifications table
    print("\n8️⃣  Creating notifications table...")
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS notifications (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id VARCHAR(36),
            admin_id INTEGER,
            title VARCHAR(255) NOT NULL,
            message TEXT NOT NULL,
            notification_type VARCHAR(50) DEFAULT 'info',
            is_read INTEGER DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id),
            FOREIGN KEY (admin_id) REFERENCES admins(id)
        )
    """)
    print("   ✅ Created notifications table")
    
    # 9. Create destinations table
    print("\n9️⃣  Creating destinations table...")
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS destinations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name VARCHAR(255) NOT NULL,
            description TEXT,
            category VARCHAR(50),
            country VARCHAR(100),
            state VARCHAR(100),
            city VARCHAR(100),
            image_url VARCHAR(500),
            latitude DECIMAL(10, 8),
            longitude DECIMAL(11, 8),
            is_active INTEGER DEFAULT 1,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME
        )
    """)
    print("   ✅ Created destinations table")
    
    # 10. Add status and is_blocked to users table
    print("\n🔟 Adding user status columns...")
    try:
        cursor.execute("ALTER TABLE users ADD COLUMN is_blocked INTEGER DEFAULT 0")
        print("   ✅ Added is_blocked column")
    except sqlite3.OperationalError as e:
        if "duplicate column" in str(e).lower():
            print("   ⚠️  is_blocked already exists")
        else:
            raise
    
    # 11. Create platform_settings table
    print("\n1️⃣1️⃣ Creating platform_settings table...")
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS platform_settings (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            setting_key VARCHAR(100) UNIQUE NOT NULL,
            setting_value TEXT,
            updated_by INTEGER,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    """)
    print("   ✅ Created platform_settings table")
    
    # Insert default admin user (password: admin123)
    print("\n1️⃣2️⃣ Creating default admin user...")
    try:
        # Password hash for 'admin123' using pbkdf2_sha256
        default_admin_hash = "$pbkdf2-sha256$29000$N2aM0Xqv1Rqj9F5LCeEc4w$TpwcSAr3bMRKPGwJPaKBQGLx4Hw.5GgHKLYRDC0CYCY"
        cursor.execute("""
            INSERT OR IGNORE INTO admins (email, username, hashed_password, role)
            VALUES ('admin@wanderlite.com', 'superadmin', ?, 'super_admin')
        """, (default_admin_hash,))
        print("   ✅ Created default admin: admin@wanderlite.com / admin123")
    except Exception as e:
        print(f"   ⚠️  Admin user setup: {e}")
    
    # Insert default platform settings
    print("\n1️⃣3️⃣ Setting up platform defaults...")
    settings = [
        ('maintenance_mode', 'false'),
        ('bookings_enabled', 'true'),
        ('new_user_registration', 'true'),
    ]
    for key, value in settings:
        try:
            cursor.execute("""
                INSERT OR IGNORE INTO platform_settings (setting_key, setting_value)
                VALUES (?, ?)
            """, (key, value))
        except:
            pass
    print("   ✅ Platform settings initialized")
    
    # Commit changes
    conn.commit()
    print("\n✅ Migration completed successfully!")
    print("\n📊 Database schema updated:")
    print("   - users: +3 columns (is_kyc_completed, payment_profile_completed, is_blocked)")
    print("   - kyc_details: new table")
    print("   - payment_profiles: new table")
    print("   - transactions: new table")
    print("   - admins: new table")
    print("   - audit_logs: new table")
    print("   - notifications: new table")
    print("   - destinations: new table")
    print("   - platform_settings: new table")
    print("\n🔐 Default Admin Credentials:")
    print("   Email: admin@wanderlite.com")
    print("   Password: admin123")
    
except Exception as e:
    conn.rollback()
    print(f"\n❌ Migration failed: {e}")
    raise
finally:
    conn.close()

print("\n🎉 You can now restart the backend server!")
