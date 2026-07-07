import { BrowserWindow, app, ipcMain, screen } from 'electron';
import { join } from 'path';
import { IPC_CHANNELS } from '../shared/ipc-channels';
import { DESK_PET_STATES, type DeskPetState } from '../shared/types';

let deskPetWindow: BrowserWindow | null = null;
let chatWindow: BrowserWindow | null = null;
let currentState: DeskPetState = 'idle';
let sizePersistence:
  | {
      read: () => unknown;
      write: (size: number) => void;
    }
  | null = null;
let gesture:
  | {
      type: 'drag' | 'resize';
      startMouseX: number;
      startMouseY: number;
      startBounds: Electron.Rectangle;
    }
  | null = null;
let repaintTimer: NodeJS.Timeout | null = null;

const isDev = !app.isPackaged;
const validStates = new Set<string>(DESK_PET_STATES);
const DEFAULT_SIZE = 120;
const MIN_SIZE = 96;
const MAX_SIZE = 288;
const CHAT_WIDTH = 360;
const CHAT_HEIGHT = 420;
export const DESK_PET_SIZE_SETTING_KEY = 'desk_pet_size';

function getDeskPetHtmlPath(): string {
  return isDev
    ? join(__dirname, '..', '..', 'assets', 'desk-pet', 'desk-pet-window.html')
    : join(process.resourcesPath, 'assets', 'desk-pet', 'desk-pet-window.html');
}

function getDeskPetChatHtmlPath(): string {
  return isDev
    ? join(__dirname, '..', '..', 'assets', 'desk-pet', 'desk-pet-chat-window.html')
    : join(process.resourcesPath, 'assets', 'desk-pet', 'desk-pet-chat-window.html');
}

export function isDeskPetState(value: unknown): value is DeskPetState {
  return typeof value === 'string' && validStates.has(value);
}

function pushStateToWindow(): void {
  if (!deskPetWindow || deskPetWindow.isDestroyed() || deskPetWindow.webContents.isLoading()) {
    return;
  }

  const stateJson = JSON.stringify(currentState);
  deskPetWindow.webContents.executeJavaScript(`window.setDeskPetState?.(${stateJson});`).catch((error) => {
    console.warn('[DeskPet] Failed to update state:', error);
  });
}

function isDeskPetSender(sender: Electron.WebContents): boolean {
  return !!deskPetWindow && !deskPetWindow.isDestroyed() && sender.id === deskPetWindow.webContents.id;
}

function isDeskPetOrChatSender(sender: Electron.WebContents): boolean {
  const fromPet = !!deskPetWindow && !deskPetWindow.isDestroyed() && sender.id === deskPetWindow.webContents.id;
  const fromChat = !!chatWindow && !chatWindow.isDestroyed() && sender.id === chatWindow.webContents.id;
  return fromPet || fromChat;
}

function normalizePoint(point: unknown): { screenX: number; screenY: number } | null {
  if (!point || typeof point !== 'object') return null;
  const { screenX, screenY } = point as { screenX?: unknown; screenY?: unknown };
  if (typeof screenX !== 'number' || typeof screenY !== 'number') return null;
  return { screenX, screenY };
}

function clampSize(size: number): number {
  return Math.min(MAX_SIZE, Math.max(MIN_SIZE, Math.round(size)));
}

function normalizeSize(value: unknown): number {
  const parsed = typeof value === 'number'
    ? value
    : typeof value === 'string' && value.trim()
      ? Number(value)
      : NaN;
  return Number.isFinite(parsed) ? clampSize(parsed) : DEFAULT_SIZE;
}

function getInitialSize(): number {
  if (!sizePersistence) return DEFAULT_SIZE;
  try {
    return normalizeSize(sizePersistence.read());
  } catch (error) {
    console.warn('[DeskPet] Failed to read saved size:', error);
    return DEFAULT_SIZE;
  }
}

function saveSize(size: number): void {
  if (!sizePersistence) return;
  try {
    sizePersistence.write(clampSize(size));
  } catch (error) {
    console.warn('[DeskPet] Failed to save size:', error);
  }
}

function clearRepaintTimer(): void {
  if (repaintTimer) {
    clearTimeout(repaintTimer);
    repaintTimer = null;
  }
}

function forceNativeCompositeRefresh(): void {
  if (!deskPetWindow || deskPetWindow.isDestroyed()) return;
  if (repaintTimer) return;

  const bounds = deskPetWindow.getBounds();
  deskPetWindow.webContents.invalidate();
  deskPetWindow.webContents.executeJavaScript('window.forceDeskPetRepaint?.();').catch((error) => {
    console.warn('[DeskPet] Failed to force repaint:', error);
  });

  // Windows can leave stale backing pixels on transparent always-on-top windows
  // after another Electron window minimizes or loses focus. A 1px bounds nudge
  // forces DWM to rebuild this layered window, matching the manual resize workaround.
  deskPetWindow.setBounds({ ...bounds, width: bounds.width + 1, height: bounds.height + 1 });
  repaintTimer = setTimeout(() => {
    if (!deskPetWindow || deskPetWindow.isDestroyed()) return;
    deskPetWindow.setBounds(bounds);
    deskPetWindow.showInactive();
    repaintTimer = null;
  }, 16);
}

