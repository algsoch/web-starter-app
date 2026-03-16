# CommandBrain Quick Start Guide

Get started with RunAnywhere CommandBrain in 5 minutes.

## Prerequisites

- Node.js 18+ and npm
- Modern browser (Chrome 96+, Edge 96+, Safari 15.4+, Firefox 100+)
- ~500MB free disk space for AI models

## Installation

```bash
# Clone or navigate to the project
cd web-starter-app

# Install dependencies (if not already done)
npm install

# Start development server
npm run dev
```

The app will open at `http://localhost:5173`

## First Steps

### 1. Initialize the SDK

When you first open the app, click the "CommandBrain" tab. The app will:
- Load the RunAnywhere SDK
- Initialize the LLM model (Liquid AI LFM2 350M ~250MB)
- Set up the command interpretation engine

First-time model download may take 1-2 minutes depending on connection speed.

### 2. Try Your First Command

Type a natural language command in the input box:

```
clear my cache
```

Click "Interpret" to see:
- ✅ The generated system command
- 📝 Explanation of what it does
- ⚠️ Safety level and warnings
- 📂 Files/resources that will be affected

### 3. Execute the Command

After reviewing the preview:
- Click "Execute (Simulate)" to run the command
- In the web version, this shows what would happen
- Actual execution requires the CLI tool (future)

### 4. Explore the Interface

**Main Tab**:
- Command input and preview
- Intelligent suggestions based on usage
- Quick statistics

**History Tab**:
- View all past commands
- See execution counts
- Quick re-run functionality

**Macros Tab**:
- Create command sequences
- Execute multi-step workflows
- Automation templates

**Settings Tab**:
- Export/import data
- View detailed statistics
- Clear all data

## Example Commands

### Safe Commands (No Confirmation Needed)
```
show disk usage
list running processes
check system info
what's my current directory
```

### Caution Commands (Require Confirmation)
```
clear my cache
kill port 3000
delete old log files
compress my documents folder
```

### Dangerous Commands (Blocked)
```
delete everything in root
format my hard drive
remove all system files
```

## Creating Your First Macro

1. Execute 2-3 related commands individually
2. Go to the Macros tab (future feature)
3. Or use the API:

```typescript
const macro = await CommandBrain.createMacro(
  'Daily Cleanup',
  'Cleans cache and shows disk space',
  'cleanup system',
  [
    'clear my cache',
    'delete temp files',
    'show disk usage'
  ]
);
```

## Understanding the Learning System

CommandBrain learns from your usage automatically:

1. **First Use**: Command is interpreted and stored
2. **Pattern Detection**: System identifies reusable patterns
3. **Frequency Tracking**: Tracks how often you use commands
4. **Time Learning**: Notes when you typically run commands
5. **Smart Suggestions**: Proactively suggests commands at appropriate times

Example:
```
Day 1: You run "clear cache" at 2 PM
Day 2: You run "clear cache" at 2 PM
Day 3: At 2 PM, system suggests "clear cache" proactively
```

## Tips for Best Results

### Command Phrasing
✅ Good:
- "Clear my browser cache"
- "Kill the process on port 3000"
- "Show me disk usage"

❌ Less Optimal:
- "cache" (too vague)
- "3000" (unclear intent)
- "disk" (ambiguous)

### Safety Review
Always review:
- The generated system command
- Affected files and directories
- Safety warnings
- Command explanation

### Learning Optimization
- Execute commands you use regularly
- Use consistent phrasing for similar tasks
- Review and act on suggestions
- Create macros for frequent workflows

## Common Issues

### Model Loading Fails
```
Error: Failed to download model
```
**Solution**: Check internet connection, models are downloaded once and cached

### Command Interpretation Slow
```
Taking more than 5 seconds...
```
**Solution**: First run loads the model. Subsequent runs are much faster (~1 second)

### IndexedDB Errors
```
Error: Failed to open IndexedDB
```
**Solution**: Check browser storage permissions, try clearing site data

