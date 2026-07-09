import {
  cleanupUnusedTagsAction,
  deleteTagsAction,
  getTagByNameAction,
  saveTagAction,
  updateTagAction,
} from "@/lib/actions";
import { Note, Tag, ZeroSortState } from "@/types";
import { toast } from "sonner";

type SetState = (
  partial:
    | Partial<ZeroSortState>
    | ((state: ZeroSortState) => Partial<ZeroSortState>),
) => void;
type GetState = () => ZeroSortState;

const tagNameLookupCache = new WeakMap<Tag[], Map<string, Tag>>();
const noteIndexLookupCache = new WeakMap<Note[], Map<string, number>>();

function normalizeTagName(name: string) {
  return name.trim().toLowerCase();
}

function getTagNameLookup(tags: Tag[]) {
  const cached = tagNameLookupCache.get(tags);
  if (cached) {
    return cached;
  }

  const lookup = new Map<string, Tag>();
  tags.forEach((tag) => {
    lookup.set(normalizeTagName(tag.name), tag);
  });
  tagNameLookupCache.set(tags, lookup);
  return lookup;
}

function getNoteIndexLookup(notes: Note[]) {
  const cached = noteIndexLookupCache.get(notes);
  if (cached) {
    return cached;
  }

  const lookup = new Map<string, number>();
  notes.forEach((note, index) => {
    lookup.set(note.id, index);
  });
  noteIndexLookupCache.set(notes, lookup);
  return lookup;
}

function sortTagsByName(tags: Tag[]) {
  return [...tags].sort((left, right) => left.name.localeCompare(right.name));
}

function upsertTag(tags: Tag[], nextTag: Tag, removedTagIds: string[] = []) {
  const removedIds = new Set(removedTagIds);
  let hasUpdated = false;

  const nextTags = tags
    .filter((tag) => !removedIds.has(tag.id))
    .map((tag) => {
      if (tag.id !== nextTag.id) {
        return tag;
      }

      hasUpdated = true;
      return nextTag;
    });

  if (!hasUpdated) {
    nextTags.push(nextTag);
  }

  return sortTagsByName(nextTags);
}

function patchAffectedNotes(
  notes: Note[],
  notesById: Map<string, Note>,
  affectedNoteIds: string[],
  updateTagIds: (tagIds: string[]) => string[],
  noteUpdatedAt?: string,
) {
  if (affectedNoteIds.length === 0) {
    return { notes, notesById };
  }

  const noteIndexLookup = getNoteIndexLookup(notes);
  const nextNotes = [...notes];
  const nextNotesById = new Map(notesById);

  affectedNoteIds.forEach((noteId) => {
    const note = nextNotesById.get(noteId);
    const noteIndex = noteIndexLookup.get(noteId);

    if (!note || noteIndex === undefined) {
      return;
    }

    const nextTagIds = updateTagIds(note.tagIds);
    const hasTagChange =
      nextTagIds.length !== note.tagIds.length ||
      nextTagIds.some((tagId, index) => tagId !== note.tagIds[index]);
    const hasUpdatedAtChange =
      noteUpdatedAt !== undefined && note.updatedAt !== noteUpdatedAt;

    if (!hasTagChange && !hasUpdatedAtChange) {
      return;
    }

    const nextNote = {
      ...note,
      ...(hasTagChange ? { tagIds: nextTagIds } : null),
      ...(noteUpdatedAt !== undefined ? { updatedAt: noteUpdatedAt } : null),
    };

    nextNotes[noteIndex] = nextNote;
    nextNotesById.set(noteId, nextNote);
  });

  return { notes: nextNotes, notesById: nextNotesById };
}

/**
 * Creates the tags slice of the store.
 * Manages CRUD operations for tags.
 */
