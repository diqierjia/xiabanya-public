import type { XiabanyaApi } from '../../preload/index';

/**
 * 获取 XiabanyaApi 实例（非 React 环境可用，如 Zustand store actions）
 * 注意：仅在 Electron 环境下可用，浏览器环境会抛出错误
 */
export function getXiabanyaApi(): XiabanyaApi {
  const api = (window as unknown as { xiabanyaApi: XiabanyaApi }).xiabanyaApi;
  if (!api) {
    throw new Error('[下班鸭] xiabanyaApi not exposed — running outside Electron?');
  }
  return api;
}

/**
 * React Hook：获取类型安全的 XiabanyaApi 实例
 * 用于渲染进程组件中调用 preload API
 */
export function useXiabanyaApi(): XiabanyaApi {
  return getXiabanyaApi();
}
