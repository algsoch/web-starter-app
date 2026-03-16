# RunAnywhere CommandBrain

**Offline Natural Language Command Executor with AI-Powered Safety**

CommandBrain is a privacy-first, fully offline intelligent command system that converts natural language into safe system commands, learns user behavior, automates repetitive workflows, and can be used both in a web interface and directly in the terminal (CLI mode).

This is not a chatbot. It is a **local AI command and automation brain**.

---

## Features

### Core Capabilities

- **Natural Language → System Commands**: Uses on-device LLM (Liquid AI LFM2) with Tool Calling to interpret user intent and generate precise system commands
- **Safety Engine**: Multi-layer safety analysis with three safety levels (Safe, Caution, Dangerous)
- **Command Preview**: Shows what will happen before execution with detailed explanations
- **Adaptive Learning**: Automatically learns from command usage patterns and frequency
- **Smart Suggestions**: Context-aware command suggestions based on history and time patterns
- **Macro System**: Chain multiple commands into reusable automation workflows
- **Command History**: Persistent storage with search and quick re-run capabilities
- **Fully Offline**: All AI runs locally using RunAnywhere Web SDK - no cloud, no API keys

### Safety Features

The safety engine includes:

- **Pattern Matching**: Detects dangerous command patterns (e.g., `rm -rf /`, fork bombs)
- **Keyword Detection**: Flags commands affecting system directories or critical files
- **Safety Levels**:
  - ✅ **Safe**: Can execute without confirmation
  - ⚠️ **Caution**: Requires user confirmation
  - 🛑 **Dangerous**: Blocked for safety
- **Affected Resources**: Shows which files, directories, and processes will be affected
- **Safety Tips**: Provides safer alternatives and best practices

### Learning System

CommandBrain learns from your usage:

- **Pattern Extraction**: Abstracts commands into reusable patterns
- **Frequency Analysis**: Tracks most-used commands
- **Time-Based Learning**: Learns typical execution times and days
- **Context Awareness**: Suggests related commands based on recent activity
- **Pattern Efficiency**: Optimizes storage by identifying similar command patterns

---

## Architecture

### Component Overview

```
CommandBrain
├── CommandInterpreter (LLM + Tool Calling)
│   └── Natural language → System command conversion
├── SafetyAnalyzer
│   └── Multi-layer safety checking
├── LearningEngine
│   └── Pattern extraction and suggestions
├── CommandStore (IndexedDB)
│   ├── Command history
│   ├── Macros
│   ├── Patterns
│   └── Configuration
└── UI Components
    ├── Command input & preview
    ├── History viewer
    ├── Macro manager
    └── Settings & statistics
```

### Core Modules

#### 1. **CommandBrain** (`src/commandbrain/CommandBrain.ts`)
Main orchestrator that coordinates all components.

**Key Methods:**
- `processCommand(naturalLanguage)` - Interpret and create command preview
- `executeCommand(commandId)` - Execute a previewed command (browser simulation)
- `getSuggestions()` - Get AI-powered command suggestions
- `createMacro()` / `executeMacro()` - Macro management
- `getHistory()` / `searchCommands()` - History access

#### 2. **CommandInterpreter** (`src/commandbrain/interpreter/CommandInterpreter.ts`)
Converts natural language to system commands using LLM with Tool Calling.

**Features:**
- Uses RunAnywhere LFM2 model for interpretation
- Registers command generation tools
- Platform-aware command generation
- Confidence scoring
- Fallback interpretation for edge cases

#### 3. **SafetyAnalyzer** (`src/commandbrain/safety/SafetyAnalyzer.ts`)
Analyzes commands for safety risks.

**Analysis Includes:**
- Dangerous pattern detection
- System directory protection
- File path extraction
- Process identification
- Disk space impact estimation
- Safety tips generation

#### 4. **LearningEngine** (`src/commandbrain/learning/LearningEngine.ts`)
Learns from command execution patterns.

**Capabilities:**
- Pattern extraction from commands
- Frequency tracking
- Time-based pattern learning
- Context-aware suggestions
- Pattern similarity detection (Levenshtein distance)
- Automatic pattern pruning

#### 5. **CommandStore** (`src/commandbrain/storage/CommandStore.ts`)
IndexedDB-based persistent storage.

**Stores:**
- Commands with execution history
- Macros with command sequences
- Learned patterns
- User configuration

**Indexes:**
- Commands: by category, date, execution count
- Macros: by name, trigger, execution count
- Patterns: by frequency, last used

---

## Data Model

### Command
```typescript
{
  id: string;
  naturalLanguage: string;        // "clean my cache"
  systemCommand: string;           // "rm -rf ~/.cache/*"
  category: CommandCategory;       // "cleanup"
  safetyLevel: SafetyLevel;        // "caution"
  explanation: string;             // Human-readable explanation
  createdAt: number;
  executedAt?: number;
  executionCount: number;
  success?: boolean;
  result?: string;
}
```

### Macro
```typescript
{
  id: string;
  name: string;                    // "System Optimization"
  description: string;
  trigger: string;                 // "optimize system"
  commands: string[];              // Array of natural language commands
  executionCount: number;
  requiresConfirmation: boolean;
}
```

