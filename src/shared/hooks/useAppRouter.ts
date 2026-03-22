import { useCallback, useEffect, useState } from 'react'
import type {
  Filters,
  Route,
  TaskLayoutMode,
  TaskQuickGroupBy,
  TaskViewFilters,
  ThemeKey,
  TopView,
} from '../types'
import { parseRoute, readListUiStateFromSearch } from '../utils/route'
import { resolveThemeFromSearch } from '../utils/theme'

interface UseAppRouterOptions {
  initialListUiState: {
    activeView: TopView
    taskLayout: TaskLayoutMode
    taskQuickGroupBy: TaskQuickGroupBy
    showTaskFilters: boolean
    filters: Filters
    taskViewFilters: TaskViewFilters
  }
  setTheme: (theme: ThemeKey) => void
}

export function useAppRouter({ initialListUiState, setTheme }: UseAppRouterOptions) {
  const [route, setRoute] = useState<Route>(() => parseRoute(window.location.pathname))
  const [activeView, setActiveView] = useState<TopView>(initialListUiState.activeView)
  const [taskLayout, setTaskLayout] = useState<TaskLayoutMode>(initialListUiState.taskLayout)
  const [taskQuickGroupBy, setTaskQuickGroupBy] = useState<TaskQuickGroupBy>(initialListUiState.taskQuickGroupBy)
  const [showTaskFilters, setShowTaskFilters] = useState(initialListUiState.showTaskFilters)
  const [filters, setFilters] = useState<Filters>(initialListUiState.filters)
  const [taskViewFilters, setTaskViewFilters] = useState<TaskViewFilters>(initialListUiState.taskViewFilters)

  const navigate = useCallback((to: string) => {
    window.history.pushState({}, '', to)
    setRoute(parseRoute(to))
  }, [])

  const applyListUiStateFromSearch = useCallback((search: string) => {
    const next = readListUiStateFromSearch(search)
    setActiveView(next.activeView)
    setTaskLayout(next.taskLayout)
    setTaskQuickGroupBy(next.taskQuickGroupBy)
    setShowTaskFilters(next.showTaskFilters)
    setFilters(next.filters)
    setTaskViewFilters(next.taskViewFilters)
  }, [])

  useEffect(() => {
    const onPopState = () => {
      const nextRoute = parseRoute(window.location.pathname)
      setRoute(nextRoute)
      setTheme(resolveThemeFromSearch(window.location.search))
      if (nextRoute.kind === 'list') {
        applyListUiStateFromSearch(window.location.search)
      }
    }

    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [applyListUiStateFromSearch, setTheme])

  return {
    route,
    activeView,
    setActiveView,
    taskLayout,
    setTaskLayout,
    taskQuickGroupBy,
    setTaskQuickGroupBy,
    showTaskFilters,
    setShowTaskFilters,
    filters,
    setFilters,
    taskViewFilters,
    setTaskViewFilters,
    navigate,
  }
}
