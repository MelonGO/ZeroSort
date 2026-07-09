import { open } from "@/lib/dialog";
import { stat } from "@/lib/fs";
import { saveManagedImageFile, saveManagedImagePath } from "@/lib/images";
import { cn } from "@/lib/utils";
import { Editor } from "@tiptap/react";
import { X } from "lucide-react";
import { useCallback, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

const MAX_IMAGE_FILE_SIZE_BYTES = 5 * 1024 * 1024;
const IMAGE_FILE_EXTENSIONS = [
  "jpg",
  "jpeg",
  "png",
  "gif",
  "webp",
  "bmp",
  "svg",
  "avif",
];

type ImageSourceMode = "url" | "file";

function formatFileSize(sizeInBytes: number) {
  if (sizeInBytes < 1024) {
    return `${sizeInBytes} B`;
  }
  const sizeInKb = sizeInBytes / 1024;
  if (sizeInKb < 1024) {
    return `${sizeInKb.toFixed(1)} KB`;
  }
  return `${(sizeInKb / 1024).toFixed(2)} MB`;
}

export interface ImageEditModalOpenState {
  src: string;
  sourceMode: ImageSourceMode;
  filePath: string;
  alt: string;
  display: "inline" | "block";
  pos: number | null;
}

interface ImageEditModalProps {
  editor: Editor;
  noteId?: string;
  initial: ImageEditModalOpenState;
  onClose: () => void;
}

/** Modal for inserting or editing images with URL or file upload support. */
export function ImageEditModal({
  editor,
  noteId,
  initial,
  onClose,
}: ImageEditModalProps) {
  const { t } = useTranslation();

  const [sourceMode, setSourceMode] = useState<ImageSourceMode>(
    initial.sourceMode,
  );
  const [urlSrc, setUrlSrc] = useState(initial.src);
  const [filePath, setFilePath] = useState(initial.filePath);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [selectedFilePath, setSelectedFilePath] = useState("");
  const [fileName, setFileName] = useState("");
  const [fileSize, setFileSize] = useState<number | null>(null);
  const [isDropActive, setIsDropActive] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [alt, setAlt] = useState(initial.alt);
  const [display, setDisplay] = useState<"inline" | "block">(initial.display);

  const editPos = initial.pos;

  const canSave =
    sourceMode === "url"
      ? Boolean(urlSrc.trim()) && !isSaving
      : Boolean(selectedFile || selectedFilePath || filePath) && !isSaving;

  const handleSelectedFile = useCallback(
    (file: File) => {
      if (!file.type.startsWith("image/")) {
        toast.error(t("editor.imageFileReadFailed"));
        return false;
      }

      if (file.size > MAX_IMAGE_FILE_SIZE_BYTES) {
        setSelectedFile(null);
        setFileName("");
        setFileSize(null);
        toast.error(t("editor.imageFileTooLarge"));
        return false;
      }

      setSelectedFile(file);
      setSelectedFilePath("");
      setFileName(file.name);
      setFileSize(file.size);
      return true;
    },
    [t],
  );

  const handleChooseFile = useCallback(async () => {
    try {
      const selected = await open({
        title: t("editor.imageSelectFile"),
        filters: [
          { name: t("editor.image"), extensions: IMAGE_FILE_EXTENSIONS },
        ],
      });
      const nextFilePath = Array.isArray(selected) ? selected[0] : selected;
      if (!nextFilePath) {
        return;
      }

      const fileInfo = await stat(nextFilePath);
      if (!fileInfo.isFile) {
        toast.error(t("editor.imageFileReadFailed"));
        return;
      }

      if (fileInfo.size > MAX_IMAGE_FILE_SIZE_BYTES) {
        setSelectedFile(null);
        setSelectedFilePath("");
        setFileName("");
        setFileSize(null);
        toast.error(t("editor.imageFileTooLarge"));
        return;
      }

      const normalizedPath = nextFilePath.replace(/\\/g, "/");
      setSelectedFile(null);
      setSelectedFilePath(nextFilePath);
      setFilePath("");
      setFileName(normalizedPath.split("/").pop() || nextFilePath);
      setFileSize(fileInfo.size);
    } catch (error) {
      console.error("Failed to choose image file:", error);
      toast.error(t("editor.imageFileReadFailed"));
    }
  }, [t]);

  const handleDrop = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      event.stopPropagation();
      setIsDropActive(false);

      const file = Array.from(event.dataTransfer.files).find((item) =>
        item.type.startsWith("image/"),
      );

      if (!file) {
        toast.error(t("editor.imageFileReadFailed"));
        return;
      }

      handleSelectedFile(file);
    },
    [handleSelectedFile, t],
  );

  const handleSubmit = useCallback(async () => {
    let resolvedSrc = sourceMode === "file" ? filePath : urlSrc.trim();
    if (!resolvedSrc && !selectedFile && !selectedFilePath) {
      return;
    }

    setIsSaving(true);

    try {
      if (sourceMode === "file" && selectedFile) {
        const savedImage = await saveManagedImageFile(noteId, selectedFile);
        resolvedSrc = savedImage.relativePath;
        setFilePath(savedImage.relativePath);
      } else if (sourceMode === "file" && selectedFilePath) {
        const savedImage = await saveManagedImagePath(noteId, selectedFilePath);
        resolvedSrc = savedImage.relativePath;
        setFilePath(savedImage.relativePath);
      }

      if (!resolvedSrc) {
        return;
      }

      if (editPos !== null) {
        const { tr } = editor.state;
        const node = editor.state.doc.nodeAt(editPos);
        if (node && node.type.name === "image") {
          tr.setNodeMarkup(editPos, undefined, {
            ...node.attrs,
            src: resolvedSrc,
            alt,
            display,
          });
          editor.view.dispatch(tr);
        }
      } else {
        editor
          .chain()
          .focus()
          .setImage({
            src: resolvedSrc,
            alt: alt || undefined,
          } as any)
          .run();
        if (display === "inline") {
          const { state } = editor;
          const pos = state.selection.from - 1;
          const node = state.doc.nodeAt(pos);
          if (node && node.type.name === "image") {
            const { tr } = state;
            tr.setNodeMarkup(pos, undefined, {
              ...node.attrs,
              display,
            });
            editor.view.dispatch(tr);
          }
        }
      }

      onClose();
    } catch (error) {
      console.error("Failed to save managed image:", error);
      toast.error(t("editor.imageFileSaveFailed"));
    } finally {
      setIsSaving(false);
    }
  }, [
    alt,
    display,
    editPos,
    editor,
    filePath,
    noteId,
    onClose,
    selectedFile,
    selectedFilePath,
    sourceMode,
    t,
    urlSrc,
  ]);

  const handleDelete = useCallback(async () => {
    if (editPos === null) {
      onClose();
      return;
    }

    const node = editor.state.doc.nodeAt(editPos);
    if (node && node.type.name === "image") {
      const { tr } = editor.state;
      tr.delete(editPos, editPos + node.nodeSize);
      editor.view.dispatch(tr);
    }
    onClose();
  }, [editor, editPos, onClose]);

  const dropZoneClass = cn(
    "flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-4 py-6 text-center transition-colors",
    isDropActive
      ? "border-primary bg-primary/10"
      : "border-border bg-muted/30 hover:bg-muted/50",
  );

  return createPortal(
    <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/50 p-4">
      <div
        className="flex w-full max-w-md flex-col overflow-hidden rounded-2xl bg-card shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-border p-4">
          <h3 className="text-lg font-semibold text-foreground">
            {editPos !== null ? t("editor.editImage") : t("editor.insertImage")}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <X size={20} />
          </button>
        </div>
        <div className="flex flex-col gap-4 p-4">
          <div className="flex rounded-lg bg-muted p-0.5">
            <button
              type="button"
              onClick={() => setSourceMode("url")}
              className={cn(
                "flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                sourceMode === "url"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {t("editor.imageFromUrl")}
            </button>
            <button
              type="button"
              onClick={() => setSourceMode("file")}
              className={cn(
                "flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                sourceMode === "file"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {t("editor.imageFromFile")}
            </button>
          </div>
          {sourceMode === "url" ? (
            <div key="url" className="flex flex-col gap-1">
              <label
                htmlFor="image-url-input"
                className="text-sm text-muted-foreground"
              >
                {t("editor.imageUrl")}
              </label>
              <input
                id="image-url-input"
                type="url"
                placeholder="https://example.com/image.png"
                value={urlSrc}
                onChange={(e) => setUrlSrc(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleSubmit();
                  }
                }}
                className="w-full rounded-xl border-none bg-muted px-4 py-3 text-sm transition-all outline-none focus:ring-2 focus:ring-accent"
                autoFocus
              />
            </div>
          ) : (
            <div key="file" className="flex flex-col gap-2">
              <span className="text-sm text-muted-foreground">
                {t("editor.imageSelectFile")}
              </span>
              <button
                type="button"
                onClick={handleChooseFile}
                className="w-full rounded-xl border border-border bg-card px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted"
              >
                {t("editor.imageChooseFile")}
              </button>
              <div
                className={dropZoneClass}
                onDragEnter={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  setIsDropActive(true);
                }}
                onDragOver={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  const hasImageFile = Array.from(
                    event.dataTransfer.items || [],
                  ).some(
                    (item) =>
                      item.kind === "file" && item.type.startsWith("image/"),
                  );
                  setIsDropActive(hasImageFile);
                }}
                onDragLeave={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  if (
                    event.currentTarget.contains(event.relatedTarget as Node)
                  ) {
                    return;
                  }
                  setIsDropActive(false);
                }}
                onDrop={handleDrop}
              >
                <p className="text-sm font-medium text-foreground">
                  {t("editor.imageDropHere")}
                </p>
                <p className="text-xs text-muted-foreground">
                  {t("editor.imageDropHint")}
                </p>
              </div>
              {fileName && fileSize !== null && (
                <p className="text-xs text-muted-foreground">
                  {`${fileName} (${formatFileSize(fileSize)})`}
                </p>
              )}
              <p className="text-xs text-muted-foreground">
                {t("editor.imageFileLimit")}
              </p>
            </div>
          )}
          <div className="flex flex-col gap-1">
            <label
              htmlFor="image-alt-input"
              className="text-sm text-muted-foreground"
            >
              {t("editor.imageAlt")}
            </label>
            <input
              id="image-alt-input"
              type="text"
              placeholder="Describe the image..."
              value={alt}
              onChange={(e) => setAlt(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleSubmit();
                }
              }}
              className="w-full rounded-xl border-none bg-muted px-4 py-3 text-sm transition-all outline-none focus:ring-2 focus:ring-accent"
            />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">
              {t("editor.image")}:
            </span>
            <div className="flex rounded-lg bg-muted p-0.5">
              <button
                type="button"
                onClick={() => setDisplay("block")}
                className={cn(
                  "rounded-md px-3 py-1 text-xs font-medium transition-colors",
                  display === "block"
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {t("editor.displayBlock")}
              </button>
              <button
                type="button"
                onClick={() => setDisplay("inline")}
                className={cn(
                  "rounded-md px-3 py-1 text-xs font-medium transition-colors",
                  display === "inline"
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {t("editor.displayInline")}
              </button>
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-2 border-t border-border p-4">
          {editPos !== null && (
            <button
              type="button"
              onClick={handleDelete}
              className="mr-auto rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-2 text-sm font-medium text-destructive transition-colors hover:bg-destructive/20"
            >
              {t("editor.deleteImage")}
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-border bg-card px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted"
          >
            {t("common.cancel")}
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!canSave}
            className="rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
          >
            {t("common.save")}
          </button>
        </div>
      </div>
      <div className="absolute inset-0 -z-10" onClick={onClose} />
    </div>,
    document.body,
  );
}