### CommandPattern
```typescript
{
  id: string;
  pattern: string;                 // "clear {path} cache"
  commandPattern: string;          // "rm -rf {path}/*"
  frequency: number;
  lastUsed: number;
  typicalHour?: number;            // Time-based learning
  typicalDayOfWeek?: number;
}
```

---

## Usage Examples

### Basic Command Execution

```typescript
import { CommandBrain } from './commandbrain';

// Initialize
await CommandBrain.init();

// Process natural language command
const preview = await CommandBrain.processCommand('clear my browser cache');

// Preview contains:
// - systemCommand: "rm -rf ~/.cache/mozilla/ ~/.cache/google-chrome/"
// - explanation: "Removes Firefox and Chrome cache directories"
// - safetyLevel: "caution"
// - warnings: ["This command requires confirmation before execution"]

// Execute after review
if (preview.command.safetyLevel !== 'dangerous') {
  const result = await CommandBrain.executeCommand(preview.command.id);
  console.log(result.stdout);
}
```

### Getting Suggestions

```typescript
const suggestions = await CommandBrain.getSuggestions();

suggestions.forEach(sug => {
  console.log(sug.naturalLanguage);  // "Clean up temporary files"
  console.log(sug.reason);           // "Usually executed at this time (14:00)"
  console.log(sug.confidence);       // 0.85
});
```

### Creating Macros

```typescript
const macro = await CommandBrain.createMacro(
  'System Cleanup',
  'Complete system cleanup and optimization',
  'optimize system',
  [
    'clear cache',
    'delete temp files',
    'show disk usage'
  ]
);

// Execute macro
const results = await CommandBrain.executeMacro(macro.id);
console.log(`${results.filter(r => r.success).length}/${results.length} succeeded`);
```

### Command History & Search

```typescript
// Get recent commands
const history = await CommandBrain.getHistory(20);

// Search history
const cacheCommands = await CommandBrain.searchCommands('cache');

// Get frequently used commands
const frequent = await CommandBrain.getFrequentCommands(10);
```

---

## Command Categories

CommandBrain categorizes commands into:

- **file_operation**: File and directory operations (cp, mv, mkdir, etc.)
- **process_management**: Managing processes (kill, killall, ps, etc.)
- **cleanup**: Cache/temp/log cleanup (rm, truncate, etc.)
- **compression**: Archive operations (tar, zip, gzip, etc.)
- **search**: File and content search (find, grep, etc.)
- **optimization**: System optimization tasks
- **network**: Network operations (curl, wget, netstat, etc.)
- **system_info**: System information queries (df, du, free, etc.)

---

## Safety Levels

### Safe ✅
Commands that are non-destructive and safe to execute automatically:
- System information queries (`df -h`, `ps aux`)
- Directory listings (`ls`, `pwd`)
- File reading (`cat`, `head`, `tail`)

### Caution ⚠️
Commands that require confirmation:
- File deletion with wildcards
- Process termination
- Commands using `sudo`
- Operations on system directories

### Dangerous 🛑
Commands that are blocked for safety:
- `rm -rf /` (recursive delete from root)
- Fork bombs
- Raw disk operations (`dd`, `fdisk`)
- Operations that could destroy data or system files

---

## Development

### Project Structure

```
src/
├── commandbrain/
│   ├── CommandBrain.ts           # Main orchestrator
│   ├── types.ts                   # TypeScript type definitions
│   ├── interpreter/
│   │   └── CommandInterpreter.ts # LLM-based interpretation
│   ├── safety/
│   │   └── SafetyAnalyzer.ts     # Safety checking
│   ├── learning/
│   │   └── LearningEngine.ts     # Pattern learning
│   └── storage/
│       └── CommandStore.ts        # IndexedDB storage
├── components/
│   └── CommandBrainTab.tsx        # Main UI component
└── styles/
    └── index.css                  # Styling (includes CommandBrain styles)
```

