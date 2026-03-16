/**
 * CommandBrain - Main orchestrator for the CommandBrain system
 * 
 * This is the central class that coordinates all components:
 * - Command interpretation
 * - Safety analysis
 * - Command execution (preview only in browser)
 * - Learning and suggestions
 * - Voice interaction
 */

import { ModelManager, ModelCategory } from '@runanywhere/web';
import type {
  Command,
  CommandPreview,
  CommandInterpretation,
  Macro,
  CommandSuggestion,
  CommandBrainConfig,
  ExecutionResult,
  VoiceCommand,
  FavoriteCommand,
} from './types';
import { SafetyLevel } from './types';
import { commandStore } from './storage/CommandStore';
import { CommandInterpreter } from './interpreter/CommandInterpreter';
import { SafetyAnalyzer } from './safety/SafetyAnalyzer';
import { LearningEngine } from './learning/LearningEngine';
import { BridgeClient } from './bridge/BridgeClient';

export class CommandBrain {
  private static initialized = false;
  private static config: CommandBrainConfig | null = null;

  /**
   * Initialize CommandBrain system
   */
  static async init(): Promise<void> {
    if (this.initialized) return;

    // Initialize storage
    await commandStore.init();

    // Load configuration
    this.config = await commandStore.getConfig();

    // Initialize command interpreter
    await CommandInterpreter.init();

    // Note: LLM model loading will be handled by the UI/component level
    // We just initialize the command interpreter and storage here
    
    this.initialized = true;
    console.log('CommandBrain initialized successfully');
  }

  /**
   * Process natural language command
   */
  static async processCommand(naturalLanguage: string): Promise<CommandPreview> {
    await this.init();

    // Interpret the command using LLM
    const interpretation = await CommandInterpreter.interpret(naturalLanguage);

    // Create command object
    const command: Command = {
      id: `cmd_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
      naturalLanguage,
      systemCommand: interpretation.systemCommand,
      category: interpretation.category,
      safetyLevel: interpretation.safetyLevel,
      explanation: interpretation.explanation,
      createdAt: Date.now(),
      executionCount: 0,
    };

    // Generate command preview
    const preview = this.generatePreview(command, interpretation);

    // Save to history (don't execute yet)
    await commandStore.saveCommand(command);

    // Learn from this command if learning is enabled
    if (this.config?.enableLearning) {
      await LearningEngine.learnFromCommand(command);
    }

    return preview;
  }

  /**
   * Refine an existing command while preserving its current context.
   */
  static async refineCommand(
    naturalLanguage: string,
    currentSystemCommand: string,
    refinement: string
  ): Promise<CommandPreview> {
    await this.init();

    const interpretation = await CommandInterpreter.refineExistingCommand(
      naturalLanguage,
      currentSystemCommand,
      refinement
    );

    const command: Command = {
      id: `cmd_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
      naturalLanguage,
      systemCommand: interpretation.systemCommand,
      category: interpretation.category,
      safetyLevel: interpretation.safetyLevel,
      explanation: interpretation.explanation,
      createdAt: Date.now(),
      executionCount: 0,
    };

    const preview = this.generatePreview(command, interpretation);
    await commandStore.saveCommand(command);
    return preview;
  }

  /**
   * Generate command preview with safety analysis
   */
  private static generatePreview(
    command: Command,
    interpretation: CommandInterpretation
  ): CommandPreview {
    const safetyAnalysis = SafetyAnalyzer.analyzeCommand(
      command.systemCommand,
      command.category
    );

    return {
      command,
      affectedFiles: SafetyAnalyzer.extractFilePaths(command.systemCommand),
      affectedProcesses: SafetyAnalyzer.extractProcesses(command.systemCommand),
      diskSpaceChange: SafetyAnalyzer.estimateDiskSpaceImpact(
        command.systemCommand,
        command.category
      ),
      warnings: safetyAnalysis.warnings,
      requiresConfirmation: safetyAnalysis.requiresConfirmation,
    };
  }

