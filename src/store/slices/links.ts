import {
  getBacklinkGroups,
  getOutgoingLinks,
  rebuildLinksForNote,
} from "@/lib/db/noteLinks";
import { BacklinkGroup, NoteLink, ZeroSortState } from "@/types";

type SetState = (
  partial:
    | Partial<ZeroSortState>
    | ((state: ZeroSortState) => Partial<ZeroSortState>),
) => void;
type GetState = () => ZeroSortState;

/**
 * Creates the links slice for managing bidirectional note links.
 */
export function createLinksSlice(set: SetState, get: GetState) {
  return {
    // --- State ---
    currentNoteBacklinks: [] as BacklinkGroup[],
    currentNoteOutgoingLinks: [] as NoteLink[],

    // --- Actions ---

    /**
     * Loads backlinks and outgoing links for a specific note.
     */
    loadNoteLinks: async (noteId: string) => {
      try {
        const [backlinks, outgoingLinks] = await Promise.all([
          getBacklinkGroups(noteId),
          getOutgoingLinks(noteId),
        ]);

        set({
          currentNoteBacklinks: backlinks,
          currentNoteOutgoingLinks: outgoingLinks,
        });
      } catch (error) {
        console.error("Failed to load note links:", error);
        set({
          currentNoteBacklinks: [],
          currentNoteOutgoingLinks: [],
        });
      }
    },

    /**
     * Updates note links after content changes.
     * Extracts wiki links from content and syncs to database.
     */
    updateNoteLinks: async (noteId: string, content: string) => {
      try {
        await rebuildLinksForNote(noteId, content);

        // Reload links for current note if it's the one being edited
        const currentNoteId = get().selectedNoteId;
        if (currentNoteId === noteId) {
          await get().loadNoteLinks(noteId);
        }
      } catch (error) {
        console.error("Failed to update note links:", error);
      }
    },

    /**
     * Refreshes backlinks for a specific note.
     * Called when another note links to this note.
     */
    refreshBacklinks: async (noteId: string) => {
      try {
        const backlinks = await getBacklinkGroups(noteId);

        // Only update if this is the currently selected note
        const currentNoteId = get().selectedNoteId;
        if (currentNoteId === noteId) {
          set({ currentNoteBacklinks: backlinks });
        }
      } catch (error) {
        console.error("Failed to refresh backlinks:", error);
      }
    },
  };
}
