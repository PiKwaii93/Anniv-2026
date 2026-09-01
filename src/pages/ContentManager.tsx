import {
  type ChangeEvent,
  type DragEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { Link } from 'react-router-dom'

import { supabase } from '../lib/supabase'

import './ContentManager.css'

type ModuleKey = 'bingo' | 'missions' | 'room' | 'iceberg' | 'photos'
type ImportMode = 'merge' | 'restore'
type VoteMode = 'likely' | 'majority' | 'predict' | 'who_said'
type Difficulty = 'easy' | 'medium' | 'hard'

type BingoRow = {
  id: string
  text: string
  sort_order: number
  is_active: boolean
}

type MissionRow = {
  id: string
  text: string
  difficulty: Difficulty
  sort_order: number
  is_active: boolean
}

type RoomRow = {
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

type IcebergRow = {
  id: string
  level: number
  title: string
  description: string
  sort_order: number
  is_published: boolean
}

type PhotoRow = {
  id: string
  prompt: string
  hint: string | null
  sort_order: number
  is_active: boolean
}

type CurrentRow = BingoRow | MissionRow | RoomRow | IcebergRow | PhotoRow

type CurrentContent = {
  bingo: BingoRow[]
  missions: MissionRow[]
  room: RoomRow[]
  iceberg: IcebergRow[]
  photos: PhotoRow[]
}

type BingoPackItem = {
  id?: string
  text: string
  sortOrder: number
  isActive: boolean
}

type MissionPackItem = {
  id?: string
  text: string
  difficulty: Difficulty
  sortOrder: number
  isActive: boolean
}

type RoomPackItem = {
  id?: string
  mode: VoteMode
  prompt: string
  options: string[]
  correctPlayerKey: string | null
  suspects: Array<{ key: string; label: string }>
  revealNote: string
  timerSeconds: number | null
  sortOrder: number
  isActive: boolean
}

type IcebergPackItem = {
  id?: string
  level: number
  title: string
  description: string
  sortOrder: number
  isPublished: boolean
}

type PhotoPackItem = {
  id?: string
  prompt: string
  hint: string | null
  sortOrder: number
  isActive: boolean
}

type ContentPack = {
  schema: 'anniv-2026-content-pack'
  version: 1 | 2
  exportedAt?: string
  source?: string
  modules: {
    bingo?: BingoPackItem[]
    missions?: MissionPackItem[]
    room?: RoomPackItem[]
    iceberg?: IcebergPackItem[]
    photos?: PhotoPackItem[]
  }
}

type PreviewStats = {
  incoming: number
  added: number
  updated: number
  unchanged: number
  matched: number
  disabled: number
  errors: string[]
}

type ImportSummary = Record<
  ModuleKey,
  { inserted: number; updated: number; matched: number; disabled: number }
>

type ImportResult = {
  ok: boolean
  code?: string
  message?: string
  summary?: ImportSummary
}

const moduleMeta: Record<ModuleKey, { label: string; icon: string; detail: string }> = {
  bingo: { label: 'Bingo', icon: '▦', detail: 'Cases de grilles' },
  missions: { label: 'Missions', icon: '⌁', detail: 'Missions secrètes' },
  room: { label: 'La Salle', icon: '◉', detail: 'Questions live' },
  iceberg: { label: 'Iceberg', icon: '◇', detail: 'Dossiers publiés' },
  photos: { label: 'Photo Hunt', icon: '▣', detail: 'Défis photo' },
}

const moduleKeys: ModuleKey[] = ['bingo', 'missions', 'room', 'iceberg', 'photos']
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function normalizeText(value: string) {
  return value.trim().toLocaleLowerCase('fr')
}

function naturalKey(module: ModuleKey, item: unknown) {
  if (module === 'bingo') return normalizeText((item as BingoPackItem).text)
  if (module === 'missions') return normalizeText((item as MissionPackItem).text)
  if (module === 'room') {
    const row = item as RoomPackItem
    return `${row.mode}|${normalizeText(row.prompt)}`
  }
  if (module === 'photos') return normalizeText((item as PhotoPackItem).prompt)
  const row = item as IcebergPackItem
  return `${row.level}|${normalizeText(row.title)}`
}

function asPackItem(module: ModuleKey, row: CurrentRow) {
  if (module === 'bingo') {
    const item = row as BingoRow
    return { id: item.id, text: item.text, sortOrder: item.sort_order, isActive: item.is_active } satisfies BingoPackItem
  }
  if (module === 'missions') {
    const item = row as MissionRow
    return {
      id: item.id,
      text: item.text,
      difficulty: item.difficulty,
      sortOrder: item.sort_order,
      isActive: item.is_active,
    } satisfies MissionPackItem
  }
  if (module === 'room') {
    const item = row as RoomRow
    return {
      id: item.id,
      mode: item.mode,
      prompt: item.prompt,
      options: item.options,
      correctPlayerKey: item.correct_player_key,
      suspects: item.suspects,
      revealNote: item.reveal_note,
      timerSeconds: item.timer_seconds,
      sortOrder: item.sort_order,
      isActive: item.is_active,
    } satisfies RoomPackItem
  }
  if (module === 'photos') {
    const item = row as PhotoRow
    return {
      id: item.id,
      prompt: item.prompt,
      hint: item.hint,
      sortOrder: item.sort_order,
      isActive: item.is_active,
    } satisfies PhotoPackItem
  }
  const item = row as IcebergRow
  return {
    id: item.id,
    level: item.level,
    title: item.title,
    description: item.description,
    sortOrder: item.sort_order,
    isPublished: item.is_published,
  } satisfies IcebergPackItem
}

function comparable(item: Record<string, unknown>) {
  const { id: _id, ...rest } = item
  return JSON.stringify(rest)
}

function validateItem(module: ModuleKey, item: unknown, index: number) {
  const errors: string[] = []
  const prefix = `${moduleMeta[module].label} #${index + 1}`
  if (!item || typeof item !== 'object' || Array.isArray(item)) return [`${prefix} : objet invalide.`]

  const row = item as Record<string, unknown>
  if (row.id !== undefined && row.id !== null && (typeof row.id !== 'string' || !uuidPattern.test(row.id))) {
    errors.push(`${prefix} : id UUID invalide.`)
  }

  if (module === 'bingo' || module === 'missions') {
    if (typeof row.text !== 'string' || !row.text.trim()) errors.push(`${prefix} : texte vide.`)
  }

  if (module === 'missions' && !['easy', 'medium', 'hard'].includes(String(row.difficulty))) {
    errors.push(`${prefix} : difficulté invalide.`)
  }

  if (module === 'room') {
    const mode = String(row.mode)
    if (!['likely', 'majority', 'predict', 'who_said'].includes(mode)) errors.push(`${prefix} : mode invalide.`)
    if (typeof row.prompt !== 'string' || !row.prompt.trim()) errors.push(`${prefix} : question vide.`)
    if (!Array.isArray(row.options) || !Array.isArray(row.suspects)) errors.push(`${prefix} : options/suspects invalides.`)
    if ((mode === 'majority' || mode === 'predict') && Array.isArray(row.options)) {
      const options = row.options.filter((value): value is string => typeof value === 'string' && Boolean(value.trim()))
      if (options.length < 2 || options.length > 4) errors.push(`${prefix} : 2 à 4 choix requis.`)
    }
    if (mode === 'who_said' && Array.isArray(row.suspects)) {
      if (row.suspects.length < 4 || row.suspects.length > 6) errors.push(`${prefix} : 4 à 6 suspects requis.`)
      const keys = row.suspects
        .filter((value): value is Record<string, unknown> => Boolean(value) && typeof value === 'object')
        .map((value) => value.key)
      if (typeof row.correctPlayerKey !== 'string' || !keys.includes(row.correctPlayerKey)) {
        errors.push(`${prefix} : bonne réponse absente des suspects.`)
      }
    }
    if (row.timerSeconds !== null && row.timerSeconds !== undefined && ![15, 30, 60].includes(Number(row.timerSeconds))) {
      errors.push(`${prefix} : timer invalide.`)
    }
  }

  if (module === 'iceberg') {
    if (!Number.isInteger(row.level) || Number(row.level) < 1 || Number(row.level) > 5) errors.push(`${prefix} : niveau 1 à 5 requis.`)
    if (typeof row.title !== 'string' || !row.title.trim()) errors.push(`${prefix} : titre vide.`)
  }

  if (module === 'photos') {
    if (typeof row.prompt !== 'string' || row.prompt.trim().length < 3 || row.prompt.trim().length > 240) {
      errors.push(`${prefix} : défi de 3 à 240 caractères requis.`)
    }
    if (row.hint !== null && row.hint !== undefined && typeof row.hint !== 'string') {
      errors.push(`${prefix} : indice invalide.`)
    } else if (typeof row.hint === 'string' && row.hint.trim().length > 240) {
      errors.push(`${prefix} : indice limité à 240 caractères.`)
    }
  }

  if ('sortOrder' in row && !Number.isInteger(row.sortOrder)) errors.push(`${prefix} : sortOrder doit être entier.`)
  return errors
}

function validatePack(raw: unknown): { pack: ContentPack | null; errors: string[] } {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { pack: null, errors: ['Le fichier JSON doit contenir un objet.'] }
  const pack = raw as Partial<ContentPack>
  const errors: string[] = []
  if (pack.schema !== 'anniv-2026-content-pack') errors.push('Schéma inconnu : anniv-2026-content-pack attendu.')
  if (pack.version !== 1 && pack.version !== 2) errors.push('Version de sauvegarde non supportée : version 1 ou 2 attendue.')
  if (!pack.modules || typeof pack.modules !== 'object' || Array.isArray(pack.modules)) {
    errors.push('La section modules est absente ou invalide.')
    return { pack: null, errors }
  }

  let foundModule = false
  moduleKeys.forEach((module) => {
    const items = pack.modules?.[module]
    if (items === undefined) return
    foundModule = true
    if (!Array.isArray(items)) {
      errors.push(`${moduleMeta[module].label} : un tableau est attendu.`)
      return
    }
    const ids = new Set<string>()
    const keys = new Set<string>()
    items.forEach((item, index) => {
      errors.push(...validateItem(module, item, index))
      const typed = item as { id?: string }
      if (typed.id) {
        if (ids.has(typed.id)) errors.push(`${moduleMeta[module].label} : id ${typed.id} présent plusieurs fois.`)
        ids.add(typed.id)
      }
      try {
        const key = naturalKey(module, item)
        if (key && keys.has(key)) errors.push(`${moduleMeta[module].label} : doublon dans le fichier (${key}).`)
        if (key) keys.add(key)
      } catch {
        // Les erreurs de forme sont déjà rapportées plus haut.
      }
    })
  })

  if (!foundModule) errors.push('Aucun module importable dans ce fichier.')
  return { pack: errors.length ? null : (raw as ContentPack), errors }
}

function buildPack(current: CurrentContent): ContentPack {
  return {
    schema: 'anniv-2026-content-pack',
    version: 2,
    exportedAt: new Date().toISOString(),
    source: window.location.origin,
    modules: {
      bingo: current.bingo.map((row) => asPackItem('bingo', row) as BingoPackItem),
      missions: current.missions.map((row) => asPackItem('missions', row) as MissionPackItem),
      room: current.room.map((row) => asPackItem('room', row) as RoomPackItem),
      iceberg: current.iceberg.map((row) => asPackItem('iceberg', row) as IcebergPackItem),
      photos: current.photos.map((row) => asPackItem('photos', row) as PhotoPackItem),
    },
  }
}

function download(name: string, text: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }))
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = name
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}

