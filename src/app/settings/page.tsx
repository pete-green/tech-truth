'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  Truck,
  User,
  Save,
  RefreshCw,
  CheckCircle,
  AlertTriangle,
  Search,
  X,
  Building,
  Home,
  MapPin,
  Check,
} from 'lucide-react';

interface Technician {
  id: string;
  name: string;
  st_technician_id: number;
  verizon_vehicle_id: string | null;
  active: boolean;
  exclude_from_office_visits: boolean | null;
  takes_truck_home: boolean | null;
  home_latitude: number | null;
  home_longitude: number | null;
  home_address: string | null;
}

interface HomeLocationSuggestion {
  latitude: number;
  longitude: number;
  address: string;
  confidence: 'high' | 'medium' | 'low';
  message: string;
  daysDetected: number;
  totalDaysAnalyzed: number;
}

interface TruckInfo {
  id: string;
  truck_number: string;
  verizon_vehicle_id: string;
  description: string | null;
}

export default function SettingsPage() {
  const [technicians, setTechnicians] = useState<Technician[]>([]);
  const [trucks, setTrucks] = useState<TruckInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterUnassigned, setFilterUnassigned] = useState(false);
  const [detectingHome, setDetectingHome] = useState<string | null>(null);
  const [homeSuggestions, setHomeSuggestions] = useState<Record<string, HomeLocationSuggestion | null>>({});

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [techResponse, trucksResponse] = await Promise.all([
        fetch('/api/technicians?activeOnly=true'),
        fetch('/api/trucks'),
      ]);

      const techData = await techResponse.json();
      const trucksData = await trucksResponse.json();

      if (!techResponse.ok) throw new Error(techData.error);
      if (!trucksResponse.ok) throw new Error(trucksData.error);

      // Filter out system/placeholder technicians
      const realTechs = (techData.technicians || []).filter(
        (t: Technician) =>
          !t.name.toLowerCase().includes('ready to dispatch') &&
          !t.name.toLowerCase().includes('estimates') &&
          !t.name.toLowerCase().includes('dispatch electrical') &&
          !t.name.toLowerCase().includes('dispatch hvac') &&
          !t.name.toLowerCase().includes('dispatch plumbing')
      );

      setTechnicians(realTechs);
      setTrucks(trucksData.trucks || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleTruckAssignment = async (techId: string, truckNumber: string | null) => {
    setSaving(techId);
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch('/api/technicians', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: techId,
          verizon_vehicle_id: truckNumber,
        }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error);

      // Update local state
      setTechnicians((prev) =>
        prev.map((t) =>
          t.id === techId ? { ...t, verizon_vehicle_id: truckNumber } : t
        )
      );

      setSuccess(`Truck assignment updated successfully`);
      setTimeout(() => setSuccess(null), 3000);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(null);
    }
  };

  const handleOfficeEmployeeToggle = async (techId: string, checked: boolean) => {
    setSaving(techId);
    setError(null);

    try {
      const response = await fetch('/api/technicians', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: techId,
          exclude_from_office_visits: checked,
        }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error);

      setTechnicians((prev) =>
        prev.map((t) =>
          t.id === techId ? { ...t, exclude_from_office_visits: checked } : t
        )
      );

      setSuccess('Office employee setting updated');
      setTimeout(() => setSuccess(null), 3000);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(null);
    }
  };

  const handleTakeHomeTruckToggle = async (techId: string, checked: boolean) => {
    setSaving(techId);
    setError(null);

    try {
      const response = await fetch('/api/technicians', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: techId,
          takes_truck_home: checked,
        }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error);

      setTechnicians((prev) =>
        prev.map((t) =>
          t.id === techId ? { ...t, takes_truck_home: checked } : t
        )
      );

      setSuccess('Take home truck setting updated');
      setTimeout(() => setSuccess(null), 3000);

      // Auto-detect home location when enabled
      if (checked) {
        detectHomeLocation(techId);
      } else {
        // Clear home suggestion when disabled
        setHomeSuggestions((prev) => ({ ...prev, [techId]: null }));
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(null);
    }
  };

  const detectHomeLocation = async (techId: string) => {
    setDetectingHome(techId);
    setError(null);

    try {
      const response = await fetch(`/api/technicians/detect-home?technicianId=${techId}`);
      const data = await response.json();

      if (!response.ok) throw new Error(data.error);

      setHomeSuggestions((prev) => ({
        ...prev,
        [techId]: data.suggestion,
      }));

      if (!data.suggestion) {
        setSuccess(data.message || 'Could not detect home location');
        setTimeout(() => setSuccess(null), 5000);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setDetectingHome(null);
    }
  };

  const confirmHomeLocation = async (techId: string, suggestion: HomeLocationSuggestion) => {
    setSaving(techId);
    setError(null);

    try {
      const response = await fetch('/api/technicians', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: techId,
          home_latitude: suggestion.latitude,
          home_longitude: suggestion.longitude,
          home_address: suggestion.address,
        }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error);

      setTechnicians((prev) =>
        prev.map((t) =>
          t.id === techId
            ? {
                ...t,
                home_latitude: suggestion.latitude,
                home_longitude: suggestion.longitude,
                home_address: suggestion.address,
              }
            : t
        )
      );

      // Clear the suggestion since it's now confirmed
      setHomeSuggestions((prev) => ({ ...prev, [techId]: null }));

      setSuccess('Home location confirmed');
      setTimeout(() => setSuccess(null), 3000);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(null);
    }
  };

  // Get truck info by number
  const getTruckInfo = (truckNumber: string | null) => {
    if (!truckNumber) return null;
    return trucks.find((t) => t.truck_number === truckNumber);
  };

  // Get technician assigned to a truck
  const getTechAssignedToTruck = (truckNumber: string) => {
    return technicians.find((t) => t.verizon_vehicle_id === truckNumber);
  };

  // Filter technicians based on search and filters
  const filteredTechnicians = technicians.filter((tech) => {
    const matchesSearch = tech.name.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesFilter = !filterUnassigned || !tech.verizon_vehicle_id;
    return matchesSearch && matchesFilter;
  });

  // Stats
  const assignedCount = technicians.filter((t) => t.verizon_vehicle_id).length;
  const unassignedCount = technicians.filter((t) => !t.verizon_vehicle_id).length;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link
                href="/"
                className="flex items-center gap-2 text-gray-600 hover:text-gray-900"
              >
                <ArrowLeft className="w-5 h-5" />
                Back to Dashboard
              </Link>
              <div className="h-6 w-px bg-gray-300" />
              <h1 className="text-xl font-bold text-gray-900">
                Technician Truck Mapping
              </h1>
            </div>
            <button
              onClick={fetchData}
              disabled={loading}
              className="flex items-center gap-2 px-4 py-2 text-gray-600 hover:text-gray-900"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Alerts */}
        {error && (
          <div className="mb-6 bg-red-50 border border-red-200 rounded-lg p-4 flex items-center justify-between">
            <div className="flex items-center gap-2 text-red-700">
              <AlertTriangle className="w-5 h-5" />
              <span>{error}</span>
            </div>
            <button onClick={() => setError(null)}>
              <X className="w-5 h-5 text-red-500" />
            </button>
          </div>
        )}

        {success && (
          <div className="mb-6 bg-green-50 border border-green-200 rounded-lg p-4 flex items-center gap-2 text-green-700">
            <CheckCircle className="w-5 h-5" />
            <span>{success}</span>
          </div>
        )}

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div className="bg-white rounded-lg shadow-sm p-4 border">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                <User className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900">{technicians.length}</p>
                <p className="text-sm text-gray-500">Total Technicians</p>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-lg shadow-sm p-4 border">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
                <Truck className="w-5 h-5 text-green-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900">{assignedCount}</p>
                <p className="text-sm text-gray-500">Assigned to Trucks</p>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-lg shadow-sm p-4 border">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-yellow-100 rounded-lg flex items-center justify-center">
                <AlertTriangle className="w-5 h-5 text-yellow-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900">{unassignedCount}</p>
                <p className="text-sm text-gray-500">Need Assignment</p>
              </div>
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="bg-white rounded-lg shadow-sm border p-4 mb-6">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2 flex-1 min-w-[200px]">
              <Search className="w-5 h-5 text-gray-400" />
              <input
                type="text"
                placeholder="Search technicians..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="flex-1 border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={filterUnassigned}
                onChange={(e) => setFilterUnassigned(e.target.checked)}
                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <span className="text-sm text-gray-700">Show unassigned only</span>
            </label>
          </div>
        </div>

        {/* Mapping Table */}
        <div className="bg-white rounded-lg shadow-sm border overflow-hidden">
          <div className="px-4 py-3 border-b bg-gray-50">
            <h2 className="font-semibold text-gray-900">
              Assign Trucks to Technicians
            </h2>
            <p className="text-sm text-gray-500 mt-1">
              Select a truck for each technician to enable GPS arrival tracking
            </p>
          </div>

          {loading ? (
            <div className="p-8 text-center">
              <RefreshCw className="w-8 h-8 text-gray-400 animate-spin mx-auto mb-2" />
              <p className="text-gray-500">Loading data...</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Technician
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Assigned Truck
                    </th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">
                      Office Employee
                    </th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">
                      Take Home Truck
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Home Location
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Status
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {filteredTechnicians.map((tech) => {
                    const truckInfo = getTruckInfo(tech.verizon_vehicle_id);
                    const isSaving = saving === tech.id;
                    const isDetecting = detectingHome === tech.id;
                    const homeSuggestion = homeSuggestions[tech.id];
                    const isOfficeEmployee = tech.exclude_from_office_visits === true;
                    const takesTruckHome = tech.takes_truck_home === true;

                    return (
                      <tr
                        key={tech.id}
                        className={`hover:bg-gray-50 ${
                          isOfficeEmployee
                            ? 'bg-blue-50'
                            : !tech.verizon_vehicle_id
                            ? 'bg-yellow-50'
                            : ''
                        }`}
                      >
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            {isOfficeEmployee ? (
                              <Building className="w-4 h-4 text-blue-500" />
                            ) : (
                              <User className="w-4 h-4 text-gray-400" />
                            )}
                            <span className="font-medium text-gray-900">
                              {tech.name}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <select
                              value={tech.verizon_vehicle_id || ''}
                              onChange={(e) =>
                                handleTruckAssignment(
                                  tech.id,
                                  e.target.value || null
                                )
                              }
                              disabled={isSaving}
                              className="border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 min-w-[150px]"
                            >
                              <option value="">-- Select Truck --</option>
                              {trucks.map((truck) => {
                                const assignedTech = getTechAssignedToTruck(
                                  truck.truck_number
                                );
                                const isAssignedToOther =
                                  assignedTech && assignedTech.id !== tech.id;

                                return (
                                  <option
                                    key={truck.id}
                                    value={truck.truck_number}
                                    disabled={isAssignedToOther}
                                  >
                                    {truck.truck_number}
                                    {truck.description ? ` - ${truck.description}` : ''}
                                    {isAssignedToOther
                                      ? ` (${assignedTech.name})`
                                      : ''}
                                  </option>
                                );
                              })}
                            </select>
                            {isSaving && (
                              <RefreshCw className="w-4 h-4 text-blue-500 animate-spin" />
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <input
                            type="checkbox"
                            checked={isOfficeEmployee}
                            onChange={(e) =>
                              handleOfficeEmployeeToggle(tech.id, e.target.checked)
                            }
                            disabled={isSaving}
                            className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 w-4 h-4"
                            title="Office employee - excluded from office visit tracking"
                          />
                        </td>
                        <td className="px-4 py-3 text-center">
                          <input
                            type="checkbox"
                            checked={takesTruckHome}
                            onChange={(e) =>
                              handleTakeHomeTruckToggle(tech.id, e.target.checked)
                            }
                            disabled={isSaving || isOfficeEmployee}
                            className="rounded border-gray-300 text-green-600 focus:ring-green-500 w-4 h-4 disabled:opacity-50"
                            title={
                              isOfficeEmployee
                                ? 'Not applicable for office employees'
                                : 'Tech takes their truck home'
                            }
                          />
                        </td>
                        <td className="px-4 py-3">
                          {isOfficeEmployee ? (
                            <span className="text-sm text-gray-400 italic">
                              N/A (Office Employee)
                            </span>
                          ) : !takesTruckHome ? (
                            <span className="text-sm text-gray-500">
                              Parks at office
                            </span>
                          ) : isDetecting ? (
                            <div className="flex items-center gap-2 text-sm text-blue-600">
                              <RefreshCw className="w-4 h-4 animate-spin" />
                              <span>Detecting...</span>
                            </div>
                          ) : tech.home_address ? (
                            <div className="flex items-center gap-2">
                              <MapPin className="w-4 h-4 text-green-600 flex-shrink-0" />
                              <span className="text-sm text-gray-900 truncate max-w-[200px]" title={tech.home_address}>
                                {tech.home_address}
                              </span>
                              <Check className="w-4 h-4 text-green-600 flex-shrink-0" />
                            </div>
                          ) : homeSuggestion ? (
                            <div className="flex flex-col gap-1">
                              <div className="flex items-center gap-2">
                                <MapPin className="w-4 h-4 text-amber-500 flex-shrink-0" />
                                <span className="text-sm text-gray-700 truncate max-w-[180px]" title={homeSuggestion.address}>
                                  {homeSuggestion.address}
                                </span>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="text-xs text-gray-500">
                                  {homeSuggestion.message}
                                </span>
                                <button
                                  onClick={() => confirmHomeLocation(tech.id, homeSuggestion)}
                                  disabled={isSaving}
                                  className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-green-700 bg-green-100 hover:bg-green-200 rounded transition-colors"
                                >
                                  <Check className="w-3 h-3" />
                                  Confirm
                                </button>
                              </div>
                            </div>
                          ) : (
                            <div className="flex items-center gap-2">
                              <span className="text-sm text-gray-500">
                                Could not detect
                              </span>
                              <button
                                onClick={() => detectHomeLocation(tech.id)}
                                disabled={isSaving || !tech.verizon_vehicle_id}
                                className="text-xs text-blue-600 hover:text-blue-800 underline disabled:opacity-50 disabled:no-underline"
                              >
                                Retry
                              </button>
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          {tech.verizon_vehicle_id ? (
                            <span className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium bg-green-100 text-green-700">
                              <CheckCircle className="w-3 h-3" />
                              Assigned
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium bg-yellow-100 text-yellow-700">
                              <AlertTriangle className="w-3 h-3" />
                              Unassigned
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Available Trucks Reference */}
        <div className="bg-white rounded-lg shadow-sm border overflow-hidden mt-6">
          <div className="px-4 py-3 border-b bg-gray-50">
            <h2 className="font-semibold text-gray-900">Available Trucks</h2>
            <p className="text-sm text-gray-500 mt-1">
              Reference list of all Verizon GPS-tracked vehicles
            </p>
          </div>
          <div className="p-4">
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-2">
              {trucks.map((truck) => {
                const assignedTech = getTechAssignedToTruck(truck.truck_number);
                return (
                  <div
                    key={truck.id}
                    className={`p-2 rounded border text-sm ${
                      assignedTech
                        ? 'bg-green-50 border-green-200'
                        : 'bg-gray-50 border-gray-200'
                    }`}
                  >
                    <div className="flex items-center gap-1">
                      <Truck
                        className={`w-4 h-4 ${
                          assignedTech ? 'text-green-600' : 'text-gray-400'
                        }`}
                      />
                      <span className="font-medium">{truck.truck_number}</span>
                    </div>
                    <p className="text-xs text-gray-500 truncate">
                      {assignedTech ? assignedTech.name : 'Available'}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
