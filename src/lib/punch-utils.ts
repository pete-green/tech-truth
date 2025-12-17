// Punch utilities for clock-in/clock-out violation detection

// CustomLocation interface for location matching
export interface CustomLocation {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  radiusFeet?: number;
  polygon?: { lat: number; lon: number }[];
}

export interface PunchViolation {
  isViolation: boolean;
  reason: string | null;
  expectedLocationType: string;
  actualLocationType: string;
  canBeExcused?: boolean;  // For office visits that can be excused
  varianceMinutes?: number;  // How many minutes off from expected
}

export interface TechnicianConfig {
  takesTruckHome: boolean;
  homeLatitude?: number;
  homeLongitude?: number;
}

export interface GPSLocation {
  latitude: number;
  longitude: number;
  address?: string;
  timestamp: Date;
}

// Interface matching VehicleSegment from verizon-connect
export interface VehicleSegmentInput {
  StartDateUtc: string;
  EndDateUtc: string | null;
  StartLocation: {
    Latitude: number;
    Longitude: number;
    Address?: string;
  };
  EndLocation: {
    Latitude: number;
    Longitude: number;
    Address?: string;
  } | null;
}

/**
 * Find the GPS location closest to a given time from vehicle segments
 *
 * GPS segments represent stops (when vehicle is stationary).
 * Between segments = driving (no GPS location).
 * For in-transit scenarios, we find the nearest segment.
 *
 * Default tolerance is 15 minutes - enough for:
 * - Minor timing discrepancies between systems
 * - Clock-ins/outs while approaching a stop
 * But not so long that we match wrong segments (like home from morning)
 */
export function findLocationAtTime(
  segments: VehicleSegmentInput[],
  targetTime: Date,
  toleranceMs: number = 15 * 60 * 1000 // 15 minutes - reduced from 60 to prevent wrong matches
): GPSLocation | null {
  if (!segments || segments.length === 0) return null;

  const targetMs = targetTime.getTime();

  // First, find segment where targetTime falls between start and end (at a stop)
  for (const seg of segments) {
    const startMs = new Date(seg.StartDateUtc).getTime();
    const endMs = seg.EndDateUtc ? new Date(seg.EndDateUtc).getTime() : startMs + (24 * 60 * 60 * 1000);

    if (targetMs >= startMs && targetMs <= endMs) {
      // Determine which location to use based on where we are in the segment
      const segDuration = endMs - startMs;
      const elapsed = targetMs - startMs;
      const useEndLocation = segDuration > 0 && elapsed > segDuration / 2 && seg.EndLocation;

      const location = useEndLocation ? seg.EndLocation! : seg.StartLocation;
      return {
        latitude: location.Latitude,
        longitude: location.Longitude,
        address: location.Address,
        timestamp: targetTime,
      };
    }
  }

  // No exact match - likely in-transit (driving between stops)
  // Find the nearest segment start/end within tolerance
  let nearestSegment: VehicleSegmentInput | null = null;
  let nearestDistance = Infinity;
  let useEnd = false;

  for (const seg of segments) {
    const startMs = new Date(seg.StartDateUtc).getTime();
    const endMs = seg.EndDateUtc ? new Date(seg.EndDateUtc).getTime() : startMs;

    // Check distance to segment start (arrival at location)
    const distToStart = Math.abs(targetMs - startMs);
    if (distToStart < nearestDistance && distToStart <= toleranceMs) {
      nearestDistance = distToStart;
      nearestSegment = seg;
      useEnd = false;
    }

    // Check distance to segment end (departure from location)
    if (seg.EndDateUtc && seg.EndLocation) {
      const distToEnd = Math.abs(targetMs - endMs);
      if (distToEnd < nearestDistance && distToEnd <= toleranceMs) {
        nearestDistance = distToEnd;
        nearestSegment = seg;
        useEnd = true;
      }
    }
  }

  if (nearestSegment) {
    const location = useEnd && nearestSegment.EndLocation
      ? nearestSegment.EndLocation
      : nearestSegment.StartLocation;
    return {
      latitude: location.Latitude,
      longitude: location.Longitude,
      address: location.Address,
      timestamp: new Date(useEnd && nearestSegment.EndDateUtc ? nearestSegment.EndDateUtc : nearestSegment.StartDateUtc),
    };
  }

  return null;
}

