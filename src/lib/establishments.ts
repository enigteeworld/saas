import { supabase } from './supabase';

/**
 * Guarantees an employer has at least one establishment so staffing requests always
 * have a default site. (The workflow SQL patch also does this in the database.)
 */
export async function ensureDefaultEstablishment(employerId: string) {
  const { data: existing } = await supabase.from('establishments').select('id').eq('employer_id', employerId).limit(1);
  if (existing && existing.length > 0) return false;

  const { data: employer } = await supabase
    .from('employer_profiles')
    .select('business_name, business_address')
    .eq('id', employerId)
    .maybeSingle();
  if (!employer) return false;

  const { error } = await supabase.from('establishments').insert({
    employer_id: employerId,
    name: `${employer.business_name} - Main Office`,
    address: employer.business_address?.trim() || 'Address to be updated',
  });
  return !error;
}
