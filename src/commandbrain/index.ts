/**
 * CommandBrain - Main export file
 */

export { CommandBrain } from './CommandBrain';
export { CommandInterpreter } from './interpreter/CommandInterpreter';
export { SafetyAnalyzer } from './safety/SafetyAnalyzer';
export { LearningEngine } from './learning/LearningEngine';
export { commandStore } from './storage/CommandStore';

export type {
  Command,
  CommandCategory,
  SafetyLevel,
  CommandPreview,
  Macro,
  CommandPattern,
  CommandSuggestion,
  ExecutionResult,
  ExecutionContext,
  VoiceCommand,
  VoiceFeedback,
  CommandBrainConfig,
  CommandInterpretation,
  StorageStats,
} from './types';
