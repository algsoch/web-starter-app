import { useState, useEffect } from 'react';
import { initSDK, getAccelerationMode } from './runanywhere';
import { ChatTab } from './components/ChatTab';
import { VisionTab } from './components/VisionTab';
import { VoiceTab } from './components/VoiceTab';
import { CommandBrainTab } from './components/CommandBrainTab';

type Tab = 'commandbrain' | 'chat' | 'vision' | 'voice';
const SHOW_EXTRA_TABS = false;

export function App() {
  const [sdkReady, setSdkReady] = useState(false);
  const [sdkError, setSdkError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>('commandbrain');
  const [uiZoom, setUiZoom] = useState<number>(() => {
    const raw = localStorage.getItem('runanywhere_ui_zoom');
    const parsed = raw ? Number(raw) : 1;
    if (!Number.isFinite(parsed)) return 1;
    return Math.min(1.6, Math.max(0.8, parsed));
  });

  const adjustZoom = (delta: number) => {
    setUiZoom((prev) => Math.min(1.6, Math.max(0.8, Number((prev + delta).toFixed(2)))));
  };

  const resetZoom = () => setUiZoom(1);

  useEffect(() => {
    initSDK()
      .then(() => setSdkReady(true))
      .catch((err) => setSdkError(err instanceof Error ? err.message : String(err)));
  }, []);

  useEffect(() => {
    localStorage.setItem('runanywhere_ui_zoom', String(uiZoom));
  }, [uiZoom]);

  if (sdkError) {
    return (
      <div className="app-loading">
        <h2>SDK Error</h2>
        <p className="error-text">{sdkError}</p>
      </div>
    );
  }

  if (!sdkReady) {
    return (
      <div className="app-loading">
        <div className="spinner" />
        <h2>Loading RunAnywhere SDK...</h2>
        <p>Initializing on-device AI engine</p>
      </div>
    );
  }

  const accel = getAccelerationMode();

  return (
    <div className="app" style={{ zoom: uiZoom }}>
      <header className="app-header">
        <h1>RunAnywhere CommandBrain</h1>
        {accel && <span className="badge">{accel === 'webgpu' ? 'WebGPU' : 'CPU'}</span>}
        <div className="zoom-controls" role="group" aria-label="Zoom controls">
          <button className="zoom-btn" type="button" onClick={() => adjustZoom(-0.1)} aria-label="Zoom out">A-</button>
          <button className="zoom-btn zoom-reset" type="button" onClick={resetZoom} aria-label="Reset zoom">
            {Math.round(uiZoom * 100)}%
          </button>
          <button className="zoom-btn" type="button" onClick={() => adjustZoom(0.1)} aria-label="Zoom in">A+</button>
        </div>
      </header>

      <nav className="tab-bar">
        <button className={activeTab === 'commandbrain' ? 'active' : ''} onClick={() => setActiveTab('commandbrain')}>
          CommandBrain
        </button>
        {SHOW_EXTRA_TABS && (
          <>
            <button className={activeTab === 'chat' ? 'active' : ''} onClick={() => setActiveTab('chat')}>
              Chat
            </button>
            <button className={activeTab === 'vision' ? 'active' : ''} onClick={() => setActiveTab('vision')}>
              Vision
            </button>
            <button className={activeTab === 'voice' ? 'active' : ''} onClick={() => setActiveTab('voice')}>
              Voice
            </button>
          </>
        )}
      </nav>

      <main className="tab-content">
        {activeTab === 'commandbrain' && <CommandBrainTab />}
        {SHOW_EXTRA_TABS && activeTab === 'chat' && <ChatTab />}
        {SHOW_EXTRA_TABS && activeTab === 'vision' && <VisionTab />}
        {SHOW_EXTRA_TABS && activeTab === 'voice' && <VoiceTab />}
      </main>
    </div>
  );
}
