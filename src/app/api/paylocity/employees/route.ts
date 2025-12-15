import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getEmployees, getActiveEmployees, type PaylocityEmployee } from '@/lib/paylocity';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

interface TechnicianMatch {
  technician_id: string;
  technician_name: string;
  paylocity_employee_id: string | null;
  suggested_match: PaylocityEmployee | null;
  confidence: number;
  match_reason: string;
}

/**
 * Calculate similarity between two strings using Levenshtein distance
 */
function similarity(s1: string, s2: string): number {
  const longer = s1.length > s2.length ? s1 : s2;
  const shorter = s1.length > s2.length ? s2 : s1;

  if (longer.length === 0) return 1.0;

  const editDistance = levenshteinDistance(longer.toLowerCase(), shorter.toLowerCase());
  return (longer.length - editDistance) / longer.length;
}

function levenshteinDistance(s1: string, s2: string): number {
  const costs: number[] = [];
  for (let i = 0; i <= s1.length; i++) {
    let lastValue = i;
    for (let j = 0; j <= s2.length; j++) {
      if (i === 0) {
        costs[j] = j;
      } else if (j > 0) {
        let newValue = costs[j - 1];
        if (s1.charAt(i - 1) !== s2.charAt(j - 1)) {
          newValue = Math.min(Math.min(newValue, lastValue), costs[j]) + 1;
        }
        costs[j - 1] = lastValue;
        lastValue = newValue;
      }
    }
    if (i > 0) costs[s2.length] = lastValue;
  }
  return costs[s2.length];
}

/**
 * Find the best matching Paylocity employee for a technician
 */
function findBestMatch(
  techName: string,
  paylocityEmployees: PaylocityEmployee[]
): { employee: PaylocityEmployee | null; confidence: number; reason: string } {
  if (!techName || paylocityEmployees.length === 0) {
    return { employee: null, confidence: 0, reason: 'No data' };
  }

  // Parse technician name
  const techNameLower = techName.toLowerCase().trim();
  const techParts = techNameLower.split(/\s+/);
  const techFirstName = techParts[0] || '';
  const techLastName = techParts[techParts.length - 1] || '';
  const isAbbreviatedLast = techLastName.length === 1; // e.g., "Mitch C"

  let bestMatch: PaylocityEmployee | null = null;
  let bestScore = 0;
  let matchReason = '';

  for (const emp of paylocityEmployees) {
    // Get Paylocity employee name parts
    const empLastName = (emp.lastName || '').toLowerCase();
    const empFirstName = (emp.displayName || emp.firstName || '').toLowerCase();
    const empFullName = `${empFirstName} ${empLastName}`.trim();

    // Handle case-insensitive comparison
    const techFirstLower = techFirstName.toLowerCase();
    const empFirstLower = empFirstName.toLowerCase();

    // Score 1: Exact full name match
    if (empFullName === techNameLower) {
      return { employee: emp, confidence: 1.0, reason: 'Exact name match' };
    }

    // Score 2: First name + last name match (case insensitive)
    if (empLastName === techLastName && empFirstLower === techFirstLower) {
      return { employee: emp, confidence: 0.98, reason: 'First and last name match' };
    }

    // Score 3: Handle abbreviated last names (e.g., "Mitch C" → "Mitch Cameron")
    if (isAbbreviatedLast && empFirstLower === techFirstLower && empLastName.startsWith(techLastName)) {
      return { employee: emp, confidence: 0.95, reason: 'First name + last initial match' };
    }

    // Score 4: Handle hyphenated/compound last names
    // e.g., "Tony Rivera" → "Tony LopezRivera", "Christian Gomez" → "Christian Garcia-Gomez"
    const empLastParts = empLastName.split(/[-\s]/);
    const empLastWithoutHyphen = empLastName.replace(/-/g, '').toLowerCase();
    if (empFirstLower === techFirstLower || empFirstLower.includes(techFirstLower)) {
      // Check if techLastName matches any part of empLastName
      if (empLastParts.some(part => part.toLowerCase() === techLastName) ||
          empLastWithoutHyphen.includes(techLastName)) {
        const score = 0.92;
        if (score > bestScore) {
          bestScore = score;
          bestMatch = emp;
          matchReason = 'First name + partial last name match';
        }
      }
    }

    // Score 5: Handle middle names in Paylocity
    // e.g., "Jorge Guerrero" → "Jorge Guerrero Rosales"
    if (empFirstLower === techFirstLower && empLastName.startsWith(techLastName)) {
      const score = 0.90;
      if (score > bestScore) {
        bestScore = score;
        bestMatch = emp;
        matchReason = 'First name + last name prefix match';
      }
    }

    // Score 6: Last name exact + first name similar
    if (empLastName === techLastName) {
      const firstNameSim = similarity(empFirstLower, techFirstLower);
      // First name starts with same letter is a good sign
      const firstInitialMatch = empFirstLower[0] === techFirstLower[0] ? 0.1 : 0;
      if (firstNameSim >= 0.6) {
        const score = 0.80 + (firstNameSim * 0.1) + firstInitialMatch;
        if (score > bestScore) {
          bestScore = score;
          bestMatch = emp;
          matchReason = `Last name exact, first name similar (${Math.round(firstNameSim * 100)}%)`;
        }
      }
    }

    // Score 7: Full name similarity
    const fullNameSim = similarity(empFullName, techNameLower);
    if (fullNameSim > bestScore && fullNameSim >= 0.75) {
      bestScore = fullNameSim;
      bestMatch = emp;
      matchReason = `Name similarity (${Math.round(fullNameSim * 100)}%)`;
    }
  }

  // Lower confidence threshold for "last name only" matches - these are often wrong
  // Don't auto-match on last name alone

  return { employee: bestMatch, confidence: bestScore, reason: matchReason };
}

