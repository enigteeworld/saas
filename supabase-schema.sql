-- ============================================
-- DISPATCH NG - Supabase Database Schema
-- Full Escrow Logistics Marketplace
-- ============================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "postgis";

-- ============================================
-- 1. PROFILES & IDENTITY
-- ============================================

-- Main profiles table (extends auth.users)
CREATE TABLE profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT UNIQUE NOT NULL,
    phone TEXT UNIQUE,
    full_name TEXT NOT NULL,
    avatar_url TEXT,
    user_type TEXT NOT NULL CHECK (user_type IN ('customer', 'rider', 'admin')),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    last_login_at TIMESTAMPTZ
);

-- KYC Records for identity verification
CREATE TABLE kyc_records (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    document_type TEXT NOT NULL CHECK (document_type IN ('nin', 'drivers_license', 'passport', 'voters_card', 'cac')),
    document_number TEXT,
    document_image_url TEXT,
    selfie_image_url TEXT,
    verification_status TEXT DEFAULT 'pending' CHECK (verification_status IN ('pending', 'verified', 'rejected', 'expired')),
    verified_at TIMESTAMPTZ,
    verified_by UUID REFERENCES profiles(id),
    rejection_reason TEXT,
    expiry_date DATE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(profile_id, document_type)
);

-- Rider-specific profiles
CREATE TABLE rider_profiles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    profile_id UUID UNIQUE NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    company_name TEXT,
    vehicle_type TEXT NOT NULL CHECK (vehicle_type IN ('motorcycle', 'bicycle', 'car', 'van', 'truck')),
    vehicle_plate TEXT,
    vehicle_color TEXT,
    license_number TEXT,
    is_online BOOLEAN DEFAULT false,
    is_available BOOLEAN DEFAULT true,
    current_location GEOGRAPHY(POINT, 4326),
    service_radius_km INTEGER DEFAULT 10,
    total_deliveries INTEGER DEFAULT 0,
    rating_average DECIMAL(2,1) DEFAULT 5.0,
    total_earnings DECIMAL(12,2) DEFAULT 0,
    verification_status TEXT DEFAULT 'pending' CHECK (verification_status IN ('pending', 'verified', 'suspended', 'rejected')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Bank accounts for withdrawals
CREATE TABLE bank_accounts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    account_name TEXT NOT NULL,
    account_number TEXT NOT NULL,
    bank_name TEXT NOT NULL,
    bank_code TEXT,
    is_default BOOLEAN DEFAULT false,
    is_verified BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 2. WALLETS & LEDGER
-- ============================================

-- Wallets for customers and riders
CREATE TABLE wallets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    profile_id UUID UNIQUE NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    available_balance DECIMAL(12,2) DEFAULT 0,
    held_balance DECIMAL(12,2) DEFAULT 0,
    total_deposited DECIMAL(12,2) DEFAULT 0,
    total_withdrawn DECIMAL(12,2) DEFAULT 0,
    currency TEXT DEFAULT 'NGN',
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Wallet transactions (immutable ledger)
CREATE TABLE wallet_transactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    wallet_id UUID NOT NULL REFERENCES wallets(id) ON DELETE CASCADE,
    transaction_type TEXT NOT NULL CHECK (transaction_type IN (
        'deposit', 'withdrawal', 'escrow_lock', 'escrow_release', 
        'escrow_refund', 'platform_fee', 'adjustment', 'dispute_hold', 'dispute_release'
    )),
    amount DECIMAL(12,2) NOT NULL,
    balance_before DECIMAL(12,2) NOT NULL,
    balance_after DECIMAL(12,2) NOT NULL,
    reference_id UUID, -- Links to dispatch_jobs, withdrawal_requests, etc.
    reference_type TEXT, -- 'dispatch_job', 'withdrawal', 'deposit'
    description TEXT,
    metadata JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    created_by UUID REFERENCES profiles(id)
);

-- Withdrawal requests
CREATE TABLE withdrawal_requests (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    wallet_id UUID NOT NULL REFERENCES wallets(id),
    bank_account_id UUID NOT NULL REFERENCES bank_accounts(id),
    amount DECIMAL(12,2) NOT NULL,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'processing', 'paid', 'failed', 'rejected')),
    processed_at TIMESTAMPTZ,
    processed_by UUID REFERENCES profiles(id),
    rejection_reason TEXT,
    transaction_reference TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 3. DISPATCH JOBS & ESCROW
-- ============================================

