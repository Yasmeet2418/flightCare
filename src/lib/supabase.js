import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseKey)
export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    })
  : null

export const roleLabels = {
  admin: 'Administrator',
  staff: 'Staff',
  employee: 'Staff',
  operations_manager: 'Operations Manager',
  customer_service: 'Customer Service',
  passenger: 'Passenger',
}

export function getSupabaseError(error) {
  return error?.message || 'Something went wrong. Please try again.'
}

export async function settleSupabaseQuery(query) {
  try {
    return await query
  } catch (error) {
    return { data: null, count: null, error }
  }
}