  /**
   * Execute command (browser simulation - no actual execution)
   */
  static async executeCommand(commandId: string, useBridge: boolean = false): Promise<ExecutionResult> {
    await this.init();

    const command = await commandStore.getCommand(commandId);
    if (!command) {
      return {
        success: false,
        error: 'Command not found',
        duration: 0,
      };
    }

    // Check safety level
    if (command.safetyLevel === SafetyLevel.DANGEROUS) {
      return {
        success: false,
        error: 'Command blocked for safety reasons',
        duration: 0,
      };
    }

    let result: ExecutionResult;

    // Try bridge execution if requested and available
    if (useBridge) {
      if (!BridgeClient.isAvailable()) {
        result = {
          success: false,
          error: 'Real execution requested, but bridge is not connected/configured. Open Settings and connect the Execution Bridge.',
          duration: 0,
        };
      } else {
        result = await BridgeClient.executeCommand(
          command.systemCommand,
          command.safetyLevel
        );
      }
    } else {
      // Fallback to simulation mode
      const startTime = Date.now();
      result = {
        success: true,
        stdout: `[SIMULATED] Command would execute: ${command.systemCommand}\n\nNote: Actual command execution is only available in CLI mode or via Execution Bridge.`,
        duration: Date.now() - startTime,
      };
    }

    // Update command execution record
    command.executionCount++;
    command.executedAt = Date.now();
    command.success = result.success;
    command.result = result.stdout || result.stderr;
    await commandStore.saveCommand(command);

    // Update favorite if it exists
    const favorite = await commandStore.checkIsFavorite(
      command.naturalLanguage,
      command.systemCommand
    );
    if (favorite) {
      favorite.lastExecutionFailed = !result.success;
      favorite.lastUsed = Date.now();
      await commandStore.saveFavorite(favorite);
    }

    return result;
  }

  /**
   * Get command suggestions
   */
  static async getSuggestions(): Promise<CommandSuggestion[]> {
    await this.init();

    if (!this.config?.enableSuggestions) {
      return [];
    }

    const recentCommands = await commandStore.getRecentCommands(5);
    return LearningEngine.generateSuggestions({ recentCommands });
  }

  /**
   * Get alternative command variants for the same natural language intent
   */
  static async getCommandVariants(
    naturalLanguage: string,
    count = 3
  ): Promise<Array<{ systemCommand: string; explanation: string }>> {
    await this.init();
    return CommandInterpreter.getVariants(naturalLanguage, count);
  }

  /**
   * Get command history
   */
  static async getHistory(limit?: number): Promise<Command[]> {
    await this.init();
    return commandStore.getRecentCommands(limit);
  }

  /**
   * Get frequent commands
   */
  static async getFrequentCommands(limit: number = 10): Promise<Command[]> {
    await this.init();
    return commandStore.getFrequentCommands(limit);
  }

  /**
   * Search command history
   */
  static async searchCommands(query: string): Promise<Command[]> {
    await this.init();
    return commandStore.searchCommands(query);
  }

  /**
   * Delete a single command from history
   */
  static async deleteCommand(id: string): Promise<void> {
    await this.init();
    await commandStore.deleteCommand(id);
  }

  /**
   * Update the systemCommand text of an existing stored command (for param substitution)
   */
  static async updateCommandText(id: string, newSystemCommand: string): Promise<void> {
    await this.init();
    const cmd = await commandStore.getCommand(id);
    if (!cmd) return;
    cmd.systemCommand = newSystemCommand;
    await commandStore.saveCommand(cmd);
  }

