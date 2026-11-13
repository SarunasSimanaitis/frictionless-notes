import {
  BridgeExtension,
  type BridgeState,
  type EditorBridge,
} from '@10play/tentap-editor';
import {
  FontFamily,
  FontSize,
  TextStyle,
} from '@tiptap/extension-text-style';
import HorizontalRule from '@tiptap/extension-horizontal-rule';
import type { Editor } from '@tiptap/core';

export interface NoteFontFormattingState {
  activeFontFamily?: string;
  activeFontSize?: string;
}

export interface NoteFontFormattingCommands {
  setFontFamily: (fontFamily: string | null) => void;
  setFontSize: (fontSize: string | null) => void;
  /** Removes bold, colour, size and similar marks, and turns headings, lists and quotes back into text. */
  clearFormatting: () => void;
  insertDivider: () => void;
}

type FontFormattingMessage =
  | { type: 'set-font-family'; payload: string | null }
  | { type: 'set-font-size'; payload: string | null }
  | { type: 'clear-formatting' }
  | { type: 'insert-divider' };

declare module '@10play/tentap-editor' {
  interface BridgeState extends NoteFontFormattingState {}
  interface EditorBridge extends NoteFontFormattingCommands {}
}

function readFontFormattingState(editor: Editor): Pick<NoteFontFormattingState, 'activeFontFamily' | 'activeFontSize'> {
  const textStyle = editor.getAttributes('textStyle');
  return {
    activeFontFamily: typeof textStyle.fontFamily === 'string' ? textStyle.fontFamily : undefined,
    activeFontSize: typeof textStyle.fontSize === 'string' ? textStyle.fontSize : undefined,
  };
}

export const NoteFontFormattingBridge = new BridgeExtension<
  Pick<NoteFontFormattingState, 'activeFontFamily' | 'activeFontSize'>,
  NoteFontFormattingCommands,
  FontFormattingMessage
>({
  tiptapExtension: FontFamily,
  tiptapExtensionDeps: [FontSize, TextStyle, HorizontalRule],
  onBridgeMessage: (editor, message) => {
    if (message.type === 'set-font-family') {
      const command = editor.chain().focus();
      if (message.payload) command.setFontFamily(message.payload).run();
      else command.unsetFontFamily().run();
      return false;
    }

    if (message.type === 'clear-formatting') {
      editor.chain().focus().unsetAllMarks().clearNodes().run();
      return false;
    }

    if (message.type === 'insert-divider') {
      editor.chain().focus().setHorizontalRule().run();
      return false;
    }

    const command = editor.chain().focus();
    if (message.payload) command.setFontSize(message.payload).run();
    else command.unsetFontSize().run();
    return false;
  },
  extendEditorInstance: (sendBridgeMessage) => ({
    setFontFamily: (fontFamily) => sendBridgeMessage({ type: 'set-font-family', payload: fontFamily }),
    setFontSize: (fontSize) => sendBridgeMessage({ type: 'set-font-size', payload: fontSize }),
    clearFormatting: () => sendBridgeMessage({ type: 'clear-formatting' }),
    insertDivider: () => sendBridgeMessage({ type: 'insert-divider' }),
  }),
  extendEditorState: readFontFormattingState,
});
