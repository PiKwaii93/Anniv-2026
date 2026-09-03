import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
} from 'react'
import { Link } from 'react-router-dom'

import { useAuth } from '../features/auth/AuthContext'
import { supabase } from '../lib/supabase'

import './Iceberg.css'
import './IcebergVolume.css'

type IcebergLevel = 1 | 2 | 3 | 4 | 5

type IcebergEntry = {
  id: string
  level: IcebergLevel
  title: string
  description: string
  sort_order: number
  is_published: boolean
  created_at: string
  updated_at: string
}

type LevelConfig = {
  level: IcebergLevel
  number: string
  title: string
  subtitle: string
}

const levels: LevelConfig[] = [
  {
    level: 1,
    number: '01',
    title: 'Surface',
    subtitle: 'Les histoires que tout le monde connaît.',
  },
  {
    level: 2,
    number: '02',
    title: 'Sous la surface',
    subtitle: 'Il faut déjà avoir été là quelques fois.',
  },
  {
    level: 3,
    number: '03',
    title: 'Profondeurs',
    subtitle: 'Les dossiers commencent à ressortir.',
  },
  {
    level: 4,
    number: '04',
    title: 'Abysses',
    subtitle: 'On entre dans les archives sensibles.',
  },
  {
    level: 5,
    number: '05',
    title: "Fond de l'iceberg",
    subtitle: 'Si tu comprends tout, tu en sais trop.',
  },
]

const desktopBaseHeights: Record<IcebergLevel, number> = {
  1: 390,
  2: 350,
  3: 370,
  4: 390,
  5: 410,
}

const mobileBaseHeights: Record<IcebergLevel, number> = {
  1: 430,
  2: 225,
  3: 240,
  4: 255,
  5: 270,
}

function hashString(value: string) {
  let hash = 2166136261

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }

  return hash >>> 0
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.max(minimum, Math.min(maximum, value))
}

function getDesktopColumnCount(count: number) {
  if (count <= 1) {
    return 1
  }

  if (count <= 2) {
    return 2
  }

  if (count <= 6) {
    return 3
  }

  if (count <= 12) {
    return 4
  }

  return 5
}

function getMobileColumnCount(count: number) {
  return count <= 1 ? 1 : 2
}

function getColumnPosition(
  column: number,
  columns: number,
  minimum: number,
  maximum: number,
) {
  if (columns <= 1) {
    return 50
  }

  return minimum + ((maximum - minimum) * column) / (columns - 1)
}

function getTierStyle(
  level: IcebergLevel,
  count: number,
): CSSProperties {
  const desktopColumns = getDesktopColumnCount(count)
  const mobileColumns = getMobileColumnCount(count)

  const desktopRows =
    count === 0 ? 0 : Math.ceil(count / desktopColumns)
  const mobileRows =
    count === 0 ? 0 : Math.ceil(count / mobileColumns)

  const desktopTop = level === 1 ? 100 : 110
  const mobileTop = level === 1 ? 108 : 118

  const desktopNeeded =
    count === 0
      ? desktopBaseHeights[level]
      : desktopTop + Math.max(0, desktopRows - 1) * 96 + 112

  const mobileNeeded =
    count === 0
      ? mobileBaseHeights[level]
      : mobileTop + Math.max(0, mobileRows - 1) * 88 + 108

  return {
    '--tier-height': `${Math.max(
      desktopBaseHeights[level],
      desktopNeeded,
    )}px`,
    '--tier-height-mobile': `${Math.max(
      mobileBaseHeights[level],
      mobileNeeded,
    )}px`,
  } as CSSProperties
}

