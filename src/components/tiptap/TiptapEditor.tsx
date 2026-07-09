import { EditorToolbar } from "@/components/tiptap/EditorToolbar";
import { getHeavyTiptapExtensions } from "@/components/tiptap/heavyExtensions";
import {
  ImageEditModal,
  type ImageEditModalOpenState,
} from "@/components/tiptap/ImageEditModal";
import { MathEditModal } from "@/components/tiptap/MathEditModal";
import { TableFloatingToolbar } from "@/components/tiptap/TableFloatingToolbar";
import { useDebouncedCallback } from "@/hooks/useDebouncedCallback";
import { useScrollPosition } from "@/hooks/useScrollPosition";
import {
  isLegacyBase64ImageSrc,
  isManagedImagePath,
  saveManagedImageFile,
} from "@/lib/images";
import { getParsedEditorContent } from "@/lib/tiptap/editorContentCache";
import { tiptapLowlight } from "@/lib/tiptap/lowlight";
import { cn } from "@/lib/utils";
import { useStore } from "@/store/useStore";
import { EditorState } from "@tiptap/pm/state";
import { EditorContent, useEditor } from "@tiptap/react";
import React, {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { getBaseTiptapExtensions } from "./extensions";

// Lazy load AiFloatingMenu to split out heavy mermaid/shiki dependencies (~12MB)
const AiFloatingMenu = React.lazy(() =>
  import("@/components/tiptap/ai-menu/AiFloatingMenu").then((module) => ({
    default: module.AiFloatingMenu,
  })),
);

const AskAiButton = React.lazy(() =>
  import("@/components/tiptap/ask-ai/AskAiButton").then((module) => ({
    default: module.AskAiButton,
  })),
);

const TEXT_SIZE_MAP: Record<string, string> = {
  sm: "text-sm",
  base: "text-base",
  lg: "text-lg",
  xl: "text-xl",
  "2xl": "text-2xl",
};

interface TiptapEditorProps {
  /** JSON string representing the Tiptap document content */
  content: string;
  /** Callback triggered when content changes, receives JSON string */
  onChange: (jsonContent: string) => void;
  placeholder?: string;
  onEditorReady?: (editor: any | null) => void;
  toolbarSize?: "sm" | "md";
  /** Whether to show model selector in AI floating menu */
  showModelSelect?: boolean;
  /** Whether to allow AI floating menu */
  allowAiMenu?: boolean;
  /** Optional Note ID to track scroll positions when switching between notes */
  noteId?: string;
  /** Callback when a wiki link is clicked */
  onWikiLinkClick?: (noteTitle: string, displayText?: string) => void;
  /** Function to fetch all notes for autocomplete */
  fetchNotes?: () => Promise<any[]>;
}

const MAX_IMAGE_FILE_SIZE_BYTES = 5 * 1024 * 1024;

function getActiveListItemTypeName(state: EditorState) {
  const { $from } = state.selection;

  for (let depth = $from.depth; depth > 0; depth -= 1) {
    const nodeTypeName = $from.node(depth).type.name;

    if (nodeTypeName === "taskItem" || nodeTypeName === "listItem") {
      return nodeTypeName;
    }
  }

  return null;
}

function resetEditorHistory(editor: NonNullable<ReturnType<typeof useEditor>>) {
  editor.view.updateState(
    EditorState.create({
      schema: editor.state.schema,
      doc: editor.state.doc,
      selection: editor.state.selection,
      plugins: editor.state.plugins,
    }),
  );
}

function areTiptapEditorPropsEqual(
  prev: TiptapEditorProps,
  next: TiptapEditorProps,
): boolean {
  return (
    prev.noteId === next.noteId &&
    prev.content === next.content &&
    prev.placeholder === next.placeholder &&
    prev.toolbarSize === next.toolbarSize &&
    prev.showModelSelect === next.showModelSelect &&
    prev.allowAiMenu === next.allowAiMenu
  );
}

/**
 * Tiptap-based rich text editor component.
 * Uses JSON format for content storage and retrieval.
 */
function TiptapEditorComponent({
  content,
  onChange,
  placeholder,
  onEditorReady,
  toolbarSize = "md",
  showModelSelect = false,
  allowAiMenu = true,
  noteId,
  onWikiLinkClick,
  fetchNotes,
}: TiptapEditorProps) {
  const { t } = useTranslation();
  const contentScale = useStore((state) => state.contentScale);
  const codeWrapEnabled = useStore((state) => state.codeWrapEnabled);
  const aiMenuMode = useStore((state) => state.aiMenuMode);
  const setAiMenuMode = useStore((state) => state.setAiMenuMode);
  const toolbarGroups = useStore((state) => state.toolbarGroups);

  // Modal state — only open/close + minimal data passed to child components
  const [mathEdit, setMathEdit] = useState<{
    latex: string;
    type: "inline" | "block";
    pos: number;
  } | null>(null);
  const [imageEdit, setImageEdit] = useState<ImageEditModalOpenState | null>(
    null,
  );

  // Ref to track latest callback for ProseMirror plugin
  const imageClickHandlerRef = useRef<
    ((pos: number, attrs: Record<string, any>) => void) | null
  >(null);
  const editorRef = useRef<ReturnType<typeof useEditor>>(null);
  const lastAppliedContentRef = useRef(content);
  const lastAppliedNoteIdRef = useRef(noteId);

  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const {
    handleNoteSwitch,
    restoreScroll,
    preserveScroll,
    getCurrentScrollTop,
  } = useScrollPosition({ noteId, containerRef: scrollContainerRef });

  const handleCycleAiMode = useCallback(() => {
    const current = useStore.getState().aiMenuMode;
    const next =
      current === "off"
        ? "selection"
        : current === "selection"
          ? "askAi"
          : "off";
    setAiMenuMode(next);
  }, [setAiMenuMode]);

  const textSizeClass = TEXT_SIZE_MAP[contentScale] || "text-base";

  const debouncedOnChange = useDebouncedCallback(
    () => onChange("__content_changed__"),
    300,
  );

  // Handler for inline math click - opens edit dialog
  const handleInlineMathClick = useCallback(
    (node: { attrs: { latex?: string } }, pos: number) => {
      setMathEdit({
        latex: node.attrs.latex || "",
        type: "inline",
        pos,
      });
    },
    [],
  );

  // Handler for block math click - opens edit dialog
  const handleBlockMathClick = useCallback(
    (node: { attrs: { latex?: string } }, pos: number) => {
      setMathEdit({
        latex: node.attrs.latex || "",
        type: "block",
        pos,
      });
    },
    [],
  );

  // Callback for when an image is clicked in the editor
  const handleImageClick = useCallback(
    (pos: number, attrs: Record<string, any>) => {
      const src = attrs.src || "";
      const usesFileSource =
        typeof src === "string" &&
        (isManagedImagePath(src) || isLegacyBase64ImageSrc(src));

      setImageEdit({
        src: usesFileSource ? "" : src,
        sourceMode: usesFileSource ? "file" : "url",
        filePath: usesFileSource ? src : "",
        alt: attrs.alt || "",
        display: attrs.display || "block",
        pos,
      });
    },
    [],
  );

  // Keep the ref in sync with the latest callback
  useEffect(() => {
    imageClickHandlerRef.current = handleImageClick;
  }, [handleImageClick]);

  const extensions = useMemo(
    () => [
      ...getBaseTiptapExtensions({
        placeholder: placeholder || t("note.editorPlaceholder"),
        lowlight: tiptapLowlight,
        onInlineMathClick: handleInlineMathClick,
        onBlockMathClick: handleBlockMathClick,
        onImageClick: (pos, attrs) =>
          imageClickHandlerRef.current?.(pos, attrs),
        onWikiLinkClick,
        fetchNotes,
      }),
      ...getHeavyTiptapExtensions(),
    ],
    [
      handleBlockMathClick,
      handleInlineMathClick,
      placeholder,
      t,
      onWikiLinkClick,
      fetchNotes,
    ],
  );

  const editor = useEditor(
    {
      extensions,
      content: getParsedEditorContent(noteId, content),
      onUpdate: () => {
        debouncedOnChange();
      },
      editorProps: {
        attributes: {
          spellcheck: "false",
          class: "max-w-none focus:outline-none min-h-[500px] p-4 pb-[500px]",
        },
        handleKeyDown(view, event) {
          if (event.key !== "Tab") {
            return false;
          }

          const currentEditor = editorRef.current;
          if (!currentEditor) {
            return false;
          }

          const listItemTypeName = getActiveListItemTypeName(view.state);
          if (!listItemTypeName) {
            return false;
          }

          event.preventDefault();

          if (event.shiftKey) {
            currentEditor.commands.liftListItem(listItemTypeName);
            return true;
          }

          currentEditor.commands.sinkListItem(listItemTypeName);
          return true;
        },
        handleDrop(view, event, _slice, moved) {
          // Let ProseMirror handle internal drag-moves.
          if (moved) {
            return false;
          }

          const files = Array.from(event.dataTransfer?.files || []);
          const imageFiles = files.filter((file) =>
            file.type.startsWith("image/"),
          );

          if (imageFiles.length === 0) {
            return false;
          }

          event.preventDefault();

          const currentEditor = editorRef.current;
          if (!currentEditor) {
            return true;
          }

          const dropPos = view.posAtCoords({
            left: event.clientX,
            top: event.clientY,
          })?.pos;

          if (typeof dropPos === "number") {
            currentEditor.chain().focus().setTextSelection(dropPos).run();
          }

          void (async () => {
            for (const imageFile of imageFiles) {
              if (imageFile.size > MAX_IMAGE_FILE_SIZE_BYTES) {
                toast.error(t("editor.imageFileTooLarge"));
                continue;
              }

              try {
                const savedImage = await saveManagedImageFile(
                  noteId,
                  imageFile,
                );
                currentEditor
                  .chain()
                  .focus()
                  .setImage({
                    src: savedImage.relativePath,
                    alt: imageFile.name || undefined,
                  } as any)
                  .run();
              } catch (error) {
                console.error("Failed to save dropped image:", error);
                toast.error(t("editor.imageFileSaveFailed"));
              }
            }
          })();

          return true;
        },
      },
      immediatelyRender: true,
      shouldRerenderOnTransaction: false,
    },
    [extensions],
  );

  // Consolidated editor initialization: sync ref, track applied content, and notify parent
  useEffect(() => {
    editorRef.current = editor;
    if (!editor) return;

    lastAppliedContentRef.current = content;
    lastAppliedNoteIdRef.current = noteId;
    onEditorReady?.(editor);

    return () => {
      onEditorReady?.(null);
    };
  }, [editor]); // eslint-disable-line react-hooks/exhaustive-deps -- only fire when editor instance changes

  // Update content when it changes from outside (e.g., when switching notes).
  // Use a macrotask so the browser can paint the active tab state before
  // ProseMirror rebuilds a large document tree for the new note.
  useEffect(() => {
    if (!editor) return;

    const isNoteSwitch = handleNoteSwitch(noteId);

    const needsUpdate =
      isNoteSwitch ||
      lastAppliedNoteIdRef.current !== noteId ||
      lastAppliedContentRef.current !== content;

    if (!needsUpdate) return;

    const savedScroll = !isNoteSwitch ? getCurrentScrollTop() : 0;
    let cancelled = false;

    const contentUpdateTimer = setTimeout(() => {
      if (cancelled) return;

      editor.commands.setContent(getParsedEditorContent(noteId, content), {
        emitUpdate: false,
      });

      if (isNoteSwitch) {
        // Clear the previous note's undo stack before the new note is interactive.
        resetEditorHistory(editor);
      }

      lastAppliedContentRef.current = content;
      lastAppliedNoteIdRef.current = noteId;
      // Reset selection to start of document to prevent all content being selected
      editor.commands.setTextSelection(0);
      editor.commands.blur();

      if (isNoteSwitch && noteId) {
        restoreScroll(noteId);
      } else {
        preserveScroll(savedScroll);
      }
    }, 0);

    return () => {
      cancelled = true;
      clearTimeout(contentUpdateTimer);
    };
  }, [
    content,
    editor,
    noteId,
    handleNoteSwitch,
    restoreScroll,
    preserveScroll,
    getCurrentScrollTop,
  ]);

  if (!editor) {
    return null;
  }

  return (
    <div
      className={cn(
        "flex h-full w-full flex-col overflow-hidden bg-background",
        codeWrapEnabled && "code-wrap-enabled",
      )}
    >
      <EditorToolbar
        editor={editor}
        size={toolbarSize}
        onToggleAiMenu={allowAiMenu ? handleCycleAiMode : undefined}
        aiMenuMode={allowAiMenu ? aiMenuMode : "off"}
        toolbarGroups={toolbarGroups}
        onInsertImage={() => {
          setImageEdit({
            src: "",
            sourceMode: "url",
            filePath: "",
            alt: "",
            display: "block",
            pos: null,
          });
        }}
      />
      <div ref={scrollContainerRef} className="flex-1 overflow-y-auto">
        <EditorContent
          editor={editor}
          className={cn("h-full max-w-none", textSizeClass)}
        />
        <TableFloatingToolbar editor={editor} />
        {allowAiMenu && aiMenuMode === "selection" && (
          <Suspense fallback={null}>
            <AiFloatingMenu
              editor={editor}
              isEnabled={true}
              showModelSelect={showModelSelect}
            />
          </Suspense>
        )}
        {allowAiMenu && aiMenuMode === "askAi" && (
          <Suspense fallback={null}>
            <AskAiButton
              editor={editor}
              noteId={noteId}
              showModelSelect={showModelSelect}
            />
          </Suspense>
        )}
      </div>

      {mathEdit && (
        <MathEditModal
          editor={editor}
          initialLatex={mathEdit.latex}
          mathType={mathEdit.type}
          pos={mathEdit.pos}
          onClose={() => setMathEdit(null)}
        />
      )}

      {imageEdit && (
        <ImageEditModal
          editor={editor}
          noteId={noteId}
          initial={imageEdit}
          onClose={() => setImageEdit(null)}
        />
      )}
    </div>
  );
}

TiptapEditorComponent.displayName = "TiptapEditor";

export const TiptapEditor = React.memo(
  TiptapEditorComponent,
  areTiptapEditorPropsEqual,
);
