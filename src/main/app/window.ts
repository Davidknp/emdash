import { join } from 'node:path';
import { BrowserWindow } from 'electron';
import appIcon from '@/assets/images/emdash/emdash_logo.png?asset';
import { appSettingsService } from '@main/core/settings/settings-service';
import { capture, checkAndReportDailyActiveUser } from '@main/lib/telemetry';
import { registerExternalLinkHandlers } from '@main/utils/externalLinks';
import { APP_ORIGIN } from './protocol';

let mainWindow: BrowserWindow | null = null;

export function createMainWindow(): BrowserWindow {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 700,
    minHeight: 500,
    title: 'Emdash',
    // In production, electron-builder injects the icon from the app bundle.
    ...(import.meta.env.DEV && { icon: appIcon }),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      // Required for ESM preload scripts (.mjs)
      sandbox: false,
      // Allow using <webview> in renderer for in‑app browser pane.
      // The webview runs in a separate process; nodeIntegration remains disabled.
      webviewTag: true,
      // Enables rubber-band scrolling on macOS, which also makes Chromium
      // emit horizontal wheel events for 2-finger trackpad swipes when the
      // page can't scroll further — required for our swipe-nav handler.
      scrollBounce: true,
      // __dirname resolves to out/main/ at runtime; preload is at out/preload/index.mjs
      preload: join(__dirname, '../preload/index.mjs'),
    },
    ...(process.platform === 'darwin'
      ? { titleBarStyle: 'hiddenInset', trafficLightPosition: { x: 10, y: 10 } }
      : {}),
    show: false,
  });

  if (import.meta.env.DEV) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL!);
  } else {
    mainWindow.loadURL(`${APP_ORIGIN}/index.html`);
  }

  // Route external links to the user’s default browser
  registerExternalLinkHandlers(mainWindow, import.meta.env.DEV);

  // Show when ready
  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });

  // Track window focus for telemetry
  mainWindow.on('focus', () => {
    capture('app_window_focused');
    mainWindow?.setWindowButtonVisibility(true);
    checkAndReportDailyActiveUser();
  });

  // macOS trackpad two-finger swipe navigation (respects setting)
  if (process.platform === 'darwin') {
    mainWindow.on('swipe', (_event, direction) => {
      void appSettingsService.get('navigation').then((navigation) => {
        if (!navigation.trackpadSwipe) return;
        if (direction === 'left') {
          mainWindow?.webContents.send('navigate:back');
        } else if (direction === 'right') {
          mainWindow?.webContents.send('navigate:forward');
        }
      });
    });
  }

  // Windows/Linux mouse back/forward buttons via app-command
  if (process.platform !== 'darwin') {
    mainWindow.on('app-command', (_event, command) => {
      if (command === 'browser-backward') {
        mainWindow?.webContents.send('navigate:back');
      } else if (command === 'browser-forward') {
        mainWindow?.webContents.send('navigate:forward');
      }
    });
  }

  // Cleanup reference on close
  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  return mainWindow;
}

export function getMainWindow(): BrowserWindow | null {
  return mainWindow;
}
