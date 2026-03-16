/**
 * CommandBrain Execution Bridge
 * 
 * A simple Express server that allows the web UI to execute commands
 * on the local system. This bridges the browser sandbox limitation.
 * 
 * SECURITY: This should only run on localhost and requires authentication.
 */

const express = require('express');
const { exec } = require('child_process');
const cors = require('cors');
const crypto = require('crypto');

const app = express();
const PORT = 3001;

// Generate a secret key on startup (user must copy from console to browser)
const SECRET_KEY = crypto.randomBytes(32).toString('hex');

app.use(express.json());
app.use(cors({
  origin: ['http://localhost:5173', 'http://localhost:5174', 'http://localhost:3000'],
  credentials: true,
}));

// Authentication middleware
function authenticate(req, res, next) {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || authHeader !== `Bearer ${SECRET_KEY}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  
  next();
}

// Safety checker - blocks dangerous commands
function isDangerous(command) {
  const dangerousPatterns = [
    /rm\s+-rf\s+\/(?!\s*home)/i,
    /rm\s+-rf\s+\*/i,
    /:\(\)\{\s*:\|:&\s*\};:/i,
    /dd\s+if=/i,
    /mkfs/i,
    /fdisk/i,
    />\s*\/dev\/sd[a-z]/i,
    /wget.*\|\s*sh/i,
    /curl.*\|\s*bash/i,
  ];
  
  return dangerousPatterns.some(pattern => pattern.test(command));
}

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', message: 'CommandBrain Execution Bridge is running' });
});

// Get secret key endpoint (for initial setup)
app.get('/key', (req, res) => {
  res.json({ key: SECRET_KEY });
});

// Execute command endpoint
app.post('/execute', authenticate, async (req, res) => {
  const { command, safetyLevel } = req.body;
  
  if (!command) {
    return res.status(400).json({ error: 'Command is required' });
  }
  
  // Double-check safety
  if (safetyLevel === 'dangerous' || isDangerous(command)) {
    return res.status(403).json({
      error: 'Command blocked for safety',
      reason: 'This command is classified as dangerous and cannot be executed',
    });
  }
  
  console.log(`[${new Date().toISOString()}] Executing: ${command}`);
  
  const startTime = Date.now();
  
  exec(command, { timeout: 30000 }, (error, stdout, stderr) => {
    const duration = Date.now() - startTime;
    
    const result = {
      success: !error,
      stdout: stdout || '',
      stderr: stderr || '',
      exitCode: error?.code || 0,
      duration,
      error: error?.message,
    };
    
    console.log(`[${new Date().toISOString()}] Completed in ${duration}ms - Success: ${result.success}`);
    
    res.json(result);
  });
});

// Start server
app.listen(PORT, '127.0.0.1', () => {
  console.log('\n' + '='.repeat(70));
  console.log('🧠 CommandBrain Execution Bridge');
  console.log('='.repeat(70));
  console.log(`\n✅ Server running on http://localhost:${PORT}`);
  console.log(`\n🔑 Your Secret Key (copy this to the web UI):`);
  console.log(`\n   ${SECRET_KEY}`);
  console.log(`\n⚠️  SECURITY NOTICE:`);
  console.log(`   - This server allows command execution on your system`);
  console.log(`   - Only accessible from localhost`);
  console.log(`   - Authentication required (use the key above)`);
  console.log(`   - Dangerous commands are blocked`);
  console.log(`   - Review all commands before execution`);
  console.log('\n' + '='.repeat(70) + '\n');
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n\n👋 Shutting down CommandBrain Execution Bridge...');
  process.exit(0);
});
