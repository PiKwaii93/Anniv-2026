import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { usePartyIdentity } from '../features/identity/PartyIdentityContext'
import { useAuth } from '../features/auth/AuthContext'
import { chatError, usePartyChat, type ChatMessage } from '../features/chat/usePartyChat'
import '../features/chat/chat.css'
import '../features/chat/chat-mobile.css'

const dateTime = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })

export default function PartyChat({ admin = false }: { admin?: boolean }) {
  const { identity } = usePartyIdentity()
  const { user } = useAuth()
  // Changing person must clear messages, drafts and in-flight UI state immediately.
  return <ChatRoom key={admin ? user?.id ?? 'admin' : `${identity?.playerKey}:${identity?.sessionToken}`} admin={admin} />
}

function ChatRoom({ admin }: { admin: boolean }) {
  const [before, setBefore] = useState<string | null>(null)
  const { data, loading, error, refresh, action } = usePartyChat({ admin, before })
  const [body, setBody] = useState('')
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const [actionError, setActionError] = useState('')
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [selectedMessage, setSelectedMessage] = useState<ChatMessage | null>(null)
  const [following, setFollowing] = useState(true)
  const list = useRef<HTMLDivElement>(null)
  const input = useRef<HTMLTextAreaElement>(null)
  const locked = useRef(false)
  const pending = useRef<{ body: string; id: string } | null>(null)
  const readUpTo = useRef('0')
  const mounted = useRef(true)
  const holdTimer = useRef<number | null>(null)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      if (holdTimer.current !== null) window.clearTimeout(holdTimer.current)
    }
  }, [])

  useEffect(() => {
    if (!selectedMessage) return
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setSelectedMessage(null)
        setConfirmDelete(null)
      }
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [selectedMessage])

  useEffect(() => {
    if (!data || !following || before || document.visibilityState === 'hidden') return
    if (list.current) list.current.scrollTop = list.current.scrollHeight
    if (admin || BigInt(data.latest) <= BigInt(readUpTo.current)) return
    const latest = data.latest
    void action('read', { id: latest }).then(() => {
      if (BigInt(latest) > BigInt(readUpTo.current)) readUpTo.current = latest
    }).catch(() => { /* Retry on the next successful poll; never claim unread was saved. */ })
  }, [data, following, before, admin, action])

  async function perform(name: string, payload: Record<string, unknown>, success: string) {
    if (locked.current) return false
    locked.current = true; setBusy(true); setActionError(''); setNotice('')
    try {
      await action(name, payload)
      if (!mounted.current) return false
      setNotice(success)
      await refresh()
      return mounted.current
    } catch (err) {
      if (mounted.current) setActionError(chatError(err))
      return false
    } finally {
      locked.current = false
      if (mounted.current) setBusy(false)
    }
  }

  async function send(event: FormEvent) {
    event.preventDefault()
    const text = body.trim()
    if (!text || [...text].length > 300 || busy || !data?.open) return
    // Keep the same request ID after a timeout, including a lost success response.
    if (!pending.current || pending.current.body !== text) pending.current = { body: text, id: crypto.randomUUID() }
    if (await perform('send', { body: text, request_id: pending.current.id }, 'Message envoyé.')) {
      pending.current = null
      setBody('')
      setBefore(null)
      setFollowing(true)
      if (input.current) {
        input.current.style.height = ''
        input.current.focus()
      }
    }
  }

  function openMessageDetails(message: ChatMessage) {
    setSelectedMessage(message)
    setConfirmDelete(null)
  }

  function cancelMessageHold() {
    if (holdTimer.current === null) return
    window.clearTimeout(holdTimer.current)
    holdTimer.current = null
  }

  function startMessageHold(message: ChatMessage) {
    cancelMessageHold()
    holdTimer.current = window.setTimeout(() => {
      holdTimer.current = null
      openMessageDetails(message)
    }, 450)
  }

  return <main className={`chat-page${admin ? ' chat-page--admin' : ''}`}>
    <Link className="chat-back" to={admin ? '/admin/live' : '/'}>← {admin ? 'Retour à la régie' : 'Accueil'}</Link>
    <header className="chat-heading"><p>{admin ? 'Régie · discussion' : 'Entre invités'}</p><h1>La discussion<span>.</span></h1><p>{admin ? 'Supprime un message inapproprié ou mets les envois en pause.' : 'Un message à tous les invités. Puis on repose le téléphone.'}</p></header>
    <div className="chat-room-info"><span><i aria-hidden="true" />{data?.open === false ? 'Envois en pause' : 'Salon commun'}</span><small>Visible par les invités et la régie · jamais sur la TV</small></div>
    {admin && <div className="chat-admin-tools"><button disabled={!data || busy} onClick={() => void perform('admin_pause', { paused: data?.open }, data?.open ? 'Envois mis en pause.' : 'Discussion rouverte.')}>{data?.open === false ? 'Rouvrir les envois' : 'Mettre les envois en pause'}</button><Link to="/chat">Vue invitée ↗</Link></div>}
    {(error || actionError) && <div className="chat-error" role="alert">{actionError || error}<button onClick={() => void refresh()}>Réessayer la connexion</button></div>}
    <div className="chat-history-controls">
      {data?.more && <button disabled={busy} onClick={() => { setBefore(data.oldest); setFollowing(false) }}>Messages précédents</button>}
      {before && <button onClick={() => { setBefore(null); setFollowing(true) }}>Revenir aux derniers messages{data?.unread ? ` (${data.unread} non lus)` : ''}</button>}
    </div>
    <div className="chat-messages" ref={list} tabIndex={0} role="region" aria-label={before ? 'Messages précédents' : 'Messages de la soirée'} aria-busy={loading} onScroll={() => {
      const el = list.current
      if (el) setFollowing(el.scrollHeight - el.scrollTop - el.clientHeight < 60)
    }}>
      {loading && <p className="chat-empty">Ouverture de la discussion…</p>}
      {data && data.messages.length === 0 && <div className="chat-empty"><span aria-hidden="true">✳</span><h2>{before ? 'Plus de messages ici.' : 'Tout commence par un petit mot.'}</h2><p>{before ? 'Reviens aux derniers messages pour retrouver la discussion.' : <>« Qui est partant pour une photo ? »<br />« On se retrouve près du gâteau ! »</>}</p></div>}
      {data?.messages.map(message => <article
        key={message.id}
        className={`chat-message${message.mine ? ' chat-message--mine' : ''}`}
        onPointerDown={() => startMessageHold(message)}
        onPointerUp={cancelMessageHold}
        onPointerCancel={cancelMessageHold}
        onPointerMove={cancelMessageHold}
        onPointerLeave={cancelMessageHold}
        onContextMenu={(event) => { event.preventDefault(); openMessageDetails(message) }}
      >
        <header className="chat-message__header">
          <strong className="chat-message__author">{message.mine ? 'Toi' : message.name}</strong>
          <button
            className="chat-message__options"
            type="button"
            aria-label={`Options du message de ${message.mine ? 'toi' : message.name}`}
            onPointerDown={event => event.stopPropagation()}
            onClick={() => openMessageDetails(message)}
          >
            ···
          </button>
        </header>
        <p className="chat-message__body">{message.body}</p>
      </article>)}
    </div>
    {!before && !following && !!data?.unread && <button className="chat-jump" onClick={() => setFollowing(true)}>Derniers messages ↓</button>}
    <div className="chat-status" role="status" aria-live="polite">{notice}</div>
    {!admin && <form className="chat-composer" onSubmit={send}>
      <label className="chat-composer__label" htmlFor="chat-message">Ton message</label>
      <div className="chat-composer__row">
        <textarea id="chat-message" ref={input} value={body} onChange={event => {
          setBody(event.target.value)
          event.currentTarget.style.height = 'auto'
          event.currentTarget.style.height = `${Math.min(event.currentTarget.scrollHeight, 112)}px`
        }} rows={1} maxLength={600} disabled={busy} aria-describedby="chat-composer-help" placeholder="Écrire un message…" />
        <button type="submit" aria-label="Envoyer le message" disabled={busy || !data?.open || !body.trim() || [...body.trim()].length > 300}>
          <span className="chat-composer__send-label">Envoyer</span>
          <span aria-hidden="true">{busy ? '…' : '↑'}</span>
        </button>
      </div>
      <small id="chat-composer-help" className={`chat-composer__count${[...body.trim()].length >= 240 ? ' is-visible' : ''}`}>{[...body.trim()].length}/300</small>
      {data?.open === false && <p>Les envois sont en pause. Tu peux lire la discussion ; ton texte reste ici.</p>}
    </form>}

    {selectedMessage && <div className="chat-message-sheet" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) {
        setSelectedMessage(null)
        setConfirmDelete(null)
      }
    }}>
      <section className="chat-message-sheet__panel" role="dialog" aria-modal="true" aria-labelledby="chat-message-sheet-title">
        <div className="chat-message-sheet__handle" aria-hidden="true" />
        <header className="chat-message-sheet__header">
          <div className="chat-message-sheet__meta">
            <strong id="chat-message-sheet-title">{selectedMessage.mine ? 'Ton message' : selectedMessage.name}</strong>
            <time dateTime={selectedMessage.created_at}>{dateTime.format(new Date(selectedMessage.created_at))}</time>
          </div>
          <button type="button" aria-label="Fermer les options" onClick={() => { setSelectedMessage(null); setConfirmDelete(null) }}>×</button>
        </header>

        {(admin || selectedMessage.mine) && (confirmDelete === selectedMessage.id
          ? <div className="chat-message-sheet__confirm">
              <p>Supprimer définitivement ce message ?</p>
              <button className="chat-message-sheet__danger" disabled={busy} onClick={async () => {
                if (await perform(admin ? 'admin_delete' : 'delete', { id: selectedMessage.id }, 'Message supprimé.')) {
                  setConfirmDelete(null)
                  setSelectedMessage(null)
                }
              }}>Supprimer</button>
              <button disabled={busy} onClick={() => setConfirmDelete(null)}>Annuler</button>
            </div>
          : <button className="chat-message-sheet__delete" disabled={busy} onClick={() => setConfirmDelete(selectedMessage.id)}>Supprimer le message</button>
        )}
      </section>
    </div>}
  </main>
}