-- Main dispatch jobs table
CREATE TABLE dispatch_jobs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    job_number TEXT UNIQUE NOT NULL,
    customer_id UUID NOT NULL REFERENCES profiles(id),
    rider_id UUID REFERENCES profiles(id),
    
    -- Pickup details
    pickup_address TEXT NOT NULL,
    pickup_lat DECIMAL(10,8),
    pickup_lng DECIMAL(11,8),
    pickup_contact_name TEXT,
    pickup_contact_phone TEXT,
    pickup_notes TEXT,
    
    -- Delivery details
    delivery_address TEXT NOT NULL,
    delivery_lat DECIMAL(10,8),
    delivery_lng DECIMAL(11,8),
    delivery_contact_name TEXT,
    delivery_contact_phone TEXT,
    delivery_notes TEXT,
    
    -- Package details
    package_description TEXT,
    package_weight_kg DECIMAL(5,2),
    package_value DECIMAL(12,2),
    
    -- Financial
    agreed_amount DECIMAL(12,2) NOT NULL,
    platform_fee DECIMAL(12,2) NOT NULL,
    rider_earnings DECIMAL(12,2) NOT NULL,
    
    -- Status tracking
    status TEXT DEFAULT 'draft' CHECK (status IN (
        'draft', 'awaiting_rider', 'awaiting_funding', 'funded', 
        'in_progress', 'rider_marked_complete', 'customer_marked_complete',
        'completed', 'disputed', 'cancelled', 'refunded'
    )),
    
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    rider_assigned_at TIMESTAMPTZ,
    funded_at TIMESTAMPTZ,
    started_at TIMESTAMPTZ,
    rider_completed_at TIMESTAMPTZ,
    customer_completed_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    cancelled_at TIMESTAMPTZ,
    cancelled_by UUID REFERENCES profiles(id),
    cancellation_reason TEXT,
    
    -- OTP for delivery confirmation
    delivery_otp TEXT,
    otp_verified BOOLEAN DEFAULT false,
    
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Escrow records linked to dispatch jobs
CREATE TABLE escrow_records (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    dispatch_job_id UUID UNIQUE NOT NULL REFERENCES dispatch_jobs(id) ON DELETE CASCADE,
    customer_wallet_id UUID NOT NULL REFERENCES wallets(id),
    rider_wallet_id UUID REFERENCES wallets(id),
    locked_amount DECIMAL(12,2) NOT NULL,
    platform_fee DECIMAL(12,2) NOT NULL,
    status TEXT DEFAULT 'locked' CHECK (status IN ('not_created', 'locked', 'partially_released', 'released', 'refunded', 'under_review')),
    locked_at TIMESTAMPTZ DEFAULT NOW(),
    released_at TIMESTAMPTZ,
    refunded_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Job status history (audit trail)
CREATE TABLE job_status_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    dispatch_job_id UUID NOT NULL REFERENCES dispatch_jobs(id) ON DELETE CASCADE,
    status_from TEXT,
    status_to TEXT NOT NULL,
    changed_by UUID REFERENCES profiles(id),
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 4. DELIVERY PROOF & DISPUTES
-- ============================================

-- Delivery proof uploads
CREATE TABLE delivery_proofs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    dispatch_job_id UUID NOT NULL REFERENCES dispatch_jobs(id) ON DELETE CASCADE,
    proof_type TEXT NOT NULL CHECK (proof_type IN ('photo', 'signature', 'otp', 'note', 'receipt')),
    image_url TEXT,
    signature_data TEXT,
    notes TEXT,
    uploaded_by UUID NOT NULL REFERENCES profiles(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Disputes
CREATE TABLE disputes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    dispatch_job_id UUID UNIQUE NOT NULL REFERENCES dispatch_jobs(id) ON DELETE CASCADE,
    raised_by UUID NOT NULL REFERENCES profiles(id),
    dispute_type TEXT NOT NULL CHECK (dispute_type IN ('not_delivered', 'damaged', 'wrong_item', 'rider_no_show', 'customer_no_show', 'payment_issue', 'other')),
    description TEXT NOT NULL,
    status TEXT DEFAULT 'open' CHECK (status IN ('open', 'under_review', 'resolved_customer_favor', 'resolved_rider_favor', 'resolved_split', 'closed')),
    resolution_notes TEXT,
    resolved_by UUID REFERENCES profiles(id),
    resolved_at TIMESTAMPTZ,
    refund_amount DECIMAL(12,2),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Dispute evidence
CREATE TABLE dispute_evidence (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    dispute_id UUID NOT NULL REFERENCES disputes(id) ON DELETE CASCADE,
    uploaded_by UUID NOT NULL REFERENCES profiles(id),
    evidence_type TEXT NOT NULL CHECK (evidence_type IN ('image', 'document', 'chat', 'other')),
    file_url TEXT,
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 5. RATINGS & REVIEWS
-- ============================================

-- Ratings and reviews
CREATE TABLE ratings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    dispatch_job_id UUID UNIQUE NOT NULL REFERENCES dispatch_jobs(id) ON DELETE CASCADE,
    rider_id UUID NOT NULL REFERENCES profiles(id),
    customer_id UUID NOT NULL REFERENCES profiles(id),
    rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
    review TEXT,
    is_visible BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 6. NOTIFICATIONS
-- ============================================

-- User notifications
CREATE TABLE notifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    type TEXT NOT NULL CHECK (type IN ('job_assigned', 'job_funded', 'job_started', 'job_completed', 'payment_received', 'withdrawal_processed', 'kyc_status', 'dispute_opened', 'system')),
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    data JSONB,
    is_read BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 7. ADMIN & AUDIT
-- ============================================

-- Admin actions log
CREATE TABLE admin_actions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    admin_id UUID NOT NULL REFERENCES profiles(id),
    action_type TEXT NOT NULL,
    target_table TEXT,
    target_id UUID,
    old_data JSONB,
    new_data JSONB,
    reason TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Platform settings
CREATE TABLE platform_settings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    setting_key TEXT UNIQUE NOT NULL,
    setting_value TEXT,
    setting_type TEXT DEFAULT 'string' CHECK (setting_type IN ('string', 'number', 'boolean', 'json')),
    description TEXT,
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    updated_by UUID REFERENCES profiles(id)
);

-- Insert default platform settings
INSERT INTO platform_settings (setting_key, setting_value, setting_type, description) VALUES
('platform_fee_amount', '200', 'number', 'Platform fee per delivery in Naira'),
('min_wallet_funding', '500', 'number', 'Minimum amount to fund wallet'),
('max_transaction_amount', '500000', 'number', 'Maximum single transaction amount'),
('auto_complete_hours', '24', 'number', 'Hours before auto-marking delivery complete'),
('require_customer_kyc', 'false', 'boolean', 'Require KYC for customers'),
('require_rider_kyc', 'true', 'boolean', 'Require KYC for riders'),
('enable_delivery_otp', 'true', 'boolean', 'Enable OTP confirmation for deliveries');

-- ============================================
-- INDEXES FOR PERFORMANCE
-- ============================================

-- Profile indexes
CREATE INDEX idx_profiles_user_type ON profiles(user_type);
CREATE INDEX idx_profiles_phone ON profiles(phone);

-- Rider profile indexes
CREATE INDEX idx_rider_profiles_is_online ON rider_profiles(is_online);
CREATE INDEX idx_rider_profiles_is_available ON rider_profiles(is_available);
CREATE INDEX idx_rider_profiles_location ON rider_profiles USING GIST(current_location);
CREATE INDEX idx_rider_profiles_verification ON rider_profiles(verification_status);

-- Wallet indexes
CREATE INDEX idx_wallet_transactions_wallet_id ON wallet_transactions(wallet_id);
CREATE INDEX idx_wallet_transactions_type ON wallet_transactions(transaction_type);
CREATE INDEX idx_wallet_transactions_created_at ON wallet_transactions(created_at);

-- Dispatch job indexes
CREATE INDEX idx_dispatch_jobs_customer_id ON dispatch_jobs(customer_id);
CREATE INDEX idx_dispatch_jobs_rider_id ON dispatch_jobs(rider_id);
CREATE INDEX idx_dispatch_jobs_status ON dispatch_jobs(status);
CREATE INDEX idx_dispatch_jobs_created_at ON dispatch_jobs(created_at);
CREATE INDEX idx_dispatch_jobs_pickup_location ON dispatch_jobs USING GIST(pickup_lat, pickup_lng);

-- Notification indexes
CREATE INDEX idx_notifications_profile_id ON notifications(profile_id);
CREATE INDEX idx_notifications_is_read ON notifications(is_read);

-- ============================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================

-- Enable RLS on all tables
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE kyc_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE rider_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE bank_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE wallet_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE withdrawal_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE dispatch_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE escrow_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE job_status_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE delivery_proofs ENABLE ROW LEVEL SECURITY;
ALTER TABLE disputes ENABLE ROW LEVEL SECURITY;
ALTER TABLE dispute_evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE ratings ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- Profiles policies
CREATE POLICY "Users can view own profile" ON profiles
    FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update own profile" ON profiles
    FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Admins can view all profiles" ON profiles
    FOR SELECT USING (
        EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND user_type = 'admin')
    );

-- Rider profiles policies
CREATE POLICY "Riders can view own profile" ON rider_profiles
    FOR SELECT USING (profile_id = auth.uid());

CREATE POLICY "Riders can update own profile" ON rider_profiles
    FOR UPDATE USING (profile_id = auth.uid());

CREATE POLICY "Customers can view verified rider profiles" ON rider_profiles
    FOR SELECT USING (verification_status = 'verified');

CREATE POLICY "Admins can manage all rider profiles" ON rider_profiles
    FOR ALL USING (
        EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND user_type = 'admin')
    );

