/**
 * FILE PURPOSE
 * ------------
 * The one place every icon in the app comes from. Wraps the `lucide-react-native` icon library
 * behind a stable, app-specific name (`IconName`, e.g. `'utensils'`, `'home'`) rather than
 * letting every screen import Lucide's own React component names directly — which is what
 * keeps stroke width and color theming consistent everywhere, and insulates the rest of the app
 * from Lucide's own naming changes (see below).
 *
 * WHERE IT FITS
 * -------------
 * Used throughout `src/ui/`, `src/features/`, and `src/app/` wherever an icon is needed —
 * category glyphs (paired with `constants/category-icons.ts`), payment method icons, and every
 * chrome/navigation icon (back arrows, search, filter, etc.).
 *
 * `IconName`s use Lucide's canonical kebab-case names from §3.4. Lucide 1.x renamed a
 * few export identifiers (help-circle → CircleQuestionMark, home → House, bar-chart-3 →
 * ChartColumnBig, more-vertical → EllipsisVertical, filter → Funnel, history → Clock) —
 * the glyphs are unchanged, only the JS identifiers. The kebab names below stay stable.
 */

import {
  ArrowDownToLine,
  ArrowLeft,
  ArrowLeftRight,
  BadgeIndianRupee,
  BanknoteArrowDown,
  Banknote,
  Bell,
  Bus,
  Calendar,
  ChartColumnBig,
  ChartLine,
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
  HandCoins,
  HeartPulse,
  Bookmark,
  Briefcase,
  BriefcaseBusiness,
  CirclePlus,
  Gift,
  Laptop,
  LayoutGrid,
  House,
  Landmark,
  type LucideIcon,
  Percent,
  PiggyBank,
  Plus,
  Receipt,
  ReceiptIndianRupee,
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
  Undo2,
  Users,
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
  // CR-28 — income categories
  briefcase: Briefcase,
  laptop: Laptop,
  percent: Percent,
  'undo-2': Undo2,
  gift: Gift,
  'piggy-bank': PiggyBank,
  'circle-plus': CirclePlus,
  // CR-31 — clearer income-category icons (the ones above stay so a custom category that picked one still renders)
  'badge-indian-rupee': BadgeIndianRupee,
  'briefcase-business': BriefcaseBusiness,
  'chart-line': ChartLine,
  'receipt-indian-rupee': ReceiptIndianRupee,
  'hand-coins': HandCoins,
  'banknote-arrow-down': BanknoteArrowDown,

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
  bookmark: Bookmark, // CR-12 — Settings › Default category
  users: Users, // V2 — split payments (SPEC-UI-UX.md §6.17)
  'layout-grid': LayoutGrid, // V2 — Settings › Widgets (§6.24)

  // Stat-tile trend glyph (§29.4's `StatTile`) — not in §3.4's own enumerated chrome list,
  // added when the component needed it, same as every other entry here.
  'trending-up': TrendingUp,
  'trending-down': TrendingDown,
  // CR-34 — transfers between your own accounts, Merge into…
  'arrow-left-right': ArrowLeftRight,
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
