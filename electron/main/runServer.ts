import { ChildProcessWithoutNullStreams } from 'child_process'
import ChildProcess from 'child_process'
import { MainLogger } from 'electron-log'
import { join } from 'path'

let flaskProcess: ChildProcessWithoutNullStreams | null

const startServer = (log: MainLogger) => {
  if (flaskProcess) {
    return
  }

  flaskProcess = ChildProcess.spawn(join(process.cwd(), 'resources', 'jm.exe'), {
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
