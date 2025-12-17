-- Migration: Update punch_records unique constraint to include punch_type
-- This allows ClockIn and ClockOut records at the same timestamp (e.g., lunch breaks)
-- Run this in Supabase SQL Editor

-- First, drop the old constraint if it exists
ALTER TABLE punch_records DROP CONSTRAINT IF EXISTS punch_records_paylocity_employee_id_punch_time_key;

-- Create new unique constraint that includes punch_type
-- This allows both ClockIn and ClockOut at the same punch_time
ALTER TABLE punch_records ADD CONSTRAINT punch_records_paylocity_employee_id_punch_time_punch_type_key
  UNIQUE (paylocity_employee_id, punch_time, punch_type);

-- Add index to improve query performance on the new constraint columns
CREATE INDEX IF NOT EXISTS idx_punch_records_employee_time_type
  ON punch_records(paylocity_employee_id, punch_time, punch_type);
