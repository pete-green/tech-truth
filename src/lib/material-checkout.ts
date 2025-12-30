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

export interface MaterialRequestItem {
  partId: string;
  partNumber: string;
  description: string;
  quantity: number;
}

export interface MaterialRequest {
  id: string;
  requestId: string;
  timestamp: string; // ISO datetime
  techId: string;
  techName: string;
  deliveryMethod: 'delivery' | 'pickup';
  deliveryAddress?: string;
  deliveryLatitude?: number;
  deliveryLongitude?: number;
  status: string;
  totalItems: number;
  totalQuantity: number;
  poNumber: string | null;
  items: MaterialRequestItem[];
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

interface RawMaterialRequest {
  id: string;
  request_id: string;
  created_at: string;
  tech_id: string;
  tech_name: string;
  delivery_method: 'delivery' | 'pickup';
  delivery_address: string | null;
  delivery_latitude: number | null;
  delivery_longitude: number | null;
  status: string;
  po_number: string | null;
}

interface RawMaterialRequestItem {
  id: string;
  request_id: string;
  part_id: string | null;
  our_part_number: string | null;
  description: string | null;
  quantity: number;
}

/**
 * Fetch material requests (delivery/pickup requests via the Field Materials Request app)
 * for a technician on a specific date
 */
export async function getMaterialRequests(
  techName: string,
  date: string // YYYY-MM-DD format
): Promise<MaterialRequest[]> {
  if (!MATERIAL_CHECKOUT_ANON_KEY) {
    console.warn('[Material Request] No API key configured');
    return [];
  }

  try {
    // Build date range for the query (full day in UTC)
    const startOfDay = `${date}T00:00:00Z`;
    const endOfDay = `${date}T23:59:59Z`;

    // Query material_requests table for this tech and date
    const requestUrl = `${MATERIAL_CHECKOUT_URL}/rest/v1/material_requests?tech_name=eq.${encodeURIComponent(techName)}&created_at=gte.${startOfDay}&created_at=lte.${endOfDay}&order=created_at.asc&select=id,request_id,created_at,tech_id,tech_name,delivery_method,delivery_address,delivery_latitude,delivery_longitude,status,po_number`;

    console.log(`[Material Request] Fetching requests for ${techName} on ${date}`);

    const response = await fetch(requestUrl, {
      headers: {
        'apikey': MATERIAL_CHECKOUT_ANON_KEY,
        'Authorization': `Bearer ${MATERIAL_CHECKOUT_ANON_KEY}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[Material Request] API error: ${response.status} - ${errorText}`);
      return [];
    }

    const rawRequests: RawMaterialRequest[] = await response.json();

    if (rawRequests.length === 0) {
      console.log(`[Material Request] No requests found for ${techName} on ${date}`);
      return [];
    }

    // Now fetch items for each request
    const requestIds = rawRequests.map(r => r.id);
    const itemsUrl = `${MATERIAL_CHECKOUT_URL}/rest/v1/material_request_items?request_id=in.(${requestIds.join(',')})&select=id,request_id,part_id,our_part_number,description,quantity`;

    const itemsResponse = await fetch(itemsUrl, {
      headers: {
        'apikey': MATERIAL_CHECKOUT_ANON_KEY,
        'Authorization': `Bearer ${MATERIAL_CHECKOUT_ANON_KEY}`,
        'Content-Type': 'application/json',
      },
    });

    let rawItems: RawMaterialRequestItem[] = [];
    if (itemsResponse.ok) {
      rawItems = await itemsResponse.json();
    }

    // Group items by request_id
    const itemsByRequest = new Map<string, MaterialRequestItem[]>();
    for (const item of rawItems) {
      if (!itemsByRequest.has(item.request_id)) {
        itemsByRequest.set(item.request_id, []);
      }
      if (item.part_id || item.our_part_number || item.description) {
        itemsByRequest.get(item.request_id)!.push({
          partId: item.part_id || '',
          partNumber: item.our_part_number || '',
          description: item.description || '',
          quantity: item.quantity || 1,
        });
      }
    }

    // Build MaterialRequest objects
    const requests: MaterialRequest[] = rawRequests.map(req => {
      const items = itemsByRequest.get(req.id) || [];
      return {
        id: req.id,
        requestId: req.request_id,
        timestamp: req.created_at,
        techId: req.tech_id,
        techName: req.tech_name,
        deliveryMethod: req.delivery_method || 'pickup',
        deliveryAddress: req.delivery_address || undefined,
        deliveryLatitude: req.delivery_latitude || undefined,
        deliveryLongitude: req.delivery_longitude || undefined,
        status: req.status,
        totalItems: items.length,
        totalQuantity: items.reduce((sum, i) => sum + i.quantity, 0),
        poNumber: req.po_number,
        items,
      };
    });

    console.log(`[Material Request] Found ${requests.length} request(s)`);
    return requests;
  } catch (error: any) {
    console.error('[Material Request] Error fetching requests:', error);
    return [];
  }
}

/**
 * Get the set of material_request IDs that have been linked to transactions
 * This helps identify which checkouts were from fulfilled requests vs direct bypass
 */
export async function getLinkedRequestIds(
  transactionIds: string[]
): Promise<Set<string>> {
  if (!MATERIAL_CHECKOUT_ANON_KEY || transactionIds.length === 0) {
    return new Set();
  }

  try {
    // Query transaction_items for source_request_id
    const url = `${MATERIAL_CHECKOUT_URL}/rest/v1/transaction_items?transaction_id=in.(${transactionIds.join(',')})&source_request_id=not.is.null&select=source_request_id`;

    const response = await fetch(url, {
      headers: {
        'apikey': MATERIAL_CHECKOUT_ANON_KEY,
        'Authorization': `Bearer ${MATERIAL_CHECKOUT_ANON_KEY}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      return new Set();
    }

    const data: { source_request_id: string }[] = await response.json();
    return new Set(data.map(d => d.source_request_id));
  } catch (error) {
    console.error('[Material Checkout] Error fetching linked request IDs:', error);
    return new Set();
  }
}
