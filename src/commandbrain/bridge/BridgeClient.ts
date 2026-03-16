/**
 * BridgeClient - Client for communication with execution bridge server
 * 
 * Handles real command execution when bridge is available and configured.
 */

import type { ExecutionResult } from '../types';
import { SafetyLevel } from '../types';

interface BridgeConfig {
  enabled: boolean;
  url: string;
  authToken: string;
}

export class BridgeClient {
  private static config: BridgeConfig = {
    enabled: false,
    url: 'http://localhost:3001',
    authToken: '',
  };

  /**
   * Configure bridge connection
   */
  static configure(config: Partial<BridgeConfig>): void {
    this.config = { ...this.config, ...config };
    
    // Save to localStorage
    if (typeof window !== 'undefined') {
      localStorage.setItem('commandbrain_bridge_config', JSON.stringify(this.config));
    }
  }

  /**
   * Load bridge configuration from localStorage
   */
  static loadConfig(): BridgeConfig {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('commandbrain_bridge_config');
      if (saved) {
        try {
          this.config = JSON.parse(saved);
        } catch (e) {
          console.error('Failed to load bridge config:', e);
        }
      }
    }
    return this.config;
  }

  /**
   * Get current configuration
   */
  static getConfig(): BridgeConfig {
    return { ...this.config };
  }

  /**
   * Test bridge connection
   */
  static async testConnection(): Promise<{ success: boolean; message: string }> {
    if (!this.config.enabled) {
      return { success: false, message: 'Bridge not enabled' };
    }

    try {
      const response = await fetch(`${this.config.url}/health`, {
        method: 'GET',
        signal: AbortSignal.timeout(5000),
      });

      if (response.ok) {
        const data = await response.json();
        return { success: true, message: data.message || 'Connection successful' };
      } else {
        return { success: false, message: `Server responded with ${response.status}` };
      }
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Connection failed',
      };
    }
  }

  /**
   * Get auth key from bridge server
   */
  static async getAuthKey(): Promise<{ success: boolean; key?: string; error?: string }> {
    try {
      const response = await fetch(`${this.config.url}/key`, {
        method: 'GET',
        signal: AbortSignal.timeout(5000),
      });

      if (response.ok) {
        const data = await response.json();
        return { success: true, key: data.key };
      } else {
        return { success: false, error: `Server responded with ${response.status}` };
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get auth key',
      };
    }
  }

  /**
   * Execute command via bridge
   */
  static async executeCommand(
    command: string,
    safetyLevel: SafetyLevel
  ): Promise<ExecutionResult> {
    if (!this.config.enabled) {
      return {
        success: false,
        error: 'Bridge execution is not enabled',
        duration: 0,
      };
    }

    if (!this.config.authToken) {
      return {
        success: false,
        error: 'Bridge authentication token not configured',
        duration: 0,
      };
    }

    const startTime = Date.now();

    try {
      const response = await fetch(`${this.config.url}/execute`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.config.authToken}`,
        },
        body: JSON.stringify({
          command,
          safetyLevel,
        }),
        signal: AbortSignal.timeout(35000), // 35s timeout (server has 30s)
      });

      const data = await response.json();

      if (response.ok) {
        return {
          success: data.success,
          stdout: data.stdout,
          stderr: data.stderr,
          exitCode: data.exitCode,
          duration: data.duration || (Date.now() - startTime),
          error: data.error,
        };
      } else {
        return {
          success: false,
          error: data.error || data.reason || `Bridge error: ${response.status}`,
          duration: Date.now() - startTime,
        };
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Bridge communication failed',
        duration: Date.now() - startTime,
      };
    }
  }

  /**
   * Check if bridge is available and configured
   */
  static isAvailable(): boolean {
    return this.config.enabled && this.config.authToken.length > 0;
  }
}

// Initialize on load
if (typeof window !== 'undefined') {
  BridgeClient.loadConfig();
}
