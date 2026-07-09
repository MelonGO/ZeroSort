import i18n from "@/i18n";
import {
  getModelFromConfig,
  supportsStructuredOutputs,
} from "@/lib/ai/provider";
import {
  formatDirectoryPathsForPrompt,
  getDeepestDirectoryPaths,
} from "@/store/helpers";
import { Directory, RegenerateField } from "@/types";
import { ProviderConfig } from "@/types/model";
import { generateText, LanguageModel, Output, streamText } from "ai";
import { z } from "zod";

/** Result shape returned by regenerateNoteFields. */
export interface RegenerateResult {
  title?: string;
  summary?: string;
  catalog?: string[];
  tags?: string[];
}

interface RegenerateContext {
  fieldSchema: z.ZodObject<Record<string, z.ZodTypeAny>>;
  combinedPrompt: string;
  jsonPrompt: string;
}

/**
 * Compares two RegenerateResult objects for equality without JSON serialization.
 * Compares primitive fields (title, summary) by value and array fields (tags, catalog)
 * by reference equality first, then element-by-element string comparison.
 */
function regenerateResultsEqual(
  a: RegenerateResult | null,
  b: RegenerateResult | null,
): boolean {
  if (a === b) return true;
  if (!a || !b) return false;

  if (a.title !== b.title) return false;
  if (a.summary !== b.summary) return false;

  const aTags = a.tags;
  const bTags = b.tags;
  if (aTags !== bTags) {
    if (!aTags || !bTags || aTags.length !== bTags.length) return false;
    for (let i = 0; i < aTags.length; i++) {
      if (aTags[i] !== bTags[i]) return false;
    }
  }

  const aCatalog = a.catalog;
  const bCatalog = b.catalog;
  if (aCatalog !== bCatalog) {
    if (!aCatalog || !bCatalog || aCatalog.length !== bCatalog.length)
      return false;
    for (let i = 0; i < aCatalog.length; i++) {
      if (aCatalog[i] !== bCatalog[i]) return false;
    }
  }

  return true;
}

/**
 * Attempts to extract JSON from a text response.
 */
function extractJsonFromText(text: string): unknown {
  const codeBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlockMatch) {
    try {
      return JSON.parse(codeBlockMatch[1].trim());
    } catch {
      // continue
    }
  }
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try {
      return JSON.parse(jsonMatch[0]);
    } catch {
      // continue
    }
  }
  try {
    return JSON.parse(text.trim());
  } catch {
    return null;
  }
}

/**
 * Attempts to extract completed field values from a partial JSON stream.
 */
function extractPartialResultFromText(
  text: string,
  fields: RegenerateField[],
): RegenerateResult | null {
  const partial: RegenerateResult = {};

  fields.forEach((field) => {
    if (field === "title" || field === "summary") {
      const match = text.match(
        new RegExp(`"${field}"\\s*:\\s*("(?:\\\\.|[^"\\\\])*")`, "s"),
      );
      if (match) {
        try {
          partial[field] = JSON.parse(match[1]) as string;
        } catch {
          // continue
        }
      }
      return;
    }

    const match = text.match(
      new RegExp(`"${field}"\\s*:\\s*(\\[(?:.|\\n|\\r)*?\\])`, "s"),
    );
    if (!match) return;

    try {
      const parsed = JSON.parse(match[1]);
      if (Array.isArray(parsed)) {
        partial[field] = parsed.filter(
          (item): item is string => typeof item === "string",
        );
      }
    } catch {
      // continue
    }
  });

  return Object.keys(partial).length > 0 ? partial : null;
}

/**
 * Validates a regenerate response and salvages partial fields when possible.
 */
function parseRegenerateResult(
  text: string,
  fields: RegenerateField[],
  fieldSchema: z.ZodObject<Record<string, z.ZodTypeAny>>,
): RegenerateResult | null {
  const parsed = extractJsonFromText(text);
  if (parsed && typeof parsed === "object") {
    const validated = fieldSchema.safeParse(parsed);
    if (validated.success) {
      return validated.data as RegenerateResult;
    }

    const partial = parsed as Record<string, unknown>;
    const output: RegenerateResult = {};
    if (fields.includes("title") && typeof partial.title === "string") {
      output.title = partial.title;
    }
    if (fields.includes("summary") && typeof partial.summary === "string") {
      output.summary = partial.summary;
    }
    if (fields.includes("catalog") && Array.isArray(partial.catalog)) {
      output.catalog = partial.catalog.filter(
        (item): item is string => typeof item === "string",
      );
    }
    if (fields.includes("tags") && Array.isArray(partial.tags)) {
      output.tags = partial.tags.filter(
        (item): item is string => typeof item === "string",
      );
    }

    if (Object.keys(output).length > 0) {
      return output;
    }
  }

  return extractPartialResultFromText(text, fields);
}

/**
 * Builds directory context for AI prompts when includeExistingDirs is enabled.
 */
function buildDirectoryContext(
  includeExistingDirs: boolean,
  directories: Directory[],
): string {
  if (!includeExistingDirs || directories.length === 0) return "";
  const deepestPaths = getDeepestDirectoryPaths(directories);
  if (deepestPaths.length === 0) return "";
  const formatted = formatDirectoryPathsForPrompt(deepestPaths);
  return `\n\n${i18n.t("ai.prompts.existingDirectories", { directories: formatted })}`;
}

/**
 * Builds localized schema and prompts for regenerate requests.
 */
