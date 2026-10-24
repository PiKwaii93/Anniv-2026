import {
  deliverPushNotifications,
  type StoredPushSubscription,
} from '../_shared/pushDelivery.ts'

export const ANNOUNCEMENT_NOTIFICATION = Object.freeze({
  title: '📣 Anniv 2026',
  route: '/',
  suppressWhenVisible: true,
})

type AnnouncementKind = 'info' | 'food' | 'photo' | 'game' | 'urgent'

type PublishedAnnouncement = {
  id: string
  message: string
  kind: AnnouncementKind
  is_active: boolean
  expires_at: string | null
  event_id: string
  updated_at: string
}

type PublishResult = {
  ok: boolean
  code?: string
  eventKey?: string
  announcement?: PublishedAnnouncement
}

type ClaimedEvent = {
  eventKey: string
  announcementEventId: string
}

type DeliveryResult = {
  sent: number
  expired: number
  failed: number
}

type Dependencies = {
  isAdmin: () => Promise<boolean>
  publish: (input: {
    message: string
    kind: AnnouncementKind
    durationSeconds: number | null
    eventId: string
  }) => Promise<PublishResult>
  claimEvent: (eventKey: string) => Promise<ClaimedEvent | null>
  listSubscriptions: () => Promise<StoredPushSubscription[]>
  send: (subscription: StoredPushSubscription, notification: {
    title: string
    body: string
    route: string
    tag: string
    suppressWhenVisible: boolean
  }) => Promise<void>
  removeExpired: (endpoint: string) => Promise<void>
  completeEvent: (eventKey: string, delivery: DeliveryResult) => Promise<void>
}

const kinds = new Set<AnnouncementKind>(['info', 'food', 'photo', 'game', 'urgent'])
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function errorResponse(error: string, status: number) {
  return Response.json({ ok: false, error }, { status })
}

export function createAnnouncementPushHandler(dependencies: Dependencies) {
  return async (request: Request) => {
    if (request.method !== 'POST') return errorResponse('METHOD_NOT_ALLOWED', 405)

    try {
      if (!await dependencies.isAdmin()) return errorResponse('FORBIDDEN', 403)
    } catch {
      return errorResponse('SERVICE_UNAVAILABLE', 503)
    }

    let body: Record<string, unknown>
    try {
      body = await request.json() as Record<string, unknown>
    } catch {
      return errorResponse('INVALID_BODY', 400)
    }

    const message = typeof body.message === 'string' ? body.message.trim() : ''
    const kind = body.kind
    const durationSeconds = body.durationSeconds
    const eventId = body.eventId

    if (!message || message.length > 240) return errorResponse('INVALID_MESSAGE', 400)
    if (typeof kind !== 'string' || !kinds.has(kind as AnnouncementKind)) {
      return errorResponse('INVALID_KIND', 400)
    }
    if (
      durationSeconds !== null
      && (!Number.isInteger(durationSeconds) || Number(durationSeconds) < 5 || Number(durationSeconds) > 3600)
    ) {
      return errorResponse('INVALID_DURATION', 400)
    }
    if (typeof eventId !== 'string' || !uuidPattern.test(eventId)) {
      return errorResponse('INVALID_EVENT', 400)
    }

    let result: PublishResult
    try {
      result = await dependencies.publish({
        message,
        kind: kind as AnnouncementKind,
        durationSeconds: durationSeconds === null ? null : Number(durationSeconds),
        eventId,
      })
    } catch {
      return errorResponse('SERVICE_UNAVAILABLE', 503)
    }

    if (!result.ok || !result.announcement || !result.eventKey) {
      return errorResponse(result.code ?? 'ANNOUNCEMENT_REJECTED', 400)
    }

    let delivery: DeliveryResult = { sent: 0, expired: 0, failed: 0 }

    try {
      const event = await dependencies.claimEvent(result.eventKey)
      if (event) {
        const subscriptions = await dependencies.listSubscriptions()
        const notification = {
          ...ANNOUNCEMENT_NOTIFICATION,
          body: result.announcement.message,
          tag: `announcement-${event.announcementEventId}`,
        }

        delivery = await deliverPushNotifications(
          subscriptions,
          subscription => dependencies.send(subscription, notification),
          dependencies.removeExpired,
        )
        await dependencies.completeEvent(event.eventKey, delivery)
      }
    } catch {
      // The announcement is already published. Avoid an automatic retry that
      // could notify the same devices twice.
      delivery.failed += 1
    }

    return Response.json({
      ok: true,
      announcement: result.announcement,
      delivery,
    })
  }
}
