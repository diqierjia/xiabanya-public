import { Tray, Menu, nativeImage, BrowserWindow, app } from 'electron';
import { join } from 'path';
import { existsSync } from 'fs';

let tray: Tray | null = null;

/** 托盘图标：用项目自带的 xiabanya-logo.ico */
function createTrayIcon(): Electron.NativeImage {
  const isDev = !app.isPackaged;
  const iconPaths = isDev
    ? [
        join(__dirname, '..', '..', 'src', 'renderer', 'assets', 'xiabanya-logo.ico'),
        join(__dirname, '..', '..', 'src', 'renderer', 'assets', 'xiabanya-mascot.png'),
      ]
    : [
        join(process.resourcesPath, 'assets', 'xiabanya-logo.ico'),
        join(process.resourcesPath, 'assets', 'xiabanya-mascot.png'),
      ];

  for (const iconPath of iconPaths) {
    if (!existsSync(iconPath)) continue;
    const icon = nativeImage.createFromPath(iconPath);
    if (!icon.isEmpty()) {
      return icon.resize({ width: 16, height: 16 });
    }
  }

  const fallbackSvg = encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16"><circle cx="8" cy="8" r="7" fill="#08a64f"/><circle cx="8" cy="8" r="3" fill="#facc15"/></svg>'
  );
  return nativeImage.createFromDataURL(`data:image/svg+xml;charset=utf-8,${fallbackSvg}`);
}

/**
 * 创建系统托盘图标。
 *
 * @param mainWindow - 主窗口引用，用于显示/隐藏/聚焦
 * @param onQuit - 退出回调：设置 forceQuit 标志后调用 app.quit()
 * @returns 创建的 Tray 实例
 */
export function createTray(mainWindow: BrowserWindow, onQuit: () => void): Tray {
  if (tray) {
    return tray;
  }

  const icon = createTrayIcon();
  tray = new Tray(icon);
  tray.setToolTip('下班鸭');

  const contextMenu = Menu.buildFromTemplate([
    {
      label: '显示主窗口',
      click: () => {
        if (mainWindow.isDestroyed()) return;
        if (mainWindow.isVisible()) {
          mainWindow.focus();
        } else {
          mainWindow.show();
          mainWindow.focus();
        }
      },
    },
    { type: 'separator' },
    {
      label: '退出',
      click: () => {
        onQuit();
      },
    },
  ]);

  tray.setContextMenu(contextMenu);

  // 点击托盘图标：切换窗口显示/隐藏
  tray.on('click', () => {
    if (mainWindow.isDestroyed()) return;
    if (mainWindow.isVisible()) {
      mainWindow.hide();
    } else {
      mainWindow.show();
      mainWindow.focus();
    }
  });

  return tray;
}

/**
 * 销毁托盘图标（应用退出时调用）
 */
export function destroyTray(): void {
  if (tray) {
    tray.destroy();
    tray = null;
  }
}
