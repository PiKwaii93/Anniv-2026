import { supabase } from '../../lib/supabase'
import type { PartyIdentity } from '../identity/PartyIdentityContext'
import type { PwaContextValue } from '../pwa/PwaState'

export type PushAvailability = 'available' | 'ios-install-required' | 'unsupported'

type PushFunctionResponse = {
  ok?: boolean
  publicKey?: string
  error?: string
}

export function getPushAvailability(pwa: Pick<PwaContextValue, 'installed' | 'platform'>): PushAvailability {
  if (pwa.platform === 'ios' && !pwa.installed) return 'ios-install-required'
  if (
    typeof window === 'undefined'
    || !window.isSecureContext
    || !('Notification' in window)
    || !('serviceWorker' in navigator)
    || !('PushManager' in window)
  ) return 'unsupported'
  return 'available'
}

function decodeVapidKey(value: string) {
  const padded = `${value}${'='.repeat((4 - value.length % 4) % 4)}`
    .replace(/-/g, '+')
    .replace(/_/g, '/')
  const decoded = window.atob(padded)
  const bytes = new Uint8Array(decoded.length)
  for (let index = 0; index < decoded.length; index += 1) bytes[index] = decoded.charCodeAt(index)
  return bytes
}

async function registrationWithTimeout() {
  const existing = await navigator.serviceWorker.getRegistration('/')
  if (existing) return existing
  return Promise.race([
    navigator.serviceWorker.ready,
    new Promise<never>((_, reject) => window.setTimeout(() => reject(new Error('SERVICE_WORKER_UNAVAILABLE')), 5000)),
  ])
}

async function invokePushSubscription(body: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke<PushFunctionResponse>('push-subscription', { body })
  if (error || !data?.ok) throw new Error(data?.error ?? 'PUSH_SERVICE_UNAVAILABLE')
  return data
}

function serializedSubscription(subscription: PushSubscription) {
  const json = subscription.toJSON()
  if (!json.endpoint || !json.keys?.p256dh || !json.keys.auth) throw new Error('INVALID_SUBSCRIPTION')
  return { endpoint: json.endpoint, keys: { p256dh: json.keys.p256dh, auth: json.keys.auth } }
}

async function registerSubscription(identity: PartyIdentity, subscription: PushSubscription) {
  await invokePushSubscription({
    action: 'register',
    playerKey: identity.playerKey,
    sessionToken: identity.sessionToken,
    subscription: serializedSubscription(subscription),
  })
}

export async function readPushState(identity: PartyIdentity) {
  const registration = await registrationWithTimeout()
  const subscription = await registration.pushManager.getSubscription()
  if (Notification.permission === 'granted' && subscription) await registerSubscription(identity, subscription)
  return { permission: Notification.permission, enabled: Boolean(subscription && Notification.permission === 'granted') }
}

export async function enablePushNotifications(identity: PartyIdentity) {
  const permission = Notification.permission === 'default'
    ? await Notification.requestPermission()
    : Notification.permission
  if (permission !== 'granted') return { permission, enabled: false }

  const config = await invokePushSubscription({
    action: 'config', playerKey: identity.playerKey, sessionToken: identity.sessionToken,
  })
  if (!config.publicKey) throw new Error('PUSH_NOT_CONFIGURED')
  const registration = await registrationWithTimeout()
  const existing = await registration.pushManager.getSubscription()
  const subscription = existing ?? await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: decodeVapidKey(config.publicKey),
  })
  await registerSubscription(identity, subscription)
  return { permission, enabled: true }
}

export async function disablePushNotifications(identity: PartyIdentity) {
  const registration = await navigator.serviceWorker.getRegistration('/')
  const subscription = await registration?.pushManager.getSubscription()
  if (!subscription) return
  await invokePushSubscription({
    action: 'revoke',
    playerKey: identity.playerKey,
    sessionToken: identity.sessionToken,
    subscription: { endpoint: subscription.endpoint },
  })
  await subscription.unsubscribe().catch(() => false)
}

export async function unsubscribeLocalPush() {
  try {
    if (!('serviceWorker' in navigator)) return
    const registration = await navigator.serviceWorker.getRegistration('/')
    const subscription = await registration?.pushManager.getSubscription()
    await subscription?.unsubscribe().catch(() => false)
  } catch {
    // The database cascade already removed the server association. A local
    // browser cleanup failure must never trap the guest in a released session.
  }
}
