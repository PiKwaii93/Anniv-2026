import {
  useCallback,
  useEffect,
  useMemo,
  useState,
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

function Iceberg() {
  const {
    isAdmin,
    loading: authLoading,
  } = useAuth()

  const [entries, setEntries] =
    useState<IcebergEntry[]>([])

  const [openEntryId, setOpenEntryId] =
    useState<string | null>(null)

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
        .eq('is_published', true)
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
          table: 'iceberg_entries',
        },
        () => {
          void loadEntries()
        },
      )
      .subscribe()

    const refreshInterval =
      window.setInterval(() => {
        void loadEntries()
      }, 15000)

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
        map.set(level.level, [])
      }

      for (const entry of entries) {
        const current =
          map.get(entry.level) ?? []

        current.push(entry)

        map.set(entry.level, current)
      }

      return map
    }, [entries])

  const toggleEntry = (
    entryId: string,
  ) => {
    setOpenEntryId(
      (
        currentOpenEntryId,
      ) =>
        currentOpenEntryId === entryId
          ? null
          : entryId,
    )
  }

  return (
    <main className="iceberg-page">
      <div className="iceberg-page__glow iceberg-page__glow--top" />
      <div className="iceberg-page__glow iceberg-page__glow--bottom" />

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
                Gérer l&apos;iceberg
              </Link>
            )}
        </div>

        <div className="iceberg-header__content">
          <p className="iceberg-eyebrow">
            Anniv 2026 / Archives
          </p>

          <h1>
            The
            <span>Iceberg</span>
          </h1>

          <p className="iceberg-header__description">
            Plus tu descends, plus les
            anecdotes deviennent
            spécifiques. Clique sur un
            élément pour découvrir ce
            qu&apos;il cache.
          </p>
        </div>

        <div className="iceberg-waterline">
          <span>Surface</span>

          <div />

          <span>↓ Descendre</span>
        </div>
      </header>

      {error && (
        <div className="iceberg-error">
          {error}
        </div>
      )}

      {loading ? (
        <section className="iceberg-loading">
          <div className="iceberg-loading__symbol">
            ◇
          </div>

          <p>
            Chargement des archives...
          </p>
        </section>
      ) : entries.length === 0 ? (
        <section className="iceberg-empty">
          <div className="iceberg-empty__symbol">
            △
          </div>

          <h2>
            Rien sous la glace.
          </h2>

          <p>
            L&apos;iceberg n&apos;a
            encore révélé aucun dossier.
          </p>

          {!authLoading &&
            isAdmin && (
              <Link
                to="/admin/iceberg"
                className="iceberg-empty__action"
              >
                Ajouter le premier
                élément
              </Link>
            )}
        </section>
      ) : (
        <div className="iceberg-depths">
          <div className="iceberg-depth-line">
            <span />
          </div>

          {levels.map(
            (levelConfig) => {
              const levelEntries =
                entriesByLevel.get(
                  levelConfig.level,
                ) ?? []

              return (
                <section
                  key={
                    levelConfig.level
                  }
                  className={`iceberg-level iceberg-level--${levelConfig.level}`}
                >
                  <div className="iceberg-level__heading">
                    <div className="iceberg-level__number">
                      {
                        levelConfig.number
                      }
                    </div>

                    <div>
                      <p>
                        Niveau{' '}
                        {
                          levelConfig.level
                        }
                      </p>

                      <h2>
                        {
                          levelConfig.title
                        }
                      </h2>

                      <span>
                        {
                          levelConfig.subtitle
                        }
                      </span>
                    </div>
                  </div>

                  {levelEntries.length ===
                  0 ? (
                    <div className="iceberg-level__empty">
                      Rien à signaler à
                      cette profondeur.
                    </div>
                  ) : (
                    <div className="iceberg-entries">
                      {levelEntries.map(
                        (
                          entry,
                          index,
                        ) => {
                          const isOpen =
                            openEntryId ===
                            entry.id

                          return (
                            <article
                              key={
                                entry.id
                              }
                              className={`iceberg-entry ${
                                isOpen
                                  ? 'iceberg-entry--open'
                                  : ''
                              }`}
                            >
                              <button
                                type="button"
                                className="iceberg-entry__trigger"
                                aria-expanded={
                                  isOpen
                                }
                                onClick={() =>
                                  toggleEntry(
                                    entry.id,
                                  )
                                }
                              >
                                <div className="iceberg-entry__index">
                                  {String(
                                    index +
                                      1,
                                  ).padStart(
                                    2,
                                    '0',
                                  )}
                                </div>

                                <strong>
                                  {
                                    entry.title
                                  }
                                </strong>

                                <span className="iceberg-entry__toggle">
                                  {isOpen
                                    ? '−'
                                    : '+'}
                                </span>
                              </button>

                              <div
                                className="iceberg-entry__content"
                                aria-hidden={
                                  !isOpen
                                }
                              >
                                <div>
                                  {entry.description.trim() ? (
                                    <p>
                                      {
                                        entry.description
                                      }
                                    </p>
                                  ) : (
                                    <p className="iceberg-entry__no-description">
                                      Aucun contexte
                                      supplémentaire.
                                    </p>
                                  )}
                                </div>
                              </div>
                            </article>
                          )
                        },
                      )}
                    </div>
                  )}
                </section>
              )
            },
          )}

          <footer className="iceberg-bottom">
            <span>05</span>

            <p>
              Tu as atteint le fond.
            </p>

            <strong>
              Il n&apos;y a officiellement
              rien après.
            </strong>
          </footer>
        </div>
      )}
    </main>
  )
}

export default Iceberg