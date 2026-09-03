import { isPartyModuleVisible, type PartySettings, type PartyVisibilityModule } from '../party/PartyContext'
import type { ExtrasSettings } from '../party-extras/model'

export const activities: { key: PartyVisibilityModule; title: string; detail: string; path: string; icon: string }[] = [
  { key: 'room', title: 'La Salle', detail: 'Vote avec tout le monde.', path: '/room', icon: '◉' },
  { key: 'missions', title: 'Missions secrètes', detail: 'Un objectif à accomplir discrètement.', path: '/missions', icon: '◇' },
  { key: 'bingo', title: 'Bingo', detail: 'Observe la soirée et coche les scènes.', path: '/bingo', icon: '▦' },
  { key: 'beer-pong', title: 'Beer Pong', detail: 'Les équipes et les prochains matchs.', path: '/beer-pong', icon: '◌' },
]

export function guestTabs(settings: PartySettings, extras?: ExtrasSettings) {
  return [
    { path: '/', label: 'Accueil', icon: '⌂', visible: true },
    { path: '/play', label: 'Jouer', icon: '◇', visible: activities.some(item => isPartyModuleVisible(settings, item.key)) || !!extras?.duos_visible && settings.phase !== 'ended' },
    { path: '/photos', label: 'Photos', icon: '▧', visible: isPartyModuleVisible(settings, 'photos') },
    { path: '/jukebox', label: 'Musique', icon: '♫', visible: !!extras?.jukebox_visible },
  ].filter(tab => tab.visible)
}

export function activeGuestTab(path: string) {
  if (path === '/play' || path === '/duos' || activities.some(item => item.path === path)) return '/play'
  if (path === '/photos' || path === '/jukebox') return path
  return '/'
}

export function isGuestPath(path: string) {
  return !path.startsWith('/admin') && path !== '/screen' && path !== '/qr'
}
