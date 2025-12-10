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
} from 'lucide-react';

interface Technician {
  id: string;
  name: string;
  st_technician_id: number;
  verizon_vehicle_id: string | null;
  active: boolean;
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
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Truck Type
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

                    return (
                      <tr
                        key={tech.id}
                        className={`hover:bg-gray-50 ${
                          !tech.verizon_vehicle_id ? 'bg-yellow-50' : ''
                        }`}
                      >
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <User className="w-4 h-4 text-gray-400" />
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
                        <td className="px-4 py-3 text-sm text-gray-500">
                          {truckInfo?.description || '-'}
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
