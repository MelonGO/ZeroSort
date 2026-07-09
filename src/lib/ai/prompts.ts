import type { TFunction } from "i18next";

/**
 * Available AI action types for the floating menu.
 */
export type AiActionType =
  | "improve"
  | "proofread"
  | "translate"
  | "longer"
  | "shorter"
  | "tone"
  | "simplify"
  | "explain"
  | "mindmap"
  | "chart"
  | "mermaid"
  | "custom";

/** Shared preamble for all chart prompts. */
const CHART_COLORS_HINT =
  "Colors are optional. The app automatically applies the active theme's semantic chart palette when colors are omitted.";

/** Chart structure templates keyed by chart type. These are code examples, not natural language. */
const CHART_STRUCTURES: Record<string, string> = {
  line: `Use this exact structure:
{"type":"line","data":{"labels":["Label1","Label2"],"datasets":[{"label":"Dataset Name","data":[1,2,3],"tension":0.4,"fill":false}]},"options":{"responsive":true,"plugins":{"legend":{"position":"top"},"title":{"display":true,"text":"Chart Title"}}}}`,

  bar: `Use this exact structure:
{"type":"bar","data":{"labels":["Label1","Label2"],"datasets":[{"label":"Dataset Name","data":[1,2,3],"borderWidth":1}]},"options":{"responsive":true,"plugins":{"legend":{"position":"top"},"title":{"display":true,"text":"Chart Title"}}}}`,

  pie: `Use this exact structure. For pie charts, you may omit backgroundColor and borderColor arrays to let the app apply theme colors automatically:
{"type":"pie","data":{"labels":["Label1","Label2","Label3"],"datasets":[{"label":"Dataset Name","data":[30,50,20],"borderWidth":1}]},"options":{"responsive":true,"plugins":{"legend":{"position":"top"},"title":{"display":true,"text":"Chart Title"}}}}`,

  radar: `Use this exact structure:
{"type":"radar","data":{"labels":["Axis1","Axis2","Axis3","Axis4","Axis5"],"datasets":[{"label":"Dataset Name","data":[65,59,90,81,56],"fill":true}]},"options":{"responsive":true,"plugins":{"legend":{"position":"top"},"title":{"display":true,"text":"Chart Title"}}}}`,

  bubble: `Use this exact structure. Each data point must be an object with x, y, and r (radius) properties:
{"type":"bubble","data":{"labels":[],"datasets":[{"label":"Dataset Name","data":[{"x":10,"y":20,"r":5},{"x":15,"y":10,"r":10}]}]},"options":{"responsive":true,"plugins":{"legend":{"position":"top"},"title":{"display":true,"text":"Chart Title"}}}}`,
};

/**
 * Returns a chart-type-specific AI prompt using i18n for the base instruction.
 * The `option` parameter selects the chart type: line, bar, pie, radar, or bubble.
 * Defaults to "line" if not provided.
 */
const buildChartPrompt = (
  text: string,
  t: TFunction,
  option?: string,
): string => {
  const chartType = option || "line";

  const baseInstruction = t("aiMenu.prompts.chart.base", {
    chartType,
    colorsHint: CHART_COLORS_HINT,
  });

  const structure = CHART_STRUCTURES[chartType] || CHART_STRUCTURES.line;
  return `${baseInstruction}\n${structure}\nText:\n\n${text}`;
};

/**
 * Builds a prompt string for a given AI action type using i18n translations.
 *
 * @param action - The type of AI action to perform.
 * @param text - The selected text to act on.
 * @param t - The i18next translation function.
 * @param option - Optional parameter (language for translate, tone name, chart type, or custom prompt).
 * @param fullDocumentContext - Optional full document markdown for additional context.
 * @returns The constructed prompt string.
 */
export const buildPrompt = (
  action: AiActionType,
  text: string,
  t: TFunction,
  option?: string,
  fullDocumentContext?: string,
): string => {
  const contextPrefix = fullDocumentContext
    ? t("aiMenu.prompts.contextPrefix", {
        fullDocument: fullDocumentContext,
      })
    : "";

  if (action === "chart") {
    return buildChartPrompt(text, t, option);
  }

  const key = `aiMenu.prompts.${action}`;
  return t(key, {
    contextPrefix,
    text,
    option: option ?? "",
    interpolation: { escapeValue: false },
  });
};
