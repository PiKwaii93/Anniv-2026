import { Link } from 'react-router-dom'
import { usePartyExtras } from './usePartyExtras'
import './extras.css'

export default function PartyExtrasHomeCards() {
  const { data } = usePartyExtras()
  if (!data) return null
  const cards = [
    { path: '/capsule', name: 'La capsule temporelle', tag: 'Quelques mots pour plus tard', text: 'Un souvenir, un message ou une prédiction pour Maxence.', visible: data.settings.capsule_visible, status: data.capsule.revealed ? 'La capsule est ouverte pour Maxence' : data.settings.capsule_open ? 'Écris ta lettre privée' : 'Collecte fermée', color: 'capsule' },
    { path: '/jukebox', name: 'On met quoi ?', tag: 'Jukebox participatif', text: 'Trois propositions par invité. Vote pour les pépites des autres.', visible: data.settings.jukebox_visible, status: data.settings.jukebox_open && data.phase !== 'ended' ? 'Propose et vote' : 'Retrouve la sélection', color: 'jukebox' },
    { path: '/duos', name: 'Les duos surprise', tag: 'Une rencontre, un défi', text: 'Un partenaire au hasard, un petit défi à relever ensemble.', visible: data.settings.duos_visible && data.phase !== 'ended', status: data.settings.duos_open && data.phase === 'live' ? 'Participe si tu en as envie' : 'Rendez-vous pendant la soirée', color: 'duos' },
  ]
  return cards.filter((card) => card.visible).map((card) => <Link key={card.path} to={card.path} className={`module-card extras-card extras-card--${card.color}`}><div className="module-card__top"><span className="module-card__tag">{card.tag}</span><span className="module-card__arrow">↗</span></div><div><h2>{card.name}</h2><p>{card.text}</p><span className="module-card__status">{card.status}</span></div></Link>)
}
