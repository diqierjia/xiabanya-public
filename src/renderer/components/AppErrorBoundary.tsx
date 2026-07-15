import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';

interface AppErrorBoundaryProps {
  children: ReactNode;
}

interface AppErrorBoundaryState {
  error: Error | null;
}

export class AppErrorBoundary extends Component<AppErrorBoundaryProps, AppErrorBoundaryState> {
  state: AppErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): AppErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[Renderer] Uncaught render error:', error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
        <div className="w-full max-w-lg rounded-xl border border-red-100 bg-white p-6 shadow-sm">
          <div className="w-11 h-11 rounded-lg bg-red-50 text-red-600 flex items-center justify-center">
            <AlertCircle size={22} />
          </div>
          <h1 className="mt-4 text-lg font-semibold text-gray-900">页面渲染出错</h1>
          <p className="mt-2 text-sm leading-6 text-gray-600">
            主窗口没有正常渲染。错误已经输出到控制台，可以先刷新窗口恢复。
          </p>
          <pre className="mt-4 max-h-40 overflow-auto rounded-lg bg-gray-950 p-3 text-xs text-gray-100">
            {this.state.error.message}
          </pre>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-4 inline-flex items-center gap-2 rounded-lg bg-brand-600 px-3 py-2 text-sm font-medium text-white hover:bg-brand-700"
          >
            <RefreshCw size={14} />
            刷新窗口
          </button>
        </div>
      </div>
    );
  }
}
