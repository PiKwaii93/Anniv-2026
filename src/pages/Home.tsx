import { Link } from 'react-router-dom'

const modules = [
  {
    title: 'Iceberg',
    subtitle: 'Secrets, dossiers & anecdotes',
    tag: 'À explorer',
    path: '/iceberg',
    className: 'module-card--iceberg',
  },
  {
    title: 'Beer Pong',
    subtitle: 'Draft, équipes & tournoi',
    tag: 'Compétition',
    path: '/beer-pong',
    className: 'module-card--beer-pong',
  },
  {
    title: 'Bingo',
    subtitle: 'Observe la soirée & coche les scènes',
    tag: 'Jeu perso',
    path: '/bingo',
    className: 'module-card--bingo',
  },
  {
    title: 'Invités',
    subtitle: 'Les participants de la soirée',
    tag: 'Guest list',
    path: '/guests',
    className: 'module-card--guests',
  },
  {
    title: 'Admin',
    subtitle: 'Gestion de la soirée',
    tag: 'Privé',
    path: '/admin',
    className: 'module-card--admin',
  },
]

function Home() {
  return (
    <main className="home">
      <div className="home__glow home__glow--one" />
      <div className="home__glow home__glow--two" />

      <section className="hero">
        <p className="hero__eyebrow">2026</p>

        <h1 className="hero__title">
          ANNIV
          <span>2026</span>
        </h1>

        <p className="hero__description">
          Bienvenue sur l&apos;application officielle de la soirée.
        </p>
      </section>

      <section className="modules" aria-label="Modules">
        {modules.map((module) => (
          <Link
            key={module.path}
            to={module.path}
            className={`module-card ${module.className}`}
          >
            <div className="module-card__top">
              <span className="module-card__tag">{module.tag}</span>
              <span className="module-card__arrow">↗</span>
            </div>

            <div>
              <h2>{module.title}</h2>
              <p>{module.subtitle}</p>
            </div>
          </Link>
        ))}
      </section>

      <footer className="home__footer">
        <span>Birthday App</span>
        <span>•</span>
        <span>2026</span>
      </footer>
    </main>
  )
}

export default Home
