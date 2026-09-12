import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../features/auth/AuthContext'
import { usePartyIdentity } from '../features/identity/PartyIdentityContext'
import { supabase } from '../lib/supabase'

import './Bingo.css'

type BingoPrompt = {
  id: string
  text: string
}

type BingoCell = {
  promptId: string
  text: string
  checked: boolean
}

type BingoGameState = {
  version: 1
  id?: string
  cells: BingoCell[]
  createdAt: string
  fullHouseAnnouncement?: 'pending' | 'sent'
}

const GRID_SIZE = 4
const TOTAL_CELLS = GRID_SIZE * GRID_SIZE
const STORAGE_KEY = 'anniv-2026-bingo-v1'

function createGridId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }

  const bytes = new Uint8Array(16)
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    crypto.getRandomValues(bytes)
  } else {
    for (let index = 0; index < bytes.length; index += 1) {
      bytes[index] = Math.floor(Math.random() * 256)
    }
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const value = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20)}`
}

const winningLines = [
  [0, 1, 2, 3],
  [4, 5, 6, 7],
  [8, 9, 10, 11],
  [12, 13, 14, 15],
  [0, 4, 8, 12],
  [1, 5, 9, 13],
  [2, 6, 10, 14],
  [3, 7, 11, 15],
  [0, 5, 10, 15],
  [3, 6, 9, 12],
] as const

function isStoredGame(
  value: unknown,
): value is BingoGameState {
  if (
    !value ||
    typeof value !== 'object'
  ) {
    return false
  }

  const candidate =
    value as Partial<BingoGameState>

  if (
    candidate.version !== 1 ||
    !Array.isArray(candidate.cells) ||
    candidate.cells.length !== TOTAL_CELLS ||
    typeof candidate.createdAt !== 'string'
  ) {
    return false
  }

  return candidate.cells.every(
    (cell) =>
      Boolean(cell) &&
      typeof cell.promptId === 'string' &&
      typeof cell.text === 'string' &&
      typeof cell.checked === 'boolean',
  )
}

function loadStoredGame() {
  try {
    const raw =
      window.localStorage.getItem(
        STORAGE_KEY,
      )

    if (!raw) {
      return null
    }

    const parsed: unknown =
      JSON.parse(raw)

    return isStoredGame(parsed)
      ? parsed
      : null
  } catch (error) {
    console.error(
      'Unable to restore Bingo grid:',
      error,
    )

    return null
  }
}

function saveGame(
  game: BingoGameState,
) {
  try {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(game),
    )
  } catch (error) {
    console.error(
      'Unable to save Bingo grid:',
      error,
    )
  }
}

function randomIndex(
  maxExclusive: number,
) {
  if (
    typeof crypto !== 'undefined' &&
    typeof crypto.getRandomValues === 'function'
  ) {
    const values =
      new Uint32Array(1)

    crypto.getRandomValues(values)

    return values[0] % maxExclusive
  }

  return Math.floor(
    Math.random() * maxExclusive,
  )
}

function shuffled<T>(
  values: T[],
) {
  const result = [...values]

  for (
    let index = result.length - 1;
    index > 0;
    index -= 1
  ) {
    const swapIndex =
      randomIndex(index + 1)

    ;[
      result[index],
      result[swapIndex],
    ] = [
      result[swapIndex],
      result[index],
    ]
  }

  return result
}

function createGame(
  prompts: BingoPrompt[],
): BingoGameState {
  return {
    version: 1,
    id: createGridId(),
    createdAt:
      new Date().toISOString(),
    cells: shuffled(prompts)
      .slice(0, TOTAL_CELLS)
      .map((prompt) => ({
        promptId: prompt.id,
        text: prompt.text,
        checked: false,
      })),
  }
}

function getLengthClass(
  text: string,
) {
  if (text.length >= 68) {
    return 'bingo-cell--very-long'
  }

  if (text.length >= 48) {
    return 'bingo-cell--long'
  }

  return ''
}

function Bingo() {
  const [view, setView] = useState<'grid' | 'list'>('grid')
  const { isAdmin } = useAuth()
  const { identity } = usePartyIdentity()

  const [prompts, setPrompts] =
    useState<BingoPrompt[]>([])

  const [game, setGame] =
    useState<BingoGameState | null>(
      () => loadStoredGame(),
    )

  const [loading, setLoading] =
    useState(true)

  const [error, setError] =
    useState('')

  const announcementInFlightRef = useRef(false)

  const loadPrompts =
    useCallback(async () => {
      const {
        data,
        error: loadError,
      } = await supabase
        .from('bingo_prompts')
        .select('id, text')
        .eq('is_active', true)
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
          'Impossible de synchroniser le pool du Bingo. Une grille déjà enregistrée reste jouable.',
        )
        setLoading(false)
        return
      }

      const nextPrompts =
        (data ?? []) as BingoPrompt[]

      setPrompts(nextPrompts)

      if (
        nextPrompts.length >= TOTAL_CELLS
      ) {
        setGame((currentGame) => {
          if (currentGame) {
            return currentGame
          }

          const nextGame =
            createGame(nextPrompts)

          saveGame(nextGame)
          return nextGame
        })
      }

      setError(
        nextPrompts.length < TOTAL_CELLS
          ? `Le Bingo a besoin d'au moins ${TOTAL_CELLS} cases actives.`
          : '',
      )

      setLoading(false)
    }, [])

  useEffect(() => {
    void loadPrompts()
  }, [loadPrompts])

  const checkedCount =
    useMemo(
      () =>
        game?.cells.filter(
          (cell) => cell.checked,
        ).length ?? 0,
      [game],
    )

  const completedLines =
    useMemo(() => {
      if (!game) {
        return []
      }

      return winningLines.filter(
        (line) =>
          line.every(
            (index) =>
              game.cells[index]
                ?.checked,
          ),
      )
    }, [game])

  const winningIndexes =
    useMemo(
      () =>
        new Set<number>(
          completedLines.flatMap(
            (line) => [...line],
          ),
        ),
      [completedLines],
    )

  const isFullHouse =
    checkedCount === TOTAL_CELLS

  const announceFullHouse = useCallback(async (completedGame: BingoGameState) => {
    if (announcementInFlightRef.current || completedGame.fullHouseAnnouncement !== 'pending') return

    if (!identity) {
      console.warn('[Bingo][FULL_HOUSE_WITHOUT_IDENTITY]')
      return
    }

    const gridId = completedGame.id ?? createGridId()
    announcementInFlightRef.current = true
    const { error: announcementError } = await supabase.rpc('complete_bingo_grid', {
      p_grid_id: gridId,
      p_player_key: identity.playerKey,
      p_session_token: identity.sessionToken,
    })
    announcementInFlightRef.current = false

    if (announcementError) {
      console.error('[Bingo][FULL_HOUSE_ANNOUNCEMENT_ERROR]', announcementError)
      return
    }

    setGame((current) => {
      if (!current || (current.id ?? gridId) !== gridId) return current
      const acknowledged = {
        ...current,
        id: gridId,
        fullHouseAnnouncement: 'sent' as const,
      }
      saveGame(acknowledged)
      return acknowledged
    })
  }, [identity])

  useEffect(() => {
    if (game?.fullHouseAnnouncement !== 'pending') return

    void announceFullHouse(game)
    const retry = window.setInterval(() => void announceFullHouse(game), 10_000)
    return () => window.clearInterval(retry)
  }, [announceFullHouse, game])

  const toggleCell = (
    index: number,
  ) => {
    if (!game) {
      return
    }

    const cells = game.cells.map(
      (cell, cellIndex) =>
        cellIndex === index
          ? {
              ...cell,
              checked:
                !cell.checked,
            }
          : cell,
    )

    const wasFullHouse = game.cells.every((cell) => cell.checked)
    const becomesFullHouse = cells.every((cell) => cell.checked)
    const nextGame: BingoGameState = {
      ...game,
      id: game.id ?? createGridId(),
      cells,
      fullHouseAnnouncement: !wasFullHouse && becomesFullHouse
        ? 'pending'
        : game.fullHouseAnnouncement,
    }

    setGame(nextGame)
    saveGame(nextGame)
  }

  const handleNewGrid = () => {
    if (
      prompts.length < TOTAL_CELLS
    ) {
      setError(
        `Il faut au moins ${TOTAL_CELLS} cases actives pour créer une grille.`,
      )
      return
    }

    if (
      game &&
      !window.confirm(
        'Générer une nouvelle grille ? Ta progression actuelle sera effacée sur cet appareil.',
      )
    ) {
      return
    }

    const nextGame =
      createGame(prompts)

    setGame(nextGame)
    saveGame(nextGame)
    setError('')
  }

  return (
    <main className="bingo-page">
      <div className="bingo-page__glow bingo-page__glow--one" />
      <div className="bingo-page__glow bingo-page__glow--two" />

      <header className="bingo-header">
        <div className="bingo-header__navigation">
          <Link
            to="/"
            className="back-link"
          >
            ← Accueil
          </Link>

          {isAdmin && (
            <Link
              to="/admin/bingo"
              className="bingo-admin-link"
            >
              Gérer les cases
            </Link>
          )}
        </div>

        <p className="bingo-eyebrow">
          Anniv 2026 / Observation
        </p>

        <div className="bingo-header__title-row">
          <div>
            <h1>Bingo</h1>

            <p>
              Coche une case quand la scène arrive.
              Une ligne, une colonne ou une diagonale
              complète fait Bingo.
            </p>
          </div>

          <div className="bingo-score" aria-label="Progression">
            <strong>{checkedCount}</strong>
            <span>/ {TOTAL_CELLS}</span>
          </div>
        </div>

        <div className="bingo-progress" aria-hidden="true">
          <span style={{ width: `${(checkedCount / TOTAL_CELLS) * 100}%` }} />
        </div>
      </header>

      {error && (
        <div className="bingo-message bingo-message--error">
          {error}
        </div>
      )}

      {isFullHouse ? (
        <section className="bingo-victory bingo-victory--full">
          <span>16 / 16</span>
          <strong>Carton plein.</strong>
          <p>
            Tu as littéralement tout vu.
          </p>
        </section>
      ) : completedLines.length > 0 ? (
        <section className="bingo-victory">
          <span>
            {completedLines.length}{' '}
            ligne{completedLines.length > 1 ? 's' : ''}
          </span>
          <strong>BINGO !</strong>
          <p>
            Continue : le carton plein reste possible.
          </p>
        </section>
      ) : null}

      <div className="guest-tabs bingo-view-switcher" aria-label="Présentation du Bingo">
        <button type="button" aria-pressed={view === 'grid'} onClick={() => setView('grid')}>Grille 4 × 4</button>
        <button type="button" aria-pressed={view === 'list'} onClick={() => setView('list')}>Liste lisible</button>
      </div>
      <p className="guest-empty bingo-view-help">{view === 'grid' ? 'Touche une case pour la cocher ou la décocher.' : 'Les mêmes 16 cases, dans le même ordre. Coche une situation lorsqu’elle arrive.'}</p>
      <section className="bingo-board-shell">
        {loading && !game ? (
          <div className="bingo-loading">
            Préparation de ta grille...
          </div>
        ) : game ? (
          <div
            className={view === 'grid' ? 'bingo-grid' : 'bingo-readable-list'}
            aria-label={view === 'grid' ? 'Grille de Bingo 4 par 4' : 'Les 16 situations de ta grille'}
          >
            {game.cells.map(
              (cell, index) => {
                const isWinning =
                  winningIndexes.has(index)

                return (
                  <button
                    key={`${cell.promptId}-${index}`}
                    type="button"
                    className={`bingo-cell ${
                      cell.checked
                        ? 'bingo-cell--checked'
                        : ''
                    } ${
                      isWinning
                        ? 'bingo-cell--winning'
                        : ''
                    } ${getLengthClass(cell.text)}`}
                    aria-label={`${index + 1}. ${cell.text}${cell.checked ? ' · cochée' : ''}`}
                    aria-pressed={cell.checked}
                    onClick={() => toggleCell(index)}
                  >
                    <span className="bingo-cell__number">
                      {String(index + 1).padStart(2, '0')}
                    </span>

                    <span className="bingo-cell__text">
                      {cell.text}
                    </span>

                    <span
                      className="bingo-cell__check"
                      aria-hidden="true"
                    >
                      {cell.checked ? '✓' : ''}
                    </span>
                  </button>
                )
              },
            )}
          </div>
        ) : (
          <div className="bingo-loading">
            Bingo indisponible pour le moment.
          </div>
        )}
      </section>

      <section className="bingo-footer-panel">
        <div>
          <span>Ta grille</span>
          <strong>
            {completedLines.length === 0
              ? 'Aucun Bingo pour l’instant'
              : `${completedLines.length} Bingo${
                  completedLines.length > 1
                    ? 's'
                    : ''
                }`}
          </strong>
        </div>

        <button
          type="button"
          className="bingo-new-grid"
          onClick={handleNewGrid}
          disabled={
            loading ||
            prompts.length < TOTAL_CELLS
          }
        >
          Nouvelle grille
        </button>
      </section>

      <p className="bingo-local-note">
        Cette grille est personnelle et reste enregistrée
        uniquement sur cet appareil.
      </p>
    </main>
  )
}

export default Bingo
