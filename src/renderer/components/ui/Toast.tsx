import { Toaster as SonnerToaster } from 'sonner';

export { toast } from 'sonner';

/**
 * 全局 Toast 容器（预设样式，放在 App 根节点内）
 */
export function Toaster() {
  return (
    <SonnerToaster
      position="top-right"
      toastOptions={{
        className: 'rounded-lg shadow-lg border',
        style: {
          fontFamily: 'var(--font-sans)',
          fontSize: '14px',
        },
      }}
    />
  );
}
