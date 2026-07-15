import { app, BrowserWindow, Menu } from 'electron';
import { join } from 'path';
import { DatabaseService } from './database';
import { migrateLegacyDatabaseIfNeeded } from './legacy-db-migration';
import { registerIpcHandlers, autoStartTrackerAndVision } from './ipc-handlers';
import { createTray, destroyTray } from './tray';
import { DEFAULT_SETTINGS } from '../shared/types';
import {
  DESK_PET_SIZE_SETTING_KEY,
  configureDeskPetSizePersistence,
  createDeskPetWindow,
  destroyDeskPetWindow,
  refreshDeskPetWindowComposite,
} from './desk-pet-window';

let mainWindow: BrowserWindow | null = null;
let forceQuit = false;
let deskPetCompositeRefreshTimers: NodeJS.Timeout[] = [];

const isDev = !app.isPackaged;
const gotSingleInstanceLock = app.requestSingleInstanceLock();

function getAppIconPath(): string {
  return isDev
    ? join(__dirname, '..', '..', 'src', 'renderer', 'assets', 'xiabanya-logo.ico')
    : join(process.resourcesPath, 'assets', 'xiabanya-logo.ico');
}

function scheduleDeskPetCompositeRefresh(delays = [120, 320]): void {
  deskPetCompositeRefreshTimers.forEach((timer) => clearTimeout(timer));
  deskPetCompositeRefreshTimers = delays.map((delay) => {
    const timer = setTimeout(() => {
      refreshDeskPetWindowComposite();
      deskPetCompositeRefreshTimers = deskPetCompositeRefreshTimers.filter((activeTimer) => activeTimer !== timer);
    }, delay);
    return timer;
  });
}

function createWindow(): void {
  let reloadedAfterRenderCrash = false;
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 748,
    minWidth: 1040,
    minHeight: 660,
    title: '下班鸭',
    icon: getAppIconPath(),
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });

  mainWindow.webContents.on('did-finish-load', () => {
    if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.isVisible()) {
      mainWindow.show();
    }
  });

  mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
    console.error('[MainWindow] Failed to load renderer:', errorCode, errorDescription, validatedURL);
    if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.isVisible()) {
      mainWindow.show();
    }
  });

  mainWindow.webContents.on('preload-error', (_event, preloadPath, error) => {
    console.error('[MainWindow] Preload failed:', preloadPath, error);
  });

  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    console.error('[MainWindow] Renderer process gone:', details);
    if (reloadedAfterRenderCrash || !mainWindow || mainWindow.isDestroyed()) return;
    reloadedAfterRenderCrash = true;
    mainWindow.reload();
  });

  mainWindow.on('unresponsive', () => {
    console.error('[MainWindow] Window became unresponsive.');
  });

  // v2.3: 关闭窗口 → 最小化到托盘（不退出应用）
  mainWindow.on('close', (e) => {
    if (!forceQuit) {
      e.preventDefault();
      mainWindow?.hide();
    }
  });

  mainWindow.on('minimize', () => {
    scheduleDeskPetCompositeRefresh();
  });

  mainWindow.on('blur', () => {
    scheduleDeskPetCompositeRefresh([80, 220, 420]);
  });

  if (isDev && process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'));
  }
}

if (!gotSingleInstanceLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
  });

  app.whenReady().then(async () => {
    // 隐藏默认菜单栏
    Menu.setApplicationMenu(null);
    // 初始化数据库 — 开发模式放项目 data/ 目录，打包后放系统 userData
    const dbPath = isDev
      ? join(__dirname, '../../data/xiabanya.db')
      : join(app.getPath('userData'), 'xiabanya.db');
    if (!isDev) {
      const migration = await migrateLegacyDatabaseIfNeeded(dbPath, [
        join(app.getPath('documents'), '下班鸭', 'v2', 'xiabanya-electron', 'data', 'xiabanya.db'),
        join(process.cwd(), 'data', 'xiabanya.db'),
      ]);
      if (migration.migrated) {
        console.info('[数据迁移] 已从旧数据库恢复历史记录。');
      }
    }
    const db = DatabaseService.getInstance(dbPath);
    configureDeskPetSizePersistence({
      read: () => db.getSetting(DESK_PET_SIZE_SETTING_KEY, ''),
      write: (size) => db.setSetting(DESK_PET_SIZE_SETTING_KEY, String(size)),
    });

    // 创建窗口
    createWindow();
    if (db.getSetting('desk_pet_enabled', String(DEFAULT_SETTINGS.desk_pet_enabled)) === 'true') {
      createDeskPetWindow();
    }

    // 注册 IPC 处理器
    registerIpcHandlers(db, mainWindow!);

    // v2.2: 自动启动 Tracker + Vision Auto（有 API Key 时）
    autoStartTrackerAndVision(db, mainWindow!);

    // v2.3: 创建系统托盘
    createTray(mainWindow!, () => {
      forceQuit = true;
      app.quit();
    });

    // Mac 行为：点击 Dock 图标时，如果没有窗口则创建，有则显示
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
      } else {
        mainWindow?.show();
      }
    });
  });

  // v2.3: 窗口全部关闭时不退出（应用运行在托盘）
  app.on('window-all-closed', () => {
    // 不退出 — 应用保持托盘运行
  });

  app.on('before-quit', () => {
    forceQuit = true;
    // 停止 Tracker 和 Vision Auto（通过清理定时器）
    destroyTray();
    destroyDeskPetWindow();
    // 关闭数据库连接
    DatabaseService.resetInstance();
  });
}
