import { EventEmitter } from 'node:events';
import { ipcMain } from 'electron';
import { createEventEmitter, type EmitterAdapter } from '@shared/ipc/events';
import { getMainWindow } from '@main/app/window';

/**
 * Main-side event bus that does two things on emit:
 *   1. Forwards the event to the renderer via webContents.send
 *   2. Dispatches to any in-process main-side subscribers
 *
 * This lets main-side services subscribe to events that other main-side
 * services emit (e.g. AutomationsService listening to agentSessionExitedChannel
 * emitted by the conversations service).
 */
function createMainAdapter(): EmitterAdapter {
  const inProcess = new EventEmitter();
  inProcess.setMaxListeners(100);

  return {
    emit: (eventName: string, data: unknown, topic?: string) => {
      const channel = topic ? `${eventName}.${topic}` : eventName;
      const win = getMainWindow();
      if (win && !win.isDestroyed()) {
        win.webContents.send(channel, data);
      }
      inProcess.emit(channel, data);
    },
    on: (eventName: string, cb: (data: unknown) => void, topic?: string) => {
      const channel = topic ? `${eventName}.${topic}` : eventName;
      const ipcHandler = (_e: Electron.IpcMainEvent, data: unknown) => cb(data);
      const inProcessHandler = (data: unknown) => cb(data);
      ipcMain.on(channel, ipcHandler);
      inProcess.on(channel, inProcessHandler);
      return () => {
        ipcMain.removeListener(channel, ipcHandler);
        inProcess.removeListener(channel, inProcessHandler);
      };
    },
  };
}

export const events = createEventEmitter(createMainAdapter());
