/**
 * LearningEngine - Adaptive learning system for CommandBrain
 * 
 * Analyzes command usage patterns, learns from user behavior,
 * and generates intelligent suggestions.
 */

import type {
  Command,
  CommandPattern,
  CommandSuggestion,
} from '../types';
import { commandStore } from '../storage/CommandStore';

export class LearningEngine {
  /**
   * Learn from executed command
   */
  static async learnFromCommand(command: Command): Promise<void> {
    // Extract pattern from command
    const pattern = this.extractPattern(command);
    
    if (!pattern) return;

    // Check if pattern already exists
    const existingPatterns = await commandStore.getAllPatterns();
    const existingPattern = existingPatterns.find((p) => 
      this.isSimilarPattern(p.pattern, pattern.pattern)
    );

    if (existingPattern) {
      // Update existing pattern
      existingPattern.frequency++;
      existingPattern.lastUsed = Date.now();
      existingPattern.commandPattern = pattern.commandPattern;
      
      // Update time-based patterns
      const now = new Date();
      existingPattern.typicalHour = now.getHours();
      existingPattern.typicalDayOfWeek = now.getDay();
      
      await commandStore.savePattern(existingPattern);
    } else {
      // Create new pattern
      await commandStore.savePattern(pattern);
    }
  }

  /**
   * Extract reusable pattern from command
   */
  private static extractPattern(command: Command): CommandPattern | null {
    const { naturalLanguage, systemCommand, category } = command;

    // Generate pattern by abstracting specific values
    const nlPattern = this.abstractNaturalLanguage(naturalLanguage);
    const cmdPattern = this.abstractSystemCommand(systemCommand);

    // Only create pattern if abstraction was successful
    if (nlPattern === naturalLanguage && cmdPattern === systemCommand) {
      // No abstraction possible, command is too specific
      return null;
    }

    const now = new Date();
    return {
      id: `pattern_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
      pattern: nlPattern,
      commandPattern: cmdPattern,
      frequency: 1,
      lastUsed: Date.now(),
      typicalHour: now.getHours(),
      typicalDayOfWeek: now.getDay(),
    };
  }

  /**
   * Abstract natural language by replacing specific values with placeholders
   */
  private static abstractNaturalLanguage(nl: string): string {
    let abstract = nl.toLowerCase();

    // Replace numbers with {number}
    abstract = abstract.replace(/\d+/g, '{number}');

    // Replace file paths
    abstract = abstract.replace(/\/[\w\/.-]+/g, '{path}');
    abstract = abstract.replace(/~\/[\w\/.-]+/g, '{path}');

    // Replace specific file extensions
    abstract = abstract.replace(/\.(txt|log|json|md|csv|zip|tar|gz)/gi, '.{ext}');

    return abstract.trim();
  }

  /**
   * Abstract system command by replacing specific values with placeholders
   */
  private static abstractSystemCommand(cmd: string): string {
    let abstract = cmd;

    // Replace numeric values
    abstract = abstract.replace(/\b\d+\b/g, '{number}');

    // Replace paths
    abstract = abstract.replace(/\/[\w\/.-]+/g, '{path}');
    abstract = abstract.replace(/~\/[\w\/.-]+/g, '{home_path}');

    // Replace file extensions
    abstract = abstract.replace(/\*\.(txt|log|json|md|csv|zip|tar|gz)/gi, '*.{ext}');

    return abstract.trim();
  }

  /**
   * Check if two patterns are similar
   */
  private static isSimilarPattern(pattern1: string, pattern2: string): boolean {
    // Simple string similarity - could be enhanced with fuzzy matching
    const normalized1 = pattern1.toLowerCase().trim();
    const normalized2 = pattern2.toLowerCase().trim();

    if (normalized1 === normalized2) return true;

    // Check Levenshtein distance
    const distance = this.levenshteinDistance(normalized1, normalized2);
    const maxLength = Math.max(normalized1.length, normalized2.length);
    const similarity = 1 - distance / maxLength;

    return similarity >= 0.8; // 80% similarity threshold
  }

  /**
   * Calculate Levenshtein distance between two strings
   */
  private static levenshteinDistance(str1: string, str2: string): number {
    const matrix: number[][] = [];

    for (let i = 0; i <= str2.length; i++) {
      matrix[i] = [i];
    }

    for (let j = 0; j <= str1.length; j++) {
      matrix[0][j] = j;
    }

    for (let i = 1; i <= str2.length; i++) {
      for (let j = 1; j <= str1.length; j++) {
        if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1, // substitution
            matrix[i][j - 1] + 1,     // insertion
            matrix[i - 1][j] + 1      // deletion
          );
        }
      }
    }

    return matrix[str2.length][str1.length];
  }

  /**
   * Generate suggestions based on context and patterns
   */
  static async generateSuggestions(
    context?: {
      recentCommands?: Command[];
      timeOfDay?: number;
      dayOfWeek?: number;
    }
  ): Promise<CommandSuggestion[]> {
    const suggestions: CommandSuggestion[] = [];

    // Get frequent patterns
    const frequentPatterns = await commandStore.getFrequentPatterns(20);

    // Get recent commands
    const recentCommands = context?.recentCommands || 
      await commandStore.getRecentCommands(10);

    // Time-based suggestions
    const now = new Date();
    const currentHour = context?.timeOfDay ?? now.getHours();
    const currentDay = context?.dayOfWeek ?? now.getDay();

    for (const pattern of frequentPatterns) {
      // Skip if used very recently (within last hour)
      if (Date.now() - pattern.lastUsed < 3600000) continue;

      let confidence = 0.5; // Base confidence
      let reason = 'Frequently used command';

      // Boost confidence based on time patterns
      if (pattern.typicalHour === currentHour) {
        confidence += 0.2;
        reason = `Usually executed at this time (${currentHour}:00)`;
      }

      if (pattern.typicalDayOfWeek === currentDay) {
        confidence += 0.1;
        reason += `, typically on this day of week`;
      }

      // Boost confidence based on frequency
      if (pattern.frequency > 10) {
        confidence += 0.15;
      }

      // Create suggestion (would need to "fill in" the pattern)
      // For now, use the pattern as-is
      suggestions.push({
        id: `suggestion_${pattern.id}`,
        naturalLanguage: this.generateNLFromPattern(pattern.pattern),
        systemCommand: pattern.commandPattern,
        reason,
        confidence: Math.min(confidence, 1.0),
        patternId: pattern.id,
      });
    }

    // Context-based suggestions
    if (recentCommands.length > 0) {
      const contextSuggestions = this.generateContextualSuggestions(recentCommands);
      suggestions.push(...contextSuggestions);
    }

    // Sort by confidence and return top suggestions
    return suggestions
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, 5);
  }

  /**
   * Generate natural language from pattern
   */
  private static generateNLFromPattern(pattern: string): string {
    // Simple reverse transformation - could be enhanced
    return pattern
      .replace(/{number}/g, 'X')
      .replace(/{path}/g, 'folder')
      .replace(/{ext}/g, 'file');
  }

  /**
   * Generate contextual suggestions based on recent commands
   */
  private static generateContextualSuggestions(
    recentCommands: Command[]
  ): CommandSuggestion[] {
    const suggestions: CommandSuggestion[] = [];

    // Look for related command sequences
    const lastCommand = recentCommands[0];

    // If last command was a file operation, suggest cleanup
    if (lastCommand?.category === 'file_operation') {
      suggestions.push({
        id: 'suggestion_cleanup_after_file_op',
        naturalLanguage: 'Clean up temporary files',
        systemCommand: 'rm -rf /tmp/* ~/.cache/tmp/*',
        reason: 'Common cleanup after file operations',
        confidence: 0.6,
      });
    }

    // If last command was compression, suggest extraction
    if (lastCommand?.systemCommand.includes('tar') || 
        lastCommand?.systemCommand.includes('zip')) {
      if (lastCommand.systemCommand.includes('-c')) {
        suggestions.push({
          id: 'suggestion_extract',
          naturalLanguage: 'Extract the archive',
          systemCommand: 'tar -xzf archive.tar.gz',
          reason: 'You just created an archive',
          confidence: 0.7,
        });
      }
    }

    // If last command checked disk usage, suggest cleanup
    if (lastCommand?.systemCommand.includes('df') || 
        lastCommand?.systemCommand.includes('du')) {
      suggestions.push({
        id: 'suggestion_cleanup_disk',
        naturalLanguage: 'Clean up disk space',
        systemCommand: 'rm -rf ~/.cache/* /tmp/*',
        reason: 'Low disk space detected',
        confidence: 0.75,
      });
    }

    return suggestions;
  }

  /**
   * Get command statistics
   */
  static async getStatistics(): Promise<{
    totalCommands: number;
    totalPatterns: number;
    mostFrequentCategory: string;
    averageExecutionCount: number;
    patternEfficiency: number;
    successRate: number;
    failedCommands: number;
    successfulCommands: number;
    totalExecutions: number;
  }> {
    const commands = await commandStore.getAllCommands();
    const patterns = await commandStore.getAllPatterns();

    // Calculate category frequency
    const categoryCount: Record<string, number> = {};
    commands.forEach((cmd) => {
      categoryCount[cmd.category] = (categoryCount[cmd.category] || 0) + 1;
    });

    const mostFrequentCategory = Object.entries(categoryCount)
      .sort(([, a], [, b]) => b - a)[0]?.[0] || 'none';

    const averageExecutionCount = 
      commands.length > 0
        ? commands.reduce((sum, cmd) => sum + cmd.executionCount, 0) / commands.length
        : 0;

    // Pattern efficiency: ratio of patterns to total commands
    const patternEfficiency = 
      commands.length > 0 ? patterns.length / commands.length : 0;

    // Success rate tracking
    const executedCommands = commands.filter(cmd => cmd.executedAt !== undefined);
    const successfulCommands = executedCommands.filter(cmd => cmd.success === true).length;
    const failedCommands = executedCommands.filter(cmd => cmd.success === false).length;
    const totalExecutions = executedCommands.reduce((sum, cmd) => sum + cmd.executionCount, 0);
    const successRate = executedCommands.length > 0 
      ? successfulCommands / executedCommands.length 
      : 0;

    return {
      totalCommands: commands.length,
      totalPatterns: patterns.length,
      mostFrequentCategory,
      averageExecutionCount,
      patternEfficiency,
      successRate,
      failedCommands,
      successfulCommands,
      totalExecutions,
    };
  }

  /**
   * Prune old patterns that are no longer used
   */
  static async pruneOldPatterns(maxAge: number = 90 * 24 * 60 * 60 * 1000): Promise<number> {
    const patterns = await commandStore.getAllPatterns();
    const cutoffTime = Date.now() - maxAge;
    let pruned = 0;

    for (const pattern of patterns) {
      // Delete patterns that haven't been used in maxAge and have low frequency
      if (pattern.lastUsed < cutoffTime && pattern.frequency < 3) {
        await commandStore.deletePattern(pattern.id);
        pruned++;
      }
    }

    return pruned;
  }
}
