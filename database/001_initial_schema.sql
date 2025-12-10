-- Tech Truth Database Schema
-- Run this in Supabase SQL Editor

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Technicians table: Links Service Titan technicians to Verizon Connect drivers
CREATE TABLE IF NOT EXISTS technicians (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    st_technician_id BIGINT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    email TEXT,
    phone TEXT,
    verizon_driver_id TEXT,
    verizon_vehicle_id TEXT,
    active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for looking up by Service Titan ID
CREATE INDEX IF NOT EXISTS idx_technicians_st_id ON technicians(st_technician_id);
CREATE INDEX IF NOT EXISTS idx_technicians_verizon_vehicle ON technicians(verizon_vehicle_id);

-- Jobs table: Stores appointment/job data from Service Titan
CREATE TABLE IF NOT EXISTS jobs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    st_job_id BIGINT NOT NULL,
    st_appointment_id BIGINT,
    technician_id UUID REFERENCES technicians(id) ON DELETE CASCADE,
    job_number TEXT NOT NULL,
    customer_name TEXT,
    job_date DATE NOT NULL,
    scheduled_start TIMESTAMPTZ NOT NULL,
    scheduled_end TIMESTAMPTZ,
    actual_arrival TIMESTAMPTZ,
    job_address TEXT,
    job_latitude DECIMAL(10, 8),
    job_longitude DECIMAL(11, 8),
    is_first_job_of_day BOOLEAN DEFAULT false,
    arrival_variance_minutes INTEGER,
    status TEXT DEFAULT 'scheduled',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(st_job_id, st_appointment_id, technician_id)
);

-- Indexes for jobs
CREATE INDEX IF NOT EXISTS idx_jobs_technician ON jobs(technician_id);
CREATE INDEX IF NOT EXISTS idx_jobs_date ON jobs(job_date);
CREATE INDEX IF NOT EXISTS idx_jobs_st_job_id ON jobs(st_job_id);
CREATE INDEX IF NOT EXISTS idx_jobs_first_of_day ON jobs(is_first_job_of_day) WHERE is_first_job_of_day = true;

-- GPS Events table: Stores location data from Verizon Connect
CREATE TABLE IF NOT EXISTS gps_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    technician_id UUID REFERENCES technicians(id) ON DELETE CASCADE,
    job_id UUID REFERENCES jobs(id) ON DELETE SET NULL,
    latitude DECIMAL(10, 8) NOT NULL,
    longitude DECIMAL(11, 8) NOT NULL,
    timestamp TIMESTAMPTZ NOT NULL,
    speed DECIMAL(6, 2),
    heading DECIMAL(5, 2),
    address TEXT,
    event_type TEXT DEFAULT 'location_update',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for GPS events
CREATE INDEX IF NOT EXISTS idx_gps_technician ON gps_events(technician_id);
CREATE INDEX IF NOT EXISTS idx_gps_timestamp ON gps_events(timestamp);
CREATE INDEX IF NOT EXISTS idx_gps_job ON gps_events(job_id);

-- Arrival Discrepancies table: Stores detected arrival time discrepancies
CREATE TABLE IF NOT EXISTS arrival_discrepancies (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    technician_id UUID REFERENCES technicians(id) ON DELETE CASCADE,
    job_id UUID REFERENCES jobs(id) ON DELETE CASCADE,
    job_date DATE NOT NULL,
    scheduled_arrival TIMESTAMPTZ NOT NULL,
    actual_arrival TIMESTAMPTZ NOT NULL,
    variance_minutes INTEGER NOT NULL,
    is_late BOOLEAN DEFAULT false,
    is_first_job BOOLEAN DEFAULT false,
    notes TEXT,
    reviewed BOOLEAN DEFAULT false,
    reviewed_by TEXT,
    reviewed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for discrepancies
CREATE INDEX IF NOT EXISTS idx_discrepancies_technician ON arrival_discrepancies(technician_id);
CREATE INDEX IF NOT EXISTS idx_discrepancies_date ON arrival_discrepancies(job_date);
CREATE INDEX IF NOT EXISTS idx_discrepancies_late ON arrival_discrepancies(is_late) WHERE is_late = true;
CREATE INDEX IF NOT EXISTS idx_discrepancies_unreviewed ON arrival_discrepancies(reviewed) WHERE reviewed = false;

-- Sync Logs table: Track data sync operations
CREATE TABLE IF NOT EXISTS sync_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    sync_type TEXT NOT NULL,
    status TEXT DEFAULT 'running',
    records_processed INTEGER DEFAULT 0,
    errors JSONB,
    started_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ
);

