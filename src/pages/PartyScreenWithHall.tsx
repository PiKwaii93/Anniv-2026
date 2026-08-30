import { useParty } from '../features/party/PartyContext'
import HallOfFameScreen from './HallOfFameScreen'
import PartyScreen from './PartyScreen'
import PhotoHuntScreen from './PhotoHuntScreen'

function PartyScreenWithHall() {
  const { settings, loading } = useParty()

  if (!loading && settings.phase === 'ended') {
    return <HallOfFameScreen />
  }

  if (!loading && settings.featuredModule === 'photos') {
    return <PhotoHuntScreen />
  }

  return <PartyScreen />
}

export default PartyScreenWithHall
