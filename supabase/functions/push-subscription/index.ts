import '@supabase/functions-js/edge-runtime.d.ts'
import { withSupabase } from '@supabase/server'
import { createPushSubscriptionHandler } from './service.ts'

export default {
  fetch: withSupabase({ auth: ['publishable', 'user'] }, async (request, context) => {
    const handler = createPushSubscriptionHandler({
      publicKey: Deno.env.get('VAPID_PUBLIC_KEY') ?? '',
      register: async input => {
        const { data, error } = await context.supabaseAdmin.rpc('register_push_subscription', {
          p_player_key: input.playerKey, p_session_token: input.sessionToken,
          p_endpoint: input.endpoint, p_p256dh: input.p256dh, p_auth: input.auth,
        })
        if (error) throw error
        return data
      },
      revoke: async input => {
        const { data, error } = await context.supabaseAdmin.rpc('revoke_push_subscription', {
          p_player_key: input.playerKey, p_session_token: input.sessionToken, p_endpoint: input.endpoint,
        })
        if (error) throw error
        return data
      },
    })
    return handler(request)
  }),
}
