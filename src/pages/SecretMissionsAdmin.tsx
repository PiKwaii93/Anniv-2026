import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react'
import { Link } from 'react-router-dom'

import { supabase } from '../lib/supabase'

import './SecretMissionsAdmin.css'

type MissionDifficulty =
  | 'easy'
  | 'medium'
  | 'hard'

type PromptRow = {
  id: string
  text: string
  difficulty: MissionDifficulty
  sort_order: number
  is_active: boolean
  created_at: string
  updated_at: string
}

type PlayerRow = {
  id: string
  player_key: string
  player_name: string
  current_prompt_id: string | null
  completed_count: number
  skips_used: number
  created_at: string
  updated_at: string
}

const difficultyLabels: Record<
  MissionDifficulty,
  string
> = {
  easy: 'Facile',
  medium: 'Intermédiaire',
  hard: 'Difficile',
}

function SecretMissionsAdmin() {
  const [prompts, setPrompts] =
    useState<PromptRow[]>([])

  const [players, setPlayers] =
    useState<PlayerRow[]>([])

  const [loading, setLoading] =
    useState(true)

  const [saving, setSaving] =
    useState(false)

  const [error, setError] =
    useState('')

  const [search, setSearch] =
    useState('')

  const [newText, setNewText] =
    useState('')

  const [newDifficulty, setNewDifficulty] =
    useState<MissionDifficulty>('medium')

  const [editingId, setEditingId] =
    useState<string | null>(null)

  const [editingText, setEditingText] =
    useState('')

  const [editingDifficulty, setEditingDifficulty] =
    useState<MissionDifficulty>('medium')

  const loadData = useCallback(async () => {
    const [
      promptResult,
      playerResult,
    ] = await Promise.all([
      supabase
        .from('secret_mission_prompts')
        .select(
          'id, text, difficulty, sort_order, is_active, created_at, updated_at',
        )
        .order('sort_order', {
          ascending: true,
        })
        .order('created_at', {
          ascending: true,
        }),
      supabase
        .from('secret_mission_players')
        .select(
          'id, player_key, player_name, current_prompt_id, completed_count, skips_used, created_at, updated_at',
        )
        .order('completed_count', {
          ascending: false,
        })
        .order('player_name', {
          ascending: true,
        }),
    ])

    let failed = false

    if (promptResult.error) {
      console.error(
        'Unable to load mission prompts:',
        promptResult.error,
      )
      failed = true
    } else {
      setPrompts(
        (promptResult.data ?? []) as PromptRow[],
      )
    }

    if (playerResult.error) {
      console.error(
        'Unable to load mission players:',
        playerResult.error,
      )
      failed = true
    } else {
      setPlayers(
        (playerResult.data ?? []) as PlayerRow[],
      )
    }

    setError(
      failed
        ? 'Certaines données des Missions secrètes n’ont pas pu être chargées.'
        : '',
    )
    setLoading(false)
  }, [])

  useEffect(() => {
    void loadData()

    const interval = window.setInterval(
      () => {
        void loadData()
      },
      15000,
    )

    const handleVisibilityChange = () => {
      if (
        document.visibilityState === 'visible'
      ) {
        void loadData()
      }
    }

    document.addEventListener(
      'visibilitychange',
      handleVisibilityChange,
    )

    return () => {
      window.clearInterval(interval)
      document.removeEventListener(
        'visibilitychange',
        handleVisibilityChange,
      )
    }
  }, [loadData])

  const promptById = useMemo(
    () =>
      new Map(
        prompts.map((prompt) => [
          prompt.id,
          prompt,
        ]),
      ),
    [prompts],
  )

  const filteredPrompts = useMemo(() => {
    const query = search
      .trim()
      .toLocaleLowerCase('fr')

    if (!query) {
      return prompts
    }

    return prompts.filter((prompt) =>
      prompt.text
        .toLocaleLowerCase('fr')
        .includes(query),
    )
  }, [prompts, search])

  const activeCount = useMemo(
    () =>
      prompts.filter(
        (prompt) => prompt.is_active,
      ).length,
    [prompts],
  )

  const totalCompleted = useMemo(
    () =>
      players.reduce(
        (total, player) =>
          total + player.completed_count,
        0,
      ),
    [players],
  )

  const addPrompt = async () => {
    const cleanText = newText.trim()

    if (!cleanText || saving) {
      return
    }

    setSaving(true)
    setError('')

    const nextOrder =
      prompts.reduce(
        (maximum, prompt) =>
          Math.max(
            maximum,
            prompt.sort_order,
          ),
        0,
      ) + 10

    const { error: insertError } =
      await supabase
        .from('secret_mission_prompts')
        .insert({
          text: cleanText,
          difficulty: newDifficulty,
          sort_order: nextOrder,
          is_active: true,
        })

    setSaving(false)

    if (insertError) {
      console.error(
        'Unable to add mission prompt:',
        insertError,
      )
      setError(
        insertError.code === '23505'
          ? 'Cette mission existe déjà.'
          : 'Impossible d’ajouter cette mission.',
      )
      return
    }

    setNewText('')
    setNewDifficulty('medium')
    await loadData()
  }

  const togglePrompt = async (
    prompt: PromptRow,
  ) => {
    if (saving) {
      return
    }

    setSaving(true)
    setError('')

    const { error: updateError } =
      await supabase
        .from('secret_mission_prompts')
        .update({
          is_active: !prompt.is_active,
          updated_at: new Date().toISOString(),
        })
        .eq('id', prompt.id)

    setSaving(false)

    if (updateError) {
      console.error(
        'Unable to toggle mission prompt:',
        updateError,
      )
      setError(
        'Impossible de modifier la visibilité de cette mission.',
      )
      return
    }

    await loadData()
  }

  const startEditing = (
    prompt: PromptRow,
  ) => {
    setEditingId(prompt.id)
    setEditingText(prompt.text)
    setEditingDifficulty(prompt.difficulty)
  }

  const savePrompt = async (
    promptId: string,
  ) => {
    const cleanText = editingText.trim()

    if (!cleanText || saving) {
      return
    }

    setSaving(true)
    setError('')

    const { error: updateError } =
      await supabase
        .from('secret_mission_prompts')
        .update({
          text: cleanText,
          difficulty: editingDifficulty,
          updated_at: new Date().toISOString(),
        })
        .eq('id', promptId)

    setSaving(false)

    if (updateError) {
      console.error(
        'Unable to update mission prompt:',
        updateError,
      )
      setError(
        updateError.code === '23505'
          ? 'Une mission identique existe déjà.'
          : 'Impossible de modifier cette mission.',
      )
      return
    }

    setEditingId(null)
    await loadData()
  }

  const deletePrompt = async (
    prompt: PromptRow,
  ) => {
    if (
      saving ||
      !window.confirm(
        'Supprimer définitivement cette mission du pool ?',
      )
    ) {
      return
    }

    setSaving(true)
    setError('')

    const { error: deleteError } =
      await supabase
        .from('secret_mission_prompts')
        .delete()
        .eq('id', prompt.id)

    setSaving(false)

    if (deleteError) {
      console.error(
        'Unable to delete mission prompt:',
        deleteError,
      )
      setError(
        'Impossible de supprimer cette mission.',
      )
      return
    }

    if (editingId === prompt.id) {
      setEditingId(null)
    }

    await loadData()
  }

  const resetPlayer = async (
    player: PlayerRow,
  ) => {
    if (
      saving ||
      !window.confirm(
        `Réinitialiser ${player.player_name} ? Son score, son historique et sa mission actuelle seront effacés.`,
      )
    ) {
      return
    }

    setSaving(true)
    setError('')

    const { error: deleteError } =
      await supabase
        .from('secret_mission_players')
        .delete()
        .eq('id', player.id)

    setSaving(false)

    if (deleteError) {
      console.error(
        'Unable to reset mission player:',
        deleteError,
      )
      setError(
        'Impossible de réinitialiser ce joueur.',
      )
      return
    }

    await loadData()
  }

  return (
    <main className="missions-admin-page">
      <header className="missions-admin-header">
        <div className="missions-admin-header__navigation">
          <Link
            to="/admin"
            className="back-link"
          >
            ← Control Room
          </Link>

          <Link
            to="/missions"
            className="missions-admin-public-link"
          >
            Voir le jeu ↗
          </Link>
        </div>

        <p className="missions-admin-eyebrow">
          Anniv 2026 / privé
        </p>

        <h1>
          Missions
          <span>secrètes</span>
        </h1>

        <p>
          Gère le pool, les difficultés et les identités verrouillées sur les téléphones.
        </p>
      </header>

      {error && (
        <div className="missions-admin-error">
          {error}
        </div>
      )}

      <section className="missions-admin-stats">
        <article>
          <span>Pool</span>
          <strong>{prompts.length}</strong>
          <small>{activeCount} actives</small>
        </article>

        <article>
          <span>Agents</span>
          <strong>{players.length}</strong>
          <small>identités liées</small>
        </article>

        <article>
          <span>Réussites</span>
          <strong>{totalCompleted}</strong>
          <small>missions validées</small>
        </article>
      </section>

      <section className="missions-admin-section">
        <div className="missions-admin-section__heading">
          <div>
            <p className="missions-admin-eyebrow">
              Nouveau défi
            </p>
            <h2>Ajouter une mission</h2>
          </div>
        </div>

        <div className="missions-admin-create">
          <textarea
            value={newText}
            placeholder="Ex. Fais dire « c’est pas faux » à quelqu’un sans expliquer pourquoi."
            disabled={saving}
            onChange={(event) =>
              setNewText(event.target.value)
            }
          />

          <div>
            <select
              value={newDifficulty}
              disabled={saving}
              aria-label="Difficulté"
              onChange={(event) =>
                setNewDifficulty(
                  event.target.value as MissionDifficulty,
                )
              }
            >
              <option value="easy">Facile</option>
              <option value="medium">Intermédiaire</option>
              <option value="hard">Difficile</option>
            </select>

            <button
              type="button"
              disabled={
                saving ||
                newText.trim().length === 0
              }
              onClick={() => {
                void addPrompt()
              }}
            >
              Ajouter au pool
            </button>
          </div>
        </div>
      </section>

      <section className="missions-admin-section">
        <div className="missions-admin-section__heading missions-admin-section__heading--search">
          <div>
            <p className="missions-admin-eyebrow">
              Contenu
            </p>
            <h2>Pool de missions</h2>
          </div>

          <input
            type="search"
            value={search}
            placeholder="Rechercher..."
            onChange={(event) =>
              setSearch(event.target.value)
            }
          />
        </div>

        {loading ? (
          <div className="missions-admin-empty">
            Chargement des missions...
          </div>
        ) : filteredPrompts.length === 0 ? (
          <div className="missions-admin-empty">
            Aucune mission ne correspond à cette recherche.
          </div>
        ) : (
          <div className="missions-admin-prompt-list">
            {filteredPrompts.map((prompt) => {
              const editing =
                editingId === prompt.id

              return (
                <article
                  key={prompt.id}
                  className={`missions-admin-prompt ${
                    prompt.is_active
                      ? ''
                      : 'missions-admin-prompt--inactive'
                  }`}
                >
                  <div className="missions-admin-prompt__meta">
                    <span
                      className={`missions-admin-difficulty missions-admin-difficulty--${prompt.difficulty}`}
                    >
                      {difficultyLabels[prompt.difficulty]}
                    </span>

                    <span>
                      {prompt.is_active
                        ? 'Active'
                        : 'Masquée'}
                    </span>
                  </div>

                  {editing ? (
                    <div className="missions-admin-prompt__edit">
                      <textarea
                        value={editingText}
                        onChange={(event) =>
                          setEditingText(
                            event.target.value,
                          )
                        }
                      />

                      <select
                        value={editingDifficulty}
                        onChange={(event) =>
                          setEditingDifficulty(
                            event.target.value as MissionDifficulty,
                          )
                        }
                      >
                        <option value="easy">Facile</option>
                        <option value="medium">Intermédiaire</option>
                        <option value="hard">Difficile</option>
                      </select>
                    </div>
                  ) : (
                    <p>{prompt.text}</p>
                  )}

                  <div className="missions-admin-prompt__actions">
                    {editing ? (
                      <>
                        <button
                          type="button"
                          disabled={saving}
                          onClick={() =>
                            setEditingId(null)
                          }
                        >
                          Annuler
                        </button>

                        <button
                          type="button"
                          disabled={
                            saving ||
                            editingText.trim().length === 0
                          }
                          onClick={() => {
                            void savePrompt(prompt.id)
                          }}
                        >
                          Enregistrer
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          type="button"
                          disabled={saving}
                          onClick={() =>
                            startEditing(prompt)
                          }
                        >
                          Modifier
                        </button>

                        <button
                          type="button"
                          disabled={saving}
                          onClick={() => {
                            void togglePrompt(prompt)
                          }}
                        >
                          {prompt.is_active
                            ? 'Masquer'
                            : 'Activer'}
                        </button>

                        <button
                          type="button"
                          className="missions-admin-danger"
                          disabled={saving}
                          onClick={() => {
                            void deletePrompt(prompt)
                          }}
                        >
                          Supprimer
                        </button>
                      </>
                    )}
                  </div>
                </article>
              )
            })}
          </div>
        )}
      </section>

      <section className="missions-admin-section">
        <div className="missions-admin-section__heading">
          <div>
            <p className="missions-admin-eyebrow">
              Partie en cours
            </p>
            <h2>Agents</h2>
          </div>
        </div>

        {players.length === 0 ? (
          <div className="missions-admin-empty">
            Aucun joueur n’a encore choisi son identité.
          </div>
        ) : (
          <div className="missions-admin-player-list">
            {players.map((player) => {
              const currentPrompt =
                player.current_prompt_id
                  ? promptById.get(
                      player.current_prompt_id,
                    )
                  : undefined

              return (
                <article
                  key={player.id}
                  className="missions-admin-player"
                >
                  <div className="missions-admin-player__top">
                    <div>
                      <strong>
                        {player.player_name}
                      </strong>
                      <span>
                        {player.completed_count} réussite{player.completed_count !== 1 ? 's' : ''}
                        {' · '}
                        Joker {player.skips_used > 0 ? 'utilisé' : 'disponible'}
                      </span>
                    </div>

                    <button
                      type="button"
                      className="missions-admin-danger"
                      disabled={saving}
                      onClick={() => {
                        void resetPlayer(player)
                      }}
                    >
                      Réinitialiser
                    </button>
                  </div>

                  <div className="missions-admin-player__mission">
                    <span>Mission actuelle</span>
                    <p>
                      {currentPrompt?.text ??
                        'Aucune mission assignée actuellement.'}
                    </p>
                  </div>
                </article>
              )
            })}
          </div>
        )}
      </section>
    </main>
  )
}

export default SecretMissionsAdmin
