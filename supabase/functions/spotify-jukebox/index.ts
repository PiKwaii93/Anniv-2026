import { createClient } from 'npm:@supabase/supabase-js@2.112.4'
import { createHandler } from './service.ts'

const client = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false, autoRefreshToken: false } })
Deno.serve(createHandler({
  guestRpc: async (identity, op, payload, lease) => {
    const { data, error } = await client.rpc('spotify_guest_bridge', { p_identity: identity, p_op: op, p_payload: payload, p_lease: lease })
    if (error) throw error
    return data
  },
  authenticate: async (jwt) => {
    const { data, error } = await client.auth.getUser(jwt)
    if (error || !data.user) return null
    const { data: admin, error: denied } = await client.from('app_admins').select('user_id').eq('user_id', data.user.id).maybeSingle()
    return !denied && admin ? data.user.id : null
  },
  rpc: async (admin, op, payload, lease) => {
    const { data, error } = await client.rpc('spotify_bridge', { p_admin_id: admin, p_op: op, p_payload: payload, p_lease: lease })
    if (error) throw error
    return data
  },
}))