function csvCell(value: unknown) {
  const text = typeof value === 'string' ? value : JSON.stringify(value ?? '')
  return `"${text.replaceAll('"', '""')}"`
}

function ContentManager() {
  const fileRef = useRef<HTMLInputElement>(null)
  const [current, setCurrent] = useState<CurrentContent>({
    bingo: [],
    missions: [],
    room: [],
    iceberg: [],
    photos: [],
  })
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [pack, setPack] = useState<ContentPack | null>(null)
  const [fileName, setFileName] = useState('')
  const [parseErrors, setParseErrors] = useState<string[]>([])
  const [mode, setMode] = useState<ImportMode>('merge')
  const [selected, setSelected] = useState<Record<ModuleKey, boolean>>({
    bingo: true,
    missions: true,
    room: true,
    iceberg: true,
    photos: true,
  })
  const [lastSummary, setLastSummary] = useState<ImportSummary | null>(null)

  const loadContent = useCallback(async () => {
    const [bingo, missions, room, iceberg, photos] = await Promise.all([
      supabase.from('bingo_prompts').select('id, text, sort_order, is_active').order('sort_order'),
      supabase.from('secret_mission_prompts').select('id, text, difficulty, sort_order, is_active').order('sort_order'),
      supabase.from('live_vote_questions').select('id, mode, prompt, options, correct_player_key, suspects, reveal_note, timer_seconds, sort_order, is_active').order('sort_order'),
      supabase.from('iceberg_entries').select('id, level, title, description, sort_order, is_published').order('level').order('sort_order'),
      supabase.from('photo_hunt_challenges').select('id, prompt, hint, sort_order, is_active').order('sort_order').order('created_at'),
    ])

    if (bingo.error || missions.error || room.error || iceberg.error || photos.error) {
      console.error('Unable to load content manager:', bingo.error, missions.error, room.error, iceberg.error, photos.error)
      setError('Impossible de charger tout le contenu à sauvegarder.')
    } else {
      setCurrent({
        bingo: (bingo.data ?? []) as BingoRow[],
        missions: (missions.data ?? []) as MissionRow[],
        room: (room.data ?? []) as RoomRow[],
        iceberg: (iceberg.data ?? []) as IcebergRow[],
        photos: (photos.data ?? []) as PhotoRow[],
      })
      setError('')
    }
    setLoading(false)
  }, [])

  useEffect(() => { void loadContent() }, [loadContent])

  const preview = useMemo<Record<ModuleKey, PreviewStats>>(() => {
    const result = {} as Record<ModuleKey, PreviewStats>
    moduleKeys.forEach((module) => {
      const incoming = pack?.modules[module] ?? []
      const existingRows = current[module] as CurrentRow[]
      const existing = existingRows.map((row) => asPackItem(module, row) as Record<string, unknown>)
      const byId = new Map(existing.map((item) => [String(item.id), item]))
      const byNatural = new Map(existing.map((item) => [naturalKey(module, item), item]))
      const keep = new Set<string>()
      const stats: PreviewStats = { incoming: incoming.length, added: 0, updated: 0, unchanged: 0, matched: 0, disabled: 0, errors: [] }

      incoming.forEach((raw, index) => {
        stats.errors.push(...validateItem(module, raw, index))
        const item = raw as unknown as Record<string, unknown>
        const id = typeof item.id === 'string' ? item.id : ''
        const idMatch = id ? byId.get(id) : undefined
        if (idMatch) {
          keep.add(String(idMatch.id))
          if (comparable(idMatch) === comparable(item)) stats.unchanged += 1
          else stats.updated += 1
          return
        }
        const naturalMatch = byNatural.get(naturalKey(module, raw))
        if (naturalMatch) {
          keep.add(String(naturalMatch.id))
          stats.matched += 1
        } else {
          stats.added += 1
          if (id) keep.add(id)
        }
      })

      if (mode === 'restore') {
        existing.forEach((item) => {
          const active = module === 'iceberg' ? Boolean(item.isPublished) : Boolean(item.isActive)
          if (active && !keep.has(String(item.id))) stats.disabled += 1
        })
      }
      result[module] = stats
    })
    return result
  }, [current, mode, pack])

  const selectedModules = moduleKeys.filter((module) => selected[module] && Array.isArray(pack?.modules[module]))
  const totalErrors = parseErrors.length + selectedModules.reduce((sum, module) => sum + preview[module].errors.length, 0)

  const handleRawFile = async (file?: File | null) => {
    if (!file) return
    setSuccess('')
    setLastSummary(null)
    setFileName(file.name)
    if (file.size > 2_000_000) {
      setPack(null)
      setParseErrors(['Fichier trop volumineux (2 Mo maximum).'])
      return
    }
    try {
      const raw = JSON.parse(await file.text()) as unknown
      const validation = validatePack(raw)
      setPack(validation.pack)
      setParseErrors(validation.errors)
      if (validation.pack) {
        setSelected((currentSelection) => {
          const next = { ...currentSelection }
          moduleKeys.forEach((module) => { next[module] = Array.isArray(validation.pack?.modules[module]) })
          return next
        })
      }
    } catch {
      setPack(null)
      setParseErrors(['JSON illisible ou mal formé.'])
    }
  }

  const handleFile = (event: ChangeEvent<HTMLInputElement>) => { void handleRawFile(event.target.files?.[0]) }
  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    void handleRawFile(event.dataTransfer.files?.[0])
  }

  const exportJson = () => {
    const date = new Date().toISOString().slice(0, 10)
    download(`anniv-2026-content-${date}.json`, JSON.stringify(buildPack(current), null, 2), 'application/json;charset=utf-8')
  }

  const exportCsv = (module: ModuleKey) => {
    const rows = (current[module] as CurrentRow[]).map((row) => asPackItem(module, row) as Record<string, unknown>)
    const columns = rows.length ? Object.keys(rows[0]) : ['id']
    const csv = [columns.map(csvCell).join(','), ...rows.map((row) => columns.map((column) => csvCell(row[column])).join(','))].join('\n')
    download(`anniv-2026-${module}.csv`, `\ufeff${csv}`, 'text/csv;charset=utf-8')
  }

  const applyImport = async () => {
    if (!pack || busy || selectedModules.length === 0 || totalErrors > 0) return
    const warning = mode === 'restore'
      ? 'Restaurer va aussi masquer/désactiver le contenu actuel absent du fichier pour les modules cochés. Continuer ?'
      : 'Fusionner ce contenu avec la base actuelle ?'
    if (!window.confirm(warning)) return

    setBusy(true)
    setError('')
    setSuccess('')
    const { data, error: rpcError } = await supabase.rpc('admin_import_content_pack', {
      p_pack: pack,
      p_mode: mode,
      p_modules: selectedModules,
    })
    setBusy(false)

    if (rpcError) {
      console.error('Unable to import content pack:', rpcError)
      setError('L’import transactionnel a échoué. Aucun changement n’a été appliqué.')
      return
    }

    const result = data as ImportResult
    if (!result.ok || !result.summary) {
      setError(result.message ? `Import refusé : ${result.message}` : 'Le fichier a été refusé par le serveur. Aucun changement n’a été appliqué.')
      return
    }

    setLastSummary(result.summary)
    setSuccess('Import appliqué en une seule transaction. Le contenu a été resynchronisé.')
    await loadContent()
  }

  const totalCurrent = moduleKeys.reduce((sum, module) => sum + current[module].length, 0)

  return (
    <main className="content-manager">
      <div className="content-manager__glow" />
      <header className="content-manager__header">
        <div>
          <Link to="/admin" className="back-link">← Control Room</Link>
          <p className="content-manager__eyebrow">Anniv 2026 / sauvegarde</p>
          <h1>Contenu <span>portable</span></h1>
          <p>Sauvegarde les contenus éditoriaux de la soirée, relis-les dans un tableur et restaure un pack sans toucher aux scores, aux joueurs ni aux historiques.</p>
        </div>
        <div className="content-manager__health">
          <strong>{loading ? '—' : totalCurrent}</strong>
          <span>éléments suivis</span>
        </div>
      </header>

      {error && <div className="content-manager__message content-manager__message--error">{error}</div>}
      {success && <div className="content-manager__message content-manager__message--success">{success}</div>}

      <section className="content-panel content-panel--export">
        <div className="content-panel__heading">
          <div><p className="content-manager__eyebrow">01 · Sauvegarder</p><h2>Exporter le contenu actuel</h2></div>
          <button type="button" className="content-primary" disabled={loading} onClick={exportJson}>↓ Sauvegarde JSON complète</button>
        </div>
        <p className="content-panel__description">Le JSON v2 conserve les identifiants et tous les champs nécessaires à une restauration, Photo Hunt compris. Les anciens JSON v1 restent importables. Les CSV sont des copies pratiques pour relecture ou édition externe.</p>
        <div className="content-module-grid">
          {moduleKeys.map((module) => (
            <article className="content-module-card" key={module}>
              <span>{moduleMeta[module].icon}</span>
              <div><strong>{moduleMeta[module].label}</strong><small>{current[module].length} · {moduleMeta[module].detail}</small></div>
              <button type="button" disabled={loading} onClick={() => exportCsv(module)}>CSV ↓</button>
            </article>
          ))}
        </div>
      </section>

      <section className="content-panel">
        <div className="content-panel__heading"><div><p className="content-manager__eyebrow">02 · Prévisualiser</p><h2>Importer une sauvegarde JSON</h2></div></div>
        <input ref={fileRef} className="content-file-input" type="file" accept="application/json,.json" onChange={handleFile} />
        <div className="content-dropzone" role="button" tabIndex={0} onDragOver={(event) => event.preventDefault()} onDrop={handleDrop} onClick={() => fileRef.current?.click()} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') fileRef.current?.click() }}>
          <strong>{fileName || 'Dépose un fichier .json ici'}</strong>
          <span>{pack ? `Pack v${pack.version} valide · prévisualisation prête` : 'ou clique pour choisir une sauvegarde · 2 Mo max'}</span>
        </div>

        {parseErrors.length > 0 && (
          <div className="content-validation">
            <strong>Fichier refusé</strong>
            {parseErrors.slice(0, 12).map((message) => <span key={message}>• {message}</span>)}
          </div>
        )}

        {pack && (
          <>
            <div className="content-mode-switch">
              <button type="button" className={mode === 'merge' ? 'is-active' : ''} onClick={() => setMode('merge')}><strong>Fusionner</strong><span>Ajoute et met à jour, sans masquer le reste.</span></button>
              <button type="button" className={mode === 'restore' ? 'is-active is-danger' : ''} onClick={() => setMode('restore')}><strong>Restaurer</strong><span>Synchronise le pack et masque les éléments absents.</span></button>
            </div>

            <div className="content-preview-grid">
              {moduleKeys.map((module) => {
                const present = Array.isArray(pack.modules[module])
                const stats = preview[module]
                return (
                  <label className={`content-preview-card${selected[module] && present ? ' is-selected' : ''}${!present ? ' is-missing' : ''}`} key={module}>
                    <div className="content-preview-card__top">
                      <input type="checkbox" checked={selected[module] && present} disabled={!present} onChange={(event) => setSelected((currentSelection) => ({ ...currentSelection, [module]: event.target.checked }))} />
                      <span>{moduleMeta[module].icon}</span>
                      <div><strong>{moduleMeta[module].label}</strong><small>{present ? `${stats.incoming} dans le fichier` : 'Absent du fichier'}</small></div>
                    </div>
                    {present && (
                      <div className="content-preview-stats">
                        <span><b>{stats.added}</b> nouveaux</span>
                        <span><b>{stats.updated}</b> modifiés</span>
                        <span><b>{stats.unchanged}</b> identiques</span>
                        <span><b>{stats.matched}</b> rapprochés</span>
                        {mode === 'restore' && <span className="is-warning"><b>{stats.disabled}</b> masqués</span>}
                        {stats.errors.length > 0 && <span className="is-error"><b>{stats.errors.length}</b> erreurs</span>}
                      </div>
                    )}
                  </label>
                )
              })}
            </div>

            {totalErrors > 0 && (
              <div className="content-validation">
                <strong>{totalErrors} erreur{totalErrors !== 1 ? 's' : ''} à corriger avant import</strong>
                {selectedModules.flatMap((module) => preview[module].errors).slice(0, 14).map((message) => <span key={message}>• {message}</span>)}
              </div>
            )}

            <div className="content-apply">
              <div>
                <strong>{mode === 'merge' ? 'Fusion transactionnelle' : 'Restauration non destructive'}</strong>
                <span>{selectedModules.length} module{selectedModules.length !== 1 ? 's' : ''} sélectionné{selectedModules.length !== 1 ? 's' : ''}. Aucune donnée de jeu, score, identité ou photo envoyée n’est importée.</span>
              </div>
              <button type="button" className={mode === 'restore' ? 'content-primary content-primary--danger' : 'content-primary'} disabled={busy || selectedModules.length === 0 || totalErrors > 0} onClick={() => void applyImport()}>{busy ? 'Application…' : mode === 'merge' ? 'Fusionner le pack' : 'Restaurer ce pack'}</button>
            </div>
          </>
        )}
      </section>

      {lastSummary && (
        <section className="content-panel content-panel--result">
          <p className="content-manager__eyebrow">03 · Résultat</p>
          <h2>Dernière opération appliquée</h2>
          <div className="content-result-grid">
            {moduleKeys.map((module) => {
              const summary = lastSummary[module]
              return <div key={module}><strong>{moduleMeta[module].label}</strong><span>+{summary.inserted} · {summary.updated} maj · {summary.matched} rapproché{summary.matched !== 1 ? 's' : ''} · {summary.disabled} masqué{summary.disabled !== 1 ? 's' : ''}</span></div>
            })}
          </div>
        </section>
      )}
    </main>
  )
}

export default ContentManager
