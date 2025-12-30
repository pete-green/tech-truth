/**
 * Material Checkout API Client
 * Connects to the separate Supabase database for material/inventory checkouts
 */

const MATERIAL_CHECKOUT_URL = 'https://vmjngtmjdrasytgqsvxp.supabase.co';
const MATERIAL_CHECKOUT_ANON_KEY = process.env.MATERIAL_CHECKOUT_ANON_KEY || '';

export interface MaterialCheckoutItem {
  partId: string;
  partNumber: string;
  description: string;
  quantity: number;
}

export interface MaterialCheckout {
  id: string;
  transactionId: string;
  transactionGroup: string;
  timestamp: string; // ISO datetime
  techId: string;
  techName: string;
  truckNumber: string;
  totalItems: number;
  totalQuantity: number;
  poNumber: string | null;
  items: MaterialCheckoutItem[];
}

interface RawTransactionDetail {
  id: string;
  transaction_id: string;
  transaction_group: string;
  timestamp: string;
  tech_id: string;
  tech_name: string;
  truck_number: string;
  total_items: number;
  total_quantity: number;
  po_number: string | null;
  part_id: string | null;
  our_part_number: string | null;
  item_description: string | null;
  item_quantity: number | null;
}

/**
 * Fetch material checkouts for a technician on a specific date
 * Uses the v_transaction_details view which includes item details
 */
export async function getMaterialCheckouts(
  techName: string,
  date: string // YYYY-MM-DD format
): Promise<MaterialCheckout[]> {
  if (!MATERIAL_CHECKOUT_ANON_KEY) {
    console.warn('[Material Checkout] No API key configured');
    return [];
  }

  try {
    // Build date range for the query (full day in UTC)
    const startOfDay = `${date}T00:00:00Z`;
    const endOfDay = `${date}T23:59:59Z`;

    // Query the v_transaction_details view for this tech and date
    const url = new URL(`${MATERIAL_CHECKOUT_URL}/rest/v1/v_transaction_details`);
    url.searchParams.set('tech_name', `eq.${techName}`);
    url.searchParams.set('timestamp', `gte.${startOfDay}`);
    url.searchParams.set('timestamp', `lte.${endOfDay}`);
    url.searchParams.set('order', 'timestamp.asc');
    url.searchParams.set('select', 'id,transaction_id,transaction_group,timestamp,tech_id,tech_name,truck_number,total_items,total_quantity,po_number,part_id,our_part_number,item_description,item_quantity');

    // Supabase doesn't support multiple filters on the same column with searchParams
    // Use the and filter syntax instead
    const filterUrl = `${MATERIAL_CHECKOUT_URL}/rest/v1/v_transaction_details?tech_name=eq.${encodeURIComponent(techName)}&timestamp=gte.${startOfDay}&timestamp=lte.${endOfDay}&order=timestamp.asc&select=id,transaction_id,transaction_group,timestamp,tech_id,tech_name,truck_number,total_items,total_quantity,po_number,part_id,our_part_number,item_description,item_quantity`;

    console.log(`[Material Checkout] Fetching checkouts for ${techName} on ${date}`);

    const response = await fetch(filterUrl, {
      headers: {
        'apikey': MATERIAL_CHECKOUT_ANON_KEY,
        'Authorization': `Bearer ${MATERIAL_CHECKOUT_ANON_KEY}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[Material Checkout] API error: ${response.status} - ${errorText}`);
      return [];
    }

    const rawData: RawTransactionDetail[] = await response.json();

    if (rawData.length === 0) {
      console.log(`[Material Checkout] No checkouts found for ${techName} on ${date}`);
      return [];
    }

    // Group by transaction_group to consolidate items
    const groupedCheckouts = new Map<string, MaterialCheckout>();

    for (const row of rawData) {
      const groupKey = row.transaction_group;

      if (!groupedCheckouts.has(groupKey)) {
        groupedCheckouts.set(groupKey, {
          id: row.id,
          transactionId: row.transaction_id,
          transactionGroup: row.transaction_group,
          timestamp: row.timestamp,
          techId: row.tech_id,
          techName: row.tech_name,
          truckNumber: row.truck_number,
          totalItems: row.total_items,
          totalQuantity: row.total_quantity,
          poNumber: row.po_number,
          items: [],
        });
      }

      // Add item if it has part details
      if (row.part_id && row.our_part_number && row.item_description) {
        const checkout = groupedCheckouts.get(groupKey)!;
        checkout.items.push({
          partId: row.part_id,
          partNumber: row.our_part_number,
          description: row.item_description,
          quantity: row.item_quantity || 1,
        });
      }
    }

    const checkouts = Array.from(groupedCheckouts.values());
    console.log(`[Material Checkout] Found ${checkouts.length} checkout(s) with ${rawData.length} total items`);

    return checkouts;
  } catch (error: any) {
    console.error('[Material Checkout] Error fetching checkouts:', error);
    return [];
  }
}

/**
 * Fetch material checkouts by truck number (alternative matching method)
 */
export async function getMaterialCheckoutsByTruck(
  truckNumber: string,
  date: string
): Promise<MaterialCheckout[]> {
  if (!MATERIAL_CHECKOUT_ANON_KEY) {
    console.warn('[Material Checkout] No API key configured');
    return [];
  }

  try {
    const startOfDay = `${date}T00:00:00Z`;
    const endOfDay = `${date}T23:59:59Z`;

    const filterUrl = `${MATERIAL_CHECKOUT_URL}/rest/v1/v_transaction_details?truck_number=eq.${encodeURIComponent(truckNumber)}&timestamp=gte.${startOfDay}&timestamp=lte.${endOfDay}&order=timestamp.asc&select=id,transaction_id,transaction_group,timestamp,tech_id,tech_name,truck_number,total_items,total_quantity,po_number,part_id,our_part_number,item_description,item_quantity`;

    console.log(`[Material Checkout] Fetching checkouts for truck ${truckNumber} on ${date}`);

    const response = await fetch(filterUrl, {
      headers: {
        'apikey': MATERIAL_CHECKOUT_ANON_KEY,
        'Authorization': `Bearer ${MATERIAL_CHECKOUT_ANON_KEY}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      return [];
    }

    const rawData: RawTransactionDetail[] = await response.json();

    // Group by transaction_group
    const groupedCheckouts = new Map<string, MaterialCheckout>();

    for (const row of rawData) {
      const groupKey = row.transaction_group;

      if (!groupedCheckouts.has(groupKey)) {
        groupedCheckouts.set(groupKey, {
          id: row.id,
          transactionId: row.transaction_id,
          transactionGroup: row.transaction_group,
          timestamp: row.timestamp,
          techId: row.tech_id,
          techName: row.tech_name,
          truckNumber: row.truck_number,
          totalItems: row.total_items,
          totalQuantity: row.total_quantity,
          poNumber: row.po_number,
          items: [],
        });
      }

      if (row.part_id && row.our_part_number && row.item_description) {
        const checkout = groupedCheckouts.get(groupKey)!;
        checkout.items.push({
          partId: row.part_id,
          partNumber: row.our_part_number,
          description: row.item_description,
          quantity: row.item_quantity || 1,
        });
      }
    }

    return Array.from(groupedCheckouts.values());
  } catch (error: any) {
    console.error('[Material Checkout] Error fetching checkouts by truck:', error);
    return [];
  }
}
