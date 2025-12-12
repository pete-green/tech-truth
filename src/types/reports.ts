export interface TechnicianFilterItem {
  id: string;
  name: string;
  totalFirstJobs: number;
  verifiedFirstJobs: number;
  unverifiedFirstJobs: number;
  lateFirstJobs: number;
  hasInaccurateData: boolean;
}

export interface JobDetail {
  id: string;
  jobNumber: string;
  customerName: string | null;
  jobAddress: string | null;
  scheduledStart: string;
  actualArrival: string | null;
  varianceMinutes: number | null;
  isLate: boolean;
  isFirstJob: boolean;
  jobLatitude: number | null;
  jobLongitude: number | null;
  status: string | null;
}

export type OfficeVisitType = 'morning_departure' | 'mid_day_visit' | 'end_of_day';

export interface OfficeVisitDetail {
  arrivalTime: string | null;
  departureTime: string | null;
  durationMinutes: number | null;
  visitType: OfficeVisitType;
}

export interface OfficeVisitSummary {
  totalMidDayVisits: number;
  totalMinutesAtOffice: number;
  techsWithMostVisits: {
    technicianId: string;
    technicianName: string;
    visitCount: number;
    totalMinutes: number;
  }[];
}

export interface DayDetail {
  date: string;
  dayOfWeek: string;
  jobs: JobDetail[];
  officeVisits?: OfficeVisitDetail[];
  summary: {
    totalJobs: number;
    firstJobLate: boolean;
    firstJobVariance: number | null;
    midDayOfficeMinutes?: number;
  };
}

export interface TechnicianDayDetails {
  technicianId: string;
  technicianName: string;
  days: DayDetail[];
}

export interface GpsLocation {
  latitude: number;
  longitude: number;
  address: string | null;
}

export interface FirstCallLocationData {
  jobLocation: GpsLocation;
  truckLocation: (GpsLocation & {
    timestamp: string;
    distanceFromJobFeet: number;
  }) | null;
}

export interface GpsModalState {
  isOpen: boolean;
  technicianName: string;
  jobDate: string;
  scheduledTime: string;
  jobId: string;
  technicianId: string;
  data: FirstCallLocationData | null;
  loading: boolean;
  error: string | null;
}