export function refreshDeskPetWindowComposite(): void {
  if (!deskPetWindow || deskPetWindow.isDestroyed()) return;
  forceNativeCompositeRefresh();
}

function getChatBounds(): Electron.Rectangle | null {
  if (!deskPetWindow || deskPetWindow.isDestroyed()) return null;
  const petBounds = deskPetWindow.getBounds();
  const { workArea } = screen.getDisplayMatching(petBounds);
  const gap = 10;
  const leftX = petBounds.x - CHAT_WIDTH - gap;
  const rightX = petBounds.x + petBounds.width + gap;
  const x = leftX >= workArea.x
    ? leftX
    : Math.min(rightX, workArea.x + workArea.width - CHAT_WIDTH);
  const y = Math.min(
    Math.max(workArea.y, petBounds.y + petBounds.height - CHAT_HEIGHT),
    workArea.y + workArea.height - CHAT_HEIGHT
  );

  return {
    x: Math.round(Math.max(workArea.x, x)),
    y: Math.round(y),
    width: CHAT_WIDTH,
    height: CHAT_HEIGHT,
  };
}

function anchorChatWindow(): void {
  if (!chatWindow || chatWindow.isDestroyed()) return;
  const bounds = getChatBounds();
  if (bounds) {
    chatWindow.setBounds(bounds);
  }
}

