# Voice Integration Guide for CommandBrain

This guide outlines how to add voice command capabilities to CommandBrain using RunAnywhere's STT, TTS, and VAD features.

## Overview

Voice integration will enable:
- **Voice Input**: Speak commands naturally instead of typing
- **Voice Feedback**: Hear explanations and warnings spoken aloud
- **Hands-Free Operation**: Execute commands without touching keyboard

## Architecture

```
Voice Pipeline:
User Speech → VAD Detection → STT Transcription → CommandBrain → TTS Feedback → Audio Output
```

## Implementation Steps

### 1. Add Voice Models to Model Catalog

Update `src/runanywhere.ts`:

```typescript
const MODELS: CompactModelDef[] = [
  // ... existing models ...
  
  // STT (already present)
  {
    id: 'sherpa-onnx-whisper-tiny.en',
    name: 'Whisper Tiny English (ONNX)',
    url: 'https://huggingface.co/runanywhere/sherpa-onnx-whisper-tiny.en/resolve/main/sherpa-onnx-whisper-tiny.en.tar.gz',
    framework: LLMFramework.ONNX,
    modality: ModelCategory.SpeechRecognition,
    memoryRequirement: 105_000_000,
    artifactType: 'archive' as const,
  },
  
  // TTS (already present)
  {
    id: 'vits-piper-en_US-lessac-medium',
    name: 'Piper TTS US English (Lessac)',
    url: 'https://huggingface.co/runanywhere/vits-piper-en_US-lessac-medium/resolve/main/vits-piper-en_US-lessac-medium.tar.gz',
    framework: LLMFramework.ONNX,
    modality: ModelCategory.SpeechSynthesis,
    memoryRequirement: 65_000_000,
    artifactType: 'archive' as const,
  },
  
  // VAD (already present)
  {
    id: 'silero-vad-v5',
    name: 'Silero VAD v5',
    url: 'https://huggingface.co/runanywhere/silero-vad-v5/resolve/main/silero_vad.onnx',
    files: ['silero_vad.onnx'],
    framework: LLMFramework.ONNX,
    modality: ModelCategory.Audio,
    memoryRequirement: 5_000_000,
  },
];
```

### 2. Create Voice Command Handler

Create `src/commandbrain/voice/VoiceCommandHandler.ts`:

```typescript
import { ModelManager, ModelCategory } from '@runanywhere/web';
import { VAD, SpeechActivity, AudioCapture, AudioPlayback } from '@runanywhere/web-onnx';
import { CommandBrain } from '../CommandBrain';
import type { VoiceCommand, VoiceFeedback } from '../types';

export class VoiceCommandHandler {
  private audioCapture: AudioCapture | null = null;
  private audioPlayback: AudioPlayback | null = null;
  private isListening = false;
  
  private onTranscriptCallback?: (text: string) => void;
  private onCommandProcessedCallback?: (preview: any) => void;
  
  async init(): Promise<void> {
    // Ensure models are loaded
    await Promise.all([
      this.ensureModelLoaded('silero-vad-v5'),
      this.ensureModelLoaded('sherpa-onnx-whisper-tiny.en'),
      this.ensureModelLoaded('vits-piper-en_US-lessac-medium'),
    ]);
    
    // Initialize audio components
    this.audioCapture = new AudioCapture({ sampleRate: 16000 });
    this.audioPlayback = new AudioPlayback();
  }
  
  private async ensureModelLoaded(modelId: string): Promise<void> {
    if (!ModelManager.getModelsByCategory(ModelCategory.Audio).find(m => m.id === modelId)) {
      await ModelManager.downloadModel(modelId);
    }
    await ModelManager.loadModel(modelId, { coexist: true });
  }
  
  async startListening(): Promise<void> {
    if (this.isListening || !this.audioCapture) return;
    
    this.isListening = true;
    VAD.reset();
    
    // Set up VAD event handling
    const vadUnsubscribe = VAD.onSpeechActivity(async (activity) => {
      if (activity === SpeechActivity.Ended) {
        const segment = VAD.popSpeechSegment();
        if (segment && segment.samples.length > 1600) {
          await this.handleSpeechSegment(segment.samples);
        }
      }
    });
    
    // Start audio capture
    await this.audioCapture.start(
      (chunk) => {
        VAD.processSamples(chunk);
      },
      (level) => {
        // Audio level for visualization
      }
    );
  }
  
  stopListening(): void {
    if (!this.isListening) return;
    
    this.audioCapture?.stop();
    VAD.reset();
    this.isListening = false;
  }
  
  private async handleSpeechSegment(audioSamples: Float32Array): Promise<void> {
    try {
      // Transcribe using STT
      const { STT } = await import('@runanywhere/web-onnx');
      const transcription = await STT.transcribe(audioSamples);
      
      const voiceCommand: VoiceCommand = {
        text: transcription.text,
        confidence: transcription.confidence,
        timestamp: Date.now(),
      };
      
      // Notify transcript
      this.onTranscriptCallback?.(transcription.text);
      
      // Process command with CommandBrain
      const preview = await CommandBrain.processCommand(transcription.text);
      this.onCommandProcessedCallback?.(preview);
      
      // Speak the explanation
      await this.speak(preview.command.explanation);
      
      // Speak warnings if any
      if (preview.warnings.length > 0) {
        await this.speak(`Warning: ${preview.warnings[0]}`);
      }
      
    } catch (error) {
      console.error('Failed to handle speech segment:', error);
      await this.speak('Sorry, I could not understand that command.');
    }
  }
  
  async speak(text: string): Promise<void> {
    if (!this.audioPlayback) return;
    
    try {
      const { TTS } = await import('@runanywhere/web-onnx');
      const synthesis = await TTS.synthesize(text, { speed: 1.0 });
      await this.audioPlayback.play(synthesis.audioData, synthesis.sampleRate);
    } catch (error) {
      console.error('Failed to speak:', error);
    }
  }
  
  onTranscript(callback: (text: string) => void): void {
    this.onTranscriptCallback = callback;
  }
  
  onCommandProcessed(callback: (preview: any) => void): void {
    this.onCommandProcessedCallback = callback;
  }
  
  cleanup(): void {
    this.stopListening();
    this.audioCapture = null;
    this.audioPlayback = null;
  }
}
```

