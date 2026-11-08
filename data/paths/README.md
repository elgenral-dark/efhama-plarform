# Programming path content

## Source of truth

`<slug>.json` is the authoritative course outline. Keep only card-level metadata in `../programming-paths.json`; unit and lesson names, ordering, and counts come from the course file.

Each course has a stable `slug` and an ordered `levels` array. Each unit should have a unique `id`, `name`, `description`, and an ordered `lessons` array. Unit order is its array position.

Every lesson needs a unique, stable `id`, `title`, `summary`, and `duration`. The renderer derives the lesson and course order, estimated minutes, inherited difficulty, and previous/next lesson IDs. Add `learningObjectives` as an array when the objectives need to be more specific than the summary. Add `difficulty`, `estimatedMinutes`, and `prerequisites` only when they differ from the course defaults or the lesson has real prerequisites. Prerequisites refer to lesson IDs in the same path.

## Lesson content

Keep ordered teaching material in `content`. Existing block types include headings, paragraphs, lists, steps, code, diagrams, visuals, and interactive examples. Optional arrays can hold reusable structured material:

- `visuals` and `infographics`: visual blocks with `image`, `title`, `description`, and `alt`.
- `examples`: objects with `title`, `description`, and optionally `code`.
- `applications`, `exercises`, `challenges`, and `projects`: objects with a title and optional description, `steps`/`requirements`, code, expected output, or hint.
- `quiz`: the existing interactive quiz format.

Do not add placeholder explanations. Summary-only courses display an explicit notice until substantive lesson material is authored. The renderer infers previous/next links from the ordered units; do not maintain those links manually.

## Detailed lesson files

For a lesson whose full content is stored separately, add its existing lesson ID to the path's `lessonDetailFiles` array and create `public/data/paths/<lesson-id>.json`. The detail file enriches the outline entry; it does not replace its ID or its place in the course. The Logic path is the current example.

## Adding a unit or lesson

1. Edit the appropriate `public/data/paths/<slug>.json`.
2. Add a unit with a new stable ID and a short description, or append the lesson to its unit's `lessons` array.
3. Give each lesson a new ID, summary, duration, and real objectives or prerequisites when applicable.
4. Add authored content using the block/array shapes above. For a separate detailed file, also register the ID in `lessonDetailFiles`.
5. Keep the existing IDs unchanged. Array order controls navigation; counts and progress totals are computed from the data.

The path catalog, global search, lesson navigation, and progress tracking read these course files. Progress is keyed by lesson ID in the existing browser storage.
