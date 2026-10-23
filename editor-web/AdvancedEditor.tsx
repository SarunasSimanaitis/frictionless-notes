import React from 'react';
import { EditorContent, TenTapStartKit, useTenTap } from '@10play/tentap-editor';
import { NoteFontFormattingBridge } from '../src/editor/fontFormattingBridge';

export function AdvancedEditor() {
  const editor = useTenTap({
    bridges: [...TenTapStartKit, NoteFontFormattingBridge],
  });

  if (!editor) return null;

  return (
    <EditorContent
      editor={editor}
      className={window.dynamicHeight ? 'dynamic-height' : undefined}
    />
  );
}
