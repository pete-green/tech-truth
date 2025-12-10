// Database types for Tech Truth
export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  public: {
    Tables: {
      technicians: {
        Row: {
          id: string;
          st_technician_id: number;
          name: string;
          email: string | null;
          phone: string | null;
          verizon_driver_id: string | null;
          verizon_vehicle_id: string | null;
          active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          st_technician_id: number;
          name: string;
          email?: string | null;
          phone?: string | null;
          verizon_driver_id?: string | null;
          verizon_vehicle_id?: string | null;
          active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          st_technician_id?: number;
          name?: string;
          email?: string | null;
          phone?: string | null;
          verizon_driver_id?: string | null;
          verizon_vehicle_id?: string | null;
          active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
      };
      jobs: {
        Row: {
          id: string;
          st_job_id: number;
          st_appointment_id: number | null;
          technician_id: string;
          job_number: string;
          customer_name: string | null;
          job_date: string;
          scheduled_start: string;
          scheduled_end: string | null;
          actual_arrival: string | null;
          job_address: string | null;
          job_latitude: number | null;
          job_longitude: number | null;
          is_first_job_of_day: boolean;
          arrival_variance_minutes: number | null;
          status: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          st_job_id: number;
          st_appointment_id?: number | null;
          technician_id: string;
          job_number: string;
          customer_name?: string | null;
          job_date: string;
          scheduled_start: string;
          scheduled_end?: string | null;
          actual_arrival?: string | null;
          job_address?: string | null;
          job_latitude?: number | null;
          job_longitude?: number | null;
          is_first_job_of_day?: boolean;
          arrival_variance_minutes?: number | null;
          status?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          st_job_id?: number;
          st_appointment_id?: number | null;
          technician_id?: string;
          job_number?: string;
          customer_name?: string | null;
          job_date?: string;
          scheduled_start?: string;
          scheduled_end?: string | null;
          actual_arrival?: string | null;
          job_address?: string | null;
          job_latitude?: number | null;
          job_longitude?: number | null;
          is_first_job_of_day?: boolean;
          arrival_variance_minutes?: number | null;
          status?: string;
          created_at?: string;
          updated_at?: string;
        };
      };
      gps_events: {
        Row: {
          id: string;
          technician_id: string;
          job_id: string | null;
          latitude: number;
          longitude: number;
          timestamp: string;
          speed: number | null;
          heading: number | null;
          address: string | null;
          event_type: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          technician_id: string;
          job_id?: string | null;
          latitude: number;
          longitude: number;
          timestamp: string;
          speed?: number | null;
          heading?: number | null;
          address?: string | null;
          event_type?: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          technician_id?: string;
          job_id?: string | null;
          latitude?: number;
          longitude?: number;
          timestamp?: string;
          speed?: number | null;
          heading?: number | null;
          address?: string | null;
          event_type?: string;
          created_at?: string;
        };
      };
      arrival_discrepancies: {
        Row: {
          id: string;
          technician_id: string;
          job_id: string;
          job_date: string;
          scheduled_arrival: string;
          actual_arrival: string;
          variance_minutes: number;
          is_late: boolean;
          is_first_job: boolean;
          notes: string | null;
          reviewed: boolean;
          reviewed_by: string | null;
          reviewed_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          technician_id: string;
          job_id: string;
          job_date: string;
          scheduled_arrival: string;
          actual_arrival: string;
          variance_minutes: number;
          is_late?: boolean;
          is_first_job?: boolean;
          notes?: string | null;
          reviewed?: boolean;
          reviewed_by?: string | null;
          reviewed_at?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          technician_id?: string;
          job_id?: string;
          job_date?: string;
          scheduled_arrival?: string;
          actual_arrival?: string;
          variance_minutes?: number;
          is_late?: boolean;
          is_first_job?: boolean;
          notes?: string | null;
          reviewed?: boolean;
          reviewed_by?: string | null;
          reviewed_at?: string | null;
          created_at?: string;
        };
      };
      sync_logs: {
        Row: {
          id: string;
          sync_type: string;
          status: string;
          records_processed: number;
          errors: Json | null;
          started_at: string;
          completed_at: string | null;
        };
        Insert: {
          id?: string;
          sync_type: string;
          status?: string;
          records_processed?: number;
          errors?: Json | null;
          started_at?: string;
          completed_at?: string | null;
        };
        Update: {
          id?: string;
          sync_type?: string;
          status?: string;
          records_processed?: number;
          errors?: Json | null;
          started_at?: string;
          completed_at?: string | null;
        };
      };
    };
  };
}

// Convenience types
export type Technician = Database['public']['Tables']['technicians']['Row'];
export type Job = Database['public']['Tables']['jobs']['Row'];
export type GpsEvent = Database['public']['Tables']['gps_events']['Row'];
export type ArrivalDiscrepancy = Database['public']['Tables']['arrival_discrepancies']['Row'];
export type SyncLog = Database['public']['Tables']['sync_logs']['Row'];
