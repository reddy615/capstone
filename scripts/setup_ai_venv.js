const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const aiServiceDirectory = path.resolve(__dirname, '..', 'relieflink', 'ai-service');
const virtualEnvironmentDirectory = path.join(aiServiceDirectory, '.venv');
const requirementsPath = path.join(aiServiceDirectory, 'requirements.txt');
const pythonCommand = process.platform === 'win32' ? 'python' : 'python3';
const pythonRelativePath = process.platform === 'win32' ? ['Scripts', 'python.exe'] : ['bin', 'python'];
const pipRelativePath = process.platform === 'win32' ? ['Scripts', 'pip.exe'] : ['bin', 'pip'];
const virtualEnvironmentPython = path.join(virtualEnvironmentDirectory, ...pythonRelativePath);
const virtualEnvironmentPip = path.join(virtualEnvironmentDirectory, ...pipRelativePath);

execFileSync(pythonCommand, ['-m', 'venv', virtualEnvironmentDirectory], { stdio: 'inherit' });
if (!fs.existsSync(virtualEnvironmentPip) || !fs.existsSync(virtualEnvironmentPython)) {
  throw new Error(`Python virtual environment was not created at ${virtualEnvironmentDirectory}.`);
}
execFileSync(virtualEnvironmentPip, ['install', '--no-cache-dir', '-r', requirementsPath], { stdio: 'inherit' });
console.log(`Installed AI dependencies into ${virtualEnvironmentDirectory}`);
