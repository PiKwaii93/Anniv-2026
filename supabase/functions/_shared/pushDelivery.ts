export type StoredPushSubscription = {
  endpoint: string
  p256dh: string
  auth: string
}

type DeliveryError = {
  statusCode?: unknown
}

export async function deliverPushNotifications(
  subscriptions: StoredPushSubscription[],
  send: (subscription: StoredPushSubscription) => Promise<void>,
  removeExpired: (endpoint: string) => Promise<void>,
) {
  let sent = 0
  let expired = 0
  let failed = 0

  for (const subscription of subscriptions) {
    try {
      await send(subscription)
      sent += 1
    } catch (error) {
      const statusCode = typeof error === 'object' && error && 'statusCode' in error
        ? Number((error as DeliveryError).statusCode)
        : 0

      if (statusCode === 404 || statusCode === 410) {
        await removeExpired(subscription.endpoint)
        expired += 1
      } else {
        failed += 1
        console.error('[Push] delivery failed', { statusCode })
      }
    }
  }

  return { sent, expired, failed }
}
