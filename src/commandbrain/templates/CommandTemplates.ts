/**
 * CommandTemplates - Pre-defined and custom command templates
 */

export interface CommandTemplate {
  id: string;
  name: string;
  description: string;
  naturalLanguage: string;
  category: string;
  tags: string[];
  isBuiltIn: boolean;
}

export const BUILTIN_TEMPLATES: CommandTemplate[] = [
  // System Information
  {
    id: 'disk-usage',
    name: 'Disk Usage',
    description: 'Show disk space usage',
    naturalLanguage: 'show disk usage',
    category: 'System Info',
    tags: ['disk', 'storage', 'space'],
    isBuiltIn: true,
  },
  {
    id: 'memory-usage',
    name: 'Memory Usage',
    description: 'Check RAM usage',
    naturalLanguage: 'show memory usage',
    category: 'System Info',
    tags: ['memory', 'ram'],
    isBuiltIn: true,
  },
  {
    id: 'list-processes',
    name: 'List Processes',
    description: 'Show running processes',
    naturalLanguage: 'list running processes',
    category: 'System Info',
    tags: ['processes', 'ps'],
    isBuiltIn: true,
  },
  
  // Cleanup
  {
    id: 'clear-cache',
    name: 'Clear Cache',
    description: 'Clear system cache',
    naturalLanguage: 'clear my cache',
    category: 'Cleanup',
    tags: ['cache', 'clean'],
    isBuiltIn: true,
  },
  {
    id: 'delete-temp',
    name: 'Delete Temp Files',
    description: 'Remove temporary files',
    naturalLanguage: 'delete temp files',
    category: 'Cleanup',
    tags: ['temp', 'clean'],
    isBuiltIn: true,
  },
  {
    id: 'clean-logs',
    name: 'Clean Old Logs',
    description: 'Remove old log files',
    naturalLanguage: 'delete old log files',
    category: 'Cleanup',
    tags: ['logs', 'clean'],
    isBuiltIn: true,
  },
  
  // Process Management
  {
    id: 'kill-port-3000',
    name: 'Kill Port 3000',
    description: 'Terminate process on port 3000',
    naturalLanguage: 'kill port 3000',
    category: 'Process',
    tags: ['kill', 'port', 'process'],
    isBuiltIn: true,
  },
  {
    id: 'kill-port-8080',
    name: 'Kill Port 8080',
    description: 'Terminate process on port 8080',
    naturalLanguage: 'kill port 8080',
    category: 'Process',
    tags: ['kill', 'port', 'process'],
    isBuiltIn: true,
  },
  
  // File Operations
  {
    id: 'compress-folder',
    name: 'Compress Folder',
    description: 'Create tar.gz archive',
    naturalLanguage: 'compress the current folder',
    category: 'Files',
    tags: ['compress', 'archive', 'tar'],
    isBuiltIn: true,
  },
  {
    id: 'find-large-files',
    name: 'Find Large Files',
    description: 'Find files larger than 100MB',
    naturalLanguage: 'find large files',
    category: 'Files',
    tags: ['find', 'large', 'disk'],
    isBuiltIn: true,
  },
];

export class CommandTemplatesManager {
  private static CUSTOM_TEMPLATES_KEY = 'commandbrain_custom_templates';
  
  /**
   * Get all templates (built-in + custom)
   */
  static getAll(): CommandTemplate[] {
    const custom = this.getCustomTemplates();
    return [...BUILTIN_TEMPLATES, ...custom];
  }
  
  /**
   * Get templates by category
   */
  static getByCategory(category: string): CommandTemplate[] {
    return this.getAll().filter(t => t.category === category);
  }
  
  /**
   * Search templates
   */
  static search(query: string): CommandTemplate[] {
    const lowerQuery = query.toLowerCase();
    return this.getAll().filter(t =>
      t.name.toLowerCase().includes(lowerQuery) ||
      t.description.toLowerCase().includes(lowerQuery) ||
      t.naturalLanguage.toLowerCase().includes(lowerQuery) ||
      t.tags.some(tag => tag.toLowerCase().includes(lowerQuery))
    );
  }
  
  /**
   * Get custom templates from localStorage
   */
  static getCustomTemplates(): CommandTemplate[] {
    try {
      const stored = localStorage.getItem(this.CUSTOM_TEMPLATES_KEY);
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  }
  
  /**
   * Save a custom template
   */
  static saveCustomTemplate(template: Omit<CommandTemplate, 'id' | 'isBuiltIn'>): CommandTemplate {
    const custom = this.getCustomTemplates();
    const newTemplate: CommandTemplate = {
      ...template,
      id: `custom_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
      isBuiltIn: false,
    };
    
    custom.push(newTemplate);
    localStorage.setItem(this.CUSTOM_TEMPLATES_KEY, JSON.stringify(custom));
    
    return newTemplate;
  }
  
  /**
   * Delete a custom template
   */
  static deleteCustomTemplate(id: string): boolean {
    const custom = this.getCustomTemplates();
    const filtered = custom.filter(t => t.id !== id);
    
    if (filtered.length === custom.length) {
      return false; // Template not found or is built-in
    }
    
    localStorage.setItem(this.CUSTOM_TEMPLATES_KEY, JSON.stringify(filtered));
    return true;
  }
  
  /**
   * Get all categories
   */
  static getCategories(): string[] {
    const categories = new Set(this.getAll().map(t => t.category));
    return Array.from(categories).sort();
  }
}
