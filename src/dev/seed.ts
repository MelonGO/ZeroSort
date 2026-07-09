import {
  bulkDeleteNotesAction,
  bulkSaveNotesAction,
  bulkSaveTagsAction,
  deleteTagAction,
  getDirectoriesAction,
  getNotesAction,
  getTagsAction,
} from "@/lib/actions";
import { getDirPath } from "@/store/helpers";
import { Note, Tag } from "@/types";

// Seed tags with realistic names and colors
const SEED_TAGS: { name: string; color: string }[] = [
  { name: "Urgent", color: "#ef4444" },
  { name: "In Progress", color: "#f59e0b" },
  { name: "Done", color: "#22c55e" },
  { name: "Idea", color: "#a855f7" },
  { name: "Bug", color: "#dc2626" },
  { name: "Feature", color: "#3b82f6" },
  { name: "Research", color: "#6366f1" },
  { name: "Meeting Notes", color: "#ec4899" },
  { name: "Personal", color: "#14b8a6" },
  { name: "Follow Up", color: "#f97316" },
  { name: "Blocked", color: "#64748b" },
  { name: "Low Priority", color: "#94a3b8" },
  { name: "High Priority", color: "#e11d48" },
  { name: "Documentation", color: "#0ea5e9" },
  { name: "Review", color: "#8b5cf6" },
];

// Add a large number of random tags for load testing
for (let i = 1; i <= 20000; i++) {
  SEED_TAGS.push({
    name: `Test Tag ${i}`,
    color: `#${Math.floor(Math.random() * 16777215)
      .toString(16)
      .padStart(6, "0")}`,
  });
}

// Expanded directory sets for more realistic hierarchy combinations
const ROOT_DIRS = ["Work", "Personal", "Side Projects", "Reference", "Archive"];
const SUB_DIRS_WORK = [
  "Meetings",
  "Planning",
  "Reports",
  "Clients",
  "HR",
  "Tech Specs",
];
const SUB_DIRS_PERSONAL = [
  "Journal",
  "Health",
  "Finance",
  "Travel",
  "Shopping",
  "Recipes",
];
const SUB_DIRS_TECH = [
  "React",
  "TypeScript",
  "Rust",
  "AI",
  "Databases",
  "Design Patterns",
];
const SUB_DIRS_MISC = ["Ideas", "Drafts", "Backlog", "Random", "Swipe File"];

const TITLES = [
  "Project Alpha Sync",
  "Weekly Grocery Run",
  "Japan Trip Itinerary",
  "Interview Prep: Algorithms",
  "Daily Log: Reflections",
  "Summer Reading List",
  "Marathon Training Plan",
  "SaaS Startup Idea",
  "Holiday Gift List",
  "API Specifications",
  "Sprint Retro",
  "Bug #404 Analysis",
  "Feature Request: Dark Mode",
  "Morning Routine Checklist",
  "Slow Cooker Recipes",
  "Kitchen Renovation Budget",
  "Tax Return Checklist",
  "Q3 Market Analysis",
  "Spanish Vocabulary",
  "Podcast: Tech Trends",
];

const SUMMARIES = [
  "Notes regarding the timeline and blockers.",
  "Essentials for the upcoming week.",
  "Flight details, hotels, and budget breakdown.",
  "QuickSort, MergeSort, and Big O notation.",
  "Thoughts on productivity and mindfulness.",
  "Sci-fi and non-fiction bestsellers.",
  "Weekly mileage and cross-training schedule.",
  "Monetization strategy and MVP scope.",
  "Ideas for family and friends.",
  "Endpoints, payloads, and error handling.",
  "What went well and what needs improvement.",
  "Stack trace analysis and reproduction steps.",
  "User feedback summary regarding UI themes.",
  "Habit tracking for better focus.",
  "Healthy and easy meal prep ideas.",
  "Contractor quotes and material costs.",
  "Documents needed for the accountant.",
  "Stock performance and sector trends.",
  "Common phrases and grammar rules.",
  "Key takeaways from the episode.",
];

// ------------------------------------------------------------------
// CONTENT GENERATION ASSETS
// ------------------------------------------------------------------

