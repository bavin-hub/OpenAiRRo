import { forwardRef, memo, useEffect, useImperativeHandle, useRef, useState } from 'react'

/**
 * @typedef {{ getValue: () => string, focus: () => void }} OmniboxHandle
 */

/**
 * Address bar with local draft state so typing does not re-render the app shell/webview.
 * @param {{
 *   tabId: string,
 *   seedValue: string,
 *   onSubmit: (value: string) => void,
 *   onFocusChange?: (focused: boolean) => void,
 *   onDraftCommit?: (value: string) => void,
 * }} props
 * @param {React.Ref<OmniboxHandle>} ref
 */
const Omnibox = memo(
  forwardRef(function Omnibox({ tabId, seedValue, onSubmit, onFocusChange, onDraftCommit }, ref) {
    const [value, setValue] = useState(seedValue)
    const inputRef = useRef(/** @type {HTMLInputElement | null} */ (null))
    const focusedRef = useRef(false)

    useEffect(() => {
      if (focusedRef.current) return
      setValue(seedValue)
    }, [tabId, seedValue])

    useImperativeHandle(
      ref,
      () => ({
        getValue: () => value,
        focus: () => {
          inputRef.current?.focus()
        },
      }),
      [value],
    )

    const commitDraft = (next) => {
      onDraftCommit?.(next)
    }

    return (
      <input
        ref={inputRef}
        className="omnibox"
        type="text"
        value={value}
        onChange={(e) => {
          setValue(e.target.value)
          onFocusChange?.(true)
          window.requestAnimationFrame(() => {
            inputRef.current?.focus()
          })
        }}
        onMouseDown={(e) => {
          e.stopPropagation()
        }}
        onFocus={() => {
          focusedRef.current = true
          onFocusChange?.(true)
        }}
        onBlur={() => {
          focusedRef.current = false
          onFocusChange?.(false)
          commitDraft(inputRef.current?.value ?? value)
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            const next = e.currentTarget.value
            commitDraft(next)
            onSubmit(next)
          }
        }}
        placeholder="Search or enter address"
        spellCheck={false}
        autoComplete="off"
        aria-label="Address and search"
      />
    )
  }),
)

Omnibox.displayName = 'Omnibox'

export default Omnibox
