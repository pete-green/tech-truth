'use client';

import { useState, useEffect, useCallback } from 'react';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { format, parseISO } from 'date-fns';
import {
  Clock,
  RefreshCw,
  LayoutDashboard,
  MapPin,
  Settings,
} from 'lucide-react';

const tabs = [
  { label: 'Dashboard', href: '/', icon: LayoutDashboard },
  { label: 'Stop Details', href: '/stops', icon: MapPin },
  { label: 'Settings', href: '/settings', icon: Settings },
];

interface NavigationProps {
  onSyncComplete?: () => void;
}

export default function Navigation({ onSyncComplete }: NavigationProps) {
  const pathname = usePathname();
  const [syncing, setSyncing] = useState(false);
  const [lastSync, setLastSync] = useState<string | null>(null);

  const fetchLastSync = useCallback(async () => {
    try {
      const response = await fetch('/api/sync-data');
      const data = await response.json();

      if (data.syncLogs && data.syncLogs.length > 0) {
        const latest = data.syncLogs[0];
        if (latest.completed_at) {
          setLastSync(format(parseISO(latest.completed_at), 'MMM d, h:mm a'));
        }
      }
    } catch (err) {
      console.error('Error fetching sync status:', err);
    }
  }, []);

  useEffect(() => {
    fetchLastSync();
  }, [fetchLastSync]);

  const handleSync = async () => {
    setSyncing(true);

    try {
      const today = format(new Date(), 'yyyy-MM-dd');

      // Step 1: Sync GPS data first (populates database with current locations)
      console.log('Syncing GPS data...');
      const gpsResponse = await fetch('/api/sync-gps', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: today }),
      });
      const gpsData = await gpsResponse.json();
      console.log('GPS sync result:', gpsData.summary);

      // Step 2: Sync job/arrival data
      console.log('Syncing job/arrival data...');
      const response = await fetch('/api/sync-data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: today }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);

      // Step 3: Sync punch data
      console.log('Syncing punch data...');
      const punchResponse = await fetch('/api/sync-punches', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: today }),
      });
      const punchData = await punchResponse.json();
      console.log('Punch sync result:', punchData);

      await fetchLastSync();
      onSyncComplete?.();
    } catch (err: any) {
      console.error('Sync error:', err.message);
    } finally {
      setSyncing(false);
    }
  };

  const isActiveTab = (href: string) => {
    if (href === '/') return pathname === '/';
    return pathname.startsWith(href);
  };

  return (
    <header className="bg-white shadow-sm border-b sticky top-0 z-40">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Top row - Logo and sync */}
        <div className="flex items-center justify-between py-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center">
              <Clock className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900">Tech Truth</h1>
              <p className="text-sm text-gray-500">Technician Arrival Tracking</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            {lastSync && (
              <span className="text-sm text-gray-500 hidden sm:inline">Last sync: {lastSync}</span>
            )}
            <button
              onClick={handleSync}
              disabled={syncing}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">{syncing ? 'Syncing...' : 'Sync Data'}</span>
            </button>
          </div>
        </div>

        {/* Tab row */}
        <nav className="flex gap-1 -mb-px">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const active = isActiveTab(tab.href);
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                  active
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                <Icon className="w-4 h-4" />
                {tab.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
