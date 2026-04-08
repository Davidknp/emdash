import { contextBridge, ipcRenderer } from 'electron';

// Expose protected methods that allow the renderer process to use
contextBridge.exposeInMainWorld('electronAPI', {
  // Generic invoke for the typed RPC client (createRPCClient)
  invoke: (channel: string, ...args: unknown[]) => ipcRenderer.invoke(channel, ...args),
  // Generic event bridge for the typesafe event emitter (createEventEmitter)
  eventSend: (channel: string, data: unknown) => ipcRenderer.send(channel, data),
  eventOn: (channel: string, cb: (data: unknown) => void) => {
    const wrapped = (_: Electron.IpcRendererEvent, data: unknown) => cb(data);
    ipcRenderer.on(channel, wrapped);
    return () => ipcRenderer.removeListener(channel, wrapped);
  },

  // Automations compatibility helpers
  automationsList: () => ipcRenderer.invoke('automations.list'),
  automationsGet: (args: { id: string }) => ipcRenderer.invoke('automations.get', args.id),
  automationsCreate: (args: unknown) => ipcRenderer.invoke('automations.create', args),
  automationsUpdate: (args: unknown) => ipcRenderer.invoke('automations.update', args),
  automationsDelete: (args: { id: string }) => ipcRenderer.invoke('automations.delete', args.id),
  automationsToggle: (args: { id: string }) => ipcRenderer.invoke('automations.toggle', args.id),
  automationsRunLogs: (args: { automationId: string; limit?: number }) =>
    ipcRenderer.invoke('automations.runLogs', args.automationId, args.limit),
  automationsTriggerNow: (args: { id: string }) =>
    ipcRenderer.invoke('automations.triggerNow', args.id),
  automationsCompleteRun: (_args: unknown) => Promise.resolve({ success: true }),
  automationsDrainTriggers: () => Promise.resolve({ success: true, data: [] }),
  onAutomationTriggerAvailable: (_cb: () => void) => () => {},

  worktreeCreate: (_projectId: string, _taskId: string, _branch?: string) =>
    Promise.resolve({ success: true }),
  worktreeRemove: (_projectId: string, _taskId: string) => Promise.resolve({ success: true }),
  onPtyExit: (_id: string, _cb: (payload: { exitCode: number }) => void) => () => {},
});
