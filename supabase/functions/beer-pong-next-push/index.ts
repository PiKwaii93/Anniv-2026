import '@supabase/functions-js/edge-runtime.d.ts'
import { withSupabase } from '@supabase/server'
import webPush from 'npm:web-push@3.6.7'

import {
  BEER_PONG_NEXT_NOTIFICATION,
  createBeerPongNextPushHandler,
} from './service.ts'

function configuredOrigin() {
  const url = new URL(Deno.env.get('PUSH_APP_ORIGIN') ?? '')
  if (url.protocol !== 'https:') {
    throw new Error('PUSH_APP_ORIGIN must use HTTPS')
  }
  return url.origin
}

export default {
  fetch: withSupabase({ auth: 'user' }, async (request, context) => {
    const userId = context.userClaims?.id
    const origin = configuredOrigin()

    const publicKey = Deno.env.get('VAPID_PUBLIC_KEY') ?? ''
    const privateKey = Deno.env.get('VAPID_PRIVATE_KEY') ?? ''
    const subject = Deno.env.get('VAPID_SUBJECT') ?? ''

    if (!publicKey || !privateKey || !subject) {
      return Response.json(
        { ok: false, error: 'PUSH_NOT_CONFIGURED' },
        { status: 503 },
      )
    }

    webPush.setVapidDetails(subject, publicKey, privateKey)

    const handler = createBeerPongNextPushHandler({
      isAdmin: async () => {
        if (!userId) return false

        const { data, error } = await context.supabaseAdmin
          .from('app_admins')
          .select('user_id')
          .eq('user_id', userId)
          .maybeSingle()

        return !error && Boolean(data)
      },

      recordWinner: async (matchId, winnerTeamId) => {
        const { data, error } = await context.supabaseAdmin.rpc(
          'record_beer_pong_winner',
          {
            p_match_id: matchId,
            p_winner_team_id: winnerTeamId,
          },
        )

        if (error) throw error
        return data
      },

      claimEvent: async eventKey => {
        const { data, error } = await context.supabaseAdmin
          .from('beer_pong_push_events')
          .update({ claimed_at: new Date().toISOString() })
          .eq('event_key', eventKey)
          .is('claimed_at', null)
          .select('event_key, match_id, player_keys')
          .maybeSingle()

        if (error) throw error
        if (!data) return null

        return {
          eventKey: data.event_key,
          matchId: data.match_id,
          playerKeys: data.player_keys,
        }
      },

      listSubscriptions: async playerKeys => {
        const { data, error } = await context.supabaseAdmin
          .from('push_subscriptions')
          .select('endpoint, p256dh, auth')
          .in('player_key', playerKeys)

        if (error) throw error
        return data ?? []
      },

      send: async (subscription, notification, tag) => {
        await webPush.sendNotification(
          {
            endpoint: subscription.endpoint,
            keys: {
              p256dh: subscription.p256dh,
              auth: subscription.auth,
            },
          },
          JSON.stringify({
            web_push: 8030,
            notification: {
              title: notification.title,
              body: notification.body,
              navigate: `${origin}${notification.route}`,
              tag,
            },
            title: notification.title,
            body: notification.body,
            route: notification.route,
            tag,
          }),
        )
      },

      removeExpired: async endpoint => {
        const { error } = await context.supabaseAdmin
          .from('push_subscriptions')
          .delete()
          .eq('endpoint', endpoint)

        if (error) throw error
      },

      completeEvent: async (eventKey, delivery) => {
        const { error } = await context.supabaseAdmin
          .from('beer_pong_push_events')
          .update({
            completed_at: new Date().toISOString(),
            sent_count: delivery.sent,
            expired_count: delivery.expired,
            failed_count: delivery.failed,
          })
          .eq('event_key', eventKey)

        if (error) throw error
      },
    })

    return handler(request)
  }),
}

export { BEER_PONG_NEXT_NOTIFICATION }
