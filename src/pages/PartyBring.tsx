import { useMemo, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { type BringCategory, type BringDraft, type BringItem, usePartyBring } from '../features/bring/usePartyBring'
import './PartyBring.css'

const categories: { key: BringCategory; label: string; icon: string }[] = [
  { key: 'drink', label: 'À boire', icon: '◌' },
  { key: 'food', label: 'À manger', icon: '◇' },
  { key: 'equipment', label: 'Matériel', icon: '□' },
  { key: 'other', label: 'Autre', icon: '＋' },
]
const emptyDraft: BringDraft = { category: 'drink', item: '', quantity: '', note: '' }

function normalized(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

export default function PartyBring() {
  const { data, error, loading, action } = usePartyBring()
  const [editing, setEditing] = useState<BringItem | 'new' | null>(null)
  const [draft, setDraft] = useState<BringDraft>(emptyDraft)
  const [saving, setSaving] = useState(false)
  const [failure, setFailure] = useState('')
  const readOnly = data?.phase === 'ended'
  const similar = useMemo(() => {
    const query = normalized(draft.item)
    if (query.length < 3) return []
    return (data?.items ?? []).filter(entry => {
      if (editing && typeof editing === 'object' && entry.id === editing.id) return false
      const candidate = normalized(entry.item)
      return candidate.includes(query) || query.includes(candidate)
    }).slice(0, 3)
  }, [data?.items, draft.item, editing])

  const openNew = () => { setDraft(emptyDraft); setEditing('new'); setFailure('') }
  const openEdit = (item: BringItem) => {
    setDraft({ category: item.category, item: item.item, quantity: item.quantity ?? '', note: item.note ?? '' })
    setEditing(item)
    setFailure('')
  }
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!draft.item.trim() || saving) return
    setSaving(true); setFailure('')
    try {
      if (editing === 'new') await action('create', { ...draft, request_id: crypto.randomUUID() })
      else if (editing) await action('update', { ...draft, id: editing.id })
      setEditing(null); setDraft(emptyDraft)
    } catch (caught) {
      setFailure(caught instanceof Error ? caught.message : 'Impossible d’enregistrer cet élément.')
    } finally { setSaving(false) }
  }
  const remove = async (item: BringItem) => {
    if (!window.confirm(`Retirer « ${item.item} » de la liste ?`)) return
    setFailure('')
    try { await action('delete', { id: item.id }) }
    catch (caught) { setFailure(caught instanceof Error ? caught.message : 'Impossible de retirer cet élément.') }
  }

  return <main className="guest-page bring-page">
    <header className="bring-heading">
      <Link to="/" className="guest-back">← Accueil</Link>
      <p className="guest-eyebrow">Organisation de la soirée</p>
      <div className="bring-heading__row"><div><h1>Ce qu’on ramène.</h1><p>Une liste simple pour s’organiser et éviter les doublons.</p></div>
        {!readOnly && !editing && <button className="bring-add" type="button" onClick={openNew}>＋ Ajouter</button>}
      </div>
    </header>

    {readOnly && <p className="bring-notice">La soirée est terminée : la liste reste visible en lecture seule.</p>}
    {(error || failure) && <p className="bring-error" role="alert">{failure || error}</p>}

    {editing && <form className="bring-form" onSubmit={submit}>
      <div className="bring-form__title"><div><p className="guest-eyebrow">{editing === 'new' ? 'Nouvel apport' : 'Modifier'}</p><h2>Je pense ramener…</h2></div><button type="button" onClick={() => setEditing(null)} aria-label="Fermer">×</button></div>
      <label>Catégorie<select value={draft.category} onChange={event => setDraft(current => ({ ...current, category: event.target.value as BringCategory }))}>{categories.map(category => <option key={category.key} value={category.key}>{category.label}</option>)}</select></label>
      <label>Quoi ?<input autoFocus maxLength={80} required placeholder="Ex. Jus de pomme" value={draft.item} onChange={event => setDraft(current => ({ ...current, item: event.target.value }))} /></label>
      {similar.length > 0 && <div className="bring-similar"><strong>Déjà prévu, peut-être :</strong>{similar.map(item => <span key={item.id}>{item.item} · {item.playerName}</span>)}</div>}
      <div className="bring-form__optional"><label>Quantité <small>facultatif</small><input maxLength={40} placeholder="Ex. 2 bouteilles" value={draft.quantity} onChange={event => setDraft(current => ({ ...current, quantity: event.target.value }))} /></label><label>Précision <small>facultatif</small><input maxLength={140} placeholder="Ex. sans alcool" value={draft.note} onChange={event => setDraft(current => ({ ...current, note: event.target.value }))} /></label></div>
      <div className="bring-form__actions"><button type="button" onClick={() => setEditing(null)}>Annuler</button><button type="submit" disabled={saving || !draft.item.trim()}>{saving ? 'Enregistrement…' : 'Enregistrer'}</button></div>
    </form>}

    {loading ? <p className="guest-empty">Chargement de la liste…</p> : <div className="bring-groups">
      {categories.map(category => {
        const items = data?.items.filter(item => item.category === category.key) ?? []
        return <section className="bring-group" key={category.key}>
          <header><span aria-hidden="true">{category.icon}</span><h2>{category.label}</h2><small>{items.length}</small></header>
          {items.length ? <div className="bring-list">{items.map(item => <article className="bring-item" key={item.id}>
            <div><h3>{item.item}</h3><p><strong>{item.playerName}</strong>{item.quantity && <> · {item.quantity}</>}{item.note && <small>{item.note}</small>}</p></div>
            {item.canEdit && !readOnly && <div className="bring-item__actions"><button type="button" onClick={() => openEdit(item)}>Modifier</button><button type="button" onClick={() => void remove(item)}>Retirer</button></div>}
          </article>)}</div> : <p className="bring-empty">Rien de prévu pour l’instant.</p>}
        </section>
      })}
    </div>}
  </main>
}
