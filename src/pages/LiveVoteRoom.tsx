import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { Link } from 'react-router-dom'

import { useGuests } from '../features/guests/GuestsContext'
import { supabase } from '../lib/supabase'

import './LiveVoteRoom.css'

type VoteMode =
  | 'likely'
  | 'majority'
  | 'predict'
  | 'who_said'

type VoteOption = {
  key: string
  label: string
}

type ResultRow = VoteOption & {
  count: number
  percentage: number
  correct?: boolean
}

type VoteResult = {
  rows: ResultRow[]
  totalVotes: number
  winnerKeys: string[]
  correctKey?: string | null
}

type PublicState = {
  phase: 'idle' | 'open' | 'revealed'
  roundId: string | null
  mode?: VoteMode
  prompt?: string
  stage?: 'single' | 'nomination' | 'final'
  options?: VoteOption[]
  voteCount?: number
  closesAt?: string | null
  result?: VoteResult | null
  revealNote?: string
}

type StoredIdentity = {
  playerKey: string
  sessionToken: string
}

type PlayerState = {
  ok: boolean
  code?: string
  playerKey?: string
  playerName?: string
  score?: number
  myVote?: string | null
}

type ScoreRow = {
  player_key: string
  player_name: string
  score: number
}

type AvailablePlayer = {
  key: string
  name: string
  detail: string
}

const STORAGE_KEY = 'anniv-2026-live-vote-identity-v1'
const MISSION_STORAGE_KEY = 'anniv-2026-secret-mission-identity-v1'

const modeCopy: Record<VoteMode, { label: string; eyebrow: string; instruction: string }> = {
  likely: {
    label: 'Plus susceptible de…',
    eyebrow: '🔥 Nomination',
    instruction: 'Choisis la personne qui correspond le mieux. Les 4 plus nommées iront en finale.',
  },
  majority: {
    label: 'Majority Rules',
    eyebrow: '⚖️ Choix du peuple',
    instruction: 'Réponds pour toi. Le résultat de la salle sera révélé en même temps à tout le monde.',
  },
  predict: {
    label: 'Devine le groupe',
    eyebrow: '🎯 Prédiction',
    instruction: 'Ne réponds pas forcément pour toi : devine ce que la majorité va choisir. +1 si tu as vu juste.',
  },
  who_said: {
    label: 'Qui a répondu ça ?',
    eyebrow: '🕵️ Enquête',
    instruction: 'Trouve la bonne personne parmi les suspects. +1 si tu as raison.',
  },
}

function parseIdentity(value: string | null): StoredIdentity | null {
  if (!value) return null
  try {
    const parsed = JSON.parse(value) as Partial<StoredIdentity>
    if (typeof parsed.playerKey === 'string' && typeof parsed.sessionToken === 'string') {
      return { playerKey: parsed.playerKey, sessionToken: parsed.sessionToken }
    }
  } catch {
    return null
  }
  return null
}

function errorCopy(code?: string) {
  switch (code) {
    case 'IDENTITY_ALREADY_CLAIMED':
      return 'Cette identité est déjà utilisée sur un autre téléphone.'
    case 'DEVICE_ALREADY_LINKED':
      return 'Ce téléphone est déjà lié à une autre personne.'
    case 'PLAYER_NOT_AVAILABLE':
      return 'Cette personne n’est plus dans la liste des participants confirmés.'
    case 'INVALID_SESSION':
      return 'Cette identité doit être réinitialisée par l’admin.'
    case 'ROUND_CHANGED':
      return 'La question a changé. Ton écran vient d’être resynchronisé.'
    case 'ROUND_CLOSED':
      return 'Les votes sont fermés pour cette question.'
    default:
      return 'Impossible de synchroniser La Salle pour le moment.'
  }
}

