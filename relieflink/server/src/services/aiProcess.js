const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const AI_HOST = process.env.AI_SERVICE_HOST || '127.0.0.1';
const AI_PORT = Number(process.env.AI_SERVICE_PORT || 8000);
const AI_STARTUP_TIMEOUT_MS = Number(process.env.AI_STARTUP_TIMEOUT_MS || 30000);
const AI_HEALTH_URL = `http://${AI_HOST}:${AI_PORT}/health`;
const AI_THREAD_ENV = {
  OMP_NUM_THREADS: String(process.env.OMP_NUM_THREADS || 1),
  OPENBLAS_NUM_THREADS: String(process.env.OPENBLAS_NUM_THREADS || 1),
  MKL_NUM_THREADS: String(process.env.MKL_NUM_THREADS || 1),
  NUMEXPR_NUM_THREADS: String(process.env.NUMEXPR_NUM_THREADS || 1),
};

const aiServiceDirectory = path.resolve(__dirname, '../../../ai-service');
const virtualEnvironmentPython = process.platform === 'win32'
  ? path.join(aiServiceDirectory, '.venv', 'Scripts', 'python.exe')
  : path.join(aiServiceDirectory, '.venv', 'bin', 'python');

const getPythonExecutable = () => {
  if (process.env.PYTHON_BIN && fs.existsSync(process.env.PYTHON_BIN)) {
    return process.env.PYTHON_BIN;
  }

  if (fs.existsSync(virtualEnvironmentPython)) {
    return virtualEnvironmentPython;
  }

  return virtualEnvironmentPython;
};

const waitForAIHealth = async (childProcess, startupLogs) => {
  const startedAt = Date.now();
  let lastError = new Error('FastAPI did not respond to the health check yet.');

  while (Date.now() - startedAt < AI_STARTUP_TIMEOUT_MS) {
    if (childProcess.exitCode !== null) {
      const logOutput = startupLogs.join('').trim();
      const detail = logOutput ? `\nFastAPI startup logs:\n${logOutput}` : '';
      throw new Error(`FastAPI exited before becoming ready with code ${childProcess.exitCode}.${detail}`);
    }

    try {
      const response = await fetch(AI_HEALTH_URL);
      if (response.ok) {
        const payload = await response.json();
        if (payload.status === 'ok') {
          return;
        }
      }
      lastError = new Error(`FastAPI health check returned HTTP ${response.status || 'unknown'}.`);
    } catch (error) {
      lastError = error;
    }

    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  const logOutput = startupLogs.join('').trim();
  const detail = logOutput ? `\nFastAPI startup logs:\n${logOutput}` : '';
  throw new Error(`FastAPI did not become ready within ${AI_STARTUP_TIMEOUT_MS}ms: ${lastError?.message || 'unknown startup error'}${detail}`);
};

const startAIService = async () => {
  const pythonCommand = getPythonExecutable();

  if (!fs.existsSync(pythonCommand)) {
    throw new Error(`FastAPI virtual-environment Python executable was not found at ${pythonCommand}. Run the deployment build first.`);
  }

  const startupLogs = [];
  const childProcess = spawn(
    pythonCommand,
    ['-m', 'uvicorn', 'app.main:app', '--host', AI_HOST, '--port', String(AI_PORT)],
    {
      cwd: aiServiceDirectory,
      env: { ...process.env, ...AI_THREAD_ENV },
      stdio: ['ignore', 'pipe', 'pipe'],
    }
  );

  childProcess.stdout.on('data', (chunk) => {
    const text = chunk.toString();
    startupLogs.push(text);
    process.stdout.write(text);
  });

  childProcess.stderr.on('data', (chunk) => {
    const text = chunk.toString();
    startupLogs.push(text);
    process.stderr.write(text);
  });

  await waitForAIHealth(childProcess, startupLogs);
  console.log(`FastAPI AI service ready at ${AI_HEALTH_URL}`);
  return childProcess;
};

const stopAIService = (childProcess) => {
  if (childProcess && childProcess.exitCode === null) {
    childProcess.kill('SIGTERM');
  }
};

module.exports = { startAIService, stopAIService, AI_HOST, AI_PORT, AI_HEALTH_URL };
