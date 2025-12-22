// Timeline types for comprehensive daily activity view

export type TimelineEventType =
  | 'left_home'
  | 'arrived_home'
  | 'left_office'
  | 'arrived_office'
  | 'arrived_job'
  | 'left_job'
  | 'arrived_unknown'
  | 'left_unknown'
  | 'arrived_custom'
  | 'left_custom'
  | 'clock_in'
  | 'clock_out'
  | 'meal_start'
  | 'meal_end'
  | 'missing_clock_out' // Warning when tech clocked in but never clocked out
  | 'overnight_at_office'; // Info: vehicle was parked at office overnight (take-home truck tech)

export interface TimelineEvent {
  id: string;
  type: TimelineEventType;
  timestamp: string; // ISO datetime

  // Location info
  address?: string;
  latitude?: number;
  longitude?: number;

  // Job info (for job events)
  jobNumber?: string;
  jobId?: string;
  customerName?: string;
  scheduledTime?: string;

  // Derived info
  durationMinutes?: number;    // Time spent at this location (for arrivals)
  travelMinutes?: number;      // Actual GPS segment travel time
  elapsedMinutes?: number;     // Time since previous visible event (may include untracked time)
  hasUntrackedTime?: boolean;  // True if there's unaccounted time between events
  isLate?: boolean;            // For first job arrival
  varianceMinutes?: number;    // How early/late (positive = late)
  isUnnecessary?: boolean;     // For office visits before first job
  isFirstJob?: boolean;        // Mark first job of the day
  isFollowUp?: boolean;        // Mark follow-up jobs (non-physical phone/admin)

  // Custom location info (for arrived_custom/left_custom events)
  customLocationId?: string;
  customLocationName?: string;
  customLocationLogo?: string;
  customLocationCategory?: string;

  // Clock event info (for clock_in/clock_out/meal_start/meal_end events)
  punchId?: string;
  origin?: string;  // 'Mobile', 'Web', etc.
  isViolation?: boolean;
  violationReason?: string;
  expectedLocationType?: string;
  canBeExcused?: boolean;  // For violations that managers can excuse
  isExcused?: boolean;  // If an office visit was excused
  excusedReason?: string;  // 'pickup_helper', 'meeting', 'manager_request', etc.
  gpsLocationType?: string;  // Where GPS showed they were

  // Manual job association info (for jobs manually linked to GPS stops)
  isManualAssociation?: boolean;
  manualAssociationId?: string;
}

export interface DayTimeline {
  date: string;
  dayOfWeek: string;
  technicianId: string;
  technicianName: string;
  events: TimelineEvent[];

  // Summary
  totalJobs: number;
  totalOfficeVisits: number;
  totalDriveMinutes: number;
  firstJobOnTime: boolean | null;
  firstJobVariance: number | null;
  hasMissingClockOut: boolean; // True if tech clocked in but never clocked out
  overnightAtOffice: boolean; // True if take-home truck was parked at office overnight
}

// Tech configuration for timeline building
export interface TechTimelineConfig {
  takesTruckHome: boolean;
  homeLocation?: {
    lat: number;
    lon: number;
    address: string;
  };
  officeLocation: {
    lat: number;
    lon: number;
  };
  excludeFromOfficeVisits?: boolean;
}

// Punch record from database for timeline
export interface TimelinePunchRecord {
  id: string;
  punch_time: string;
  punch_type: string;  // 'ClockIn', 'ClockOut', 'MealStart', 'MealEnd'
  clock_in_time?: string | null;
  clock_out_time?: string | null;
  gps_latitude?: number | null;
  gps_longitude?: number | null;
  gps_address?: string | null;
  gps_location_type?: string | null;
  is_violation?: boolean | null;
  violation_reason?: string | null;
  expected_location_type?: string | null;
  can_be_excused?: boolean | null;
  origin?: string | null;
}

// Manual job association from database
export interface ManualJobAssociation {
  id: string;
  technician_id: string | null;
  job_id: string | null;
  job_date: string;
  gps_latitude: number;
  gps_longitude: number;
  gps_timestamp: string;
  gps_address?: string | null;
  created_at?: string | null;
  notes?: string | null;
}

// Input for timeline building
export interface TimelineInput {
  date: string;
  technicianId: string;
  technicianName: string;
  segments: import('../lib/verizon-connect').VehicleSegment[];
  jobs: import('./reports').JobDetail[];
  techConfig: TechTimelineConfig;
  customLocations?: import('./custom-location').CustomLocation[];
  punches?: TimelinePunchRecord[];
  manualAssociations?: ManualJobAssociation[];
  excusedOfficeVisit?: {
    reason: string;
    notes?: string;
  };
}