function LiveVoteRoom() {
  const { guests, loading: guestsLoading } = useGuests()
  const [publicState, setPublicState] = useState<PublicState>({ phase: 'idle', roundId: null })
  const [identity, setIdentity] = useState<StoredIdentity | null>(null)
  const [playerState, setPlayerState] = useState<PlayerState | null>(null)
  const [scores, setScores] = useState<ScoreRow[]>([])
  const [selectedPlayerKey, setSelectedPlayerKey] = useState('')
  const [search, setSearch] = useState('')
  const [nominationSearch, setNominationSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [now, setNow] = useState(Date.now())
  const previousPhaseRef = useRef<PublicState['phase']>('idle')
  const publicStateRef = useRef<PublicState>({ phase: 'idle', roundId: null })
  const identityRef = useRef<StoredIdentity | null>(null)

  const availablePlayers = useMemo<AvailablePlayer[]>(() => {
    const players: AvailablePlayer[] = []
    guests
      .filter((guest) => guest.status === 'confirmed')
      .forEach((guest) => {
        players.push({ key: `guest:${guest.id}`, name: guest.name, detail: 'Invité' })
        guest.plusOnes.forEach((plusOne) => {
          players.push({ key: `plus:${plusOne.id}`, name: plusOne.name, detail: `+1 de ${guest.name}` })
        })
      })
    return players.sort((a, b) => a.name.localeCompare(b.name, 'fr', { sensitivity: 'base' }))
  }, [guests])

  const participantCount = availablePlayers.length

  const loadScores = useCallback(async () => {
    const { data, error: scoreError } = await supabase.rpc('get_live_vote_scoreboard')
    if (scoreError) {
      console.error('Unable to load live vote scoreboard:', scoreError)
      return
    }
    setScores((data ?? []) as ScoreRow[])
  }, [])

  const loadPlayerState = useCallback(async (currentIdentity: StoredIdentity) => {
    const { data, error: stateError } = await supabase.rpc('get_live_vote_player_state', {
      p_player_key: currentIdentity.playerKey,
      p_session_token: currentIdentity.sessionToken,
    })

    if (stateError) {
      console.error('Unable to load player vote state:', stateError)
      setError('Impossible de synchroniser ton vote.')
      return
    }

    const next = data as PlayerState
    if (!next.ok) {
      setError(errorCopy(next.code))
      return
    }
    setPlayerState(next)
  }, [])

  const applyPublicState = useCallback((nextState: PublicState) => {
    const previousState = publicStateRef.current
    const enteredReveal =
      previousState.phase !== 'revealed' && nextState.phase === 'revealed'
    const roundChanged =
      previousState.roundId !== nextState.roundId ||
      previousState.stage !== nextState.stage

    publicStateRef.current = nextState
    setPublicState(nextState)
    setLoading(false)

    if (enteredReveal) {
      navigator.vibrate?.([35, 40, 70])
      void loadScores()
    }

    if ((roundChanged || enteredReveal) && identityRef.current) {
      void loadPlayerState(identityRef.current)
    }

    previousPhaseRef.current = nextState.phase
  }, [loadPlayerState, loadScores])

  const loadPublicState = useCallback(async () => {
    const { data, error: loadError } = await supabase
      .from('live_vote_public_state')
      .select('state')
      .eq('id', 'main')
      .single()

    if (loadError) {
      console.error('Unable to load live vote state:', loadError)
      setError('Impossible de charger la question en cours.')
      setLoading(false)
      return null
    }

    const nextState = (data?.state ?? { phase: 'idle', roundId: null }) as PublicState
    applyPublicState(nextState)
    return nextState
  }, [applyPublicState])

  const claimIdentity = useCallback(async (candidate: StoredIdentity, silent = false) => {
    const { data, error: claimError } = await supabase.rpc('claim_live_vote_identity', {
      p_player_key: candidate.playerKey,
      p_session_token: candidate.sessionToken,
    })

    if (claimError) {
      if (!silent) setError('Impossible d’enregistrer ton identité.')
      return false
    }

    const result = data as PlayerState
    if (!result.ok) {
      if (!silent) setError(errorCopy(result.code))
      return false
    }

    localStorage.setItem(STORAGE_KEY, JSON.stringify(candidate))
    identityRef.current = candidate
    setIdentity(candidate)
    setPlayerState(result)
    setError('')
    return true
  }, [])

  useEffect(() => {
    identityRef.current = identity
  }, [identity])

  useEffect(() => {
    void loadPublicState()
    void loadScores()

    const own = parseIdentity(localStorage.getItem(STORAGE_KEY))
    const missions = parseIdentity(localStorage.getItem(MISSION_STORAGE_KEY))
    const candidate = own ?? missions

    if (candidate) {
      void claimIdentity(candidate, true).then((ok) => {
        if (!ok && own) localStorage.removeItem(STORAGE_KEY)
      })
    }
  }, [claimIdentity, loadPublicState, loadScores])

  useEffect(() => {
    const channel = supabase
      .channel('anniv-2026-live-vote-room')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'live_vote_public_state',
        filter: 'id=eq.main',
      }, (payload) => {
        const row = payload.new as { state?: PublicState } | null
        if (row?.state) {
          applyPublicState(row.state)
          return
        }
        void loadPublicState()
      })
      .subscribe()

    const interval = window.setInterval(() => {
      void loadPublicState()
    }, 15000)

    const handleVisibilityChange = () => {
      if (document.visibilityState !== 'visible') return

      void loadPublicState()
      if (identityRef.current) {
        void loadPlayerState(identityRef.current)
      }
      if (publicStateRef.current.phase === 'revealed') {
        void loadScores()
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      window.clearInterval(interval)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      void supabase.removeChannel(channel)
    }
  }, [applyPublicState, loadPlayerState, loadPublicState, loadScores])

  useEffect(() => {
    if (!publicState.closesAt || publicState.phase !== 'open') return
    const interval = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(interval)
  }, [publicState.closesAt, publicState.phase])

  useEffect(() => {
    if (identity) void loadPlayerState(identity)
  }, [identity, loadPlayerState, publicState.roundId, publicState.stage])

  const secondsLeft = publicState.closesAt
    ? Math.max(0, Math.ceil((new Date(publicState.closesAt).getTime() - now) / 1000))
    : null

  const votingClosed = publicState.phase !== 'open' || secondsLeft === 0

  const identityMatches = useMemo(() => {
    const query = search.trim().toLocaleLowerCase('fr')
    if (!query) return availablePlayers.slice(0, 14)
    return availablePlayers
      .filter((player) => `${player.name} ${player.detail}`.toLocaleLowerCase('fr').includes(query))
      .slice(0, 18)
  }, [availablePlayers, search])

  const nominationMatches = useMemo(() => {
    const query = nominationSearch.trim().toLocaleLowerCase('fr')
    if (!query) return availablePlayers.slice(0, 16)
    return availablePlayers
      .filter((player) => player.name.toLocaleLowerCase('fr').includes(query))
      .slice(0, 20)
  }, [availablePlayers, nominationSearch])

  const handleIdentity = async () => {
    if (!selectedPlayerKey || busy) return
    setBusy(true)
    const token = crypto.randomUUID()
    await claimIdentity({ playerKey: selectedPlayerKey, sessionToken: token })
    setBusy(false)
  }

  const vote = async (choiceKey: string) => {
    if (!identity || !publicState.roundId || busy || votingClosed) return
    setBusy(true)
    setError('')

    const { data, error: voteError } = await supabase.rpc('cast_live_vote', {
      p_player_key: identity.playerKey,
      p_session_token: identity.sessionToken,
      p_round_id: publicState.roundId,
      p_choice_key: choiceKey,
    })

    if (voteError) {
      console.error('Unable to cast live vote:', voteError)
      setError('Ton vote n’a pas pu être enregistré.')
    } else {
      const result = data as {
        ok: boolean
        code?: string
        myVote?: string
        voteCount?: number
      }
      if (!result.ok) {
        setError(errorCopy(result.code))
        if (result.code === 'ROUND_CHANGED' || result.code === 'ROUND_CLOSED') {
          void loadPublicState()
        }
      } else {
        setPlayerState((current) => current ? { ...current, myVote: result.myVote ?? choiceKey } : current)
        if (typeof result.voteCount === 'number') {
          const nextState = {
            ...publicStateRef.current,
            voteCount: result.voteCount,
          }
          publicStateRef.current = nextState
          setPublicState(nextState)
        }
        navigator.vibrate?.(20)
      }
    }

    setBusy(false)
  }

  const mode = publicState.mode ? modeCopy[publicState.mode] : null
  const myVote = playerState?.myVote ?? null
  const resultRows = [...(publicState.result?.rows ?? [])].sort((a, b) => b.count - a.count)
  const topScore = scores[0]?.score ?? 0

  if (loading || guestsLoading) {
    return <main className="live-room live-room--center"><p>Connexion à La Salle…</p></main>
  }

  if (!identity || !playerState?.ok) {
    return (
      <main className="live-room live-room--identity">
        <Link to="/" className="back-link">← Accueil</Link>
        <section className="live-room__identity-card">
          <p className="live-room__eyebrow">La Salle · Live</p>
          <h1>Qui es-tu ?</h1>
          <p>Choisis ton identité une seule fois. Elle restera liée à ce téléphone pour les votes de la soirée.</p>
          <input
            className="live-room__search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Rechercher ton prénom…"
            autoComplete="off"
          />
          <div className="live-room__people-list">
            {identityMatches.map((player) => (
              <button
                key={player.key}
                type="button"
                className={selectedPlayerKey === player.key ? 'live-room__person live-room__person--selected' : 'live-room__person'}
                onClick={() => setSelectedPlayerKey(player.key)}
              >
                <strong>{player.name}</strong>
                <span>{player.detail}</span>
              </button>
            ))}
          </div>
          {error && <p className="live-room__error">{error}</p>}
          <button className="live-room__primary" type="button" disabled={!selectedPlayerKey || busy} onClick={() => void handleIdentity()}>
            {busy ? 'Connexion…' : 'C’est moi'}
          </button>
        </section>
      </main>
    )
  }

  return (
    <main className={`live-room live-room--${publicState.phase}`}>
      <header className="live-room__header">
        <Link to="/" className="back-link">← Accueil</Link>
        <div className="live-room__identity">
          <span>{playerState.playerName}</span>
          <strong>{playerState.score ?? 0} pt</strong>
        </div>
      </header>

      {error && <div className="live-room__error live-room__error--banner">{error}</div>}

      {publicState.phase === 'idle' && (
        <section className="live-room__waiting">
          <span className="live-room__pulse" />
          <p className="live-room__eyebrow">La Salle</p>
          <h1>En attente du prochain round</h1>
          <p>Garde cette page ouverte. La prochaine question apparaîtra automatiquement.</p>
        </section>
      )}

      {publicState.phase === 'open' && mode && (
        <section className="live-room__round">
          <div className="live-room__round-meta">
            <span>{publicState.stage === 'final' ? '🔥 Finale' : mode.eyebrow}</span>
            {secondsLeft !== null && <strong className={secondsLeft <= 5 ? 'live-room__timer live-room__timer--urgent' : 'live-room__timer'}>{secondsLeft}s</strong>}
          </div>

          <h1>{publicState.prompt}</h1>
          <p className="live-room__instruction">
            {publicState.stage === 'final'
              ? 'Les nominations sont terminées. Vote maintenant parmi les 4 finalistes.'
              : mode.instruction}
          </p>

          {publicState.stage === 'nomination' ? (
            <div className="live-room__nomination">
              <input
                className="live-room__search"
                value={nominationSearch}
                onChange={(event) => setNominationSearch(event.target.value)}
                placeholder="Chercher parmi les participants…"
                autoComplete="off"
              />
              <div className="live-room__people-grid">
                {nominationMatches.map((player) => (
                  <button
                    key={player.key}
                    type="button"
                    disabled={busy || votingClosed}
                    className={myVote === player.key ? 'live-room__choice live-room__choice--selected' : 'live-room__choice'}
                    onClick={() => void vote(player.key)}
                  >
                    <strong>{player.name}</strong>
                    {myVote === player.key && <span>✓ Ton vote</span>}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="live-room__choices">
              {(publicState.options ?? []).map((option) => (
                <button
                  key={option.key}
                  type="button"
                  disabled={busy || votingClosed}
                  className={myVote === option.key ? 'live-room__choice live-room__choice--selected' : 'live-room__choice'}
                  onClick={() => void vote(option.key)}
                >
                  <strong>{option.label}</strong>
                  {myVote === option.key && <span>✓ Ton vote</span>}
                </button>
              ))}
            </div>
          )}

          <div className="live-room__vote-status">
            <strong>{publicState.voteCount ?? 0} / {participantCount}</strong>
            <span>votes reçus</span>
          </div>

          {myVote && !votingClosed && (
            <p className="live-room__saved">✓ Vote enregistré · tu peux encore le changer tant que le round est ouvert.</p>
          )}
          {secondsLeft === 0 && <p className="live-room__saved">Votes fermés · attente de la révélation…</p>}
        </section>
      )}

      {publicState.phase === 'revealed' && mode && (
        <section className="live-room__reveal">
          <p className="live-room__eyebrow">Résultat · {mode.label}</p>
          <h1>{publicState.prompt}</h1>

          <div className="live-room__results">
            {resultRows.map((row, index) => {
              const winner = publicState.result?.winnerKeys?.includes(row.key)
              const mine = myVote === row.key
              return (
                <div key={row.key} className={`live-room__result${winner ? ' live-room__result--winner' : ''}${row.correct ? ' live-room__result--correct' : ''}`}>
                  <div className="live-room__result-heading">
                    <span>{index === 0 && winner ? '🥇 ' : ''}{row.label}{row.correct ? ' · réponse' : ''}{mine ? ' · ton choix' : ''}</span>
                    <strong>{row.percentage}%</strong>
                  </div>
                  <div className="live-room__bar"><i style={{ width: `${row.percentage}%` }} /></div>
                  <small>{row.count} vote{row.count !== 1 ? 's' : ''}</small>
                </div>
              )
            })}
          </div>

          {publicState.revealNote && <p className="live-room__reveal-note">{publicState.revealNote}</p>}

          {(publicState.mode === 'predict' || publicState.mode === 'who_said') && myVote && (
            <div className={publicState.result?.winnerKeys?.includes(myVote) ? 'live-room__score-message live-room__score-message--win' : 'live-room__score-message'}>
              {publicState.result?.winnerKeys?.includes(myVote) ? '🎯 Bien vu · +1 point' : 'Pas cette fois. Prochain round.'}
            </div>
          )}
        </section>
      )}

      <details className="live-room__leaderboard"><summary>Voir le classement</summary>
        <div className="live-room__leaderboard-heading">
          <span>Classement La Salle</span>
          <small>Prédictions & enquêtes</small>
        </div>
        {scores.length === 0 ? (
          <p>Aucun point distribué pour le moment.</p>
        ) : (
          scores.slice(0, 8).map((row, index) => (
            <div key={row.player_key} className={row.player_key === identity.playerKey ? 'live-room__score-row live-room__score-row--me' : 'live-room__score-row'}>
              <span>{index + 1}</span>
              <strong>{row.player_name}</strong>
              <b>{row.score}{row.score === topScore && row.score > 0 ? ' ★' : ''}</b>
            </div>
          ))
        )}
      </details>
    </main>
  )
}

export default LiveVoteRoom
