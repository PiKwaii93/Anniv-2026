import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react'
import { Link } from 'react-router-dom'

import { useAuth } from '../features/auth/AuthContext'
import { useGuests } from '../features/guests/GuestsContext'
import HomeIdentityOnboarding from '../features/identity/HomeIdentityOnboarding'
import { usePartyIdentity } from '../features/identity/PartyIdentityContext'
import {
  isPartyModuleVisible,
  type PartyPhase,
  type PartyVisibilityModule,
  useParty,
} from '../features/party/PartyContext'
import { supabase } from '../lib/supabase'

import './HomeDynamic.css'

type BeerPongState = {
  selectedPlayerIds?: string[]
  teams?: unknown[]
  draftValidated?: boolean
  championTeamId?: string | null
}

type BeerPongRow = {
  state: BeerPongState | null
}

type MissionScoreRow = {
  completed_count: number
}

type RoomState = {
  phase?: 'idle' | 'open' | 'revealed'
  voteCount?: number
  prompt?: string
  stage?: string
}

type RoomStateRow = {
  state: RoomState | null
}

type HomeStats = {
  iceberg: number
  bingo: number
  beerPong: BeerPongState
  missionPlayers: number
  missionCompleted: number
  room: RoomState
  photos: number
}

type PublicModuleDefinition = {
  key: PartyVisibilityModule
  title: string
  subtitle: string
  tag: string
  path: string
  className: string
}

type PersonalAction = {
  key: string
  eyebrow: string
  title: string
  detail: string
  path: string
}

const publicModules: PublicModuleDefinition[] = [
  {
    key: 'iceberg',
    title: 'Iceberg',
    subtitle: 'Secrets, dossiers & anecdotes',
    tag: 'À explorer',
    path: '/iceberg',
    className: 'module-card--iceberg',
  },
  {
    key: 'beer-pong',
    title: 'Beer Pong',
    subtitle: 'Draft, équipes & tournoi',
    tag: 'Compétition',
    path: '/beer-pong',
    className: 'module-card--beer-pong',
  },
  {
    key: 'bingo',
    title: 'Bingo',
    subtitle: 'Observe la soirée & coche les scènes',
    tag: 'Jeu perso',
    path: '/bingo',
    className: 'module-card--bingo',
  },
  {
    key: 'missions',
    title: 'Missions secrètes',
    subtitle: 'Infiltre la soirée sans te faire griller',
    tag: 'Infiltration',
    path: '/missions',
    className: 'module-card--missions',
  },
  {
    key: 'room',
    title: 'La Salle',
    subtitle: 'Votes, prédictions & révélations en direct',
    tag: 'Live collectif',
    path: '/room',
    className: 'module-card--room',
  },
  {
    key: 'photos',
    title: 'Photo Hunt',
    subtitle: 'Défis photo & mur de souvenirs',
    tag: 'Chasse photo',
    path: '/photos',
    className: 'module-card--photos',
  },
  {
    key: 'guests',
    title: 'Invités',
    subtitle: 'Les participants de la soirée',
    tag: 'Guest list',
    path: '/guests',
    className: 'module-card--guests',
  },
]

const phaseCopy: Record<PartyPhase, { label: string; detail: string }> = {
  preparation: {
    label: 'Préparation',
    detail: 'Tout se met en place. Certains modules peuvent encore être masqués.',
  },
  live: {
    label: 'Soirée en cours',
    detail: 'La soirée est lancée. Les modules évoluent en direct.',
  },
  ended: {
    label: 'Soirée terminée',
    detail: 'Merci d’être passé. Le Hall of Fame et les souvenirs restent accessibles ici.',
  },
}

const emptyStats: HomeStats = {
  iceberg: 0,
  bingo: 0,
  beerPong: {},
  missionPlayers: 0,
  missionCompleted: 0,
  room: { phase: 'idle', voteCount: 0 },
  photos: 0,
}

