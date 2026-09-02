import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { safeMusicLink, songStatus, type Song } from './model'
import './extras.css'

export function ExtrasPage({ title, eyebrow, intro, error, children, admin = false }: { title: string; eyebrow: string; intro: string; error?: string; children: ReactNode; admin?: boolean }) {
  return <main className="extras-page">
    <nav className="extras-nav"><Link to={admin ? '/admin/live' : '/'}>← {admin ? 'Mode Directeur' : 'Accueil'}</Link>{admin ? <Link to="/screen" target="_blank" rel="noreferrer">Écran TV ↗</Link> : <Link to="/jukebox">Jukebox ↗</Link>}</nav>
    <header className="extras-hero"><p className="extras-eyebrow">{eyebrow}</p><h1>{title}</h1><p>{intro}</p></header>
    {error && <p className="extras-notice extras-notice--error" role="alert">{error}</p>}
    {children}
  </main>
}

export function SongCard({ song, children }: { song: Song; children?: ReactNode }) {
  const link = safeMusicLink(song.link)
  return <article className={`extras-song extras-song--${song.status}`}>
    <div className="extras-song__body"><span className="extras-pill">{songStatus[song.status]}</span><h3>{song.title}</h3><p>{song.artist}</p><small>{song.mine ? 'Ta proposition' : `Proposé par ${song.player_name}`} · {song.votes} vote{song.votes === 1 ? '' : 's'}</small>{link && <a href={link} target="_blank" rel="noreferrer">Ouvrir le morceau ↗</a>}</div>
    <div className="extras-actions">{children}</div>
  </article>
}
