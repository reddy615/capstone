const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const aiServiceDirectory = path.resolve(__dirname, '..', 'relieflink', 'ai-service');
const virtualEnvironmentDirectory = path.join(aiServiceDirectory, '.venv');
const requirementsPath = path.join(aiServiceDirectory, 'requirements.txt');
const pythonRelativePath = process.platform === 'win32' ? ['Scripts', 'python.exe'] : ['bin', 'python'];
const virtualEnvironmentPython = path.join(virtualEnvironmentDirectory, ...pythonRelativePath);

const pythonCandidates = process.platform === 'win32'
  ? ['py', 'python', 'python3']
  : ['python3', 'python'];

function resolvePythonCommand() {
  for (const candidate of pythonCandidates) {
    try {
      execFileSync(candidate, ['--version'], { stdio: 'ignore' });
      return candidate;
    } catch (error) {
      // Continue checking the next candidate.
    }
  }

  const envPython = process.env.PYTHON || process.env.PYTHON3;
  if (envPython) return envPython;

  throw new Error('Python was not found in PATH; install Python 3 before running the build.');
}

const pythonCommand = resolvePythonCommand();

if (!fs.existsSync(virtualEnvironmentPython)) {
  if (fs.existsSync(virtualEnvironmentDirectory)) {
    fs.rmSync(virtualEnvironmentDirectory, { recursive: true, force: true });
  }
  execFileSync(pythonCommand, ['-m', 'venv', virtualEnvironmentDirectory], { stdio: 'inherit' });
}

if (!fs.existsSync(virtualEnvironmentPython)) {
  throw new Error(`Python virtual environment was not created at ${virtualEnvironmentDirectory}.`);
}

execFileSync(virtualEnvironmentPython, ['-m', 'pip', 'install', '--no-cache-dir', '-r', requirementsPath], { stdio: 'inherit' });
console.log(`Installed AI dependencies into ${virtualEnvironmentDirectory}`);