  /**
   * Create a macro
   */
  static async createMacro(
    name: string,
    description: string,
    trigger: string,
    commands: string[]
  ): Promise<Macro> {
    await this.init();

    const macro: Macro = {
      id: `macro_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
      name,
      description,
      trigger,
      commands,
      executionCount: 0,
      createdAt: Date.now(),
      requiresConfirmation: true,
    };

    await commandStore.saveMacro(macro);
    return macro;
  }

  /**
   * Execute a macro
   */
  static async executeMacro(
    macroId: string,
    useBridge: boolean = false,
    onStepUpdate?: (update: {
      index: number;
      total: number;
      command: string;
      phase: 'running' | 'completed';
      result?: ExecutionResult;
    }) => void
  ): Promise<ExecutionResult[]> {
    await this.init();

    const macro = await commandStore.getMacro(macroId);
    if (!macro) {
      return [{
        success: false,
        error: 'Macro not found',
        duration: 0,
      }];
    }

    const results: ExecutionResult[] = [];
    const total = macro.commands.length;

    // Process each command in the macro
    for (let index = 0; index < macro.commands.length; index++) {
      const naturalLanguage = macro.commands[index];
      onStepUpdate?.({
        index,
        total,
        command: naturalLanguage,
        phase: 'running',
      });

      const preview = await this.processCommand(naturalLanguage);
      const result = await this.executeCommand(preview.command.id, useBridge);
      results.push(result);

      onStepUpdate?.({
        index,
        total,
        command: naturalLanguage,
        phase: 'completed',
        result,
      });

      // Stop if any command fails
      if (!result.success) {
        break;
      }
    }

    // Update macro stats
    macro.executionCount++;
    macro.lastExecutedAt = Date.now();
    await commandStore.saveMacro(macro);

    return results;
  }

  /**
   * Get all macros
   */
  static async getMacros(): Promise<Macro[]> {
    await this.init();
    return commandStore.getAllMacros();
  }

  /**
   * Delete a macro
   */
  static async deleteMacro(macroId: string): Promise<void> {
    await this.init();
    await commandStore.deleteMacro(macroId);
  }

  /**
   * Add command to favorites
   */
  static async addToFavorites(
    command: Command,
    label?: string,
    notes?: string,
    folder?: string,
    tags?: string[]
  ): Promise<FavoriteCommand> {
    await this.init();

    // Check if already favorited
    const existing = await commandStore.checkIsFavorite(
      command.naturalLanguage,
      command.systemCommand
    );
    
    if (existing) {
      return existing;
    }

    const favorite: FavoriteCommand = {
      id: `fav_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
      commandId: command.id,
      naturalLanguage: command.naturalLanguage,
      systemCommand: command.systemCommand,
      description: command.explanation,
      category: command.category,
      safetyLevel: command.safetyLevel,
      label,
      notes,
      folder,
      tags,
      createdAt: Date.now(),
      usageCount: 0,
    };

    await commandStore.saveFavorite(favorite);
    return favorite;
  }

  /**
   * Get all favorites
   */
  static async getFavorites(): Promise<FavoriteCommand[]> {
    await this.init();
    return commandStore.getAllFavorites();
  }

  /**
   * Check if command is favorited
   */
  static async isFavorited(naturalLanguage: string, systemCommand: string): Promise<boolean> {
    await this.init();
    const favorite = await commandStore.checkIsFavorite(naturalLanguage, systemCommand);
    return favorite !== null;
  }

  /**
   * Remove from favorites
   */
  static async removeFromFavorites(favoriteId: string): Promise<void> {
    await this.init();
    await commandStore.deleteFavorite(favoriteId);
  }

  /**
   * Update favorite usage
   */
  static async useFavorite(favoriteId: string): Promise<void> {
    await this.init();
    
    const favorite = await commandStore.getFavorite(favoriteId);
    if (!favorite) return;
    
    favorite.usageCount++;
    favorite.lastUsed = Date.now();
    await commandStore.saveFavorite(favorite);
  }

  /**
   * Update metadata for a saved command
   */
  static async updateFavoriteMetadata(
    favoriteId: string,
    metadata: Partial<Pick<FavoriteCommand, 'label' | 'notes' | 'folder' | 'tags'>>
  ): Promise<void> {
    await this.init();
    const favorite = await commandStore.getFavorite(favoriteId);
    if (!favorite) return;

    Object.assign(favorite, metadata);
    await commandStore.saveFavorite(favorite);
  }

  /**
   * Get system statistics
   */
  static async getStatistics() {
    await this.init();
    
    const [storageStats, learningStats] = await Promise.all([
      commandStore.getStats(),
      LearningEngine.getStatistics(),
    ]);

    return {
      ...storageStats,
      ...learningStats,
    };
  }

  /**
   * Update configuration
   */
  static async updateConfig(config: Partial<CommandBrainConfig>): Promise<void> {
    await this.init();
    
    const currentConfig = await commandStore.getConfig();
    const newConfig = { ...currentConfig, ...config };
    
    await commandStore.saveConfig(newConfig);
    this.config = newConfig;
  }

  /**
   * Get current configuration
   */
  static async getConfig(): Promise<CommandBrainConfig> {
    await this.init();
    return this.config || await commandStore.getConfig();
  }

  /**
   * Export all data
   */
  static async exportData(): Promise<string> {
    await this.init();
    return commandStore.exportData();
  }

  /**
   * Import data
   */
  static async importData(jsonData: string): Promise<void> {
    await this.init();
    await commandStore.importData(jsonData);
  }

  /**
   * Get bridge client for configuration
   */
  static getBridgeClient() {
    return BridgeClient;
  }

  /**
   * Clear all data
   */
  static async clearAllData(): Promise<void> {
    await this.init();
    await commandStore.clearAll();
  }

  /**
   * Cleanup resources
   */
  static cleanup(): void {
    CommandInterpreter.cleanup();
    commandStore.close();
    this.initialized = false;
    this.config = null;
  }
}