function createChatWindow(): BrowserWindow | null {
  if (!deskPetWindow || deskPetWindow.isDestroyed()) return null;
  if (chatWindow && !chatWindow.isDestroyed()) {
    anchorChatWindow();
    chatWindow.show();
    chatWindow.focus();
    return chatWindow;
  }

  const bounds = getChatBounds();
  if (!bounds) return null;

  chatWindow = new BrowserWindow({
    title: '',
    ...bounds,
    show: false,
    useContentSize: true,
    frame: false,
    transparent: true,
    thickFrame: false,
    hasShadow: false,
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    autoHideMenuBar: true,
    backgroundColor: '#00000000',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  chatWindow.setAlwaysOnTop(true, 'normal');
  chatWindow.setTitle('');
  chatWindow.loadFile(getDeskPetChatHtmlPath());
  chatWindow.webContents.on('page-title-updated', (event) => {
    event.preventDefault();
    chatWindow?.setTitle('');
  });
  chatWindow.webContents.on('context-menu', (event) => {
    event.preventDefault();
  });
  chatWindow.webContents.on('did-finish-load', () => {
    chatWindow?.show();
    chatWindow?.focus();
  });
  chatWindow.on('closed', () => {
    chatWindow = null;
  });

  return chatWindow;
}

function restoreDeskPetBounds(bounds: Electron.Rectangle | null): void {
  if (!bounds || !deskPetWindow || deskPetWindow.isDestroyed()) return;
  const current = deskPetWindow.getBounds();
  if (
    current.x === bounds.x &&
    current.y === bounds.y &&
    current.width === bounds.width &&
    current.height === bounds.height
  ) {
    return;
  }
  deskPetWindow.setBounds(bounds);
}

function hideChatWindow(): void {
  if (chatWindow && !chatWindow.isDestroyed()) {
    chatWindow.hide();
  }
}

function closeChatWindow(): void {
  if (chatWindow && !chatWindow.isDestroyed()) {
    chatWindow.close();
  }
  chatWindow = null;
}

function setChatWindowOpen(open: boolean): void {
  const petBounds = deskPetWindow && !deskPetWindow.isDestroyed() ? deskPetWindow.getBounds() : null;
  if (open) {
    createChatWindow();
  } else {
    hideChatWindow();
  }
  restoreDeskPetBounds(petBounds);
}

function toggleChatWindow(): void {
  const petBounds = deskPetWindow && !deskPetWindow.isDestroyed() ? deskPetWindow.getBounds() : null;
  if (chatWindow && !chatWindow.isDestroyed() && chatWindow.isVisible()) {
    hideChatWindow();
  } else {
    createChatWindow();
  }
  restoreDeskPetBounds(petBounds);
}

ipcMain.on(IPC_CHANNELS.DESK_PET_WINDOW_BEGIN_DRAG, (event, point) => {
  if (!isDeskPetSender(event.sender) || !deskPetWindow) return;
  const normalized = normalizePoint(point);
  if (!normalized) return;
  gesture = {
    type: 'drag',
    startMouseX: normalized.screenX,
    startMouseY: normalized.screenY,
    startBounds: deskPetWindow.getBounds(),
  };
});

ipcMain.on(IPC_CHANNELS.DESK_PET_WINDOW_DRAG, (event, point) => {
  if (!isDeskPetSender(event.sender) || !deskPetWindow || gesture?.type !== 'drag') return;
  const normalized = normalizePoint(point);
  if (!normalized) return;
  deskPetWindow.setBounds({
    x: Math.round(gesture.startBounds.x + normalized.screenX - gesture.startMouseX),
    y: Math.round(gesture.startBounds.y + normalized.screenY - gesture.startMouseY),
    width: gesture.startBounds.width,
    height: gesture.startBounds.height,
  });
  anchorChatWindow();
});

ipcMain.on(IPC_CHANNELS.DESK_PET_WINDOW_BEGIN_RESIZE, (event, point) => {
  if (!isDeskPetSender(event.sender) || !deskPetWindow) return;
  const normalized = normalizePoint(point);
  if (!normalized) return;
  gesture = {
    type: 'resize',
    startMouseX: normalized.screenX,
    startMouseY: normalized.screenY,
    startBounds: deskPetWindow.getBounds(),
  };
});

ipcMain.on(IPC_CHANNELS.DESK_PET_WINDOW_RESIZE, (event, point) => {
  if (!isDeskPetSender(event.sender) || !deskPetWindow || gesture?.type !== 'resize') return;
  const normalized = normalizePoint(point);
  if (!normalized) return;
  const delta = Math.max(normalized.screenX - gesture.startMouseX, normalized.screenY - gesture.startMouseY);
  const size = clampSize(gesture.startBounds.width + delta);
  deskPetWindow.setBounds({
    x: gesture.startBounds.x,
    y: gesture.startBounds.y,
    width: size,
    height: size,
  });
  anchorChatWindow();
});

ipcMain.on(IPC_CHANNELS.DESK_PET_WINDOW_END_GESTURE, (event) => {
  if (!isDeskPetSender(event.sender)) return;
  if (gesture?.type === 'resize' && deskPetWindow && !deskPetWindow.isDestroyed()) {
    saveSize(deskPetWindow.getBounds().width);
  }
  gesture = null;
});

ipcMain.on(IPC_CHANNELS.DESK_PET_WINDOW_SET_CHAT_OPEN, (event, open: boolean) => {
  if (!isDeskPetOrChatSender(event.sender)) return;
  setChatWindowOpen(Boolean(open));
});

ipcMain.on(IPC_CHANNELS.DESK_PET_WINDOW_TOGGLE_CHAT, (event) => {
  if (!isDeskPetSender(event.sender)) return;
  toggleChatWindow();
});

export function createDeskPetWindow(): BrowserWindow {
  if (deskPetWindow && !deskPetWindow.isDestroyed()) {
    pushStateToWindow();
    return deskPetWindow;
  }

  const { workArea } = screen.getPrimaryDisplay();
  const size = getInitialSize();

  deskPetWindow = new BrowserWindow({
    title: '',
    width: size,
    height: size,
    x: workArea.x + workArea.width - size - 24,
    y: workArea.y + workArea.height - size - 24,
    show: false,
    useContentSize: true,
    frame: false,
    transparent: true,
    thickFrame: false,
    hasShadow: false,
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    focusable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    autoHideMenuBar: true,
    backgroundColor: '#00000000',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  deskPetWindow.setAlwaysOnTop(true, 'normal');
  deskPetWindow.setTitle('');
  deskPetWindow.loadFile(getDeskPetHtmlPath(), { query: { state: currentState } });
  deskPetWindow.webContents.on('page-title-updated', (event) => {
    event.preventDefault();
    deskPetWindow?.setTitle('');
  });
  deskPetWindow.webContents.on('context-menu', (event) => {
    event.preventDefault();
  });
  deskPetWindow.webContents.on('did-finish-load', () => {
    pushStateToWindow();
    deskPetWindow?.showInactive();
  });

  deskPetWindow.on('closed', () => {
    clearRepaintTimer();
    closeChatWindow();
    deskPetWindow = null;
    gesture = null;
  });

  return deskPetWindow;
}

export function configureDeskPetSizePersistence(persistence: {
  read: () => unknown;
  write: (size: number) => void;
}): void {
  sizePersistence = persistence;
}

export function destroyDeskPetWindow(): void {
  closeChatWindow();
  if (deskPetWindow && !deskPetWindow.isDestroyed()) {
    deskPetWindow.close();
  }
  deskPetWindow = null;
}

export function setDeskPetEnabled(enabled: boolean): void {
  if (enabled) {
    createDeskPetWindow();
  } else {
    destroyDeskPetWindow();
  }
}

export function setDeskPetState(state: DeskPetState): void {
  currentState = state;
  pushStateToWindow();
}

export function getDeskPetState(): DeskPetState {
  return currentState;
}

export function isDeskPetWindowVisible(): boolean {
  return !!deskPetWindow && !deskPetWindow.isDestroyed();
}
