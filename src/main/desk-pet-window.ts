import { BrowserWindow, app, ipcMain, screen } from 'electron';
import { join } from 'path';
import { IPC_CHANNELS } from '../shared/ipc-channels';
import { DESK_PET_STATES, type DeskPetChatMirrorEvent, type DeskPetState, type ProactiveMessage } from '../shared/types';

let deskPetWindow: BrowserWindow | null = null;
let chatWindow: BrowserWindow | null = null;
let proactiveBubbleWindow: BrowserWindow | null = null;
let screenQuestionWindow: BrowserWindow | null = null;
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
let proactiveBubbleTimer: NodeJS.Timeout | null = null;
const isDev = !app.isPackaged;
const validStates = new Set<string>(DESK_PET_STATES);
const DEFAULT_SIZE = 120;
const MIN_SIZE = 96;
const MAX_SIZE = 288;
const CHAT_WIDTH = 480;
const CHAT_HEIGHT = 540;
const PROACTIVE_BUBBLE_WIDTH = 300;
const PROACTIVE_BUBBLE_HEIGHT = 72;
const PROACTIVE_BUBBLE_MIN_HEIGHT = 48;
const PROACTIVE_BUBBLE_MAX_HEIGHT = 160;
const PROACTIVE_BUBBLE_GAP = 10;
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

function getDeskPetBubbleHtmlPath(): string {
  return isDev
    ? join(__dirname, '..', '..', 'assets', 'desk-pet', 'desk-pet-bubble-window.html')
    : join(process.resourcesPath, 'assets', 'desk-pet', 'desk-pet-bubble-window.html');
}