/**
 * Detect clock-in violations
 */
export function detectClockInViolation(
  clockInTime: Date,
  gpsLocationType: string,
  techConfig: TechnicianConfig,
  firstJobStartTime: Date | null,
  hasExcusedOfficeVisit: boolean,
  toleranceMinutes: number = 5
): PunchViolation {
  const noViolation: PunchViolation = {
    isViolation: false,
    reason: null,
    expectedLocationType: techConfig.takesTruckHome ? 'job' : 'office',
    actualLocationType: gpsLocationType,
  };

  // If we don't know where they were, can't determine violation
  if (gpsLocationType === 'unknown' || gpsLocationType === 'no_gps') {
    return {
      isViolation: false,
      reason: null,
      expectedLocationType: techConfig.takesTruckHome ? 'job' : 'office',
      actualLocationType: gpsLocationType,
    };
  }

  if (techConfig.takesTruckHome) {
    // Takes truck home: should clock in at first job site (or office if excused)

    if (gpsLocationType === 'home') {
      // Clocked in at home - always a violation
      return {
        isViolation: true,
        reason: 'Clocked in at HOME instead of job site',
        expectedLocationType: 'job',
        actualLocationType: 'home',
        canBeExcused: false,
      };
    }

    if (gpsLocationType === 'office' && !hasExcusedOfficeVisit) {
      // Clocked in at office without excuse
      return {
        isViolation: true,
        reason: 'Clocked in at OFFICE - should go direct to job (no excused visit)',
        expectedLocationType: 'job',
        actualLocationType: 'office',
        canBeExcused: true,  // Manager can excuse this
      };
    }

    // If at office WITH excuse, that's fine - no violation
    if (gpsLocationType === 'office' && hasExcusedOfficeVisit) {
      return noViolation;
    }

    // At job site or custom location - that's fine
    if (gpsLocationType === 'job' || gpsLocationType === 'custom') {
      return noViolation;
    }
  } else {
    // Doesn't take truck home: should clock in at office
    if (gpsLocationType !== 'office') {
      return {
        isViolation: true,
        reason: `Clocked in at ${gpsLocationType.toUpperCase()} instead of office`,
        expectedLocationType: 'office',
        actualLocationType: gpsLocationType,
        canBeExcused: false,
      };
    }
  }

  return noViolation;
}

/**
 * Detect clock-out violations
 */
export function detectClockOutViolation(
  clockOutTime: Date,
  gpsLocationType: string,
  lastJobDepartureTime: Date | null,
  lastStopType: string | null,  // 'job', 'office', 'home'
  techConfig: TechnicianConfig,
  toleranceMinutes: number = 5
): PunchViolation {
  const noViolation: PunchViolation = {
    isViolation: false,
    reason: null,
    expectedLocationType: techConfig.takesTruckHome ? 'job' : 'office',
    actualLocationType: gpsLocationType,
  };

  // If we don't know where they were, can't determine violation
  if (gpsLocationType === 'unknown' || gpsLocationType === 'no_gps') {
    return noViolation;
  }

  // If last stop was office, clocking out at/near office is fine
  if (lastStopType === 'office') {
    return noViolation;
  }

  if (techConfig.takesTruckHome) {
    // Takes truck home: should clock out when leaving last job

    if (gpsLocationType === 'home') {
      // Clocked out at home - violation
      return {
        isViolation: true,
        reason: 'Clocked out at HOME - should clock out when leaving last job',
        expectedLocationType: 'job',
        actualLocationType: 'home',
        canBeExcused: false,
      };
    }

    // Check if clock-out is too long after leaving last job
    if (lastJobDepartureTime) {
      const minutesSinceLastJob = Math.round(
        (clockOutTime.getTime() - lastJobDepartureTime.getTime()) / (1000 * 60)
      );

      if (minutesSinceLastJob > toleranceMinutes) {
        return {
          isViolation: true,
          reason: `Clocked out ${minutesSinceLastJob}m after leaving last job`,
          expectedLocationType: 'job',
          actualLocationType: gpsLocationType,
          canBeExcused: false,
          varianceMinutes: minutesSinceLastJob,
        };
      }
    }
  }

  return noViolation;
}

