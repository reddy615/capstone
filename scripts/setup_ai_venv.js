const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const aiServiceDirectory = path.resolve(__dirname, '..', 'relieflink', 'ai-service');
const virtualEnvironmentDirectory = path.join(aiServiceDirectory, '.venv');
const requirementsPath = path.join(aiServiceDirectory, 'requirements.txt');
const pythonRelativePath = process.platform === 'win32' ? ['Scripts', 'python.exe'] : ['bin', 'python'];
const virtualEnvironmentPython = path.join(virtualEnvironmentDirectory, ...pythonRelativePath);
const requiredPythonVersion = '3.11';

function getPythonVersion(command, args = []) {
  return execFileSync(
    command,
    [...args, '-c', 'import sys; print(f"{sys.version_info.major}.{sys.version_info.minor}")'],
    { encoding: 'utf8' },
  ).trim();
}

function resolvePythonCommand() {
  const configuredPython = process.env.PYTHON;
  const pythonCandidates = configuredPython
    ? [{ command: configuredPython, args: [] }]
    : process.platform === 'win32'
      ? [
          { command: 'py', args: ['-3.11'] },
          { command: 'python3.11', args: [] },
          { command: 'python', args: [] },
          { command: 'python3', args: [] },
        ]
      : [
          { command: 'python3.11', args: [] },
          { command: 'python3', args: [] },
          { command: 'python', args: [] },
        ];

  for (const candidate of pythonCandidates) {
    try {
      const version = getPythonVersion(candidate.command, candidate.args);
      if (version === requiredPythonVersion) return candidate;
      if (configuredPython) {
        throw new Error(
          `PYTHON is configured as ${configuredPython}, but it resolves to Python ${version}; Python ${requiredPythonVersion} is required.`,
        );
      }
    } catch (error) {
      if (configuredPython) throw error;
    }
  }

  throw new Error(
    `Python ${requiredPythonVersion} was not found. Install it or set PYTHON to its executable before building the AI service.`,
  );
}

const pythonCommand = resolvePythonCommand();
console.log(`Using Python ${requiredPythonVersion} (${pythonCommand.command}) for the AI service.`);

if (fs.existsSync(virtualEnvironmentPython)
  && getPythonVersion(virtualEnvironmentPython) !== requiredPythonVersion) {
  fs.rmSync(virtualEnvironmentDirectory, { recursive: true, force: true });
}

if (!fs.existsSync(virtualEnvironmentPython)) {
  execFileSync(
    pythonCommand.command,
    [...pythonCommand.args, '-m', 'venv', virtualEnvironmentDirectory],
    { stdio: 'inherit' },
  );
}

if (!fs.existsSync(virtualEnvironmentPython)) {
  throw new Error(`Python virtual environment was not created at ${virtualEnvironmentPython}.`);
}

if (getPythonVersion(virtualEnvironmentPython) !== requiredPythonVersion) {
  throw new Error(`AI service virtual environment must use Python ${requiredPythonVersion}.`);
}

execFileSync(virtualEnvironmentPython, ['-m', 'pip', 'install', '--no-cache-dir', '-r', requirementsPath], { stdio: 'inherit' });
console.log(`Installed AI dependencies into ${virtualEnvironmentDirectory}`);