const SENTENCES_BUSINESS = [
  "The stakeholders are asking for a revised timeline by EOD.",
  "We need to leverage our core competencies to drive synergy.",
  "The Q3 roadmap looks promising, but resource allocation remains a bottleneck.",
  "Let's circle back on this during the standup.",
  "We identified three key milestones that need to be hit by next month.",
  "The churn rate has decreased by 2%, which is a positive signal.",
  "Please review the attached PDF for full compliance details.",
  "Dependencies on the design team are causing a slight delay.",
  "We need to optimize the funnel to improve conversion rates.",
];

const SENTENCES_TECH = [
  "The API response time is averaging 200ms, which is within the SLA.",
  "I need to refactor the authentication middleware to support OAuth2.",
  "The database migration failed due to a foreign key constraint.",
  "We should consider switching from Redux to Zustand for state management.",
  "The CSS grid layout breaks on legacy browsers.",
  "Running the build locally works, but CI/CD is throwing a 500 error.",
  "Implemented a recursive depth-first search to solve the graph problem.",
  "Memory usage spikes when processing large JSON payloads.",
  "Don't forget to update the .env file with the new keys.",
];

const SENTENCES_PERSONAL = [
  "Felt a bit groggy this morning, but a 5km run helped.",
  "Need to buy milk, eggs, and coffee beans on the way home.",
  "Reading 'Dune' has been an absolute blast so far.",
  "The flight to Tokyo is booked! Now to figure out the rail pass.",
  "Started learning Spanish on Duolingo again.",
  "The kitchen renovation budget is going slightly over.",
  "Remember to call Mom for her birthday on Saturday.",
  "Need to schedule a dentist appointment for next week.",
  "Sleep schedule has been erratic; need to enforce no screens after 10 PM.",
];

const SENTENCES_CREATIVE = [
  "The sun dipped below the horizon, painting the sky in shades of violet and gold.",
  "A lone wolf howled in the distance, its voice echoing through the silent valley.",
  "The smell of fresh rain on hot pavement always brought back childhood memories.",
  "She opened the drawer and found a forgotten map to a place that didn't exist.",
  "The old bookstore felt like a sanctuary from the bustling city streets outside.",
  "Neon lights flickered, casting long, distorted shadows on the wet sidewalk.",
  "Every whisper of the wind seemed to carry a secret from a thousand years ago.",
];

