# Quick Start: Enable Real Command Execution

## Current Issue: Commands Showing as "Simulation"

By default, CommandBrain runs in **simulation mode** (safe - no actual execution). To enable **real execution**, you need to:

## 🚀 Enable Real Execution - 3 Steps

### Step 1: Start the Bridge Server

Open a **NEW terminal** and run:

```bash
cd execution-bridge
npm install
npm start
```

You'll see:
```
🔐 Auth Token: [long random string]
🚀 Execution Bridge ready on http://localhost:3001
```

**Keep this terminal open!** The bridge must stay running.

---

### Step 2: Configure in UI

1. Open your app in browser: `http://localhost:5173`
2. Go to **CommandBrain** tab
3. Click **"Settings"** (rightmost tab)
4. Scroll to **"Execution Bridge Configuration"**
5. Check ☑ **"Enable Real Execution"**
6. Click **"Get Key from Bridge"** button
   - It will fetch the auth token automatically
7. Click **"Test Connection"**
   - Should show **● Connected** (green)

---

### Step 3: Execute Commands

Now when you go back to the **Command** tab:

1. You'll see: **🚀 Real Execution: Enabled** (in green)
2. Enter a command (e.g., "list files in current directory")
3. Click **"Preview"**
4. In the preview, you'll see TWO buttons:
   - **🚀 Execute (Real)** - Runs command for real
   - **👁️ Simulate** - Shows preview only

Choose **"Execute (Real)"** to run the actual command!

---

## 🔧 Troubleshooting

### Problem: Bridge shows "Disconnected"

**Solution:**
1. Check if bridge server is running (see Step 1)
2. Make sure it's on port 3001: `http://localhost:3001`
3. Check browser console for errors (F12 → Console)
4. Try clicking "Test Connection" again

### Problem: "Get Key from Bridge" fails

**Solution:**
1. Manually copy the auth token from the bridge terminal
2. Paste it in the "Auth Token" field
3. Click "Test Connection"

### Problem: Commands still show "Simulate" only

**Solution:**
1. Make sure bridge is **● Connected** (check main view header)
2. Restart dev server: Kill Vite and run `npm run dev` again
3. Hard refresh browser: `Cmd+Shift+R` (Mac) or `Ctrl+Shift+R` (Windows)

### Problem: Command executes but fails

**Solution:**
1. Check the command is valid for your OS
2. Check you have permissions (some commands need sudo)
3. Review bridge terminal for error messages
4. Check EXECUTION_SECURITY.md for blocked patterns

---

## 🛡️ Safety Notes

- Bridge only runs on **localhost** (CORS protected)
- Requires **authentication token** (256-bit random)
- **Dangerous commands blocked** (rm -rf /, sudo, etc.)
- Always **preview before execution**
- Can switch back to simulation anytime

---

## 📊 Verify It's Working

### Test with Safe Commands:

1. **"show current directory"** → Should show your actual path
2. **"list files here"** → Should show real files
3. **"show date and time"** → Should show current date

### You'll Know It's Real When:

- Output shows **actual file names** from your system
- Date/time is **current** (not simulated)
- Commands affect **real directories**
- Bridge terminal shows: `[EXECUTE] Command: ls -la`

---

## 🎯 Quick Command Reference

**Start Bridge:**
```bash
cd execution-bridge && npm start
```

**Restart Dev Server:**
```bash
# Kill old server
pkill -f vite

# Start fresh
npm run dev
```

**Check Bridge Health:**
```bash
curl http://localhost:3001/health
# Should return: {"status":"ok","timestamp":...}
```

---

## 💡 Pro Tips

1. **Keep bridge terminal visible** - Watch commands execute in real-time
2. **Use Favorites** - Save frequently used commands for quick access
3. **Check Statistics** - Settings tab shows success rate
4. **Bridge auto-reconnects** - Config saved in browser localStorage

---

Need more help? Check:
- **EXECUTION_SECURITY.md** - Security details
- **BRIDGE_EXECUTION_GUIDE.md** - Complete guide
- **execution-bridge/server.js** - Bridge implementation
