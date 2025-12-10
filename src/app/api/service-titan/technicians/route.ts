import { NextRequest, NextResponse } from 'next/server';
import { getTechnicians, getTechnician } from '@/lib/service-titan';
import { createServerClient } from '@/lib/supabase';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const technicianId = searchParams.get('id');
    const syncToDb = searchParams.get('sync') === 'true';

    if (technicianId) {
      // Get single technician
      const technician = await getTechnician(parseInt(technicianId));
      return NextResponse.json({ success: true, technician });
    }

    // Get all technicians
    const result = await getTechnicians({ active: true, pageSize: 500 });
    const technicians = result.data || [];

    // Optionally sync to database
    if (syncToDb && technicians.length > 0) {
      const supabase = createServerClient();

      for (const tech of technicians) {
        const { error } = await supabase
          .from('technicians')
          .upsert({
            st_technician_id: tech.id,
            name: tech.name || `${tech.firstName || ''} ${tech.lastName || ''}`.trim(),
            email: tech.email || null,
            phone: tech.phone || tech.phoneNumber || null,
            active: tech.active !== false,
            updated_at: new Date().toISOString(),
          }, {
            onConflict: 'st_technician_id',
          });

        if (error) {
          console.error(`Error upserting technician ${tech.id}:`, error);
        }
      }
    }

    return NextResponse.json({
      success: true,
      technicians,
      count: technicians.length,
      synced: syncToDb,
    });
  } catch (error: any) {
    console.error('Service Titan Technicians API error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch technicians' },
      { status: 500 }
    );
  }
}
