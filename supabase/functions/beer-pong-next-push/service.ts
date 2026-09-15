import {
  deliverPushNotifications,
  type StoredPushSubscription,
} from '../_shared/pushDelivery.ts'

export const BEER_PONG_NEXT_NOTIFICATION = Object.freeze({
  title: '🏓 Beer Pong',
  body: 'Ton match est le prochain !',
  route: '/beer-pong',
})

type RecordedWinner = {
  ok: boolean
  code?: string
  state?: unknown
  changed?: boolean
  correction?: boolean
  eventKey?: string | null
}

type ClaimedEvent = {
  eventKey: string
  matchId: string
  playerKeys: string[]
}

type DeliveryResult = {
  sent: number
  expired: number
  failed: number
}

type Dependencies = {
  isAdmin: () => Promise<boolean>
  recordWinner: (matchId: string, winnerTeamId: string) => Promise<RecordedWinner>
  claimEvent: (eventKey: string) => Promise<ClaimedEvent | null>
  listSubscriptions: (playerKeys: string[]) => Promise<StoredPushSubscription[]>
  send: (
    subscription: StoredPushSubscription,
    notification: typeof BEER_PONG_NEXT_NOTIFICATION,
    tag: string,
  ) => Promise<void>
  removeExpired: (endpoint: string) => Promise<void>
  completeEvent: (eventKey: string, delivery: DeliveryResult) => Promise<void>
}

function errorResponse(error: string, status: number) {
  return Response.json({ ok: false, error }, { status })
}

export function createBeerPongNextPushHandler(dependencies: Dependencies) {
  return async (request: Request) => {
    if (request.method !== 'POST') {
      return errorResponse('METHOD_NOT_ALLOWED', 405)
    }

    try {
      if (!await dependencies.isAdmin()) {
        return errorResponse('FORBIDDEN', 403)
      }
    } catch {
      return errorResponse('SERVICE_UNAVAILABLE', 503)
    }

    let body: { matchId?: unknown; winnerTeamId?: unknown }

    try {
      body = await request.json()
    } catch {
      return errorResponse('INVALID_BODY', 400)
    }

    if (
      typeof body.matchId !== 'string' ||
      body.matchId.length === 0 ||
      body.matchId.length > 128 ||
      typeof body.winnerTeamId !== 'string' ||
      body.winnerTeamId.length === 0 ||
      body.winnerTeamId.length > 128
    ) {
      return errorResponse('INVALID_RESULT', 400)
    }

    let result: RecordedWinner

    try {
      result = await dependencies.recordWinner(
        body.matchId,
        body.winnerTeamId,
      )
    } catch {
      return errorResponse('SERVICE_UNAVAILABLE', 503)
    }

    if (!result.ok) {
      const status = result.code === 'CONFLICT' ? 409 : 400
      return errorResponse(result.code ?? 'INVALID_RESULT', status)
    }

    let delivery: DeliveryResult = { sent: 0, expired: 0, failed: 0 }

    if (result.eventKey) {
      try {
        const event = await dependencies.claimEvent(result.eventKey)

        if (event) {
          const subscriptions = event.playerKeys.length > 0
            ? await dependencies.listSubscriptions(event.playerKeys)
            : []

          delivery = await deliverPushNotifications(
            subscriptions,
            subscription => dependencies.send(
              subscription,
              BEER_PONG_NEXT_NOTIFICATION,
              `beer-pong-next-${event.matchId}`,
            ),
            dependencies.removeExpired,
          )

          await dependencies.completeEvent(event.eventKey, delivery)
        }
      } catch {
        // The result is already committed. Do not retry automatically: losing a
        // notification is preferable to delivering the same alert twice.
        delivery.failed += 1
      }
    }

    return Response.json({
      ok: true,
      state: result.state,
      changed: result.changed === true,
      correction: result.correction === true,
      delivery,
    })
  }
}
