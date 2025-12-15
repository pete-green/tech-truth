// Timeline types for comprehensive daily activity view

export type TimelineEventType =
  | 'left_home'
  | 'arrived_home'
  | 'left_office'
  | 'arrived_office'
  | 'arrived_job'
  | 'left_job';

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
  travelMinutes?: number;      // Time to get here from previous location
  isLate?: boolean;            // For first job arrival
  varianceMinutes?: number;    // How early/late (positive = late)
  isUnnecessary?: boolean;     // For office visits before first job
  isFirstJob?: boolean;        // Mark first job of the day
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

// Input for timeline building
export interface TimelineInput {
  date: string;
  technicianId: string;
  technicianName: string;
  segments: import('../lib/verizon-connect').VehicleSegment[];
  jobs: import('./reports').JobDetail[];
  techConfig: TechTimelineConfig;
}
