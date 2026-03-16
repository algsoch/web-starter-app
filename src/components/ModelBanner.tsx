import type { LoaderState } from '../hooks/useModelLoader';

interface Props {
  state: LoaderState;
  progress: number;
  error: string | null;
  cachedModelName?: string | null;
  lastLoadedAt?: number | null;
  onLoad: () => void;
  label: string;
}

export function ModelBanner({
  state,
  progress,
  error,
  cachedModelName,
  lastLoadedAt,
  onLoad,
  label,
}: Props) {
  if (state === 'ready') return null;

  return (
    <div className="model-banner">
      {state === 'idle' && (
        <>
          <span>
            No {label} model loaded in memory yet.
            {cachedModelName ? ` Cached locally: ${cachedModelName}.` : ''}
            {lastLoadedAt ? ` Last loaded: ${new Date(lastLoadedAt).toLocaleString()}.` : ''}
          </span>
          <button className="btn btn-sm" onClick={onLoad}>Load Model</button>
        </>
      )}
      {state === 'downloading' && (
        <>
          <span>Downloading {label} model... {(progress * 100).toFixed(0)}%</span>
          <progress className="progress-native" value={Math.round(progress * 100)} max={100} />
        </>
      )}
      {state === 'loading' && <span>Loading {label} model into engine...</span>}
      {state === 'error' && (
        <>
          <span className="error-text">Error: {error}</span>
          <button className="btn btn-sm" onClick={onLoad}>Retry</button>
        </>
      )}
    </div>
  );
}