function getDeskPetScreenQuestionHtmlPath(): string {
  return isDev
    ? join(__dirname, '..', '..', 'assets', 'desk-pet', 'desk-pet-screen-question-window.html')
    : join(process.resourcesPath, 'assets', 'desk-pet', 'desk-pet-screen-question-window.html');
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

function isProactiveBubbleSender(sender: Electron.WebContents): boolean {
  return !!proactiveBubbleWindow && !proactiveBubbleWindow.isDestroyed() && sender.id === proactiveBubbleWindow.webContents.id;
}

function isDeskPetOrChatSender(sender: Electron.WebContents): boolean {
  const fromPet = !!deskPetWindow && !deskPetWindow.isDestroyed() && sender.id === deskPetWindow.webContents.id;
  const fromChat = !!chatWindow && !chatWindow.isDestroyed() && sender.id === chatWindow.webContents.id;
  const fromBubble = !!proactiveBubbleWindow && !proactiveBubbleWindow.isDestroyed() && sender.id === proactiveBubbleWindow.webContents.id;
  return fromPet || fromChat || fromBubble;
}

export function isDeskPetChatSender(sender: Electron.WebContents): boolean {
  return !!chatWindow && !chatWindow.isDestroyed() && sender.id === chatWindow.webContents.id;
}

export function isDeskPetScreenQuestionSender(sender: Electron.WebContents): boolean {
  return !!screenQuestionWindow && !screenQuestionWindow.isDestroyed() && sender.id === screenQuestionWindow.webContents.id;
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

function clampWithin(min: number, value: number, max: number): number {
  return Math.min(Math.max(min, value), max);
}

function getProactiveBubbleBounds(heightOverride?: number): Electron.Rectangle | null {
  if (!deskPetWindow || deskPetWindow.isDestroyed()) return null;
  const petBounds = deskPetWindow.getBounds();
  const { workArea } = screen.getDisplayMatching(petBounds);
  const margin = 8;
  const width = Math.min(PROACTIVE_BUBBLE_WIDTH, Math.max(160, workArea.width - margin * 2));
  const height = heightOverride ?? PROACTIVE_BUBBLE_HEIGHT;
  const minX = workArea.x + margin;
  const maxX = workArea.x + workArea.width - width - margin;
  const minY = workArea.y + margin;
  const maxY = workArea.y + workArea.height - height - margin;
  const centeredX = petBounds.x + petBounds.width / 2 - width / 2;
  const centeredY = petBounds.y + petBounds.height / 2 - height / 2;

  const aboveY = petBounds.y - height - PROACTIVE_BUBBLE_GAP;
  if (aboveY >= minY) {
    return {
      x: Math.round(clampWithin(minX, centeredX, maxX)),
      y: Math.round(aboveY),
      width,
      height,
    };
  }

  const belowY = petBounds.y + petBounds.height + PROACTIVE_BUBBLE_GAP;
  if (belowY <= maxY) {
    return {
      x: Math.round(clampWithin(minX, centeredX, maxX)),
      y: Math.round(belowY),
      width,
      height,
    };
  }

  const leftX = petBounds.x - width - PROACTIVE_BUBBLE_GAP;
  if (leftX >= minX) {
    return {
      x: Math.round(leftX),
      y: Math.round(clampWithin(minY, centeredY, maxY)),
      width,
      height,
    };
  }

  const rightX = petBounds.x + petBounds.width + PROACTIVE_BUBBLE_GAP;
  return {
    x: Math.round(clampWithin(minX, rightX, maxX)),
    y: Math.round(clampWithin(minY, centeredY, maxY)),
    width,
    height,
  };
}

function anchorProactiveBubbleWindow(): void {
  if (!proactiveBubbleWindow || proactiveBubbleWindow.isDestroyed()) return;
  const currentHeight = proactiveBubbleWindow.getBounds().height;
  const bounds = getProactiveBubbleBounds(currentHeight);
  if (bounds) {
    proactiveBubbleWindow.setBounds(bounds);
  }
}

function createChatWindow(options: { focus?: boolean } = {}): BrowserWindow | null {
  const focus = options.focus !== false;
  if (!deskPetWindow || deskPetWindow.isDestroyed()) return null;
  if (chatWindow && !chatWindow.isDestroyed()) {
    anchorChatWindow();
    if (focus) {
      chatWindow.show();
      chatWindow.focus();
    } else {
      chatWindow.showInactive();
    }
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
    if (focus) {
      chatWindow?.show();
      chatWindow?.focus();
    } else {
      chatWindow?.showInactive();
    }
  });
  chatWindow.on('closed', () => {
    chatWindow = null;
  });

  return chatWindow;
}

function clearProactiveBubbleTimer(): void {
  if (proactiveBubbleTimer) {
    clearTimeout(proactiveBubbleTimer);
    proactiveBubbleTimer = null;
  }
}

function closeProactiveBubbleWindow(): void {
  clearProactiveBubbleTimer();
  if (proactiveBubbleWindow && !proactiveBubbleWindow.isDestroyed()) {
    proactiveBubbleWindow.close();
  }
  proactiveBubbleWindow = null;
}

function createProactiveBubbleWindow(): BrowserWindow | null {
  if (!deskPetWindow || deskPetWindow.isDestroyed()) return null;
  const bounds = getProactiveBubbleBounds();
  if (!bounds) return null;

  if (proactiveBubbleWindow && !proactiveBubbleWindow.isDestroyed()) {
    proactiveBubbleWindow.setBounds(bounds);
    proactiveBubbleWindow.showInactive();
    return proactiveBubbleWindow;
  }

  proactiveBubbleWindow = new BrowserWindow({
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

  proactiveBubbleWindow.setAlwaysOnTop(true, 'normal');
  proactiveBubbleWindow.setTitle('');
  proactiveBubbleWindow.loadFile(getDeskPetBubbleHtmlPath());
  proactiveBubbleWindow.webContents.on('page-title-updated', (event) => {
    event.preventDefault();
    proactiveBubbleWindow?.setTitle('');
  });
  proactiveBubbleWindow.webContents.on('context-menu', (event) => {
    event.preventDefault();
  });
  proactiveBubbleWindow.webContents.on('did-finish-load', () => {
    proactiveBubbleWindow?.showInactive();
  });
  proactiveBubbleWindow.on('closed', () => {
    clearProactiveBubbleTimer();
    proactiveBubbleWindow = null;
  });

  return proactiveBubbleWindow;
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

export function hideDeskPetChatWindow(): void {
  hideChatWindow();
}

export function showDeskPetChatWindow(): void {
  createChatWindow();
}

function closeChatWindow(): void {
  if (chatWindow && !chatWindow.isDestroyed()) {
    chatWindow.close();
  }
  chatWindow = null;
}

export function closeDeskPetScreenQuestionWindow(): void {
  if (screenQuestionWindow && !screenQuestionWindow.isDestroyed()) {
    screenQuestionWindow.close();
  }
  screenQuestionWindow = null;
}

export function openDeskPetScreenQuestionWindow(display: Electron.Display, imageDataUrl: string): void {
  closeDeskPetScreenQuestionWindow();
  const { bounds } = display;
  screenQuestionWindow = new BrowserWindow({
    title: '',
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
    show: false,
    frame: false,
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    autoHideMenuBar: true,
    backgroundColor: '#111827',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  screenQuestionWindow.setAlwaysOnTop(true, 'screen-saver');
  screenQuestionWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  screenQuestionWindow.loadFile(getDeskPetScreenQuestionHtmlPath());
  screenQuestionWindow.webContents.on('context-menu', (event) => event.preventDefault());
  screenQuestionWindow.webContents.once('did-finish-load', () => {
    if (!screenQuestionWindow || screenQuestionWindow.isDestroyed()) return;
    screenQuestionWindow.webContents.send(IPC_CHANNELS.DESK_PET_SCREEN_QUESTION_READY, { kind: 'overlay', imageDataUrl });
    screenQuestionWindow.show();
    screenQuestionWindow.focus();
  });
  screenQuestionWindow.on('closed', () => {
    screenQuestionWindow = null;
  });
}

export function sendDeskPetScreenQuestionToChat(payload: Record<string, unknown>): void {
  // 看图问鸭由已打开的聊天窗发起；用户确认后它仍保持隐藏，
  // 只在后台接收消息与回复，不能因为结果返回又遮住用户桌面。
  const window = chatWindow && !chatWindow.isDestroyed()
    ? chatWindow
    : createChatWindow({ focus: false });
  if (!window || window.isDestroyed()) return;
  const send = () => window.webContents.send(IPC_CHANNELS.DESK_PET_SCREEN_QUESTION_READY, payload);
  if (window.webContents.isLoading()) {
    window.webContents.once('did-finish-load', send);
  } else {
    send();
  }
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
  anchorProactiveBubbleWindow();
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
  anchorProactiveBubbleWindow();
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
  if (!isDeskPetOrChatSender(event.sender)) return;
  if (isProactiveBubbleSender(event.sender)) {
    closeProactiveBubbleWindow();
  }
  toggleChatWindow();
});

ipcMain.on(IPC_CHANNELS.DESK_PET_BUBBLE_CONTENT_HEIGHT, (event, contentHeight: number) => {
  if (!isProactiveBubbleSender(event.sender) || !proactiveBubbleWindow || proactiveBubbleWindow.isDestroyed()) return;
  const clampedHeight = Math.min(
    PROACTIVE_BUBBLE_MAX_HEIGHT,
    Math.max(PROACTIVE_BUBBLE_MIN_HEIGHT, Math.round(Number(contentHeight) || PROACTIVE_BUBBLE_HEIGHT)),
  );
  const currentBounds = proactiveBubbleWindow.getBounds();
  const delta = clampedHeight - currentBounds.height;
  if (delta === 0) return;
  proactiveBubbleWindow.setBounds({
    x: currentBounds.x,
    y: currentBounds.y - delta,
    width: currentBounds.width,
    height: clampedHeight,
  });
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
    deskPetWindow?.webContents.executeJavaScript('window.playDeskPetGreeting?.();').catch((error) => {
      console.warn('[DeskPet] Failed to play greeting:', error);
    });
    deskPetWindow?.showInactive();
  });

  deskPetWindow.on('closed', () => {
    clearRepaintTimer();
    closeChatWindow();
    closeProactiveBubbleWindow();
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
  closeProactiveBubbleWindow();
  closeDeskPetScreenQuestionWindow();
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

export function sendDeskPetProactiveMessage(message: ProactiveMessage): void {
  if (chatWindow && !chatWindow.isDestroyed()) {
    chatWindow.webContents.send(IPC_CHANNELS.CHAT_PROACTIVE_MESSAGE, message);
  }

  const bubbleWindow = createProactiveBubbleWindow();
  if (!bubbleWindow || bubbleWindow.isDestroyed()) return;

  const messageJson = JSON.stringify(message);
  const showBubble = () => {
    if (!proactiveBubbleWindow || proactiveBubbleWindow.isDestroyed()) return;
    anchorProactiveBubbleWindow();
    proactiveBubbleWindow.webContents.executeJavaScript(`window.showProactiveBubble?.(${messageJson});`).catch((error) => {
      console.warn('[DeskPet] Failed to show proactive message:', error);
    });
    proactiveBubbleWindow.showInactive();
  };

  if (bubbleWindow.webContents.isLoading()) {
    bubbleWindow.webContents.once('did-finish-load', showBubble);
  } else {
    showBubble();
  }

  clearProactiveBubbleTimer();
  proactiveBubbleTimer = setTimeout(() => {
    closeProactiveBubbleWindow();
  }, 9000);
}

/**
 * The main AI page and the pet chat are two renderers for one conversation.
 * Mirror only into an already-open chat window; it must never open or focus it.
 */
export function sendDeskPetChatMirrorEvent(sender: Electron.WebContents, event: DeskPetChatMirrorEvent): void {
  if (!chatWindow || chatWindow.isDestroyed() || sender.id === chatWindow.webContents.id) return;
  chatWindow.webContents.send(IPC_CHANNELS.CHAT_DESK_PET_MIRROR, event);
}