/**
 * Detect missing clock-in (has scheduled jobs but no clock-in)
 */
export function detectMissingClockIn(
  hasScheduledJobs: boolean,
  hasClockIn: boolean,
  firstJobStartTime: Date | null
): PunchViolation | null {
  if (hasScheduledJobs && !hasClockIn) {
    return {
      isViolation: true,
      reason: 'Scheduled jobs but no clock-in recorded',
      expectedLocationType: 'any',
      actualLocationType: 'no_punch',
      canBeExcused: false,
    };
  }
  return null;
}

/**
 * Detect missing clock-out (has clock-in but no clock-out at end of day)
 */
export function detectMissingClockOut(
  hasClockIn: boolean,
  hasClockOut: boolean,
  clockInTime: Date | null
): PunchViolation | null {
  if (hasClockIn && !hasClockOut) {
    return {
      isViolation: true,
      reason: 'Clocked in but no clock-out recorded',
      expectedLocationType: 'any',
      actualLocationType: 'no_punch',
      canBeExcused: false,
    };
  }
  return null;
}

/**
 * Calculate distance in feet between two GPS coordinates
 */
export function calculateDistanceFeet(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 20902231; // Earth's radius in feet
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Determine location type from GPS coordinates
 */
export function determineLocationType(
  latitude: number,
  longitude: number,
  officeLocation: { lat: number; lon: number },
  homeLocation: { lat: number; lon: number } | null,
  customLocations: CustomLocation[],
  jobLocations: Array<{ lat: number; lon: number; address?: string }>,
  radiusFeet: number = 500
): string {
  // Check office
  const officeDistance = calculateDistanceFeet(latitude, longitude, officeLocation.lat, officeLocation.lon);
  if (officeDistance <= radiusFeet) {
    return 'office';
  }

  // Check home
  if (homeLocation) {
    const homeDistance = calculateDistanceFeet(latitude, longitude, homeLocation.lat, homeLocation.lon);
    if (homeDistance <= radiusFeet) {
      return 'home';
    }
  }

  // Check custom locations
  for (const loc of customLocations) {
    const locDistance = calculateDistanceFeet(latitude, longitude, loc.latitude, loc.longitude);
    if (locDistance <= (loc.radiusFeet || radiusFeet)) {
      return 'custom';
    }
  }

  // Check job locations
  for (const job of jobLocations) {
    const jobDistance = calculateDistanceFeet(latitude, longitude, job.lat, job.lon);
    if (jobDistance <= radiusFeet) {
      return 'job';
    }
  }

  return 'unknown';
}

/**
 * Process a day's punch data and detect all violations
 */
export interface DayPunchSummary {
  employeeId: string;
  date: string;
  clockInTime: string | null;
  clockOutTime: string | null;
  clockInLocation: GPSLocation | null;
  clockOutLocation: GPSLocation | null;
  clockInLocationType: string;
  clockOutLocationType: string;
  clockInViolation: PunchViolation | null;
  clockOutViolation: PunchViolation | null;
  missingClockInViolation: PunchViolation | null;
  missingClockOutViolation: PunchViolation | null;
  hasViolation: boolean;
  violations: PunchViolation[];
  durationHours: number | null;
  mealBreaks: Array<{ start: string; end: string | null }>;
}

export function processDayPunches(
  punchRecord: {
    employeeId: string;
    punchDate: string;
    clockInTime: string | null;
    clockOutTime: string | null;
    durationHours: number | null;
  },
  gpsSegments: VehicleSegmentInput[],
  techConfig: TechnicianConfig,
  officeLocation: { lat: number; lon: number },
  customLocations: CustomLocation[],
  jobLocations: Array<{ lat: number; lon: number; address?: string }>,
  hasScheduledJobs: boolean,
  lastJobDepartureTime: Date | null,
  lastStopType: string | null,
  hasExcusedOfficeVisit: boolean
): DayPunchSummary {
  const violations: PunchViolation[] = [];

  // Parse times
  const clockInTime = punchRecord.clockInTime ? new Date(punchRecord.clockInTime) : null;
  const clockOutTime = punchRecord.clockOutTime ? new Date(punchRecord.clockOutTime) : null;

  // Find GPS locations at punch times
  const clockInLocation = clockInTime ? findLocationAtTime(gpsSegments, clockInTime) : null;
  const clockOutLocation = clockOutTime ? findLocationAtTime(gpsSegments, clockOutTime) : null;

  // Determine location types
  const homeLocation = techConfig.homeLatitude && techConfig.homeLongitude
    ? { lat: techConfig.homeLatitude, lon: techConfig.homeLongitude }
    : null;

  let clockInLocationType = 'no_gps';
  if (clockInLocation) {
    clockInLocationType = determineLocationType(
      clockInLocation.latitude,
      clockInLocation.longitude,
      officeLocation,
      homeLocation,
      customLocations,
      jobLocations
    );
  }

  let clockOutLocationType = 'no_gps';
  if (clockOutLocation) {
    clockOutLocationType = determineLocationType(
      clockOutLocation.latitude,
      clockOutLocation.longitude,
      officeLocation,
      homeLocation,
      customLocations,
      jobLocations
    );
  }

  // Check for missing punches
  const missingClockInViolation = detectMissingClockIn(hasScheduledJobs, !!clockInTime, null);
  if (missingClockInViolation) {
    violations.push(missingClockInViolation);
  }

  const missingClockOutViolation = detectMissingClockOut(!!clockInTime, !!clockOutTime, clockInTime);
  if (missingClockOutViolation) {
    violations.push(missingClockOutViolation);
  }

  // Check clock-in violation
  let clockInViolation: PunchViolation | null = null;
  if (clockInTime && clockInLocationType !== 'no_gps') {
    clockInViolation = detectClockInViolation(
      clockInTime,
      clockInLocationType,
      techConfig,
      null,
      hasExcusedOfficeVisit
    );
    if (clockInViolation.isViolation) {
      violations.push(clockInViolation);
    }
  }

  // Check clock-out violation
  let clockOutViolation: PunchViolation | null = null;
  if (clockOutTime && clockOutLocationType !== 'no_gps') {
    clockOutViolation = detectClockOutViolation(
      clockOutTime,
      clockOutLocationType,
      lastJobDepartureTime,
      lastStopType,
      techConfig
    );
    if (clockOutViolation.isViolation) {
      violations.push(clockOutViolation);
    }
  }

  return {
    employeeId: punchRecord.employeeId,
    date: punchRecord.punchDate,
    clockInTime: punchRecord.clockInTime,
    clockOutTime: punchRecord.clockOutTime,
    clockInLocation,
    clockOutLocation,
    clockInLocationType,
    clockOutLocationType,
    clockInViolation,
    clockOutViolation,
    missingClockInViolation,
    missingClockOutViolation,
    hasViolation: violations.length > 0,
    violations,
    durationHours: punchRecord.durationHours,
    mealBreaks: [], // TODO: Parse from additional punch segments
  };
}
