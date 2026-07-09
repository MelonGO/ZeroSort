import { getNoteContentAction } from "@/lib/actions";
import { regenerateNoteFields, RegenerateResult } from "@/lib/ai/regenerate";
import { tiptapJsonToMarkdown } from "@/lib/ai/tiptapMarkdown";
import { Directory, Note, RegenerateField } from "@/types";
import { ProviderConfig } from "@/types/model";

interface BatchRegenerateParams {
  notes: Note[];
  fields: RegenerateField[];
  config: ProviderConfig;
  modelId: string;
  includeExistingDirs: boolean;
  directories: Directory[];
  concurrency: number;
  abortSignal: AbortSignal;
  onProgress: (
    noteId: string,
    result: RegenerateResult | null,
    loadedContent: string,
  ) => void | Promise<void>;
  /** Called when a note starts processing. */
  onNoteStart?: (noteId: string) => void;
  onError: (noteId: string, error: unknown) => void;
  onComplete: () => void;
  /** Called after each successful catalog regeneration to get the latest directories. */
  getUpdatedDirectories?: () => Directory[];
}

const DELAY_BETWEEN_NOTES_MS = 500;

/**
 * Simple concurrency limiter for parallel operations.
 */
class ConcurrencyLimiter {
  private running = 0;
  private queue: Array<() => void> = [];

  constructor(private limit: number) {}

  async run<T>(fn: () => Promise<T>, abortSignal?: AbortSignal): Promise<T> {
    if (abortSignal?.aborted)
      return Promise.reject(new DOMException("Aborted", "AbortError"));

    if (this.running >= this.limit) {
      await new Promise<void>((resolve, reject) => {
        const onAbort = () => {
          const idx = this.queue.indexOf(resolve);
          if (idx !== -1) this.queue.splice(idx, 1);
          reject(new DOMException("Aborted", "AbortError"));
        };
        if (abortSignal?.aborted) {
          reject(new DOMException("Aborted", "AbortError"));
          return;
        }
        abortSignal?.addEventListener("abort", onAbort, { once: true });
        this.queue.push(() => {
          abortSignal?.removeEventListener("abort", onAbort);
          resolve();
        });
      });
    }

    this.running++;
    try {
      return await fn();
    } finally {
      this.running--;
      const next = this.queue.shift();
      if (next) next();
    }
  }
}

/**
 * Executes batch regeneration of note fields with configurable concurrency.
 * When concurrency > 1, multiple notes are processed in parallel.
 * When includeExistingDirs is enabled with catalog field, newly created
 * directories are dynamically added to the context for subsequent notes.
 */
export async function executeBatchRegeneration({
  notes,
  fields,
  config,
  modelId,
  includeExistingDirs,
  directories,
  concurrency,
  abortSignal,
  onProgress,
  onNoteStart,
  onError,
  onComplete,
  getUpdatedDirectories,
}: BatchRegenerateParams): Promise<void> {
  const limiter = new ConcurrencyLimiter(Math.max(1, concurrency));
  const shouldAccumulateDirs =
    includeExistingDirs && fields.includes("catalog") && getUpdatedDirectories;

  // Shared mutable directory list — updated after each catalog regeneration
  let sharedDirectories = [...directories];

  const tasks = notes.map((note) =>
    limiter
      .run(async () => {
        if (abortSignal.aborted) return;

        onNoteStart?.(note.id);

        try {
          // Ensure we have the note content loaded
          let content = note.content;
          if (!note.isContentLoaded || !content) {
            const fullContent = await getNoteContentAction(note.id);
            if (fullContent) {
              content = fullContent;
            }
          }

          if (abortSignal.aborted) return;

          // Convert JSON content to Markdown for the AI prompt
          const textContent = tiptapJsonToMarkdown(content);

          // Snapshot current directories for this note's AI call
          const directorySnapshot = shouldAccumulateDirs
            ? [...sharedDirectories]
            : directories;

          const result = await regenerateNoteFields({
            content: textContent,
            fields,
            config,
            modelId,
            includeExistingDirs,
            directories: directorySnapshot,
            abortSignal,
          });

          if (abortSignal.aborted) return;

          await onProgress(note.id, result, content);

          // After a successful catalog regeneration, refresh the shared directory list
          if (shouldAccumulateDirs) {
            sharedDirectories = getUpdatedDirectories();
          }
        } catch (error) {
          if (abortSignal.aborted) return;
          onError(note.id, error);
        }

        // Small delay after each note to respect API rate limits
        if (!abortSignal.aborted) {
          await new Promise((resolve) =>
            setTimeout(resolve, DELAY_BETWEEN_NOTES_MS),
          );
        }
      }, abortSignal)
      .catch((error) => {
        // Swallow AbortError from queued tasks that were cancelled
        if (error instanceof DOMException && error.name === "AbortError")
          return;
        throw error;
      }),
  );

  await Promise.allSettled(tasks);

  onComplete();
}