-- Wallets policies
CREATE POLICY "Users can view own wallet" ON wallets
    FOR SELECT USING (profile_id = auth.uid());

CREATE POLICY "Users can view own transactions" ON wallet_transactions
    FOR SELECT USING (
        EXISTS (SELECT 1 FROM wallets WHERE id = wallet_transactions.wallet_id AND profile_id = auth.uid())
    );

-- Dispatch jobs policies
CREATE POLICY "Customers can view own jobs" ON dispatch_jobs
    FOR SELECT USING (customer_id = auth.uid());

CREATE POLICY "Riders can view assigned jobs" ON dispatch_jobs
    FOR SELECT USING (rider_id = auth.uid());

CREATE POLICY "Customers can create jobs" ON dispatch_jobs
    FOR INSERT WITH CHECK (customer_id = auth.uid());

CREATE POLICY "Customers can update own draft jobs" ON dispatch_jobs
    FOR UPDATE USING (customer_id = auth.uid() AND status = 'draft');

-- Notifications policies
CREATE POLICY "Users can view own notifications" ON notifications
    FOR SELECT USING (profile_id = auth.uid());

CREATE POLICY "Users can update own notifications" ON notifications
    FOR UPDATE USING (profile_id = auth.uid());

-- ============================================
-- FUNCTIONS & TRIGGERS
-- ============================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create triggers for updated_at
CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON profiles
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_rider_profiles_updated_at BEFORE UPDATE ON rider_profiles
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_wallets_updated_at BEFORE UPDATE ON wallets
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_dispatch_jobs_updated_at BEFORE UPDATE ON dispatch_jobs
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_escrow_records_updated_at BEFORE UPDATE ON escrow_records
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Function to generate job number
CREATE OR REPLACE FUNCTION generate_job_number()
RETURNS TRIGGER AS $$
BEGIN
    NEW.job_number = 'DSP-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' || SUBSTRING(MD5(RANDOM()::TEXT), 1, 6);
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER set_job_number BEFORE INSERT ON dispatch_jobs
    FOR EACH ROW EXECUTE FUNCTION generate_job_number();

