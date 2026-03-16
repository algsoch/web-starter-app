import { useState, useCallback, useRef } from 'react';
import { ModelManager, ModelCategory, EventBus } from '@runanywhere/web';

export type LoaderState = 'idle' | 'downloading' | 'loading' | 'ready' | 'error';

interface ModelLoaderResult {
  state: LoaderState;
  progress: number;
  error: string | null;
  cachedModelName: string | null;
  lastLoadedAt: number | null;
  ensure: () => Promise<boolean>;
}

interface ModelLoadCacheInfo {
  modelId: string;
  modelName: string;
  loadedAt: number;
}

function getCacheKey(category: ModelCategory): string {
  return `runanywhere_model_cache_${category}`;
}

function readCacheInfo(category: ModelCategory): ModelLoadCacheInfo | null {
  if (typeof window === 'undefined') return null;

  try {
    const raw = localStorage.getItem(getCacheKey(category));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ModelLoadCacheInfo;
    if (!parsed.modelId || !parsed.modelName || !parsed.loadedAt) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeCacheInfo(category: ModelCategory, info: ModelLoadCacheInfo): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(getCacheKey(category), JSON.stringify(info));
}

export function getModelCacheInfo(category: ModelCategory): ModelLoadCacheInfo | null {
  return readCacheInfo(category);
}

export function clearModelCacheInfo(category: ModelCategory): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(getCacheKey(category));
}

/**
 * Hook to download + load models for a given category.
 * Tracks download progress and loading state.
 *
 * @param category - Which model category to ensure is loaded.
 * @param coexist  - If true, only unload same-category models (allows STT+LLM+TTS to coexist).
 */
export function useModelLoader(category: ModelCategory, coexist = false): ModelLoaderResult {
  const cached = readCacheInfo(category);
  const [state, setState] = useState<LoaderState>(() =>
    ModelManager.getLoadedModel(category) ? 'ready' : 'idle',
  );
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [cachedModelName, setCachedModelName] = useState<string | null>(cached?.modelName ?? null);
  const [lastLoadedAt, setLastLoadedAt] = useState<number | null>(cached?.loadedAt ?? null);
  const loadingRef = useRef(false);

  const ensure = useCallback(async (): Promise<boolean> => {
    // Already loaded
    if (ModelManager.getLoadedModel(category)) {
      setState('ready');
      return true;
    }

    if (loadingRef.current) return false;
    loadingRef.current = true;

    try {
      // Find a model for this category
      const models = ModelManager.getModels().filter((m) => m.modality === category);
      if (models.length === 0) {
        setError(`No ${category} model registered`);
        setState('error');
        return false;
      }

      const model = models[0];

      // Download if needed
      if (model.status !== 'downloaded' && model.status !== 'loaded') {
        setState('downloading');
        setProgress(0);

        const unsub = EventBus.shared.on('model.downloadProgress', (evt) => {
          if (evt.modelId === model.id) {
            setProgress(evt.progress ?? 0);
          }
        });

        await ModelManager.downloadModel(model.id);
        unsub();
        setProgress(1);
      }

      // Load
      setState('loading');
      const ok = await ModelManager.loadModel(model.id, { coexist });
      if (ok) {
        const cacheInfo: ModelLoadCacheInfo = {
          modelId: model.id,
          modelName: model.name,
          loadedAt: Date.now(),
        };
        writeCacheInfo(category, cacheInfo);
        setCachedModelName(cacheInfo.modelName);
        setLastLoadedAt(cacheInfo.loadedAt);
        setState('ready');
        return true;
      } else {
        setError('Failed to load model');
        setState('error');
        return false;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setState('error');
      return false;
    } finally {
      loadingRef.current = false;
    }
  }, [category, coexist]);

  return { state, progress, error, cachedModelName, lastLoadedAt, ensure };
}
