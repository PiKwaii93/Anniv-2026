import {
  deliverPushNotifications,
  type StoredPushSubscription,
} from '../_shared/pushDelivery.ts'

export { deliverPushNotifications } from '../_shared/pushDelivery.ts'

export const TEST_NOTIFICATION = Object.freeze({
  title: '🎉 Anniv 2026', body: 'Les notifications fonctionnent !', route: '/', tag: 'anniv-2026-push-test',
})
type Target = { playerKey: string; playerName: string; deviceCount: number }
export type StoredSubscription = StoredPushSubscription
type RequestBody = { action?: unknown; playerKey?: unknown }
type Dependencies = {
  isAdmin: () => Promise<boolean>
  listTargets: () => Promise<Target[]>
  sendTest: (playerKey: string, notification: typeof TEST_NOTIFICATION) => Promise<{ sent: number; expired: number; failed: number }>
}
function errorResponse(error: string, status: number) { return Response.json({ ok: false, error }, { status }) }

export function createPushTestHandler(dependencies: Dependencies) {
  return async (request: Request) => {
    if (request.method !== 'POST') return errorResponse('METHOD_NOT_ALLOWED', 405)
    try {
      if (!await dependencies.isAdmin()) return errorResponse('FORBIDDEN', 403)
    } catch {
      return errorResponse('SERVICE_UNAVAILABLE', 503)
    }
    let body: RequestBody
    try { body = await request.json() as RequestBody } catch { return errorResponse('INVALID_BODY', 400) }
    if (body.action === 'list') {
      try {
        return Response.json({ ok: true, targets: await dependencies.listTargets() })
      } catch {
        return errorResponse('SERVICE_UNAVAILABLE', 503)
      }
    }
    if (body.action === 'send-test') {
      if (typeof body.playerKey !== 'string' || body.playerKey.length === 0 || body.playerKey.length > 128) return errorResponse('INVALID_TARGET', 400)
      let result
      try {
        result = await dependencies.sendTest(body.playerKey, TEST_NOTIFICATION)
      } catch {
        return errorResponse('SERVICE_UNAVAILABLE', 503)
      }
      if (result.sent === 0 && result.expired === 0 && result.failed === 0) return errorResponse('NO_SUBSCRIPTION', 404)
      return Response.json({ ok: result.failed === 0, ...result })
    }
    return errorResponse('INVALID_ACTION', 400)
  }
}