export const createTagsSlice = (set: SetState, get: GetState) => ({
  // --- Initial State ---
  tags: [] as Tag[],

  /**
   * Adds a new tag.
   */
  addTag: async (name: string, color?: string | null) => {
    const normalizedName = name.trim();
    if (!normalizedName) {
      return null;
    }

    const { tags } = get();
    const existing = getTagNameLookup(tags).get(
      normalizeTagName(normalizedName),
    );
    if (existing) {
      return existing;
    }

    const newTag: Tag = {
      id: crypto.randomUUID(),
      name: normalizedName,
      color: color ?? null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    try {
      const result = await saveTagAction(newTag);
      set((state) => ({ tags: upsertTag(state.tags, result.tag) }));
      return result.tag;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes("UNIQUE constraint failed: tags.name")) {
        const resolved = await getTagByNameAction(normalizedName);
        if (resolved) {
          set((state) => ({ tags: upsertTag(state.tags, resolved) }));
          return resolved;
        }
      }

      toast.error("Failed to create tag.", {
        position: "bottom-left",
      });
      throw error;
    }
  },

  /**
   * Updates an existing tag's properties.
   */
  updateTag: async (id: string, updates: Partial<Tag>) => {
    const result = await updateTagAction({
      id,
      name: updates.name,
      color: updates.color,
    });

    const { notes, notesById, selectedTagIds, tags } = get();
    const nextTags = result.tag
      ? upsertTag(
          tags,
          result.tag,
          result.merge ? [result.merge.sourceTagId] : [],
        )
      : result.merge
        ? tags.filter((tag) => tag.id !== result.merge!.sourceTagId)
        : tags;

    if (!result.merge) {
      set({ tags: nextTags });
      return;
    }

    const { affectedNoteIds, noteUpdatedAt, sourceTagId, targetTagId } =
      result.merge;
    const nextSelectedTagIds = new Set(selectedTagIds);
    const shouldKeepTargetSelected =
      selectedTagIds.has(sourceTagId) || selectedTagIds.has(targetTagId);

    nextSelectedTagIds.delete(sourceTagId);
    if (shouldKeepTargetSelected) {
      nextSelectedTagIds.add(targetTagId);
    }

    const patchedNotes = patchAffectedNotes(
      notes,
      notesById,
      affectedNoteIds,
      (tagIds) => [
        ...new Set(
          tagIds.map((tagId) => (tagId === sourceTagId ? targetTagId : tagId)),
        ),
      ],
      noteUpdatedAt,
    );

    set({
      tags: nextTags,
      notes: patchedNotes.notes,
      notesById: patchedNotes.notesById,
      selectedTagIds: nextSelectedTagIds,
    });
  },

  /**
   * Deletes a tag. CASCADE handles note_tags cleanup.
   */
  deleteTag: async (id: string) => {
    await get().deleteTags([id]);
  },

  /**
   * Deletes multiple tags. CASCADE handles note_tags cleanup.
   */
  deleteTags: async (ids: string[]) => {
    if (ids.length === 0) {
      return;
    }

    const result = await deleteTagsAction(ids);
    const idsSet = new Set(result.deletedTagIds);
    const { tags, notes, notesById, selectedTagIds } = get();

    const nextSelectedTagIds = new Set(selectedTagIds);
    idsSet.forEach((id) => {
      nextSelectedTagIds.delete(id);
    });

    const patchedNotes = patchAffectedNotes(
      notes,
      notesById,
      result.affectedNoteIds,
      (tagIds) => tagIds.filter((tagId) => !idsSet.has(tagId)),
      result.noteUpdatedAt,
    );

    set({
      tags: tags.filter((tag) => !idsSet.has(tag.id)),
      notes: patchedNotes.notes,
      notesById: patchedNotes.notesById,
      selectedTagIds: nextSelectedTagIds,
    });
  },

  /**
   * Deletes tags that are not assigned to any notes.
   */
  cleanupUnusedTags: async () => {
    const result = await cleanupUnusedTagsAction();

    if (result.deletedIds.length === 0) {
      return 0;
    }

    const deletedIds = new Set(result.deletedIds);
    const { tags, selectedTagIds } = get();
    const nextSelectedTagIds = new Set(selectedTagIds);
    deletedIds.forEach((id) => {
      nextSelectedTagIds.delete(id);
    });

    set({
      tags: tags.filter((tag) => !deletedIds.has(tag.id)),
      selectedTagIds: nextSelectedTagIds,
    });

    return result.deletedIds.length;
  },

  /**
   * Overwrites the current tags list.
   */
  setTags: (tags: Tag[]) => {
    set({ tags });
  },
});
