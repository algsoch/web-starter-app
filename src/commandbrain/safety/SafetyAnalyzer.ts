/**
 * SafetyAnalyzer - Analyzes commands for safety and risk
 * 
 * Uses pattern matching and heuristics to assess command safety levels.
 * This is a critical component for preventing destructive operations.
 */

import { SafetyLevel, CommandCategory } from '../types';

export interface SafetyAnalysis {
  level: SafetyLevel;
  warnings: string[];
  requiresConfirmation: boolean;
  blockedReasons?: string[];
  affectedResources?: string[];
}

export class SafetyAnalyzer {
  // Dangerous command patterns
  private static readonly DANGEROUS_PATTERNS = [
    /rm\s+-rf\s+\/(?!\s*home)/i,        // rm -rf / (excluding /home)
    /rm\s+-rf\s+\*/i,                   // rm -rf *
    /:\(\)\{\s*:\|:&\s*\};:/i,          // Fork bomb
    /dd\s+if=/i,                         // dd (disk destroyer)
    /mkfs/i,                             // Format disk
    /fdisk/i,                            // Partition operations
    />\s*\/dev\/sd[a-z]/i,              // Write to raw disk
    /wget.*\|\s*sh/i,                   // Download and execute
    /curl.*\|\s*bash/i,                 // Download and execute
    /chmod\s+777\s+\/(?!home|tmp)/i,   // Dangerous permissions on system dirs
    /chown.*\/(?!home)/i,               // Change ownership of system files
  ];

  // Dangerous keywords
  private static readonly DANGEROUS_KEYWORDS = [
    'format',
    'destroy',
    'shred',
    'wipe',
    'overwrite',
    '/etc/passwd',
    '/etc/shadow',
    '/boot',
    '/sys',
    '/proc',
  ];

  // Caution command patterns (need confirmation)
  private static readonly CAUTION_PATTERNS = [
    /rm\s+-r/i,                          // Recursive delete
    /rm\s+.*\*/i,                        // Delete with wildcards
    /sudo/i,                             // Elevated privileges
    /kill\s+-9/i,                        // Force kill
    /truncate/i,                         // Truncate files
    />\s*[^&]/i,                         // Output redirection (overwrite)
  ];

  // Caution keywords
  private static readonly CAUTION_KEYWORDS = [
    'delete',
    'remove',
    'kill',
    'terminate',
    'drop',
    'truncate',
    'clear',
  ];

  // System directory patterns
  private static readonly SYSTEM_DIRECTORIES = [
    '/bin',
    '/sbin',
    '/usr',
    '/lib',
    '/lib64',
    '/boot',
    '/etc',
    '/sys',
    '/proc',
    '/dev',
  ];

  /**
   * Analyze a system command for safety
   */
  static analyzeCommand(
    systemCommand: string,
    category: CommandCategory
  ): SafetyAnalysis {
    const warnings: string[] = [];
    const blockedReasons: string[] = [];
    const affectedResources: string[] = [];
    let level: SafetyLevel = SafetyLevel.SAFE;

    // Check for dangerous patterns
    for (const pattern of this.DANGEROUS_PATTERNS) {
      if (pattern.test(systemCommand)) {
        level = SafetyLevel.DANGEROUS;
        blockedReasons.push(
          `Command matches dangerous pattern: ${pattern.source}`
        );
      }
    }

    // Check for dangerous keywords
    for (const keyword of this.DANGEROUS_KEYWORDS) {
      if (systemCommand.toLowerCase().includes(keyword)) {
        if (level !== SafetyLevel.DANGEROUS) {
          level = SafetyLevel.DANGEROUS;
        }
        blockedReasons.push(
          `Command contains dangerous keyword: "${keyword}"`
        );
      }
    }

    // Check for caution patterns
    if (level === SafetyLevel.SAFE) {
      for (const pattern of this.CAUTION_PATTERNS) {
        if (pattern.test(systemCommand)) {
          level = SafetyLevel.CAUTION;
          warnings.push(
            `Command matches caution pattern: ${pattern.source}`
          );
        }
      }
    }

    // Check for caution keywords
    if (level === SafetyLevel.SAFE) {
      for (const keyword of this.CAUTION_KEYWORDS) {
        if (systemCommand.toLowerCase().includes(keyword)) {
          level = SafetyLevel.CAUTION;
          warnings.push(
            `Command contains caution keyword: "${keyword}"`
          );
        }
      }
    }

    // Check for system directory access
    for (const dir of this.SYSTEM_DIRECTORIES) {
      if (systemCommand.includes(dir)) {
        affectedResources.push(dir);
        if (level === SafetyLevel.SAFE) {
          level = SafetyLevel.CAUTION;
          warnings.push(`Command affects system directory: ${dir}`);
        }
      }
    }

    // Category-specific checks
    if (category === CommandCategory.PROCESS_MANAGEMENT) {
      if (systemCommand.includes('kill') || systemCommand.includes('killall')) {
        if (level === SafetyLevel.SAFE) {
          level = SafetyLevel.CAUTION;
          warnings.push('Killing processes requires confirmation');
        }
      }
    }

    if (category === CommandCategory.CLEANUP) {
      if (systemCommand.includes('rm') || systemCommand.includes('del')) {
        if (level === SafetyLevel.SAFE) {
          level = SafetyLevel.CAUTION;
          warnings.push('File deletion requires confirmation');
        }
      }
    }

    // Add general warnings
    if (level === SafetyLevel.DANGEROUS) {
      warnings.push('⚠️ DANGEROUS COMMAND - This command could cause severe system damage');
      warnings.push('⚠️ This command has been blocked for your safety');
    } else if (level === SafetyLevel.CAUTION) {
      warnings.push('⚠️ This command requires confirmation before execution');
    }

    const requiresConfirmation = 
      level === SafetyLevel.DANGEROUS || 
      level === SafetyLevel.CAUTION;

    return {
      level,
      warnings,
      requiresConfirmation,
      blockedReasons: blockedReasons.length > 0 ? blockedReasons : undefined,
      affectedResources: affectedResources.length > 0 ? affectedResources : undefined,
    };
  }

