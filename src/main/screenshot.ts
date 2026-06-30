import type { BrowserWindow } from 'electron';
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
