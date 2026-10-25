/** Standardtitel eines neuen, leeren Plans (siehe `emptyProjectData`). */
export const DEFAULT_EVENT_NAME = 'Neues Event'

/**
 * Name in der Projektübersicht und Titel im Plan (`eventName`) gleichhalten.
 * Ein eigener Titel im Plan gewinnt (dort wird umbenannt) und kommt in die Übersicht (`renameTo`);
 * der Standardtitel gewinnt nie, dann gilt der Name aus der Übersicht und kommt in den Plan.
 */
export function reconcileName<T extends { eventName: string }>(listName: string, data: T): { data: T; renameTo: string | null } {
  const title = data.eventName?.trim()
  if (title && title !== DEFAULT_EVENT_NAME && title !== listName) return { data, renameTo: title }
  if (listName && title !== listName) return { data: { ...data, eventName: listName }, renameTo: null }
  return { data, renameTo: null }
}
