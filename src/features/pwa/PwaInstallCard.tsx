import { usePwa } from './PwaState'
import './pwa.css'

type Props = {
  placement: 'onboarding' | 'settings'
  hasIdentity?: boolean
}

function IosInstructions({ browser }: { browser: ReturnType<typeof usePwa>['iosBrowser'] }) {
  const needsSafari = browser !== 'safari'

  return (
    <div className="pwa-install__ios-instructions">
      {needsSafari && <p>Ouvre d’abord cette page dans <strong>Safari</strong>.</p>}
      <ol>
        <li>Appuie sur <strong>Partager</strong></li>
        <li>Choisis <strong>Sur l’écran d’accueil</strong></li>
        <li>Ouvre <strong>Anniv 2026</strong> depuis l’icône</li>
      </ol>
    </div>
  )
}

export default function PwaInstallCard({ placement, hasIdentity = false }: Props) {
  const pwa = usePwa()

  if (placement === 'onboarding') {
    if (pwa.installed) return null
    if (pwa.platform !== 'ios' && pwa.dismissed) return null
    if (pwa.platform === 'android' && !pwa.canInstall) return null
    if (pwa.platform !== 'android' && pwa.platform !== 'ios') return null

    return (
      <aside className="pwa-install pwa-install--onboarding" aria-label="Installer l’application">
        <div className="pwa-install__mark" aria-hidden="true">↗</div>
        <div className="pwa-install__copy">
          <strong>{pwa.platform === 'ios' ? 'Installation sur iPhone ou iPad' : 'Installer Anniv 2026'}</strong>
          {pwa.platform === 'ios'
            ? <IosInstructions browser={pwa.iosBrowser} />
            : <p>Accède plus vite aux jeux pendant la soirée.</p>}
        </div>
        {pwa.platform === 'android' && (
          <div className="pwa-install__actions">
            <button type="button" className="pwa-install__later" onClick={pwa.dismissInstall}>Plus tard</button>
            {pwa.canInstall && (
            <button type="button" className="pwa-install__primary" onClick={() => void pwa.install()}>Installer</button>
            )}
          </div>
        )}
      </aside>
    )
  }

  return (
    <details className="pwa-settings">
      <summary>
        <span className="pwa-settings__icon" aria-hidden="true">↗</span>
        <span><strong>Application</strong><small>{pwa.installed ? 'Installée sur cet appareil' : 'Accès rapide depuis l’écran d’accueil'}</small></span>
        <span aria-hidden="true">⌄</span>
      </summary>
      <div className="pwa-settings__body">
        {pwa.installed && <p>Anniv 2026 est ouverte comme une application.</p>}
        {!pwa.installed && pwa.platform === 'android' && pwa.canInstall && (
          <><p>Installe l’application pour retrouver les jeux plus vite.</p><button type="button" onClick={() => void pwa.install()}>Installer</button></>
        )}
        {!pwa.installed && pwa.platform === 'android' && !pwa.canInstall && <p>L’installation sera proposée ici dès que ton navigateur la rendra disponible.</p>}
        {!pwa.installed && pwa.platform === 'ios' && hasIdentity && <p>Dans l’app installée, tu devras choisir ton prénom une nouvelle fois.</p>}
        {!pwa.installed && pwa.platform === 'ios' && <IosInstructions browser={pwa.iosBrowser} />}
        {!pwa.installed && pwa.platform === 'other' && <p>L’application reste entièrement utilisable dans ce navigateur.</p>}
      </div>
    </details>
  )
}