function buildRegenerateContext(params: {
  content: string;
  fields: RegenerateField[];
  includeExistingDirs: boolean;
  directories: Directory[];
}): RegenerateContext {
  const { content, fields, includeExistingDirs, directories } = params;
  const t = i18n.t.bind(i18n);

  const localizedSchema = z.object({
    title: z.string().describe(t("ai.prompts.schema.title")),
    catalog: z.array(z.string()).describe(t("ai.prompts.schema.catalog")),
    summary: z.string().describe(t("ai.prompts.schema.summary")),
    tags: z.array(z.string()).describe(t("ai.prompts.schema.tags")),
  });

  const shape: Record<string, z.ZodTypeAny> = {};
  fields.forEach((field) => {
    shape[field] = localizedSchema.shape[field];
  });
  const fieldSchema = z.object(shape);

  const fieldPrompts = {
    title: t("ai.prompts.regenerateTitle"),
    summary: t("ai.prompts.regenerateSummary"),
    catalog: t("ai.prompts.regenerateCatalog"),
    tags: t("ai.prompts.regenerateTags"),
  };

  const directoryContext = fields.includes("catalog")
    ? buildDirectoryContext(includeExistingDirs, directories)
    : "";

  const combinedPrompt =
    fields.map((field) => fieldPrompts[field]).join("\n") +
    directoryContext +
    `\n\n${t("ai.prompts.contentBefore")}\n${content}\n${t("ai.prompts.contentAfter")}`;

  const fieldDescriptions: Record<RegenerateField, string> = {
    title: '"title": "string (a concise title for the note)"',
    summary: '"summary": "string (a brief summary of the note content)"',
    catalog:
      '"catalog": ["string"] (array of category/folder names, can be nested like ["Parent", "Child"])',
    tags: '"tags": ["string"] (array of short descriptive tag names, 2-5 tags)',
  };

  const schemaDescription = `{
  ${fields.map((field) => fieldDescriptions[field]).join(",\n  ")}
}`;

  const jsonPrompt = `${fields.map((field) => fieldPrompts[field]).join("\n")}${directoryContext}

IMPORTANT: You must respond with a valid JSON object only, no additional text or explanation.
The JSON must have this exact structure:
${schemaDescription}

${t("ai.prompts.content")}
${content}`;

  return {
    fieldSchema,
    combinedPrompt,
    jsonPrompt,
  };
}

/**
 * Standalone function to regenerate note fields via AI.
 * Extracted from useNoteActions for reuse in batch operations.
 */
export async function regenerateNoteFields(params: {
  content: string;
  fields: RegenerateField[];
  config: ProviderConfig;
  modelId: string;
  includeExistingDirs: boolean;
  directories: Directory[];
  abortSignal?: AbortSignal;
}): Promise<RegenerateResult | null> {
  const {
    content,
    fields,
    config,
    modelId,
    includeExistingDirs,
    directories,
    abortSignal,
  } = params;
  const { fieldSchema, combinedPrompt, jsonPrompt } = buildRegenerateContext({
    content,
    fields,
    includeExistingDirs,
    directories,
  });

  const model = await getModelFromConfig(config, modelId);
  const useStructuredOutput = supportsStructuredOutputs(config.templateId);

  let output: RegenerateResult | null = null;

  if (useStructuredOutput) {
    console.log("combinedPrompt: ", combinedPrompt);
    const result = await generateText({
      model: model as LanguageModel,
      output: Output.object({ schema: fieldSchema }),
      prompt: combinedPrompt,
      abortSignal,
    });
    output = result.output as RegenerateResult;
  } else {
    console.log("jsonPrompt: ", jsonPrompt);
    const result = await generateText({
      model: model as LanguageModel,
      prompt: jsonPrompt,
      abortSignal,
    });

    output = parseRegenerateResult(result.text, fields, fieldSchema);
  }

  return output;
}

/**
 * Streams regenerate results for the interactive editor modal.
 */
export async function streamRegenerateNoteFields(params: {
  content: string;
  fields: RegenerateField[];
  config: ProviderConfig;
  modelId: string;
  includeExistingDirs: boolean;
  directories: Directory[];
  abortSignal?: AbortSignal;
  onPartialResult?: (result: RegenerateResult) => void;
}): Promise<RegenerateResult | null> {
  const {
    content,
    fields,
    config,
    modelId,
    includeExistingDirs,
    directories,
    abortSignal,
    onPartialResult,
  } = params;
  const { fieldSchema, jsonPrompt } = buildRegenerateContext({
    content,
    fields,
    includeExistingDirs,
    directories,
  });
  const model = await getModelFromConfig(config, modelId);
  const result = streamText({
    model: model as LanguageModel,
    prompt: jsonPrompt,
    abortSignal,
  });

  let fullText = "";
  let latestPartial: RegenerateResult | null = null;

  for await (const chunk of result.textStream) {
    fullText += chunk;
    const partial = parseRegenerateResult(fullText, fields, fieldSchema);
    if (!partial) continue;

    if (regenerateResultsEqual(partial, latestPartial)) {
      continue;
    }

    latestPartial = partial;
    onPartialResult?.(partial);
  }

  const finalResult = parseRegenerateResult(fullText, fields, fieldSchema);
  if (finalResult && !regenerateResultsEqual(finalResult, latestPartial)) {
    onPartialResult?.(finalResult);
  }

  return finalResult;
}
