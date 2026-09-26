import type { Change } from './types'

type Listener = (changes: Change[]) => void

const VERSION = 1

export type Store = ReturnType<typeof createStore>

export const hasContent = (change: Change) => Boolean(change.edit || change.comment?.trim())

export const createStore = (key: string) => {
  const listeners = new Set<Listener>()

  const read = (): Change[] => {
    try {
      const data = JSON.parse(localStorage.getItem(key) ?? 'null')
      return data?.version === VERSION && Array.isArray(data.changes) ? data.changes : []
    } catch {
      return []
    }
  }

  let changes = read()

  const emit = () => listeners.forEach(listener => listener(changes))

  const commit = (next: Change[]) => {
    changes = next
    try {
      localStorage.setItem(key, JSON.stringify({ version: VERSION, changes }))
    } catch {
      // Storage full or blocked: keep working in memory.
    }
    emit()
  }

  // Keep tabs on the same site in sync.
  const onStorage = (event: StorageEvent) => {
    if (event.key !== key) return
    changes = read()
    emit()
  }
  window.addEventListener('storage', onStorage)

  return {
    all: () => changes,
    get: (id: string) => changes.find(c => c.id === id),
    find: (path: string, selector: string) =>
      changes.find(c => c.page.path === path && c.target.selector === selector),
    /** Inserts or replaces by id. Entries with neither an edit nor a note are dropped. */
    put(change: Change) {
      const rest = changes.filter(c => c.id !== change.id)
      const exists = rest.length !== changes.length
      if (!hasContent(change)) return commit(rest)
      commit(exists ? changes.map(c => (c.id === change.id ? change : c)) : [...changes, change])
    },
    remove: (id: string) => commit(changes.filter(c => c.id !== id)),
    clear: () => commit([]),
    subscribe(listener: Listener) {
      listeners.add(listener)
      return () => void listeners.delete(listener)
    },
    dispose() {
      window.removeEventListener('storage', onStorage)
      listeners.clear()
    },
  }
}

export const newId = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36)
