/**
 * CommandBrainTab - Main UI component for CommandBrain
 * 
 * Provides interface for:
 * - Natural language command input
 * - Command preview and safety warnings
 * - Command history
 * - Quick actions and suggestions
 * - Macro management
 */

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { ModelCategory } from '@runanywhere/web';
import { useModelLoader, getModelCacheInfo, clearModelCacheInfo } from '../hooks/useModelLoader';
import { ModelBanner } from './ModelBanner';
import { CommandBrain } from '../commandbrain/CommandBrain';
import { CommandTemplatesManager } from '../commandbrain/templates/CommandTemplates';
import type { CommandPreview, Command, CommandSuggestion, Macro, ExecutionResult, FavoriteCommand } from '../commandbrain/types';
import { SafetyLevel } from '../commandbrain/types';

type View = 'main' | 'history' | 'macros' | 'templates' | 'favorites' | 'analytics' | 'settings';

export function CommandBrainTab() {
  const loader = useModelLoader(ModelCategory.Language);
  type NoticeKind = 'success' | 'error' | 'info';
  type MacroStepProgress = {
    command: string;
    status: 'pending' | 'running' | 'success' | 'error';
    result?: ExecutionResult;
  };
  
  // State
  const [view, setView] = useState<View>('main');
  const [input, setInput] = useState('');
  const [processing, setProcessing] = useState(false);
  const [processingStage, setProcessingStage] = useState('');
  const [preview, setPreview] = useState<CommandPreview | null>(null);
  const [executionResult, setExecutionResult] = useState<ExecutionResult | null>(null);
  const [suggestions, setSuggestions] = useState<CommandSuggestion[]>([]);
  const [history, setHistory] = useState<Command[]>([]);
  const [macros, setMacros] = useState<Macro[]>([]);
  const [favorites, setFavorites] = useState<FavoriteCommand[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [bridgeConfig, setBridgeConfig] = useState<any>(null);
  const [bridgeStatus, setBridgeStatus] = useState<'unknown' | 'connected' | 'disconnected'>('unknown');
  const [executionMode, setExecutionMode] = useState<'simulate' | 'real'>('simulate');
  const [templateSearch, setTemplateSearch] = useState('');
  const [templateCategory, setTemplateCategory] = useState('All');
  const [analyticsCategoryFilter, setAnalyticsCategoryFilter] = useState<string>('All');
  const [analyticsSafetyFilter, setAnalyticsSafetyFilter] = useState<string>('All');
  const [runningCommandId, setRunningCommandId] = useState<string | null>(null);
  const [dismissedReminderKey, setDismissedReminderKey] = useState<string>('');
  const [reminderSnoozeMap, setReminderSnoozeMap] = useState<Record<string, number>>(() => {
    try {
      const raw = localStorage.getItem('commandbrain_reminder_snooze_map');
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  });
  const [savedFolderFilter, setSavedFolderFilter] = useState('All');
  const [savedSearch, setSavedSearch] = useState('');
  const [bridgeDiagnostics, setBridgeDiagnostics] = useState({
    lastCheckAt: 0,
    lastLatencyMs: 0,
    lastMessage: 'Not checked yet',
    lastExecutionAt: 0,
    lastExecutionSuccess: null as boolean | null,
    lastExecutionDuration: 0,
    lastExecutionError: '',
  });
  const [cacheHealth, setCacheHealth] = useState({
    exists: false,
    modelName: '',
    lastLoadedAt: 0,
    metadataSizeBytes: 0,
  });
  const [macroRunSummary, setMacroRunSummary] = useState<{
    macroName: string;
    commands: string[];
    results: ExecutionResult[];
    runAt: number;
  } | null>(null);
  const [macroRunProgress, setMacroRunProgress] = useState<{
    macroName: string;
    startedAt: number;
    steps: MacroStepProgress[];
  } | null>(null);
  const [copyNotice, setCopyNotice] = useState<{ kind: NoticeKind; message: string } | null>(null);
  const [macroFormOpen, setMacroFormOpen] = useState(false);
  const [macroFormName, setMacroFormName] = useState('');
  const [macroFormDescription, setMacroFormDescription] = useState('Batch execution macro');
  const [macroFormTrigger, setMacroFormTrigger] = useState('');
  const [macroFormCommands, setMacroFormCommands] = useState('');
  const [macroFormError, setMacroFormError] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Global search
  const [globalQuery, setGlobalQuery] = useState('');
  const [showGlobalSearch, setShowGlobalSearch] = useState(false);
  const globalSearchRef = useRef<HTMLDivElement>(null);

  // Bulk history selection
  const [selectedHistoryIds, setSelectedHistoryIds] = useState<Set<string>>(new Set());

  // Editable params in preview
  const [paramValues, setParamValues] = useState<Record<string, string>>({});

  // Variants panel
  const [variants, setVariants] = useState<Array<{ systemCommand: string; explanation: string }>>([]);
  const [loadingVariants, setLoadingVariants] = useState(false);

  // Follow-up refinement
  const [refinementInput, setRefinementInput] = useState('');
  const [refinementProcessing, setRefinementProcessing] = useState(false);
  
  const inputRef = useRef<HTMLInputElement>(null);
  const noticeTimeoutRef = useRef<number | null>(null);

  // Initialize CommandBrain and load suggestions
  useEffect(() => {
    CommandBrain.init().catch(console.error);
    loadSuggestions();
    const savedMode = localStorage.getItem('commandbrain_execution_mode');
    if (savedMode === 'real' || savedMode === 'simulate') {
      setExecutionMode(savedMode);
    }
    // Load bridge config and test connection
    const config = CommandBrain.getBridgeClient().loadConfig();
    setBridgeConfig(config);
    if (config.enabled && config.authToken) {
      testBridgeConnection();
    }
  }, []);

  useEffect(() => {
    if (loader.state === 'idle') {
      loader.ensure().catch((err) => {
        console.warn('Auto-load of LLM failed:', err);
      });
    }
  }, [loader.state, loader.ensure]);

  useEffect(() => {
    localStorage.setItem('commandbrain_execution_mode', executionMode);
  }, [executionMode]);

  useEffect(() => {
    return () => {
      if (noticeTimeoutRef.current) {
        window.clearTimeout(noticeTimeoutRef.current);
      }
    };
  }, []);

  const refreshCacheHealth = () => {
    const info = getModelCacheInfo(ModelCategory.Language);
    if (!info) {
      setCacheHealth({
        exists: false,
        modelName: '',
        lastLoadedAt: 0,
        metadataSizeBytes: 0,
      });
      return;
    }

    const metadataSizeBytes = new Blob([JSON.stringify(info)]).size;
    setCacheHealth({
      exists: true,
      modelName: info.modelName,
      lastLoadedAt: info.loadedAt,
      metadataSizeBytes,
    });
  };

  useEffect(() => {
    refreshCacheHealth();
  }, [loader.lastLoadedAt]);

  // Cache timestamp to know when data was last loaded
  const [lastHistoryLoad, setLastHistoryLoad] = useState(0);
  const [lastMacroLoad, setLastMacroLoad] = useState(0);
  const [lastFavoritesLoad, setLastFavoritesLoad] = useState(0);
  const [lastStatsLoad, setLastStatsLoad] = useState(0);
  const [templateVersion, setTemplateVersion] = useState(0);
  const [dataStale, setDataStale] = useState(false);

  const templates = useMemo(() => CommandTemplatesManager.getAll(), [templateVersion]);
  const categories = useMemo(() => CommandTemplatesManager.getCategories(), [templateVersion]);
  const filteredTemplates = useMemo(() => {
    const query = templateSearch.trim().toLowerCase();
    return templates.filter((t) => {
      const categoryMatch = templateCategory === 'All' || t.category === templateCategory;
      const searchMatch =
        !query ||
        t.name.toLowerCase().includes(query) ||
        t.description.toLowerCase().includes(query) ||
        t.naturalLanguage.toLowerCase().includes(query) ||
        t.tags.some((tag) => tag.toLowerCase().includes(query));
      return categoryMatch && searchMatch;
    });
  }, [templates, templateSearch, templateCategory]);
  const canUseRealExecution =
    executionMode === 'real' && bridgeConfig?.enabled && bridgeStatus === 'connected';
  const realModeBlocked = executionMode === 'real' && !canUseRealExecution;

  const showNotice = useCallback((message: string, kind: NoticeKind = 'info') => {
    if (noticeTimeoutRef.current) {
      window.clearTimeout(noticeTimeoutRef.current);
    }
    setCopyNotice({ kind, message });
    noticeTimeoutRef.current = window.setTimeout(() => {
      setCopyNotice(null);
      noticeTimeoutRef.current = null;
    }, 3000);
  }, []);

  const copyText = async (text: string, label: string) => {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
        showNotice(`Copied ${label}.`, 'success');
        return;
      }

      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.setAttribute('readonly', '');
      textarea.style.position = 'absolute';
      textarea.style.left = '-9999px';
      document.body.appendChild(textarea);
      textarea.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(textarea);

      if (ok) {
        showNotice(`Copied ${label}.`, 'success');
      } else {
        throw new Error('execCommand copy failed');
      }
    } catch {
      showNotice(`Could not copy ${label}. Check clipboard permission for this site.`, 'error');
    }
  };

  const openMacroForm = () => {
    const seed = preview?.command.naturalLanguage || input.trim() || history[0]?.naturalLanguage || '';
    const defaultName = seed ? seed.slice(0, 48) : `Macro ${new Date().toLocaleTimeString()}`;
    setMacroFormName(defaultName);
    setMacroFormDescription('Batch execution macro');
    setMacroFormTrigger(defaultName.toLowerCase().replace(/\s+/g, '-'));
    setMacroFormCommands(seed);
    setMacroFormError('');
    setMacroFormOpen(true);
  };

  const openCommandPreview = async (naturalLanguage: string) => {
    if (processing) return;

    // Move to command tab immediately for instant feedback instead of delayed switch.
    setView('main');

    // Ensure model is loaded
    if (loader.state !== 'ready') {
      setProcessingStage('Loading AI model...');
      const ok = await loader.ensure();
      if (!ok) {
        setError('Failed to load AI model');
        return;
      }
    }

    setProcessing(true);
    setProcessingStage('Starting preview...');
    setError(null);
    setExecutionResult(null);

    try {
      setProcessingStage('Interpreting command...');
      const result = await CommandBrain.processCommand(naturalLanguage);
      setPreview(result);
      setParamValues({});
      setVariants([]);
      setRefinementInput('');
      setProcessingStage('');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setProcessing(false);
      setProcessingStage('');
    }
  };

  const runNaturalLanguage = async (
    naturalLanguage: string,
    source: 'template' | 'history' = 'template',
    commandId?: string
  ) => {
    if (processing) return;
    if (commandId) setRunningCommandId(commandId);

    if (loader.state !== 'ready') {
      setProcessingStage('Loading AI model...');
      const ok = await loader.ensure();
      if (!ok) {
        setError('Failed to load AI model');
        return;
      }
    }

    setProcessing(true);
    setProcessingStage('Starting preview...');
    setView('main');
    setInput(naturalLanguage);
    setPreview(null);
    setExecutionResult(null);
    setError(null);

    try {
      setProcessingStage(`Preparing ${source} command...`);
      const result = await CommandBrain.processCommand(naturalLanguage);
      setPreview(result);

      if (result.command.safetyLevel !== SafetyLevel.SAFE) {
        showNotice('Command requires review before run. Preview opened.', 'info');
        return;
      }

      if (realModeBlocked) {
        setError('Real mode selected but bridge is disconnected. Open Settings and connect the bridge, or switch to Simulate mode.');
        return;
      }

      setProcessingStage('Executing command...');
      const execResult = await CommandBrain.executeCommand(result.command.id, canUseRealExecution);
      setExecutionResult(execResult);

      if (canUseRealExecution) {
        setBridgeDiagnostics((prev) => ({
          ...prev,
          lastExecutionAt: Date.now(),
          lastExecutionSuccess: execResult.success,
          lastExecutionDuration: execResult.duration,
          lastExecutionError: execResult.error || execResult.stderr || '',
        }));
      }

      setDataStale(true);
      setTimeout(() => {
        setPreview(null);
        setInput('');
      }, 2000);

      void loadSuggestions();
    } catch (err) {
      console.error('Failed to run command from list:', err);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setRunningCommandId(null);
      setProcessing(false);
      setProcessingStage('');
    }
  };

  const copyForTerminal = async (systemCommand: string) => {
    await copyText(systemCommand, 'terminal command');
    showNotice('Browser cannot open your native terminal directly. Command copied; paste and run it in terminal.', 'info');
  };

  const sendTemplateToTerminal = async (naturalLanguage: string) => {
    if (processing) return;

    if (loader.state !== 'ready') {
      setProcessingStage('Loading AI model...');
      const ok = await loader.ensure();
      if (!ok) {
        setError('Failed to load AI model');
        return;
      }
    }

    setProcessing(true);
    setProcessingStage('Starting preview...');
    setView('main');
    setInput(naturalLanguage);
    setPreview(null);
    setExecutionResult(null);
    setError(null);

    try {
      setProcessingStage('Preparing terminal command...');
      const result = await CommandBrain.processCommand(naturalLanguage);
      setPreview(result);
      await copyForTerminal(result.command.systemCommand);
    } catch (err) {
      console.error('Failed to prepare template terminal command:', err);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setProcessing(false);
      setProcessingStage('');
    }
  };

  const exportAnalyticsCSV = () => {
    const header = ['Natural Language', 'System Command', 'Category', 'Safety Level', 'Run Count', 'Created At'];
    const rows = history.map((cmd) => [
      `"${(cmd.naturalLanguage || '').replace(/"/g, '""')}"`,
      `"${(cmd.systemCommand || '').replace(/"/g, '""')}"`,
      cmd.category || '',
      cmd.safetyLevel || '',
      cmd.executionCount ?? 0,
      new Date(cmd.createdAt).toISOString(),
    ]);
    const csv = [header.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `commandbrain-analytics-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showNotice('Analytics exported as CSV.', 'success');
  };

  // ── Param extraction ────────────────────────────────────────────────────────
  // Returns unique placeholder tokens found in a system command string.
  // Matches: <WORD>, [WORD], and bare UPPER_CASE words that look like variables.
  const extractParams = (cmd: string): Array<{ key: string; currentValue: string }> => {
    const found = new Map<string, string>();

    const bracketed = cmd.matchAll(/<([A-Z][A-Z0-9_\-]*)>|\[([A-Z][A-Z0-9_\-]*)\]/g);
    for (const m of bracketed) {
      const key = m[1] || m[2];
      found.set(key, key);
    }

    const bare = cmd.matchAll(/\b([A-Z][A-Z0-9_]{2,})\b/g);
    for (const m of bare) {
      const tok = m[1];
      if (!['PATH', 'HOME', 'USER', 'TERM', 'SHELL', 'PWD', 'TMPDIR', 'XDG'].includes(tok)) {
        found.set(tok, tok);
      }
    }

    const firstUrl = cmd.match(/https?:\/\/[^\s"'<>]+/i);
    if (firstUrl) {
      found.set('URL', firstUrl[0]);
    }

    const outputMatch = cmd.match(/(?:^|\s)-o\s+(?:"([^"]+)"|'([^']+)'|([^\s]+))/);
    const outputValue = outputMatch?.[1] || outputMatch?.[2] || outputMatch?.[3];
    if (outputValue) {
      found.set('OUTPUT', outputValue);
    }

    return Array.from(found.entries()).map(([key, currentValue]) => ({ key, currentValue }));
  };

  const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  // Build the effective system command by substituting current paramValues
  const buildEffectiveCommand = (base: string, vals: Record<string, string>): string => {
    let out = base;
    for (const [key, val] of Object.entries(vals)) {
      if (!val.trim()) continue;
      const trimmed = val.trim();
      out = out.replace(new RegExp(`<${key}>|\[${key}\]|\b${key}\b`, 'g'), trimmed);

      if (key === 'URL') {
        out = out.replace(/https?:\/\/[^\s"'<>]+/ig, trimmed);
      }

      if (key === 'OUTPUT') {
        out = out.replace(/((?:^|\s)-o\s+)(?:"([^"]+)"|'([^']+)'|([^\s]+))/, (_match, prefix) => {
          const quoted = trimmed.includes(' ') ? `"${trimmed}"` : trimmed;
          return `${prefix}${quoted}`;
        });
      }

      if (key !== 'URL' && key !== 'OUTPUT' && base.includes(trimmed) === false) {
        // For literal detected values, replace exact occurrences safely.
        const current = previewParamEntries.find((entry) => entry.key === key)?.currentValue;
        if (current && current !== key) {
          out = out.replace(new RegExp(escapeRegExp(current), 'g'), trimmed);
        }
      }
    }
    return out;
  };

  // ── Global search ───────────────────────────────────────────────────────────
  const globalSearchResults = useMemo(() => {
    const q = globalQuery.trim().toLowerCase();
    if (!q || q.length < 2) return [];
    const results: Array<{ type: 'history' | 'template' | 'favorite'; label: string; sub: string; id: string; nl: string }> = [];

    for (const cmd of history) {
      if (cmd.naturalLanguage.toLowerCase().includes(q) || cmd.systemCommand.toLowerCase().includes(q)) {
        results.push({ type: 'history', label: cmd.naturalLanguage, sub: cmd.systemCommand, id: cmd.id, nl: cmd.naturalLanguage });
      }
      if (results.length >= 12) break;
    }

    for (const t of templates) {
      if (t.name.toLowerCase().includes(q) || t.description.toLowerCase().includes(q) || t.naturalLanguage.toLowerCase().includes(q)) {
        results.push({ type: 'template', label: t.name, sub: t.naturalLanguage, id: t.id, nl: t.naturalLanguage });
      }
      if (results.length >= 18) break;
    }

    for (const f of favorites) {
      if ((f.label || '').toLowerCase().includes(q) || f.naturalLanguage.toLowerCase().includes(q)) {
        results.push({ type: 'favorite', label: f.label || f.naturalLanguage, sub: f.systemCommand, id: f.id, nl: f.naturalLanguage });
      }
      if (results.length >= 22) break;
    }

    return results.slice(0, 12);
  }, [globalQuery, history, templates, favorites]);

  // ── Bulk history helpers ────────────────────────────────────────────────────
  const toggleSelectHistory = (id: string) => {
    setSelectedHistoryIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const selectAllHistory = () => {
    setSelectedHistoryIds(new Set(history.map((c) => c.id)));
  };

  const clearHistorySelection = () => setSelectedHistoryIds(new Set());

  const deleteSelectedHistory = async () => {
    if (selectedHistoryIds.size === 0) return;
    if (!window.confirm(`Delete ${selectedHistoryIds.size} selected commands from history?`)) return;
    for (const id of selectedHistoryIds) {
      try { await CommandBrain.deleteCommand(id); } catch { /* best-effort */ }
    }
    setSelectedHistoryIds(new Set());
    setDataStale(true);
    await loadHistory();
    showNotice(`Deleted ${selectedHistoryIds.size} commands.`, 'success');
  };

  const exportSelectedHistory = () => {
    const selected = history.filter((c) => selectedHistoryIds.has(c.id));
    if (!selected.length) return;
    const header = ['Natural Language', 'System Command', 'Category', 'Safety Level', 'Run Count', 'Created At'];
    const rows = selected.map((cmd) => [
      `"${(cmd.naturalLanguage || '').replace(/"/g, '""')}"`,
      `"${(cmd.systemCommand || '').replace(/"/g, '""')}"`,
      cmd.category || '',
      cmd.safetyLevel || '',
      cmd.executionCount ?? 0,
      new Date(cmd.createdAt).toISOString(),
    ]);
    const csv = [header.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `commandbrain-history-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showNotice(`Exported ${selected.length} commands.`, 'success');
  };

  const createMacroFromSelected = () => {
    const selected = history.filter((c) => selectedHistoryIds.has(c.id));
    if (!selected.length) return;
    const cmds = selected.map((c) => c.naturalLanguage).join('\n');
    setMacroFormCommands(cmds);
    setMacroFormName(`Macro from ${selected.length} commands`);
    setMacroFormDescription('Created from selected history items');
    setMacroFormTrigger(`macro-${Date.now()}`);
    setMacroFormOpen(true);
    setView('macros');
    clearHistorySelection();
  };

  // ── Refinement / follow-up ──────────────────────────────────────────────────
  const handleRefinement = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!refinementInput.trim() || !preview) return;
    setRefinementProcessing(true);
    try {
      const currentCommand = buildEffectiveCommand(preview.command.systemCommand, paramValues);
      const result = await CommandBrain.refineCommand(
        preview.command.naturalLanguage,
        currentCommand,
        refinementInput.trim()
      );
      setPreview(result);
      setParamValues({}); // reset params for new command
      setVariants([]);    // clear old variants
      setRefinementInput('');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setRefinementProcessing(false);
    }
  };

  // ── Load variants for current preview ──────────────────────────────────────
  const loadVariants = async () => {
    if (!preview || loadingVariants) return;
    setLoadingVariants(true);
    try {
      const v = await CommandBrain.getCommandVariants(preview.command.naturalLanguage, 3);
      setVariants(v);
    } catch {
      showNotice('Could not load alternatives.', 'error');
    } finally {
      setLoadingVariants(false);
    }
  };

  const createMacro = async () => {
    const name = macroFormName.trim();
    const description = macroFormDescription.trim() || 'Batch execution macro';
    const trigger = (macroFormTrigger.trim() || name.toLowerCase().replace(/\s+/g, '-')).slice(0, 80);
    const commands = macroFormCommands
      .split(/\r?\n|\|/)
      .map((c) => c.trim())
      .filter(Boolean);

    if (!name) {
      setMacroFormError('Macro name is required.');
      return;
    }

    if (commands.length === 0) {
      setMacroFormError('Add at least one command line.');
      return;
    }

    try {
      await CommandBrain.createMacro(name, description, trigger, commands);
      await loadMacros();
      setDataStale(true);
      setMacroFormOpen(false);
      showNotice(`Macro created: ${name} (${commands.length} command${commands.length > 1 ? 's' : ''}).`, 'success');
    } catch (err) {
      const raw = err instanceof Error ? err.message : String(err);
      const duplicate = /constraint|duplicate|already exists|key already exists/i.test(raw);
      setMacroFormError(duplicate ? 'Macro name already exists. Pick a different name.' : `Failed to create macro: ${raw}`);
    }
  };

  // Load history only when needed (and cache it)
  useEffect(() => {
    if (view === 'history' && (history.length === 0 || dataStale)) {
      loadHistory();
      setDataStale(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, dataStale]);

  // Load macros only when needed (and cache it)
  useEffect(() => {
    if (view === 'macros' && (macros.length === 0 || dataStale)) {
      loadMacros();
      setDataStale(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, dataStale]);

  // Load favorites only when needed (and cache it)
  useEffect(() => {
    if (view === 'favorites' && (favorites.length === 0 || dataStale)) {
      loadFavorites();
      setDataStale(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, dataStale]);

  // Load stats only when needed (and cache it)
  useEffect(() => {
    if (view === 'settings' && (!stats || dataStale)) {
      loadStats();
      setDataStale(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, dataStale, stats]);

  useEffect(() => {
    if (view === 'analytics') {
      if (history.length === 0 || dataStale) {
        loadHistory();
      }
      if (!stats || dataStale) {
        loadStats();
      }
      setDataStale(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, dataStale, stats, history.length]);

  useEffect(() => {
    if (view === 'main') {
      if (history.length === 0) {
        loadHistory();
      }
      if (favorites.length === 0) {
        loadFavorites();
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view]);

  useEffect(() => {
    try {
      localStorage.setItem('commandbrain_reminder_snooze_map', JSON.stringify(reminderSnoozeMap));
    } catch {
      // ignore storage quota errors
    }
  }, [reminderSnoozeMap]);

  const loadSuggestions = async () => {
    try {
      const sug = await CommandBrain.getSuggestions();
      setSuggestions(sug);
    } catch (err) {
      console.error('Failed to load suggestions:', err);
    }
  };

  const loadHistory = async () => {
    try {
      const hist = await CommandBrain.getHistory(50); // Increased limit
      setHistory(hist);
      setLastHistoryLoad(Date.now());
    } catch (err) {
      console.error('Failed to load history:', err);
    }
  };

  const loadMacros = async () => {
    try {
      const m = await CommandBrain.getMacros();
      setMacros(m);
      setLastMacroLoad(Date.now());
    } catch (err) {
      console.error('Failed to load macros:', err);
    }
  };

  const loadFavorites = async () => {
    try {
      const favs = await CommandBrain.getFavorites();
      setFavorites(favs);
      setLastFavoritesLoad(Date.now());
    } catch (err) {
      console.error('Failed to load favorites:', err);
    }
  };

  const loadBridgeConfig = () => {
    const bridge = CommandBrain.getBridgeClient();
    const config = bridge.getConfig();
    setBridgeConfig(config);
    
    if (config.enabled) {
      testBridgeConnection();
    }
  };

  const testBridgeConnection = async (): Promise<boolean> => {
    const started = Date.now();
    const bridge = CommandBrain.getBridgeClient();
    const result = await bridge.testConnection();
    setBridgeStatus(result.success ? 'connected' : 'disconnected');
    setBridgeDiagnostics((prev) => ({
      ...prev,
      lastCheckAt: Date.now(),
      lastLatencyMs: Date.now() - started,
      lastMessage: result.message,
    }));
    return result.success;
  };

  const loadStats = async () => {
    try {
      const s = await CommandBrain.getStatistics();
      setStats(s);
      setLastStatsLoad(Date.now());
    } catch (err) {
      console.error('Failed to load stats:', err);
    }
  };

  // Process command
  const handleSubmit = async (e?: React.FormEvent, quickExecute: boolean = false) => {
    e?.preventDefault();
    
    const text = input.trim();
    if (!text || processing) return;

    // Ensure model is loaded
    if (loader.state !== 'ready') {
      setProcessingStage('Loading AI model...');
      const ok = await loader.ensure();
      if (!ok) {
        setError('Failed to load AI model');
        return;
      }
    }

    setProcessing(true);
    setProcessingStage('Starting preview...');
    setPreview(null);
    setExecutionResult(null);
    setError(null);
    setParamValues({});
    setVariants([]);
    setRefinementInput('');

    try {
      setProcessingStage('Interpreting command...');
      const result = await CommandBrain.processCommand(text);
      setPreview(result);
      setProcessingStage('');
      
      // If quickExecute and safe, execute immediately
      if (quickExecute && result.command.safetyLevel === SafetyLevel.SAFE) {
        if (realModeBlocked) {
          setError('Real mode selected but bridge is disconnected. Open Settings and connect the bridge, or switch to Simulate mode.');
          return;
        }

        setProcessingStage('Executing command...');
        const execResult = await CommandBrain.executeCommand(result.command.id, canUseRealExecution);
        setExecutionResult(execResult);

        if (canUseRealExecution) {
          setBridgeDiagnostics((prev) => ({
            ...prev,
            lastExecutionAt: Date.now(),
            lastExecutionSuccess: execResult.success,
            lastExecutionDuration: execResult.duration,
            lastExecutionError: execResult.error || execResult.stderr || '',
          }));
        }
        
        // Clear preview after 2 seconds
        setTimeout(() => {
          setPreview(null);
          setInput('');
          setDataStale(true);
        }, 2000);
      }
      
      void loadSuggestions();
    } catch (err) {
      console.error('Failed to process command:', err);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setProcessing(false);
      setProcessingStage('');
    }
  };

  // Execute previewed command
  const handleExecute = async (useBridge?: boolean) => {
    if (!preview) return;

    if (realModeBlocked && typeof useBridge === 'undefined') {
      setError('Real mode selected but bridge is disconnected. Open Settings and connect the bridge, or click Simulate.');
      return;
    }

    const shouldUseBridge = typeof useBridge === 'boolean' ? useBridge : canUseRealExecution;

    // If user has filled in param values, update the stored command first
    const effectiveCmd = buildEffectiveCommand(preview.command.systemCommand, paramValues);
    const commandIdToRun = preview.command.id;

    // Patch the command in store if params were customized
    if (effectiveCmd !== preview.command.systemCommand) {
      try {
        await CommandBrain.updateCommandText(commandIdToRun, effectiveCmd);
      } catch { /* best-effort */ }
    }

    try {
      const result = await CommandBrain.executeCommand(commandIdToRun, shouldUseBridge);
      // Show the param-substituted command in stdout if simulated
      if (!shouldUseBridge && result.stdout) {
        result.stdout = result.stdout.replace(preview.command.systemCommand, effectiveCmd);
      }
      setExecutionResult(result);

      if (shouldUseBridge) {
        setBridgeDiagnostics((prev) => ({
          ...prev,
          lastExecutionAt: Date.now(),
          lastExecutionSuccess: result.success,
          lastExecutionDuration: result.duration,
          lastExecutionError: result.error || result.stderr || '',
        }));
      }
      
      // Clear preview after execution
      setTimeout(() => {
        setPreview(null);
        setInput('');
        setDataStale(true); // Mark data stale instead of immediate reload
      }, 2000);
    } catch (err) {
      console.error('Failed to execute command:', err);
      alert(`Error: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  // Cancel preview
  const handleCancel = () => {
    setPreview(null);
    setExecutionResult(null);
    setParamValues({});
    setVariants([]);
    setRefinementInput('');
    inputRef.current?.focus();
  };

  // Use suggestion
  const useSuggestion = (suggestion: CommandSuggestion) => {
    setInput(suggestion.naturalLanguage);
    inputRef.current?.focus();
  };

  // Edit command from history
  const editHistoryCommand = (command: Command) => {
    setInput(command.naturalLanguage);
    setView('main');
    setTimeout(() => {
      inputRef.current?.focus();
    }, 100);
  };

  // Re-run command from history (direct execution)
  const rerunCommand = async (command: Command) => {
    if (processing) return;
    setRunningCommandId(command.id);

    if (realModeBlocked) {
      setError('Real mode selected but bridge is disconnected. Open Settings and connect the bridge, or switch to Simulate mode.');
      return;
    }

    setProcessing(true);
    setProcessingStage('Re-running command from history...');
    setError(null);

    try {
      setView('main');
      setPreview(null);
      const result = await CommandBrain.executeCommand(command.id, canUseRealExecution);
      setExecutionResult(result);

      if (canUseRealExecution) {
        setBridgeDiagnostics((prev) => ({
          ...prev,
          lastExecutionAt: Date.now(),
          lastExecutionSuccess: result.success,
          lastExecutionDuration: result.duration,
          lastExecutionError: result.error || result.stderr || '',
        }));
      }

      if (!result.success && executionMode === 'real' && !canUseRealExecution) {
        setError('Real mode selected but bridge is not connected/configured. Connect bridge in Settings or switch to Simulate mode.');
      }

      setDataStale(true);
    } catch (err) {
      console.error('Failed to rerun command:', err);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setRunningCommandId(null);
      setProcessing(false);
      setProcessingStage('');
    }
  };

  // Add to favorites
  const addToFavorites = async (command: Command) => {
    const label = prompt('Give this saved command a nickname (optional):');
    const folder = prompt('Folder/group for this saved command (optional):');
    const tagsRaw = prompt('Tags (comma-separated, optional):');
    const notes = prompt('Add notes about this command (optional):');
    const tags = (tagsRaw || '')
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);
    
    try {
      await CommandBrain.addToFavorites(
        command,
        label || undefined,
        notes || undefined,
        folder || undefined,
        tags.length ? tags : undefined
      );
      alert('✅ Saved command added!');
      setDataStale(true);
      await loadFavorites();
    } catch (err) {
      console.error('Failed to add to favorites:', err);
      alert(`Error: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  // Remove from favorites
  const removeFromFavorites = async (favoriteId: string) => {
    if (!confirm('Remove this saved command?')) return;
    
    try {
      await CommandBrain.removeFromFavorites(favoriteId);
      setDataStale(true);
      await loadFavorites();
    } catch (err) {
      console.error('Failed to remove favorite:', err);
      alert(`Error: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const editSavedMetadata = async (favorite: FavoriteCommand) => {
    const label = prompt('Nickname (optional):', favorite.label || '');
    if (label === null) return;

    const folder = prompt('Folder/group (optional):', favorite.folder || '');
    if (folder === null) return;

    const tagsRaw = prompt('Tags (comma-separated):', (favorite.tags || []).join(', '));
    if (tagsRaw === null) return;

    const notes = prompt('Notes (optional):', favorite.notes || '');
    if (notes === null) return;

    const tags = tagsRaw
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);

    try {
      await CommandBrain.updateFavoriteMetadata(favorite.id, {
        label: label.trim() || undefined,
        folder: folder.trim() || undefined,
        tags: tags.length ? tags : undefined,
        notes: notes.trim() || undefined,
      });
      showNotice('Saved command details updated.', 'success');
      await loadFavorites();
    } catch (err) {
      console.error('Failed to update saved command metadata:', err);
      showNotice(`Failed to update saved command: ${err instanceof Error ? err.message : String(err)}`, 'error');
    }
  };

  // Execute favorite
  const executeFavorite = async (favorite: FavoriteCommand) => {
    setInput(favorite.naturalLanguage);
    setView('main');
    
    // Mark as used
    await CommandBrain.useFavorite(favorite.id);
    
    // Auto-submit
    setTimeout(async () => {
      await handleSubmit(undefined, favorite.safetyLevel === SafetyLevel.SAFE);
    }, 100);
  };

  // Execute macro
  const executeMacro = async (macro: Macro) => {
    if (!confirm(`Execute macro "${macro.name}"? This will run ${macro.commands.length} commands.`)) {
      return;
    }

    if (realModeBlocked) {
      setError('Real mode selected but bridge is disconnected. Open Settings and connect the bridge, or switch to Simulate mode.');
      return;
    }

    setProcessing(true);
  setError(null);
    try {
      setMacroRunProgress({
        macroName: macro.name,
        startedAt: Date.now(),
        steps: macro.commands.map((command) => ({ command, status: 'pending' })),
      });
      const results = await CommandBrain.executeMacro(
        macro.id,
        canUseRealExecution,
        ({ index, phase, result }) => {
          setMacroRunProgress((prev) => {
            if (!prev || !prev.steps[index]) return prev;

            const steps = [...prev.steps];
            const current = steps[index];
            if (!current) return prev;

            if (phase === 'running') {
              steps[index] = { ...current, status: 'running' };
            } else {
              steps[index] = {
                ...current,
                status: result?.success ? 'success' : 'error',
                result,
              };
            }

            return { ...prev, steps };
          });
        }
      );

      setMacroRunSummary({
        macroName: macro.name,
        commands: macro.commands,
        results,
        runAt: Date.now(),
      });
      showNotice(`Macro executed: ${results.filter(r => r.success).length}/${results.length} commands succeeded.`, 'success');
      await loadHistory();
      await loadMacros();
    } catch (err) {
      console.error('Failed to execute macro:', err);
      showNotice(`Macro failed: ${err instanceof Error ? err.message : String(err)}`, 'error');
      setMacroRunProgress((prev) => {
        if (!prev) return prev;
        const nextSteps = prev.steps.map((step) => {
          if (step.status === 'pending' || step.status === 'running') {
            return {
              ...step,
              status: 'error' as const,
              result: {
                success: false,
                error: 'Execution interrupted',
                duration: 0,
              },
            };
          }
          return step;
        });
        return { ...prev, steps: nextSteps };
      });
    } finally {
      setProcessing(false);
    }
  };

  // Render safety indicator
  const renderSafetyBadge = (level: SafetyLevel) => {
    switch (level) {
      case SafetyLevel.SAFE:
        return <span className="badge badge-success">Safe</span>;
      case SafetyLevel.CAUTION:
        return <span className="badge badge-warning">Caution</span>;
      case SafetyLevel.DANGEROUS:
        return <span className="badge badge-danger">Dangerous</span>;
    }
  };

  const renderGlobalProcessing = () => {
    if (!processing) return null;

    return (
      <div className="processing-global">
        <div className="spinner-small"></div>
        <span>{processingStage || 'Working...'}</span>
      </div>
    );
  };

  // ── Global search bar (rendered in every view header) ───────────────────────
  const renderGlobalSearch = () => (
    <div className="global-search-wrap" ref={globalSearchRef}>
      <div className="global-search-input-row">
        <span className="global-search-icon">🔍</span>
        <input
          className="global-search-input"
          type="text"
          placeholder="Search history, templates, favorites…"
          value={globalQuery}
          onChange={(e) => { setGlobalQuery(e.target.value); setShowGlobalSearch(true); }}
          onFocus={() => setShowGlobalSearch(true)}
          onBlur={() => setTimeout(() => setShowGlobalSearch(false), 160)}
        />
        {globalQuery && (
          <button
            className="global-search-clear"
            onMouseDown={(e) => { e.preventDefault(); setGlobalQuery(''); setShowGlobalSearch(false); }}
          >✕</button>
        )}
      </div>
      {showGlobalSearch && globalSearchResults.length > 0 && (
        <div className="global-search-dropdown">
          {globalSearchResults.map((r) => (
            <button
              key={`${r.type}-${r.id}`}
              className="global-search-result"
              onMouseDown={(e) => {
                e.preventDefault();
                setGlobalQuery('');
                setShowGlobalSearch(false);
                openCommandPreview(r.nl);
              }}
            >
              <span className={`gs-type gs-type-${r.type}`}>{r.type}</span>
              <span className="gs-label">{r.label}</span>
              <span className="gs-sub">{r.sub.slice(0, 60)}</span>
            </button>
          ))}
        </div>
      )}
      {showGlobalSearch && globalQuery.trim().length >= 2 && globalSearchResults.length === 0 && (
        <div className="global-search-dropdown">
          <span className="gs-empty">No results for "{globalQuery}"</span>
        </div>
      )}
    </div>
  );

  const categoryData = useMemo(() => {
    const map = new Map<string, number>();
    for (const cmd of history) {
      map.set(cmd.category, (map.get(cmd.category) || 0) + 1);
    }
    return Array.from(map.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);
  }, [history]);

  const safetyData = useMemo(() => {
    const map = new Map<string, number>();
    for (const cmd of history) {
      map.set(cmd.safetyLevel, (map.get(cmd.safetyLevel) || 0) + 1);
    }
    return Array.from(map.entries()).map(([name, count]) => ({ name, count }));
  }, [history]);

  const filteredAnalyticsCommands = useMemo(() => {
    return history.filter((cmd) => {
      const byCategory = analyticsCategoryFilter === 'All' || cmd.category === analyticsCategoryFilter;
      const bySafety = analyticsSafetyFilter === 'All' || cmd.safetyLevel === analyticsSafetyFilter;
      return byCategory && bySafety;
    });
  }, [history, analyticsCategoryFilter, analyticsSafetyFilter]);

  const topCommandPatterns = useMemo(() => {
    const keyMap = new Map<string, { naturalLanguage: string; systemCommand: string; count: number }>();
    for (const cmd of history) {
      const key = `${cmd.naturalLanguage}__${cmd.systemCommand}`;
      const existing = keyMap.get(key);
      if (existing) {
        existing.count += cmd.executionCount || 1;
      } else {
        keyMap.set(key, {
          naturalLanguage: cmd.naturalLanguage,
          systemCommand: cmd.systemCommand,
          count: cmd.executionCount || 1,
        });
      }
    }
    return Array.from(keyMap.values()).sort((a, b) => b.count - a.count).slice(0, 12);
  }, [history]);

  const dailyData = useMemo(() => {
    const now = Date.now();
    const dayMs = 24 * 60 * 60 * 1000;
    const bucket = new Map<string, number>();
    for (const cmd of history) {
      const daysAgo = Math.floor((now - cmd.createdAt) / dayMs);
      if (daysAgo > 13) continue;
      const d = new Date(cmd.createdAt);
      const label = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
      bucket.set(label, (bucket.get(label) || 0) + 1);
    }
    const result: { date: string; count: number }[] = [];
    for (let i = 13; i >= 0; i--) {
      const d = new Date(now - i * dayMs);
      const label = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
      result.push({ date: label, count: bucket.get(label) || 0 });
    }
    return result;
  }, [history]);

  const previewParamEntries = useMemo(() => {
    if (!preview) return [];
    return extractParams(preview.command.systemCommand);
  }, [preview]);

  useEffect(() => {
    if (!preview) return;
    const nextValues: Record<string, string> = {};
    for (const entry of previewParamEntries) {
      nextValues[entry.key] = entry.currentValue;
    }
    setParamValues(nextValues);
  }, [preview?.command.id, preview?.command.systemCommand]);

  const effectivePreviewCommand = useMemo(() => {
    if (!preview) return '';
    return buildEffectiveCommand(preview.command.systemCommand, paramValues);
  }, [preview, paramValues]);

  const reminderCandidate = useMemo(() => {
    if (history.length === 0) return null;

    const now = Date.now();
    const nowHour = new Date(now).getHours();
    const grouped = new Map<string, {
      naturalLanguage: string;
      systemCommand: string;
      count: number;
      lastUsed: number;
      hour: number;
      category: string;
      safetyLevel: SafetyLevel;
    }>();

    for (const cmd of history) {
      const key = `${cmd.naturalLanguage}__${cmd.systemCommand}`;
      const usedAt = cmd.executedAt || cmd.createdAt;
      const hour = new Date(usedAt).getHours();
      const existing = grouped.get(key);
      if (existing) {
        existing.count += Math.max(1, cmd.executionCount || 1);
        if (usedAt > existing.lastUsed) {
          existing.lastUsed = usedAt;
          existing.hour = hour;
        }
      } else {
        grouped.set(key, {
          naturalLanguage: cmd.naturalLanguage,
          systemCommand: cmd.systemCommand,
          count: Math.max(1, cmd.executionCount || 1),
          lastUsed: usedAt,
          hour,
          category: cmd.category,
          safetyLevel: cmd.safetyLevel,
        });
      }
    }

    const candidates = Array.from(grouped.values())
      .filter((item) => item.count >= 2)
      .map((item) => {
        const hoursSinceUse = (now - item.lastUsed) / (1000 * 60 * 60);
        const hourDistance = Math.min(Math.abs(item.hour - nowHour), 24 - Math.abs(item.hour - nowHour));
        const recencyScore = hoursSinceUse < 6 ? -5 : hoursSinceUse < 24 ? 3 : hoursSinceUse < 24 * 7 ? 2 : 1;
        const hourScore = hourDistance <= 1 ? 4 : hourDistance <= 2 ? 2 : 0;
        return {
          ...item,
          reminderKey: `${item.naturalLanguage}__${item.systemCommand}`,
          score: item.count * 2 + recencyScore + hourScore,
        };
      })
      .sort((a, b) => b.score - a.score);

    const best = candidates.find((item) => {
      const snoozedUntil = reminderSnoozeMap[item.reminderKey] || 0;
      return item.reminderKey !== dismissedReminderKey && snoozedUntil <= now;
    });
    return best || null;
  }, [history, dismissedReminderKey, reminderSnoozeMap]);

  const savedFolders = useMemo(() => {
    const folders = new Set<string>();
    for (const fav of favorites) {
      if (fav.folder?.trim()) folders.add(fav.folder.trim());
    }
    return ['All', ...Array.from(folders).sort((a, b) => a.localeCompare(b))];
  }, [favorites]);

  const filteredSavedCommands = useMemo(() => {
    const q = savedSearch.trim().toLowerCase();
    return favorites.filter((fav) => {
      const folderMatch = savedFolderFilter === 'All' || (fav.folder || '').trim() === savedFolderFilter;
      if (!folderMatch) return false;
      if (!q) return true;

      const haystack = [
        fav.label,
        fav.naturalLanguage,
        fav.systemCommand,
        fav.description,
        fav.notes,
        fav.folder,
        ...(fav.tags || []),
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      return haystack.includes(q);
    });
  }, [favorites, savedFolderFilter, savedSearch]);

  const storageInfo = useMemo(() => {
    const estimateLocalStorageSize = (key: string) => {
      const value = localStorage.getItem(key);
      return value ? new Blob([value]).size : 0;
    };

    return {
      indexedDbName: 'CommandBrainDB',
      indexedDbStores: ['commands', 'macros', 'patterns', 'favorites', 'config'],
      localStorageKeys: ['commandbrain_bridge_config', 'commandbrain_custom_templates', 'commandbrain_reminder_snooze_map'],
      localStorageBytes:
        estimateLocalStorageSize('commandbrain_bridge_config') +
        estimateLocalStorageSize('commandbrain_custom_templates') +
        estimateLocalStorageSize('commandbrain_reminder_snooze_map'),
      inMemoryCounts: {
        history: history.length,
        saved: favorites.length,
        macros: macros.length,
      },
    };
  }, [history.length, favorites.length, macros.length]);

  const isYoutubePreview = useMemo(() => {
    if (!preview) return false;
    return /^yt-dlp\b/.test(preview.command.systemCommand.trim()) || /(youtube|youtu\.be|yt\b)/i.test(preview.command.naturalLanguage);
  }, [preview]);

  const youtubeRecipeCommands = useMemo(() => {
    if (!isYoutubePreview) return [] as Array<{ title: string; command: string; description: string }>;

    const currentUrl =
      paramValues.VIDEO_URL ||
      paramValues.URL ||
      effectivePreviewCommand.match(/https?:\/\/[^\s"'<>]+/i)?.[0] ||
      '<VIDEO_URL>';

    return [
      {
        title: 'Download video',
        command: `yt-dlp "${currentUrl}"`,
        description: 'Basic download command.',
      },
      {
        title: 'Best quality (video + audio merged)',
        command: `yt-dlp -f "bestvideo+bestaudio" --merge-output-format mp4 "${currentUrl}"`,
        description: 'High quality video and audio merged to mp4.',
      },
      {
        title: 'Only audio (MP3)',
        command: `yt-dlp -x --audio-format mp3 "${currentUrl}"`,
        description: 'Extract only audio and convert to mp3.',
      },
      {
        title: 'List formats first',
        command: `yt-dlp -F "${currentUrl}"`,
        description: 'Check available video/audio format codes.',
      },
      {
        title: 'Download specific format',
        command: `yt-dlp -f <FORMAT_CODE> "${currentUrl}"`,
        description: 'Example: 137+140, where 137 is video and 140 is audio.',
      },
      {
        title: 'Save using video title',
        command: `yt-dlp -o "%(title)s.%(ext)s" "${currentUrl}"`,
        description: 'Automatically names the file using the video title.',
      },
    ];
  }, [effectivePreviewCommand, isYoutubePreview, paramValues.URL, paramValues.VIDEO_URL]);

  // Main view
  if (view === 'main') {
    return (
      <div className="tab-panel commandbrain-panel">
        <ModelBanner
          state={loader.state}
          progress={loader.progress}
          error={loader.error}
          cachedModelName={loader.cachedModelName}
          lastLoadedAt={loader.lastLoadedAt}
          onLoad={loader.ensure}
          label="LLM (CommandBrain)"
        />

        <div className="commandbrain-header">
          <h2>CommandBrain</h2>
          <p>Natural language command executor with AI-powered safety</p>
          {bridgeConfig?.enabled && (
            <div className={`bridge-banner ${bridgeStatus === 'connected' ? 'connected' : 'disconnected'}`}>
              {bridgeStatus === 'connected' ? '🚀 Real Execution: Enabled' : '⚠️ Bridge: Disconnected'}
              {bridgeStatus === 'connected' && <span className="bridge-banner-note">(Commands will execute for real)</span>}
            </div>
          )}
          <div className="execution-mode-toggle">
            <span className="execution-mode-label">Execution Mode:</span>
            <button
              type="button"
              className={`mode-btn ${executionMode === 'simulate' ? 'active' : ''}`}
              onClick={() => setExecutionMode('simulate')}
            >
              Simulate
            </button>
            <button
              type="button"
              className={`mode-btn ${executionMode === 'real' ? 'active' : ''}`}
              onClick={() => setExecutionMode('real')}
            >
              Real
            </button>
            <span className={`mode-status ${canUseRealExecution ? 'ready' : 'fallback'}`}>
              {canUseRealExecution ? 'Bridge Ready' : 'Using Simulation'}
            </span>
          </div>
          <div className="view-tabs">
            <button className="tab-btn active" onClick={() => setView('main')}>Command</button>
            <button className="tab-btn" onClick={() => setView('templates')}>Templates</button>
            <button className="tab-btn" onClick={() => setView('history')}>History</button>
            <button className="tab-btn" onClick={() => setView('macros')}>Macros</button>
            <button className="tab-btn" onClick={() => setView('analytics')}>Analytics</button>
            <button className="tab-btn" onClick={() => setView('settings')}>Settings</button>
          </div>
          {renderGlobalSearch()}
        </div>

        {copyNotice && (
          <div className={`action-notice ${copyNotice.kind}`}>
            {copyNotice.message}
          </div>
        )}

        {renderGlobalProcessing()}

        {reminderCandidate && !preview && (
          <div className="reminder-card">
            <div className="reminder-card-head">
              <div>
                <strong>Reminder</strong>
                <p>You use this command often. Want to use it again?</p>
              </div>
              <button className="btn btn-sm" onClick={() => setDismissedReminderKey(reminderCandidate.reminderKey)}>
                Dismiss
              </button>
            </div>
            <div className="reminder-command">{reminderCandidate.naturalLanguage}</div>
            <pre className="command-code">{reminderCandidate.systemCommand}</pre>
            <div className="reminder-meta">
              <span>Used {reminderCandidate.count} times</span>
              <span>Last used {new Date(reminderCandidate.lastUsed).toLocaleString()}</span>
            </div>
            <div className="reminder-actions">
              <button className="btn btn-primary btn-sm" onClick={() => openCommandPreview(reminderCandidate.naturalLanguage)}>
                Preview Again
              </button>
              <button className="btn btn-sm" onClick={() => runNaturalLanguage(reminderCandidate.naturalLanguage, 'history')}>
                Quick Run
              </button>
              <button
                className="btn btn-sm"
                onClick={() => {
                  setReminderSnoozeMap((prev) => ({
                    ...prev,
                    [reminderCandidate.reminderKey]: Date.now() + 24 * 60 * 60 * 1000,
                  }));
                }}
              >
                Snooze 1 day
              </button>
              <button
                className="btn btn-sm"
                onClick={() => {
                  setReminderSnoozeMap((prev) => ({
                    ...prev,
                    [reminderCandidate.reminderKey]: Date.now() + 7 * 24 * 60 * 60 * 1000,
                  }));
                }}
              >
                Snooze 7 days
              </button>
              <button className="btn btn-sm" onClick={() => setView('favorites')}>
                Open Saved
              </button>
            </div>
          </div>
        )}

        <div className="commandbrain-input-section">
          <form onSubmit={handleSubmit}>
            <div className="input-group">
              <input
                ref={inputRef}
                type="text"
                className="command-input"
                placeholder="Enter natural language command (e.g., 'clear my cache', 'kill port 3000')"
                value={input}
                onChange={(e) => {
                  setInput(e.target.value);
                  if (preview) {
                    setPreview(null);
                  }
                }}
                disabled={processing}
              />
              <button type="submit" className="btn btn-primary" disabled={!input.trim() || processing}>
                {processing ? 'Processing...' : 'Preview'}
              </button>
              <button
                type="button"
                className="btn btn-success"
                disabled={!input.trim() || processing}
                onClick={(e) => { e.preventDefault(); handleSubmit(undefined, true); }}
              >
                {canUseRealExecution ? 'Quick Run (Real)' : 'Quick Run'}
              </button>
            </div>
            {processingStage && (
              <div className="processing-status">
                <div className="spinner-small"></div>
                <span>{processingStage}</span>
              </div>
            )}
            {error && (
              <div className="error-banner">
                <strong>Error:</strong> {error}
              </div>
            )}
            <p className="input-hint">
              <strong>Preview:</strong> Shows command details first |
              <strong> Quick Run:</strong> Auto-executes safe commands instantly
            </p>
          </form>
        </div>

        {processing && !preview && (
          <div className="command-preview command-preview-pending" aria-live="polite">
            <div className="preview-header">
              <h3>Preparing Preview</h3>
              <span className="badge">Working</span>
            </div>
            <div className="preview-content">
              <div className="preview-section">
                <strong>Status:</strong>
                <p>{processingStage || 'Working...'}</p>
              </div>
              {input.trim() && (
                <div className="preview-section">
                  <strong>Your Request:</strong>
                  <p>{input.trim()}</p>
                </div>
              )}
            </div>
          </div>
        )}

        {preview && (
          <div className="command-preview">
            <div className="preview-header">
              <h3>Command Preview</h3>
              {renderSafetyBadge(preview.command.safetyLevel)}
            </div>

            <div className="preview-content">
              <div className="preview-section">
                <strong>Natural Language:</strong>
                <p>{preview.command.naturalLanguage}</p>
                <button className="btn btn-sm copy-btn" onClick={() => copyText(preview.command.naturalLanguage, 'natural language')}>Copy</button>
              </div>

              <div className="preview-section">
                <strong>System Command:</strong>
                <pre className="command-code">{effectivePreviewCommand || preview.command.systemCommand}</pre>
                <button className="btn btn-sm copy-btn" onClick={() => copyText(effectivePreviewCommand || preview.command.systemCommand, 'system command')}>Copy</button>
              </div>

              {previewParamEntries.length > 0 && (
                <div className="preview-section preview-params">
                  <strong>Editable Parameters:</strong>
                  <div className="param-grid">
                    {previewParamEntries.map((paramEntry) => (
                      <label key={paramEntry.key} className="param-field">
                        <span>{paramEntry.key}</span>
                        <input
                          type="text"
                          className="bridge-input"
                          placeholder={`Enter ${paramEntry.key.toLowerCase()}`}
                          value={paramValues[paramEntry.key] || ''}
                          onChange={(e) => {
                            const value = e.target.value;
                            setParamValues((prev) => ({ ...prev, [paramEntry.key]: value }));
                          }}
                        />
                      </label>
                    ))}
                  </div>
                  <p className="preview-params-hint">Fill these values to replace placeholders before copy or execution.</p>
                </div>
              )}

              <div className="preview-section">
                <strong>Explanation:</strong>
                <p>{preview.command.explanation}</p>
              </div>

              {isYoutubePreview && (
                <div className="preview-section variants-panel">
                  <strong>Common yt-dlp Recipes:</strong>
                  <div className="variants-list">
                    {youtubeRecipeCommands.map((recipe) => (
                      <div key={recipe.title} className="variant-card">
                        <div className="variant-head">
                          <span className="badge recipe-badge">{recipe.title}</span>
                          <div className="variant-head-actions">
                            <button
                              className="btn btn-sm"
                              onClick={() => {
                                setPreview((prev) => {
                                  if (!prev) return prev;
                                  return {
                                    ...prev,
                                    command: {
                                      ...prev.command,
                                      systemCommand: recipe.command,
                                      explanation: recipe.description,
                                    },
                                  };
                                });
                              }}
                            >
                              Use This
                            </button>
                            <button className="btn btn-sm" onClick={() => copyText(recipe.command, 'yt-dlp recipe')}>
                              Copy
                            </button>
                          </div>
                        </div>
                        <pre className="command-code">{recipe.command}</pre>
                        <p>{recipe.description}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {preview.warnings.length > 0 && (
                <div className="preview-section warnings">
                  <strong>Warnings:</strong>
                  <ul>
                    {preview.warnings.map((warning, i) => (
                      <li key={i}>{warning}</li>
                    ))}
                  </ul>
                </div>
              )}

              {preview.affectedFiles && preview.affectedFiles.length > 0 && (
                <div className="preview-section">
                  <strong>Affected Files/Paths:</strong>
                  <ul>
                    {preview.affectedFiles.map((file, i) => (
                      <li key={i}><code>{file}</code></li>
                    ))}
                  </ul>
                </div>
              )}

              {preview.affectedProcesses && preview.affectedProcesses.length > 0 && (
                <div className="preview-section">
                  <strong>Affected Processes:</strong>
                  <ul>
                    {preview.affectedProcesses.map((proc, i) => (
                      <li key={i}><code>{proc}</code></li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="preview-section preview-followup">
                <strong>Refine This Command:</strong>
                <form className="followup-form" onSubmit={handleRefinement}>
                  <input
                    type="text"
                    className="bridge-input"
                    placeholder="Modify this command directly, example: audio only, use this URL https://..., keep same output name"
                    value={refinementInput}
                    onChange={(e) => setRefinementInput(e.target.value)}
                    disabled={refinementProcessing}
                  />
                  <button className="btn btn-sm" type="submit" disabled={!refinementInput.trim() || refinementProcessing}>
                    {refinementProcessing ? 'Refining...' : 'Refine'}
                  </button>
                  <button className="btn btn-sm" type="button" onClick={loadVariants} disabled={loadingVariants}>
                    {loadingVariants ? 'Loading...' : 'Suggest Alternatives'}
                  </button>
                </form>
                <p className="preview-params-hint">Ask follow-up questions about the same command instead of starting over.</p>
              </div>

              {variants.length > 0 && (
                <div className="preview-section variants-panel">
                  <strong>Alternative Commands:</strong>
                  <div className="variants-list">
                    {variants.map((variant, index) => (
                      <div key={`${variant.systemCommand}-${index}`} className="variant-card">
                        <div className="variant-head">
                          <span className="badge">Option {index + 1}</span>
                          <button
                            className="btn btn-sm"
                            onClick={() => {
                              setPreview((prev) => {
                                if (!prev) return prev;
                                return {
                                  ...prev,
                                  command: {
                                    ...prev.command,
                                    systemCommand: variant.systemCommand,
                                    explanation: variant.explanation || prev.command.explanation,
                                  },
                                };
                              });
                              setParamValues({});
                            }}
                          >
                            Use This
                          </button>
                        </div>
                        <pre className="command-code">{variant.systemCommand}</pre>
                        {variant.explanation && <p>{variant.explanation}</p>}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="preview-actions">
              {preview.command.safetyLevel !== SafetyLevel.DANGEROUS ? (
                <>
                  {bridgeConfig?.enabled && bridgeStatus === 'connected' ? (
                    <>
                      <button className="btn btn-primary" onClick={() => handleExecute()}>
                        {canUseRealExecution ? '🚀 Execute (Real)' : 'Execute (Simulate)'}
                      </button>
                      <button className="btn" onClick={() => handleExecute(false)}>
                        👁️ Simulate
                      </button>
                    </>
                  ) : (
                    realModeBlocked ? (
                      <>
                        <button className="btn btn-danger" onClick={() => setView('settings')}>
                          Connect Bridge for Real Mode
                        </button>
                        <button className="btn" onClick={() => handleExecute(false)}>
                          👁️ Simulate Instead
                        </button>
                      </>
                    ) : (
                      <button className="btn btn-primary" onClick={() => handleExecute(false)}>
                        Execute (Simulate)
                      </button>
                    )
                  )}
                  <button className="btn" onClick={handleCancel}>
                    Cancel
                  </button>
                  <button 
                    className="btn"
                    onClick={() => {
                      const name = prompt('Template name:', preview.command.naturalLanguage);
                      if (!name) return;
                      
                      const description = prompt('Description:', preview.command.explanation);
                      if (!description) return;
                      
                      CommandTemplatesManager.saveCustomTemplate({
                        name,
                        description,
                        naturalLanguage: preview.command.naturalLanguage,
                        category: 'Custom',
                        tags: [preview.command.category],
                      });
                      setTemplateVersion(v => v + 1);
                      
                      alert('Template saved! Check the Templates tab.');
                    }}
                  >
                    💾 Save as Template
                  </button>
                  <button 
                    className="btn"
                    onClick={() => addToFavorites(preview.command)}
                  >
                    ⭐ Save Command
                  </button>
                </>
              ) : (
                <button className="btn btn-danger" onClick={handleCancel}>
                  Command Blocked - Close
                </button>
              )}
            </div>
          </div>
        )}

        {/* Execution Result */}
        {executionResult && (
          <div className={`execution-result ${executionResult.success ? 'success' : 'error'}`}>
            <div className="execution-result-header">
              <h3>{executionResult.success ? '✅ Execution Successful' : '❌ Execution Failed'}</h3>
              <span className="execution-duration">⏱️ {executionResult.duration}ms</span>
            </div>
            
            {executionResult.stdout && (
              <div className="result-output-wrapper">
                <strong className="result-label">Output:</strong>
                <pre className="result-output">{executionResult.stdout}</pre>
                <button className="btn btn-sm copy-btn" onClick={() => copyText(executionResult.stdout || '', 'output')}>Copy Output</button>
              </div>
            )}
            
            {executionResult.stderr && (
              <div className="result-output-wrapper">
                <strong className="result-label error-label">Error Output:</strong>
                <pre className="result-error">{executionResult.stderr}</pre>
                <button className="btn btn-sm copy-btn" onClick={() => copyText(executionResult.stderr || '', 'error output')}>Copy Error</button>
              </div>
            )}
            
            {executionResult.error && (
              <div className="error-message-box">
                <span className="error-icon">⚠️</span>
                <p className="error-message">{executionResult.error}</p>
              </div>
            )}

            {!executionResult.success && preview && (
              <div className="result-actions-prominent">
                <h4>What would you like to do?</h4>
                <div className="action-buttons-grid">
                  <button 
                    className="action-btn retry-btn"
                    onClick={() => {
                      // Retry - re-execute the same command
                      handleExecute();
                    }}
                  >
                    <span className="action-icon">🔄</span>
                    <span className="action-text">
                      <strong>Retry</strong>
                      <small>Run the same command again</small>
                    </span>
                  </button>
                  
                  <button 
                    className="action-btn edit-btn"
                    onClick={() => {
                      // Edit - allow user to modify the natural language input
                      setInput(preview.command.naturalLanguage);
                      setPreview(null);
                      setExecutionResult(null);
                      inputRef.current?.focus();
                    }}
                  >
                    <span className="action-icon">✏️</span>
                    <span className="action-text">
                      <strong>Edit & Retry</strong>
                      <small>Modify the command and try again</small>
                    </span>
                  </button>
                  
                  <button 
                    className="action-btn cancel-btn"
                    onClick={() => {
                      // Cancel - clear everything
                      setPreview(null);
                      setExecutionResult(null);
                      setInput('');
                    }}
                  >
                    <span className="action-icon">✖️</span>
                    <span className="action-text">
                      <strong>Cancel</strong>
                      <small>Clear and start over</small>
                    </span>
                  </button>

                  <button 
                    className="action-btn help-btn"
                    onClick={() => {
                      const help = `Common solutions:\n\n` +
                        `• Check if the command syntax is correct\n` +
                        `• Verify file paths exist\n` +
                        `• Ensure you have necessary permissions\n` +
                        `• Try a simpler version of the command\n` +
                        `• Check the safety warnings\n\n` +
                        `Command: ${preview.command.systemCommand}`;
                      alert(help);
                    }}
                  >
                    <span className="action-icon">💡</span>
                    <span className="action-text">
                      <strong>Get Help</strong>
                      <small>Common solutions</small>
                    </span>
                  </button>
                </div>
              </div>
            )}
            
            {executionResult.success && preview && (
              <div className="result-success-actions">
                <button 
                  className="btn btn-sm"
                  onClick={() => addToFavorites(preview.command)}
                >
                  ⭐ Save Command
                </button>
                <button 
                  className="btn btn-sm"
                  onClick={() => {
                    setPreview(null);
                    setExecutionResult(null);
                    setInput('');
                  }}
                >
                  ✓ Done
                </button>
              </div>
            )}
          </div>
        )}

        {/* Suggestions */}
        {suggestions.length > 0 && !preview && (
          <div className="suggestions-section">
            <h3>Suggestions</h3>
            <div className="suggestion-list">
              {suggestions.map((sug) => (
                <div key={sug.id} className="suggestion-card" onClick={() => useSuggestion(sug)}>
                  <div className="suggestion-header">
                    <span className="suggestion-text">{sug.naturalLanguage}</span>
                    <span className="suggestion-confidence">
                      {Math.round(sug.confidence * 100)}%
                    </span>
                  </div>
                  <p className="suggestion-reason">{sug.reason}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Quick Stats */}
        {stats && (
          <div className="stats-section">
            <div className="stat-card">
              <span className="stat-label">Total Commands</span>
              <span className="stat-value">{stats.totalCommands}</span>
            </div>
            <div className="stat-card">
              <span className="stat-label">Patterns Learned</span>
              <span className="stat-value">{stats.totalPatterns}</span>
            </div>
            <div className="stat-card">
              <span className="stat-label">Macros</span>
              <span className="stat-value">{stats.totalMacros}</span>
            </div>
          </div>
        )}
      </div>
    );
  }

  // Favorites view
  if (view === 'favorites') {
    return (
      <div className="tab-panel commandbrain-panel">
        <div className="commandbrain-header">
          <h2>⭐ Saved Commands</h2>
          <p>Commands you saved for fast reuse and safe recall.</p>
          {bridgeConfig?.enabled && bridgeStatus === 'connected' && (
            <div className="bridge-banner connected">
              🚀 Real Execution: Enabled
            </div>
          )}
          <div className="view-tabs">
            <button className="tab-btn" onClick={() => setView('main')}>Command</button>
            <button className="tab-btn active" onClick={() => setView('favorites')}>⭐ Saved</button>
            <button className="tab-btn" onClick={() => setView('templates')}>Templates</button>
            <button className="tab-btn" onClick={() => setView('history')}>History</button>
            <button className="tab-btn" onClick={() => setView('macros')}>Macros</button>
            <button className="tab-btn" onClick={() => setView('analytics')}>Analytics</button>
            <button className="tab-btn" onClick={() => setView('settings')}>Settings</button>
          </div>
          {renderGlobalSearch()}
        </div>

        {copyNotice && (
          <div className={`action-notice ${copyNotice.kind}`}>
            {copyNotice.message}
          </div>
        )}

        {renderGlobalProcessing()}

        <div className="favorites-list">
          <div className="saved-filters">
            <input
              type="text"
              className="bridge-input"
              placeholder="Search saved commands by name, command, tag, notes..."
              value={savedSearch}
              onChange={(e) => setSavedSearch(e.target.value)}
            />
            <select
              className="bridge-input"
              value={savedFolderFilter}
              onChange={(e) => setSavedFolderFilter(e.target.value)}
            >
              {savedFolders.map((folder) => (
                <option key={folder} value={folder}>{folder}</option>
              ))}
            </select>
          </div>

          {favorites.length === 0 ? (
            <div className="empty-state">
              <p>No saved commands yet. Save commands from preview or history to keep them here.</p>
              <p className="favorites-empty-note">
                Saved commands let you quickly re-run important commands with a single click.
              </p>
            </div>
          ) : filteredSavedCommands.length === 0 ? (
            <div className="empty-state">
              <p>No saved commands match your current filters.</p>
            </div>
          ) : (
            <div className="favorites-grid">
              {filteredSavedCommands.map((fav) => (
                <div key={fav.id} className="favorite-card">
                  <div className="favorite-header">
                    <h3>{fav.label || fav.naturalLanguage}</h3>
                    {renderSafetyBadge(fav.safetyLevel)}
                  </div>
                  
                  {fav.label && (
                    <p className="favorite-command-text">{fav.naturalLanguage}</p>
                  )}
                  
                  <pre className="favorite-system-command">{fav.systemCommand}</pre>
                  
                  <p className="favorite-description">{fav.description}</p>

                  {(fav.folder || (fav.tags && fav.tags.length > 0)) && (
                    <div className="favorite-classification">
                      {fav.folder && <span className="saved-folder-chip">📁 {fav.folder}</span>}
                      {(fav.tags || []).map((tag) => (
                        <span key={tag} className="saved-tag-chip">#{tag}</span>
                      ))}
                    </div>
                  )}
                  
                  {fav.notes && (
                    <p className="favorite-notes">📝 {fav.notes}</p>
                  )}
                  
                  <div className="favorite-meta">
                    <span className="favorite-usage">Used {fav.usageCount} times</span>
                    {fav.lastUsed && (
                      <span className="favorite-last-used">
                        Last: {new Date(fav.lastUsed).toLocaleDateString()}
                      </span>
                    )}
                  </div>
                  
                  {fav.lastExecutionFailed && (
                    <div className="favorite-warning">
                      ⚠️ Failed last time - review before running
                    </div>
                  )}
                  
                  <div className="favorite-actions">
                    <button 
                      className="btn btn-primary btn-sm" 
                      onClick={() => executeFavorite(fav)}
                      disabled={processing}
                    >
                      ▶️ Run
                    </button>
                    <button 
                      className="btn btn-sm" 
                      onClick={() => {
                        setInput(fav.naturalLanguage);
                        setView('main');
                        inputRef.current?.focus();
                      }}
                    >
                      ✏️ Edit
                    </button>
                    <button 
                      className="btn btn-sm" 
                      onClick={() => copyText(fav.systemCommand, 'saved command')}
                    >
                      📋 Copy
                    </button>
                    <button
                      className="btn btn-sm"
                      onClick={() => editSavedMetadata(fav)}
                    >
                      🏷️ Details
                    </button>
                    <button 
                      className="btn btn-danger btn-sm"
                      onClick={() => removeFromFavorites(fav.id)}
                    >
                      🗑️ Remove
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {favorites.length > 0 && (
          <div className="favorites-stats favorites-stats-panel">
            <strong>Total Saved:</strong> {favorites.length} | 
            <strong className="favorites-most-used-label">Most Used:</strong> {favorites.reduce((max, f) => f.usageCount > max.usageCount ? f : max, favorites[0])?.label || favorites[0]?.naturalLanguage}
          </div>
        )}
      </div>
    );
  }

  // Templates view
  if (view === 'templates') {
    return (
      <div className="tab-panel commandbrain-panel">
        <div className="commandbrain-header">
          <h2>Command Templates</h2>
          <p>Quick access to common commands</p>
          <div className="view-tabs">
            <button className="tab-btn" onClick={() => setView('main')}>Command</button>
            <button className="tab-btn" onClick={() => setView('favorites')}>⭐ Saved</button>
            <button className="tab-btn active" onClick={() => setView('templates')}>Templates</button>
            <button className="tab-btn" onClick={() => setView('history')}>History</button>
            <button className="tab-btn" onClick={() => setView('macros')}>Macros</button>
            <button className="tab-btn" onClick={() => setView('analytics')}>Analytics</button>
            <button className="tab-btn" onClick={() => setView('settings')}>Settings</button>
          </div>
          {renderGlobalSearch()}
        </div>

        {copyNotice && (
          <div className={`action-notice ${copyNotice.kind}`}>
            {copyNotice.message}
          </div>
        )}

        {renderGlobalProcessing()}

        <div className="template-filters">
          <input
            type="text"
            className="command-input template-search"
            placeholder="Search templates by name, description, or tags"
            value={templateSearch}
            onChange={(e) => setTemplateSearch(e.target.value)}
          />
          <select
            className="bridge-input template-category-select"
            aria-label="Template category filter"
            title="Template category filter"
            value={templateCategory}
            onChange={(e) => setTemplateCategory(e.target.value)}
          >
            <option value="All">All Categories</option>
            {categories.map((category) => (
              <option key={category} value={category}>{category}</option>
            ))}
          </select>
        </div>

        <div className="templates-container">
          {filteredTemplates.length === 0 && (
            <div className="empty-state">
              <p>No templates match your current search/filter.</p>
            </div>
          )}
          {categories.map(category => {
            const categoryTemplates = filteredTemplates.filter(t => t.category === category);
            if (categoryTemplates.length === 0) return null;
            return (
              <div key={category} className="template-category">
                <h3 className="category-title">{category}</h3>
                <div className="template-grid">
                  {categoryTemplates.map(template => (
                    <div 
                      key={template.id} 
                      className="template-card"
                      onClick={() => {
                        openCommandPreview(template.naturalLanguage);
                      }}
                    >
                      <div className="template-header">
                        <strong>{template.name}</strong>
                        <div className="template-header-actions">
                          <button
                            className="btn-icon-small"
                            onClick={(e) => {
                              e.stopPropagation();
                              copyText(template.naturalLanguage, 'template command');
                            }}
                            title="Copy command"
                          >
                            ⧉
                          </button>
                          {!template.isBuiltIn && (
                            <button
                              className="btn-icon-small"
                              onClick={(e) => {
                                e.stopPropagation();
                                if (confirm(`Delete template "${template.name}"?`)) {
                                  CommandTemplatesManager.deleteCustomTemplate(template.id);
                                  setTemplateVersion(v => v + 1);
                                }
                              }}
                              title="Delete template"
                            >
                              ×
                            </button>
                          )}
                        </div>
                      </div>
                      <p className="template-description">{template.description}</p>
                      <code className="template-command">{template.naturalLanguage}</code>
                      <div className="template-card-actions">
                        <button
                          className="btn btn-sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            openCommandPreview(template.naturalLanguage);
                          }}
                        >
                          Preview
                        </button>
                        <button
                          className="btn btn-primary btn-sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            runNaturalLanguage(template.naturalLanguage, 'template');
                          }}
                        >
                          {canUseRealExecution ? 'Run Real' : 'Run'}
                        </button>
                        <button
                          className="btn btn-sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            void sendTemplateToTerminal(template.naturalLanguage);
                          }}
                        >
                          Terminal
                        </button>
                      </div>
                      <div className="template-tags">
                        {template.tags.map(tag => (
                          <span key={tag} className="tag">{tag}</span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        <button 
          className="btn btn-primary templates-add-btn"
          onClick={() => {
            const name = prompt('Template name:');
            if (!name) return;
            
            const description = prompt('Description:');
            if (!description) return;
            
            const naturalLanguage = prompt('Command (natural language):');
            if (!naturalLanguage) return;
            
            const category = prompt('Category:', 'Custom');
            const tags = prompt('Tags (comma-separated):', '')?.split(',').map(t => t.trim()).filter(Boolean) || [];
            
            CommandTemplatesManager.saveCustomTemplate({
              name,
              description,
              naturalLanguage,
              category: category || 'Custom',
              tags,
            });

            setTemplateVersion(v => v + 1);
          }}
        >
          + Add Custom Template
        </button>
      </div>
    );
  }

  // History view
  if (view === 'history') {
    return (
      <div className="tab-panel commandbrain-panel">
        <div className="commandbrain-header">
          <h2>Command History</h2>
          <div className="view-tabs">
            <button className="tab-btn" onClick={() => setView('favorites')}>⭐ Saved</button>
            <button className="tab-btn" onClick={() => setView('main')}>Command</button>
            <button className="tab-btn" onClick={() => setView('templates')}>Templates</button>
            <button className="tab-btn active" onClick={() => setView('history')}>History</button>
            <button className="tab-btn" onClick={() => setView('macros')}>Macros</button>
            <button className="tab-btn" onClick={() => setView('analytics')}>Analytics</button>
            <button className="tab-btn" onClick={() => setView('settings')}>Settings</button>
          </div>
          {renderGlobalSearch()}
        </div>

        {copyNotice && (
          <div className={`action-notice ${copyNotice.kind}`}>
            {copyNotice.message}
          </div>
        )}

        {renderGlobalProcessing()}

        {history.length > 0 && (
          <div className="history-bulk-bar">
            <div className="history-bulk-left">
              <strong>{selectedHistoryIds.size}</strong>
              <span>selected</span>
            </div>
            <div className="history-bulk-actions">
              <button className="btn btn-sm" onClick={selectAllHistory}>Select All</button>
              <button className="btn btn-sm" onClick={clearHistorySelection} disabled={selectedHistoryIds.size === 0}>Clear</button>
              <button className="btn btn-sm" onClick={exportSelectedHistory} disabled={selectedHistoryIds.size === 0}>Export Selected</button>
              <button className="btn btn-sm" onClick={createMacroFromSelected} disabled={selectedHistoryIds.size === 0}>Create Macro</button>
              <button className="btn btn-danger btn-sm" onClick={deleteSelectedHistory} disabled={selectedHistoryIds.size === 0}>Delete Selected</button>
            </div>
          </div>
        )}

        <div className="history-list">
          {history.length === 0 ? (
            <div className="empty-state">
              <p>No command history yet. Start by entering a command.</p>
            </div>
          ) : (
            history.map((cmd) => (
              <div key={cmd.id} className={`history-card ${selectedHistoryIds.has(cmd.id) ? 'selected' : ''}`}>
                <div className="history-header">
                  <label className="history-select">
                    <input
                      type="checkbox"
                      checked={selectedHistoryIds.has(cmd.id)}
                      onChange={() => toggleSelectHistory(cmd.id)}
                    />
                  </label>
                  <span className="history-nl">{cmd.naturalLanguage}</span>
                  {renderSafetyBadge(cmd.safetyLevel)}
                  <span className="history-count">x{cmd.executionCount}</span>
                </div>
                <pre className="history-command">{cmd.systemCommand}</pre>
                <p className="history-explanation">{cmd.explanation}</p>
                <div className="history-actions">
                  <button
                    className="btn btn-primary btn-sm"
                    disabled={runningCommandId === cmd.id}
                    onClick={() => rerunCommand(cmd)}
                  >
                    {runningCommandId === cmd.id ? '⏳ Running...' : (canUseRealExecution ? '▶️ Run Real' : '▶️ Run')}
                  </button>
                  <button
                    className="btn btn-sm"
                    disabled={runningCommandId === cmd.id}
                    onClick={() => runNaturalLanguage(cmd.naturalLanguage, 'history', cmd.id)}
                  >
                    {runningCommandId === cmd.id ? '⏳...' : '⚡ Quick Run'}
                  </button>
                  <button className="btn btn-sm" onClick={() => openCommandPreview(cmd.naturalLanguage)}>
                    👁️ Preview
                  </button>
                  <button className="btn btn-sm" onClick={() => editHistoryCommand(cmd)}>
                    ✏️ Edit
                  </button>
                  <button className="btn btn-sm" onClick={() => copyText(cmd.systemCommand, 'history command')}>
                    📋 Copy
                  </button>
                  <button className="btn btn-sm" onClick={() => copyForTerminal(cmd.systemCommand)}>
                    🖥️ Terminal
                  </button>
                  <button 
                    className="btn btn-sm" 
                    onClick={() => addToFavorites(cmd)}
                  >
                    ⭐ Save
                  </button>
                  <span className="history-date">
                    {new Date(cmd.createdAt).toLocaleString()}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    );
  }

  // Macros view
  if (view === 'macros') {
    return (
      <div className="tab-panel commandbrain-panel">
        <div className="commandbrain-header">
          <h2>Macros & Automation</h2>
          <p>Create reusable command batches from history or manual input.</p>
          <div className="view-tabs">
            <button className="tab-btn" onClick={() => setView('main')}>Command</button>
            <button className="tab-btn" onClick={() => setView('favorites')}>⭐ Saved</button>
            <button className="tab-btn" onClick={() => setView('templates')}>Templates</button>
            <button className="tab-btn" onClick={() => setView('history')}>History</button>
            <button className="tab-btn active" onClick={() => setView('macros')}>Macros</button>
            <button className="tab-btn" onClick={() => setView('analytics')}>Analytics</button>
            <button className="tab-btn" onClick={() => setView('settings')}>Settings</button>
          </div>
          {renderGlobalSearch()}
        </div>

        {copyNotice && (
          <div className={`action-notice ${copyNotice.kind}`}>
            {copyNotice.message}
          </div>
        )}

        {renderGlobalProcessing()}

        {error && (
          <div className="error-banner">
            <strong>Error:</strong> {error}
          </div>
        )}

        <div className="macro-toolbar">
          <button className="btn btn-primary" onClick={openMacroForm}>+ Create Macro</button>
        </div>

        {macroFormOpen && (
          <div className="macro-form-panel">
            <h3>Create Macro</h3>
            <div className="macro-form-grid">
              <label>
                Name
                <input
                  type="text"
                  className="command-input"
                  value={macroFormName}
                  onChange={(e) => setMacroFormName(e.target.value)}
                  placeholder="Build & Test"
                />
              </label>
              <label>
                Trigger
                <input
                  type="text"
                  className="command-input"
                  value={macroFormTrigger}
                  onChange={(e) => setMacroFormTrigger(e.target.value)}
                  placeholder="build-test"
                />
              </label>
              <label className="macro-form-span-2">
                Description
                <input
                  type="text"
                  className="command-input"
                  value={macroFormDescription}
                  onChange={(e) => setMacroFormDescription(e.target.value)}
                  placeholder="Runs core project checks"
                />
              </label>
              <label className="macro-form-span-2">
                Commands (one per line)
                <textarea
                  className="macro-command-textarea"
                  value={macroFormCommands}
                  onChange={(e) => setMacroFormCommands(e.target.value)}
                  placeholder={`npm install\nnpm run build`}
                />
              </label>
            </div>
            {macroFormError && <div className="error-banner"><strong>Error:</strong> {macroFormError}</div>}
            <div className="macro-form-actions">
              <button className="btn btn-primary" onClick={createMacro}>Save Macro</button>
              <button className="btn" onClick={() => setMacroFormOpen(false)}>Cancel</button>
            </div>
          </div>
        )}

        {macroRunProgress && (
          <div className="macro-progress-panel">
            <div className="macro-output-header">
              <h3>Macro Process: {macroRunProgress.macroName}</h3>
              <span className="history-date">Started {new Date(macroRunProgress.startedAt).toLocaleTimeString()}</span>
            </div>
            <div className="macro-output-list">
              {macroRunProgress.steps.map((step, index) => (
                <div
                  key={`${step.command}-${index}`}
                  className={`macro-output-step ${step.status === 'success' ? 'success' : step.status === 'error' ? 'error' : 'running'}`}
                >
                  <div className="macro-output-step-head">
                    <strong>Step {index + 1}</strong>
                    <span>
                      {step.status === 'pending' && 'Pending'}
                      {step.status === 'running' && 'Running...'}
                      {step.status === 'success' && 'Done'}
                      {step.status === 'error' && 'Failed'}
                    </span>
                  </div>
                  <div className="macro-output-command">{step.command}</div>
                  <div className="macro-copy-actions">
                    <button className="btn btn-sm copy-btn" onClick={() => copyText(step.command, `macro step ${index + 1} command`)}>Copy Command</button>
                  </div>
                  {step.result?.stdout && (
                    <>
                      <pre className="result-output">{step.result.stdout}</pre>
                      <div className="macro-copy-actions">
                        <button className="btn btn-sm copy-btn" onClick={() => copyText(step.result?.stdout || '', `macro step ${index + 1} output`)}>Copy Output</button>
                      </div>
                    </>
                  )}
                  {step.result?.stderr && (
                    <>
                      <pre className="result-error">{step.result.stderr}</pre>
                      <div className="macro-copy-actions">
                        <button className="btn btn-sm copy-btn" onClick={() => copyText(step.result?.stderr || '', `macro step ${index + 1} error output`)}>Copy Error</button>
                      </div>
                    </>
                  )}
                  {step.result?.error && <div className="error-banner"><strong>Error:</strong> {step.result.error}</div>}
                </div>
              ))}
            </div>
          </div>
        )}

        {macroRunSummary && (
          <div className="macro-output-panel">
            <div className="macro-output-header">
              <h3>Last Macro Run: {macroRunSummary.macroName}</h3>
              <span className="history-date">{new Date(macroRunSummary.runAt).toLocaleString()}</span>
            </div>
            <div className="macro-output-list">
              {macroRunSummary.results.map((result, i) => (
                <div key={i} className={`macro-output-step ${result.success ? 'success' : 'error'}`}>
                  <div className="macro-output-step-head">
                    <strong>Step {i + 1}</strong>
                    <span>{result.success ? '✅ Success' : '❌ Failed'}</span>
                  </div>
                  <div className="macro-output-command">{macroRunSummary.commands[i] || 'N/A'}</div>
                  <div className="macro-copy-actions">
                    <button className="btn btn-sm copy-btn" onClick={() => copyText(macroRunSummary.commands[i] || '', `macro step ${i + 1} command`)}>Copy Command</button>
                  </div>
                  {result.stdout && (
                    <>
                      <pre className="result-output">{result.stdout}</pre>
                      <div className="macro-copy-actions">
                        <button className="btn btn-sm copy-btn" onClick={() => copyText(result.stdout || '', `macro step ${i + 1} output`)}>Copy Output</button>
                      </div>
                    </>
                  )}
                  {result.stderr && (
                    <>
                      <pre className="result-error">{result.stderr}</pre>
                      <div className="macro-copy-actions">
                        <button className="btn btn-sm copy-btn" onClick={() => copyText(result.stderr || '', `macro step ${i + 1} error output`)}>Copy Error</button>
                      </div>
                    </>
                  )}
                  {result.error && <div className="error-banner"><strong>Error:</strong> {result.error}</div>}
                  <div className="result-meta">Duration: {result.duration}ms</div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="macro-list">
          {macros.length === 0 ? (
            <div className="empty-state">
              <p>No macros yet. Macros allow you to chain multiple commands together.</p>
            </div>
          ) : (
            macros.map((macro) => (
              <div key={macro.id} className="macro-card">
                <div className="macro-header">
                  <h3>{macro.name}</h3>
                  <span className="macro-count">x{macro.executionCount}</span>
                </div>
                <p className="macro-description">{macro.description}</p>
                <div className="macro-commands">
                  <strong>Commands ({macro.commands.length}):</strong>
                  <ol>
                    {macro.commands.map((cmd, i) => (
                      <li key={i}>
                        <span>{cmd}</span>
                        <button className="btn btn-sm copy-btn" onClick={() => copyText(cmd, `macro command ${i + 1}`)}>Copy</button>
                      </li>
                    ))}
                  </ol>
                </div>
                <div className="macro-actions">
                  <button 
                    className="btn btn-primary btn-sm" 
                    onClick={() => executeMacro(macro)}
                    disabled={processing}
                  >
                    Execute
                  </button>
                  <button 
                    className="btn btn-danger btn-sm"
                    onClick={async () => {
                      if (confirm(`Delete macro "${macro.name}"?`)) {
                        await CommandBrain.deleteMacro(macro.id);
                        await loadMacros();
                      }
                    }}
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    );
  }

  // Analytics view
  if (view === 'analytics') {
    const maxCategory = Math.max(...categoryData.map((c) => c.count), 1);
    const maxSafety = Math.max(...safetyData.map((s) => s.count), 1);
    const maxDaily = Math.max(...dailyData.map((d) => d.count), 1);

    return (
      <div className="tab-panel commandbrain-panel">
        <div className="commandbrain-header">
          <div className="analytics-header-row">
            <div>
              <h2>Analytics</h2>
              <p>Understand command behavior, risk profile, and top execution patterns.</p>
            </div>
            <button className="btn btn-sm" onClick={exportAnalyticsCSV} disabled={history.length === 0}>
              ⬇️ Export CSV
            </button>
          </div>
          <div className="view-tabs">
            <button className="tab-btn" onClick={() => setView('main')}>Command</button>
            <button className="tab-btn" onClick={() => setView('templates')}>Templates</button>
            <button className="tab-btn" onClick={() => setView('history')}>History</button>
            <button className="tab-btn" onClick={() => setView('macros')}>Macros</button>
            <button className="tab-btn active" onClick={() => setView('analytics')}>Analytics</button>
            <button className="tab-btn" onClick={() => setView('settings')}>Settings</button>
          </div>
          {renderGlobalSearch()}
        </div>

        {copyNotice && (
          <div className={`action-notice ${copyNotice.kind}`}>
            {copyNotice.message}
          </div>
        )}

        {renderGlobalProcessing()}

        <div className="analytics-grid">
          <div className="analytics-card">
            <h3>Commands By Category</h3>
            <div className="analytics-bars">
              {categoryData.length === 0 && <p className="empty-state">No history yet.</p>}
              {categoryData.map((item) => (
                <button
                  key={item.name}
                  className={`analytics-bar-btn ${analyticsCategoryFilter === item.name ? 'active' : ''}`}
                  onClick={() => setAnalyticsCategoryFilter((prev) => (prev === item.name ? 'All' : item.name))}
                >
                  <span className="analytics-bar-label">{item.name}</span>
                  <span className="analytics-bar-track">
                    <span
                      className="analytics-bar-fill"
                      style={{ width: `${(item.count / maxCategory) * 100}%` }}
                    ></span>
                  </span>
                  <span className="analytics-bar-count">{item.count}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="analytics-card">
            <h3>Safety Distribution</h3>
            <div className="analytics-bars">
              {safetyData.length === 0 && <p className="empty-state">No safety data yet.</p>}
              {safetyData.map((item) => (
                <button
                  key={item.name}
                  className={`analytics-bar-btn ${analyticsSafetyFilter === item.name ? 'active' : ''}`}
                  onClick={() => setAnalyticsSafetyFilter((prev) => (prev === item.name ? 'All' : item.name))}
                >
                  <span className="analytics-bar-label">{item.name}</span>
                  <span className="analytics-bar-track">
                    <span
                      className={`analytics-bar-fill safety-${item.name}`}
                      style={{ width: `${(item.count / maxSafety) * 100}%` }}
                    ></span>
                  </span>
                  <span className="analytics-bar-count">{item.count}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="analytics-card analytics-card-wide">
            <h3>Commands Per Day <span className="analytics-card-sub">(last 14 days)</span></h3>
            <div className="analytics-ts-grid">
              {dailyData.every((d) => d.count === 0) && (
                <p className="empty-state">No commands in the last 14 days.</p>
              )}
              {dailyData.map((item) => (
                <div key={item.date} className="analytics-ts-row">
                  <span className="analytics-ts-label">{item.date}</span>
                  <span className="analytics-ts-track">
                    <span
                      className="analytics-ts-fill"
                      style={{ width: `${(item.count / maxDaily) * 100}%` }}
                    />
                  </span>
                  <span className="analytics-ts-count">{item.count}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="analytics-card analytics-card-wide">
            <div className="analytics-card-head">
              <h3>Top Command Patterns</h3>
              <div className="analytics-filter-row">
                <label>
                  Category
                  <select
                    className="bridge-input analytics-select"
                    value={analyticsCategoryFilter}
                    onChange={(e) => setAnalyticsCategoryFilter(e.target.value)}
                  >
                    <option value="All">All</option>
                    {categoryData.map((item) => (
                      <option key={item.name} value={item.name}>{item.name}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Safety
                  <select
                    className="bridge-input analytics-select"
                    value={analyticsSafetyFilter}
                    onChange={(e) => setAnalyticsSafetyFilter(e.target.value)}
                  >
                    <option value="All">All</option>
                    <option value="safe">safe</option>
                    <option value="caution">caution</option>
                    <option value="dangerous">dangerous</option>
                  </select>
                </label>
              </div>
            </div>

            <div className="analytics-table-wrap">
              <table className="analytics-table">
                <thead>
                  <tr>
                    <th>Natural Language</th>
                    <th>System Command</th>
                    <th>Runs</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredAnalyticsCommands.length === 0 && (
                    <tr>
                      <td colSpan={4}>No commands for current filters.</td>
                    </tr>
                  )}
                  {topCommandPatterns
                    .filter((row) => {
                      const cmd = history.find(
                        (h) => h.naturalLanguage === row.naturalLanguage && h.systemCommand === row.systemCommand
                      );
                      if (!cmd) return false;
                      const byCategory = analyticsCategoryFilter === 'All' || cmd.category === analyticsCategoryFilter;
                      const bySafety = analyticsSafetyFilter === 'All' || cmd.safetyLevel === analyticsSafetyFilter;
                      return byCategory && bySafety;
                    })
                    .map((row, index) => (
                      <tr key={`${row.naturalLanguage}-${index}`}>
                        <td>{row.naturalLanguage}</td>
                        <td><code>{row.systemCommand}</code></td>
                        <td>{row.count}</td>
                        <td>
                          <button className="btn btn-sm" onClick={() => copyText(row.systemCommand, 'analytics command')}>Copy</button>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Settings view
  if (view === 'settings') {
    return (
      <div className="tab-panel commandbrain-panel">
        <div className="commandbrain-header">
          <h2>Settings</h2>
          <div className="view-tabs">
            <button className="tab-btn" onClick={() => setView('main')}>Command</button>
            <button className="tab-btn" onClick={() => setView('templates')}>Templates</button>
            <button className="tab-btn" onClick={() => setView('history')}>History</button>
            <button className="tab-btn" onClick={() => setView('macros')}>Macros</button>
            <button className="tab-btn" onClick={() => setView('analytics')}>Analytics</button>
            <button className="tab-btn active" onClick={() => setView('settings')}>Settings</button>
          </div>
          {renderGlobalSearch()}
        </div>

        {copyNotice && (
          <div className={`action-notice ${copyNotice.kind}`}>
            {copyNotice.message}
          </div>
        )}

        <div className="settings-section">
          <h3>Execution Bridge Configuration</h3>
          <p className="bridge-info">
            Enable real command execution via local bridge server. 
            <a href="#" onClick={(e) => {
              e.preventDefault();
              alert('See EXECUTION_SECURITY.md for detailed security information.');
            }}>Read security guide</a>
          </p>
          
          <div className="bridge-config">
            <div className="config-row">
              <label className="checkbox-label">
                <input 
                  type="checkbox" 
                  checked={bridgeConfig?.enabled || false}
                  onChange={(e) => {
                    const bridge = CommandBrain.getBridgeClient();
                    bridge.configure({ 
                      ...bridgeConfig, 
                      enabled: e.target.checked 
                    });
                    loadBridgeConfig();
                  }}
                />
                Enable Real Execution
              </label>
              {bridgeStatus === 'connected' && <span className="status-indicator status-connected">● Connected</span>}
              {bridgeStatus === 'disconnected' && <span className="status-indicator status-disconnected">● Disconnected</span>}
            </div>
            
            {bridgeConfig?.enabled && (
              <>
                <div className="config-row">
                  <label>Bridge URL:</label>
                  <input 
                    type="text" 
                    value={bridgeConfig.url || 'http://localhost:3001'}
                    onChange={(e) => {
                      const bridge = CommandBrain.getBridgeClient();
                      bridge.configure({ 
                        ...bridgeConfig, 
                        url: e.target.value 
                      });
                      loadBridgeConfig();
                    }}
                    placeholder="http://localhost:3001"
                    className="bridge-input"
                  />
                </div>
                
                <div className="config-row">
                  <label>Auth Token:</label>
                  <input 
                    type="password" 
                    value={bridgeConfig.authToken || ''}
                    onChange={(e) => {
                      const bridge = CommandBrain.getBridgeClient();
                      bridge.configure({ 
                        ...bridgeConfig, 
                        authToken: e.target.value 
                      });
                      loadBridgeConfig();
                    }}
                    placeholder="Enter auth token"
                    className="bridge-input"
                  />
                  <button 
                    className="btn btn-sm"
                    onClick={async () => {
                      try {
                        const bridge = CommandBrain.getBridgeClient();
                        const keyResult = await bridge.getAuthKey();
                        if (!keyResult.success || !keyResult.key) {
                          alert(`Failed to get auth key: ${keyResult.error || 'Unknown error'}`);
                          return;
                        }

                        bridge.configure({
                          ...bridgeConfig,
                          authToken: keyResult.key,
                        });
                        loadBridgeConfig();
                        alert('Auth key fetched and saved. Click Test Connection next.');
                      } catch (err) {
                        alert(`Failed to get auth key: ${err instanceof Error ? err.message : String(err)}`);
                      }
                    }}
                  >
                    Get Key from Bridge
                  </button>
                </div>
                
                <div className="config-row">
                  <button 
                    className="btn"
                    onClick={async () => {
                      const ok = await testBridgeConnection();
                      alert(ok ? 'Bridge connected!' : 'Bridge connection failed!');
                    }}
                  >
                    Test Connection
                  </button>
                </div>

                <div className="bridge-diagnostics">
                  <h4>Bridge Diagnostics</h4>
                  <ul>
                    <li>Mode: {executionMode === 'real' ? 'Real' : 'Simulation'}</li>
                    <li>Status: {bridgeStatus}</li>
                    <li>Last Check: {bridgeDiagnostics.lastCheckAt ? new Date(bridgeDiagnostics.lastCheckAt).toLocaleString() : 'Never'}</li>
                    <li>Last Latency: {bridgeDiagnostics.lastLatencyMs ? `${bridgeDiagnostics.lastLatencyMs}ms` : 'N/A'}</li>
                    <li>Last Message: {bridgeDiagnostics.lastMessage}</li>
                    <li>Last Execution: {bridgeDiagnostics.lastExecutionAt ? new Date(bridgeDiagnostics.lastExecutionAt).toLocaleString() : 'Never'}</li>
                    <li>Last Result: {bridgeDiagnostics.lastExecutionSuccess === null ? 'N/A' : (bridgeDiagnostics.lastExecutionSuccess ? 'Success' : 'Failed')}</li>
                    <li>Last Duration: {bridgeDiagnostics.lastExecutionDuration ? `${bridgeDiagnostics.lastExecutionDuration}ms` : 'N/A'}</li>
                    {bridgeDiagnostics.lastExecutionError && (
                      <li className="diag-error">Last Error: {bridgeDiagnostics.lastExecutionError}</li>
                    )}
                  </ul>
                </div>
              </>
            )}
          </div>
        </div>

        <div className="settings-section">
          <h3>Data Management</h3>
          <div className="storage-info-panel">
            <h4>Storage Locations</h4>
            <ul>
              <li><strong>Primary DB:</strong> IndexedDB ({storageInfo.indexedDbName})</li>
              <li><strong>Stores:</strong> {storageInfo.indexedDbStores.join(', ')}</li>
              <li><strong>localStorage Keys:</strong> {storageInfo.localStorageKeys.join(', ')}</li>
              <li><strong>Estimated localStorage used:</strong> {storageInfo.localStorageBytes} bytes</li>
              <li><strong>In-memory loaded counts:</strong> History {storageInfo.inMemoryCounts.history}, Saved {storageInfo.inMemoryCounts.saved}, Macros {storageInfo.inMemoryCounts.macros}</li>
            </ul>
            <p className="bridge-info">Commands, saved commands, macros, and patterns are persisted in IndexedDB. Bridge config and custom templates are in localStorage.</p>
          </div>

          <div className="cache-health-panel">
            <h4>Model Cache Health (CommandBrain LLM)</h4>
            <ul>
              <li>Cache Metadata: {cacheHealth.exists ? 'Present' : 'Missing'}</li>
              <li>Cached Model: {cacheHealth.modelName || 'N/A'}</li>
              <li>Last Cached Load: {cacheHealth.lastLoadedAt ? new Date(cacheHealth.lastLoadedAt).toLocaleString() : 'Never'}</li>
              <li>Metadata Size: {cacheHealth.metadataSizeBytes} bytes</li>
            </ul>
            <div className="settings-actions">
              <button className="btn" onClick={refreshCacheHealth}>Refresh Cache Health</button>
              <button
                className="btn btn-danger"
                onClick={() => {
                  clearModelCacheInfo(ModelCategory.Language);
                  refreshCacheHealth();
                  alert('Cache metadata cleared. Actual downloaded model artifacts may still exist in browser storage.');
                }}
              >
                Clear Cache Metadata
              </button>
            </div>
          </div>

          <div className="settings-actions">
            <button 
              className="btn"
              onClick={async () => {
                const data = await CommandBrain.exportData();
                const blob = new Blob([data], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `commandbrain-export-${Date.now()}.json`;
                a.click();
                URL.revokeObjectURL(url);
              }}
            >
              Export Data
            </button>
            
            <button 
              className="btn btn-danger"
              onClick={async () => {
                if (confirm('Clear all data? This cannot be undone!')) {
                  await CommandBrain.clearAllData();
                  alert('All data cleared');
                  await loadHistory();
                  await loadMacros();
                  await loadStats();
                }
              }}
            >
              Clear All Data
            </button>
          </div>

          {stats && (
            <div className="settings-stats">
              <h3>Statistics</h3>
              <ul>
                <li>Total Commands: {stats.totalCommands}</li>
                <li>Total Patterns: {stats.totalPatterns}</li>
                <li>Total Macros: {stats.totalMacros}</li>
                <li>Total Saved Commands: {stats.totalFavorites || 0}</li>
                <li>Most Frequent Category: {stats.mostFrequentCategory}</li>
                <li>Average Execution Count: {stats.averageExecutionCount.toFixed(2)}</li>
                <li>Pattern Efficiency: {(stats.patternEfficiency * 100).toFixed(1)}%</li>
              </ul>
              
              <h3 className="settings-subsection-title">Execution Statistics</h3>
              <ul>
                <li>Total Executions: {stats.totalExecutions || 0}</li>
                <li>Successful Commands: <span className="stat-success">{stats.successfulCommands || 0}</span></li>
                <li>Failed Commands: <span className="stat-fail">{stats.failedCommands || 0}</span></li>
                <li>Success Rate: <span className={stats.successRate >= 0.8 ? 'stat-success' : stats.successRate >= 0.5 ? 'stat-warn' : 'stat-fail'}>
                  {((stats.successRate || 0) * 100).toFixed(1)}%
                </span></li>
              </ul>
              
              {stats.successRate < 0.5 && stats.totalExecutions > 5 && (
                <div className="settings-warning-box">
                  ⚠️ Low success rate detected. Consider reviewing your commands or checking system compatibility.
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  return null;
}
