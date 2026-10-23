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
import type { Editor } from '@tiptap/core';

export interface NoteFontFormattingState {
  activeFontFamily?: string;
  activeFontSize?: string;
}

export interface NoteFontFormattingCommands {
  setFontFamily: (fontFamily: string | null) => void;
  setFontSize: (fontSize: string | null) => void;
}

type FontFormattingMessage =
  | { type: 'set-font-family'; payload: string | null }
  | { type: 'set-font-size'; payload: string | null };

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
  Pick<NoteFontFormattingCommands, 'setFontFamily' | 'setFontSize'>,
  FontFormattingMessage
>({
  tiptapExtension: FontFamily,
  tiptapExtensionDeps: [FontSize, TextStyle],
  onBridgeMessage: (editor, message) => {
    if (message.type === 'set-font-family') {
      const command = editor.chain().focus();
      if (message.payload) command.setFontFamily(message.payload).run();
      else command.unsetFontFamily().run();
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
  }),
  extendEditorState: readFontFormattingState,
});
