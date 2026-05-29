import { useShellLightMode } from './useShellLightMode.js'

/** AiRRo wordmark rendered in the expanded left sidebar chrome. */
export default function AiRRoWordmark() {
  const shellLight = useShellLightMode()

  const shell = shellLight ? 'border-slate-200 bg-white text-slate-700' : 'border-white/10 bg-white/[0.06] text-slate-200'

  return (
    <div aria-label="AiRRo" className={`flex h-8 w-fit max-w-full items-center justify-center rounded-full border px-3.5 shadow-sm ${shell}`}>
      <span className="text-xs font-semibold uppercase tracking-[0.14em]">AiRRo</span>
    </div>
  )
}
