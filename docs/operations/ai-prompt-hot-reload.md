# AI Prompt — Hot Reload via mtime Cache

**Status:** editorial pattern — the Claude Vision prompt for shoe image analysis reloads from disk whenever the markdown file changes, without restarting the API.

## What it is

The shoe image analysis prompt lives at [`apps/api/src/services/prompts/shoe-image-analysis.md`](../../apps/api/src/services/prompts/shoe-image-analysis.md) and is loaded by [`apps/api/src/services/imageAnalysisService.ts`](../../apps/api/src/services/imageAnalysisService.ts) before every call to Anthropic's vision API.

The loader caches the prompt keyed on the file's modification time (`stat.mtimeMs`). Every call does a `fs.statSync` round-trip; if mtime matches the cached value, the cached string is returned. If it's newer, the file is re-read and the cache is refreshed. Saving the `.md` file therefore takes effect on the very next `POST /api/v1/skus/analyze-image` call — no API restart required.

## Why it matters

Prompt engineering is an iterative loop: tweak, test, read the AI response, tweak again. If the only way to see the effect of a prompt edit is to `Ctrl-C` the API and wait for the ~8 s warmup to run again, the edit-test cycle blows out to 30–60 seconds per iteration and the operator stops iterating.

With hot-reload, the cycle is:

1. Edit `shoe-image-analysis.md`, save.
2. Click "Analizar imagen" on the Create SKU page.
3. See the new AI response.

Sub-second round trip (excluding the Claude API call itself).

## Where it lives in code

| File | What it does |
|---|---|
| [`apps/api/src/services/imageAnalysisService.ts`](../../apps/api/src/services/imageAnalysisService.ts) — `loadPrompt()` | The mtime-keyed cache + reload helper. Called by `analyzeShoeImage()` before every Anthropic API request. |
| [`apps/api/src/services/prompts/shoe-image-analysis.md`](../../apps/api/src/services/prompts/shoe-image-analysis.md) | The prompt itself — editable during a running session. |
| [`apps/api/src/services/imageAnalysisService.ts`](../../apps/api/src/services/imageAnalysisService.ts) — `clearPromptCache()` | Test-only export to force a reload on the next call (used to isolate tests from each other's cache state). |

## How it works — the pattern

```ts
let cached: { prompt: string; mtimeMs: number } | null = null;

function loadPrompt(): string {
  const stat = fs.statSync(PROMPT_PATH);              // ~microseconds
  if (cached && cached.mtimeMs === stat.mtimeMs) return cached.prompt;
  const prompt = fs.readFileSync(PROMPT_PATH, 'utf-8');
  cached = { prompt, mtimeMs: stat.mtimeMs };
  return prompt;
}
```

**Cost:** one `statSync` per request (tens of microseconds on a local SSD). When unchanged, no file read happens at all. The pattern is safe to use for any small-to-medium configuration file the operator should be able to edit while the server is running.

## Where this pattern should (and shouldn't) be reused

Good fits — files that an operator edits during normal authoring work and expects to see live:

- Future per-family prompt files (e.g. `clothing-image-analysis.md`, `bag-image-analysis.md`).
- Editable AI-fill configuration at [`apps/api/data/ai-fill-config.json`](../../apps/api/data/ai-fill-config.json) — currently boot-cached in [`aiFieldMappingService.ts`](../../apps/api/src/services/aiFieldMappingService.ts) via `getAiFillConfig()`. Swap for the mtime pattern when the config becomes operator-editable (it isn't yet).
- Any other runtime-editable prompt, config, or template file where restart-to-apply is friction.

Don't use this pattern for:

- Secrets (`.env`, API keys). Those should reload via the process manager, not the application, so an operator's clipboard typo can't be silently picked up mid-request.
- Files that are part of the build artifact (`.ts`, compiled JS). Those already reload via the dev server watcher.
- High-QPS production paths. Switch to `fs.promises.stat` if request volume ever makes synchronous file I/O a bottleneck; for our current load (one analyze-image per SKU creation) it is a non-issue.

## How to verify it works

With the API running:

1. `curl -s -m 30 http://localhost:4000/api/v1/skus/analyze-image -F image=@path/to/shoe.jpg | jq '.raw'` — note the response.
2. Edit `shoe-image-analysis.md`: for example, prepend "DEBUG: " to the `description` field guidance.
3. Save.
4. Repeat step 1. The new response should show the edit took effect (e.g. a description starting with "DEBUG:").

If step 4 shows the old behavior, the loader regressed to a permanent cache — check `loadPrompt()` still uses `fs.statSync` before deciding whether to return the cached value.

## Things that will break this

- Replacing `fs.statSync + fs.readFileSync` with a single `fs.readFileSync` behind a boolean `loaded` flag. That was the original implementation; it means any edit requires an API restart. The whole point of this doc is to prevent that regression.
- `fs.watch`-based invalidation. Don't switch unless there's evidence the stat round-trip is a bottleneck — file watchers have platform quirks (Windows is especially flaky under Docker / WSL paths) that cost more to debug than they save.
- Pointing `PROMPT_PATH` to a bundled / compiled location instead of the source tree. If the prompt file ever gets copied into `dist/` at build time, edits to the source won't reach the loaded file. Keep `PROMPT_PATH` resolved relative to `__dirname` in source, not dist.