### 3. Add Voice UI Component

Update `CommandBrainTab.tsx` to include voice mode:

```typescript
// Add at the top
import { VoiceCommandHandler } from '../commandbrain/voice/VoiceCommandHandler';

// Add state
const [voiceMode, setVoiceMode] = useState(false);
const [isListening, setIsListening] = useState(false);
const [transcript, setTranscript] = useState('');
const voiceHandlerRef = useRef<VoiceCommandHandler | null>(null);

// Initialize voice handler
useEffect(() => {
  const handler = new VoiceCommandHandler();
  voiceHandlerRef.current = handler;
  
  handler.onTranscript((text) => {
    setTranscript(text);
    setInput(text);
  });
  
  handler.onCommandProcessed((preview) => {
    setPreview(preview);
  });
  
  return () => {
    handler.cleanup();
  };
}, []);

// Toggle voice listening
const toggleVoiceListening = async () => {
  const handler = voiceHandlerRef.current;
  if (!handler) return;
  
  if (!isListening) {
    await handler.init();
    await handler.startListening();
    setIsListening(true);
  } else {
    handler.stopListening();
    setIsListening(false);
  }
};

// Add voice button to UI
<div className="commandbrain-voice-toggle">
  <button
    className={`btn ${isListening ? 'btn-danger' : 'btn-primary'}`}
    onClick={toggleVoiceListening}
  >
    {isListening ? '🎙️ Listening...' : '🎤 Voice Mode'}
  </button>
  {isListening && transcript && (
    <p className="transcript-preview">{transcript}</p>
  )}
</div>
```

### 4. Voice-Specific CSS

Add to `src/styles/index.css`:

```css
.commandbrain-voice-toggle {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 16px;
  padding: 16px;
  background: var(--bg-card);
  border-radius: var(--radius);
}

.commandbrain-voice-toggle .btn {
  width: 100%;
}

.transcript-preview {
  padding: 8px;
  background: var(--bg-input);
  border-radius: var(--radius-sm);
  font-size: 14px;
  color: var(--text-muted);
  font-style: italic;
}

.btn-danger {
  background: var(--red);
  border-color: var(--red);
  color: white;
}

.btn-danger:hover {
  background: #dc2626;
  border-color: #dc2626;
}
```

## Voice Command Flow

1. **User Speaks**: "Clear my cache"
2. **VAD Detects**: Speech activity detected
3. **STT Transcribes**: Converts audio to text
4. **CommandBrain Processes**: Interprets command
5. **Safety Check**: Analyzes command safety
6. **TTS Speaks**: "This will remove cache files from your system. The command requires confirmation."
7. **User Confirms**: Clicks execute button
8. **TTS Feedback**: "Command executed successfully"

## Voice Command Best Practices

### For Users
- Speak clearly and at normal pace
- Use complete sentences: "Clear my browser cache" instead of "cache clear"
- Wait for audio feedback before issuing next command
- Voice mode works best in quiet environments

### For Developers
- Always provide audio feedback for user actions
- Speak warnings with TTS for dangerous commands
- Add visual indicators when system is listening
- Implement voice command confirmation for caution/dangerous commands
- Handle STT transcription errors gracefully

## Advanced Features

### Custom Wake Word (Future)
```typescript
// Implement wake word detection
const WAKE_WORD = "hey commandbrain";

function checkForWakeWord(transcript: string): boolean {
  return transcript.toLowerCase().includes(WAKE_WORD);
}
```

### Voice-Only Mode
```typescript
// Completely hands-free operation
async function voiceOnlyMode() {
  // 1. Wait for wake word
  // 2. Listen for command
  // 3. Execute if safe
  // 4. Speak results
  // 5. Return to wake word detection
}
```

### Multi-Language Support
```typescript
// Add language detection and switching
await STT.loadModel({
  modelId: 'whisper-multilingual',
  type: STTModelType.Whisper,
  language: 'auto', // Auto-detect
  // ...
});
```

## Testing Voice Commands

### Example Test Phrases

Safe commands:
- "Show disk usage"
- "List files in current directory"
- "Check running processes"

Caution commands:
- "Clear my cache"
- "Kill port 3000"
- "Delete old log files"

Should be blocked:
- "Delete everything in root"
- "Format my hard drive"

## Troubleshooting

### No Audio Input
- Check browser permissions for microphone
- Ensure HTTPS or localhost (required for getUserMedia)
- Verify model loading completed

### Poor Transcription Quality
- Check background noise levels
- Adjust VAD sensitivity
- Use better quality microphone
- Switch to larger Whisper model

### TTS Not Working
- Verify TTS model is loaded
- Check audio output device
- Test with simple text first

## Performance Optimization

- Load models in background during init
- Use model coexistence for multi-modal operation
- Cache frequently used audio samples
- Implement audio processing queue

## Security Considerations

- Voice commands follow same safety rules as text
- All processing happens locally (privacy-first)
- No audio is sent to cloud
- Voice data not permanently stored

---

## Next Steps

1. Implement VoiceCommandHandler
2. Add voice UI to CommandBrainTab
3. Test with various commands
4. Add voice-specific error handling
5. Optimize for mobile devices
6. Add voice command history
7. Implement custom voice shortcuts