function Home() {
  const { isAdmin } = useAuth()
  const { identity } = usePartyIdentity()
  const { guests } = useGuests()
  const { settings, loading: partyLoading } = useParty()
  const [stats, setStats] = useState<HomeStats>(emptyStats)
  const [statsLoading, setStatsLoading] = useState(true)

  const loadStats = useCallback(async () => {
    const [
      icebergResult,
      bingoResult,
      beerPongResult,
      missionScoreResult,
      roomResult,
      photoResult,
    ] = await Promise.all([
      supabase.from('iceberg_entries').select('id', { count: 'exact', head: true }).eq('is_published', true),
      supabase.from('bingo_prompts').select('id', { count: 'exact', head: true }).eq('is_active', true),
      supabase.from('beer_pong_state').select('state').eq('id', 'main').maybeSingle(),
      supabase.from('secret_mission_scoreboard').select('completed_count'),
      supabase.from('live_vote_public_state').select('state').eq('id', 'main').maybeSingle(),
      supabase.from('photo_hunt_submissions').select('id', { count: 'exact', head: true }).eq('status', 'approved'),
    ])

    if (icebergResult.error) console.error('Unable to load Home Iceberg stats:', icebergResult.error)
    if (bingoResult.error) console.error('Unable to load Home Bingo stats:', bingoResult.error)
    if (beerPongResult.error) console.error('Unable to load Home Beer Pong stats:', beerPongResult.error)
    if (missionScoreResult.error) console.error('Unable to load Home mission stats:', missionScoreResult.error)
    if (roomResult.error) console.error('Unable to load Home live room stats:', roomResult.error)
    if (photoResult.error) console.error('Unable to load Home Photo Hunt stats:', photoResult.error)

    const beerPongRow = beerPongResult.data as BeerPongRow | null
    const missionRows = (missionScoreResult.data ?? []) as MissionScoreRow[]
    const roomRow = roomResult.data as RoomStateRow | null

    setStats({
      iceberg: icebergResult.count ?? 0,
      bingo: bingoResult.count ?? 0,
      beerPong: beerPongRow?.state ?? {},
      missionPlayers: missionRows.length,
      missionCompleted: missionRows.reduce((total, row) => total + row.completed_count, 0),
      room: roomRow?.state ?? { phase: 'idle', voteCount: 0 },
      photos: photoResult.count ?? 0,
    })
    setStatsLoading(false)
  }, [])

  useEffect(() => {
    void loadStats()
  }, [loadStats])

  useEffect(() => {
    const channel = supabase
      .channel('anniv-2026-home-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'iceberg_entries' }, () => void loadStats())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bingo_prompts' }, () => void loadStats())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'beer_pong_state' }, () => void loadStats())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'secret_mission_scoreboard' }, () => void loadStats())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'live_vote_public_state' }, () => void loadStats())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'photo_hunt_submissions' }, () => void loadStats())
      .subscribe()

    const refreshInterval = window.setInterval(() => void loadStats(), 30000)
    return () => {
      window.clearInterval(refreshInterval)
      void supabase.removeChannel(channel)
    }
  }, [loadStats])

  const confirmedGuests = useMemo(
    () => guests.filter((guest) => guest.status === 'confirmed'),
    [guests],
  )

  const participantCount = useMemo(
    () => confirmedGuests.reduce((total, guest) => total + 1 + guest.plusOnes.length, 0),
    [confirmedGuests],
  )

  const beerPongStatus = useMemo(() => {
    if (stats.beerPong.championTeamId) return 'Tournoi terminé · champion désigné'
    if (stats.beerPong.draftValidated) {
      const teamCount = stats.beerPong.teams?.length ?? 0
      return `${teamCount} équipe${teamCount > 1 ? 's' : ''} · tournoi en cours`
    }
    if ((stats.beerPong.teams?.length ?? 0) > 0) return 'Draft prête à être lancée'
    const playerCount = stats.beerPong.selectedPlayerIds?.length ?? 0
    if (playerCount > 0) return `${playerCount} joueur${playerCount > 1 ? 's' : ''} sélectionné${playerCount > 1 ? 's' : ''}`
    return 'Tournoi pas encore lancé'
  }, [stats.beerPong])

  const moduleStatus = (module: PartyVisibilityModule) => {
    if (statsLoading) return 'Synchronisation...'

    switch (module) {
      case 'iceberg':
        return `${stats.iceberg} dossier${stats.iceberg !== 1 ? 's' : ''} disponible${stats.iceberg !== 1 ? 's' : ''}`
      case 'beer-pong':
        return beerPongStatus
      case 'bingo':
        return `${stats.bingo} situation${stats.bingo !== 1 ? 's' : ''} dans le pool`
      case 'missions':
        return stats.missionPlayers === 0
          ? 'Aucun agent actif pour l’instant'
          : `${stats.missionPlayers} agent${stats.missionPlayers !== 1 ? 's' : ''} · ${stats.missionCompleted} mission${stats.missionCompleted !== 1 ? 's' : ''} réussie${stats.missionCompleted !== 1 ? 's' : ''}`
      case 'room':
        if (stats.room.phase === 'open') return `${stats.room.voteCount ?? 0} vote${(stats.room.voteCount ?? 0) !== 1 ? 's' : ''} · round en cours`
        if (stats.room.phase === 'revealed') return 'Résultats révélés · prochain round bientôt'
        return 'En attente du prochain vote live'
      case 'photos':
        return stats.photos === 0
          ? 'Le mur attend sa première photo'
          : `${stats.photos} photo${stats.photos !== 1 ? 's' : ''} publiée${stats.photos !== 1 ? 's' : ''}`
      case 'guests':
        return `${participantCount} participant${participantCount !== 1 ? 's' : ''} confirmé${participantCount !== 1 ? 's' : ''}`
    }
  }

  const visibleModules = useMemo(() => {
    return publicModules
      .filter((module) => isAdmin || isPartyModuleVisible(settings, module.key))
      .sort((left, right) => {
        if (left.key === settings.featuredModule) return -1
        if (right.key === settings.featuredModule) return 1
        return 0
      })
  }, [isAdmin, settings])

  const personalActions = useMemo<PersonalAction[]>(() => {
    if (!identity || isAdmin) return []

    const actions: PersonalAction[] = []
    const featured = visibleModules.find(
      (module) => module.key === String(settings.featuredModule),
    )

    if (featured) {
      actions.push({
        key: `featured-${featured.key}`,
        eyebrow: 'Maintenant',
        title: featured.title,
        detail: 'C’est ce qui se passe en ce moment.',
        path: featured.path,
      })
    }

    if (
      settings.missionsVisible &&
      featured?.key !== 'missions'
    ) {
      actions.push({
        key: 'missions',
        eyebrow: 'Pour toi',
        title: 'Ta mission secrète',
        detail: 'Récupère ton objectif sans te faire griller.',
        path: '/missions',
      })
    }

    if (
      settings.bingoVisible &&
      featured?.key !== 'bingo'
    ) {
      actions.push({
        key: 'bingo',
        eyebrow: 'Toute la soirée',
        title: 'Ton Bingo',
        detail: 'Observe, coche et tente le carton plein.',
        path: '/bingo',
      })
    }

    if (
      actions.length < 3 &&
      settings.photosVisible &&
      featured?.key !== 'photos'
    ) {
      actions.push({
        key: 'photos',
        eyebrow: 'Souvenirs',
        title: 'Photo Hunt',
        detail: 'Choisis un défi et envoie ta meilleure photo.',
        path: '/photos',
      })
    }

    return actions.slice(0, 3)
  }, [identity, isAdmin, settings, visibleModules])

  const phase = phaseCopy[settings.phase]
  const showHallOfFame = settings.phase === 'ended' || isAdmin
  const knownGuest = Boolean(identity && !isAdmin)

  return (
    <>
      <HomeIdentityOnboarding />

      <main className={knownGuest ? 'home home--personalized' : 'home'}>
        <div className="home__glow home__glow--one" />
        <div className="home__glow home__glow--two" />

        <section className="hero">
          <p className="hero__eyebrow">
            {knownGuest ? `Salut ${identity?.playerName}` : '2026'}
          </p>
          <h1 className="hero__title">ANNIV<span>2026</span></h1>
          <p className="hero__description">
            {knownGuest
              ? 'Ton QG pour jouer, suivre le live et retrouver ce qui te concerne pendant la soirée.'
              : 'Bienvenue sur l’application officielle de la soirée.'}
          </p>
        </section>

        {knownGuest && (
          <section className="home-personal-hub" aria-label={`Espace de ${identity?.playerName}`}>
            <div className="home-personal-hub__heading">
              <div>
                <span>Ton espace</span>
                <h2>Qu’est-ce qu’on fait ?</h2>
              </div>
              <span className="home-personal-hub__identity">
                {identity?.playerName.slice(0, 1).toUpperCase()}
              </span>
            </div>

            <div className="home-personal-hub__actions">
              {personalActions.map((action) => (
                <Link
                  key={action.key}
                  to={action.path}
                  className="home-personal-action"
                >
                  <small>{action.eyebrow}</small>
                  <strong>{action.title}</strong>
                  <span>{action.detail}</span>
                  <b>→</b>
                </Link>
              ))}
            </div>
          </section>
        )}

        <section className={`home-party-state home-party-state--${settings.phase}`} aria-label="État de la soirée">
          <div className="home-party-state__status">
            <span className="home-party-state__dot" />
            <span>État de la soirée</span>
          </div>
          <strong>{partyLoading ? 'Synchronisation...' : phase.label}</strong>
          <p>{phase.detail}</p>
        </section>

        <section className="modules" aria-label="Modules">
          {showHallOfFame && (
            <Link
              to="/hall-of-fame"
              className={`module-card module-card--hall${settings.phase === 'ended' ? ' module-card--hall-live' : ''}`}
            >
              <div className="module-card__top">
                <span className="module-card__tag">
                  {settings.phase === 'ended' ? 'Palmarès final' : 'Aperçu admin'}
                </span>
                <span className="module-card__arrow">↗</span>
              </div>
              <div>
                <span className="module-card__featured-pill">
                  Hall of Fame
                </span>
                <h2>Les gagnants de la soirée</h2>
                <p>Champions Beer Pong, agents, mentalistes et grands chiffres.</p>
                <span className="module-card__status">
                  {settings.phase === 'ended'
                    ? 'Le palmarès est ouvert à tout le monde'
                    : 'Données provisoires · visible uniquement par l’admin'}
                </span>
              </div>
            </Link>
          )}

          {visibleModules.map((module) => {
            const featured = module.key === settings.featuredModule
            const visible = isPartyModuleVisible(settings, module.key)
            return (
              <Link
                key={module.path}
                to={module.path}
                className={`module-card ${module.className}${featured ? ' module-card--featured' : ''}${!visible ? ' module-card--public-hidden' : ''}`}
              >
                <div className="module-card__top">
                  <span className="module-card__tag">
                    {!visible && isAdmin ? 'Masqué public' : featured ? 'À la une' : module.tag}
                  </span>
                  <span className="module-card__arrow">↗</span>
                </div>
                <div>
                  {featured && <span className="module-card__featured-pill">Maintenant</span>}
                  <h2>{module.title}</h2>
                  <p>{module.subtitle}</p>
                  <span className="module-card__status">{moduleStatus(module.key)}</span>
                </div>
              </Link>
            )
          })}

          <Link to="/admin" className="module-card module-card--admin">
            <div className="module-card__top">
              <span className="module-card__tag">Privé</span>
              <span className="module-card__arrow">↗</span>
            </div>
            <div>
              <h2>Admin</h2>
              <p>Gestion de la soirée</p>
              <span className="module-card__status">Control Room</span>
            </div>
          </Link>
        </section>

        <footer className="home__footer">
          <span>Birthday App</span><span>•</span><span>2026</span>
        </footer>
      </main>
    </>
  )
}

export default Home