### Running Locally

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build
```

### Configuration

CommandBrain can be configured via `CommandBrainConfig`:

```typescript
{
  enableVoice: boolean;           // Enable voice commands (future)
  enableTTS: boolean;             // Enable spoken feedback (future)
  autoExecuteSafe: boolean;       // Auto-execute safe commands
  enableLearning: boolean;        // Enable learning system
  enableSuggestions: boolean;     // Enable suggestions
  maxHistorySize: number;         // Max commands to store
  maxPatternSize: number;         // Max patterns to store
}
```

---

## Technology Stack

- **RunAnywhere Web SDK**: On-device AI inference (LLM, STT, TTS, VAD)
- **Liquid AI LFM2 350M**: Lightweight, fast LLM model
- **IndexedDB**: Persistent local storage
- **React**: UI framework
- **TypeScript**: Type-safe development
- **Vite**: Fast build tool

---

## Privacy & Security

### Privacy
- **100% Offline**: All AI inference runs in the browser via WebAssembly
- **No Cloud Dependency**: No API calls, no data leaves your device
- **Local Storage**: All data stored in browser's IndexedDB
- **No Tracking**: No analytics, no telemetry

### Security
- **Multi-Layer Safety**: Pattern matching + keyword detection + heuristics
- **Command Preview**: Always shows what will happen before execution
- **Blocked Commands**: Dangerous operations are automatically blocked
- **Resource Awareness**: Shows affected files and processes
- **Browser Sandbox**: Commands cannot actually execute in browser (simulation mode)

**Note**: Actual command execution requires the CLI tool (future development). The web version provides command interpretation, safety analysis, and preview only.

---

## Future Enhancements

### Planned Features

1. **Voice Command Mode** ⏳
   - VAD-based speech detection
   - STT for natural language input
   - Voice-activated command execution

2. **Spoken Feedback** ⏳
   - TTS for command explanations
   - Audio warnings for dangerous commands
   - Spoken execution results

3. **CLI Tool** ⏳
   - Terminal integration: `commandbrain "clean cache"`
   - Native command execution
   - Shared core with web app
   - Cross-platform support (macOS, Linux, Windows)

4. **Advanced Learning**
   - Behavioral prediction
   - Automated workflow detection
   - Self-improving suggestions
   - Pattern-based automation

5. **Enhanced Safety**
   - Dry-run simulation
   - Reversible operations tracking
   - Automatic backups before destructive operations
   - User-defined safety rules

---

## Example Scenarios

### 1. Quick System Cleanup
```
User: "clean my cache and temp files"

CommandBrain:
✓ Interprets: Remove cache and temporary files
✓ Generates: rm -rf ~/.cache/* /tmp/*
✓ Safety: Caution (requires confirmation)
✓ Learns: Cleanup pattern at current time
✓ Next time: Suggests automatically at same time
```

### 2. Kill Port Process
```
User: "kill port 3000"

CommandBrain:
✓ Interprets: Terminate process using port 3000
✓ Generates: lsof -ti:3000 | xargs kill -9
✓ Safety: Caution (process termination)
✓ Shows: Process details before killing
```

### 3. Disk Space Management
```
User: "show disk usage"

CommandBrain:
✓ Interprets: Display disk space information
✓ Generates: df -h
✓ Safety: Safe (read-only)
✓ Suggests: "Clean up disk space" (if low)
```

### 4. Macro Workflow
```
User creates macro: "Daily Maintenance"
Commands:
1. "clear cache"
2. "delete old logs"
3. "show disk usage"

Later: "run daily maintenance"
✓ Executes all 3 commands in sequence
✓ Shows combined results
✓ Learns this as a frequent pattern
```

---

## API Reference

### CommandBrain Main API

```typescript
class CommandBrain {
  static async init(): Promise<void>
  static async processCommand(naturalLanguage: string): Promise<CommandPreview>
  static async executeCommand(commandId: string): Promise<ExecutionResult>
  static async getSuggestions(): Promise<CommandSuggestion[]>
  static async getHistory(limit?: number): Promise<Command[]>
  static async searchCommands(query: string): Promise<Command[]>
  static async createMacro(name, description, trigger, commands): Promise<Macro>
  static async executeMacro(macroId: string): Promise<ExecutionResult[]>
  static async getStatistics(): Promise<Statistics>
  static async exportData(): Promise<string>
  static async importData(jsonData: string): Promise<void>
  static cleanup(): void
}
```

### SafetyAnalyzer API

```typescript
class SafetyAnalyzer {
  static analyzeCommand(systemCommand, category): SafetyAnalysis
  static shouldBlockCommand(systemCommand): boolean
  static extractFilePaths(systemCommand): string[]
  static extractProcesses(systemCommand): string[]
  static estimateDiskSpaceImpact(systemCommand, category): number | undefined
  static generateSafetyTips(systemCommand): string[]
}
```

### LearningEngine API

```typescript
class LearningEngine {
  static async learnFromCommand(command: Command): Promise<void>
  static async generateSuggestions(context?): Promise<CommandSuggestion[]>
  static async getStatistics(): Promise<LearningStatistics>
  static async pruneOldPatterns(maxAge?: number): Promise<number>
}
```

---

## Contributing

This is a demonstration project showcasing the RunAnywhere Web SDK capabilities. Feel free to:

- Report issues
- Suggest enhancements
- Submit pull requests
- Adapt for your own use cases

---

## License

MIT License - see LICENSE file for details

---

## Acknowledgments

Built with:
- [RunAnywhere SDK](https://docs.runanywhere.ai) - On-device AI inference
- [Liquid AI](https://www.liquid.ai) - LFM2 language models
- React, TypeScript, Vite

---

## Disclaimer

**IMPORTANT**: This is a demonstration/prototype system. The web version provides command interpretation and preview only - it does NOT execute actual system commands (browser security prevents this). 

For actual command execution, the CLI tool needs to be implemented. Always review commands carefully before execution, especially when using a CLI implementation.

The safety engine is a heuristic-based system and should not be relied upon as the sole protection against dangerous commands. Always review command previews and understand what commands will do before executing them.