/**
 * GET - Fetch Paylocity employees with auto-matching suggestions
 */
export async function GET() {
  try {
    // Fetch Paylocity employees
    const allEmployees = await getEmployees();
    const activeEmployees = allEmployees.filter(e => e.statusType === 'A' || e.status === 'Active');

    // Fetch technicians from database
    const { data: technicians, error: techError } = await supabase
      .from('technicians')
      .select('id, name, paylocity_employee_id')
      .order('name');

    if (techError) {
      throw new Error(`Failed to fetch technicians: ${techError.message}`);
    }

    // Generate matching suggestions
    const matches: TechnicianMatch[] = technicians.map(tech => {
      // If already has a Paylocity ID, find that employee
      if (tech.paylocity_employee_id) {
        const existingMatch = allEmployees.find(e => e.id === tech.paylocity_employee_id);
        return {
          technician_id: tech.id,
          technician_name: tech.name,
          paylocity_employee_id: tech.paylocity_employee_id,
          suggested_match: existingMatch || null,
          confidence: existingMatch ? 1.0 : 0,
          match_reason: existingMatch ? 'Already linked' : 'Linked employee not found',
        };
      }

      // Find best match from active employees
      const { employee, confidence, reason } = findBestMatch(tech.name, activeEmployees);

      return {
        technician_id: tech.id,
        technician_name: tech.name,
        paylocity_employee_id: null,
        suggested_match: employee,
        confidence,
        match_reason: reason,
      };
    });

    // Sort by: unlinked first, then by confidence (high to low)
    matches.sort((a, b) => {
      if (a.paylocity_employee_id && !b.paylocity_employee_id) return 1;
      if (!a.paylocity_employee_id && b.paylocity_employee_id) return -1;
      return b.confidence - a.confidence;
    });

    return NextResponse.json({
      success: true,
      paylocity_employees: allEmployees,
      active_employees: activeEmployees,
      technician_matches: matches,
    });
  } catch (error) {
    console.error('Error fetching Paylocity employees:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 });
  }
}

/**
 * POST - Link a technician to a Paylocity employee
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { technician_id, paylocity_employee_id } = body;

    if (!technician_id) {
      return NextResponse.json({
        success: false,
        error: 'technician_id is required',
      }, { status: 400 });
    }

    // Update the technician's Paylocity ID
    const { error } = await supabase
      .from('technicians')
      .update({ paylocity_employee_id: paylocity_employee_id || null })
      .eq('id', technician_id);

    if (error) {
      throw new Error(`Failed to update technician: ${error.message}`);
    }

    return NextResponse.json({
      success: true,
      message: paylocity_employee_id
        ? `Linked technician to Paylocity employee ${paylocity_employee_id}`
        : 'Unlinked technician from Paylocity',
    });
  } catch (error) {
    console.error('Error linking Paylocity employee:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 });
  }
}

/**
 * PUT - Auto-link all technicians based on name matching
 */
export async function PUT() {
  try {
    const allEmployees = await getEmployees();
    const activeEmployees = allEmployees.filter(e => e.statusType === 'A' || e.status === 'Active');

    // Fetch technicians without Paylocity IDs
    const { data: technicians, error: techError } = await supabase
      .from('technicians')
      .select('id, name')
      .is('paylocity_employee_id', null);

    if (techError) {
      throw new Error(`Failed to fetch technicians: ${techError.message}`);
    }

    const results = {
      linked: 0,
      skipped: 0,
      details: [] as { name: string; status: string; employee_id?: string }[],
    };

    for (const tech of technicians) {
      const { employee, confidence, reason } = findBestMatch(tech.name, activeEmployees);

      // Only auto-link if confidence is high enough (80%+)
      if (employee && confidence >= 0.8) {
        const { error } = await supabase
          .from('technicians')
          .update({ paylocity_employee_id: employee.id })
          .eq('id', tech.id);

        if (!error) {
          results.linked++;
          results.details.push({
            name: tech.name,
            status: `Linked (${reason})`,
            employee_id: employee.id,
          });
        }
      } else {
        results.skipped++;
        results.details.push({
          name: tech.name,
          status: `Skipped - ${reason || 'no match found'}`,
        });
      }
    }

    return NextResponse.json({
      success: true,
      ...results,
    });
  } catch (error) {
    console.error('Error auto-linking employees:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 });
  }
}
