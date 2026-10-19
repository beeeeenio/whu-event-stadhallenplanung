/** Menüs der Kopfleiste (Versionen, Vorlagen) lassen sich auch aus der Befehlszeile öffnen. */
export type MenuName = 'versions' | 'templates'

const EVENT = 'stadthalle:open-menu'

export function openMenu(name: MenuName) {
  window.dispatchEvent(new CustomEvent(EVENT, { detail: name }))
}

/** Ruft `onOpen`, wenn das Menü `name` geöffnet werden soll; gibt die Abmeldung zurück. */
export function onOpenMenu(name: MenuName, onOpen: () => void) {
  const handler = (e: Event) => {
    if ((e as CustomEvent<MenuName>).detail === name) onOpen()
  }
  window.addEventListener(EVENT, handler)
  return () => window.removeEventListener(EVENT, handler)
}