// Tiptap JSON node snippets for rich content
const TIPTAP_SNIPPETS = [
  // Code block
  {
    type: "codeBlock",
    attrs: { language: "typescript" },
    content: [
      {
        type: "text",
        text: "interface User {\n  id: string;\n  name: string;\n  email: string;\n}\n\nconst getUser = (id: string): User => {\n  return { id, name: 'John Doe', email: 'john@example.com' };\n};",
      },
    ],
  },
  // Blockquote
  {
    type: "blockquote",
    content: [
      {
        type: "paragraph",
        content: [
          {
            type: "text",
            text: "Innovation distinguishes between a leader and a follower. - Steve Jobs",
          },
        ],
      },
    ],
  },
  // Task list
  {
    type: "taskList",
    content: [
      {
        type: "taskItem",
        attrs: { checked: false },
        content: [
          {
            type: "paragraph",
            content: [
              { type: "text", text: "Research competitor feature sets" },
            ],
          },
        ],
      },
      {
        type: "taskItem",
        attrs: { checked: true },
        content: [
          {
            type: "paragraph",
            content: [{ type: "text", text: "Setup project repository" }],
          },
        ],
      },
      {
        type: "taskItem",
        attrs: { checked: false },
        content: [
          {
            type: "paragraph",
            content: [
              { type: "text", text: "Draft initial architecture diagram" },
            ],
          },
        ],
      },
    ],
  },
  // Heading
  {
    type: "heading",
    attrs: { level: 2 },
    content: [{ type: "text", text: "Analysis & Metrics" }],
  },
  // Table
  {
    type: "table",
    content: [
      {
        type: "tableRow",
        content: [
          {
            type: "tableHeader",
            content: [
              {
                type: "paragraph",
                content: [{ type: "text", text: "Metric" }],
              },
            ],
          },
          {
            type: "tableHeader",
            content: [
              { type: "paragraph", content: [{ type: "text", text: "Value" }] },
            ],
          },
          {
            type: "tableHeader",
            content: [
              {
                type: "paragraph",
                content: [{ type: "text", text: "Status" }],
              },
            ],
          },
        ],
      },
      {
        type: "tableRow",
        content: [
          {
            type: "tableCell",
            content: [
              {
                type: "paragraph",
                content: [{ type: "text", text: "CPU Usage" }],
              },
            ],
          },
          {
            type: "tableCell",
            content: [
              { type: "paragraph", content: [{ type: "text", text: "12%" }] },
            ],
          },
          {
            type: "tableCell",
            content: [
              {
                type: "paragraph",
                content: [{ type: "text", text: "Normal" }],
              },
            ],
          },
        ],
      },
      {
        type: "tableRow",
        content: [
          {
            type: "tableCell",
            content: [
              {
                type: "paragraph",
                content: [{ type: "text", text: "Latency" }],
              },
            ],
          },
          {
            type: "tableCell",
            content: [
              { type: "paragraph", content: [{ type: "text", text: "45ms" }] },
            ],
          },
          {
            type: "tableCell",
            content: [
              {
                type: "paragraph",
                content: [{ type: "text", text: "Excellent" }],
              },
            ],
          },
        ],
      },
    ],
  },
  // Image
  {
    type: "image",
    attrs: {
      src: "https://picsum.photos/seed/" + Math.random() + "/800/400",
      alt: "Random workspace inspiration",
      display: "block",
    },
  },
  // Block Math
  {
    type: "blockMath",
    attrs: {
      latex:
        "f(x) = \\int_{-\\infty}^{\\infty} \\hat{f}(\\xi) e^{2\\pi i x \\xi} d\\xi",
    },
  },
  // Markmap mindmap
  {
    type: "markmap",
    attrs: {
      content:
        "# Project Roadmap\n## Phase 1: MVP\n- Auth\n- Database schema\n- Core Editor\n## Phase 2: Growth\n- Collaborative editing\n- AI features\n- Export options",
      height: 250,
    },
  },
  // Chart
  {
    type: "chart",
    attrs: {
      config: JSON.stringify({
        type: "line",
        data: {
          labels: ["Jan", "Feb", "Mar", "Apr", "May", "Jun"],
          datasets: [
            {
              label: "User Growth",
              data: [12, 19, 3, 5, 2, 3],
              borderColor: "rgb(75, 192, 192)",
              tension: 0.1,
            },
          ],
        },
      }),
      height: 300,
    },
  },
  // Mermaid diagrams
  {
    type: "mermaidDiagram",
    attrs: {
      content:
        "graph TD\n  A[Start] --> B{Decision}\n  B -->|Yes| C[Action 1]\n  B -->|No| D[Action 2]\n  C --> E[End]\n  D --> E",
      height: 300,
    },
  },
  {
    type: "mermaidDiagram",
    attrs: {
      content:
        "sequenceDiagram\n  participant U as User\n  participant S as Server\n  participant DB as Database\n  U->>S: POST /api/notes\n  S->>DB: INSERT note\n  DB-->>S: OK\n  S-->>U: 201 Created",
      height: 300,
    },
  },
  {
    type: "mermaidDiagram",
    attrs: {
      content:
        'pie title Time Allocation\n  "Development" : 40\n  "Meetings" : 20\n  "Code Review" : 15\n  "Planning" : 15\n  "Learning" : 10',
      height: 300,
    },
  },
  {
    type: "mermaidDiagram",
    attrs: {
      content:
        'classDiagram\n  class Note {\n    +String id\n    +String title\n    +String content\n    +save()\n    +delete()\n  }\n  class Tag {\n    +String id\n    +String name\n    +String color\n  }\n  Note "*" --> "*" Tag',
      height: 300,
    },
  },
  {
    type: "mermaidDiagram",
    attrs: {
      content:
        "gantt\n  title Sprint Plan\n  dateFormat YYYY-MM-DD\n  section Backend\n  API Design :a1, 2025-01-01, 3d\n  Implementation :a2, after a1, 5d\n  section Frontend\n  UI Mockups :b1, 2025-01-01, 2d\n  Components :b2, after b1, 4d",
      height: 300,
    },
  },
  // Excalidraw placeholder
  {
    type: "excalidraw",
    attrs: {
      sceneData: "",
      height: 400,
    },
  },
  // Horizontal Rule
  {
    type: "horizontalRule",
  },
];

