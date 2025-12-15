'use client';

import { format, parseISO } from 'date-fns';
import { Home, Building, MapPin, Car, AlertTriangle, Clock, Navigation } from 'lucide-react';
import { DayTimeline, TimelineEvent } from '@/types/timeline';

interface DayTimelineProps {
  timeline: DayTimeline;
  onShowGpsLocation?: (jobId: string, jobNumber: string) => void;
}

function formatDuration(minutes: number): string {
  if (minutes < 60) {
    return `${minutes}m`;
  }
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
}

function EventIcon({ type, isUnnecessary }: { type: TimelineEvent['type']; isUnnecessary?: boolean }) {
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
  onShowGpsLocation,
}: {
  event: TimelineEvent;
  showTravelTime: boolean;
  onShowGpsLocation?: (jobId: string, jobNumber: string) => void;
}) {
  const styles = getEventStyles(event);
  const time = format(parseISO(event.timestamp), 'h:mm a');

  return (
    <div className="relative">
      {/* Travel time indicator */}
      {showTravelTime && event.travelMinutes && event.travelMinutes > 0 && (
        <div className="flex items-center gap-2 ml-6 my-2 text-xs text-gray-500">
          <div className="w-px h-4 bg-gray-300 ml-1.5"></div>
          <Navigation className="w-3 h-3 text-gray-400 rotate-180" />
          <span>{formatDuration(event.travelMinutes)} drive</span>
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

              {/* First job badge */}
              {event.isFirstJob && (
                <span className="text-xs px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded">
                  First
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

          {/* Map link for first jobs */}
          {event.type === 'arrived_job' && event.isFirstJob && event.jobId && onShowGpsLocation && (
            <button
              onClick={() => onShowGpsLocation(event.jobId!, event.jobNumber!)}
              className="mt-2 inline-flex items-center gap-1 px-2 py-1 text-xs text-blue-600 hover:bg-blue-50 rounded transition-colors border border-blue-200"
            >
              <MapPin className="w-3 h-3" />
              View on Map
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default function DayTimelineComponent({
  timeline,
  onShowGpsLocation,
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
            onShowGpsLocation={onShowGpsLocation}
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
