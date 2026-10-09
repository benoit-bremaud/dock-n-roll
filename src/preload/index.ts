// Runs in the renderer process, isolated from the page (contextIsolation + sandbox).
// The narrow IPC API of the spec (listServices, start, stop, openUrl, listBackground,
// onStatusChanged) is exposed here through contextBridge once the main-process
// handlers exist — nothing is exposed yet.
export {}
