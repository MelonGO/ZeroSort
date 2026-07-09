import { useStore } from "@/store/useStore";
import type { Transaction } from "@tiptap/pm/state";
import type { Editor } from "@tiptap/react";
import { debounce } from "lodash-es";
import React, { startTransition, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

const CHARACTER_COUNT_DEBOUNCE_MS = 150;

interface CharacterCountProps {
  editor: Editor;
}

export const CharacterCount: React.FC<CharacterCountProps> = React.memo(
  function CharacterCount({ editor }) {
    const showCharacterCount = useStore((state) => state.showCharacterCount);
    const { t } = useTranslation();

    const [characters, setCharacters] = useState(0);
    const [words, setWords] = useState(0);

    useEffect(() => {
      if (!showCharacterCount) {
        return;
      }

      const updateCount = () => {
        startTransition(() => {
          setCharacters(editor.storage.characterCount.characters());
          setWords(editor.storage.characterCount.words());
        });
      };
      const debouncedUpdateCount = debounce(
        updateCount,
        CHARACTER_COUNT_DEBOUNCE_MS,
      );
      const handleTransaction = ({
        transaction,
      }: {
        transaction: Transaction;
      }) => {
        if (!transaction.docChanged) {
          return;
        }

        debouncedUpdateCount();
      };

      updateCount();

      editor.on("transaction", handleTransaction);

      return () => {
        editor.off("transaction", handleTransaction);
        debouncedUpdateCount.cancel();
      };
    }, [editor, showCharacterCount]);

    if (!showCharacterCount) {
      return null;
    }

    return (
      <div className="flex items-center justify-end gap-4 px-4 py-2 text-xs text-muted-foreground border-t border-border bg-muted/30">
        <div className="flex items-center gap-1">
          <span className="font-semibold">{characters}</span>
          <span>{t("editor.characterCount.characters")}</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="font-semibold">{words}</span>
          <span>{t("editor.characterCount.words")}</span>
        </div>
      </div>
    );
  },
);
