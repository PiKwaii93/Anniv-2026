import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react'
import { Link } from 'react-router-dom'

import { useGuests } from '../features/guests/GuestsContext'
import { supabase } from '../lib/supabase'

import './LiveVoteRoomAdmin.css'

type VoteMode = 'likely' | 'majority' | 'predict' | 'who_said'
type VoteStage = 'single' | 'nomination' | 'final'

type QuestionRow = {
  id: string
  mode: VoteMode
  prompt: string
  options: string[]
  correct_player_key: string | null
  suspects: Array<{ key: string; label: string }>
  reveal_note: string
  timer_seconds: number | null
  sort_order: number
  is_active: boolean
}

type PlayerRow = {
  player_key: string
  player_name: string
  score: number
  last_seen_at: string
}

type PublicState = {
  phase: 'idle' | 'open' | 'revealed'
  roundId: string | null
  mode?: VoteMode
  prompt?: string
  stage?: VoteStage
  voteCount?: number
  closesAt?: string | null
  result?: { totalVotes?: number } | null
}

type AvailablePlayer = {
  key: string
  name: string
  detail: string
}

type RpcResult = {
  ok: boolean
  code?: string
}

const modeCopy: Record<VoteMode, { label: string; detail: string }> = {
  likely: {
    label: '🔥 Plus susceptible de…',
    detail: 'Nominations libres parmi tous les participants, puis finale automatique à 4.',
  },
  majority: {
    label: '⚖️ Majority Rules',
    detail: '2 à 4 réponses. Chacun donne son propre choix, puis la salle découvre la majorité.',
  },
  predict: {
    label: '🎯 Devine le groupe',
    detail: '2 à 4 réponses. +1 point aux joueurs qui avaient prédit la réponse majoritaire.',
  },
  who_said: {
    label: '🕵️ Qui a répondu ça ?',
    detail: 'Une bonne personne + 3 à 5 faux suspects crédibles. +1 point si trouvé.',
  },
}

function adminError(code?: string) {
  switch (code) {
    case 'ROUND_ALREADY_OPEN': return 'Un round est déjà ouvert. Révèle-le ou passe-le avant d’en lancer un autre.'
    case 'NOT_ENOUGH_NOMINATIONS': return 'Il faut au moins deux personnes différentes nommées avant la finale.'
    case 'FINAL_NOT_STARTED': return 'Passe d’abord des nominations à la finale.'
    case 'INVALID_OPTIONS': return 'Cette question doit contenir entre 2 et 4 choix.'
    case 'INVALID_SUSPECTS': return 'Il faut entre 4 et 6 suspects.'
    case 'INVALID_CORRECT_ANSWER': return 'La bonne réponse doit faire partie des suspects.'
    default: return 'L’action n’a pas pu être effectuée.'
  }
}

