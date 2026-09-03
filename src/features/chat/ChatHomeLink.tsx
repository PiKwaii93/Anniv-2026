import { Link } from 'react-router-dom'
import { usePartyChat } from './usePartyChat'
import './chat.css'

export default function ChatHomeLink() {
  const { data, error } = usePartyChat({ summary: true })
  return <section className="guest-section" aria-label="Discussion des invités">
    <Link to="/chat" className="guest-activity chat-home-link">
      <span className="guest-activity__icon" aria-hidden="true">☏</span>
      <div><h2>La soirée</h2><p>{error ? 'Ouvrir la discussion · connexion à vérifier' : data?.open === false ? 'Discussion en pause · les messages restent lisibles' : 'Un mot, une question, un rendez-vous entre invités.'}</p></div>
      {data && data.unread > 0 ? <span className="chat-unread" aria-label={`${data.unread} messages non lus`}>{data.unread > 99 ? '99+' : data.unread}</span> : <span aria-hidden="true">→</span>}
    </Link>
  </section>
}
