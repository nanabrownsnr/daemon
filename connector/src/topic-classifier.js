import { mkdirSync } from "fs";
import { join } from "path";
import { CONFIG_DIR } from "./paths.js";

export const TOPIC_MODEL_ID = "Xenova/all-MiniLM-L6-v2";
export const TOPIC_MODEL_REVISION = "751bff37182d3f1213fa05d7196b954e230abad9";
export const TOPIC_MODEL_VERSION = `local-minilm-v1@${TOPIC_MODEL_REVISION.slice(0, 12)}`;
const TOPIC_MODEL_DTYPE = "q8";

function cosineSimilarity(left, right) {
  let dot = 0;
  let leftMagnitude = 0;
  let rightMagnitude = 0;
  for (let index = 0; index < left.length; index += 1) {
    dot += left[index] * right[index];
    leftMagnitude += left[index] ** 2;
    rightMagnitude += right[index] ** 2;
  }
  if (!leftMagnitude || !rightMagnitude) return 0;
  return dot / (Math.sqrt(leftMagnitude) * Math.sqrt(rightMagnitude));
}

function definitionText(definition) {
  const examples = Array.isArray(definition.examples) ? definition.examples.join("; ") : "";
  return [definition.name, definition.description, examples].filter(Boolean).join(". ");
}

export class LocalTopicClassifier {
  constructor({ loadPipeline } = {}) {
    this.loadPipeline = loadPipeline;
    this.status = "not_started";
    this.pipeline = null;
    this.modelPromise = null;
    this.catalogPromise = null;
    this.catalogVersion = null;
    this.topicVectors = [];
    this.queue = Promise.resolve();
    this.pendingClassifications = 0;
    this.maxPendingClassifications = 8;
    this.lastError = null;
    this.retryDelayMs = 30_000;
    this.nextRetryAt = 0;
  }

  warmup() {
    if (this.modelPromise) return this.modelPromise;
    if (Date.now() < this.nextRetryAt) return Promise.resolve(null);
    this.status = "downloading";
    this.modelPromise = (async () => {
      try {
        mkdirSync(join(CONFIG_DIR, "models"), { recursive: true });
        let loadPipeline = this.loadPipeline;
        if (!loadPipeline) {
          const transformers = await import("@huggingface/transformers");
          transformers.env.cacheDir = join(CONFIG_DIR, "models");
          loadPipeline = (task, model, options) => transformers.pipeline(task, model, options);
        }
        this.status = "loading";
        this.pipeline = await loadPipeline("feature-extraction", TOPIC_MODEL_ID, {
          dtype: TOPIC_MODEL_DTYPE,
          revision: TOPIC_MODEL_REVISION,
        });
        this.status = "ready";
        this.lastError = null;
        this.retryDelayMs = 30_000;
        this.nextRetryAt = 0;
        console.log(`[groupwork] Local topic model ready (${TOPIC_MODEL_VERSION}).`);
        return this.pipeline;
      } catch (error) {
        this.status = "failed";
        this.lastError = error;
        this.modelPromise = null;
        this.nextRetryAt = Date.now() + this.retryDelayMs;
        this.retryDelayMs = Math.min(this.retryDelayMs * 4, 30 * 60_000);
        console.error(`[groupwork] Local topic model unavailable; keyword fallback remains active: ${error.message}`);
        return null;
      }
    })();
    return this.modelPromise;
  }

  prepareCatalog(definitions, version) {
    if (this.catalogVersion === version && this.topicVectors.length) return Promise.resolve(true);
    if (this.catalogPromise?.version === version) return this.catalogPromise.promise;

    const promise = (async () => {
      const pipeline = await this.warmup();
      if (!pipeline) return false;
      try {
        const usableDefinitions = definitions.filter((definition) => definition.active !== false);
        if (!usableDefinitions.length) return false;
        const output = await pipeline(usableDefinitions.map(definitionText), {
          pooling: "mean",
          normalize: true,
        });
        const vectors = output.tolist();
        this.topicVectors = usableDefinitions.map((definition, index) => ({
          definition,
          vector: vectors[index],
        }));
        this.catalogVersion = version;
        console.log(`[groupwork] Topic catalog v${version} ready (${this.topicVectors.length} topics).`);
        return true;
      } catch (error) {
        this.lastError = error;
        console.error(`[groupwork] Topic catalog preparation failed; keyword fallback remains active: ${error.message}`);
        return false;
      } finally {
        if (this.catalogPromise?.promise === promise) this.catalogPromise = null;
      }
    })();
    this.catalogPromise = { version, promise };
    return promise;
  }

  classifyNow(text, fallback, expectedCatalogVersion) {
    if (this.status !== "ready"
        || !this.topicVectors.length
        || this.catalogVersion !== expectedCatalogVersion) {
      void this.warmup();
      return Promise.resolve({ ...fallback, source: "keyword_fallback", confidence: null });
    }
    if (this.pendingClassifications >= this.maxPendingClassifications) {
      return Promise.resolve({ ...fallback, source: "keyword_fallback", confidence: null });
    }

    this.pendingClassifications += 1;
    const task = this.queue.catch(() => {}).then(async () => {
      const output = await this.pipeline(text, { pooling: "mean", normalize: true });
      const [messageVector] = output.tolist();
      let best = null;
      for (const candidate of this.topicVectors) {
        const score = cosineSimilarity(messageVector, candidate.vector);
        if (!best || score > best.score) best = { ...candidate, score };
      }
      if (!best || best.score < 0.34) {
        return { ...fallback, topicTag: "general", source: "local_embedding", confidence: best?.score ?? 0 };
      }
      return {
        ...fallback,
        topicTag: best.definition.slug,
        source: "local_embedding",
        confidence: best.score,
      };
    }).catch((error) => {
      this.lastError = error;
      console.error(`[groupwork] Local topic classification failed; using keyword fallback: ${error.message}`);
      return { ...fallback, source: "keyword_fallback", confidence: null };
    }).finally(() => {
      this.pendingClassifications = Math.max(0, this.pendingClassifications - 1);
    });
    this.queue = task.then(() => undefined);
    return task;
  }

  getStatus() {
    return {
      status: this.status,
      modelId: TOPIC_MODEL_ID,
      modelVersion: TOPIC_MODEL_VERSION,
      catalogVersion: this.catalogVersion,
      error: this.lastError?.message ?? null,
    };
  }
}

export const topicClassifier = new LocalTopicClassifier();
