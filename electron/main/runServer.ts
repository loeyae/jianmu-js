import { ChildProcessWithoutNullStreams } from 'child_process'
import ChildProcess from 'child_process'
import { MainLogger } from 'electron-log'
import { join } from 'path'
import FileSystem from 'fs'
import {  dialog } from 'electron'

let flaskProcess: ChildProcessWithoutNullStreams | null



const startServer = (log: MainLogger) => {
  if (flaskProcess) {
    return
  }
  let exeName = 'jm'

  if (FileSystem.existsSync(join(process.cwd(), 'jianmu-builder.json'))) {
    const buildConfig = JSON.parse(FileSystem.readFileSync(join(process.cwd(), 'jianmu-builder.json'), 'utf8'))
    exeName = `${buildConfig['productName']}Svr`
  }

  if (!FileSystem.existsSync(join(process.cwd(), 'resources', exeName +`.exe`))) {
    dialog.showErrorBox('error', `服务文件：${exeName}.exe不存在`)
  }

  ChildProcess.exec(`tasklist | findstr ${exeName}.exe`, (err, stdout, stderr) => {
    if (stdout.trim() !== '') {
      log.info(`${exeName}.exe is running`);
      ChildProcess.exec(`taskkill /IM ${exeName}.exe /F`);
    } else {
      log.info(`${exeName}.exe not running`);
    }
  });

  flaskProcess = ChildProcess.spawn(join(process.cwd(), 'resources', exeName +`.exe`), {
    cwd: join(process.cwd(), 'resources'),
    env: {
      ...process.env
    }
  })

  flaskProcess.stdout.on('data', (data) => {
    log.info(`stdout: ${data}`)
  })

  flaskProcess.stderr.on('data', (data) => {
    log.error(`stderr: ${data}`)
  })

  flaskProcess.on('exit', () => {
    stopServer()
  })
}

const stopServer = () => {
  if (flaskProcess && flaskProcess.exitCode === null) {
    flaskProcess.removeAllListeners('exit')
    flaskProcess.kill()
    flaskProcess = null
  }
}

const closeServer = () => {
  if (flaskProcess) {
    flaskProcess.removeAllListeners()
    flaskProcess.kill()
    flaskProcess = null
  }
}

export { startServer, stopServer, closeServer }
