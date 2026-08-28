import {
  useCallback,
  useMemo,
  useState,
  useEffect,
  type FormEvent,
} from 'react'
import { Link } from 'react-router-dom'

import { supabase } from '../lib/supabase'

import './BingoAdmin.css'

type BingoPrompt = {
  id: string
  text: string
  sort_order: number
  is_active: boolean
  created_at: string
}

function BingoAdmin() {
  const [prompts, setPrompts] =
    useState<BingoPrompt[]>([])

  const [newPrompt, setNewPrompt] =
    useState('')

  const [search, setSearch] =
    useState('')

  const [loading, setLoading] =
    useState(true)

  const [savingId, setSavingId] =
    useState<string | null>(null)

  const [creating, setCreating] =
    useState(false)

  const [error, setError] =
    useState('')

  const loadPrompts =
    useCallback(async () => {
      const {
        data,
        error: loadError,
      } = await supabase
        .from('bingo_prompts')
        .select(
          'id, text, sort_order, is_active, created_at',
        )
        .order('sort_order', {
          ascending: true,
        })
        .order('created_at', {
          ascending: true,
        })

      if (loadError) {
        console.error(
          'Unable to load Bingo prompts:',
          loadError,
        )
        setError(
          'Impossible de charger les cases du Bingo.',
        )
        setLoading(false)
        return
      }

      setPrompts(
        (data ?? []) as BingoPrompt[],
      )
      setError('')
      setLoading(false)
    }, [])

  useEffect(() => {
    void loadPrompts()
  }, [loadPrompts])

  const activeCount =
    useMemo(
      () =>
        prompts.filter(
          (prompt) => prompt.is_active,
        ).length,
      [prompts],
    )

  const filteredPrompts =
    useMemo(() => {
      const query =
        search.trim().toLocaleLowerCase('fr')

      if (!query) {
        return prompts
      }

      return prompts.filter(
        (prompt) =>
          prompt.text
            .toLocaleLowerCase('fr')
            .includes(query),
      )
    }, [prompts, search])

  const handleCreate = async (
    event: FormEvent<HTMLFormElement>,
  ) => {
    event.preventDefault()

    const text = newPrompt.trim()

    if (!text || creating) {
      return
    }

    setCreating(true)
    setError('')

    const nextSortOrder =
      prompts.length === 0
        ? 10
        : Math.max(
            ...prompts.map(
              (prompt) =>
                prompt.sort_order,
            ),
          ) + 10

    const { error: createError } =
      await supabase
        .from('bingo_prompts')
        .insert({
          text,
          sort_order: nextSortOrder,
          is_active: true,
        })

    if (createError) {
      console.error(
        'Unable to create Bingo prompt:',
        createError,
      )
      setError(
        createError.code === '23505'
          ? 'Cette case existe déjà.'
          : 'Impossible d’ajouter cette case.',
      )
      setCreating(false)
      return
    }

    setNewPrompt('')
    await loadPrompts()
    setCreating(false)
  }

  const updateLocalText = (
    id: string,
    text: string,
  ) => {
    setPrompts((current) =>
      current.map((prompt) =>
        prompt.id === id
          ? {
              ...prompt,
              text,
            }
          : prompt,
      ),
    )
  }

  const saveText = async (
    prompt: BingoPrompt,
  ) => {
    const text = prompt.text.trim()

    if (!text) {
      setError(
        'Une case de Bingo ne peut pas être vide.',
      )
      await loadPrompts()
      return
    }

    setSavingId(prompt.id)
    setError('')

    const { error: updateError } =
      await supabase
        .from('bingo_prompts')
        .update({
          text,
          updated_at:
            new Date().toISOString(),
        })
        .eq('id', prompt.id)

    if (updateError) {
      console.error(
        'Unable to update Bingo prompt:',
        updateError,
      )
      setError(
        updateError.code === '23505'
          ? 'Une case identique existe déjà.'
          : 'Impossible d’enregistrer cette case.',
      )
      await loadPrompts()
    } else if (text !== prompt.text) {
      updateLocalText(
        prompt.id,
        text,
      )
    }

    setSavingId(null)
  }

  const toggleActive = async (
    prompt: BingoPrompt,
  ) => {
    setSavingId(prompt.id)
    setError('')

    const nextActive =
      !prompt.is_active

    const { error: updateError } =
      await supabase
        .from('bingo_prompts')
        .update({
          is_active: nextActive,
          updated_at:
            new Date().toISOString(),
        })
        .eq('id', prompt.id)

    if (updateError) {
      console.error(
        'Unable to toggle Bingo prompt:',
        updateError,
      )
      setError(
        'Impossible de modifier la visibilité de cette case.',
      )
    } else {
      setPrompts((current) =>
        current.map((item) =>
          item.id === prompt.id
            ? {
                ...item,
                is_active: nextActive,
              }
            : item,
        ),
      )
    }

    setSavingId(null)
  }

  const deletePrompt = async (
    prompt: BingoPrompt,
  ) => {
    if (
      !window.confirm(
        `Supprimer définitivement « ${prompt.text} » ? Les grilles déjà générées conserveront leur copie de la case.`,
      )
    ) {
      return
    }

    setSavingId(prompt.id)
    setError('')

    const { error: deleteError } =
      await supabase
        .from('bingo_prompts')
        .delete()
        .eq('id', prompt.id)

    if (deleteError) {
      console.error(
        'Unable to delete Bingo prompt:',
        deleteError,
      )
      setError(
        'Impossible de supprimer cette case.',
      )
    } else {
      setPrompts((current) =>
        current.filter(
          (item) =>
            item.id !== prompt.id,
        ),
      )
    }

    setSavingId(null)
  }

  return (
    <main className="bingo-admin-page">
      <header className="bingo-admin-header">
        <div className="bingo-admin-header__navigation">
          <Link
            to="/admin"
            className="back-link"
          >
            ← Control Room
          </Link>

          <Link
            to="/bingo"
            className="bingo-admin-preview"
          >
            Voir le Bingo ↗
          </Link>
        </div>

        <p className="bingo-admin-eyebrow">
          Anniv 2026 / privé
        </p>

        <h1>
          Bingo
          <span>Pool</span>
        </h1>

        <p className="bingo-admin-description">
          Les cases actives peuvent être tirées dans les
          nouvelles grilles. Une grille déjà générée garde
          ses phrases même si tu modifies ensuite le pool.
        </p>
      </header>

      <section className="bingo-admin-stats">
        <article>
          <span>Total</span>
          <strong>{prompts.length}</strong>
        </article>

        <article>
          <span>Actives</span>
          <strong>{activeCount}</strong>
        </article>

        <article>
          <span>Masquées</span>
          <strong>
            {prompts.length - activeCount}
          </strong>
        </article>
      </section>

      {activeCount < 16 && !loading && (
        <div className="bingo-admin-warning">
          Il faut au moins 16 cases actives pour permettre
          la génération d’une nouvelle grille.
        </div>
      )}

      {error && (
        <div
          className="bingo-admin-error"
          role="alert"
        >
          {error}
        </div>
      )}

      <section className="bingo-admin-create">
        <div className="bingo-admin-section-heading">
          <div>
            <p className="bingo-admin-eyebrow">
              Nouvelle case
            </p>
            <h2>Ajouter au pool</h2>
          </div>
        </div>

        <form
          className="bingo-admin-create__form"
          onSubmit={handleCreate}
        >
          <textarea
            value={newPrompt}
            onChange={(event) =>
              setNewPrompt(
                event.target.value,
              )
            }
            placeholder="Ex. Quelqu’un lance un karaoké 🎤"
            rows={3}
            maxLength={180}
            required
          />

          <div>
            <span>
              {newPrompt.trim().length}/180
            </span>

            <button
              type="submit"
              disabled={
                creating ||
                !newPrompt.trim()
              }
            >
              {creating
                ? 'Ajout...'
                : 'Ajouter la case'}
            </button>
          </div>
        </form>
      </section>

      <section className="bingo-admin-pool">
        <div className="bingo-admin-section-heading bingo-admin-section-heading--pool">
          <div>
            <p className="bingo-admin-eyebrow">
              Bibliothèque
            </p>
            <h2>Cases du Bingo</h2>
          </div>

          <span className="bingo-admin-result-count">
            {filteredPrompts.length}
          </span>
        </div>

        <label className="bingo-admin-search">
          <span>Rechercher</span>
          <input
            type="search"
            value={search}
            onChange={(event) =>
              setSearch(
                event.target.value,
              )
            }
            placeholder="Nom, situation, jeu..."
          />
        </label>

        {loading ? (
          <div className="bingo-admin-empty">
            Chargement du pool...
          </div>
        ) : filteredPrompts.length === 0 ? (
          <div className="bingo-admin-empty">
            Aucune case ne correspond à cette recherche.
          </div>
        ) : (
          <div className="bingo-admin-list">
            {filteredPrompts.map(
              (prompt, index) => (
                <article
                  key={prompt.id}
                  className={`bingo-admin-prompt ${
                    prompt.is_active
                      ? ''
                      : 'bingo-admin-prompt--inactive'
                  }`}
                >
                  <div className="bingo-admin-prompt__top">
                    <span className="bingo-admin-prompt__index">
                      {String(index + 1).padStart(3, '0')}
                    </span>

                    <span
                      className={`bingo-admin-prompt__status ${
                        prompt.is_active
                          ? 'bingo-admin-prompt__status--active'
                          : ''
                      }`}
                    >
                      {prompt.is_active
                        ? 'Active'
                        : 'Masquée'}
                    </span>
                  </div>

                  <textarea
                    value={prompt.text}
                    rows={2}
                    maxLength={180}
                    aria-label="Texte de la case"
                    onChange={(event) =>
                      updateLocalText(
                        prompt.id,
                        event.target.value,
                      )
                    }
                    onBlur={() => {
                      void saveText(prompt)
                    }}
                  />

                  <div className="bingo-admin-prompt__actions">
                    <button
                      type="button"
                      onClick={() => {
                        void toggleActive(prompt)
                      }}
                      disabled={savingId === prompt.id}
                    >
                      {prompt.is_active
                        ? 'Masquer'
                        : 'Activer'}
                    </button>

                    <button
                      type="button"
                      className="bingo-admin-prompt__delete"
                      onClick={() => {
                        void deletePrompt(prompt)
                      }}
                      disabled={savingId === prompt.id}
                    >
                      Supprimer
                    </button>
                  </div>
                </article>
              ),
            )}
          </div>
        )}
      </section>
    </main>
  )
}

export default BingoAdmin
