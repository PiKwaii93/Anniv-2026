import '@supabase/functions-js/edge-runtime.d.ts'
import { withSupabase } from '@supabase/server'
import webPush from 'npm:web-push@3.6.7'
import { createPushTestHandler, deliverPushNotifications, type StoredSubscription } from './service.ts'

function configuredOrigin() {
  const url = new URL(Deno.env.get('PUSH_APP_ORIGIN') ?? '')
  if (url.protocol !== 'https:') throw new Error('PUSH_APP_ORIGIN must use HTTPS')
  return url.origin
}

export default {
  fetch: withSupabase({ auth: 'user' }, async (request, context) => {
    const userId = context.userClaims?.id
    const handler = createPushTestHandler({
      isAdmin: async () => {
        if (!userId) return false
        const { data, error } = await context.supabaseAdmin.from('app_admins').select('user_id').eq('user_id', userId).maybeSingle()
        return !error && Boolean(data)
      },
      listTargets: async () => {
        const { data: subscriptions, error } = await context.supabaseAdmin.from('push_subscriptions').select('player_key')
        if (error) throw error
        const counts = new Map<string, number>()
        for (const row of subscriptions ?? []) counts.set(row.player_key, (counts.get(row.player_key) ?? 0) + 1)
        if (counts.size === 0) return []
        const { data: identities, error: identityError } = await context.supabaseAdmin
          .from('party_identity_sessions').select('player_key, player_name').in('player_key', [...counts.keys()])
        if (identityError) throw identityError
        return (identities ?? []).map(identity => ({
          playerKey: identity.player_key, playerName: identity.player_name, deviceCount: counts.get(identity.player_key) ?? 0,
        })).sort((left, right) => left.playerName.localeCompare(right.playerName, 'fr'))
      },
      sendTest: async (playerKey, notification) => {
        const publicKey = Deno.env.get('VAPID_PUBLIC_KEY') ?? ''
        const privateKey = Deno.env.get('VAPID_PRIVATE_KEY') ?? ''
        const subject = Deno.env.get('VAPID_SUBJECT') ?? ''
        if (!publicKey || !privateKey || !subject) throw new Error('VAPID secrets are missing')
        const origin = configuredOrigin()
        webPush.setVapidDetails(subject, publicKey, privateKey)
        const { data, error } = await context.supabaseAdmin.from('push_subscriptions').select('endpoint, p256dh, auth').eq('player_key', playerKey)
        if (error) throw error
        return deliverPushNotifications(
          (data ?? []) as StoredSubscription[],
          async subscription => {
            await webPush.sendNotification({ endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } }, JSON.stringify({
              web_push: 8030,
              notification: { title: notification.title, body: notification.body, navigate: `${origin}/`, tag: notification.tag },
              title: notification.title, body: notification.body, route: notification.route, tag: notification.tag,
            }))
          },
          async endpoint => {
            const { error: deleteError } = await context.supabaseAdmin.from('push_subscriptions').delete().eq('endpoint', endpoint)
            if (deleteError) throw deleteError
          },
        )
      },
    })
    return handler(request)
  }),
}
