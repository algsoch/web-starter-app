# Bridge Execution Guide

## Overview
CommandBrain now supports **real command execution** through an optional execution bridge. This allows commands to run on your actual system instead of just simulation mode.

## 🚀 Quick Start

### 1. Start the Bridge Server

```bash
cd execution-bridge
npm install
npm start
```

The server will start on `http://localhost:3001` and display an auth token.

### 2. Configure in UI

1. Open CommandBrain
2. Navigate to **Settings** tab
3. Find **"Execution Bridge Configuration"** section
4. Check **"Enable Real Execution"**
5. Click **"Get Key from Bridge"** to retrieve the auth token
6. Click **"Test Connection"** to verify

### 3. Execute Commands

When bridge is connected:
- **Preview screen**: You'll see two buttons:
  - 🚀 **Execute (Real)** - Runs the command for real
  - 👁️ **Simulate** - Shows preview only (safe)
- A status indicator shows: `🚀 Real Execution: Enabled`

## 🔒 Security Features

### Multi-Layer Protection

1. **LLM Safety**: AI generates safe commands
2. **Pattern Matching**: Blocks dangerous keywords
3. **Bridge Re-validation**: Server checks again
4. **User Confirmation**: Preview before execution
5. **Safety Levels**:
   - 🟢 SAFE: Auto-executable read-only commands
   - 🟡 MODERATE: Requires confirmation
   - 🔴 DANGEROUS: Blocked entirely

### Bridge Authentication

- 256-bit random token required
- Token shown on server startup
- Stored in localStorage (browser-only)
- CORS restricted to localhost only

### Command Blocking

The bridge server blocks:
- System destruction: `rm -rf /`, `format`, `mkfs`
- Privilege escalation: `sudo`, `su`, `chmod 777`
- Process manipulation: `kill -9`, `killall`
- Network attacks: `:(){ :|:& };:`

## 📊 Features

### Execution Modes

| Mode | Description | Use Case |
|------|-------------|----------|
| **Simulation** (Default) | Preview only, no actual execution | Safe exploration, learning |
| **Bridge Execution** (Optional) | Runs commands on your system | Productivity, automation |

### Bridge Configuration Options

- **Enabled/Disabled**: Toggle real execution on/off
- **Bridge URL**: Custom server location (default: `http://localhost:3001`)
- **Auth Token**: Security token from bridge server
- **Connection Test**: Verify bridge is reachable

### Execution Statistics

Track your command execution success:
- Total executions
- Success rate (color-coded)
- Failed commands count
- Low success warning (when rate < 50%)

## 🎯 Best Practices

### ✅ DO:

- **Read previews carefully** before executing
- **Test with safe commands** first (e.g., `ls`, `pwd`, `whoami`)
- **Use favorites** for frequently used commands
- **Review execution results** for errors
- **Keep bridge running** while using real execution

### ❌ DON'T:

- **Blindly execute** without reading previews
- **Run destructive commands** without backups
- **Share auth tokens** or expose bridge publicly
- **Auto-execute** dangerous commands
- **Disable safety checks** in bridge server

## 🔧 Configuration Files

### Bridge Config (localStorage)

```json
{
  "enabled": true,
  "url": "http://localhost:3001",
  "authToken": "your-256-bit-token"
}
```

### Server Config (execution-bridge/server.js)

- Port: 3001 (change in `server.js`)
- Timeout: 30 seconds per command
- Auth: Bearer token authentication

## 🛟 Troubleshooting

### Bridge Disconnected

**Symptom**: Status shows "⚠️ Bridge: Disconnected"

**Solutions**:
1. Check if bridge server is running: `npm start` in `execution-bridge/`
2. Verify URL is correct: Default `http://localhost:3001`
3. Test connection in Settings tab
4. Check browser console for errors

### Auth Failed

**Symptom**: Commands return "Unauthorized" error

**Solutions**:
1. Get new token from bridge server console
2. Click "Get Key from Bridge" in Settings
3. Paste token in "Auth Token" field
4. Test connection again

### Command Blocked

**Symptom**: Command shows as DANGEROUS or blocked

**Solutions**:
1. Review command for destructive patterns
2. Use more specific command (avoid wildcards)
3. Check EXECUTION_SECURITY.md for blocked patterns
4. Consider running command manually if truly needed

### Execution Timeout

**Symptom**: Command takes too long and fails

**Solutions**:
1. Bridge timeout is 30 seconds - break into smaller commands
2. Use background commands (`&`) for long-running processes
3. Consider running directly in terminal for very long tasks

## 📚 Related Documentation

- **EXECUTION_SECURITY.md**: Comprehensive security guide
- **README.md**: Project overview and setup
- **execution-bridge/server.js**: Bridge server implementation
- **src/commandbrain/bridge/BridgeClient.ts**: Client implementation

## ⚡ Performance

- Bridge adds ~50-200ms latency vs simulation
- Connection test: ~100ms round trip
- Auth verification: ~20ms overhead
- Command execution: varies by command

## 🔄 Updates & Changes

### Version 2.0 (Current)

- ✅ Bridge execution support
- ✅ Real-time status indicators
- ✅ Execution statistics tracking
- ✅ Favorites system integration
- ✅ Enhanced retry UX
- ✅ Connection testing

### Future Enhancements

- ⏳ SSH bridge for remote execution
- ⏳ Command history sync across devices
- ⏳ Execution logs export
- ⏳ Custom timeout configuration
- ⏳ Multi-bridge support

## 💡 Example Workflow

### First-Time Setup

1. Install dependencies: `cd execution-bridge && npm install`
2. Start server: `npm start`
3. Copy auth token from console
4. Open CommandBrain → Settings
5. Enable bridge, paste token
6. Test connection ✅
7. Try safe command: "show current directory"
8. Click "🚀 Execute (Real)" to run

### Daily Usage

1. Start bridge: `npm start` (in terminal)
2. Open CommandBrain (bridge auto-connects)
3. Enter command: "list files larger than 10MB"
4. Review preview and safety level
5. Click "🚀 Execute (Real)" or "👁️ Simulate"
6. View result and add to favorites if useful

## 🐛 Known Limitations

1. **Single bridge instance**: Only one bridge connection at a time
2. **Localhost only**: CORS restricted to local development
3. **No command history**: Bridge doesn't log executed commands
4. **Limited shell features**: No pipes, redirects, or background jobs in some cases
5. **Platform-specific**: Commands must be compatible with your OS

## 📞 Support

For issues or questions:
1. Check EXECUTION_SECURITY.md first
2. Review browser console for errors
3. Check bridge server logs
4. Verify prerequisites (Node.js version, etc.)
5. Test with simple commands first

---

**Security Notice**: The execution bridge runs commands with your user permissions. Always review commands before execution and only enable when needed.
