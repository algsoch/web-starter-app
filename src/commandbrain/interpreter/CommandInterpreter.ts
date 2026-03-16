/**
 * CommandInterpreter - Converts natural language to system commands using LLM
 * 
 * This is the core "brain" that understands user intent and generates
 * appropriate system commands with Tool Calling capabilities.
 */

import { TextGeneration } from '@runanywhere/web-llamacpp';
import type { CommandInterpretation, CommandCategory } from '../types';
import { SafetyLevel } from '../types';
import { SafetyAnalyzer } from '../safety/SafetyAnalyzer';

export class CommandInterpreter {
  private static initialized = false;

  /**
   * Initialize the command interpreter
   */
  static async init(): Promise<void> {
    if (this.initialized) return;
    
    // No need to register tools anymore - using simple text generation
    this.initialized = true;
  }

  /**
   * Interpret natural language and generate system command
   */
  static async interpret(naturalLanguage: string): Promise<CommandInterpretation> {
    await this.init();

    const direct = this.tryDirectInterpretation(naturalLanguage);
    if (direct) {
      return direct;
    }

    const systemPrompt = this.getSystemPrompt();
    const prompt = `${systemPrompt}\n\nUser command: "${naturalLanguage}"\n\nGenerate the system command and explanation in this exact format:\nCOMMAND: <the actual command>\nEXPLANATION: <what it does>\nCATEGORY: <category name>`;

    try {
      // Use simple text generation (much faster than tool calling)
      const result = await TextGeneration.generate(prompt, {
        systemPrompt: '',
        temperature: 0.3,
        maxTokens: 200,
      });

      // Parse the response
      const parsed = this.parseGeneratedResponse(result.text);
      
      if (parsed) {
        const safetyAnalysis = SafetyAnalyzer.analyzeCommand(parsed.systemCommand, parsed.category);
        
        return {
          systemCommand: parsed.systemCommand,
          explanation: parsed.explanation,
          category: parsed.category,
          safetyLevel: safetyAnalysis.level,
          confidence: 0.85,
          warnings: safetyAnalysis.warnings,
        };
      }

      // Fallback to pattern matching
      return this.fallbackInterpretation(naturalLanguage, result.text);
    } catch (error) {
      console.error('Command interpretation failed:', error);
      return this.fallbackInterpretation(
        naturalLanguage,
        `Error: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  static async refineExistingCommand(
    naturalLanguage: string,
    currentSystemCommand: string,
    refinement: string
  ): Promise<CommandInterpretation> {
    await this.init();

    const direct = this.tryDirectRefinement(naturalLanguage, currentSystemCommand, refinement);
    if (direct) {
      return direct;
    }

    const platform = this.detectPlatform();
    const prompt = `You are editing an existing ${platform} shell command.

Original intent: "${naturalLanguage}"
Current command: ${currentSystemCommand}
User refinement: ${refinement}

Modify the current command. Keep existing parameters, URLs, and output options unless the refinement explicitly changes them.
Never invent fake executables. Use real shell tools only.

Output ONLY in this format:
COMMAND: <the updated command>
EXPLANATION: <what changed and what it does>
CATEGORY: <file_operation|process_management|cleanup|compression|search|optimization|network|system_info>`;

    try {
      const result = await TextGeneration.generate(prompt, {
        systemPrompt: '',
        temperature: 0.2,
        maxTokens: 220,
      });

      const parsed = this.parseGeneratedResponse(result.text);
      if (parsed) {
        const safetyAnalysis = SafetyAnalyzer.analyzeCommand(parsed.systemCommand, parsed.category);
        return {
          systemCommand: parsed.systemCommand,
          explanation: parsed.explanation,
          category: parsed.category,
          safetyLevel: safetyAnalysis.level,
          confidence: 0.88,
          warnings: safetyAnalysis.warnings,
        };
      }
    } catch (error) {
      console.error('Command refinement failed:', error);
    }

    const safetyAnalysis = SafetyAnalyzer.analyzeCommand(currentSystemCommand, 'custom' as any);
    return {
      systemCommand: currentSystemCommand,
      explanation: 'Kept existing command because refinement could not be applied safely.',
      category: 'custom' as any,
      safetyLevel: safetyAnalysis.level,
      confidence: 0.2,
      warnings: safetyAnalysis.warnings,
    };
  }

  /**
   * Parse LLM response in expected format
   */
  private static parseGeneratedResponse(text: string): {
    systemCommand: string;
    explanation: string;
    category: CommandCategory;
  } | null {
    const commandMatch = text.match(/COMMAND:\s*(.+?)(?:\n|$)/i);
    const explanationMatch = text.match(/EXPLANATION:\s*(.+?)(?:\n|$)/i);
    const categoryMatch = text.match(/CATEGORY:\s*(.+?)(?:\n|$)/i);

    if (commandMatch && explanationMatch && categoryMatch) {
      return {
        systemCommand: commandMatch[1].trim(),
        explanation: explanationMatch[1].trim(),
        category: this.parseCategory(categoryMatch[1].trim()),
      };
    }

    // Try alternative parsing - look for command-like strings
    const lines = text.split('\n').map(l => l.trim()).filter(l => l);
    for (const line of lines) {
      // Look for shell command patterns
      if (line.match(/^(rm|ls|cd|kill|df|du|ps|grep|find|tar|zip|curl|wget|cat|echo|yt-dlp)/)) {
        return {
          systemCommand: line,
          explanation: 'Extracted command from LLM response',
          category: 'custom' as any,
        };
      }
    }

    return null;
  }

  /**
   * Get system prompt for command generation
   */
  private static getSystemPrompt(): string {
    const platform = this.detectPlatform();

    return `You are a command interpreter. Convert natural language to system commands for ${platform}.

RULES:
1. Output ONLY in this format:
COMMAND: <the command>
EXPLANATION: <what it does>
CATEGORY: <file_operation|process_management|cleanup|compression|search|optimization|network|system_info>

2. Be concise and accurate
3. Use safe, standard commands
4. No sudo unless necessary
5. Never invent fake executables. Use real shell tools only.
6. For YouTube downloads, use yt-dlp.
7. If the user wants a reusable command and did not provide the actual URL/path yet, use placeholders like <URL>, <OUTPUT>, <PATH>.

EXAMPLES:

Input: "clear my cache"
COMMAND: rm -rf ~/.cache/*
EXPLANATION: Removes all cache files
CATEGORY: cleanup

Input: "kill port 3000"
COMMAND: lsof -ti:3000 | xargs kill -9
EXPLANATION: Terminates process on port 3000
CATEGORY: process_management

Input: "show disk usage"
COMMAND: df -h
EXPLANATION: Displays disk space usage
CATEGORY: system_info`;
  }

  private static tryDirectInterpretation(naturalLanguage: string): CommandInterpretation | null {
    const lowerInput = naturalLanguage.toLowerCase();
    const wantsYoutubeDownload =
      /(youtube|youtu\.be|yt\b)/i.test(naturalLanguage) &&
      /(download|save|get|grab)/i.test(lowerInput);

    if (!wantsYoutubeDownload) {
      return null;
    }

    const url = this.extractUrl(naturalLanguage) || '<VIDEO_URL>';
    const wantsAudio = /(audio only|extract audio|mp3|music|sound only)/i.test(lowerInput);
    const wantsPlaylistOrChannel = /(playlist|channel)/i.test(lowerInput);
    const wantsBestQuality = /(best quality|highest quality|best video|full quality)/i.test(lowerInput);
    const wantsSubtitles = /(subtitle|subtitles|captions)/i.test(lowerInput);

    let systemCommand = 'yt-dlp ';

    if (wantsAudio) {
      systemCommand += '-x --audio-format mp3 ';
    } else if (wantsBestQuality) {
      systemCommand += '-f "bv*+ba/b" ';
    }

    if (wantsSubtitles) {
      systemCommand += '--write-auto-subs ';
    }

    if (wantsPlaylistOrChannel) {
      systemCommand += '--yes-playlist ';
    }

    systemCommand += `"${url}"`;

    const explanation = wantsAudio
      ? 'Download audio from YouTube using yt-dlp'
      : wantsPlaylistOrChannel
        ? 'Download videos from a YouTube playlist or channel using yt-dlp'
        : 'Download a YouTube video using yt-dlp';

    const category: CommandCategory = 'network' as any;
    const safetyAnalysis = SafetyAnalyzer.analyzeCommand(systemCommand, category);

    return {
      systemCommand,
      explanation,
      category,
      safetyLevel: safetyAnalysis.level,
      confidence: 0.98,
      warnings: safetyAnalysis.warnings,
    };
  }

  private static extractUrl(text: string): string | null {
    const urlMatch = text.match(/https?:\/\/[^\s"'<>]+/i);
    return urlMatch ? urlMatch[0] : null;
  }

  private static tryDirectRefinement(
    naturalLanguage: string,
    currentSystemCommand: string,
    refinement: string
  ): CommandInterpretation | null {
    const lowerRefinement = refinement.toLowerCase();
    const isYoutubeCommand = /^yt-dlp\b/.test(currentSystemCommand.trim()) || /(youtube|youtu\.be|yt\b)/i.test(naturalLanguage);

    if (!isYoutubeCommand) {
      return null;
    }

    let systemCommand = currentSystemCommand;

    if (/(audio only|only audio|extract audio|mp3|music|sound only)/i.test(lowerRefinement)) {
      systemCommand = systemCommand.replace(/\s+-x\b/g, '');
      systemCommand = systemCommand.replace(/\s+--audio-format\s+\S+/g, '');
      systemCommand = `yt-dlp -x --audio-format mp3 ${systemCommand.replace(/^yt-dlp\s+/, '')}`.trim();
    }

    if (/(video only|full video|normal video)/i.test(lowerRefinement)) {
      systemCommand = systemCommand.replace(/\s+-x\b/g, '');
      systemCommand = systemCommand.replace(/\s+--audio-format\s+\S+/g, '');
    }

    if (/(subtitle|subtitles|captions)/i.test(lowerRefinement) && !/--write-auto-subs\b/.test(systemCommand)) {
      systemCommand = `${systemCommand} --write-auto-subs`;
    }

    const newUrl = this.extractUrl(refinement);
    if (newUrl) {
      if (/https?:\/\//i.test(systemCommand)) {
        systemCommand = systemCommand.replace(/https?:\/\/[^\s"'<>]+/i, newUrl);
      } else if (/<[A-Z_\-]+URL>|<VIDEO_URL>|<CHANNEL_URL>|<PLAYLIST_URL>/i.test(systemCommand)) {
        systemCommand = systemCommand.replace(/<[A-Z_\-]+URL>|<VIDEO_URL>|<CHANNEL_URL>|<PLAYLIST_URL>/i, newUrl);
      }
    }

    const quotedOutput = refinement.match(/output(?: file| name)?\s+(?:as|to)?\s+["']([^"']+)["']/i);
    if (quotedOutput) {
      const output = quotedOutput[1];
      if (/(^|\s)-o\s+/.test(systemCommand)) {
        systemCommand = systemCommand.replace(/((?:^|\s)-o\s+)(?:"([^"]+)"|'([^']+)'|([^\s]+))/, `$1"${output}"`);
      } else {
        systemCommand = `${systemCommand} -o "${output}"`;
      }
    }

    const category: CommandCategory = 'network' as any;
    const safetyAnalysis = SafetyAnalyzer.analyzeCommand(systemCommand, category);

    return {
      systemCommand,
      explanation: `Refined existing yt-dlp command: ${refinement}`,
      category,
      safetyLevel: safetyAnalysis.level,
      confidence: 0.97,
      warnings: safetyAnalysis.warnings,
    };
  }

  /**
   * Fallback interpretation when tool calling fails
   */
  private static fallbackInterpretation(
    naturalLanguage: string,
    errorText: string
  ): CommandInterpretation {
    // Simple pattern matching as fallback
    const lowerInput = naturalLanguage.toLowerCase();

    let systemCommand = 'echo "Command interpretation failed"';
    let explanation = 'Unable to interpret command';
    let category: CommandCategory = 'custom' as any;

    // Basic pattern matching
    if (lowerInput.includes('clear cache') || lowerInput.includes('clean cache')) {
      systemCommand = 'rm -rf ~/.cache/*';
      explanation = 'Clear user cache directory';
      category = 'cleanup' as any;
    } else if ((/(youtube|youtu\.be|yt\b)/i.test(naturalLanguage)) && /(download|save|get|grab)/i.test(lowerInput)) {
      const url = this.extractUrl(naturalLanguage) || '<VIDEO_URL>';
      systemCommand = `yt-dlp "${url}"`;
      explanation = 'Download a YouTube video using yt-dlp';
      category = 'network' as any;
    } else if (lowerInput.includes('disk usage') || lowerInput.includes('disk space')) {
      systemCommand = 'df -h';
      explanation = 'Show disk space usage';
      category = 'system_info' as any;
    } else if (lowerInput.includes('kill port')) {
      const portMatch = lowerInput.match(/\d+/);
      const port = portMatch ? portMatch[0] : '3000';
      systemCommand = `lsof -ti:${port} | xargs kill -9`;
      explanation = `Kill process using port ${port}`;
      category = 'process_management' as any;
    }

    const safetyAnalysis = SafetyAnalyzer.analyzeCommand(systemCommand, category);

    return {
      systemCommand,
      explanation: `${explanation}\n\nNote: Fallback interpretation used. ${errorText}`,
      category,
      safetyLevel: safetyAnalysis.level,
      confidence: 0.3, // Low confidence for fallback
      warnings: safetyAnalysis.warnings,
    };
  }

  /**
   * Extract value from tool result
   */
  private static extractValue(obj: any): string {
    if (typeof obj === 'string') return obj;
    if (obj && typeof obj === 'object' && 'value' in obj) {
      return String(obj.value);
    }
    return String(obj);
  }

  /**
   * Parse category string to CommandCategory enum
   */
  private static parseCategory(categoryStr: string): CommandCategory {
    const normalized = categoryStr.toLowerCase().replace(/-/g, '_');
    
    const categoryMap: Record<string, CommandCategory> = {
      file_operation: 'file_operation' as any,
      process_management: 'process_management' as any,
      cleanup: 'cleanup' as any,
      compression: 'compression' as any,
      search: 'search' as any,
      optimization: 'optimization' as any,
      network: 'network' as any,
      system_info: 'system_info' as any,
    };

    return categoryMap[normalized] || ('custom' as any);
  }

  /**
   * Detect current platform
   */
  private static detectPlatform(): string {
    const ua = navigator.userAgent.toLowerCase();
    
    if (ua.includes('mac')) return 'macOS';
    if (ua.includes('win')) return 'Windows';
    if (ua.includes('linux')) return 'Linux';
    
    return 'Unix';
  }

  /**
   * Get available commands for platform
   */
  private static getAvailableCommands(platform: string): string[] {
    const commonCommands = [
      'ls', 'cd', 'pwd', 'cat', 'echo', 'grep', 'find',
      'tar', 'gzip', 'zip', 'unzip',
      'ps', 'kill', 'killall', 'top',
      'df', 'du', 'free',
      'curl', 'wget',
    ];

    if (platform === 'macOS') {
      return [...commonCommands, 'open', 'pbcopy', 'pbpaste', 'say', 'osascript'];
    }

    if (platform === 'Linux') {
      return [...commonCommands, 'apt', 'yum', 'systemctl', 'journalctl'];
    }

    if (platform === 'Windows') {
      return ['dir', 'cd', 'del', 'copy', 'move', 'type', 'taskkill', 'netstat'];
    }

    return commonCommands;
  }

  /**
   * Generate N alternative command variants for the same intent.
   * Returns an array of (systemCommand, explanation) pairs.
   */
  static async getVariants(
    naturalLanguage: string,
    count = 3
  ): Promise<Array<{ systemCommand: string; explanation: string }>> {
    await this.init();

    const directVariants = this.tryDirectVariants(naturalLanguage);
    if (directVariants) {
      return directVariants.slice(0, count);
    }

    const platform = this.detectPlatform();
    const prompt = `You are a shell expert on ${platform}. Give ${count} DIFFERENT ways to accomplish:
"${naturalLanguage}"

Use different tools or approaches for each variant.
Output exactly ${count} entries with no extra text:

VARIANT1_COMMAND: <command>
VARIANT1_EXPLANATION: <short explanation>
VARIANT2_COMMAND: <command>
VARIANT2_EXPLANATION: <short explanation>
VARIANT3_COMMAND: <command>
VARIANT3_EXPLANATION: <short explanation>`;

    try {
      const result = await TextGeneration.generate(prompt, {
        systemPrompt: '',
        temperature: 0.5,
        maxTokens: 400,
      });

      const variants: Array<{ systemCommand: string; explanation: string }> = [];
      const text = result.text;

      for (let i = 1; i <= count; i++) {
        const cmdMatch = text.match(new RegExp(`VARIANT${i}_COMMAND:\\s*(.+?)(?:\\n|$)`, 'i'));
        const expMatch = text.match(new RegExp(`VARIANT${i}_EXPLANATION:\\s*(.+?)(?:\\n|$)`, 'i'));
        if (cmdMatch) {
          variants.push({
            systemCommand: cmdMatch[1].trim(),
            explanation: expMatch ? expMatch[1].trim() : '',
          });
        }
      }

      return variants;
    } catch {
      return [];
    }
  }

  private static tryDirectVariants(
    naturalLanguage: string
  ): Array<{ systemCommand: string; explanation: string }> | null {
    const lowerInput = naturalLanguage.toLowerCase();
    const wantsYoutubeDownload =
      /(youtube|youtu\.be|yt\b)/i.test(naturalLanguage) &&
      /(download|save|get|grab)/i.test(lowerInput);

    if (!wantsYoutubeDownload) {
      return null;
    }

    const url = this.extractUrl(naturalLanguage) || '<VIDEO_URL>';

    return [
      {
        systemCommand: `yt-dlp "${url}"`,
        explanation: 'Basic YouTube download command',
      },
      {
        systemCommand: `yt-dlp -f "bestvideo+bestaudio" --merge-output-format mp4 "${url}"`,
        explanation: 'Download in best quality with video and audio merged into mp4',
      },
      {
        systemCommand: `yt-dlp -x --audio-format mp3 "${url}"`,
        explanation: 'Download only audio as mp3',
      },
      {
        systemCommand: `yt-dlp -F "${url}"`,
        explanation: 'List all available formats before choosing one manually',
      },
      {
        systemCommand: `yt-dlp -f <FORMAT_CODE> "${url}"`,
        explanation: 'Download a specific format after checking the format list, for example 137+140',
      },
      {
        systemCommand: `yt-dlp -o "%(title)s.%(ext)s" "${url}"`,
        explanation: 'Save the file automatically using the video title',
      },
    ];
  }

  /**
   * Clean up resources
   */
  static cleanup(): void {
    this.initialized = false;
  }
}
