# CommandBrain Execution Security Guide

## ⚠️ CRITICAL SECURITY INFORMATION

This document explains how CommandBrain executes commands, potential risks, and safety measures.

---

## How Command Execution Works

### Mode 1: Browser Simulation (Default)
- **What it does**: Shows preview only, no actual execution
- **Safety**: 100% safe - nothing actually runs
- **Use case**: Testing, learning, preview-only

### Mode 2: Execution Bridge (Optional)
- **What it does**: Runs commands on your actual system via Node.js server
- **Safety**: Protected by multiple security layers (see below)
- **Use case**: Real command automation

---

## Execution Bridge Architecture

```
┌─────────────────┐         ┌──────────────────┐         ┌─────────────┐
│   Web Browser   │ HTTPS   │  Bridge Server   │  exec() │   System    │
│  (CommandBrain) ├────────►│  (localhost:3001)├────────►│  Terminal   │
│                 │  Auth   │                  │         │             │
└─────────────────┘         └──────────────────┘         └─────────────┘
```

### Communication Flow:
1. User enters natural language command
2. LLM converts to system command
3. Safety analyzer checks command
4. User previews and confirms
5. **IF execution bridge enabled**: 
   - Sends authenticated request to localhost:3001
   - Bridge re-validates safety
   - Executes command with timeout
   - Returns result (stdout/stderr)

---

## Security Layers

### Layer 1: LLM Safety (Interpreter)
- LLM trained to generate safe commands
- Avoids destructive operations
- Uses minimal privilege approaches

### Layer 2: Pattern Matching (Safety Analyzer)
**Blocked Patterns:**
```regex
/rm\s+-rf\s+\/(?!\s*home)/i        # rm -rf / (except /home)
/rm\s+-rf\s+\*/i                   # rm -rf * (all files)
/:\(\)\{\s*:\|:&\s*\};:/i          # Fork bomb
/dd\s+if=/i                         # dd operations
/mkfs/i                             # Format disk
/fdisk/i                            # Partition operations
/>\s*\/dev\/sd[a-z]/i              # Write to raw disk
/wget.*\|\s*sh/i                   # Download & execute
/curl.*\|\s*bash/i                 # Download & execute
```

**Dangerous Keywords:**
- format, destroy, shred, wipe, overwrite
- /etc/passwd, /etc/shadow, /boot, /sys, /proc

### Layer 3: Safety Levels
- 🟢 **SAFE**: Auto-executable (read-only, info commands)
- 🟡 **CAUTION**: Requires confirmation (delete, kill, modify)
- 🔴 **DANGEROUS**: Blocked entirely (system-destructive)

### Layer 4: Bridge Validation
Even after web approval, bridge server:
- Re-checks for dangerous patterns
- Validates command structure
- Enforces 30-second timeout
- Requires authentication token

### Layer 5: User Confirmation
- Preview shown before execution
- Explanation of what will happen
- List of affected files/processes
- All warnings displayed
- Final confirmation required

---

## Potential Risks

### What Can Go Wrong?

#### 1. **Unintended File Deletion**
**Example:**
- Input: "clean download folder"
- Command: `rm -rf ~/Downloads/*`
- **Risk**: Deletes all downloads permanently
- **Protection**: Marked as CAUTION, requires confirmation

#### 2. **Process Termination**
**Example:**
- Input: "kill all chrome processes"  
- Command: `killall chrome`
- **Risk**: Loses unsaved work in browser
- **Protection**: Shows affected processes, requires confirmation

#### 3. **Permission Changes**
**Example:**
- Input: "make script executable"
- Command: `chmod +x script.sh`
- **Risk**: Could make malicious file executable
- **Protection**: Shows command, requires confirmation

#### 4. **Large Operations**
**Example:**
- Input: "delete large files"
- Command: `find / -size +100M -delete`
- **Risk**: Scans entire system, could delete important files
- **Protection**: Preview shows full command, timeout prevents hanging

#### 5. **Network Operations**
**Example:**
- Input: "download installer"
- Command: `curl https://example.com/install.sh | bash`
- **Risk**: Downloads and executes unknown code
- **Protection**: BLOCKED - matches dangerous pattern

---

## What is NOT Protected

### Limitations:

1. **Outside-Scope Modifications**
   - If command modifies files, CommandBrain can't predict all side effects
   - Example: Running a script that internally deletes files

2. **Pipe Complex Commands**
   - Multi-stage pipelines harder to analyze fully
   - Example: `cat file | grep pattern | xargs rm`

3. **Indirect Execution**
   - Commands that trigger other commands
   - Example: `crontab -e` (opens editor, user could add dangerous cron job)

4. **Application-Specific Commands**
   - App-specific CLIs may have their own destructive operations
   - Example: `docker system prune -a --volumes` (deletes all Docker data)

5. **User Confirmation Fatigue**
   - Users may click "confirm" without reading
   - **Mitigation**: Clear warnings, safety badges, explanations

---

## Best Practices for Safe Use

### ✅ DO:
- **Read previews carefully** before executing
- **Understand the command** - if unclear, don't run it
- **Test with safe commands first** (ls, pwd, echo)
- **Keep auth token secure** - don't share your bridge key
- **Use templates** for verified safe commands
- **Check safety level** - avoid yellow/red badges
- **Review affected files** in preview
- **Start with simulation mode** until comfortable

