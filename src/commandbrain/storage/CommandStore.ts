/**
 * CommandStore - IndexedDB storage layer for CommandBrain
 * 
 * Handles persistent storage of:
 * - Command history
 * - Macros
 * - Learned patterns
 * - Favorite commands
 * - Configuration
 */

import type { Command, Macro, CommandPattern, CommandBrainConfig, StorageStats, FavoriteCommand } from '../types';

const DB_NAME = 'CommandBrainDB';
const DB_VERSION = 2; // Incremented for favorites support

const STORES = {
  COMMANDS: 'commands',
  MACROS: 'macros',
  PATTERNS: 'patterns',
  FAVORITES: 'favorites',
  CONFIG: 'config',
} as const;

export class CommandStore {
  private db: IDBDatabase | null = null;
  private initPromise: Promise<void> | null = null;

  /**
   * Initialize the IndexedDB database
   */
  async init(): Promise<void> {
    if (this.initPromise) return this.initPromise;

    this.initPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => reject(new Error('Failed to open IndexedDB'));

      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;

        // Commands store
        if (!db.objectStoreNames.contains(STORES.COMMANDS)) {
          const commandStore = db.createObjectStore(STORES.COMMANDS, { keyPath: 'id' });
          commandStore.createIndex('naturalLanguage', 'naturalLanguage', { unique: false });
          commandStore.createIndex('category', 'category', { unique: false });
          commandStore.createIndex('createdAt', 'createdAt', { unique: false });
          commandStore.createIndex('executedAt', 'executedAt', { unique: false });
          commandStore.createIndex('executionCount', 'executionCount', { unique: false });
        }

        // Macros store
        if (!db.objectStoreNames.contains(STORES.MACROS)) {
          const macroStore = db.createObjectStore(STORES.MACROS, { keyPath: 'id' });
          macroStore.createIndex('name', 'name', { unique: true });
          macroStore.createIndex('trigger', 'trigger', { unique: false });
          macroStore.createIndex('executionCount', 'executionCount', { unique: false });
        }

        // Patterns store
        if (!db.objectStoreNames.contains(STORES.PATTERNS)) {
          const patternStore = db.createObjectStore(STORES.PATTERNS, { keyPath: 'id' });
          patternStore.createIndex('pattern', 'pattern', { unique: false });
          patternStore.createIndex('frequency', 'frequency', { unique: false });
          patternStore.createIndex('lastUsed', 'lastUsed', { unique: false });
        }

        // Favorites store (new in v2)
        if (!db.objectStoreNames.contains(STORES.FAVORITES)) {
          const favoritesStore = db.createObjectStore(STORES.FAVORITES, { keyPath: 'id' });
          favoritesStore.createIndex('naturalLanguage', 'naturalLanguage', { unique: false });
          favoritesStore.createIndex('category', 'category', { unique: false });
          favoritesStore.createIndex('usageCount', 'usageCount', { unique: false });
          favoritesStore.createIndex('lastUsed', 'lastUsed', { unique: false });
          favoritesStore.createIndex('createdAt', 'createdAt', { unique: false });
        }

        // Config store
        if (!db.objectStoreNames.contains(STORES.CONFIG)) {
          db.createObjectStore(STORES.CONFIG, { keyPath: 'key' });
        }
      };
    });

    return this.initPromise;
  }

  // =========================================================================
  // Command Operations
  // =========================================================================

  async saveCommand(command: Command): Promise<void> {
    await this.init();
    const tx = this.db!.transaction(STORES.COMMANDS, 'readwrite');
    const store = tx.objectStore(STORES.COMMANDS);
    store.put(command);
    await this.waitForTransaction(tx);
  }

  async getCommand(id: string): Promise<Command | null> {
    await this.init();
    const tx = this.db!.transaction(STORES.COMMANDS, 'readonly');
    const store = tx.objectStore(STORES.COMMANDS);
    return new Promise((resolve, reject) => {
      const request = store.get(id);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  }

  async getAllCommands(limit?: number): Promise<Command[]> {
    await this.init();
    const tx = this.db!.transaction(STORES.COMMANDS, 'readonly');
    const store = tx.objectStore(STORES.COMMANDS);
    const index = store.index('createdAt');
    
    return new Promise((resolve, reject) => {
      const request = index.openCursor(null, 'prev'); // Most recent first
      const commands: Command[] = [];
      
      request.onsuccess = () => {
        const cursor = request.result;
        if (cursor && (!limit || commands.length < limit)) {
          commands.push(cursor.value);
          cursor.continue();
        } else {
          resolve(commands);
        }
      };
      request.onerror = () => reject(request.error);
    });
  }

  async getRecentCommands(limit: number = 20): Promise<Command[]> {
    return this.getAllCommands(limit);
  }

  async getFrequentCommands(limit: number = 10): Promise<Command[]> {
    await this.init();
    const tx = this.db!.transaction(STORES.COMMANDS, 'readonly');
    const store = tx.objectStore(STORES.COMMANDS);
    const index = store.index('executionCount');
    
    return new Promise((resolve, reject) => {
      const request = index.openCursor(null, 'prev'); // Highest execution count first
      const commands: Command[] = [];
      
      request.onsuccess = () => {
        const cursor = request.result;
        if (cursor && commands.length < limit) {
          commands.push(cursor.value);
          cursor.continue();
        } else {
          resolve(commands);
        }
      };
      request.onerror = () => reject(request.error);
    });
  }

  async searchCommands(query: string): Promise<Command[]> {
    const allCommands = await this.getAllCommands();
    const lowerQuery = query.toLowerCase();
    return allCommands.filter(
      (cmd) =>
        cmd.naturalLanguage.toLowerCase().includes(lowerQuery) ||
        cmd.systemCommand.toLowerCase().includes(lowerQuery) ||
        cmd.explanation.toLowerCase().includes(lowerQuery)
    );
  }

  async deleteCommand(id: string): Promise<void> {
    await this.init();
    const tx = this.db!.transaction(STORES.COMMANDS, 'readwrite');
    const store = tx.objectStore(STORES.COMMANDS);
    store.delete(id);
    await this.waitForTransaction(tx);
  }

  async clearOldCommands(maxAge: number): Promise<number> {
    const cutoffTime = Date.now() - maxAge;
    const allCommands = await this.getAllCommands();
    const toDelete = allCommands.filter((cmd) => cmd.createdAt < cutoffTime);
    
    await this.init();
    const tx = this.db!.transaction(STORES.COMMANDS, 'readwrite');
    const store = tx.objectStore(STORES.COMMANDS);
    
    for (const cmd of toDelete) {
      store.delete(cmd.id);
    }
    
    await this.waitForTransaction(tx);
    return toDelete.length;
  }

  // =========================================================================
  // Macro Operations
  // =========================================================================

  async saveMacro(macro: Macro): Promise<void> {
    await this.init();
    const tx = this.db!.transaction(STORES.MACROS, 'readwrite');
    const store = tx.objectStore(STORES.MACROS);
    store.put(macro);
    await this.waitForTransaction(tx);
  }

  async getMacro(id: string): Promise<Macro | null> {
    await this.init();
    const tx = this.db!.transaction(STORES.MACROS, 'readonly');
    const store = tx.objectStore(STORES.MACROS);
    return new Promise((resolve, reject) => {
      const request = store.get(id);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  }

  async getMacroByName(name: string): Promise<Macro | null> {
    await this.init();
    const tx = this.db!.transaction(STORES.MACROS, 'readonly');
    const store = tx.objectStore(STORES.MACROS);
    const index = store.index('name');
    
    return new Promise((resolve, reject) => {
      const request = index.get(name);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  }

  async getAllMacros(): Promise<Macro[]> {
    await this.init();
    const tx = this.db!.transaction(STORES.MACROS, 'readonly');
    const store = tx.objectStore(STORES.MACROS);
    
    return new Promise((resolve, reject) => {
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async deleteMacro(id: string): Promise<void> {
    await this.init();
    const tx = this.db!.transaction(STORES.MACROS, 'readwrite');
    const store = tx.objectStore(STORES.MACROS);
    store.delete(id);
    await this.waitForTransaction(tx);
  }

  // =========================================================================
  // Pattern Operations
  // =========================================================================

  async savePattern(pattern: CommandPattern): Promise<void> {
    await this.init();
    const tx = this.db!.transaction(STORES.PATTERNS, 'readwrite');
    const store = tx.objectStore(STORES.PATTERNS);
    store.put(pattern);
    await this.waitForTransaction(tx);
  }

  async getPattern(id: string): Promise<CommandPattern | null> {
    await this.init();
    const tx = this.db!.transaction(STORES.PATTERNS, 'readonly');
    const store = tx.objectStore(STORES.PATTERNS);
    return new Promise((resolve, reject) => {
      const request = store.get(id);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  }

  async getAllPatterns(): Promise<CommandPattern[]> {
    await this.init();
    const tx = this.db!.transaction(STORES.PATTERNS, 'readonly');
    const store = tx.objectStore(STORES.PATTERNS);
    
    return new Promise((resolve, reject) => {
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async getFrequentPatterns(limit: number = 10): Promise<CommandPattern[]> {
    await this.init();
    const tx = this.db!.transaction(STORES.PATTERNS, 'readonly');
    const store = tx.objectStore(STORES.PATTERNS);
    const index = store.index('frequency');
    
    return new Promise((resolve, reject) => {
      const request = index.openCursor(null, 'prev'); // Highest frequency first
      const patterns: CommandPattern[] = [];
      
      request.onsuccess = () => {
        const cursor = request.result;
        if (cursor && patterns.length < limit) {
          patterns.push(cursor.value);
          cursor.continue();
        } else {
          resolve(patterns);
        }
      };
      request.onerror = () => reject(request.error);
    });
  }

  async deletePattern(id: string): Promise<void> {
    await this.init();
    const tx = this.db!.transaction(STORES.PATTERNS, 'readwrite');
    const store = tx.objectStore(STORES.PATTERNS);
    store.delete(id);
    await this.waitForTransaction(tx);
  }

  // =========================================================================
  // Favorite Operations
  // =========================================================================

  async saveFavorite(favorite: FavoriteCommand): Promise<void> {
    await this.init();
    const tx = this.db!.transaction(STORES.FAVORITES, 'readwrite');
    const store = tx.objectStore(STORES.FAVORITES);
    store.put(favorite);
    await this.waitForTransaction(tx);
  }

  async getFavorite(id: string): Promise<FavoriteCommand | null> {
    await this.init();
    const tx = this.db!.transaction(STORES.FAVORITES, 'readonly');
    const store = tx.objectStore(STORES.FAVORITES);
    return new Promise((resolve, reject) => {
      const request = store.get(id);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  }

  async getAllFavorites(): Promise<FavoriteCommand[]> {
    await this.init();
    const tx = this.db!.transaction(STORES.FAVORITES, 'readonly');
    const store = tx.objectStore(STORES.FAVORITES);
    const index = store.index('createdAt');
    
    return new Promise((resolve, reject) => {
      const request = index.openCursor(null, 'prev'); // Most recent first
      const favorites: FavoriteCommand[] = [];
      
      request.onsuccess = () => {
        const cursor = request.result;
        if (cursor) {
          favorites.push(cursor.value);
          cursor.continue();
        } else {
          resolve(favorites);
        }
      };
      request.onerror = () => reject(request.error);
    });
  }

  async getFrequentFavorites(limit: number = 10): Promise<FavoriteCommand[]> {
    await this.init();
    const tx = this.db!.transaction(STORES.FAVORITES, 'readonly');
    const store = tx.objectStore(STORES.FAVORITES);
    const index = store.index('usageCount');
    
    return new Promise((resolve, reject) => {
      const request = index.openCursor(null, 'prev'); // Highest usage first
      const favorites: FavoriteCommand[] = [];
      
      request.onsuccess = () => {
        const cursor = request.result;
        if (cursor && favorites.length < limit) {
          favorites.push(cursor.value);
          cursor.continue();
        } else {
          resolve(favorites);
        }
      };
      request.onerror = () => reject(request.error);
    });
  }

  async checkIsFavorite(naturalLanguage: string, systemCommand: string): Promise<FavoriteCommand | null> {
    await this.init();
    const favorites = await this.getAllFavorites();
    return favorites.find(
      f => f.naturalLanguage === naturalLanguage || f.systemCommand === systemCommand
    ) || null;
  }

  async deleteFavorite(id: string): Promise<void> {
    await this.init();
    const tx = this.db!.transaction(STORES.FAVORITES, 'readwrite');
    const store = tx.objectStore(STORES.FAVORITES);
    store.delete(id);
    await this.waitForTransaction(tx);
  }

  // =========================================================================
  // Configuration Operations
  // =========================================================================

  async getConfig(): Promise<CommandBrainConfig> {
    await this.init();
    const tx = this.db!.transaction(STORES.CONFIG, 'readonly');
    const store = tx.objectStore(STORES.CONFIG);
    
    return new Promise((resolve, reject) => {
      const request = store.get('config');
      request.onsuccess = () => {
        const result = request.result;
        resolve(result?.value || this.getDefaultConfig());
      };
      request.onerror = () => reject(request.error);
    });
  }

  async saveConfig(config: CommandBrainConfig): Promise<void> {
    await this.init();
    const tx = this.db!.transaction(STORES.CONFIG, 'readwrite');
    const store = tx.objectStore(STORES.CONFIG);
    store.put({ key: 'config', value: config });
    await this.waitForTransaction(tx);
  }

  private getDefaultConfig(): CommandBrainConfig {
    return {
      enableVoice: false,
      enableTTS: false,
      autoExecuteSafe: false,
      enableLearning: true,
      enableSuggestions: true,
      maxHistorySize: 1000,
      maxPatternSize: 500,
    };
  }

  // =========================================================================
  // Statistics & Maintenance
  // =========================================================================

  async getStats(): Promise<StorageStats> {
    await this.init();
    
    const [commands, macros, patterns, favorites] = await Promise.all([
      this.getAllCommands(),
      this.getAllMacros(),
      this.getAllPatterns(),
      this.getAllFavorites(),
    ]);
    
    // Estimate storage size (rough approximation)
    const storageSize = 
      JSON.stringify(commands).length +
      JSON.stringify(macros).length +
      JSON.stringify(patterns).length +
      JSON.stringify(favorites).length;
    
    return {
      totalCommands: commands.length,
      totalMacros: macros.length,
      totalPatterns: patterns.length,
      totalFavorites: favorites.length,
      storageSize,
    };
  }

  async clearAll(): Promise<void> {
    await this.init();
    const tx = this.db!.transaction(
      [STORES.COMMANDS, STORES.MACROS, STORES.PATTERNS, STORES.FAVORITES, STORES.CONFIG],
      'readwrite'
    );
    
    tx.objectStore(STORES.COMMANDS).clear();
    tx.objectStore(STORES.MACROS).clear();
    tx.objectStore(STORES.PATTERNS).clear();
    tx.objectStore(STORES.FAVORITES).clear();
    tx.objectStore(STORES.CONFIG).clear();
    
    await this.waitForTransaction(tx);
  }

  async exportData(): Promise<string> {
    await this.init();
    
    const [commands, macros, patterns, favorites, config] = await Promise.all([
      this.getAllCommands(),
      this.getAllMacros(),
      this.getAllPatterns(),
      this.getAllFavorites(),
      this.getConfig(),
    ]);
    
    return JSON.stringify({
      version: 2,
      exportedAt: Date.now(),
      commands,
      macros,
      patterns,
      favorites,
      config,
    }, null, 2);
  }

  async importData(jsonData: string): Promise<void> {
    await this.init();
    const data = JSON.parse(jsonData);
    
    const tx = this.db!.transaction(
      [STORES.COMMANDS, STORES.MACROS, STORES.PATTERNS, STORES.FAVORITES, STORES.CONFIG],
      'readwrite'
    );
    
    // Import commands
    if (data.commands) {
      const commandStore = tx.objectStore(STORES.COMMANDS);
      for (const cmd of data.commands) {
        commandStore.put(cmd);
      }
    }
    
    // Import macros
    if (data.macros) {
      const macroStore = tx.objectStore(STORES.MACROS);
      for (const macro of data.macros) {
        macroStore.put(macro);
      }
    }
    
    // Import patterns
    if (data.patterns) {
      const patternStore = tx.objectStore(STORES.PATTERNS);
      for (const pattern of data.patterns) {
        patternStore.put(pattern);
      }
    }
    
    // Import favorites
    if (data.favorites) {
      const favoritesStore = tx.objectStore(STORES.FAVORITES);
      for (const favorite of data.favorites) {
        favoritesStore.put(favorite);
      }
    }
    
    // Import config
    if (data.config) {
      const configStore = tx.objectStore(STORES.CONFIG);
      configStore.put({ key: 'config', value: data.config });
    }
    
    await this.waitForTransaction(tx);
  }

  // =========================================================================
  // Helper Methods
  // =========================================================================

  private waitForTransaction(tx: IDBTransaction): Promise<void> {
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(new Error('Transaction aborted'));
    });
  }

  async close(): Promise<void> {
    if (this.db) {
      this.db.close();
      this.db = null;
      this.initPromise = null;
    }
  }
}

// Singleton instance
export const commandStore = new CommandStore();
