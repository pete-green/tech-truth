export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      arrival_discrepancies: {
        Row: {
          actual_arrival: string
          created_at: string | null
          id: string
          is_first_job: boolean | null
          is_late: boolean | null
          job_date: string
          job_id: string | null
          notes: string | null
          reviewed: boolean | null
          reviewed_at: string | null
          reviewed_by: string | null
          scheduled_arrival: string
          technician_id: string | null
          variance_minutes: number
        }
        Insert: {
          actual_arrival: string
          created_at?: string | null
          id?: string
          is_first_job?: boolean | null
          is_late?: boolean | null
          job_date: string
          job_id?: string | null
          notes?: string | null
          reviewed?: boolean | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          scheduled_arrival: string
          technician_id?: string | null
          variance_minutes: number
        }
        Update: {
          actual_arrival?: string
          created_at?: string | null
          id?: string
          is_first_job?: boolean | null
          is_late?: boolean | null
          job_date?: string
          job_id?: string | null
          notes?: string | null
          reviewed?: boolean | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          scheduled_arrival?: string
          technician_id?: string | null
          variance_minutes?: number
        }
        Relationships: [
          {
            foreignKeyName: "arrival_discrepancies_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: true
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "arrival_discrepancies_technician_id_fkey"
            columns: ["technician_id"]
            isOneToOne: false
            referencedRelation: "technician_performance"
            referencedColumns: ["technician_id"]
          },
          {
            foreignKeyName: "arrival_discrepancies_technician_id_fkey"
            columns: ["technician_id"]
            isOneToOne: false
            referencedRelation: "technicians"
            referencedColumns: ["id"]
          },
        ]
      }
      custom_locations: {
        Row: {
          address: string | null
          boundary_polygon: Json | null
          boundary_type: string | null
          category: string | null
          center_latitude: number
          center_longitude: number
          created_at: string | null
          created_by: string | null
          id: string
          logo_url: string | null
          name: string
          radius_feet: number | null
        }
        Insert: {
          address?: string | null
          boundary_polygon?: Json | null
          boundary_type?: string | null
          category?: string | null
          center_latitude: number
          center_longitude: number
          created_at?: string | null
          created_by?: string | null
          id?: string
          logo_url?: string | null
          name: string
          radius_feet?: number | null
        }
        Update: {
          address?: string | null
          boundary_polygon?: Json | null
          boundary_type?: string | null
          category?: string | null
          center_latitude?: number
          center_longitude?: number
          created_at?: string | null
          created_by?: string | null
          id?: string
          logo_url?: string | null
          name?: string
          radius_feet?: number | null
        }
        Relationships: []
      }
      excused_office_visits: {
        Row: {
          created_at: string | null
          excused_by: string | null
          id: string
          notes: string | null
          reason: string
          technician_id: string
          visit_date: string
        }
        Insert: {
          created_at?: string | null
          excused_by?: string | null
          id?: string
          notes?: string | null
          reason: string
          technician_id: string
          visit_date: string
        }
        Update: {
          created_at?: string | null
          excused_by?: string | null
          id?: string
          notes?: string | null
          reason?: string
          technician_id?: string
          visit_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "excused_office_visits_technician_id_fkey"
            columns: ["technician_id"]
            isOneToOne: false
            referencedRelation: "technician_performance"
            referencedColumns: ["technician_id"]
          },
          {
            foreignKeyName: "excused_office_visits_technician_id_fkey"
            columns: ["technician_id"]
            isOneToOne: false
            referencedRelation: "technicians"
            referencedColumns: ["id"]
          },
        ]
      }
      gps_events: {
        Row: {
          address: string | null
          created_at: string | null
          event_type: string | null
          heading: number | null
          id: string
          job_id: string | null
          latitude: number
          longitude: number
          speed: number | null
          technician_id: string | null
          timestamp: string
        }
        Insert: {
          address?: string | null
          created_at?: string | null
          event_type?: string | null
          heading?: number | null
          id?: string
          job_id?: string | null
          latitude: number
          longitude: number
          speed?: number | null
          technician_id?: string | null
          timestamp: string
        }
        Update: {
          address?: string | null
          created_at?: string | null
          event_type?: string | null
          heading?: number | null
          id?: string
          job_id?: string | null
          latitude?: number
          longitude?: number
          speed?: number | null
          technician_id?: string | null
          timestamp?: string
        }
        Relationships: [
          {
            foreignKeyName: "gps_events_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gps_events_technician_id_fkey"
            columns: ["technician_id"]
            isOneToOne: false
            referencedRelation: "technician_performance"
            referencedColumns: ["technician_id"]
          },
          {
            foreignKeyName: "gps_events_technician_id_fkey"
            columns: ["technician_id"]
            isOneToOne: false
            referencedRelation: "technicians"
            referencedColumns: ["id"]
          },
        ]
      }
      gps_segments: {
        Row: {
          created_at: string | null
          distance_miles: number | null
          duration_minutes: number | null
          end_address: string | null
          end_latitude: number | null
          end_longitude: number | null
          end_time: string | null
          id: string
          idle_minutes: number | null
          is_complete: boolean | null
          max_speed: number | null
          raw_segment: Json | null
          segment_date: string
          start_address: string | null
          start_latitude: number
          start_longitude: number
          start_time: string
          technician_id: string | null
          updated_at: string | null
          vehicle_id: string
        }
        Insert: {
          created_at?: string | null
          distance_miles?: number | null
          duration_minutes?: number | null
          end_address?: string | null
          end_latitude?: number | null
          end_longitude?: number | null
          end_time?: string | null
          id?: string
          idle_minutes?: number | null
          is_complete?: boolean | null
          max_speed?: number | null
          raw_segment?: Json | null
          segment_date: string
          start_address?: string | null
          start_latitude: number
          start_longitude: number
          start_time: string
          technician_id?: string | null
          updated_at?: string | null
          vehicle_id: string
        }
        Update: {
          created_at?: string | null
          distance_miles?: number | null
          duration_minutes?: number | null
          end_address?: string | null
          end_latitude?: number | null
          end_longitude?: number | null
          end_time?: string | null
          id?: string
          idle_minutes?: number | null
          is_complete?: boolean | null
          max_speed?: number | null
          raw_segment?: Json | null
          segment_date?: string
          start_address?: string | null
          start_latitude?: number
          start_longitude?: number
          start_time?: string
          technician_id?: string | null
          updated_at?: string | null
          vehicle_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "gps_segments_technician_id_fkey"
            columns: ["technician_id"]
            isOneToOne: false
            referencedRelation: "technician_performance"
            referencedColumns: ["technician_id"]
          },
          {
            foreignKeyName: "gps_segments_technician_id_fkey"
            columns: ["technician_id"]
            isOneToOne: false
            referencedRelation: "technicians"
            referencedColumns: ["id"]
          },
        ]
      }
      jobs: {
        Row: {
          actual_arrival: string | null
          arrival_variance_minutes: number | null
          created_at: string | null
          customer_name: string | null
          id: string
          is_first_job_of_day: boolean | null
          is_follow_up: boolean | null
          job_address: string | null
          job_date: string
          job_latitude: number | null
          job_longitude: number | null
          job_number: string
          scheduled_end: string | null
          scheduled_start: string
          st_appointment_id: number | null
          st_job_id: number
          status: string | null
          technician_id: string | null
          updated_at: string | null
        }
        Insert: {
          actual_arrival?: string | null
          arrival_variance_minutes?: number | null
          created_at?: string | null
          customer_name?: string | null
          id?: string
          is_first_job_of_day?: boolean | null
          is_follow_up?: boolean | null
          job_address?: string | null
          job_date: string
          job_latitude?: number | null
          job_longitude?: number | null
          job_number: string
          scheduled_end?: string | null
          scheduled_start: string
          st_appointment_id?: number | null
          st_job_id: number
          status?: string | null
          technician_id?: string | null
          updated_at?: string | null
        }
        Update: {
          actual_arrival?: string | null
          arrival_variance_minutes?: number | null
          created_at?: string | null
          customer_name?: string | null
          id?: string
          is_first_job_of_day?: boolean | null
          is_follow_up?: boolean | null
          job_address?: string | null
          job_date?: string
          job_latitude?: number | null
          job_longitude?: number | null
          job_number?: string
          scheduled_end?: string | null
          scheduled_start?: string
          st_appointment_id?: number | null
          st_job_id?: number
          status?: string | null
          technician_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "jobs_technician_id_fkey"
            columns: ["technician_id"]
            isOneToOne: false
            referencedRelation: "technician_performance"
            referencedColumns: ["technician_id"]
          },
          {
            foreignKeyName: "jobs_technician_id_fkey"
            columns: ["technician_id"]
            isOneToOne: false
            referencedRelation: "technicians"
            referencedColumns: ["id"]
          },
        ]
      }
      manual_job_associations: {
        Row: {
          created_at: string | null
          gps_address: string | null
          gps_latitude: number
          gps_longitude: number
          gps_timestamp: string
          id: string
          job_date: string
          job_id: string | null
          notes: string | null
          technician_id: string | null
        }
        Insert: {
          created_at?: string | null
          gps_address?: string | null
          gps_latitude: number
          gps_longitude: number
          gps_timestamp: string
          id?: string
          job_date: string
          job_id?: string | null
          notes?: string | null
          technician_id?: string | null
        }
        Update: {
          created_at?: string | null
          gps_address?: string | null
          gps_latitude?: number
          gps_longitude?: number
          gps_timestamp?: string
          id?: string
          job_date?: string
          job_id?: string | null
          notes?: string | null
          technician_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "manual_job_associations_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "manual_job_associations_technician_id_fkey"
            columns: ["technician_id"]
            isOneToOne: false
            referencedRelation: "technician_performance"
            referencedColumns: ["technician_id"]
          },
          {
            foreignKeyName: "manual_job_associations_technician_id_fkey"
            columns: ["technician_id"]
            isOneToOne: false
            referencedRelation: "technicians"
            referencedColumns: ["id"]
          },
        ]
      }
      office_visits: {
        Row: {
          arrival_time: string | null
          created_at: string | null
          departure_time: string | null
          duration_minutes: number | null
          id: string
          is_unnecessary: boolean | null
          technician_id: string | null
          visit_date: string
          visit_type: string
        }
        Insert: {
          arrival_time?: string | null
          created_at?: string | null
          departure_time?: string | null
          duration_minutes?: number | null
          id?: string
          is_unnecessary?: boolean | null
          technician_id?: string | null
          visit_date: string
          visit_type: string
        }
        Update: {
          arrival_time?: string | null
          created_at?: string | null
          departure_time?: string | null
          duration_minutes?: number | null
          id?: string
          is_unnecessary?: boolean | null
          technician_id?: string | null
          visit_date?: string
          visit_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "office_visits_technician_id_fkey"
            columns: ["technician_id"]
            isOneToOne: false
            referencedRelation: "technician_performance"
            referencedColumns: ["technician_id"]
          },
          {
            foreignKeyName: "office_visits_technician_id_fkey"
            columns: ["technician_id"]
            isOneToOne: false
            referencedRelation: "technicians"
            referencedColumns: ["id"]
          },
        ]
      }
      punch_records: {
        Row: {
          can_be_excused: boolean | null
          clock_in_time: string | null
          clock_out_time: string | null
          cost_center: string | null
          cost_center_name: string | null
          created_at: string | null
          duration_hours: number | null
          expected_location_type: string | null
          gps_address: string | null
          gps_distance_from_punch_feet: number | null
          gps_latitude: number | null
          gps_location_type: string | null
          gps_longitude: number | null
          gps_timestamp: string | null
          id: string
          is_violation: boolean | null
          job_code: string | null
          origin: string | null
          paylocity_employee_id: string
          punch_date: string
          punch_time: string
          punch_type: string
          technician_id: string | null
          violation_reason: string | null
        }
        Insert: {
          can_be_excused?: boolean | null
          clock_in_time?: string | null
          clock_out_time?: string | null
          cost_center?: string | null
          cost_center_name?: string | null
          created_at?: string | null
          duration_hours?: number | null
          expected_location_type?: string | null
          gps_address?: string | null
          gps_distance_from_punch_feet?: number | null
          gps_latitude?: number | null
          gps_location_type?: string | null
          gps_longitude?: number | null
          gps_timestamp?: string | null
          id?: string
          is_violation?: boolean | null
          job_code?: string | null
          origin?: string | null
          paylocity_employee_id: string
          punch_date: string
          punch_time: string
          punch_type: string
          technician_id?: string | null
          violation_reason?: string | null
        }
        Update: {
          can_be_excused?: boolean | null
          clock_in_time?: string | null
          clock_out_time?: string | null
          cost_center?: string | null
          cost_center_name?: string | null
          created_at?: string | null
          duration_hours?: number | null
          expected_location_type?: string | null
          gps_address?: string | null
          gps_distance_from_punch_feet?: number | null
          gps_latitude?: number | null
          gps_location_type?: string | null
          gps_longitude?: number | null
          gps_timestamp?: string | null
          id?: string
          is_violation?: boolean | null
          job_code?: string | null
          origin?: string | null
          paylocity_employee_id?: string
          punch_date?: string
          punch_time?: string
          punch_type?: string
          technician_id?: string | null
          violation_reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "punch_records_technician_id_fkey"
            columns: ["technician_id"]
            isOneToOne: false
            referencedRelation: "technician_performance"
            referencedColumns: ["technician_id"]
          },
          {
            foreignKeyName: "punch_records_technician_id_fkey"
            columns: ["technician_id"]
            isOneToOne: false
            referencedRelation: "technicians"
            referencedColumns: ["id"]
          },
        ]
      }
      sync_logs: {
        Row: {
          completed_at: string | null
          errors: Json | null
          id: string
          records_processed: number | null
          started_at: string | null
          status: string | null
          sync_type: string
        }
        Insert: {
          completed_at?: string | null
          errors?: Json | null
          id?: string
          records_processed?: number | null
          started_at?: string | null
          status?: string | null
          sync_type: string
        }
        Update: {
          completed_at?: string | null
          errors?: Json | null
          id?: string
          records_processed?: number | null
          started_at?: string | null
          status?: string | null
          sync_type?: string
        }
        Relationships: []
      }
      technicians: {
        Row: {
          active: boolean | null
          created_at: string | null
          email: string | null
          exclude_from_office_visits: boolean | null
          home_address: string | null
          home_latitude: number | null
          home_longitude: number | null
          id: string
          name: string
          paylocity_employee_id: string | null
          phone: string | null
          st_technician_id: number
          takes_truck_home: boolean | null
          updated_at: string | null
          verizon_driver_id: string | null
          verizon_vehicle_id: string | null
        }
        Insert: {
          active?: boolean | null
          created_at?: string | null
          email?: string | null
          exclude_from_office_visits?: boolean | null
          home_address?: string | null
          home_latitude?: number | null
          home_longitude?: number | null
          id?: string
          name: string
          paylocity_employee_id?: string | null
          phone?: string | null
          st_technician_id: number
          takes_truck_home?: boolean | null
          updated_at?: string | null
          verizon_driver_id?: string | null
          verizon_vehicle_id?: string | null
        }
        Update: {
          active?: boolean | null
          created_at?: string | null
          email?: string | null
          exclude_from_office_visits?: boolean | null
          home_address?: string | null
          home_latitude?: number | null
          home_longitude?: number | null
          id?: string
          name?: string
          paylocity_employee_id?: string | null
          phone?: string | null
          st_technician_id?: number
          takes_truck_home?: boolean | null
          updated_at?: string | null
          verizon_driver_id?: string | null
          verizon_vehicle_id?: string | null
        }
        Relationships: []
      }
      trucks: {
        Row: {
          active: boolean | null
          created_at: string | null
          description: string | null
          id: string
          truck_number: string
          updated_at: string | null
          verizon_vehicle_id: string
        }
        Insert: {
          active?: boolean | null
          created_at?: string | null
          description?: string | null
          id?: string
          truck_number: string
          updated_at?: string | null
          verizon_vehicle_id: string
        }
        Update: {
          active?: boolean | null
          created_at?: string | null
          description?: string | null
          id?: string
          truck_number?: string
          updated_at?: string | null
          verizon_vehicle_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      technician_performance: {
        Row: {
          avg_late_minutes: number | null
          last_discrepancy_date: string | null
          late_arrivals: number | null
          late_first_jobs: number | null
          st_technician_id: number | null
          technician_id: string | null
          technician_name: string | null
          total_discrepancies: number | null
        }
        Relationships: []
      }
      today_discrepancies: {
        Row: {
          actual_arrival: string | null
          customer_name: string | null
          id: string | null
          is_first_job: boolean | null
          is_late: boolean | null
          job_address: string | null
          job_date: string | null
          job_number: string | null
          notes: string | null
          reviewed: boolean | null
          scheduled_arrival: string | null
          st_technician_id: number | null
          technician_name: string | null
          variance_minutes: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const

// Convenience types
export type Technician = Database['public']['Tables']['technicians']['Row'];
export type Job = Database['public']['Tables']['jobs']['Row'];
export type GpsEvent = Database['public']['Tables']['gps_events']['Row'];
export type ArrivalDiscrepancy = Database['public']['Tables']['arrival_discrepancies']['Row'];
export type SyncLog = Database['public']['Tables']['sync_logs']['Row'];
export type Truck = Database['public']['Tables']['trucks']['Row'];
export type OfficeVisit = Database['public']['Tables']['office_visits']['Row'];
export type CustomLocationDb = Database['public']['Tables']['custom_locations']['Row'];
export type PunchRecord = Database['public']['Tables']['punch_records']['Row'];
export type ExcusedOfficeVisit = Database['public']['Tables']['excused_office_visits']['Row'];
export type ManualJobAssociationDb = Database['public']['Tables']['manual_job_associations']['Row'];