-- Create updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply updated_at triggers
DROP TRIGGER IF EXISTS update_technicians_updated_at ON technicians;
CREATE TRIGGER update_technicians_updated_at
    BEFORE UPDATE ON technicians
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_jobs_updated_at ON jobs;
CREATE TRIGGER update_jobs_updated_at
    BEFORE UPDATE ON jobs
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Enable Row Level Security (RLS) but allow all access for now
ALTER TABLE technicians ENABLE ROW LEVEL SECURITY;
ALTER TABLE jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE gps_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE arrival_discrepancies ENABLE ROW LEVEL SECURITY;
ALTER TABLE sync_logs ENABLE ROW LEVEL SECURITY;

-- Create policies that allow all access (since no auth required yet)
CREATE POLICY "Allow all access to technicians" ON technicians FOR ALL USING (true);
CREATE POLICY "Allow all access to jobs" ON jobs FOR ALL USING (true);
CREATE POLICY "Allow all access to gps_events" ON gps_events FOR ALL USING (true);
CREATE POLICY "Allow all access to arrival_discrepancies" ON arrival_discrepancies FOR ALL USING (true);
CREATE POLICY "Allow all access to sync_logs" ON sync_logs FOR ALL USING (true);

-- Enable realtime for tables we want to subscribe to
ALTER PUBLICATION supabase_realtime ADD TABLE arrival_discrepancies;
ALTER PUBLICATION supabase_realtime ADD TABLE jobs;
ALTER PUBLICATION supabase_realtime ADD TABLE gps_events;

-- Create a view for the dashboard showing today's discrepancies
CREATE OR REPLACE VIEW today_discrepancies AS
SELECT
    ad.id,
    ad.job_date,
    ad.scheduled_arrival,
    ad.actual_arrival,
    ad.variance_minutes,
    ad.is_late,
    ad.is_first_job,
    ad.reviewed,
    ad.notes,
    t.name as technician_name,
    t.st_technician_id,
    j.job_number,
    j.customer_name,
    j.job_address
FROM arrival_discrepancies ad
JOIN technicians t ON ad.technician_id = t.id
JOIN jobs j ON ad.job_id = j.id
WHERE ad.job_date = CURRENT_DATE
ORDER BY ad.variance_minutes DESC;

-- Create a summary view for technician performance
CREATE OR REPLACE VIEW technician_performance AS
SELECT
    t.id as technician_id,
    t.name as technician_name,
    t.st_technician_id,
    COUNT(ad.id) as total_discrepancies,
    COUNT(CASE WHEN ad.is_late THEN 1 END) as late_arrivals,
    COUNT(CASE WHEN ad.is_first_job AND ad.is_late THEN 1 END) as late_first_jobs,
    AVG(CASE WHEN ad.is_late THEN ad.variance_minutes END)::INTEGER as avg_late_minutes,
    MAX(ad.job_date) as last_discrepancy_date
FROM technicians t
LEFT JOIN arrival_discrepancies ad ON t.id = ad.technician_id
WHERE t.active = true
GROUP BY t.id, t.name, t.st_technician_id
ORDER BY late_first_jobs DESC NULLS LAST, late_arrivals DESC NULLS LAST;
