import type { NoteType } from './types';
import type { IconName } from './ui/iconPaths';

export const noteTypeLabels: Record<NoteType, string> = {
  text: 'NOTE',
  custom: 'CUSTOM NOTE',
  checklist: 'CHECKLIST',
  shopping: 'SHOPPING',
};

export const noteTypeIcons: Record<NoteType, IconName> = {
  text: 'note',
  custom: 'pen',
  checklist: 'checklist',
  shopping: 'cart',
};
