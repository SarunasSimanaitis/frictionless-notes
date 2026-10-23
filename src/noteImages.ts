import * as FileSystem from 'expo-file-system/legacy';
import * as ImagePicker from 'expo-image-picker';
import { createId } from './model';
import type { InlineImageBlock, Note } from './types';

const imageDirectoryName = 'note-images/';

function extensionForAsset(asset: ImagePicker.ImagePickerAsset): string {
  const filenameExtension = asset.fileName?.match(/\.([a-z\d]{2,5})$/i)?.[1]?.toLowerCase();
  const mimeExtension = asset.mimeType?.split('/')[1]?.toLowerCase();
  const extension = filenameExtension ?? mimeExtension ?? 'jpg';
  return extension === 'jpeg' ? 'jpg' : ['jpg', 'png', 'webp', 'heic', 'gif'].includes(extension)
    ? extension
    : 'jpg';
}

export async function pickNoteImage(noteId: string): Promise<InlineImageBlock | null> {
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsEditing: false,
    quality: 0.9,
    selectionLimit: 1,
  });
  if (result.canceled || !result.assets[0]) return null;

  const documentDirectory = FileSystem.documentDirectory;
  if (!documentDirectory) throw new Error('The app document directory is unavailable.');
  const directory = `${documentDirectory}${imageDirectoryName}`;
  if (!(await FileSystem.getInfoAsync(directory)).exists) {
    await FileSystem.makeDirectoryAsync(directory, { intermediates: true });
  }

  const asset = result.assets[0];
  const uri = `${directory}${noteId}-${createId()}.${extensionForAsset(asset)}`;
  await FileSystem.copyAsync({ from: asset.uri, to: uri });
  return {
    id: createId(),
    type: 'image',
    uri,
    width: asset.width > 0 ? asset.width : 1,
    height: asset.height > 0 ? asset.height : 1,
  };
}

export async function removeNoteImage(uri: string): Promise<void> {
  const documentDirectory = FileSystem.documentDirectory;
  if (!documentDirectory || !uri.startsWith(`${documentDirectory}${imageDirectoryName}`)) return;
  if ((await FileSystem.getInfoAsync(uri)).exists) await FileSystem.deleteAsync(uri);
}

export async function removeNoteImages(note: Note): Promise<void> {
  const images = note.blocks.filter((block) => block.type === 'image');
  await Promise.allSettled(images.map((image) => removeNoteImage(image.uri)));
}
