import type { BrowserWindow, Display } from 'electron';
import { desktopCapturer } from 'electron';

export async function captureScreenshot(mainWindow: BrowserWindow): Promise<Buffer> {
  const sources = await desktopCapturer.getSources({
    types: ['screen'],
    thumbnailSize: { width: 1920, height: 1080 },
  });

  if (sources.length === 0) {
    throw new Error('No screen source found');
  }

  const source = sources[0];
  const image = source.thumbnail;
  return image.toJPEG(70);
}

export interface ScreenQuestionScreenshot {
  /** Native-resolution image used locally by the selection overlay and its crop. */
  overlay: Buffer;
  /** Smaller image used as whole-desktop context for the vision model. */
  context: Buffer;
}

/**
 * Capture one concrete display for an explicit user request. The overlay keeps
 * native pixels so a small selection remains legible, while the model receives
 * a bounded whole-screen context image to avoid uploading a 4K desktop.
 */
export async function captureDisplayScreenshot(display: Display): Promise<ScreenQuestionScreenshot> {
  const sources = await desktopCapturer.getSources({
    types: ['screen'],
    thumbnailSize: {
      width: Math.max(1, Math.round(display.size.width * display.scaleFactor)),
      height: Math.max(1, Math.round(display.size.height * display.scaleFactor)),
    },
  });

  const source = sources.find((item) => String((item as { display_id?: string }).display_id) === String(display.id))
    || (sources.length === 1 ? sources[0] : undefined);
  if (!source) {
    throw new Error('未找到当前屏幕，无法开始看图提问');
  }

  const thumbnail = source.thumbnail;
  const size = thumbnail.getSize();
  const longestSide = Math.max(size.width, size.height);
  const contextLongestSide = 1280;
  const context = longestSide > contextLongestSide
    ? thumbnail.resize({
      width: Math.max(1, Math.round(size.width * contextLongestSide / longestSide)),
      height: Math.max(1, Math.round(size.height * contextLongestSide / longestSide)),
    })
    : thumbnail;

  return {
    overlay: thumbnail.toJPEG(85),
    context: context.toJPEG(60),
  };
}
