import { Component, type ErrorInfo, type ReactNode } from 'react'

import './AppErrorBoundary.css'

type Props = {
  children: ReactNode
}

type State = {
  failed: boolean
  incidentId: string
}

export default class AppErrorBoundary extends Component<Props, State> {
  state: State = {
    failed: false,
    incidentId: '',
  }

  static getDerivedStateFromError(): State {
    return {
      failed: true,
      incidentId: crypto.randomUUID().slice(0, 8).toUpperCase(),
    }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[App][UNEXPECTED_CRASH]', {
      incidentId: this.state.incidentId,
      message: error.message,
      componentStack: info.componentStack,
    })
  }

  private reload = () => {
    window.location.reload()
  }

  private goHome = () => {
    window.location.assign('/')
  }

  render() {
    if (!this.state.failed) return this.props.children

    return (
      <main className="app-crash" role="alert">
        <section className="app-crash__card">
          <p className="app-crash__eyebrow">Anniv 2026 · récupération</p>
          <div className="app-crash__mark" aria-hidden="true">↻</div>
          <h1>L’application a rencontré un problème.</h1>
          <p>
            Tes données déjà enregistrées restent conservées. Recharge la page
            pour reprendre la soirée.
          </p>
          <div className="app-crash__actions">
            <button type="button" onClick={this.reload}>Recharger</button>
            <button type="button" className="app-crash__secondary" onClick={this.goHome}>
              Retour à l’accueil
            </button>
          </div>
          <small>Référence : {this.state.incidentId}</small>
        </section>
      </main>
    )
  }
}
