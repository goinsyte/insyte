import type { SVGProps } from "react"

/**
 * The icons `/v2` draws with: Insyte's own set (`@insyte/ui/icons`, square caps, mitred joins, one
 * 1.75 stroke on a 24 grid) plus the handful that set does not have yet, drawn here to the same
 * rules. The owner's screens used a stock kit; the house set keeps the rail from reading as a
 * template. When a glyph below proves itself, it moves into `@insyte/ui/icons`.
 */
export {
  AlertOctagon,
  AlertTriangle,
  Archive,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ArrowUpRight,
  Award,
  BadgePercent,
  Banknote,
  BarChart3,
  Bell,
  BellRing,
  Bold,
  BookOpen,
  Bot,
  Box,
  Boxes,
  Briefcase,
  Building,
  Calendar,
  ChartLine,
  Check,
  CheckCircle2 as CheckCircle,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsUpDown,
  ChevronUp,
  ClipboardCheck,
  Clock,
  Columns3 as Columns,
  Compass,
  Copy,
  CornerDownLeft,
  CreditCard,
  Database,
  Download,
  DownloadCloud,
  Edit3 as Edit,
  ExternalLink,
  Eye,
  EyeOff,
  Factory,
  FileText,
  Filter,
  Flag,
  FlaskConical,
  Folder,
  GitMerge,
  Globe,
  GraduationCap,
  GripVertical,
  Hash,
  Headphones,
  Home,
  Image,
  ImageOff,
  Inbox,
  InfoIcon as Info,
  Key,
  Keyboard,
  LayoutDashboard,
  LayoutGrid,
  LayoutList,
  LayoutTemplate,
  Link2 as LinkIcon,
  List,
  ListFilter,
  Loader,
  Lock,
  LogOut,
  Mail,
  Map as MapGlyph,
  MapPin,
  Maximize2 as Maximize,
  Megaphone,
  MessageCircle,
  MessageSquare,
  MessageSquareText,
  MessagesSquare,
  Minus,
  Moon,
  MoreHorizontal,
  MoreVertical,
  Newspaper,
  Package,
  Palette,
  Paperclip,
  Pause,
  Phone,
  PiggyBank,
  Pin,
  Play,
  Plug,
  Plus,
  Printer,
  Radio,
  Receipt,
  RefreshCcw,
  Reply,
  Rocket,
  RotateCcw,
  Route,
  Save,
  Search,
  Send,
  Settings,
  Sheet,
  Shield,
  ShieldAlert,
  ShieldCheck,
  ShoppingBag,
  Sigma,
  Smartphone,
  Smile,
  Sparkle,
  Sparkles,
  Split as SplitGlyph,
  Star,
  Store,
  Sun,
  Tag as TagGlyph,
  Ticket,
  Trash2 as Trash,
  TrendingUp,
  Truck,
  Undo2 as Undo,
  Upload,
  User,
  UserCog,
  UserPlus,
  Users,
  UserSearch,
  UserX,
  Video,
  Wallet,
  Webhook,
  Workflow,
  X,
  XCircle,
  Zap
} from "@insyte/ui/icons"

type GlyphProps = Omit<SVGProps<SVGSVGElement>, "ref"> & { readonly size?: number }

function glyph(name: string, paths: ReadonlyArray<string>) {
  function Glyph({ size = 24, strokeWidth = 1.75, ...rest }: GlyphProps) {
    return (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="square"
        strokeLinejoin="miter"
        aria-hidden={rest["aria-label"] === undefined ? true : undefined}
        data-icon={name}
        {...rest}
      >
        {paths.map((d) => <path key={d} d={d} />)}
      </svg>
    )
  }
  Glyph.displayName = name
  return Glyph
}

export const ThumbsUp = glyph("ThumbsUp", ["M7.5 10.5V20H4V10.5Z", "M7.5 10.5L11 4H12.5V9H19.5L18 20H7.5"])
export const ThumbsDown = glyph("ThumbsDown", ["M16.5 13.5V4H20V13.5Z", "M16.5 13.5L13 20H11.5V15H4.5L6 4H16.5"])
export const Mic = glyph("Mic", ["M9 4H15V13H9Z", "M5.5 11.5V12.5A6.5 6.5 0 0 0 18.5 12.5V11.5", "M12 19V21"])
export const History = glyph("History", ["M4.5 4.5V9.5H9.5", "M5 9.5A8 8 0 1 1 4.6 15", "M12 8V12.5L15 14"])
export const Share = glyph("Share", ["M12 14.5V4", "M8 8L12 4L16 8", "M8.5 11H5V20H19V11H15.5"])
export const ChevronsRight = glyph("ChevronsRight", ["M12 6.5L17.5 12L12 17.5", "M6 6.5L11.5 12L6 17.5"])
export const Menu = glyph("Menu", ["M4 7H20", "M4 12H20", "M4 17H20"])
export const At = glyph("At", ["M16 12A4 4 0 1 1 16 11.9V13.5A2.5 2.5 0 0 0 21 13.5V12A9 9 0 1 0 17 19.5"])
export const Returns = glyph("Returns", ["M8.5 13.5L4.5 9.5L8.5 5.5", "M4.5 9.5H15A4.5 4.5 0 0 1 15 18.5H10"])
export const Redo = glyph("Redo", ["M15.5 13.5L19.5 9.5L15.5 5.5", "M19.5 9.5H9A4.5 4.5 0 0 0 9 18.5H14"])
export const QrCode = glyph("QrCode", [
  "M4 4H10V10H4Z",
  "M14 4H20V10H14Z",
  "M4 14H10V20H4Z",
  "M14 14H16.5V16.5H14Z",
  "M17.5 17.5H20V20H17.5Z"
])
export const Camera = glyph("Camera", [
  "M4 8H8L9.5 5.5H14.5L16 8H20V19H4Z",
  "M12 10.5A3 3 0 1 1 12 16.5A3 3 0 1 1 12 10.5Z"
])
export const UserCheck = glyph("UserCheck", [
  "M9.5 4A3.5 3.5 0 1 1 9.5 11A3.5 3.5 0 1 1 9.5 4Z",
  "M3.5 20V18.5A4.5 4.5 0 0 1 8 14H11",
  "M14.5 17L16.5 19L20.5 15"
])
