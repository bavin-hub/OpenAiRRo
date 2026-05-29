import './DownloadBar.css'

/**
 * @typedef {{
 *   id: string,
 *   filename: string,
 *   savePath: string,
 *   state: string,
 *   receivedBytes: number,
 *   totalBytes: number,
 * }} DownloadBarEntry
 * @param {{
 *   entries: DownloadBarEntry[],
 *   onOpen: (entry: DownloadBarEntry) => void,
 *   onOpenFolder: (entry: DownloadBarEntry) => void,
 *   onKeep: (entry: DownloadBarEntry) => void,
 *   onDiscard: (entry: DownloadBarEntry) => void,
 *   onCancel: (entry: DownloadBarEntry) => void,
 * }} props
 */
export default function DownloadBar({
  entries,
  onOpen,
  onOpenFolder,
  onKeep,
  onDiscard,
  onCancel,
}) {
  if (entries.length === 0) return null

  return (
    <div className="download-bar" role="region" aria-label="Download shelf">
      {entries.map((entry) => {
        const inProgress = entry.state === 'progressing'
        const completed = entry.state === 'completed'
        const failed = entry.state === 'cancelled' || entry.state === 'interrupted'
        const pct =
          entry.totalBytes > 0
            ? Math.min(100, Math.round((100 * entry.receivedBytes) / entry.totalBytes))
            : 0

        return (
          <div key={entry.id} className="download-bar-item" role="status" aria-live="polite">
            <div className="download-bar-main">
              <span className="download-bar-filename" title={entry.filename}>
                {entry.filename}
              </span>
              {inProgress ? (
                <div className="download-bar-progress-wrap">
                  <div
                    className="download-bar-progress"
                    role="progressbar"
                    aria-valuenow={pct}
                    aria-valuemin={0}
                    aria-valuemax={100}
                  >
                    <div className="download-bar-progress-fill" style={{ width: `${pct}%` }} />
                  </div>
                  <span className="download-bar-progress-label">
                    {entry.totalBytes > 0 ? `${pct}%` : 'Starting…'}
                  </span>
                </div>
              ) : (
                <span className="download-bar-status">
                  {completed ? 'Download complete' : failed ? 'Download failed' : entry.state}
                </span>
              )}
            </div>
            <div className="download-bar-actions">
              {completed && entry.savePath ? (
                <>
                  <button type="button" className="download-bar-btn" onClick={() => onOpen(entry)}>
                    Open
                  </button>
                  <button type="button" className="download-bar-btn" onClick={() => onOpenFolder(entry)}>
                    Open folder
                  </button>
                  <button type="button" className="download-bar-btn download-bar-btn--primary" onClick={() => onKeep(entry)}>
                    Keep
                  </button>
                  <button type="button" className="download-bar-btn download-bar-btn--danger" onClick={() => onDiscard(entry)}>
                    Discard
                  </button>
                </>
              ) : null}
              {inProgress ? (
                <button type="button" className="download-bar-btn download-bar-btn--danger" onClick={() => onCancel(entry)}>
                  Cancel
                </button>
              ) : null}
              {failed ? (
                <button type="button" className="download-bar-btn" onClick={() => onKeep(entry)}>
                  Dismiss
                </button>
              ) : null}
            </div>
          </div>
        )
      })}
    </div>
  )
}
