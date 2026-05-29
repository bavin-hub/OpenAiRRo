/** In-flight AI stream per tab (AbortController). RightNavBar registers; App aborts when a tab closes. */

/** @type {Map<string, AbortController>} */
const byTab = new Map()

export function replaceAiAbort(tabId, ac) {
  byTab.get(tabId)?.abort()
  byTab.set(tabId, ac)
}

/** Remove registration only if it is still this controller (avoids deleting a newer request). */
export function releaseAiAbort(tabId, ac) {
  if (byTab.get(tabId) === ac) byTab.delete(tabId)
}

export function abortAiForTab(tabId) {
  byTab.get(tabId)?.abort()
  byTab.delete(tabId)
}

export function abortAllAiStreams() {
  for (const ac of byTab.values()) ac.abort()
  byTab.clear()
}
