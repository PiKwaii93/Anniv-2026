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
    subtitle:
      'Les histoires que tout le monde connaît.',
  },
  {
    level: 2,
    number: '02',
    title: 'Sous la surface',
    subtitle:
      'Il faut déjà avoir été là quelques fois.',
  },
  {
    level: 3,
    number: '03',
    title: 'Profondeurs',
    subtitle:
      'Les dossiers commencent à ressortir.',
  },
  {
    level: 4,
    number: '04',
    title: 'Abysses',
    subtitle:
      'On entre dans les archives sensibles.',
  },
  {
    level: 5,
    number: '05',
    title: "Fond de l'iceberg",
    subtitle:
      'Si tu comprends tout, tu en sais trop.',
  },
]

const scatterSlots = [
  { x: 21, y: 20 },
  { x: 45, y: 15 },
  { x: 69, y: 21 },
  { x: 31, y: 38 },
  { x: 57, y: 36 },
  { x: 78, y: 42 },
  { x: 19, y: 59 },
  { x: 44, y: 57 },
  { x: 68, y: 62 },
  { x: 29, y: 78 },
  { x: 54, y: 78 },
  { x: 79, y: 77 },
  { x: 37, y: 26 },
  { x: 72, y: 51 },
  { x: 23, y: 46 },
  { x: 60, y: 67 },
]

function hashString(
  value: string,
) {
  let hash = 2166136261

  for (
    let index = 0;
    index < value.length;
    index += 1
  ) {
    hash ^= value.charCodeAt(index)

    hash = Math.imul(
      hash,
      16777619,
    )
  }

  return hash >>> 0
}

function getScatterStyle(
  entry: IcebergEntry,
  index: number,
): CSSProperties {
  const seed = hashString(
    `${entry.id}-${entry.title}-${entry.level}`,
  )

  const slot =
    scatterSlots[
      (
        index * 7 +
        seed
      ) %
        scatterSlots.length
    ]

  const jitterX =
    (seed % 9) - 4

  const jitterY =
    (
      Math.floor(
        seed / 17,
      ) %
      11
    ) - 5

  const rotationOptions = [
    -5,
    -3,
    -1,
    0,
    0,
    0,
    1,
    2,
    4,
  ]

  const rotation =
    rotationOptions[
      Math.floor(
        seed / 101,
      ) %
        rotationOptions.length
    ]

  const fontSizes = [
    0.92,
    1.02,
    1.1,
    1.18,
    1.28,
    1.4,
    1.52,
  ]

  const fontSize =
    fontSizes[
      Math.floor(
        seed / 1009,
      ) %
        fontSizes.length
    ]

  const maxWidths = [
    150,
    180,
    210,
    240,
    275,
    310,
  ]

  const maxWidth =
    maxWidths[
      Math.floor(
        seed / 3011,
      ) %
        maxWidths.length
    ]

  const fontWeights = [
    450,
    500,
    550,
    600,
    650,
    700,
  ]

  const fontWeight =
    fontWeights[
      Math.floor(
        seed / 7013,
      ) %
        fontWeights.length
    ]

  const opacityOptions = [
    0.8,
    0.86,
    0.9,
    0.95,
    1,
  ]

  const opacity =
    opacityOptions[
      Math.floor(
        seed / 9001,
      ) %
        opacityOptions.length
    ]

  const letterSpacingOptions = [
    '-0.045em',
    '-0.025em',
    '-0.01em',
    '0em',
    '0.015em',
  ]

  const letterSpacing =
    letterSpacingOptions[
      Math.floor(
        seed / 13001,
      ) %
        letterSpacingOptions.length
    ]

  const minX =
    entry.level === 1
      ? 16
      : 14

  const maxX =
    entry.level === 1
      ? 84
      : 86

  const x = Math.max(
    minX,
    Math.min(
      maxX,
      slot.x + jitterX,
    ),
  )

  const y = Math.max(
    10,
    Math.min(
      88,
      slot.y + jitterY,
    ),
  )

  return {
    '--scatter-x': `${x}%`,
    '--scatter-y': `${y}%`,
    '--scatter-rotation': `${rotation}deg`,
    '--scatter-size': `${fontSize}rem`,
    '--scatter-width': `${maxWidth}px`,
    '--scatter-weight': fontWeight,
    '--scatter-opacity': opacity,
    '--scatter-letter-spacing':
      letterSpacing,
  } as CSSProperties
}

function getScatterVariant(
  entry: IcebergEntry,
) {
  return hashString(entry.id) % 6
}

