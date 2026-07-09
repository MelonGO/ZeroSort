import type { AiActionType } from "@/lib/ai/prompts";

import {
  ArrowBigDown,
  ArrowBigUp,
  BarChart3,
  BookOpen,
  CircleCheck,
  Feather,
  GitBranch,
  Languages,
  Palette,
  Sparkles,
  Workflow,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface MenuItem {
  id: AiActionType;
  labelKey: string;
  icon: React.ReactNode;
  iconColor: string;
  hasSubmenu?: boolean;
  submenuType?: "languages" | "tones" | "chartTypes";
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const SUGGESTED_ITEMS: MenuItem[] = [
  {
    id: "improve",
    labelKey: "aiMenu.actions.improve",
    icon: <Sparkles size={16} />,
    iconColor: "text-purple-500",
  },
  {
    id: "proofread",
    labelKey: "aiMenu.actions.proofread",
    icon: <CircleCheck size={16} />,
    iconColor: "text-purple-500",
  },
  {
    id: "explain",
    labelKey: "aiMenu.actions.explain",
    icon: <BookOpen size={16} />,
    iconColor: "text-blue-500",
  },
  {
    id: "translate",
    labelKey: "aiMenu.actions.translate",
    icon: <Languages size={16} />,
    iconColor: "text-green-500",
    hasSubmenu: true,
    submenuType: "languages",
  },
];

export const EDIT_ITEMS: MenuItem[] = [
  {
    id: "longer",
    labelKey: "aiMenu.actions.longer",
    icon: <ArrowBigUp size={16} />,
    iconColor: "text-purple-500",
  },
  {
    id: "shorter",
    labelKey: "aiMenu.actions.shorter",
    icon: <ArrowBigDown size={16} />,
    iconColor: "text-purple-500",
  },
  {
    id: "tone",
    labelKey: "aiMenu.actions.tone",
    icon: <Palette size={16} />,
    iconColor: "text-purple-500",
    hasSubmenu: true,
    submenuType: "tones",
  },
  {
    id: "simplify",
    labelKey: "aiMenu.actions.simplify",
    icon: <Feather size={16} />,
    iconColor: "text-purple-500",
  },
];

export const CHART_ITEMS: MenuItem[] = [
  {
    id: "mindmap",
    labelKey: "aiMenu.actions.mindmap",
    icon: <GitBranch size={16} />,
    iconColor: "text-blue-500",
  },
  {
    id: "mermaid",
    labelKey: "aiMenu.actions.mermaid",
    icon: <Workflow size={16} />,
    iconColor: "text-teal-500",
  },
  {
    id: "chart",
    labelKey: "aiMenu.actions.chart",
    icon: <BarChart3 size={16} />,
    iconColor: "text-orange-500",
    hasSubmenu: true,
    submenuType: "chartTypes",
  },
];

export const LANGUAGES = [
  "arabic",
  "english",
  "chinese",
  "italian",
  "korean",
  "portuguese",
  "russian",
  "spanish",
  "french",
  "german",
  "japanese",
] as const;

export const TONES = [
  "professional",
  "casual",
  "friendly",
  "confident",
  "formal",
] as const;
