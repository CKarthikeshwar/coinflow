/**
 * The one icon component (SPEC-UI-UX.md §3.4 / §29.2). Wraps `lucide-react-native`,
 * forces `strokeWidth={1.6}` app-wide, and resolves `color` from the theme.
 *
 * `IconName`s use Lucide's canonical kebab-case names from §3.4. Lucide 1.x renamed a
 * few export identifiers (help-circle → CircleQuestionMark, home → House, bar-chart-3 →
 * ChartColumnBig, more-vertical → EllipsisVertical, filter → Funnel, history → Clock) —
 * the glyphs are unchanged, only the JS identifiers. The kebab names below stay stable.
 */

import {
  ArrowDownToLine,
  ArrowLeft,
  Banknote,
  Bell,
  Bus,
  Calendar,
  ChartColumnBig,
  Check,
  ChevronRight,
  CircleQuestionMark,
  Clapperboard,
  Clock,
  CreditCard,
  Delete,
  Download,
  EllipsisVertical,
  Funnel,
  GraduationCap,
  HeartPulse,
  House,
  Landmark,
  type LucideIcon,
  Plus,
  Receipt,
  Search,
  Shapes,
  ShieldCheck,
  ShoppingBag,
  ShoppingBasket,
  SlidersHorizontal,
  Tag,
  Trash2,
  TrendingDown,
  TrendingUp,
  TriangleAlert,
  Utensils,
  Wallet,
  X,
} from 'lucide-react-native';

import { Colors, type ThemeColor } from '@/constants/theme';

const ICONS = {
  // categories + system rows (see src/constants/category-icons.ts)
  utensils: Utensils,
  bus: Bus,
  'shopping-basket': ShoppingBasket,
  receipt: Receipt,
  'shopping-bag': ShoppingBag,
  clapperboard: Clapperboard,
  'heart-pulse': HeartPulse,
  'graduation-cap': GraduationCap,
  shapes: Shapes,
  'help-circle': CircleQuestionMark,
  'arrow-down-to-line': ArrowDownToLine,

  // payment methods (§3.4)
  'credit-card': CreditCard,
  banknote: Banknote,
  landmark: Landmark,
  wallet: Wallet,

  // chrome (§3.4)
  home: House,
  history: Clock,
  'bar-chart-3': ChartColumnBig,
  'sliders-horizontal': SlidersHorizontal,
  plus: Plus,
  'chevron-right': ChevronRight,
  'arrow-left': ArrowLeft,
  x: X,
  'more-vertical': EllipsisVertical,
  search: Search,
  filter: Funnel,
  check: Check,
  delete: Delete,
  'triangle-alert': TriangleAlert,
  calendar: Calendar,
  tag: Tag,
  bell: Bell,
  'shield-check': ShieldCheck,
  'trash-2': Trash2,
  download: Download,

  // Stat-tile trend glyph (§29.4's `StatTile`) — not in §3.4's own enumerated chrome list,
  // added when the component needed it, same as every other entry here.
  'trending-up': TrendingUp,
  'trending-down': TrendingDown,
} satisfies Record<string, LucideIcon>;

export type IconName = keyof typeof ICONS;

export type IconProps = {
  name: IconName;
  size?: number;
  color?: ThemeColor;
};

export function Icon({ name, size = 20, color = 'text' }: IconProps) {
  const Glyph = ICONS[name];
  return <Glyph size={size} color={Colors.dark[color]} strokeWidth={1.6} />;
}