### ❌ DON'T:
- **Blindly execute** without reading
- **Ignore warnings** - they're there for a reason
- **Run commands from untrusted sources**
- **Disable safety checks** (if you modify code)
- **Share your execution bridge** over network
- **Use on production servers** without thorough testing
- **Execute on important data** without backups

---

## Comparison to Other Command Executors

| System | Safety | Flexibility | Risk Level |
|--------|--------|-------------|------------|
| **Manual Terminal** | No protection | Full control | High (user error) |
| **CommandBrain Simulation** | Preview only | Safe testing | None |
| **CommandBrain Bridge** | Multi-layer | Real execution | Low-Medium (protected) |
| **AI Shell Assistants** | Basic filters | Real-time | Medium-High |
| **Script Runners** | None | Automated | High |

---

## Setting Up Execution Bridge Safely

### Step 1: Install Dependencies
```bash
cd execution-bridge
npm install
```

### Step 2: Start Bridge Server
```bash
node server.js
```

### Step 3: Copy Auth Token
Bridge will print a secret key - copy this.

### Step 4: Configure Web UI
Paste token into CommandBrain settings (future feature).

### Step 5: Test with Safe Commands
```
"show current directory"  → pwd (SAFE)
"list files"             → ls (SAFE)  
"show disk usage"        → df -h (SAFE)
```

### Step 6: Review Logs
Bridge logs every command execution with timestamp.

---

## Monitoring and Auditing

### Command History
All executed commands stored with:
- Natural language input
- Generated system command
- Execution result (success/fail)
- Timestamp
- Execution count

### Export Data
Settings → Export Data → JSON file with full history for audit.

### Failed Commands
System tracks failures to help identify:
- Unsafe patterns
- Misinterpretations
- System incompatibilities

---

## Emergency: If Something Goes Wrong

### If Unwanted Command Executed:

1. **Stop the bridge server** immediately
   ```bash
   # In bridge server terminal
   Ctrl+C
   ```

2. **Check what ran** - Review bridge server console logs

3. **Assess damage** - Use normal terminal to check system state

4. **Undo if possible**:
   - Deleted files? Check trash/recycle bin
   - Killed process? Restart application
   - Modified files? Restore from backup

5. **Report the issue** - Note the command for improvement

### If System Acting Strangely:

1. **Restart bridge server** with fresh token
2. **Clear CommandBrain data** (Settings → Clear All Data)
3. **Review recent history** before clearing
4. **Reinstall if needed**

---

## Security Checklist

Before using execution bridge:

- [ ] I understand commands can run on my real system
- [ ] I will read previews before executing
- [ ] I will not ignore safety warnings
- [ ] I have backups of important data
- [ ] I will only use on localhost (127.0.0.1)
- [ ] I will keep the auth token private
- [ ] I will start with only safe commands
- [ ] I understand this is beta software
- [ ] I will monitor execution logs
- [ ] I know how to stop the bridge server

---

## Technical Details

### Authentication
- 256-bit random token generated on server start
- Must be included in `Authorization: Bearer <token>` header
- No token persistence (regenerates on restart)
- Only works from localhost origins

### Timeout Protection
- 30-second max execution time
- Prevents infinite loops/hangs
- Kills runaway processes

### Sandboxing Limitations
- Runs with user's permissions (not root)
- Cannot drop privileges further
- No chroot/container isolation
- **Recommendation**: Run as limited user account

### Network Security
- Binds only to 127.0.0.1 (localhost)
- CORS restricted to localhost ports
- No external network access
- Self-signed HTTPS optional (future)

---

## FAQ

**Q: Can CommandBrain damage my system?**
A: Only if you confirm execution of destructive commands. All dangerous operations are blocked or require explicit confirmation.

**Q: Is it safer than running commands manually?**
A: Yes, because it adds preview, explanation, and safety checks before execution.

**Q: What if the AI generates a wrong command?**
A: Always review the preview. If unclear, don't execute. Use simulation mode to test first.

**Q: Can I disable safety checks?**
A: Not recommended. If you modify code to bypass safety, you lose all protection.

**Q: Does it run with sudo/root?**
A: No. Runs with your user permissions. Never run bridge as root.

**Q: Can I use this on servers?**
A: Not recommended for production. Test thoroughly in staging first.

**Q: What about macOS/Linux differences?**
A: LLM generates platform-specific commands. Always review since syntax varies.

**Q: How do I report a safety bypass?**
A: Please file an issue with the dangerous command that passed through.

---

## Summary

### The Good ✅
- Multiple layers of safety
- Preview before execution  
- Clear explanations
- Blocks destructive operations
- Audit trail in history
- Localhost-only by default

### The Risks ⚠️
- User can confirm dangerous ops
- Complex commands harder to analyze  
- Indirect effects not predicted
- Requires user judgment
- Beta software status

### The Bottom Line 🎯
**CommandBrain is safer than raw terminal use, but not foolproof.**

Use responsibly, read carefully, and always backup important data.

---

*Last Updated: 2026-02-22*
*Version: 1.0*
