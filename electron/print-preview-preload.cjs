const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('printPreview', {
  print() {
    return ipcRenderer.invoke('print-preview-print')
  },
  close() {
    ipcRenderer.send('print-preview-close')
  },
})