  /**
   * Check if a command should be blocked entirely
   */
  static shouldBlockCommand(systemCommand: string): boolean {
    return this.analyzeCommand(systemCommand, CommandCategory.CUSTOM).level === SafetyLevel.DANGEROUS;
  }

  /**
   * Get a human-readable safety description
   */
  static getSafetyDescription(level: SafetyLevel): string {
    switch (level) {
      case SafetyLevel.SAFE:
        return '✅ Safe to execute';
      case SafetyLevel.CAUTION:
        return '⚠️ Requires confirmation';
      case SafetyLevel.DANGEROUS:
        return '🛑 Blocked - Too dangerous';
    }
  }

  /**
   * Extract file paths from command
   */
  static extractFilePaths(systemCommand: string): string[] {
    const paths: string[] = [];
    
    // Match common path patterns
    const pathPatterns = [
      /(?:^|\s)(\/[^\s]+)/g,           // Absolute paths
      /(?:^|\s)(\.\/[^\s]+)/g,         // Relative paths starting with ./
      /(?:^|\s)(~\/[^\s]+)/g,          // Home directory paths
      /(?:^|\s)([a-zA-Z0-9_\-./]+\.[a-zA-Z0-9]+)/g, // Files with extensions
    ];
    
    for (const pattern of pathPatterns) {
      const matches = systemCommand.matchAll(pattern);
      for (const match of matches) {
        if (match[1]) {
          paths.push(match[1]);
        }
      }
    }
    
    return [...new Set(paths)]; // Remove duplicates
  }

  /**
   * Extract process names/PIDs from command
   */
  static extractProcesses(systemCommand: string): string[] {
    const processes: string[] = [];
    
    // Match process identifiers after kill/killall
    const killMatch = systemCommand.match(/kill(?:all)?\s+(-\d+\s+)?(\d+|[\w-]+)/gi);
    if (killMatch) {
      for (const match of killMatch) {
        const parts = match.split(/\s+/);
        const target = parts[parts.length - 1];
        processes.push(target);
      }
    }
    
    return processes;
  }

  /**
   * Estimate disk space impact (in bytes)
   */
  static estimateDiskSpaceImpact(
    systemCommand: string,
    category: CommandCategory
  ): number | undefined {
    // For cleanup operations, assume positive impact (freeing space)
    if (category === CommandCategory.CLEANUP) {
      // This is a rough estimate - in real implementation, would need to actually check file sizes
      if (systemCommand.includes('cache')) return 500_000_000; // ~500MB
      if (systemCommand.includes('tmp') || systemCommand.includes('temp')) return 200_000_000; // ~200MB
      if (systemCommand.includes('log')) return 100_000_000; // ~100MB
    }
    
    // For compression, estimate 30-50% space savings
    if (category === CommandCategory.COMPRESSION) {
      if (systemCommand.includes('gzip') || systemCommand.includes('zip')) {
        return -100_000_000; // Assume ~100MB compressed
      }
    }
    
    return undefined;
  }

  /**
   * Generate safety tips based on command
   */
  static generateSafetyTips(systemCommand: string): string[] {
    const tips: string[] = [];
    
    if (systemCommand.includes('rm') && systemCommand.includes('-r')) {
      tips.push('Tip: Use "ls -R" first to preview what will be deleted');
      tips.push('Tip: Consider using "trash" command instead for recoverable deletion');
    }
    
    if (systemCommand.includes('sudo')) {
      tips.push('Tip: This command requires administrator privileges');
      tips.push('Tip: Verify the command carefully before entering your password');
    }
    
    if (systemCommand.includes('>')) {
      tips.push('Tip: Output redirection (>) will overwrite the target file');
      tips.push('Tip: Use >> to append instead of overwrite');
    }
    
    if (systemCommand.includes('kill')) {
      tips.push('Tip: Use "kill -15" (SIGTERM) before "kill -9" (SIGKILL) when possible');
      tips.push('Tip: Check process with "ps aux | grep" first');
    }
    
    return tips;
  }
}
