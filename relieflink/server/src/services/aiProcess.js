const path = require('path');
const { spawn } = require('child_process');

const AI_HOST = process.env.AI_SERVICE_HOST || '127.0.0.1';
const AI_PORT = Number(process.env.AI_SERVICE_PORT || 8000);
const AI_STARTUP_TIMEOUT_MS = Number(process.env.AI_STARTUP_TIMEOUT_MS || 30000);
const AI_HEALTH_URL = `http://${AI_HOST}:${AI_PORT}/health`;

const waitForAIHealth = async (childProcess) => {
  const startedAt = Date.now();
  let lastError;
  while (Date.now() - startedAt < AI_STARTUP_TIMEOUT_MS) {
    if (childProcess.exitCode !== null) {
      throw new Error(`FastAPI exited before becoming ready with code ${childProcess.exitCode}.`);
    }
    try {
      const response = await fetch(AI_HEALTH_URL);
      if (response.ok) {
        const payload = await response.json();
        if (payload.status === 'ok') return;
      }
      lastError = new Error(`FastAPI health check returned HTTP ${response.status}.`);
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`FastAPI did not become ready within ${AI_STARTUP_TIMEOUT_MS}ms: ${lastError?.message || 'unknown startup error'}`);
};

const startAIService = async () => {
  const pythonCommand = process.env.PYTHON_BIN || (process.platform === 'win32' ? 'python' : 'python3');
  const aiServiceDirectory = path.resolve(__dirname, '../../../ai-service');
  const childProcess = spawn(
    pythonCommand,
    ['-m', 'uvicorn', 'app.main:app', '--host', AI_HOST, '--port', String(AI_PORT)],
    {
      cwd: aiServiceDirectory,
      env: process.env,
      stdio: 'inherit',
    }
  );

  await waitForAIHealth(childProcess);
  console.log(`FastAPI AI service ready at ${AI_HEALTH_URL}`);
  return childProcess;
};

const stopAIService = (childProcess) => {
  if (childProcess && childProcess.exitCode === null) {
    childProcess.kill('SIGTERM');
  }
};

module.exports = { startAIService, stopAIService, AI_HOST, AI_PORT };
