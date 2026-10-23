import React from 'react';
import { createRoot } from 'react-dom/client';
import { AdvancedEditor } from './AdvancedEditor';

declare global {
  interface Window {
    contentInjected?: boolean;
    dynamicHeight?: boolean;
  }
}

const editorRoot = document.getElementById('root');
let renderTimer: ReturnType<typeof setInterval> | undefined;

renderTimer = setInterval(() => {
  if (!window.contentInjected || !editorRoot) return;
  clearInterval(renderTimer);
  createRoot(editorRoot).render(<AdvancedEditor />);
}, 10);
