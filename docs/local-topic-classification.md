# Local topic classification

groupwork owns the topic catalog, classification records, trust events, and
Judgment decisions. Connector 0.6.0 only supplies local embedding compute.

## Runtime behavior

- Model: pinned quantized `Xenova/all-MiniLM-L6-v2`.
- Install footprint: a clean Linux npm-prefix measurement was approximately
  407 MB because Transformers.js installs Node, web, and cross-platform native
  runtimes. This may vary by npm and operating system.
- Cache: `~/.groupwork/models` (about 23 MB for model and tokenizer), bringing
  the measured total disk requirement to roughly 430 MB.
- Warm-up: begins in the background after connector authentication.
- Concurrency: one shared model loader and one process-wide inference queue.
- Failure behavior: keyword fallback is immediate during download, load,
  catalog refresh, retry backoff, offline operation, or inference failure.
- Retry: model-load failures back off from 30 seconds to a maximum of 30
  minutes. Agent work never waits for a retry.

The connector checks `topic_catalog_state.version`, refreshes definitions when
it changes, and will not use vectors built from an older version. While new
vectors are being prepared, it records the fallback result instead.

## Classification evidence

`message_topic_classification` is immutable for each `(message_id,
agent_binding_id)`. It records the selected topic, confidence, source, pinned
model version, and topic-catalog version. This preserves the exact evidence
used for the historical Judgment decision even after labels or models change.

Apply `docs/sql/topic-classification.sql` before installing connector 0.6.0.

## Dependency note

Transformers.js 4.2.0 declares vulnerable older ranges for `adm-zip` and
`sharp`. The connector pins npm overrides to patched `adm-zip` 0.6.0 and
`sharp` 0.35.3. A clean install, real MiniLM inference, connector regression
suite, and live `npm audit --omit=dev` all pass with these versions. Re-run all
four checks whenever Transformers.js or either override changes; remove the
overrides once upstream adopts compatible patched versions.
