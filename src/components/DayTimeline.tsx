'use client';

import { format, parseISO } from 'date-fns';
import { Home, Building, MapPin, Car, AlertTriangle, Clock, Navigation, HelpCircle, Tag, Coffee, Check, Briefcase, Link2, MessageSquare, Plus } from 'lucide-react';
import { DayTimeline, TimelineEvent } from '@/types/timeline';
import { getCategoryIcon, getCategoryColors } from '@/lib/location-logos';

interface MapLocation {
  latitude: number;
  longitude: number;
  label: string;
  address?: string;
}

interface LabelLocationData {
  latitude: number;
  longitude: number;
  address: string;
}

export interface AssignJobData {
  technicianId: string;
  date: string;
  latitude: number;
  longitude: number;
  timestamp: string;
  address: string;
}

export interface AnnotatePunchData {
  punchRecordId: string;
  punchType: string;
  punchTime: string;
  gpsLocationType?: string;
  address?: string;
  isViolation?: boolean;
  violationReason?: string;
}

export interface AddMissingPunchData {
  technicianId: string;
  technicianName: string;
  date: string;
}

interface DayTimelineProps {
  timeline: DayTimeline;
  onShowGpsLocation?: (jobId: string, jobNumber: string) => void;
  onShowMapLocation?: (location: MapLocation) => void;
  onLabelLocation?: (location: LabelLocationData) => void;
  onAssignJob?: (data: AssignJobData) => void;
  onAnnotatePunch?: (data: AnnotatePunchData) => void;
  onAddMissingPunch?: (data: AddMissingPunchData) => void;
  annotationCounts?: Record<string, number>; // punchId -> count of annotations
}

function formatDuration(minutes: number): string {
  if (minutes < 60) {
    return `${minutes}m`;
  }
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
}

function formatGpsLocationType(locationType: string): string {
  // Convert snake_case location types to friendly display names
  switch (locationType.toLowerCase()) {
    case 'home':
      return 'Home';
    case 'office':
      return 'Office';
    case 'job':
      return 'Job Site';
    case 'unknown':
      return 'Unknown Location';
    case 'custom':
      return 'Known Location';
    case 'no_gps':
      return 'No GPS Data';
    default:
      // Capitalize first letter and replace underscores with spaces
      return locationType.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  }
}

function EventIcon({ type, isUnnecessary, customCategory }: { type: TimelineEvent['type']; isUnnecessary?: boolean; customCategory?: string }) {
  switch (type) {
    case 'left_home':
    case 'arrived_home':
      return <Home className="w-4 h-4" />;
    case 'left_office':
    case 'arrived_office':
      return <Building className="w-4 h-4" />;
    case 'arrived_job':
      return <MapPin className="w-4 h-4" />;
    case 'left_job':
      return <Car className="w-4 h-4" />;
    case 'arrived_unknown':
    case 'left_unknown':
      return <HelpCircle className="w-4 h-4" />;
    case 'arrived_custom':
    case 'left_custom':
      // Show category icon as text if available
      return <Tag className="w-4 h-4" />;
    case 'clock_in':
    case 'clock_out':
      return <Clock className="w-4 h-4" />;
    case 'meal_start':
    case 'meal_end':
      return <Coffee className="w-4 h-4" />;
    case 'missing_clock_out':
      return <AlertTriangle className="w-4 h-4" />;
    default:
      return <Clock className="w-4 h-4" />;
  }
}