-- Function to log job status changes
CREATE OR REPLACE FUNCTION log_job_status_change()
RETURNS TRIGGER AS $$
BEGIN
    IF OLD.status IS DISTINCT FROM NEW.status THEN
        INSERT INTO job_status_history (dispatch_job_id, status_from, status_to, changed_by, notes)
        VALUES (NEW.id, OLD.status, NEW.status, auth.uid(), 'Status changed via application');
    END IF;
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER log_status_change AFTER UPDATE ON dispatch_jobs
    FOR EACH ROW EXECUTE FUNCTION log_job_status_change();

-- Function to create wallet on profile creation
CREATE OR REPLACE FUNCTION create_wallet_for_profile()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO wallets (profile_id, currency)
    VALUES (NEW.id, 'NGN');
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER create_wallet_after_profile AFTER INSERT ON profiles
    FOR EACH ROW EXECUTE FUNCTION create_wallet_for_profile();

-- Function to update rider rating average
CREATE OR REPLACE FUNCTION update_rider_rating()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE rider_profiles
    SET rating_average = (
        SELECT ROUND(AVG(rating)::numeric, 1)
        FROM ratings
        WHERE rider_id = NEW.rider_id
    )
    WHERE profile_id = NEW.rider_id;
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_rating_after_insert AFTER INSERT ON ratings
    FOR EACH ROW EXECUTE FUNCTION update_rider_rating();

-- ============================================
-- VIEWS FOR CONVENIENCE
-- ============================================

-- View for available riders with location
CREATE VIEW available_riders AS
SELECT 
    p.id,
    p.full_name,
    p.avatar_url,
    p.phone,
    rp.company_name,
    rp.vehicle_type,
    rp.vehicle_color,
    rp.rating_average,
    rp.total_deliveries,
    rp.current_location,
    rp.service_radius_km,
    ST_X(rp.current_location::geometry) as lng,
    ST_Y(rp.current_location::geometry) as lat
FROM profiles p
JOIN rider_profiles rp ON p.id = rp.profile_id
WHERE rp.is_online = true 
    AND rp.is_available = true 
    AND rp.verification_status = 'verified'
    AND p.is_active = true;

-- View for job details with all related info
CREATE VIEW job_details AS
SELECT 
    dj.*,
    c.full_name as customer_name,
    c.phone as customer_phone,
    c.avatar_url as customer_avatar,
    r.full_name as rider_name,
    r.phone as rider_phone,
    r.avatar_url as rider_avatar,
    er.status as escrow_status,
    er.locked_amount,
    er.released_at as escrow_released_at
FROM dispatch_jobs dj
LEFT JOIN profiles c ON dj.customer_id = c.id
LEFT JOIN profiles r ON dj.rider_id = r.id
LEFT JOIN escrow_records er ON dj.id = er.dispatch_job_id;
