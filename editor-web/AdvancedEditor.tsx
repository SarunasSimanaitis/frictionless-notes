import React from 'react';
import { EditorContent, TenTapStartKit, useTenTap } from '@10play/tentap-editor';
import Document from '@tiptap/extension-document';
import Paragraph from '@tiptap/extension-paragraph';
import Text from '@tiptap/extension-text';
import { NoteFontFormattingBridge } from '../src/editor/fontFormattingBridge';

export function AdvancedEditor() {
  const editor = useTenTap({
    bridges: [...TenTapStartKit, NoteFontFormattingBridge],
    tiptapOptions: {
      extensions: [Document, Paragraph, Text],
    },
  });

  return (
    <EditorContent
      editor={editor}
      className={window.dynamicHeight ? 'dynamic-height' : undefined}
    />
  );
}