### Safety Engine Too Strict
```
Command blocked but seems safe
```
**Solution**: This is by design. Review the command and use the CLI tool if you're certain it's safe

## Advanced Usage

### Programmatic Access

```typescript
import { CommandBrain } from './commandbrain';

// Initialize
await CommandBrain.init();

// Process command
const preview = await CommandBrain.processCommand('clean cache');

// Get suggestions
const suggestions = await CommandBrain.getSuggestions();

// Search history
const results = await CommandBrain.searchCommands('cache');

// Execute macro
await CommandBrain.executeMacro(macroId);

// Export data
const json = await CommandBrain.exportData();
```

### Custom Configuration

```typescript
await CommandBrain.updateConfig({
  enableLearning: true,
  enableSuggestions: true,
  autoExecuteSafe: false,
  maxHistorySize: 1000,
});
```

## Performance Tips

1. **Model Preloading**: Models are cached after first download
2. **Pattern Optimization**: System auto-prunes old patterns
3. **History Management**: Set reasonable maxHistorySize
4. **Storage Cleanup**: Periodically export and clear old data

## Security Best Practices

1. **Review Before Execute**: Always check command previews
2. **Trust Safety Levels**: Respect dangerous/caution warnings
3. **Understand Commands**: Don't execute commands you don't understand
4. **Backup Data**: Export important data regularly
5. **Use CLI for Critical Operations**: Web version is for preview/learning

## Next Steps

### Immediate
- [ ] Try 10+ different commands
- [ ] Review command history
- [ ] Check suggestions after a few commands
- [ ] Export your data

### Soon
- [ ] Create your first macro
- [ ] Learn command categories
- [ ] Optimize your most-used commands
- [ ] Explore pattern learning

### Future
- [ ] Enable voice commands (see VOICE_INTEGRATION.md)
- [ ] Install CLI tool (when available)
- [ ] Contribute safety patterns
- [ ] Share macro templates

## Getting Help

### Documentation
- `COMMANDBRAIN.md` - Complete system documentation
- `VOICE_INTEGRATION.md` - Voice feature guide
- `IMPLEMENTATION_SUMMARY.md` - Technical details

### Support
- Check browser console for detailed errors
- Review safety analyzer output
- Examine command history for patterns
- Test with simple commands first

### Community
- Report issues on GitHub
- Suggest improvements
- Share macros and patterns
- Contribute safety rules

## Success Checklist

After 10 minutes of use, you should:
- ✅ Have 5+ commands in history
- ✅ See 1-2 learned patterns
- ✅ Receive at least 1 suggestion
- ✅ Understand safety levels
- ✅ Know how to create a macro

## Quick Reference

### Command Categories
- `file_operation` - File/directory operations
- `process_management` - Process control
- `cleanup` - Cache/temp cleanup
- `compression` - Archive operations
- `search` - File/content search
- `optimization` - System optimization
- `network` - Network operations
- `system_info` - System information

### Safety Levels
- 🟢 **Safe** - Auto-executable
- 🟡 **Caution** - Needs confirmation
- 🔴 **Dangerous** - Blocked

### Keyboard Shortcuts (Future)
- `Ctrl/Cmd + K` - Focus command input
- `Ctrl/Cmd + Enter` - Execute command
- `Ctrl/Cmd + H` - View history
- `Ctrl/Cmd + M` - View macros
- `Escape` - Cancel preview

---

## Congratulations!

You're now ready to use RunAnywhere CommandBrain. Start with simple commands, let the system learn your patterns, and gradually build up your command library and macros.

Remember: **Safety First, Learn Always, Automate Everything**

---

## Quick Command Examples

Copy-paste these to try:

```
show disk usage
list files in current directory
check running processes
kill port 3000
clear my cache
compress logs folder
find large files
delete temp files
show network connections
check memory usage
```

Have fun exploring CommandBrain!