function getScatterStyle(
  entry: IcebergEntry,
  index: number,
  count: number,
): CSSProperties {
  const seed = hashString(
    `${entry.id}-${entry.title}-${entry.level}`,
  )

  const desktopColumns = getDesktopColumnCount(count)
  const mobileColumns = getMobileColumnCount(count)

  const desktopRow = Math.floor(index / desktopColumns)
  const mobileRow = Math.floor(index / mobileColumns)

  const desktopRowOffset =
    hashString(`${entry.level}-desktop-${desktopRow}`) %
    desktopColumns

  const mobileRowOffset =
    hashString(`${entry.level}-mobile-${mobileRow}`) %
    mobileColumns

  const desktopColumn =
    (index % desktopColumns + desktopRowOffset) % desktopColumns

  const mobileColumn =
    (index % mobileColumns + mobileRowOffset) % mobileColumns

  const jitterX = (seed % 7) - 3
  const jitterY = (Math.floor(seed / 17) % 15) - 7
  const mobileJitterX = (Math.floor(seed / 41) % 5) - 2
  const mobileJitterY = (Math.floor(seed / 67) % 11) - 5

  const desktopX = clamp(
    getColumnPosition(
      desktopColumn,
      desktopColumns,
      entry.level === 1 ? 20 : 18,
      entry.level === 1 ? 80 : 82,
    ) + jitterX,
    14,
    86,
  )

  const mobileX = clamp(
    getColumnPosition(
      mobileColumn,
      mobileColumns,
      28,
      72,
    ) + mobileJitterX,
    24,
    76,
  )

  const desktopY =
    (entry.level === 1 ? 100 : 110) +
    desktopRow * 96 +
    jitterY

  const mobileY =
    (entry.level === 1 ? 108 : 118) +
    mobileRow * 88 +
    mobileJitterY

  const rotationOptions = [-5, -3, -1, 0, 0, 0, 1, 2, 4]
  const rotation =
    rotationOptions[
      Math.floor(seed / 101) % rotationOptions.length
    ]

  const fontSizes = [0.92, 1.02, 1.1, 1.18, 1.28, 1.4, 1.52]
  const baseFontSize =
    fontSizes[Math.floor(seed / 1009) % fontSizes.length]

  const titleLengthScale =
    entry.title.length > 42
      ? 0.8
      : entry.title.length > 30
        ? 0.87
        : entry.title.length > 22
          ? 0.94
          : 1

  const fontSize = baseFontSize * titleLengthScale

  const maxWidths = [150, 180, 210, 240, 275, 310]
  const randomMaxWidth =
    maxWidths[Math.floor(seed / 3011) % maxWidths.length]

  const densityWidthCap =
    desktopColumns >= 5
      ? 185
      : desktopColumns === 4
        ? 220
        : desktopColumns === 3
          ? 270
          : 310

  const viewportWidthCap =
    desktopColumns >= 5
      ? '15.5vw'
      : desktopColumns === 4
        ? '19vw'
        : desktopColumns === 3
          ? '27vw'
          : '35vw'

  const maxWidth = Math.min(randomMaxWidth, densityWidthCap)

  const fontWeights = [450, 500, 550, 600, 650, 700]
  const fontWeight =
    fontWeights[Math.floor(seed / 7013) % fontWeights.length]

  const opacityOptions = [0.8, 0.86, 0.9, 0.95, 1]
  const opacity =
    opacityOptions[Math.floor(seed / 9001) % opacityOptions.length]

  const letterSpacingOptions = [
    '-0.045em',
    '-0.025em',
    '-0.01em',
    '0em',
    '0.015em',
  ]

  const letterSpacing =
    letterSpacingOptions[
      Math.floor(seed / 13001) % letterSpacingOptions.length
    ]

  return {
    '--scatter-x': `${desktopX}%`,
    '--scatter-y': `${desktopY}px`,
    '--scatter-x-mobile': `${mobileX}%`,
    '--scatter-y-mobile': `${mobileY}px`,
    '--scatter-rotation': `${rotation}deg`,
    '--scatter-size': `${fontSize}rem`,
    '--scatter-width': `${maxWidth}px`,
    '--scatter-viewport-cap': viewportWidthCap,
    '--scatter-mobile-width': `${Math.min(maxWidth, 158)}px`,
    '--scatter-weight': fontWeight,
    '--scatter-opacity': opacity,
    '--scatter-letter-spacing': letterSpacing,
  } as CSSProperties
}

function getScatterVariant(entry: IcebergEntry) {
  return hashString(entry.id) % 6
}

function getDensityClass(count: number) {
  if (count === 0) {
    return 'iceberg-tier--empty'
  }

  if (count >= 13) {
    return 'iceberg-tier--dense'
  }

  if (count <= 2) {
    return 'iceberg-tier--sparse'
  }

  return ''
}