function Iceberg() {
  const {
    isAdmin,
    loading: authLoading,
  } = useAuth()

  const [entries, setEntries] =
    useState<IcebergEntry[]>([])

  const [
    selectedEntryId,
    setSelectedEntryId,
  ] = useState<string | null>(
    null,
  )

  const [loading, setLoading] =
    useState(true)

  const [error, setError] =
    useState('')

  const loadEntries =
    useCallback(async () => {
      const {
        data,
        error: loadError,
      } = await supabase
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
        .eq(
          'is_published',
          true,
        )
        .order('level', {
          ascending: true,
        })
        .order('sort_order', {
          ascending: true,
        })
        .order('created_at', {
          ascending: true,
        })

      if (loadError) {
        console.error(
          'Unable to load iceberg:',
          loadError,
        )

        setError(
          "Impossible de charger l'iceberg.",
        )

        setLoading(false)

        return
      }

      setEntries(
        (data ?? []) as IcebergEntry[],
      )

      setError('')
      setLoading(false)
    }, [])

  useEffect(() => {
    void loadEntries()
  }, [loadEntries])

  useEffect(() => {
    const channel = supabase
      .channel(
        'anniv-2026-iceberg-public',
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table:
            'iceberg_entries',
        },
        () => {
          void loadEntries()
        },
      )
      .subscribe()

    const refreshInterval =
      window.setInterval(
        () => {
          void loadEntries()
        },
        15000,
      )

    const handleVisibilityChange =
      () => {
        if (
          document.visibilityState ===
          'visible'
        ) {
          void loadEntries()
        }
      }

    document.addEventListener(
      'visibilitychange',
      handleVisibilityChange,
    )

    return () => {
      window.clearInterval(
        refreshInterval,
      )

      document.removeEventListener(
        'visibilitychange',
        handleVisibilityChange,
      )

      void supabase.removeChannel(
        channel,
      )
    }
  }, [loadEntries])

  const entriesByLevel =
    useMemo(() => {
      const map =
        new Map<
          IcebergLevel,
          IcebergEntry[]
        >()

      for (const level of levels) {
        map.set(
          level.level,
          [],
        )
      }

      for (const entry of entries) {
        const current =
          map.get(
            entry.level,
          ) ?? []

        current.push(entry)

        map.set(
          entry.level,
          current,
        )
      }

      return map
    }, [entries])

  const selectedEntry =
    useMemo(
      () =>
        entries.find(
          (entry) =>
            entry.id ===
            selectedEntryId,
        ) ?? null,
      [
        entries,
        selectedEntryId,
      ],
    )

  useEffect(() => {
    if (!selectedEntry) {
      return
    }

    const previousOverflow =
      document.body.style
        .overflow

    document.body.style.overflow =
      'hidden'

    const handleKeyDown = (
      event: KeyboardEvent,
    ) => {
      if (
        event.key ===
        'Escape'
      ) {
        setSelectedEntryId(
          null,
        )
      }
    }

    window.addEventListener(
      'keydown',
      handleKeyDown,
    )

    return () => {
      document.body.style.overflow =
        previousOverflow

      window.removeEventListener(
        'keydown',
        handleKeyDown,
      )
    }
  }, [selectedEntry])

  const renderEntries = (
    level: IcebergLevel,
  ) => {
    const levelEntries =
      entriesByLevel.get(
        level,
      ) ?? []

    if (
      levelEntries.length === 0
    ) {
      return (
        <div className="iceberg-scatter__empty">
          Aucun dossier
        </div>
      )
    }

    return (
      <div className="iceberg-scatter">
        {levelEntries.map(
          (
            entry,
            index,
          ) => {
            const variant =
              getScatterVariant(
                entry,
              )

            return (
              <button
                type="button"
                key={entry.id}
                className={`iceberg-scatter-item iceberg-scatter-item--${variant}`}
                style={getScatterStyle(
                  entry,
                  index,
                )}
                onClick={() =>
                  setSelectedEntryId(
                    entry.id,
                  )
                }
              >
                {entry.title}
              </button>
            )
          },
        )}
      </div>
    )
  }

  const surfaceLevel =
    levels[0]

  return (
    <main className="iceberg-page">
      <header className="iceberg-header">
        <div className="iceberg-header__navigation">
          <Link
            to="/"
            className="back-link"
          >
            ← Accueil
          </Link>

          {!authLoading &&
            isAdmin && (
              <Link
                to="/admin/iceberg"
                className="iceberg-admin-link"
              >
                Gérer
                l&apos;iceberg
              </Link>
            )}
        </div>

        <div className="iceberg-header__content">
          <p className="iceberg-eyebrow">
            Anniv 2026 /
            Archives
          </p>

          <h1>
            The
            <span>
              Iceberg
            </span>
          </h1>

          <p className="iceberg-header__description">
            Plus tu descends,
            plus les dossiers
            deviennent obscurs.
            Clique directement
            sur une anecdote pour
            ouvrir ses archives.
          </p>
        </div>

        <div className="iceberg-scroll-hint">
          <span>↓</span>
          Descendre sous la
          surface
        </div>
      </header>

      {error && (
        <div className="iceberg-error">
          {error}
        </div>
      )}

      {loading ? (
        <section className="iceberg-loading">
          <div>◇</div>

          <p>
            Formation de
            l&apos;iceberg...
          </p>
        </section>
      ) : (
        <section className="iceberg-scene">
          <div className="iceberg-sky">
            <div className="iceberg-cloud iceberg-cloud--one" />
            <div className="iceberg-cloud iceberg-cloud--two" />

            <div
              className="iceberg-tip"
              aria-hidden="true"
            >
              <div className="iceberg-tip__shine" />
              <div className="iceberg-tip__texture" />
            </div>

            <div className="iceberg-tier iceberg-tier--surface">
              <div className="iceberg-tier__inner">
                <div className="iceberg-tier__label">
                  <span>
                    {
                      surfaceLevel.number
                    }
                  </span>

                  <div>
                    <small>
                      Niveau{' '}
                      {
                        surfaceLevel.level
                      }
                    </small>

                    <h2>
                      {
                        surfaceLevel.title
                      }
                    </h2>

                    <p>
                      {
                        surfaceLevel.subtitle
                      }
                    </p>
                  </div>
                </div>

                <div className="iceberg-tier__content">
                  {renderEntries(
                    1,
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="iceberg-waterline">
            <div className="iceberg-waterline__wave" />

            <span>
              Ligne de flottaison
            </span>
          </div>

          <div className="iceberg-underwater">
            <div
              className="iceberg-body"
              aria-hidden="true"
            >
              <div className="iceberg-body__shine" />

              <div className="iceberg-body__texture" />

              <div className="iceberg-body__facet iceberg-body__facet--one" />

              <div className="iceberg-body__facet iceberg-body__facet--two" />

              <div className="iceberg-body__facet iceberg-body__facet--three" />

              <div className="iceberg-body__facet iceberg-body__facet--four" />

              <div className="iceberg-body__facet iceberg-body__facet--five" />
            </div>

            {levels
              .slice(1)
              .map(
                (
                  levelConfig,
                ) => (
                  <div
                    key={
                      levelConfig.level
                    }
                    className={`iceberg-tier iceberg-tier--${levelConfig.level}`}
                  >
                    <div className="iceberg-tier__inner">
                      <div className="iceberg-tier__label">
                        <span>
                          {
                            levelConfig.number
                          }
                        </span>

                        <div>
                          <small>
                            Niveau{' '}
                            {
                              levelConfig.level
                            }
                          </small>

                          <h2>
                            {
                              levelConfig.title
                            }
                          </h2>

                          <p>
                            {
                              levelConfig.subtitle
                            }
                          </p>
                        </div>
                      </div>

                      <div className="iceberg-tier__content">
                        {renderEntries(
                          levelConfig.level,
                        )}
                      </div>
                    </div>
                  </div>
                ),
              )}

            <div className="iceberg-abyss">
              <span>
                Profondeur
                maximale
              </span>

              <strong>
                Tu as atteint
                le fond.
              </strong>

              <p>
                Il n&apos;y a
                officiellement
                rien après.
              </p>
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
          onMouseDown={(
            event,
          ) => {
            if (
              event.target ===
              event.currentTarget
            ) {
              setSelectedEntryId(
                null,
              )
            }
          }}
        >
          <article className="iceberg-modal__card">
            <button
              type="button"
              className="iceberg-modal__close"
              aria-label="Fermer"
              onClick={() =>
                setSelectedEntryId(
                  null,
                )
              }
            >
              ×
            </button>

            <div className="iceberg-modal__depth">
              Niveau{' '}
              {
                selectedEntry.level
              }

              <span>
                {
                  levels.find(
                    (level) =>
                      level.level ===
                      selectedEntry.level,
                  )?.title
                }
              </span>
            </div>

            <p className="iceberg-eyebrow">
              Dossier déclassifié
            </p>

            <h2 id="iceberg-modal-title">
              {
                selectedEntry.title
              }
            </h2>

            <div className="iceberg-modal__separator" />

            {selectedEntry.description.trim() ? (
              <p className="iceberg-modal__description">
                {
                  selectedEntry.description
                }
              </p>
            ) : (
              <p className="iceberg-modal__description iceberg-modal__description--empty">
                Aucun contexte
                supplémentaire.
              </p>
            )}

            <div className="iceberg-modal__footer">
              <span>
                ANNIV / 2026
              </span>

              <span>
                ARCHIVES
              </span>
            </div>
          </article>
        </div>
      )}
    </main>
  )
}

export default Iceberg