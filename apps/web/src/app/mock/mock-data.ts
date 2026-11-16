import { MOCK_SCREENS } from './fixtures';

type Role = 'user' | 'editor' | 'admin';

export interface MockScreenData {
  readonly id: string;
  readonly name: string;
  readonly w: number;
  readonly role: Role;
  readonly section: string;
  readonly body: MockNode;
  readonly dialog?: MockNode;
  readonly header?: MockNode;
  readonly menus?: readonly (readonly [
    label: string,
    target: string | null,
    icon: string | null,
    active: boolean,
  ])[];
  readonly crumb?: string;
}

export interface MockNode {
  readonly k:
    | 'group'
    | 'text'
    | 'icon'
    | 'line'
    | 'button'
    | 'badge'
    | 'check'
    | 'search'
    | 'filter'
    | 'field'
    | 'picture'
    | 'preview'
    | 'table';
  readonly t?: string;
  readonly to?: string;
  readonly href?: string;
  readonly label?: string;
  readonly hint?: string;
  readonly i?: string;
  readonly ro?: boolean;
  readonly on?: boolean;
  readonly s?: number;
  readonly fw?: number;
  readonly w?: number;
  readonly h?: number;
  readonly b?: number | string;
  readonly c?: number | string;
  readonly e?: number | string;
  readonly a?: string;
  readonly d?: string;
  readonly g?: number;
  readonly j?: string;
  readonly r?: number;
  readonly p?: readonly number[];
  readonly ch?: readonly MockNode[];
  readonly cols?: readonly string[];
  readonly rows?: readonly MockTableRow[];
  readonly pg?: boolean;
}

export interface MockTableRow {
  readonly cells: readonly (readonly MockNode[])[];
  readonly to?: string;
}

export const screens = MOCK_SCREENS as unknown as readonly MockScreenData[];
export const screensById = new Map(screens.map((screen) => [screen.id, screen]));
export const normalize = (value: string) => value.toLocaleLowerCase('bg-BG').trim();

export const roles: Record<Role, string> = {
  user: 'Потребител',
  editor: 'Редактор',
  admin: 'Администратор',
};

export const homeScreen = '19:1791';
export const mobileHomeScreen = '21:342';
export const editorScreen = '6:141';
export const adminScreen = '4:82';

const palette = [
  'ffffff',
  '222b45',
  '52637f',
  '2e3a59',
  'e4e9f2',
  'edf1f7',
  'f2f6ff',
  '3366ff',
  '274bdb',
  '192038',
  '006b3d',
  'f2fff5',
  '703c00',
  'fff1c2',
  '94124e',
  'fff2f2',
  '0041a8',
  'f2f8ff',
  'f7f9fc',
];

export function color(value: number | string | undefined): string | null {
  return typeof value === 'number' ? '#' + palette[value] : (value ?? null);
}

const icons: Record<string, string> = {
  ad: 'mic-outline',
  archive: 'archive-outline',
  arr: 'arrow-forward-outline',
  arrow: 'arrow-forward-outline',
  back: 'arrow-back-outline',
  category: 'folder-outline',
  check: 'checkmark-outline',
  chevron: 'chevron-right-outline',
  clock: 'clock-outline',
  close: 'close-outline',
  down: 'chevron-down-outline',
  file: 'file-text-outline',
  gallery: 'image-outline',
  home: 'grid-outline',
  image: 'image-outline',
  jobs: 'activity-outline',
  layers: 'layers-outline',
  location: 'pin-outline',
  lock: 'lock-outline',
  mail: 'email-outline',
  people: 'people-outline',
  storage: 'hard-drive-outline',
};

export function icon(key = 'image'): string {
  return icons[key] ?? key + '-outline';
}

export const pictures: Record<string, { file: string; alt: string; fit?: string }> = {
  train: { file: 'train.jpg', alt: 'Архивна фотография на български парен локомотив' },
  roses: { file: 'roses.jpg', alt: 'Розобер край Казанлък през 1906 г.' },
  pravetz: { file: 'pravetz.jpg', alt: 'Компютър „Правец 82“', fit: 'contain' },
};

export function nodeText(node: MockNode): string {
  return node.t ?? (node.ch ?? []).map(nodeText).filter(Boolean).join(' ');
}