function Iceberg() {
  const { isAdmin, loading: authLoading } = useAuth()

  const [entries, setEntries] = useState<IcebergEntry[]>([])
  const [view, setView] = useState<'list' | 'scene'>('list')
  const [selectedEntryId, setSelectedEntryId] = useState<string | null>(
    null,
  )
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const loadEntries = useCallback(async () => {
    const { data, error: loadError } = await supabase
      .from('iceberg_entries')
      .select(
        `
          id,
          level,
          title,
          description,
          sort_order,
          is_published,
          created_at,
          updated_at
        `,
      )
      .eq('is_published', true)
      .order('level', { ascending: true })
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true })

    if (loadError) {
      console.error('Unable to load iceberg:', loadError)
      setError("Impossible de charger l'iceberg.")
      setLoading(false)
      return
    }

    setEntries((data ?? []) as IcebergEntry[])
    setError('')
    setLoading(false)
  }, [])

  useEffect(() => {
    void loadEntries()
  }, [loadEntries])

  useEffect(() => {
    const channel = supabase
      .channel('anniv-2026-iceberg-public')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'iceberg_entries',
        },
        () => {
          void loadEntries()
        },
      )
      .subscribe()

    const refreshInterval = window.setInterval(() => {
      void loadEntries()
    }, 15000)

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        void loadEntries()
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      window.clearInterval(refreshInterval)
      document.removeEventListener(
        'visibilitychange',
        handleVisibilityChange,
      )
      void supabase.removeChannel(channel)
    }
  }, [loadEntries])

  const entriesByLevel = useMemo(() => {
    const map = new Map<IcebergLevel, IcebergEntry[]>()

    for (const level of levels) {
      map.set(level.level, [])
    }

    for (const entry of entries) {
      const current = map.get(entry.level) ?? []
      current.push(entry)
      map.set(entry.level, current)
    }

    return map
  }, [entries])

  const selectedEntry = useMemo(
    () =>
      entries.find((entry) => entry.id === selectedEntryId) ?? null,
    [entries, selectedEntryId],
  )

  useEffect(() => {
    if (!selectedEntry) {
      return
    }

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setSelectedEntryId(null)
      }
    }

    window.addEventListener('keydown', handleKeyDown)

    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [selectedEntry])

  const renderEntries = (level: IcebergLevel) => {
    const levelEntries = entriesByLevel.get(level) ?? []

    if (levelEntries.length === 0) {
      return null
    }

    return (
      <div className="iceberg-scatter">
        {levelEntries.map((entry, index) => {
          const variant = getScatterVariant(entry)

          return (
            <button
              type="button"
              key={entry.id}
              className={`iceberg-scatter-item iceberg-scatter-item--${variant}`}
              style={getScatterStyle(entry, index, levelEntries.length)}
              onClick={() => setSelectedEntryId(entry.id)}
            >
              {entry.title}
            </button>
          )
        })}
      </div>
    )
  }

  const surfaceLevel = levels[0]
  const surfaceEntries = entriesByLevel.get(1) ?? []
  const surfaceStyle = getTierStyle(1, surfaceEntries.length)
  const surfaceDensityClass = getDensityClass(surfaceEntries.length)

  return (
    <main className={`iceberg-page iceberg-page--${view}`}>
      <header className="iceberg-header">
        <div className="iceberg-header__navigation">
          <Link to="/" className="back-link">
            ← Accueil
          </Link>

          {!authLoading && isAdmin && (
            <Link to="/admin/iceberg" className="iceberg-admin-link">
              Gérer l&apos;iceberg
            </Link>
          )}
        </div>

        <div className="iceberg-header__content">
          <p className="iceberg-eyebrow">Anniv 2026 / Archives</p>

          <h1>
            The
            <span>Iceberg</span>
          </h1>

          <p className="iceberg-header__description">
            Plus tu descends, plus les dossiers deviennent obscurs. Clique
            directement sur une anecdote pour ouvrir ses archives.
          </p>
        </div>

        <div className="iceberg-scroll-hint">
          <span>↓</span>
          Descendre sous la surface
        </div>
      </header>

      <div className="guest-tabs" aria-label="Lecture de l’Iceberg"><button type="button" aria-pressed={view === 'list'} onClick={() => setView('list')}>Par niveaux</button><button type="button" aria-pressed={view === 'scene'} onClick={() => setView('scene')}>Vue illustrée</button></div>
      {view === 'list' && !loading && <div className="iceberg-readable">{levels.map(level => <section className="guest-section" key={level.level}><h2>{level.number} · {level.title}</h2><p className="guest-empty">{level.subtitle}</p><div className="guest-activity-list">{(entriesByLevel.get(level.level) ?? []).map(entry => <details key={entry.id}><summary>{entry.title}</summary><p>{entry.description.trim() || 'Cette histoire se raconte de vive voix. Demande autour de toi !'}</p></details>)}</div>{!(entriesByLevel.get(level.level)?.length) && <p className="guest-empty">Pas encore d’histoire à ce niveau.</p>}</section>)}</div>}
      {error && <div className="iceberg-error">{error}</div>}

      {loading ? (
        <section className="iceberg-loading">
          <div>◇</div>
          <p>Formation de l&apos;iceberg...</p>
        </section>
      ) : (
        <section className="iceberg-scene" hidden={view !== 'scene'}>
          <div className="iceberg-sky" style={surfaceStyle}>
            <div className="iceberg-cloud iceberg-cloud--one" />
            <div className="iceberg-cloud iceberg-cloud--two" />

            <div className="iceberg-tip" aria-hidden="true">
              <div className="iceberg-tip__shine" />
              <div className="iceberg-tip__texture" />
            </div>

            <div
              className={`iceberg-tier iceberg-tier--surface ${surfaceDensityClass}`}
              style={surfaceStyle}
            >
              <div className="iceberg-tier__inner">
                <div className="iceberg-tier__label">
                  <span>{surfaceLevel.number}</span>

                  <div>
                    <small>Niveau {surfaceLevel.level}</small>
                    <h2>{surfaceLevel.title}</h2>
                    <p>{surfaceLevel.subtitle}</p>
                  </div>
                </div>

                <div className="iceberg-tier__content">
                  {renderEntries(1)}
                </div>
              </div>
            </div>
          </div>

          <div className="iceberg-waterline">
            <div className="iceberg-waterline__wave" />
            <span>Ligne de flottaison</span>
          </div>

          <div className="iceberg-underwater">
            <div className="iceberg-body" aria-hidden="true">
              <div className="iceberg-body__shine" />
              <div className="iceberg-body__texture" />
              <div className="iceberg-body__facet iceberg-body__facet--one" />
              <div className="iceberg-body__facet iceberg-body__facet--two" />
              <div className="iceberg-body__facet iceberg-body__facet--three" />
              <div className="iceberg-body__facet iceberg-body__facet--four" />
              <div className="iceberg-body__facet iceberg-body__facet--five" />
            </div>

            {levels.slice(1).map((levelConfig) => {
              const levelEntries =
                entriesByLevel.get(levelConfig.level) ?? []
              const densityClass = getDensityClass(levelEntries.length)

              return (
                <div
                  key={levelConfig.level}
                  className={`iceberg-tier iceberg-tier--${levelConfig.level} ${densityClass}`}
                  style={getTierStyle(
                    levelConfig.level,
                    levelEntries.length,
                  )}
                >
                  <div className="iceberg-tier__inner">
                    <div className="iceberg-tier__label">
                      <span>{levelConfig.number}</span>

                      <div>
                        <small>Niveau {levelConfig.level}</small>
                        <h2>{levelConfig.title}</h2>
                        <p>{levelConfig.subtitle}</p>
                      </div>
                    </div>

                    <div className="iceberg-tier__content">
                      {renderEntries(levelConfig.level)}
                    </div>
                  </div>
                </div>
              )
            })}

            <div className="iceberg-abyss">
              <span>Profondeur maximale</span>
              <strong>Tu as atteint le fond.</strong>
              <p>Il n&apos;y a officiellement rien après.</p>
            </div>
          </div>
        </section>
      )}

      {selectedEntry && (
        <div
          className="iceberg-modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="iceberg-modal-title"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setSelectedEntryId(null)
            }
          }}
        >
          <article className="iceberg-modal__card">
            <button
              type="button"
              className="iceberg-modal__close"
              aria-label="Fermer"
              onClick={() => setSelectedEntryId(null)}
            >
              ×
            </button>

            <div className="iceberg-modal__depth">
              Niveau {selectedEntry.level}
              <span>
                {
                  levels.find(
                    (level) => level.level === selectedEntry.level,
                  )?.title
                }
              </span>
            </div>

            <p className="iceberg-eyebrow">Dossier déclassifié</p>
            <h2 id="iceberg-modal-title">{selectedEntry.title}</h2>
            <div className="iceberg-modal__separator" />

            {selectedEntry.description.trim() ? (
              <p className="iceberg-modal__description">
                {selectedEntry.description}
              </p>
            ) : (
              <p className="iceberg-modal__description iceberg-modal__description--empty">
                Aucun contexte supplémentaire.
              </p>
            )}

            <div className="iceberg-modal__footer">
              <span>ANNIV / 2026</span>
              <span>ARCHIVES</span>
            </div>
          </article>
        </div>
      )}
    </main>
  )
}

export default Iceberg
