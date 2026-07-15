import { createRoot } from 'react-dom/client';
import { App } from './App';
import { AppErrorBoundary } from './components/AppErrorBoundary';

const container = document.getElementById('root');
if (container) {
  createRoot(container).render(
    <AppErrorBoundary>
      <App />
    </AppErrorBoundary>
  );
}
