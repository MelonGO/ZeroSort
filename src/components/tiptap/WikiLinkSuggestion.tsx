/**
 * WikiLink autocomplete suggestion plugin for Tiptap.
 * Shows note title suggestions when typing [[.
 */

import i18n from "@/i18n";
import { Note } from "@/types";
import { ReactRenderer } from "@tiptap/react";
import type { SuggestionOptions, SuggestionProps } from "@tiptap/suggestion";
import Suggestion from "@tiptap/suggestion";
import { forwardRef, useEffect, useImperativeHandle, useState } from "react";
import tippy, { type Instance as TippyInstance } from "tippy.js";

export interface WikiLinkSuggestionItem {
  id: string;
  title: string;
  summary?: string;
}

interface WikiLinkListProps {
  items: WikiLinkSuggestionItem[];
  command: (item: WikiLinkSuggestionItem) => void;
}

export interface WikiLinkListRef {
  onKeyDown: (props: { event: KeyboardEvent }) => boolean;
}

/**
 * Dropdown list component for wiki link suggestions.
 */
export const WikiLinkList = forwardRef<WikiLinkListRef, WikiLinkListProps>(
  ({ items, command }, ref) => {
    const [selectedIndex, setSelectedIndex] = useState(0);

    useEffect(() => {
      setSelectedIndex(0);
    }, [items]);

    useImperativeHandle(ref, () => ({
      onKeyDown: ({ event }) => {
        if (event.key === "ArrowUp") {
          setSelectedIndex((prev) => (prev > 0 ? prev - 1 : items.length - 1));
          return true;
        }

        if (event.key === "ArrowDown") {
          setSelectedIndex((prev) => (prev < items.length - 1 ? prev + 1 : 0));
          return true;
        }

        if (event.key === "Enter") {
          if (items[selectedIndex]) {
            command(items[selectedIndex]);
            return true;
          }
        }

        return false;
      },
    }));

    if (items.length === 0) {
      return (
        <div className="wiki-link-suggestion-list">
          <div className="wiki-link-suggestion-empty">
            {i18n.t("wikiLinks.noNotesFound", "No notes found")}
          </div>
        </div>
      );
    }

    return (
      <div className="wiki-link-suggestion-list">
        {items.map((item, index) => (
          <button
            key={item.id}
            className={`wiki-link-suggestion-item ${
              index === selectedIndex ? "selected" : ""
            }`}
            onClick={() => command(item)}
          >
            <div className="wiki-link-suggestion-title">{item.title}</div>
            {item.summary && (
              <div className="wiki-link-suggestion-summary">{item.summary}</div>
            )}
          </button>
        ))}
      </div>
    );
  },
);

WikiLinkList.displayName = "WikiLinkList";

/**
 * Creates Tiptap suggestion configuration for wiki links.
 */
export function createWikiLinkSuggestion(
  fetchNotes: () => Promise<Note[]>,
): Omit<SuggestionOptions, "editor"> {
  return {
    char: "[[",
    allowSpaces: true,

    items: async ({ query }): Promise<WikiLinkSuggestionItem[]> => {
      const notes = await fetchNotes();
      const normalizedQuery = query.toLowerCase().trim();

      if (!normalizedQuery) {
        // Return all notes if no query
        return notes
          .map((note) => ({
            id: note.id,
            title: note.title,
            summary: note.summary,
          }))
          .slice(0, 10);
      }

      // Fuzzy search: filter notes by title
      const filtered = notes.filter((note) =>
        note.title.toLowerCase().includes(normalizedQuery),
      );

      return filtered
        .map((note) => ({
          id: note.id,
          title: note.title,
          summary: note.summary,
        }))
        .slice(0, 10);
    },

    render: () => {
      let component: ReactRenderer<WikiLinkListRef, WikiLinkListProps>;
      let popup: TippyInstance[];

      return {
        onStart: (props: SuggestionProps) => {
          component = new ReactRenderer(WikiLinkList, {
            props: {
              items: props.items as WikiLinkSuggestionItem[],
              command: props.command,
            },
            editor: props.editor,
          });

          if (!props.clientRect) {
            return;
          }

          popup = tippy("body", {
            getReferenceClientRect: props.clientRect as () => DOMRect,
            appendTo: () => document.body,
            content: component.element,
            showOnCreate: true,
            interactive: true,
            trigger: "manual",
            placement: "bottom-start",
          });
        },

        onUpdate: (props: SuggestionProps) => {
          component.updateProps({
            items: props.items as WikiLinkSuggestionItem[],
            command: props.command,
          });

          if (!props.clientRect) {
            return;
          }

          popup[0].setProps({
            getReferenceClientRect: props.clientRect as () => DOMRect,
          });
        },

        onKeyDown: (props: { event: KeyboardEvent }) => {
          if (props.event.key === "Escape") {
            popup[0].hide();
            return true;
          }

          return component.ref?.onKeyDown(props) ?? false;
        },

        onExit: () => {
          popup[0].destroy();
          component.destroy();
        },
      };
    },

    command: ({ editor, range, props }) => {
      const item = props as WikiLinkSuggestionItem;

      // Replace [[ and query text with WikiLink node
      editor
        .chain()
        .focus()
        .deleteRange(range)
        .insertContent({
          type: "wikiLink",
          attrs: {
            noteTitle: item.title,
            displayText: undefined,
            isBroken: false,
          },
        })
        .run();
    },
  };
}

/**
 * Extension that adds wiki link autocomplete.
 */
export function createWikiLinkSuggestionExtension(
  fetchNotes: () => Promise<Note[]>,
) {
  return Suggestion<WikiLinkSuggestionItem>({
    ...createWikiLinkSuggestion(fetchNotes),
  } as any);
}
