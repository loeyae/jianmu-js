const ChildProcess = require('child_process')
const Path = require('path')
const Chalk = require('chalk')
const Chokidar = require('chokidar')
const FileSystem = require('fs')
const { splitOutputData, spawnAsync } = require('./private/tools')

async function installer(pipPath, _projectPath, PYTHONPATH) {
  await (pipPath, ['install', 'pyinstaller'], {
    cwd: _projectPath,
    env: {
      ...process.env,
      PYTHONPATH
    }
  }).then((code) => {
    const prefix = Chalk.blueBright(`[pip] `)
    process.stdout.write(prefix + 'pyinstaller installed')
  }).catch((error, code) =>{
    const prefix = Chalk.redBright(`[pip] `)
    process.stderr.write(prefix + `pip install pyinstaller failed with code ${code}`)
    process.exit()
  })
}

async function buildExec(pyinstallerPath, jmPath, _projectPath, PYTHONPATH) {
  await spawnAsync(pyinstallerPath, ['-F', '--add-data',
    'src:src', '--hidden-import', 'engineio.async_drivers', '-p', '.', jmPath], {
    cwd: _projectPath,
    env: {
      ...process.env,
      PYTHONPATH
    }
  }).then((code) => {
    const prefix = Chalk.blueBright(`[pip] `)
    process.stdout.write(prefix + 'pyinstaller build success')
  }).catch((error, code) => {
    const prefix = Chalk.redBright('[pyinstaller] ')
    process.stderr.write(prefix + `pyinstaller build failed with code ${code}`)
    process.exit(code)
  })
}

async function buildServer(_pythonPath, _jianmuPath, _projectPath) {
  const jmPath = Path.resolve(_jianmuPath, 'jm.py')
  const pipPath = Path.resolve(Path.dirname(_pythonPath), 'pip')
  const pyinstallerPath = Path.resolve(Path.dirname(_pythonPath), 'pyinstaller')
  const PYTHONPATH = process.env.PYTHONPATH
    ? `${_projectPath}:${process.env.PYTHONPATH}`
    : _projectPath
  ChildProcess.exec(pyinstallerPath + ' --version', (error, stdout, stderr) => {
    if (error) {
      installer(pipPath, _projectPath, PYTHONPATH)
    }
    if (stdout) {
      buildExec(pyinstallerPath, jmPath, _projectPath, PYTHONPATH)
    }
  })
}

module.exports = buildServer
