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
  | 'overnight_at_office' // Info: vehicle was parked at office overnight (take-home truck tech)
  | 'proposed_punch' // Pending proposed punch awaiting approval
  | 'material_checkout'; // Material/parts checked out from shop inventory

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

  // Proposed punch info (for pending proposed punches)
  proposedPunchId?: string;
  proposedPunchType?: string; // ClockIn, ClockOut, MealStart, MealEnd
  proposedPunchNote?: string;
  proposedPunchStatus?: string; // pending, submitted, applied, rejected

  // Estimate info (for arrived_job events)
  estimateSummary?: JobEstimateSummary;
  estimates?: EstimateDetail[];

  // Transit analysis (for arrived_job events - shows trip from previous job)
  transitAnalysis?: TransitAnalysis;

  // Material checkout info (for material_checkout events)
  checkoutId?: string;
  checkoutTransactionGroup?: string;
  checkoutTruckNumber?: string;
  checkoutPoNumber?: string;
  checkoutTotalItems?: number;
  checkoutTotalQuantity?: number;
  checkoutItems?: MaterialCheckoutItemDetail[];
}

// Summary of estimates for a job (shown on job card)
export interface JobEstimateSummary {
  totalEstimates: number;
  soldEstimates: number;
  unsoldEstimates: number;
  totalValue: number;
  soldValue: number;
  unsoldValue: number;
  minutesToFirstEstimate: number | null;
  minutesToFirstSale: number | null;
}

// Full estimate detail (for expandable view)
export interface EstimateDetail {
  id: string;
  estimateNumber: string | null;
  name: string | null;
  status: string;
  isSold: boolean;
  total: number | null;
  soldAt: string | null;
  minutesFromArrival: number | null;
  items: EstimateItemDetail[];
}

// Line item on an estimate
export interface EstimateItemDetail {
  id: string;
  skuName: string | null;
  description: string | null;
  quantity: number;
  unitPrice: number | null;
  totalPrice: number | null;
  itemType: string | null;
  isSold: boolean;
}

// Transit analysis between jobs (to detect detours/time theft)
export interface TransitAnalysis {
  fromJobNumber: string;
  toJobNumber: string;
  fromAddress: string;
  toAddress: string;
  expectedDriveMinutes: number;      // Google Directions estimate
  actualElapsedMinutes: number;      // Total time from left_job to arrived_job
  mealBreakMinutes: number;          // Total meal breaks in between
  onClockTransitMinutes: number;     // actualElapsed - mealBreaks
  excessMinutes: number;             // onClockTransit - expectedDrive
  isSuspicious: boolean;             // excessMinutes >= 15 min
  distanceMiles: number;             // Expected distance
}

// Material checkout line item detail
export interface MaterialCheckoutItemDetail {
  partId: string;
  partNumber: string;
  description: string;
  quantity: number;
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
  totalMaterialCheckouts: number; // Number of material checkout transactions
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
  materialCheckouts?: import('../lib/material-checkout').MaterialCheckout[];
}
