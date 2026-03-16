/**
 * CommandBrain Core Type Definitions
 * 
 * This module defines all the types used throughout the CommandBrain system.
 */

// ============================================================================
// Command Types
// ============================================================================

export interface Command {
  /** Unique identifier for this command */
  id: string;
  /** Original natural language input */
  naturalLanguage: string;
  /** Generated system command */
  systemCommand: string;
  /** Command category */
  category: CommandCategory;
  /** Safety level of this command */
  safetyLevel: SafetyLevel;
  /** Explanation of what this command does */
  explanation: string;
  /** Timestamp when command was created */
  createdAt: number;
  /** Timestamp when command was last executed */
  executedAt?: number;
  /** Execution count */
  executionCount: number;
  /** Whether this command executed successfully */
  success?: boolean;
  /** Execution result or error */
  result?: string;
  /** Estimated execution time in ms */
  estimatedDuration?: number;
}

export enum CommandCategory {
  FILE_OPERATION = 'file_operation',
  PROCESS_MANAGEMENT = 'process_management',
  CLEANUP = 'cleanup',
  COMPRESSION = 'compression',
  SEARCH = 'search',
  OPTIMIZATION = 'optimization',
  NETWORK = 'network',
  SYSTEM_INFO = 'system_info',
  CUSTOM = 'custom',
}

export enum SafetyLevel {
  SAFE = 'safe',           // Safe to execute automatically
  CAUTION = 'caution',     // Needs confirmation
  DANGEROUS = 'dangerous', // Should not execute or needs explicit consent
}

// ============================================================================
// Command Preview Types
// ============================================================================

export interface CommandPreview {
  command: Command;
  /** Files that will be affected */
  affectedFiles?: string[];
  /** Processes that will be affected */
  affectedProcesses?: string[];
  /** Estimated disk space change */
  diskSpaceChange?: number;
  /** Warning messages */
  warnings: string[];
  /** Whether user confirmation is required */
  requiresConfirmation: boolean;
}

// ============================================================================
// Macro / Automation Types
// ============================================================================

export interface Macro {
  /** Unique identifier */
  id: string;
  /** Macro name */
  name: string;
  /** Macro description */
  description: string;
  /** Natural language trigger */
  trigger: string;
  /** List of commands to execute in sequence */
  commands: string[];
  /** Execution count */
  executionCount: number;
  /** Created timestamp */
  createdAt: number;
  /** Last executed timestamp */
  lastExecutedAt?: number;
  /** Whether to require confirmation before execution */
  requiresConfirmation: boolean;
}

// ============================================================================
// Learning / Pattern Types
// ============================================================================

export interface CommandPattern {
  /** Pattern identifier */
  id: string;
  /** The natural language pattern */
  pattern: string;
  /** The system command pattern */
  commandPattern: string;
  /** Frequency of this pattern */
  frequency: number;
  /** Last used timestamp */
  lastUsed: number;
  /** Time of day when typically used (0-23) */
  typicalHour?: number;
  /** Day of week when typically used (0-6) */
  typicalDayOfWeek?: number;
}

export interface CommandSuggestion {
  /** Suggestion ID */
  id: string;
  /** Natural language suggestion */
  naturalLanguage: string;
  /** System command */
  systemCommand: string;
  /** Reason for suggesting */
  reason: string;
  /** Confidence score 0-1 */
  confidence: number;
  /** Related pattern ID if applicable */
  patternId?: string;
}

// ============================================================================
// Execution Types
// ============================================================================

export interface ExecutionResult {
  /** Whether execution was successful */
  success: boolean;
  /** Standard output */
  stdout?: string;
  /** Standard error */
  stderr?: string;
  /** Exit code */
  exitCode?: number;
  /** Execution duration in ms */
  duration: number;
  /** Error message if failed */
  error?: string;
}

export interface ExecutionContext {
  /** Current working directory */
  cwd: string;
  /** Environment variables */
  env: Record<string, string>;
  /** Platform information */
  platform: string;
  /** Available disk space */
  diskSpace?: number;
}

// ============================================================================
// Voice Interaction Types
// ============================================================================

export interface VoiceCommand {
  /** Transcribed text */
  text: string;
  /** Confidence score */
  confidence: number;
  /** Timestamp */
  timestamp: number;
}

export interface VoiceFeedback {
  /** Text to speak */
  text: string;
  /** Whether this is a warning/error */
  isWarning?: boolean;
}

// ============================================================================
// Storage Types
// ============================================================================

export interface StorageStats {
  /** Total commands stored */
  totalCommands: number;
  /** Total macros stored */
  totalMacros: number;
  /** Total patterns learned */
  totalPatterns: number;
  /** Total favorites saved */
  totalFavorites: number;
  /** Storage size in bytes */
  storageSize: number;
  /** Last backup timestamp */
  lastBackup?: number;
}

// ============================================================================
// Configuration Types
// ============================================================================

export interface CommandBrainConfig {
  /** Enable voice commands */
  enableVoice: boolean;
  /** Enable spoken feedback */
  enableTTS: boolean;
  /** Auto-execute safe commands */
  autoExecuteSafe: boolean;
  /** Enable learning system */
  enableLearning: boolean;
  /** Enable suggestions */
  enableSuggestions: boolean;
  /** Maximum history size */
  maxHistorySize: number;
  /** Maximum pattern storage */
  maxPatternSize: number;
}

// ============================================================================
// LLM Interaction Types
// ============================================================================

export interface CommandInterpretation {
  /** Interpreted system command */
  systemCommand: string;
  /** Explanation of the command */
  explanation: string;
  /** Command category */
  category: CommandCategory;
  /** Safety assessment */
  safetyLevel: SafetyLevel;
  /** Confidence score 0-1 */
  confidence: number;
  /** Alternative interpretations */
  alternatives?: string[];
  /** Warnings about the command */
  warnings?: string[];
}

// ============================================================================
// Saved Command Templates
// ============================================================================

export interface SavedCommand {
  /** Unique identifier */
  id: string;
  /** Template name */
  name: string;
  /** Description */
  description: string;
  /** Natural language template */
  naturalLanguage: string;
  /** System command template (optional) */
  systemCommand?: string;
  /** Tags for organization */
  tags: string[];
  /** Created timestamp */
  createdAt: number;
  /** Last used timestamp */
  lastUsed?: number;
  /** Usage count */
  usageCount: number;
  /** Whether this is editable */
  isCustom: boolean;
}

// ============================================================================
// Favorite Commands (Quick Access)
// ============================================================================

export interface FavoriteCommand {
  /** Unique identifier */
  id: string;
  /** Reference to the command this was favorited from */
  commandId?: string;
  /** Natural language command */
  naturalLanguage: string;
  /** System command */
  systemCommand: string;
  /** Brief description */
  description: string;
  /** Command category */
  category: CommandCategory;
  /** Safety level */
  safetyLevel: SafetyLevel;
  /** Custom label/nickname */
  label?: string;
  /** Created timestamp */
  createdAt: number;
  /** Last used timestamp */
  lastUsed?: number;
  /** Usage count from favorites */
  usageCount: number;
  /** Whether it failed last time */
  lastExecutionFailed?: boolean;
  /** Notes about the command */
  notes?: string;
  /** Optional folder/group for saved command */
  folder?: string;
  /** Optional tags for searching and grouping */
  tags?: string[];
}
