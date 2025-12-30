'use client';

import { format, parseISO } from 'date-fns';
import { toZonedTime } from 'date-fns-tz';

const EST_TIMEZONE = 'America/New_York';
import { Home, Building, MapPin, Car, AlertTriangle, Clock, Navigation, HelpCircle, Tag, Coffee, Check, Briefcase, Link2, MessageSquare, Plus, DollarSign, ChevronDown, ChevronUp, Package, Timer, Truck } from 'lucide-react';
import { useState } from 'react';
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

// Estimate Summary Badge with expandable details
function EstimateSummaryBadge({ event }: { event: TimelineEvent }) {
  const [expanded, setExpanded] = useState(false);
  const summary = event.estimateSummary;
  const estimates = event.estimates;

  if (!summary) return null;

  const formatCurrency = (amount: number | null) => {
    if (amount === null || amount === undefined) return '$0';
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(amount);
  };

  return (
    <div className="mt-2">
      {/* Summary badges */}
      <div className="flex items-center gap-2 flex-wrap">
        {/* Sold/Total badge */}
        <span className={`inline-flex items-center gap-1 text-xs px-2 py-1 rounded font-medium ${
          summary.soldEstimates > 0 ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'
        }`}>
          <DollarSign className="w-3 h-3" />
          {summary.soldEstimates}/{summary.totalEstimates} sold
        </span>

        {/* Revenue */}
        {summary.soldValue > 0 && (
          <span className="text-xs text-green-600 font-medium">
            {formatCurrency(summary.soldValue)} revenue
          </span>
        )}

        {/* Unsold value */}
        {summary.unsoldValue > 0 && (
          <span className="text-xs text-gray-500">
            {formatCurrency(summary.unsoldValue)} unsold
          </span>
        )}

        {/* Time to first estimate */}
        {summary.minutesToFirstEstimate !== null && (
          <span className={`text-xs ${summary.minutesToFirstEstimate < 30 ? 'text-orange-600' : 'text-gray-500'}`}>
            Est in {summary.minutesToFirstEstimate}m
          </span>
        )}
      </div>

      {/* Expand/Collapse button */}
      {estimates && estimates.length > 0 && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="mt-1 inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800"
        >
          {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          {expanded ? 'Hide' : 'Show'} estimate details
        </button>
      )}

      {/* Expanded estimate details */}
      {expanded && estimates && (
        <div className="mt-2 space-y-2 border-t border-gray-200 pt-2">
          {estimates.map((est) => (
            <div
              key={est.id}
              className={`p-2 rounded border text-sm ${
                est.isSold ? 'bg-green-50 border-green-200' : 'bg-gray-50 border-gray-200'
              }`}
            >
              {/* Estimate header */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-gray-900">
                    {est.name || `Estimate #${est.estimateNumber}`}
                  </span>
                  <span className={`text-xs px-1.5 py-0.5 rounded ${
                    est.isSold ? 'bg-green-200 text-green-800' : 'bg-gray-200 text-gray-600'
                  }`}>
                    {est.isSold ? 'SOLD' : est.status}
                  </span>
                </div>
                <span className="font-medium text-gray-900">
                  {formatCurrency(est.total)}
                </span>
              </div>

              {/* Timing info */}
              {est.minutesFromArrival !== null && (
                <div className="text-xs text-gray-500 mt-1">
                  Created {est.minutesFromArrival}m after arrival
                  {est.isSold && est.soldAt && ` • Sold at ${format(toZonedTime(parseISO(est.soldAt), EST_TIMEZONE), 'h:mm a')}`}
                </div>
              )}

              {/* Line items */}
              {est.items && est.items.length > 0 && (
                <div className="mt-2 space-y-1">
                  {est.items.map((item) => (
                    <div
                      key={item.id}
                      className={`flex items-center justify-between text-xs pl-2 border-l-2 ${
                        item.isSold ? 'border-green-400 text-green-700' : 'border-gray-300 text-gray-600'
                      }`}
                    >
                      <div className="flex items-center gap-1">
                        <Package className="w-3 h-3" />
                        <span>{item.quantity}x {item.skuName || item.description || 'Item'}</span>
                        {item.itemType && (
                          <span className="text-gray-400">({item.itemType})</span>
                        )}
                      </div>
                      <span>{formatCurrency(item.totalPrice)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Transit Alert Panel - displayed on the left side of the timeline
function TransitAlertPanel({ analysis, isRed }: { analysis: NonNullable<TimelineEvent['transitAnalysis']>; isRed: boolean }) {
  return (
    <div className={`p-3 rounded-xl border-2 text-sm shadow-md ${
      isRed
        ? 'bg-gradient-to-br from-red-50 to-rose-100 border-red-300'
        : 'bg-gradient-to-br from-amber-50 to-yellow-100 border-amber-300'
    }`}>
      <div className="flex items-center gap-2 mb-2">
        <div className={`p-1.5 rounded-lg ${isRed ? 'bg-red-500' : 'bg-amber-500'}`}>
          <Timer className="w-3.5 h-3.5 text-white" />
        </div>
        <span className={`font-bold text-sm ${isRed ? 'text-red-800' : 'text-amber-800'}`}>
          Transit Alert
        </span>
      </div>
      <div className="space-y-1.5 text-slate-700">
        <div className="flex justify-between items-center">
          <span className="text-xs font-medium text-slate-500">Expected:</span>
          <span className="font-bold text-sm">{formatDuration(analysis.expectedDriveMinutes)}</span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-xs font-medium text-slate-500">Actual:</span>
          <span className="font-bold text-sm">{formatDuration(analysis.onClockTransitMinutes)}</span>
        </div>
        {analysis.mealBreakMinutes > 0 && (
          <div className="flex justify-between items-center text-slate-500 italic">
            <span className="text-xs">Meal break:</span>
            <span className="text-xs">-{formatDuration(analysis.mealBreakMinutes)}</span>
          </div>
        )}
      </div>
      <div className={`mt-2 pt-2 border-t-2 flex justify-between items-center font-bold ${
        isRed ? 'text-red-700 border-red-200' : 'text-amber-700 border-amber-200'
      }`}>
        <span className="text-xs uppercase tracking-wide">Excess:</span>
        <span className={`text-base ${isRed ? 'text-red-600' : 'text-amber-600'}`}>+{formatDuration(analysis.excessMinutes)}</span>
      </div>
      <div className={`mt-1.5 text-xs font-medium ${isRed ? 'text-red-600' : 'text-amber-600'}`}>
        {analysis.distanceMiles} mi direct route
      </div>
    </div>
  );
}

// Identify transit alert spans in the events list
interface TransitAlertSpan {
  fromIndex: number;      // Index of left_job event
  toIndex: number;        // Index of arrived_job event
  analysis: NonNullable<TimelineEvent['transitAnalysis']>;
  isRed: boolean;
}

function findTransitAlertSpans(events: TimelineEvent[]): TransitAlertSpan[] {
  const spans: TransitAlertSpan[] = [];

  for (let i = 0; i < events.length; i++) {
    const event = events[i];
    if (event.type === 'arrived_job' && event.transitAnalysis?.isSuspicious) {
      // Find the corresponding left_job event
      for (let j = i - 1; j >= 0; j--) {
        if (events[j].type === 'left_job' && events[j].jobNumber === event.transitAnalysis.fromJobNumber) {
          spans.push({
            fromIndex: j,
            toIndex: i,
            analysis: event.transitAnalysis,
            isRed: event.transitAnalysis.excessMinutes >= 30,
          });
          break;
        }
      }
    }
  }

  return spans;
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
    case 'overnight_at_office':
      return <Building className="w-4 h-4" />;
    case 'proposed_punch':
      return <Plus className="w-4 h-4" />;
    case 'material_checkout':
      return <Package className="w-4 h-4" />;
    case 'material_delivery':
      return <Truck className="w-4 h-4" />;
    case 'material_pickup':
      return <MapPin className="w-4 h-4" />;
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
    case 'overnight_at_office':
      return 'Vehicle Parked at Office Overnight';
    case 'proposed_punch':
      const punchTypeLabel = event.proposedPunchType === 'ClockIn' ? 'Clock In' :
                             event.proposedPunchType === 'ClockOut' ? 'Clock Out' :
                             event.proposedPunchType === 'MealStart' ? 'Meal Start' :
                             event.proposedPunchType === 'MealEnd' ? 'Meal End' : 'Punch';
      const statusLabel = event.proposedPunchStatus === 'pending' ? 'Pending' :
                          event.proposedPunchStatus === 'submitted' ? 'Submitted' :
                          event.proposedPunchStatus === 'applied' ? 'Applied' :
                          event.proposedPunchStatus === 'rejected' ? 'Rejected' : '';
      return `Proposed ${punchTypeLabel} (${statusLabel})`;
    case 'material_checkout':
      const checkoutItemCount = event.checkoutItems?.length || event.checkoutTotalItems || 0;
      return `Direct Checkout (${checkoutItemCount} items)`;
    case 'material_delivery':
      const deliveryItemCount = event.checkoutItems?.length || event.checkoutTotalItems || 0;
      return `Delivery Request (${deliveryItemCount} items)`;
    case 'material_pickup':
      const pickupItemCount = event.checkoutItems?.length || event.checkoutTotalItems || 0;
      return `Pickup Request (${pickupItemCount} items)`;
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
    case 'overnight_at_office':
      return {
        bg: 'bg-amber-50',
        border: 'border-amber-300',
        iconBg: 'bg-amber-500',
        text: 'text-amber-900',
      };
    case 'proposed_punch':
      // Styling based on status
      if (event.proposedPunchStatus === 'applied') {
        return {
          bg: 'bg-green-50',
          border: 'border-green-300',
          iconBg: 'bg-green-500',
          text: 'text-green-900',
        };
      } else if (event.proposedPunchStatus === 'rejected') {
        return {
          bg: 'bg-red-50',
          border: 'border-red-300',
          iconBg: 'bg-red-500',
          text: 'text-red-900',
        };
      } else {
        // pending or submitted - orange/warning
        return {
          bg: 'bg-orange-50',
          border: 'border-orange-300',
          iconBg: 'bg-orange-500',
          text: 'text-orange-900',
        };
      }
    case 'material_checkout':
      // Direct checkout (warehouse bypass) - amber/warning
      return {
        bg: 'bg-amber-50',
        border: 'border-amber-300',
        iconBg: 'bg-amber-500',
        text: 'text-amber-900',
      };
    case 'material_delivery':
      // Delivery request - green (good practice)
      return {
        bg: 'bg-green-50',
        border: 'border-green-300',
        iconBg: 'bg-green-500',
        text: 'text-green-900',
      };
    case 'material_pickup':
      // Pickup request - blue (used app but had to drive)
      return {
        bg: 'bg-blue-50',
        border: 'border-blue-300',
        iconBg: 'bg-blue-500',
        text: 'text-blue-900',
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
  const time = format(toZonedTime(parseISO(event.timestamp), EST_TIMEZONE), 'h:mm a');

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
      <div className={`flex items-start gap-4 ${styles.bg} border-l-4 ${styles.border} rounded-xl p-4 shadow-sm hover:shadow-md transition-shadow duration-200`}>
        {/* Icon */}
        <div className={`${styles.iconBg} text-white p-2 rounded-xl flex-shrink-0 shadow-sm`}>
          <EventIcon type={event.type} isUnnecessary={event.isUnnecessary} />
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 flex-wrap">
              <span className={`font-semibold ${styles.text}`}>
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
                <span className="text-xs font-semibold px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full">
                  First
                </span>
              )}

              {/* Follow-up badge */}
              {event.isFollowUp && (
                <span className="text-xs font-medium px-2 py-0.5 bg-slate-200 text-slate-600 rounded-full italic">
                  Follow-up
                </span>
              )}

              {/* Late badge */}
              {event.isLate && event.varianceMinutes !== undefined && (
                <span className="inline-flex items-center gap-1 text-xs font-bold px-2 py-0.5 bg-red-100 text-red-700 rounded-full">
                  <AlertTriangle className="w-3 h-3" />
                  +{event.varianceMinutes}m LATE
                </span>
              )}

              {/* Unnecessary visit badge */}
              {event.isUnnecessary && (
                <span className="inline-flex items-center gap-1 text-xs font-bold px-2 py-0.5 bg-orange-100 text-orange-700 rounded-full">
                  <AlertTriangle className="w-3 h-3" />
                  UNNECESSARY
                </span>
              )}

              {/* Violation badge for clock events */}
              {(event.type === 'clock_in' || event.type === 'clock_out') && event.isViolation && !event.isExcused && (
                <span className="inline-flex items-center gap-1 text-xs font-bold px-2 py-0.5 bg-red-100 text-red-700 rounded-full">
                  <AlertTriangle className="w-3 h-3" />
                  VIOLATION
                </span>
              )}

              {/* Excused badge for clock events */}
              {(event.type === 'clock_in' || event.type === 'clock_out') && event.isExcused && (
                <span className="inline-flex items-center gap-1 text-xs font-bold px-2 py-0.5 bg-green-100 text-green-700 rounded-full">
                  <Check className="w-3 h-3" />
                  EXCUSED
                </span>
              )}
            </div>

            {/* Time */}
            <span className="text-sm font-mono font-semibold text-slate-600 flex-shrink-0 bg-slate-100 px-2 py-0.5 rounded-lg">
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
              Scheduled: {format(toZonedTime(parseISO(event.scheduledTime), EST_TIMEZONE), 'h:mm a')}
            </div>
          )}

          {/* Estimate Summary for job arrivals */}
          {event.type === 'arrived_job' && event.estimateSummary && (
            <EstimateSummaryBadge event={event} />
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

          {/* Proposed punch note */}
          {event.type === 'proposed_punch' && event.proposedPunchNote && (
            <div className="text-sm text-gray-600 mt-1 italic">
              &quot;{event.proposedPunchNote}&quot;
            </div>
          )}

          {/* Material checkout/delivery/pickup details */}
          {(event.type === 'material_checkout' || event.type === 'material_delivery' || event.type === 'material_pickup') && (
            <div className="mt-2">
              {/* Badge and delivery address */}
              <div className="flex items-center gap-2 mb-2">
                {event.type === 'material_delivery' && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-green-100 text-green-700 rounded-full text-xs font-bold">
                    <Check className="w-3 h-3" />
                    DELIVERY
                  </span>
                )}
                {event.type === 'material_pickup' && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full text-xs font-bold">
                    <MapPin className="w-3 h-3" />
                    PICKUP
                  </span>
                )}
                {event.type === 'material_checkout' && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full text-xs font-bold">
                    <AlertTriangle className="w-3 h-3" />
                    BYPASS
                  </span>
                )}
                {event.requestStatus && (
                  <span className="text-xs text-gray-500 capitalize">
                    {event.requestStatus}
                  </span>
                )}
              </div>

              {/* Delivery address (for delivery requests) */}
              {event.type === 'material_delivery' && event.deliveryAddress && (
                <div className="text-xs text-gray-600 mb-2 flex items-start gap-1">
                  <MapPin className="w-3 h-3 mt-0.5 flex-shrink-0" />
                  <span>Delivered to: {event.deliveryAddress}</span>
                </div>
              )}

              {/* Tech name, Truck and PO info */}
              <div className="flex items-center flex-wrap gap-3 text-xs text-gray-500">
                {event.checkoutTechName && (
                  <span className="font-medium text-gray-700">By: {event.checkoutTechName}</span>
                )}
                {event.checkoutTruckNumber && (
                  <span>Truck #{event.checkoutTruckNumber}</span>
                )}
                {event.checkoutPoNumber && (
                  <span>PO #{event.checkoutPoNumber}</span>
                )}
                <span>{event.checkoutTotalQuantity || 0} total qty</span>
              </div>

              {/* Item list */}
              {event.checkoutItems && event.checkoutItems.length > 0 && (
                <div className="mt-2 space-y-1 max-h-32 overflow-y-auto">
                  {event.checkoutItems.map((item, idx) => (
                    <div key={idx} className="flex items-start gap-2 text-xs bg-white/50 rounded px-2 py-1">
                      <span className={`font-mono flex-shrink-0 ${
                        event.type === 'material_delivery' ? 'text-green-600' :
                        event.type === 'material_pickup' ? 'text-blue-600' :
                        'text-amber-600'
                      }`}>
                        {item.quantity}x
                      </span>
                      <div className="min-w-0">
                        <span className="font-medium text-gray-700">{item.partNumber}</span>
                        <span className="text-gray-500 ml-1 truncate block">
                          {item.description}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
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
          <div className="mt-3 flex items-center gap-2 flex-wrap">
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
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-blue-600 hover:bg-blue-100 rounded-lg transition-all duration-200 border-2 border-blue-200 hover:border-blue-300"
              >
                <MapPin className="w-3.5 h-3.5" />
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
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-teal-600 hover:bg-teal-100 rounded-lg transition-all duration-200 border-2 border-teal-200 hover:border-teal-300"
              >
                <Tag className="w-3.5 h-3.5" />
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
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-indigo-600 hover:bg-indigo-100 rounded-lg transition-all duration-200 border-2 border-indigo-200 hover:border-indigo-300"
              >
                <Briefcase className="w-3.5 h-3.5" />
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
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-amber-700 hover:bg-amber-100 rounded-lg transition-all duration-200 border-2 border-amber-300 hover:border-amber-400"
              >
                <MessageSquare className="w-3.5 h-3.5" />
                Annotate
                {annotationCount && annotationCount > 0 && (
                  <span className="ml-1 px-1.5 py-0.5 bg-amber-200 text-amber-800 rounded-full text-xs font-bold">
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

// Connector segment types - the bracket spans the entire job-to-job gap
type ConnectorSegment = 'none' | 'start' | 'middle' | 'end';

// SVG Arrow pointing RIGHT - the termination point of the bracket
function BracketArrow({ color }: { color: string }) {
  return (
    <svg
      width="10"
      height="16"
      viewBox="0 0 10 16"
      style={{ display: 'block' }}
    >
      <path
        d="M2 2L8 8L2 14"
        stroke={color}
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  );
}

// Component that renders events with left-side transit alerts
// The bracket SPANS the entire job-to-job gap as ONE visual element
// Intermediate content (meals, stops) is INSIDE the bracket, subordinate to it
function TimelineEventsWithAlerts({
  events,
  technicianId,
  date,
  onShowGpsLocation,
  onShowMapLocation,
  onLabelLocation,
  onAssignJob,
  onAnnotatePunch,
  annotationCounts,
}: {
  events: TimelineEvent[];
  technicianId: string;
  date: string;
  onShowGpsLocation?: (jobId: string, jobNumber: string) => void;
  onShowMapLocation?: (location: MapLocation) => void;
  onLabelLocation?: (location: LabelLocationData) => void;
  onAssignJob?: (data: AssignJobData) => void;
  onAnnotatePunch?: (data: AnnotatePunchData) => void;
  annotationCounts?: Record<string, number>;
}) {
  const alertSpans = findTransitAlertSpans(events);

  // Determine bracket segment type for each row
  const getConnectorInfo = (index: number): {
    segment: ConnectorSegment;
    alert: TransitAlertSpan | null;
  } => {
    for (const span of alertSpans) {
      if (index === span.fromIndex) {
        return { segment: 'start', alert: span };
      }
      if (index === span.toIndex) {
        return { segment: 'end', alert: span };
      }
      if (index > span.fromIndex && index < span.toIndex) {
        return { segment: 'middle', alert: span };
      }
    }
    return { segment: 'none', alert: null };
  };

  // Fixed dimensions - bracket lives in left gutter
  const GUTTER_WIDTH = 160;
  const BRACKET_X = GUTTER_WIDTH - 12; // Fixed x-position for vertical rail
  const BRACKET_WIDTH = 4; // Thick line to dominate visually

  return (
    <div className="p-4">
      {events.map((event, index) => {
        const { segment, alert } = getConnectorInfo(index);
        const isRed = alert?.isRed ?? false;
        const inBracket = segment !== 'none';

        // Bracket colors - bold and prominent
        const bracketColor = isRed ? '#dc2626' : '#d97706'; // red-600 / amber-600
        const bracketColorDark = isRed ? '#991b1b' : '#92400e'; // red-800 / amber-800
        const bgTint = isRed ? 'rgba(254, 202, 202, 0.3)' : 'rgba(254, 243, 199, 0.3)'; // subtle row tint

        return (
          <div
            key={event.id}
            className="flex"
            style={{
              // Tint ALL rows inside the bracket to show they're subordinate
              backgroundColor: inBracket ? bgTint : 'transparent',
              marginLeft: inBracket ? -16 : 0,
              paddingLeft: inBracket ? 16 : 0,
              marginRight: inBracket ? -16 : 0,
              paddingRight: inBracket ? 16 : 0,
            }}
          >
            {/* Left gutter - contains alert panel and bracket */}
            <div
              className="flex-shrink-0 relative"
              style={{ width: GUTTER_WIDTH }}
            >
              {/* Alert panel - at START of bracket */}
              {segment === 'start' && alert && (
                <div style={{ paddingRight: 16, paddingBottom: 4 }}>
                  <TransitAlertPanel analysis={alert.analysis} isRed={isRed} />
                </div>
              )}

              {/* ═══ SPANNING BRACKET ═══ */}
              {/* This bracket OWNS the entire job-to-job gap */}

              {/* BRACKET OPEN: Top of bracket at "Left Job" */}
              {segment === 'start' && (
                <>
                  {/* Horizontal bar connecting to Left Job card */}
                  <div
                    style={{
                      position: 'absolute',
                      right: 0,
                      top: 14,
                      width: GUTTER_WIDTH - BRACKET_X + 4,
                      height: BRACKET_WIDTH,
                      backgroundColor: bracketColor,
                      borderRadius: '2px 0 0 2px',
                    }}
                  />
                  {/* Vertical rail going DOWN - starts at the horizontal bar */}
                  <div
                    style={{
                      position: 'absolute',
                      left: BRACKET_X,
                      top: 14,
                      bottom: 0,
                      width: BRACKET_WIDTH,
                      backgroundColor: bracketColor,
                    }}
                  />
                </>
              )}

              {/* BRACKET MIDDLE: Continuous rail through intermediate content */}
              {segment === 'middle' && (
                <div
                  style={{
                    position: 'absolute',
                    left: BRACKET_X,
                    top: 0,
                    bottom: 0,
                    width: BRACKET_WIDTH,
                    backgroundColor: bracketColor,
                  }}
                />
              )}

              {/* BRACKET CLOSE: Bottom of bracket at "Arrived at Job" */}
              {segment === 'end' && (
                <>
                  {/* Vertical rail coming from above */}
                  <div
                    style={{
                      position: 'absolute',
                      left: BRACKET_X,
                      top: 0,
                      height: 22,
                      width: BRACKET_WIDTH,
                      backgroundColor: bracketColor,
                    }}
                  />
                  {/* Horizontal bar turning toward the Arrived Job card */}
                  <div
                    style={{
                      position: 'absolute',
                      left: BRACKET_X,
                      top: 18,
                      right: 0,
                      height: BRACKET_WIDTH,
                      backgroundColor: bracketColor,
                    }}
                  />
                  {/* Arrow head at the END - points directly at the card */}
                  <div
                    style={{
                      position: 'absolute',
                      right: -6,
                      top: 12,
                    }}
                  >
                    <BracketArrow color={bracketColorDark} />
                  </div>
                </>
              )}
            </div>

            {/* Event card - intermediate content is INSIDE the bracket */}
            <div className="flex-1 min-w-0 pb-1">
              <TimelineEventCard
                event={event}
                showTravelTime={index > 0}
                technicianId={technicianId}
                date={date}
                onShowGpsLocation={onShowGpsLocation}
                onShowMapLocation={onShowMapLocation}
                onLabelLocation={onLabelLocation}
                onAssignJob={onAssignJob}
                onAnnotatePunch={onAnnotatePunch}
                annotationCount={event.punchId ? annotationCounts?.[event.punchId] : undefined}
              />
            </div>
          </div>
        );
      })}
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
      <div className="border-2 border-slate-200 rounded-2xl overflow-hidden bg-gradient-to-b from-slate-50 to-slate-100 mb-4 shadow-sm">
        <div className="px-5 py-3 bg-gradient-to-r from-slate-100 to-slate-50 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-lg font-bold text-slate-800">{formattedDate}</span>
            <span className="text-sm font-medium text-slate-500 bg-slate-200 px-2 py-0.5 rounded-full">{timeline.dayOfWeek}</span>
          </div>
          <span className="text-sm font-medium text-slate-500">{timeline.totalJobs} job{timeline.totalJobs !== 1 ? 's' : ''}</span>
        </div>
        <div className="p-6 text-slate-500 text-sm text-center">
          No GPS data available for this day.
        </div>
      </div>
    );
  }

  return (
    <div className="border-2 border-slate-200 rounded-2xl overflow-hidden bg-white mb-4 shadow-md hover:shadow-lg transition-shadow duration-300">
      {/* Header */}
      <div className="px-5 py-4 bg-gradient-to-r from-slate-100 to-slate-50 border-b border-slate-200 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-lg font-bold text-slate-800">{formattedDate}</span>
          <span className="text-sm font-semibold text-slate-500 bg-slate-200 px-2.5 py-0.5 rounded-full">{timeline.dayOfWeek}</span>
        </div>
        <div className="flex items-center gap-3">
          {/* Job count badge */}
          <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-sm font-semibold">
            <Briefcase className="w-3.5 h-3.5" />
            {timeline.totalJobs} job{timeline.totalJobs !== 1 ? 's' : ''}
          </span>
          {/* Office visits badge */}
          {timeline.totalOfficeVisits > 0 && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-purple-100 text-purple-700 rounded-full text-sm font-semibold">
              <Building className="w-3.5 h-3.5" />
              {timeline.totalOfficeVisits} office
            </span>
          )}
          {/* Drive time badge */}
          {timeline.totalDriveMinutes > 0 && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-slate-200 text-slate-700 rounded-full text-sm font-semibold">
              <Car className="w-3.5 h-3.5" />
              {formatDuration(timeline.totalDriveMinutes)}
            </span>
          )}
          {/* Add Missing Punch button */}
          {onAddMissingPunch && (
            <button
              onClick={() => onAddMissingPunch({
                technicianId: timeline.technicianId,
                technicianName: timeline.technicianName,
                date: timeline.date,
              })}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-orange-700 hover:bg-orange-100 rounded-lg transition-all duration-200 border-2 border-orange-300 hover:border-orange-400"
            >
              <Plus className="w-3.5 h-3.5" />
              Add Missing Punch
            </button>
          )}
        </div>
      </div>

      {/* First job status banner */}
      {timeline.firstJobOnTime !== null && (
        <div className={`px-5 py-3 border-b-2 ${
          timeline.firstJobOnTime
            ? 'bg-gradient-to-r from-green-50 to-emerald-50 border-green-200 text-green-800'
            : 'bg-gradient-to-r from-red-50 to-rose-50 border-red-200 text-red-800'
        }`}>
          <div className="flex items-center gap-2 text-sm font-semibold">
            {timeline.firstJobOnTime ? (
              <>
                <div className="w-5 h-5 bg-green-500 rounded-full flex items-center justify-center">
                  <Check className="w-3 h-3 text-white" />
                </div>
                First job on time
                {timeline.firstJobVariance !== null && timeline.firstJobVariance < 0 && (
                  <span className="text-green-600 font-bold">({Math.abs(timeline.firstJobVariance)}m early)</span>
                )}
              </>
            ) : (
              <>
                <div className="w-5 h-5 bg-red-500 rounded-full flex items-center justify-center">
                  <AlertTriangle className="w-3 h-3 text-white" />
                </div>
                First job late
                {timeline.firstJobVariance !== null && (
                  <span className="text-red-600 font-bold">(+{timeline.firstJobVariance}m)</span>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* Overnight at office warning banner */}
      {timeline.overnightAtOffice && (
        <div className="px-5 py-4 border-b-2 border-amber-200 bg-gradient-to-r from-amber-50 to-yellow-50 text-amber-900">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 bg-amber-500 rounded-xl flex items-center justify-center flex-shrink-0">
              <Building className="w-4 h-4 text-white" />
            </div>
            <div>
              <p className="font-bold text-amber-900">Vehicle parked at office overnight</p>
              <p className="text-sm text-amber-700 mt-0.5">
                This technician normally takes the truck home, but left it at the office. No morning departure from home.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Timeline events with left-side transit alerts */}
      <TimelineEventsWithAlerts
        events={timeline.events}
        technicianId={timeline.technicianId}
        date={timeline.date}
        onShowGpsLocation={onShowGpsLocation}
        onShowMapLocation={onShowMapLocation}
        onLabelLocation={onLabelLocation}
        onAssignJob={onAssignJob}
        onAnnotatePunch={onAnnotatePunch}
        annotationCounts={annotationCounts}
      />

      {/* Summary footer */}
      {timeline.totalDriveMinutes > 0 && (
        <div className="px-5 py-3 bg-gradient-to-r from-slate-50 to-slate-100 border-t-2 border-slate-200">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-600">
            <div className="p-1.5 bg-slate-200 rounded-lg">
              <Car className="w-4 h-4 text-slate-600" />
            </div>
            Total drive time: <span className="text-slate-800">{formatDuration(timeline.totalDriveMinutes)}</span>
          </div>
        </div>
      )}
    </div>
  );
}
