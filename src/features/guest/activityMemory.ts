// A local resume hint, never a mission body or a command that assigns a mission.
export function rememberMission(playerKey: string, active: boolean) {
  try { window.localStorage.setItem(`anniv-2026-mission-resume:${playerKey}`, active ? 'active' : 'done') } catch { /* Optional shortcut. */ }
}
export function hasMissionToResume(playerKey: string) {
  try { return window.localStorage.getItem(`anniv-2026-mission-resume:${playerKey}`) === 'active' } catch { return false }
}
