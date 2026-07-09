import { Tag } from "@/types";

interface ResolveTagIdsFromNamesParams {
  tagNames: string[];
  tags: Tag[];
  addTag: (name: string, color?: string | null) => Promise<Tag | null>;
}

/** Resolves tag names to tag IDs, creating any missing tags as needed. */
export async function resolveTagIdsFromNames({
  tagNames,
  tags,
  addTag,
}: ResolveTagIdsFromNamesParams): Promise<string[]> {
  const existingTagMap = new Map(
    tags.map((tag) => [tag.name.toLowerCase(), tag]),
  );
  const resolvedTagIds: string[] = [];

  for (const rawName of tagNames) {
    const normalizedName = rawName.trim();
    if (!normalizedName) {
      continue;
    }

    const existingTag = existingTagMap.get(normalizedName.toLowerCase());
    if (existingTag) {
      resolvedTagIds.push(existingTag.id);
      continue;
    }

    const createdTag = await addTag(normalizedName);
    if (!createdTag) {
      continue;
    }

    existingTagMap.set(createdTag.name.toLowerCase(), createdTag);
    resolvedTagIds.push(createdTag.id);
  }

  return [...new Set(resolvedTagIds)];
}
