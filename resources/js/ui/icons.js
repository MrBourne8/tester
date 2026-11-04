import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  Bell,
  Check,
  ChevronRight,
  ClipboardList,
  Copy,
  Download,
  Eye,
  FileDown,
  FileText,
  Folder,
  FolderOpen,
  FolderPlus,
  Globe,
  GraduationCap,
  GripVertical,
  HelpCircle,
  Home,
  Layers,
  LayoutGrid,
  LayoutList,
  Lightbulb,
  Menu,
  Monitor,
  MoreVertical,
  Package,
  PanelLeft,
  PanelRight,
  Pause,
  Pencil,
  Play,
  Plus,
  Printer,
  Rocket,
  Save,
  Search,
  Send,
  Settings2,
  Share2,
  Square,
  Star,
  Trash2,
  TrendingUp,
  Trophy,
  Upload,
  X,
  createElement,
} from 'lucide';

const REGISTRY = {
  arrowDown: ArrowDown,
  arrowLeft: ArrowLeft,
  arrowUp: ArrowUp,
  bell: Bell,
  check: Check,
  chevronRight: ChevronRight,
  clipboard: ClipboardList,
  copy: Copy,
  download: Download,
  eye: Eye,
  fileDown: FileDown,
  fileText: FileText,
  folder: Folder,
  folderOpen: FolderOpen,
  folderPlus: FolderPlus,
  globe: Globe,
  logo: GraduationCap,
  grip: GripVertical,
  help: HelpCircle,
  home: Home,
  layers: Layers,
  lightbulb: Lightbulb,
  menu: Menu,
  grid: LayoutGrid,
  list: LayoutList,
  monitor: Monitor,
  more: MoreVertical,
  package: Package,
  panelLeft: PanelLeft,
  panelRight: PanelRight,
  pause: Pause,
  pencil: Pencil,
  play: Play,
  plus: Plus,
  print: Printer,
  rocket: Rocket,
  save: Save,
  search: Search,
  send: Send,
  settings: Settings2,
  share: Share2,
  star: Star,
  stop: Square,
  trash: Trash2,
  trending: TrendingUp,
  trophy: Trophy,
  upload: Upload,
  x: X,
  tests: LayoutList,
  reports: ClipboardList,
};

/**
 * @param {keyof typeof REGISTRY | string} name
 * @param {{ size?: number, className?: string, strokeWidth?: number }} [opts]
 * @returns {string}
 */
export function icon(name, opts = {}) {
  const node = REGISTRY[name];
  if (!node) return '';
  const size = opts.size ?? 18;
  const el = createElement(node, {
    width: size,
    height: size,
    'stroke-width': opts.strokeWidth ?? 1.75,
    class: ['ico', opts.className].filter(Boolean).join(' '),
    'aria-hidden': 'true',
  });
  return el.outerHTML;
}

/**
 * Кнопка/ссылка с иконкой слева.
 * @param {string} name
 * @param {string} label
 * @param {{ size?: number }} [opts]
 */
export function withIcon(name, label, opts = {}) {
  return `${icon(name, { size: opts.size ?? 16 })}<span>${label}</span>`;
}