function LiveVoteRoomAdmin() {
  const { guests } = useGuests()
  const [questions, setQuestions] = useState<QuestionRow[]>([])
  const [players, setPlayers] = useState<PlayerRow[]>([])
  const [publicState, setPublicState] = useState<PublicState>({ phase: 'idle', roundId: null })
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [mode, setMode] = useState<VoteMode>('likely')
  const [prompt, setPrompt] = useState('')
  const [optionsText, setOptionsText] = useState('')
  const [revealNote, setRevealNote] = useState('')
  const [timer, setTimer] = useState('30')
  const [correctPlayerKey, setCorrectPlayerKey] = useState('')
  const [suspectKeys, setSuspectKeys] = useState<string[]>([])
  const [suspectSearch, setSuspectSearch] = useState('')

  const availablePlayers = useMemo<AvailablePlayer[]>(() => {
    const rows: AvailablePlayer[] = []
    guests
      .filter((guest) => guest.status === 'confirmed')
      .forEach((guest) => {
        rows.push({ key: `guest:${guest.id}`, name: guest.name, detail: 'Invité' })
        guest.plusOnes.forEach((plusOne) => {
          rows.push({ key: `plus:${plusOne.id}`, name: plusOne.name, detail: `+1 de ${guest.name}` })
        })
      })
    return rows.sort((a, b) => a.name.localeCompare(b.name, 'fr', { sensitivity: 'base' }))
  }, [guests])

  const playerMap = useMemo(() => new Map(availablePlayers.map((player) => [player.key, player])), [availablePlayers])

  const loadData = useCallback(async () => {
    const [questionResult, playerResult, stateResult] = await Promise.all([
      supabase
        .from('live_vote_questions')
        .select('id, mode, prompt, options, correct_player_key, suspects, reveal_note, timer_seconds, sort_order, is_active')
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: true }),
      supabase
        .from('live_vote_players')
        .select('player_key, player_name, score, last_seen_at')
        .order('score', { ascending: false })
        .order('player_name', { ascending: true }),
      supabase
        .from('live_vote_public_state')
        .select('state')
        .eq('id', 'main')
        .single(),
    ])

    if (questionResult.error || playerResult.error || stateResult.error) {
      console.error('Unable to load live vote admin:', questionResult.error, playerResult.error, stateResult.error)
      setError('Certaines données de La Salle n’ont pas pu être synchronisées.')
    } else {
      setQuestions((questionResult.data ?? []) as QuestionRow[])
      setPlayers((playerResult.data ?? []) as PlayerRow[])
      setPublicState((stateResult.data?.state ?? { phase: 'idle', roundId: null }) as PublicState)
      setError('')
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    void loadData()
    const channel = supabase
      .channel('anniv-2026-live-vote-admin')
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'live_vote_public_state', filter: 'id=eq.main',
      }, () => void loadData())
      .subscribe()

    const interval = window.setInterval(() => void loadData(), 10000)
    return () => {
      window.clearInterval(interval)
      void supabase.removeChannel(channel)
    }
  }, [loadData])

  const resetForm = () => {
    setEditingId(null)
    setMode('likely')
    setPrompt('')
    setOptionsText('')
    setRevealNote('')
    setTimer('30')
    setCorrectPlayerKey('')
    setSuspectKeys([])
    setSuspectSearch('')
  }

  const editQuestion = (question: QuestionRow) => {
    setEditingId(question.id)
    setMode(question.mode)
    setPrompt(question.prompt)
    setOptionsText(question.options.join('\n'))
    setRevealNote(question.reveal_note)
    setTimer(question.timer_seconds ? String(question.timer_seconds) : '')
    setCorrectPlayerKey(question.correct_player_key ?? '')
    setSuspectKeys(question.suspects.map((suspect) => suspect.key))
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const toggleSuspect = (key: string) => {
    setSuspectKeys((current) => {
      if (current.includes(key)) {
        if (key === correctPlayerKey) return current
        return current.filter((item) => item !== key)
      }
      if (current.length >= 6) return current
      return [...current, key]
    })
  }

  const changeCorrect = (key: string) => {
    setCorrectPlayerKey(key)
    if (key) {
      setSuspectKeys((current) => current.includes(key) ? current : [key, ...current].slice(0, 6))
    }
  }

  const saveQuestion = async () => {
    if (!prompt.trim() || busy) return

    const options = optionsText
      .split('\n')
      .map((value) => value.trim())
      .filter(Boolean)
      .filter((value, index, array) => array.indexOf(value) === index)

    if ((mode === 'majority' || mode === 'predict') && (options.length < 2 || options.length > 4)) {
      setError('Pour ce mode, mets entre 2 et 4 choix, un par ligne.')
      return
    }

    if (mode === 'who_said') {
      if (!correctPlayerKey || suspectKeys.length < 4 || suspectKeys.length > 6 || !suspectKeys.includes(correctPlayerKey)) {
        setError('Pour “Qui a répondu ça ?”, choisis une bonne réponse et 4 à 6 suspects au total.')
        return
      }
    }

    const suspects = suspectKeys
      .map((key) => playerMap.get(key))
      .filter((player): player is AvailablePlayer => Boolean(player))
      .map((player) => ({ key: player.key, label: player.name }))

    const payload = {
      mode,
      prompt: prompt.trim(),
      options: mode === 'majority' || mode === 'predict' ? options : [],
      correct_player_key: mode === 'who_said' ? correctPlayerKey : null,
      suspects: mode === 'who_said' ? suspects : [],
      reveal_note: revealNote.trim(),
      timer_seconds: timer ? Number(timer) : null,
      updated_at: new Date().toISOString(),
    }

    setBusy(true)
    setError('')

    if (editingId) {
      const { error: updateError } = await supabase
        .from('live_vote_questions')
        .update(payload)
        .eq('id', editingId)

      if (updateError) {
        console.error('Unable to update live vote question:', updateError)
        setError('La question n’a pas pu être modifiée.')
      } else {
        resetForm()
      }
    } else {
      const nextSort = questions.length > 0
        ? Math.max(...questions.map((question) => question.sort_order)) + 10
        : 10
      const { error: insertError } = await supabase
        .from('live_vote_questions')
        .insert({ ...payload, sort_order: nextSort, is_active: true })

      if (insertError) {
        console.error('Unable to create live vote question:', insertError)
        setError('La question n’a pas pu être créée.')
      } else {
        resetForm()
      }
    }

    setBusy(false)
    await loadData()
  }

  const runRpc = async (name: string, args: Record<string, unknown> = {}) => {
    if (busy) return false
    setBusy(true)
    setError('')
    const { data, error: rpcError } = await supabase.rpc(name, args)
    setBusy(false)

    if (rpcError) {
      console.error(`Unable to run ${name}:`, rpcError)
      setError('La commande live n’a pas pu être exécutée.')
      return false
    }

    const result = data as RpcResult
    if (!result.ok) {
      setError(adminError(result.code))
      return false
    }

    await loadData()
    return true
  }

  const startQuestion = (id: string) => runRpc('admin_start_live_vote', {
    p_question_id: id,
    p_timer_seconds: null,
  })

  const toggleActive = async (question: QuestionRow) => {
    await supabase
      .from('live_vote_questions')
      .update({ is_active: !question.is_active, updated_at: new Date().toISOString() })
      .eq('id', question.id)
    await loadData()
  }

  const removeQuestion = async (question: QuestionRow) => {
    if (!window.confirm(`Supprimer “${question.prompt}” ?`)) return
    const { error: deleteError } = await supabase
      .from('live_vote_questions')
      .delete()
      .eq('id', question.id)
    if (deleteError) setError('Impossible de supprimer cette question.')
    await loadData()
  }

  const moveQuestion = async (index: number, direction: -1 | 1) => {
    const targetIndex = index + direction
    if (targetIndex < 0 || targetIndex >= questions.length) return
    const current = questions[index]
    const target = questions[targetIndex]
    setBusy(true)
    await supabase.from('live_vote_questions').update({ sort_order: target.sort_order }).eq('id', current.id)
    await supabase.from('live_vote_questions').update({ sort_order: current.sort_order }).eq('id', target.id)
    setBusy(false)
    await loadData()
  }

  const resetIdentity = async (player: PlayerRow) => {
    if (!window.confirm(`Réinitialiser l’identité de ${player.player_name} ? Son score La Salle sera aussi remis à zéro.`)) return
    await runRpc('admin_reset_live_vote_identity', { p_player_key: player.player_key })
  }

  const suspectMatches = useMemo(() => {
    const query = suspectSearch.trim().toLocaleLowerCase('fr')
    return availablePlayers
      .filter((player) => !query || `${player.name} ${player.detail}`.toLocaleLowerCase('fr').includes(query))
      .slice(0, 24)
  }, [availablePlayers, suspectSearch])

  const liveMode = publicState.mode ? modeCopy[publicState.mode] : null

  return (
    <main className="live-room-admin">
      <header className="live-room-admin__header">
        <div>
          <Link to="/admin" className="back-link">← Control Room</Link>
          <p className="live-room-admin__eyebrow">Anniv 2026 / régie live</p>
          <h1>La <span>Salle</span></h1>
          <p>Prépare les questions, lance un round et garde les résultats secrets jusqu’à la révélation.</p>
        </div>
        <Link to="/room" className="live-room-admin__public-link">Voir l’écran public ↗</Link>
      </header>

      {error && <div className="live-room-admin__error">{error}</div>}

      <section className={`live-control live-control--${publicState.phase}`}>
        <div className="live-control__top">
          <div>
            <span className="live-control__dot" />
            <strong>{publicState.phase === 'idle' ? 'Aucun round' : publicState.phase === 'open' ? 'Vote en cours' : 'Résultat révélé'}</strong>
          </div>
          <b>{publicState.voteCount ?? 0} vote{(publicState.voteCount ?? 0) !== 1 ? 's' : ''}</b>
        </div>

        {publicState.phase === 'idle' ? (
          <p>Choisis une question préparée plus bas pour lancer La Salle.</p>
        ) : (
          <>
            <small>{liveMode?.label}{publicState.stage === 'final' ? ' · FINALE' : ''}</small>
            <h2>{publicState.prompt}</h2>
            <div className="live-control__actions">
              {publicState.phase === 'open' && publicState.mode === 'likely' && publicState.stage === 'nomination' && (
                <button type="button" disabled={busy} onClick={() => void runRpc('admin_advance_likely_vote')}>Top 4 → Finale</button>
              )}
              {publicState.phase === 'open' && !(publicState.mode === 'likely' && publicState.stage === 'nomination') && (
                <button className="live-control__reveal" type="button" disabled={busy} onClick={() => void runRpc('admin_reveal_live_vote')}>Révéler les résultats</button>
              )}
              {publicState.phase === 'open' && (
                <button type="button" disabled={busy} onClick={() => void runRpc('admin_skip_live_vote')}>Passer la question</button>
              )}
              {publicState.phase === 'revealed' && (
                <button type="button" disabled={busy} onClick={() => void runRpc('admin_clear_live_vote')}>Fermer le round</button>
              )}
            </div>
          </>
        )}
      </section>

      <section className="live-room-admin__editor">
        <div className="live-room-admin__section-title">
          <div>
            <span>{editingId ? 'Modification' : 'Nouvelle question'}</span>
            <h2>{editingId ? 'Éditer le round' : 'Préparer un round'}</h2>
          </div>
          {editingId && <button type="button" onClick={resetForm}>Annuler</button>}
        </div>

        <div className="live-room-admin__modes">
          {(Object.keys(modeCopy) as VoteMode[]).map((value) => (
            <button
              key={value}
              type="button"
              className={mode === value ? 'live-room-admin__mode live-room-admin__mode--active' : 'live-room-admin__mode'}
              onClick={() => setMode(value)}
            >
              <strong>{modeCopy[value].label}</strong>
              <span>{modeCopy[value].detail}</span>
            </button>
          ))}
        </div>

        <label className="live-room-admin__field">
          <span>Question</span>
          <textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder="Ex. Qui est le plus susceptible de…" rows={3} />
        </label>

        {(mode === 'majority' || mode === 'predict') && (
          <label className="live-room-admin__field">
            <span>Choix · 2 à 4, un par ligne</span>
            <textarea value={optionsText} onChange={(event) => setOptionsText(event.target.value)} placeholder={'Choix A\nChoix B\nChoix C'} rows={5} />
          </label>
        )}

        {mode === 'who_said' && (
          <div className="live-room-admin__suspects">
            <label className="live-room-admin__field">
              <span>Bonne réponse</span>
              <select value={correctPlayerKey} onChange={(event) => changeCorrect(event.target.value)}>
                <option value="">Choisir la personne</option>
                {availablePlayers.map((player) => <option key={player.key} value={player.key}>{player.name} · {player.detail}</option>)}
              </select>
            </label>

            <div className="live-room-admin__field">
              <span>Suspects · {suspectKeys.length}/6 · minimum 4</span>
              <input value={suspectSearch} onChange={(event) => setSuspectSearch(event.target.value)} placeholder="Rechercher un suspect…" />
              <div className="live-room-admin__suspect-grid">
                {suspectMatches.map((player) => (
                  <button
                    key={player.key}
                    type="button"
                    className={suspectKeys.includes(player.key) ? 'live-room-admin__suspect live-room-admin__suspect--selected' : 'live-room-admin__suspect'}
                    onClick={() => toggleSuspect(player.key)}
                  >
                    <strong>{player.name}</strong>
                    <span>{player.key === correctPlayerKey ? '✓ réponse' : player.detail}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        <div className="live-room-admin__editor-row">
          <label className="live-room-admin__field">
            <span>Timer</span>
            <select value={timer} onChange={(event) => setTimer(event.target.value)}>
              <option value="">Sans timer</option>
              <option value="15">15 secondes</option>
              <option value="30">30 secondes</option>
              <option value="60">60 secondes</option>
            </select>
          </label>
          <label className="live-room-admin__field live-room-admin__field--wide">
            <span>Note révélée après les résultats · optionnel</span>
            <input value={revealNote} onChange={(event) => setRevealNote(event.target.value)} placeholder="Petite punchline ou contexte…" />
          </label>
        </div>

        <button className="live-room-admin__save" type="button" disabled={busy || !prompt.trim()} onClick={() => void saveQuestion()}>
          {busy ? 'Sauvegarde…' : editingId ? 'Enregistrer les modifications' : 'Ajouter à la file'}
        </button>
      </section>

      <section className="live-room-admin__bank">
        <div className="live-room-admin__section-title">
          <div>
            <span>File préparée</span>
            <h2>{questions.length} questions</h2>
          </div>
          <small>{questions.filter((question) => question.is_active).length} actives</small>
        </div>

        <div className="live-room-admin__question-list">
          {questions.map((question, index) => (
            <article key={question.id} className={question.is_active ? 'live-room-admin__question' : 'live-room-admin__question live-room-admin__question--inactive'}>
              <div className="live-room-admin__question-order">
                <b>{String(index + 1).padStart(2, '0')}</b>
                <div>
                  <button type="button" disabled={index === 0 || busy} onClick={() => void moveQuestion(index, -1)}>↑</button>
                  <button type="button" disabled={index === questions.length - 1 || busy} onClick={() => void moveQuestion(index, 1)}>↓</button>
                </div>
              </div>
              <div className="live-room-admin__question-body">
                <span>{modeCopy[question.mode].label} · {question.timer_seconds ? `${question.timer_seconds}s` : 'sans timer'}</span>
                <h3>{question.prompt}</h3>
                {question.mode === 'who_said' && <small>{question.suspects.length} suspects</small>}
                {(question.mode === 'majority' || question.mode === 'predict') && <small>{question.options.join(' · ')}</small>}
              </div>
              <div className="live-room-admin__question-actions">
                <button className="live-room-admin__launch" type="button" disabled={!question.is_active || publicState.phase === 'open' || busy} onClick={() => void startQuestion(question.id)}>Lancer</button>
                <button type="button" onClick={() => editQuestion(question)}>Modifier</button>
                <button type="button" onClick={() => void toggleActive(question)}>{question.is_active ? 'Masquer' : 'Activer'}</button>
                <button className="live-room-admin__delete" type="button" onClick={() => void removeQuestion(question)}>Suppr.</button>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="live-room-admin__players">
        <div className="live-room-admin__section-title">
          <div>
            <span>Identités La Salle</span>
            <h2>{players.length} participants liés</h2>
          </div>
        </div>
        {loading ? <p>Synchronisation…</p> : players.length === 0 ? <p>Aucun participant n’a encore rejoint La Salle.</p> : (
          <div className="live-room-admin__player-list">
            {players.map((player) => (
              <div key={player.player_key} className="live-room-admin__player">
                <div><strong>{player.player_name}</strong><span>{player.score} point{player.score !== 1 ? 's' : ''}</span></div>
                <button type="button" onClick={() => void resetIdentity(player)}>Réinitialiser</button>
              </div>
            ))}
          </div>
        )}
      </section>
    </main>
  )
}

export default LiveVoteRoomAdmin
