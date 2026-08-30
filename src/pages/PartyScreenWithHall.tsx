import { useParty } from '../features/party/PartyContext'
import HallOfFameScreen from './HallOfFameScreen'
import PartyScreen from './PartyScreen'

function PartyScreenWithHall() {
  const { settings, loading } = useParty()

  if (!loading && settings.phase === 'ended') {
    return <HallOfFameScreen />
  }

  return <PartyScreen />
}

export default PartyScreenWithHall