function getEventLabel(event: TimelineEvent): string {
  switch (event.type) {
    case 'left_home':
      return 'Left Home';
    case 'arrived_home':
      return 'Arrived Home';
    case 'left_office':
      return 'Left Office';
    case 'arrived_office':
      return event.isUnnecessary ? 'Arrived at Office' : 'Arrived at Office';
    case 'arrived_job':
      return `Arrived at Job #${event.jobNumber}`;
    case 'left_job':
      return `Left Job #${event.jobNumber}`;
    case 'arrived_unknown':
      return 'Stopped at Unknown Location';
    case 'left_unknown':
      return 'Left Unknown Location';
    case 'arrived_custom':
      return `Stopped at ${event.customLocationName || 'Custom Location'}`;
    case 'left_custom':
      return `Left ${event.customLocationName || 'Custom Location'}`;
    case 'clock_in':
      return 'Clocked In';
    case 'clock_out':
      return 'Clocked Out';
    case 'meal_start':
      return 'Meal Break Started';
    case 'meal_end':
      return 'Meal Break Ended';
    case 'missing_clock_out':
      return 'Missing Clock-Out';
    default:
      return 'Unknown Event';
  }
}

function getEventStyles(event: TimelineEvent): {
  bg: string;
  border: string;
  iconBg: string;
  text: string;
} {
  // Late first job - red
  if (event.type === 'arrived_job' && event.isFirstJob && event.isLate) {
    return {
      bg: 'bg-red-50',
      border: 'border-red-300',
      iconBg: 'bg-red-500',
      text: 'text-red-900',
    };
  }

  // Unnecessary office visit - orange/warning
  if (event.type === 'arrived_office' && event.isUnnecessary) {
    return {
      bg: 'bg-orange-50',
      border: 'border-orange-300',
      iconBg: 'bg-orange-500',
      text: 'text-orange-900',
    };
  }

  // Clock events with violations - red
  if ((event.type === 'clock_in' || event.type === 'clock_out') && event.isViolation && !event.isExcused) {
    return {
      bg: 'bg-red-50',
      border: 'border-red-300',
      iconBg: 'bg-red-500',
      text: 'text-red-900',
    };
  }

  // Clock events that were excused - green
  if ((event.type === 'clock_in' || event.type === 'clock_out') && event.isExcused) {
    return {
      bg: 'bg-green-50',
      border: 'border-green-200',
      iconBg: 'bg-green-500',
      text: 'text-green-900',
    };
  }

  switch (event.type) {
    case 'left_home':
    case 'arrived_home':
      return {
        bg: 'bg-green-50',
        border: 'border-green-200',
        iconBg: 'bg-green-500',
        text: 'text-green-900',
      };
    case 'left_office':
    case 'arrived_office':
      return {
        bg: 'bg-purple-50',
        border: 'border-purple-200',
        iconBg: 'bg-purple-500',
        text: 'text-purple-900',
      };
    case 'arrived_job':
      return {
        bg: 'bg-blue-50',
        border: 'border-blue-200',
        iconBg: 'bg-blue-500',
        text: 'text-blue-900',
      };
    case 'left_job':
      return {
        bg: 'bg-gray-50',
        border: 'border-gray-200',
        iconBg: 'bg-gray-500',
        text: 'text-gray-700',
      };
    case 'arrived_unknown':
    case 'left_unknown':
      return {
        bg: 'bg-yellow-50',
        border: 'border-yellow-300',
        iconBg: 'bg-yellow-500',
        text: 'text-yellow-900',
      };
    case 'arrived_custom':
    case 'left_custom':
      // Use category-specific colors if available
      const categoryColors = getCategoryColors(event.customLocationCategory);
      return {
        bg: categoryColors.bg,
        border: categoryColors.border,
        iconBg: 'bg-teal-500',
        text: categoryColors.text,
      };
    case 'clock_in':
    case 'clock_out':
      return {
        bg: 'bg-cyan-50',
        border: 'border-cyan-200',
        iconBg: 'bg-cyan-500',
        text: 'text-cyan-900',
      };
    case 'meal_start':
    case 'meal_end':
      return {
        bg: 'bg-amber-50',
        border: 'border-amber-200',
        iconBg: 'bg-amber-500',
        text: 'text-amber-900',
      };
    case 'missing_clock_out':
      return {
        bg: 'bg-red-50',
        border: 'border-red-300',
        iconBg: 'bg-red-500',
        text: 'text-red-900',
      };
    default:
      return {
        bg: 'bg-gray-50',
        border: 'border-gray-200',
        iconBg: 'bg-gray-500',
        text: 'text-gray-700',
      };
  }
}

