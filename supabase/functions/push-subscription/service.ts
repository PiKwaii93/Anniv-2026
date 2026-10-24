type SubscriptionKeys = { p256dh?: unknown; auth?: unknown }
type RequestBody = {
  action?: unknown
  playerKey?: unknown
  sessionToken?: unknown
  subscription?: { endpoint?: unknown; keys?: SubscriptionKeys }
}
type RpcResult = { ok?: boolean; code?: string; revoked?: boolean }
type Dependencies = {
  publicKey: string
  register: (input: { playerKey: string; sessionToken: string; endpoint: string; p256dh: string; auth: string }) => Promise<RpcResult>
  revoke: (input: { playerKey: string; sessionToken: string; endpoint: string }) => Promise<RpcResult>
}

function isText(value: unknown, max: number): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= max
}
function errorResponse(error: string, status: number) {
  return Response.json({ ok: false, error }, { status })
}

export function createPushSubscriptionHandler(dependencies: Dependencies) {
  return async (request: Request) => {
    if (request.method !== 'POST') return errorResponse('METHOD_NOT_ALLOWED', 405)
    let body: RequestBody
    try { body = await request.json() as RequestBody } catch { return errorResponse('INVALID_BODY', 400) }
    if (!isText(body.playerKey, 128) || !isText(body.sessionToken, 128)) return errorResponse('IDENTITY_REQUIRED', 401)

    if (body.action === 'config') {
      if (!dependencies.publicKey) return errorResponse('PUSH_NOT_CONFIGURED', 503)
      return Response.json({ ok: true, publicKey: dependencies.publicKey })
    }

    const endpoint = body.subscription?.endpoint
    if (!isText(endpoint, 4096) || !endpoint.startsWith('https://')) return errorResponse('INVALID_SUBSCRIPTION', 400)
    try {
      if (body.action === 'register') {
        const p256dh = body.subscription?.keys?.p256dh
        const auth = body.subscription?.keys?.auth
        if (!isText(p256dh, 200) || !isText(auth, 200)) return errorResponse('INVALID_SUBSCRIPTION', 400)
        const result = await dependencies.register({ playerKey: body.playerKey, sessionToken: body.sessionToken, endpoint, p256dh, auth })
        if (!result.ok) return errorResponse(result.code ?? 'REGISTRATION_FAILED', result.code === 'INVALID_SESSION' ? 401 : 400)
        return Response.json({ ok: true })
      }
      if (body.action === 'revoke') {
        const result = await dependencies.revoke({ playerKey: body.playerKey, sessionToken: body.sessionToken, endpoint })
        if (!result.ok) return errorResponse(result.code ?? 'REVOCATION_FAILED', result.code === 'INVALID_SESSION' ? 401 : 400)
        return Response.json({ ok: true, revoked: Boolean(result.revoked) })
      }
    } catch (error) {
      console.error('[PushSubscription] operation failed', error instanceof Error ? error.message : 'unknown')
      return errorResponse('SERVICE_UNAVAILABLE', 503)
    }
    return errorResponse('INVALID_ACTION', 400)
  }
}