const getRandom = <T>(arr: T[]): T =>
  arr[Math.floor(Math.random() * arr.length)];

// Generate a random hierarchy path
const generateRandomCatalog = (year: string): string[] => {
  // Always start with Testing to allow easy cleanup
  const catalog = ["Testing"];

  // 80% chance to organize by Year first
  if (Math.random() > 0.2) catalog.push(year);

  const root = getRandom(ROOT_DIRS);
  catalog.push(root);

  // Add depth based on probability
  if (Math.random() > 0.3) {
    let subOptions = SUB_DIRS_MISC;
    if (root === "Work") subOptions = SUB_DIRS_WORK;
    else if (root === "Personal") subOptions = SUB_DIRS_PERSONAL;
    else if (root === "Reference") subOptions = SUB_DIRS_TECH;

    catalog.push(getRandom(subOptions));

    // Occasional 4th level of depth
    if (Math.random() > 0.7) {
      catalog.push(getRandom(["Archives", "Active", "Pending", "v1", "v2"]));
    }
  }

  return catalog;
};

// Generate a random time for a given date
const randomizeTime = (date: Date): Date => {
  const newDate = new Date(date);
  newDate.setHours(Math.floor(Math.random() * 24));
  newDate.setMinutes(Math.floor(Math.random() * 60));
  newDate.setSeconds(Math.floor(Math.random() * 60));
  return newDate;
};

/**
 * Generates rich text for a paragraph, occasionally adding marks.
 */
const generateRichText = (text: string): object[] => {
  const words = text.split(" ");
  const result: object[] = [];
  let currentWordGroup: string[] = [];

  const flush = () => {
    if (currentWordGroup.length > 0) {
      result.push({ type: "text", text: currentWordGroup.join(" ") + " " });
      currentWordGroup = [];
    }
  };

  words.forEach((word) => {
    const roll = Math.random();
    if (roll > 0.95) {
      flush();
      const markType = getRandom([
        "bold",
        "italic",
        "underline",
        "strike",
        "highlight",
        "color",
        "link",
        "inlineMath",
      ]);
      const marks: any[] = [];
      let textContent = word;

      if (markType === "bold") marks.push({ type: "bold" });
      else if (markType === "italic") marks.push({ type: "italic" });
      else if (markType === "underline") marks.push({ type: "underline" });
      else if (markType === "strike") marks.push({ type: "strike" });
      else if (markType === "highlight")
        marks.push({ type: "highlight", attrs: { color: "#ffcc00" } });
      else if (markType === "color")
        marks.push({ type: "textStyle", attrs: { color: "#ff4444" } });
      else if (markType === "link")
        marks.push({ type: "link", attrs: { href: "https://google.com" } });

      if (markType === "inlineMath") {
        result.push({ type: "inlineMath", attrs: { latex: "E=mc^2" } });
        result.push({ type: "text", text: " " });
      } else {
        result.push({
          type: "text",
          marks,
          text: word + " ",
        });
      }
    } else {
      currentWordGroup.push(word);
    }
  });

  flush();
  return result;
};

/**
 * Generates a Tiptap JSON document structure resembling a real note.
 * Mixes sentences and occasionally adds rich content elements.
 */
