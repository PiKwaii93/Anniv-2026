import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from 'react'
import { Link } from 'react-router-dom'

import { useAuth } from '../features/auth/AuthContext'
import { supabase } from '../lib/supabase'

import './IcebergAdmin.css'

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

const levelNames: Record<
  IcebergLevel,
  string
> = {
  1: 'Surface',
  2: 'Sous la surface',
  3: 'Profondeurs',
  4: 'Abysses',
  5: "Fond de l'iceberg",
}

function IcebergAdmin() {
  const {
    isAdmin,
    loading: authLoading,
  } = useAuth()

  const [entries, setEntries] =
    useState<IcebergEntry[]>([])

  const [loading, setLoading] =
    useState(true)

  const [error, setError] =
    useState('')

  const [success, setSuccess] =
    useState('')

  const [submitting, setSubmitting] =
    useState(false)

  const [title, setTitle] =
    useState('')

  const [
    description,
    setDescription,
  ] = useState('')

  const [level, setLevel] =
    useState<IcebergLevel>(1)

  const [
    isPublished,
    setIsPublished,
  ] = useState(true)

  const [
    editingId,
    setEditingId,
  ] = useState<string | null>(
    null,
  )

  const [editTitle, setEditTitle] =
    useState('')

  const [
    editDescription,
    setEditDescription,
  ] = useState('')

  const [editLevel, setEditLevel] =
    useState<IcebergLevel>(1)

  const [
    editPublished,
    setEditPublished,
  ] = useState(true)

  const loadEntries =
    useCallback(async () => {
      if (
        authLoading ||
        !isAdmin
      ) {
        return
      }

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
          'Unable to load iceberg admin:',
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
    }, [
      authLoading,
      isAdmin,
    ])

  useEffect(() => {
    void loadEntries()
  }, [loadEntries])

  useEffect(() => {
    if (
      authLoading ||
      !isAdmin
    ) {
      return
    }

    const channel = supabase
      .channel(
        'anniv-2026-iceberg-admin',
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

    return () => {
      void supabase.removeChannel(
        channel,
      )
    }
  }, [
    authLoading,
    isAdmin,
    loadEntries,
  ])

  useEffect(() => {
    if (!success) {
      return
    }

    const timeout =
      window.setTimeout(() => {
        setSuccess('')
      }, 3000)

    return () => {
      window.clearTimeout(
        timeout,
      )
    }
  }, [success])

  const entriesByLevel =
    useMemo(() => {
      const map =
        new Map<
          IcebergLevel,
          IcebergEntry[]
        >()

      for (
        let currentLevel = 1;
        currentLevel <= 5;
        currentLevel += 1
      ) {
        map.set(
          currentLevel as IcebergLevel,
          [],
        )
      }

      for (const entry of entries) {
        const current =
          map.get(entry.level) ?? []

        current.push(entry)

        map.set(
          entry.level,
          current,
        )
      }

      return map
    }, [entries])

  const getNextSortOrder = (
    targetLevel: IcebergLevel,
  ) => {
    const levelEntries =
      entries.filter(
        (entry) =>
          entry.level ===
          targetLevel,
      )

    if (
      levelEntries.length === 0
    ) {
      return 10
    }

    return (
      Math.max(
        ...levelEntries.map(
          (entry) =>
            entry.sort_order,
        ),
      ) + 10
    )
  }

  const handleCreate = async (
    event: FormEvent<HTMLFormElement>,
  ) => {
    event.preventDefault()

    const cleanTitle =
      title.trim()

    if (!cleanTitle) {
      setError(
        'Le titre est obligatoire.',
      )

      return
    }

    setSubmitting(true)
    setError('')
    setSuccess('')

    const { error: insertError } =
      await supabase
        .from('iceberg_entries')
        .insert({
          title: cleanTitle,
          description:
            description.trim(),
          level,
          sort_order:
            getNextSortOrder(
              level,
            ),
          is_published:
            isPublished,
        })

    if (insertError) {
      console.error(
        'Unable to create iceberg entry:',
        insertError,
      )

      setError(
        "Impossible d'ajouter l'élément.",
      )

      setSubmitting(false)

      return
    }

    setTitle('')
    setDescription('')
    setLevel(1)
    setIsPublished(true)

    setSuccess(
      'Élément ajouté.',
    )

    await loadEntries()

    setSubmitting(false)
  }

  const startEditing = (
    entry: IcebergEntry,
  ) => {
    setEditingId(entry.id)

    setEditTitle(entry.title)

    setEditDescription(
      entry.description,
    )

    setEditLevel(entry.level)

    setEditPublished(
      entry.is_published,
    )

    setError('')
    setSuccess('')
  }

  const cancelEditing = () => {
    setEditingId(null)

    setEditTitle('')
    setEditDescription('')
  }

  const saveEditing =
    async () => {
      if (!editingId) {
        return
      }

      const entry =
        entries.find(
          (currentEntry) =>
            currentEntry.id ===
            editingId,
        )

      if (!entry) {
        return
      }

      const cleanTitle =
        editTitle.trim()

      if (!cleanTitle) {
        setError(
          'Le titre est obligatoire.',
        )

        return
      }

      setSubmitting(true)
      setError('')
      setSuccess('')

      const nextSortOrder =
        editLevel === entry.level
          ? entry.sort_order
          : getNextSortOrder(
              editLevel,
            )

      const {
        error: updateError,
      } = await supabase
        .from('iceberg_entries')
        .update({
          title: cleanTitle,
          description:
            editDescription.trim(),
          level: editLevel,
          sort_order:
            nextSortOrder,
          is_published:
            editPublished,
        })
        .eq('id', entry.id)

      if (updateError) {
        console.error(
          'Unable to update iceberg entry:',
          updateError,
        )

        setError(
          "Impossible de modifier l'élément.",
        )

        setSubmitting(false)

        return
      }

      setEditingId(null)

      setSuccess(
        'Modifications enregistrées.',
      )

      await loadEntries()

      setSubmitting(false)
    }

  const togglePublished =
    async (
      entry: IcebergEntry,
    ) => {
      setError('')
      setSuccess('')

      const {
        error: updateError,
      } = await supabase
        .from('iceberg_entries')
        .update({
          is_published:
            !entry.is_published,
        })
        .eq('id', entry.id)

      if (updateError) {
        console.error(
          'Unable to toggle iceberg entry:',
          updateError,
        )

        setError(
          'Impossible de changer la visibilité.',
        )

        return
      }

      await loadEntries()
    }

  const deleteEntry =
    async (
      entry: IcebergEntry,
    ) => {
      const shouldDelete =
        window.confirm(
          `Supprimer "${entry.title}" ?`,
        )

      if (!shouldDelete) {
        return
      }

      setError('')
      setSuccess('')

      const {
        error: deleteError,
      } = await supabase
        .from('iceberg_entries')
        .delete()
        .eq('id', entry.id)

      if (deleteError) {
        console.error(
          'Unable to delete iceberg entry:',
          deleteError,
        )

        setError(
          "Impossible de supprimer l'élément.",
        )

        return
      }

      if (
        editingId === entry.id
      ) {
        cancelEditing()
      }

      setSuccess(
        'Élément supprimé.',
      )

      await loadEntries()
    }

  const moveEntry =
    async (
      entry: IcebergEntry,
      direction:
        | 'up'
        | 'down',
    ) => {
      const levelEntries =
        entriesByLevel.get(
          entry.level,
        ) ?? []

      const currentIndex =
        levelEntries.findIndex(
          (currentEntry) =>
            currentEntry.id ===
            entry.id,
        )

      if (currentIndex === -1) {
        return
      }

      const targetIndex =
        direction === 'up'
          ? currentIndex - 1
          : currentIndex + 1

      if (
        targetIndex < 0 ||
        targetIndex >=
          levelEntries.length
      ) {
        return
      }

      const reordered = [
        ...levelEntries,
      ]

      const [movedEntry] =
        reordered.splice(
          currentIndex,
          1,
        )

      reordered.splice(
        targetIndex,
        0,
        movedEntry,
      )

      setError('')
      setSuccess('')

      const updates =
        reordered.map(
          (
            currentEntry,
            index,
          ) =>
            supabase
              .from(
                'iceberg_entries',
              )
              .update({
                sort_order:
                  (index + 1) *
                  10,
              })
              .eq(
                'id',
                currentEntry.id,
              ),
        )

      const results =
        await Promise.all(
          updates,
        )

      const failedResult =
        results.find(
          (result) =>
            result.error,
        )

      if (failedResult?.error) {
        console.error(
          'Unable to reorder iceberg:',
          failedResult.error,
        )

        setError(
          "Impossible de changer l'ordre.",
        )

        await loadEntries()

        return
      }

      await loadEntries()
    }

  if (
    authLoading ||
    loading
  ) {
    return (
      <main className="iceberg-admin-page">
        <div className="iceberg-admin-loading">
          Chargement de
          l&apos;administration...
        </div>
      </main>
    )
  }

  return (
    <main className="iceberg-admin-page">
      <div className="iceberg-admin-page__glow" />

      <header className="iceberg-admin-header">
        <div className="iceberg-admin-header__navigation">
          <Link
            to="/admin"
            className="back-link"
          >
            ← Admin
          </Link>

          <Link
            to="/iceberg"
            className="iceberg-admin-preview"
          >
            Voir la page publique ↗
          </Link>
        </div>

        <p className="iceberg-admin-eyebrow">
          Administration / Iceberg
        </p>

        <h1>
          Gérer
          <span>l&apos;Iceberg</span>
        </h1>

        <p className="iceberg-admin-header__description">
          Ajoute les anecdotes,
          classe-les par profondeur et
          décide lesquelles sont
          visibles publiquement.
        </p>
      </header>

      {error && (
        <div className="iceberg-admin-message iceberg-admin-message--error">
          {error}
        </div>
      )}

      {success && (
        <div className="iceberg-admin-message iceberg-admin-message--success">
          {success}
        </div>
      )}

      <section className="iceberg-admin-create">
        <div className="iceberg-admin-section-heading">
          <div>
            <p className="iceberg-admin-eyebrow">
              Nouvel élément
            </p>

            <h2>
              Ajouter une anecdote
            </h2>
          </div>
        </div>

        <form
          className="iceberg-admin-form"
          onSubmit={handleCreate}
        >
          <label className="iceberg-admin-field">
            <span>Titre</span>

            <input
              type="text"
              value={title}
              placeholder="Ex. Le fameux retour de Marseille"
              onChange={(event) =>
                setTitle(
                  event.target.value,
                )
              }
              required
            />
          </label>

          <label className="iceberg-admin-field iceberg-admin-field--full">
            <span>
              Explication
            </span>

            <textarea
              value={description}
              placeholder="L'histoire complète, le contexte, la punchline..."
              rows={5}
              onChange={(event) =>
                setDescription(
                  event.target.value,
                )
              }
            />
          </label>

          <label className="iceberg-admin-field">
            <span>Niveau</span>

            <select
              value={level}
              onChange={(event) =>
                setLevel(
                  Number(
                    event.target.value,
                  ) as IcebergLevel,
                )
              }
            >
              <option value={1}>
                1 — Surface
              </option>

              <option value={2}>
                2 — Sous la surface
              </option>

              <option value={3}>
                3 — Profondeurs
              </option>

              <option value={4}>
                4 — Abysses
              </option>

              <option value={5}>
                5 — Fond de
                l&apos;iceberg
              </option>
            </select>
          </label>

          <label className="iceberg-admin-switch">
            <input
              type="checkbox"
              checked={isPublished}
              onChange={(event) =>
                setIsPublished(
                  event.target
                    .checked,
                )
              }
            />

            <span className="iceberg-admin-switch__control" />

            <div>
              <strong>
                Publier
              </strong>

              <small>
                Visible par les
                invités
              </small>
            </div>
          </label>

          <div className="iceberg-admin-form__actions">
            <button
              type="submit"
              className="iceberg-admin-primary"
              disabled={submitting}
            >
              {submitting
                ? 'Ajout...'
                : 'Ajouter à l’iceberg'}
            </button>
          </div>
        </form>
      </section>

      <section className="iceberg-admin-content">
        <div className="iceberg-admin-section-heading">
          <div>
            <p className="iceberg-admin-eyebrow">
              Contenu
            </p>

            <h2>
              {entries.length}{' '}
              élément
              {entries.length > 1
                ? 's'
                : ''}
            </h2>
          </div>
        </div>

        {entries.length === 0 ? (
          <div className="iceberg-admin-empty">
            Aucun élément pour
            l&apos;instant.
          </div>
        ) : (
          <div className="iceberg-admin-levels">
            {(
              [
                1,
                2,
                3,
                4,
                5,
              ] as IcebergLevel[]
            ).map(
              (
                currentLevel,
              ) => {
                const levelEntries =
                  entriesByLevel.get(
                    currentLevel,
                  ) ?? []

                return (
                  <div
                    key={
                      currentLevel
                    }
                    className="iceberg-admin-level"
                  >
                    <div className="iceberg-admin-level__heading">
                      <span>
                        0
                        {
                          currentLevel
                        }
                      </span>

                      <div>
                        <h3>
                          {
                            levelNames[
                              currentLevel
                            ]
                          }
                        </h3>

                        <p>
                          {
                            levelEntries.length
                          }{' '}
                          élément
                          {levelEntries.length >
                          1
                            ? 's'
                            : ''}
                        </p>
                      </div>
                    </div>

                    {levelEntries.length ===
                    0 ? (
                      <div className="iceberg-admin-level__empty">
                        Niveau vide
                      </div>
                    ) : (
                      <div className="iceberg-admin-list">
                        {levelEntries.map(
                          (
                            entry,
                            index,
                          ) => {
                            const isEditing =
                              editingId ===
                              entry.id

                            return (
                              <article
                                key={
                                  entry.id
                                }
                                className={`iceberg-admin-entry ${
                                  !entry.is_published
                                    ? 'iceberg-admin-entry--hidden'
                                    : ''
                                }`}
                              >
                                {isEditing ? (
                                  <div className="iceberg-admin-edit">
                                    <label className="iceberg-admin-field">
                                      <span>
                                        Titre
                                      </span>

                                      <input
                                        type="text"
                                        value={
                                          editTitle
                                        }
                                        onChange={(
                                          event,
                                        ) =>
                                          setEditTitle(
                                            event
                                              .target
                                              .value,
                                          )
                                        }
                                      />
                                    </label>

                                    <label className="iceberg-admin-field iceberg-admin-field--full">
                                      <span>
                                        Explication
                                      </span>

                                      <textarea
                                        rows={
                                          5
                                        }
                                        value={
                                          editDescription
                                        }
                                        onChange={(
                                          event,
                                        ) =>
                                          setEditDescription(
                                            event
                                              .target
                                              .value,
                                          )
                                        }
                                      />
                                    </label>

                                    <label className="iceberg-admin-field">
                                      <span>
                                        Niveau
                                      </span>

                                      <select
                                        value={
                                          editLevel
                                        }
                                        onChange={(
                                          event,
                                        ) =>
                                          setEditLevel(
                                            Number(
                                              event
                                                .target
                                                .value,
                                            ) as IcebergLevel,
                                          )
                                        }
                                      >
                                        <option value={1}>
                                          1 — Surface
                                        </option>

                                        <option value={2}>
                                          2 — Sous la surface
                                        </option>

                                        <option value={3}>
                                          3 — Profondeurs
                                        </option>

                                        <option value={4}>
                                          4 — Abysses
                                        </option>

                                        <option value={5}>
                                          5 — Fond
                                        </option>
                                      </select>
                                    </label>

                                    <label className="iceberg-admin-switch">
                                      <input
                                        type="checkbox"
                                        checked={
                                          editPublished
                                        }
                                        onChange={(
                                          event,
                                        ) =>
                                          setEditPublished(
                                            event
                                              .target
                                              .checked,
                                          )
                                        }
                                      />

                                      <span className="iceberg-admin-switch__control" />

                                      <div>
                                        <strong>
                                          Publié
                                        </strong>

                                        <small>
                                          Visible
                                          publiquement
                                        </small>
                                      </div>
                                    </label>

                                    <div className="iceberg-admin-edit__actions">
                                      <button
                                        type="button"
                                        className="iceberg-admin-secondary"
                                        onClick={
                                          cancelEditing
                                        }
                                      >
                                        Annuler
                                      </button>

                                      <button
                                        type="button"
                                        className="iceberg-admin-primary"
                                        disabled={
                                          submitting
                                        }
                                        onClick={() =>
                                          void saveEditing()
                                        }
                                      >
                                        Enregistrer
                                      </button>
                                    </div>
                                  </div>
                                ) : (
                                  <>
                                    <div className="iceberg-admin-entry__main">
                                      <div className="iceberg-admin-entry__order">
                                        {String(
                                          index +
                                            1,
                                        ).padStart(
                                          2,
                                          '0',
                                        )}
                                      </div>

                                      <div className="iceberg-admin-entry__content">
                                        <div className="iceberg-admin-entry__title-line">
                                          <strong>
                                            {
                                              entry.title
                                            }
                                          </strong>

                                          <span
                                            className={
                                              entry.is_published
                                                ? 'iceberg-admin-status iceberg-admin-status--published'
                                                : 'iceberg-admin-status'
                                            }
                                          >
                                            {entry.is_published
                                              ? 'Publié'
                                              : 'Masqué'}
                                          </span>
                                        </div>

                                        {entry.description && (
                                          <p>
                                            {
                                              entry.description
                                            }
                                          </p>
                                        )}
                                      </div>
                                    </div>

                                    <div className="iceberg-admin-entry__actions">
                                      <div className="iceberg-admin-order-actions">
                                        <button
                                          type="button"
                                          disabled={
                                            index ===
                                            0
                                          }
                                          title="Monter"
                                          onClick={() =>
                                            void moveEntry(
                                              entry,
                                              'up',
                                            )
                                          }
                                        >
                                          ↑
                                        </button>

                                        <button
                                          type="button"
                                          disabled={
                                            index ===
                                            levelEntries.length -
                                              1
                                          }
                                          title="Descendre"
                                          onClick={() =>
                                            void moveEntry(
                                              entry,
                                              'down',
                                            )
                                          }
                                        >
                                          ↓
                                        </button>
                                      </div>

                                      <button
                                        type="button"
                                        className="iceberg-admin-action"
                                        onClick={() =>
                                          void togglePublished(
                                            entry,
                                          )
                                        }
                                      >
                                        {entry.is_published
                                          ? 'Masquer'
                                          : 'Publier'}
                                      </button>

                                      <button
                                        type="button"
                                        className="iceberg-admin-action"
                                        onClick={() =>
                                          startEditing(
                                            entry,
                                          )
                                        }
                                      >
                                        Modifier
                                      </button>

                                      <button
                                        type="button"
                                        className="iceberg-admin-action iceberg-admin-action--danger"
                                        onClick={() =>
                                          void deleteEntry(
                                            entry,
                                          )
                                        }
                                      >
                                        Supprimer
                                      </button>
                                    </div>
                                  </>
                                )}
                              </article>
                            )
                          },
                        )}
                      </div>
                    )}
                  </div>
                )
              },
            )}
          </div>
        )}
      </section>
    </main>
  )
}

export default IcebergAdmin