function TimelineEventCard({
  event,
  showTravelTime,
  technicianId,
  date,
  onShowGpsLocation,
  onShowMapLocation,
  onLabelLocation,
  onAssignJob,
  onAnnotatePunch,
  annotationCount,
}: {
  event: TimelineEvent;
  showTravelTime: boolean;
  technicianId: string;
  date: string;
  onShowGpsLocation?: (jobId: string, jobNumber: string) => void;
  onShowMapLocation?: (location: MapLocation) => void;
  onLabelLocation?: (location: LabelLocationData) => void;
  onAssignJob?: (data: AssignJobData) => void;
  onAnnotatePunch?: (data: AnnotatePunchData) => void;
  annotationCount?: number;
}) {
  const styles = getEventStyles(event);
  const time = format(parseISO(event.timestamp), 'h:mm a');

  return (
    <div className="relative">
      {/* Travel time indicator - show elapsed time when there's untracked time */}
      {showTravelTime && (event.travelMinutes !== undefined || event.elapsedMinutes !== undefined) && (event.travelMinutes || 0) > 0 && (
        <div className={`flex items-center gap-2 ml-6 my-2 text-xs ${event.hasUntrackedTime ? 'text-orange-600' : 'text-gray-500'}`}>
          <div className={`w-px h-4 ml-1.5 ${event.hasUntrackedTime ? 'bg-orange-300' : 'bg-gray-300'}`}></div>
          {event.hasUntrackedTime ? (
            <>
              <AlertTriangle className="w-3 h-3 text-orange-500" />
              <span className="font-medium">
                {formatDuration(event.elapsedMinutes || event.travelMinutes || 0)} elapsed
              </span>
              <span className="text-orange-500">(only {formatDuration(event.travelMinutes || 0)} tracked driving)</span>
            </>
          ) : (
            <>
              <Navigation className="w-3 h-3 text-gray-400 rotate-180" />
              <span>{formatDuration(event.travelMinutes || 0)} drive</span>
            </>
          )}
        </div>
      )}

      {/* Event card */}
      <div className={`flex items-start gap-3 ${styles.bg} ${styles.border} border rounded-lg p-3`}>
        {/* Icon */}
        <div className={`${styles.iconBg} text-white p-1.5 rounded-full flex-shrink-0`}>
          <EventIcon type={event.type} isUnnecessary={event.isUnnecessary} />
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className={`font-medium ${styles.text}`}>
                {getEventLabel(event)}
              </span>

              {/* Manual association indicator */}
              {event.isManualAssociation && (
                <span
                  title="Manually associated with this job"
                  className="text-blue-400"
                >
                  <Link2 className="w-3.5 h-3.5" />
                </span>
              )}

              {/* First job badge */}
              {event.isFirstJob && (
                <span className="text-xs px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded">
                  First
                </span>
              )}

              {/* Follow-up badge */}
              {event.isFollowUp && (
                <span className="text-xs px-1.5 py-0.5 bg-gray-200 text-gray-600 rounded italic">
                  Follow-up
                </span>
              )}

              {/* Late badge */}
              {event.isLate && event.varianceMinutes !== undefined && (
                <span className="inline-flex items-center gap-1 text-xs px-1.5 py-0.5 bg-red-100 text-red-700 rounded font-medium">
                  <AlertTriangle className="w-3 h-3" />
                  +{event.varianceMinutes}m LATE
                </span>
              )}

              {/* Unnecessary visit badge */}
              {event.isUnnecessary && (
                <span className="inline-flex items-center gap-1 text-xs px-1.5 py-0.5 bg-orange-100 text-orange-700 rounded font-medium">
                  <AlertTriangle className="w-3 h-3" />
                  UNNECESSARY
                </span>
              )}

              {/* Violation badge for clock events */}
              {(event.type === 'clock_in' || event.type === 'clock_out') && event.isViolation && !event.isExcused && (
                <span className="inline-flex items-center gap-1 text-xs px-1.5 py-0.5 bg-red-100 text-red-700 rounded font-medium">
                  <AlertTriangle className="w-3 h-3" />
                  VIOLATION
                </span>
              )}

              {/* Excused badge for clock events */}
              {(event.type === 'clock_in' || event.type === 'clock_out') && event.isExcused && (
                <span className="inline-flex items-center gap-1 text-xs px-1.5 py-0.5 bg-green-100 text-green-700 rounded font-medium">
                  <Check className="w-3 h-3" />
                  EXCUSED
                </span>
              )}
            </div>

            {/* Time */}
            <span className="text-sm font-mono text-gray-600 flex-shrink-0">
              {time}
            </span>
          </div>

          {/* Customer name */}
          {event.customerName && (
            <div className="text-sm text-gray-600 mt-0.5">
              {event.customerName}
            </div>
          )}

          {/* Address */}
          {event.address && (
            <div className="text-xs text-gray-500 mt-1 truncate">
              {event.address}
            </div>
          )}

          {/* Duration at location (for arrivals) */}
          {event.durationMinutes !== undefined && event.durationMinutes > 0 && (
            <div className="text-xs text-gray-500 mt-1 flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {formatDuration(event.durationMinutes)} at location
            </div>
          )}

          {/* Scheduled time for jobs */}
          {event.scheduledTime && (
            <div className="text-xs text-gray-500 mt-1">
              Scheduled: {format(parseISO(event.scheduledTime), 'h:mm a')}
            </div>
          )}

          {/* Violation reason for clock events */}
          {(event.type === 'clock_in' || event.type === 'clock_out') && event.isViolation && event.violationReason && !event.isExcused && (
            <div className="text-xs text-red-600 mt-1">
              {event.violationReason}
            </div>
          )}

          {/* Excused reason for clock events */}
          {(event.type === 'clock_in' || event.type === 'clock_out') && event.isExcused && event.excusedReason && (
            <div className="text-xs text-green-600 mt-1">
              Excused: {event.excusedReason === 'pickup_helper' ? 'Picking up helper' :
                       event.excusedReason === 'meeting' ? 'Company meeting' :
                       event.excusedReason === 'manager_request' ? 'Manager request' :
                       event.excusedReason}
            </div>
          )}

          {/* GPS location type for clock events - only show if we have meaningful GPS data */}
          {(event.type === 'clock_in' || event.type === 'clock_out') && event.gpsLocationType && event.gpsLocationType !== 'no_gps' && (
            <div className="text-xs text-gray-500 mt-1 flex items-center gap-1">
              <MapPin className="w-3 h-3" />
              GPS Location: {formatGpsLocationType(event.gpsLocationType)}
            </div>
          )}

          {/* Origin (Mobile, Web) for clock events */}
          {(event.type === 'clock_in' || event.type === 'clock_out' || event.type === 'meal_start' || event.type === 'meal_end') && event.origin && (
            <div className="text-xs text-gray-400 mt-1">
              via {event.origin}
            </div>
          )}

          {/* Custom location logo and category icon */}
          {(event.type === 'arrived_custom' || event.type === 'left_custom') && (
            <div className="mt-1 flex items-center gap-2">
              {event.customLocationLogo && (
                <img
                  src={event.customLocationLogo}
                  alt={event.customLocationName}
                  className="w-6 h-6 object-contain"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = 'none';
                  }}
                />
              )}
              {event.customLocationCategory && (
                <span className="text-sm">
                  {getCategoryIcon(event.customLocationCategory)}
                </span>
              )}
            </div>
          )}

          {/* Action buttons */}
          <div className="mt-2 flex items-center gap-2 flex-wrap">
            {/* Map link for all arrival events */}
            {event.latitude && event.longitude && onShowMapLocation && (
              event.type === 'arrived_job' ||
              event.type === 'arrived_unknown' ||
              event.type === 'arrived_office' ||
              event.type === 'arrived_home' ||
              event.type === 'arrived_custom'
            ) && (
              <button
                onClick={() => onShowMapLocation({
                  latitude: event.latitude!,
                  longitude: event.longitude!,
                  label: event.type === 'arrived_job'
                    ? `Job #${event.jobNumber}`
                    : event.type === 'arrived_unknown'
                    ? 'Unknown Stop'
                    : event.type === 'arrived_office'
                    ? 'Office'
                    : event.type === 'arrived_custom'
                    ? event.customLocationName || 'Custom Location'
                    : 'Home',
                  address: event.address,
                })}
                className="inline-flex items-center gap-1 px-2 py-1 text-xs text-blue-600 hover:bg-blue-50 rounded transition-colors border border-blue-200"
              >
                <MapPin className="w-3 h-3" />
                View on Map
              </button>
            )}

            {/* Label This Location button for unknown stops */}
            {event.type === 'arrived_unknown' && event.latitude && event.longitude && onLabelLocation && (
              <button
                onClick={() => onLabelLocation({
                  latitude: event.latitude!,
                  longitude: event.longitude!,
                  address: event.address || 'Unknown Location',
                })}
                className="inline-flex items-center gap-1 px-2 py-1 text-xs text-teal-600 hover:bg-teal-50 rounded transition-colors border border-teal-200"
              >
                <Tag className="w-3 h-3" />
                Label This Location
              </button>
            )}

            {/* Assign Job button for unknown stops */}
            {event.type === 'arrived_unknown' && event.latitude && event.longitude && onAssignJob && (
              <button
                onClick={() => onAssignJob({
                  technicianId,
                  date,
                  latitude: event.latitude!,
                  longitude: event.longitude!,
                  timestamp: event.timestamp,
                  address: event.address || 'Unknown Location',
                })}
                className="inline-flex items-center gap-1 px-2 py-1 text-xs text-blue-600 hover:bg-blue-50 rounded transition-colors border border-blue-200"
              >
                <Briefcase className="w-3 h-3" />
                Assign Job
              </button>
            )}

            {/* Annotate button for punch events */}
            {(event.type === 'clock_in' || event.type === 'clock_out' || event.type === 'meal_start' || event.type === 'meal_end') && event.punchId && onAnnotatePunch && (
              <button
                onClick={() => onAnnotatePunch({
                  punchRecordId: event.punchId!,
                  punchType: event.type === 'clock_in' ? 'ClockIn' : event.type === 'clock_out' ? 'ClockOut' : event.type === 'meal_start' ? 'MealStart' : 'MealEnd',
                  punchTime: event.timestamp,
                  gpsLocationType: event.gpsLocationType,
                  address: event.address,
                  isViolation: event.isViolation,
                  violationReason: event.violationReason,
                })}
                className="inline-flex items-center gap-1 px-2 py-1 text-xs text-yellow-700 hover:bg-yellow-50 rounded transition-colors border border-yellow-300"
              >
                <MessageSquare className="w-3 h-3" />
                Annotate
                {annotationCount && annotationCount > 0 && (
                  <span className="ml-1 px-1.5 py-0.5 bg-yellow-200 text-yellow-800 rounded-full text-xs font-medium">
                    {annotationCount}
                  </span>
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function DayTimelineComponent({
  timeline,
  onShowGpsLocation,
  onShowMapLocation,
  onLabelLocation,
  onAssignJob,
  onAnnotatePunch,
  onAddMissingPunch,
  annotationCounts,
}: DayTimelineProps) {
  const formattedDate = format(parseISO(timeline.date), 'MMMM d, yyyy');

  if (timeline.events.length === 0) {
    return (
      <div className="border rounded-lg overflow-hidden bg-gray-50 mb-3">
        <div className="px-4 py-2 bg-gray-100 border-b flex items-center justify-between">
          <div>
            <span className="font-medium text-gray-900">{formattedDate}</span>
            <span className="text-gray-500 ml-2">({timeline.dayOfWeek})</span>
          </div>
          <span className="text-sm text-gray-500">{timeline.totalJobs} job{timeline.totalJobs !== 1 ? 's' : ''}</span>
        </div>
        <div className="p-4 text-gray-500 text-sm">
          No GPS data available for this day.
        </div>
      </div>
    );
  }

  return (
    <div className="border rounded-lg overflow-hidden bg-white mb-3">
      {/* Header */}
      <div className="px-4 py-3 bg-gray-100 border-b flex items-center justify-between">
        <div>
          <span className="font-medium text-gray-900">{formattedDate}</span>
          <span className="text-gray-500 ml-2">({timeline.dayOfWeek})</span>
        </div>
        <div className="flex items-center gap-4 text-sm">
          <span className="text-gray-500">
            {timeline.totalJobs} job{timeline.totalJobs !== 1 ? 's' : ''}
          </span>
          {timeline.totalOfficeVisits > 0 && (
            <span className="text-purple-600">
              {timeline.totalOfficeVisits} office visit{timeline.totalOfficeVisits !== 1 ? 's' : ''}
            </span>
          )}
          {timeline.totalDriveMinutes > 0 && (
            <span className="text-gray-500">
              {formatDuration(timeline.totalDriveMinutes)} driving
            </span>
          )}
          {onAddMissingPunch && (
            <button
              onClick={() => onAddMissingPunch({
                technicianId: timeline.technicianId,
                technicianName: timeline.technicianName,
                date: timeline.date,
              })}
              className="inline-flex items-center gap-1 px-2 py-1 text-xs text-orange-700 hover:bg-orange-50 rounded transition-colors border border-orange-300"
            >
              <Plus className="w-3 h-3" />
              Add Missing Punch
            </button>
          )}
        </div>
      </div>

      {/* First job status banner */}
      {timeline.firstJobOnTime !== null && (
        <div className={`px-4 py-2 border-b ${
          timeline.firstJobOnTime
            ? 'bg-green-50 text-green-700'
            : 'bg-red-50 text-red-700'
        }`}>
          <div className="flex items-center gap-2 text-sm font-medium">
            {timeline.firstJobOnTime ? (
              <>
                <span className="text-green-500">&#10003;</span>
                First job on time
                {timeline.firstJobVariance !== null && timeline.firstJobVariance < 0 && (
                  <span className="text-green-600">({Math.abs(timeline.firstJobVariance)}m early)</span>
                )}
              </>
            ) : (
              <>
                <AlertTriangle className="w-4 h-4" />
                First job late
                {timeline.firstJobVariance !== null && (
                  <span className="text-red-600">(+{timeline.firstJobVariance}m)</span>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* Timeline events */}
      <div className="p-4 space-y-1">
        {timeline.events.map((event, index) => (
          <TimelineEventCard
            key={event.id}
            event={event}
            showTravelTime={index > 0}
            technicianId={timeline.technicianId}
            date={timeline.date}
            onShowGpsLocation={onShowGpsLocation}
            onShowMapLocation={onShowMapLocation}
            onLabelLocation={onLabelLocation}
            onAssignJob={onAssignJob}
            onAnnotatePunch={onAnnotatePunch}
            annotationCount={event.punchId ? annotationCounts?.[event.punchId] : undefined}
          />
        ))}
      </div>

      {/* Summary footer */}
      {timeline.totalDriveMinutes > 0 && (
        <div className="px-4 py-2 bg-gray-50 border-t text-sm text-gray-600">
          <div className="flex items-center gap-1">
            <Car className="w-4 h-4" />
            Total drive time: {formatDuration(timeline.totalDriveMinutes)}
          </div>
        </div>
      )}
    </div>
  );
}