const generateLongContent = (): string => {
  // Decide length: 3 to 10 paragraphs
  const paragraphCount = Math.floor(Math.random() * 8) + 3;
  const contentNodes: object[] = [];

  // Pool of all sentences
  const allSentences = [
    ...SENTENCES_BUSINESS,
    ...SENTENCES_TECH,
    ...SENTENCES_PERSONAL,
    ...SENTENCES_CREATIVE,
  ];

  // 40% chance to start with an H1
  if (Math.random() > 0.6) {
    contentNodes.push({
      type: "heading",
      attrs: { level: 1 },
      content: [{ type: "text", text: getRandom(TITLES) }],
    });
  }

  for (let i = 0; i < paragraphCount; i++) {
    // Decide sentences per paragraph: 2 to 6 sentences
    const sentenceCount = Math.floor(Math.random() * 5) + 2;
    let paragraphText = "";

    for (let j = 0; j < sentenceCount; j++) {
      paragraphText += getRandom(allSentences) + " ";
    }

    // Add paragraph node with rich text
    contentNodes.push({
      type: "paragraph",
      content: generateRichText(paragraphText.trim()),
    });

    // 40% chance to insert a Tiptap snippet between paragraphs
    if (Math.random() > 0.6) {
      const snippet = getRandom(TIPTAP_SNIPPETS);
      contentNodes.push(snippet);

      // Add ordered list after "Key Takeaways" heading (now Analysis & Metrics or H2)
      if (snippet.type === "heading") {
        contentNodes.push({
          type: "bulletList",
          content: [
            {
              type: "listItem",
              content: [
                {
                  type: "paragraph",
                  content: [
                    { type: "text", text: "Observation A: High impact." },
                  ],
                },
              ],
            },
            {
              type: "listItem",
              content: [
                {
                  type: "paragraph",
                  content: [
                    {
                      type: "text",
                      text: "Observation B: Low effort required.",
                    },
                  ],
                },
                // Nested list example
                {
                  type: "bulletList",
                  content: [
                    {
                      type: "listItem",
                      content: [
                        {
                          type: "paragraph",
                          content: [{ type: "text", text: "Sub-point 1" }],
                        },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        });
      }
    }
  }

  const document = {
    type: "doc",
    content: contentNodes,
  };

  return JSON.stringify(document);
};

/**
 * Seeds the database with fake notes.
 * Uses batching to ensure high quantity without blocking.
 */
export async function seedFakeNotes() {
  const years = [
    2025, 2024, 2023, 2022, 2021, 2020, 2019, 2018, 2017, 2016, 2015, 2014,
    2013, 2012, 2011, 2010,
  ];
  const months = Array.from({ length: 12 }, (_, i) => i); // 0-11

  console.log("Starting database seeding...");

  // Create seed tags or reuse existing ones to prevent UNIQUE constraint errors
  const existingTags = (await getTagsAction()) as Tag[];
  const existingTagsByName = new Map(existingTags.map((t) => [t.name, t.id]));

  const now = new Date().toISOString();
  const newTagsToCreate: Tag[] = [];
  const seedTagIds: string[] = [];

  for (const t of SEED_TAGS) {
    if (existingTagsByName.has(t.name)) {
      seedTagIds.push(existingTagsByName.get(t.name)!);
    } else {
      const id = crypto.randomUUID();
      newTagsToCreate.push({
        id,
        name: t.name,
        color: t.color,
        createdAt: now,
      });
      seedTagIds.push(id);
    }
  }

  if (newTagsToCreate.length > 0) {
    await bulkSaveTagsAction(newTagsToCreate);
    console.log(`Created ${newTagsToCreate.length} new tags.`);
  }
  console.log(`Total active testing tags: ${seedTagIds.length}`);

  const BATCH_SIZE = 1000;
  let notesBatch: { note: Note; catalog: string[] }[] = [];
  let totalCreated = 0;

  for (const year of years) {
    // Randomize "busy" years vs "quiet" years
    const yearMultiplier = Math.random() * 1.5 + 0.5;

    for (const month of months) {
      // Skip future dates
      const checkDate = new Date(year, month, 1);
      if (checkDate > new Date()) continue;

      // Determine density for this month (Scatter logic)
      // Some months have 0 notes, some have 5, some have 100
      const densityRoll = Math.random();
      let notesInMonth = 0;

      if (densityRoll > 0.9)
        notesInMonth = Math.floor(Math.random() * 150) + 50; // Heavy month
      else if (densityRoll > 0.6)
        notesInMonth = Math.floor(Math.random() * 40) + 10; // Medium month
      else if (densityRoll > 0.2)
        notesInMonth = Math.floor(Math.random() * 10) + 1; // Light month
      else notesInMonth = 0; // Empty month

      // Apply multiplier
      notesInMonth = Math.floor(notesInMonth * yearMultiplier);

      for (let i = 0; i < notesInMonth; i++) {
        const day = Math.floor(Math.random() * 28) + 1;
        const baseDate = new Date(year, month, day);
        const finalDate = randomizeTime(baseDate);
        const isoDate = finalDate.toISOString();

        const titleIndex = Math.floor(Math.random() * TITLES.length);

        const catalog = generateRandomCatalog(year.toString());

        const noteTagIds: string[] = [];
        // Test: Link the first tag to 90% of the notes
        if (Math.random() > 0.1 && seedTagIds.length > 0) {
          noteTagIds.push(seedTagIds[0]);
        }

        // Assign 0-3 other random tags per note (60% chance of having at least one)
        if (Math.random() > 0.4) {
          const tagCount = Math.floor(Math.random() * 3) + 1;
          for (let k = 0; k < tagCount; k++) {
            if (seedTagIds.length > 1) {
              // Pick a random index from 1 to length - 1 to ignore the first tag
              const randomIndex =
                Math.floor(Math.random() * (seedTagIds.length - 1)) + 1;
              const randomTagId = seedTagIds[randomIndex];
              if (!noteTagIds.includes(randomTagId)) {
                noteTagIds.push(randomTagId);
              }
            }
          }
        }

        const note: Note = {
          id: crypto.randomUUID(),
          title: TITLES[titleIndex],
          summary: SUMMARIES[titleIndex] || getRandom(SUMMARIES),
          content: generateLongContent(),
          directoryId: null,
          createdAt: isoDate,
          updatedAt: isoDate,
          tagIds: noteTagIds,
        };

        notesBatch.push({ note, catalog });

        // Process batch
        if (notesBatch.length >= BATCH_SIZE) {
          await bulkSaveNotesAction(notesBatch);
          totalCreated += notesBatch.length;
          notesBatch = [];
        }
      }
    }
  }

  // Process remaining
  if (notesBatch.length > 0) {
    await bulkSaveNotesAction(notesBatch);
    totalCreated += notesBatch.length;
  }

  console.log(
    `Database seeding completed! Created ${totalCreated} notes and ${seedTagIds.length} tags.`,
  );
  alert(
    `Seeding completed! Created ${totalCreated} notes and ${seedTagIds.length} tags. Please refresh the app.`,
  );
}

/**
 * Deletes all notes that were created by the seeding process.
 * Identification is based on the 'Testing' tag at the root of the catalog.
 */
export async function deleteFakeNotes() {
  console.log("Starting deletion of fake notes...");

  try {
    const [allNotes, allDirs] = await Promise.all([
      getNotesAction(),
      getDirectoriesAction(),
    ]);

    // Look for notes where the first catalog item is 'Testing'
    const fakeNotes = (allNotes as Note[]).filter((note) => {
      if (!note.directoryId) return false;
      const path = getDirPath(note.directoryId, allDirs as any);
      return path[0] === "Testing";
    });

    if (fakeNotes.length === 0) {
      console.log("No fake notes found.");
      alert("No fake notes found to delete.");
      return;
    }

    console.log(`Found ${fakeNotes.length} fake notes. Deleting in bulk...`);

    await bulkDeleteNotesAction(fakeNotes.map((n) => n.id));

    // Delete seed tags by matching names
    const allTags = (await getTagsAction()) as Tag[];
    const seedTagNames = new Set(SEED_TAGS.map((t) => t.name));
    const tagsToDelete = allTags.filter((t) => seedTagNames.has(t.name));
    for (const tag of tagsToDelete) {
      await deleteTagAction(tag.id);
    }

    console.log(
      `Successfully deleted ${fakeNotes.length} fake notes and ${tagsToDelete.length} seed tags.`,
    );
    alert(
      `Deleted ${fakeNotes.length} notes and ${tagsToDelete.length} tags. Please refresh the app.`,
    );
  } catch (error) {
    console.error("Failed to delete fake notes:", error);
    alert("An error occurred while deleting fake notes.");
  }
}
