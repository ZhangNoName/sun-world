import { useNavigation } from 'react-router'

export function useRouteLoading() {
  const navigation = useNavigation()
  return { isLoading: navigation.state !== 'idle' }
}
