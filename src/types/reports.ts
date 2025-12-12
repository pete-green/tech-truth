export interface TechnicianFilterItem {
  id: string;
  name: string;
  totalFirstJobs: number;
  lateFirstJobs: number;
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

export interface DayDetail {
  date: string;
  dayOfWeek: string;
  jobs: JobDetail[];
  summary: {
    totalJobs: number;
    firstJobLate: boolean;
    firstJobVariance: number | null;
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
