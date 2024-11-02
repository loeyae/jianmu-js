import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  MessageBoxOptions,
  OpenDialogOptions,
  OpenExternalOptions,
  SaveDialogOptions,
  shell,
  protocol
} from 'electron'
import path, { join } from 'path'
import got from 'got'
import os from 'os'
import log from 'electron-log/main'
import { closeServer, startServer, stopServer } from './runServer'
import { downloadFile, downloadListener } from './downloadEvent'
import WebContents = Electron.Main.WebContents
import fs from 'fs'
import WebContentsPrintOptions = Electron.WebContentsPrintOptions

const isDevelopment = process.env.NODE_ENV === 'development'

log.initialize({ preload: true})
log.transports.file.level = 'info'
log.transports.file.maxSize = 1024 * 1024
log.transports.file.format = '[{y}-{m}-{d} {h}:{i}:{s}.{ms}] [{level}] {text}'

if (!isDevelopment) {
  log.transports.console.level = false
}
log.transports.file.resolvePathFn = () => {
  if (isDevelopment) {
    return path.join(path.dirname(app.getAppPath()), '../../../../', 'log', 'main.log')
  }
  return path.join(path.dirname(app.getPath('exe')), 'log', 'main.log')
}

// Menu.setApplicationMenu(null)

let mainWindow: BrowserWindow | null

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 768,
    frame: false,
    icon: join(__dirname, 'static/icon.png'),
    webPreferences: {
      preload: join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: false
    }
  })

  if (isDevelopment) {
    const rendererPort = process.argv[2]
    mainWindow.loadURL(`http://localhost:${rendererPort}`)
  } else {
    mainWindow.loadFile(join(app.getAppPath(), 'renderer', 'index.html'))
  }
  log.info('mainWindow created')
}

app.whenReady().then(() => {
  // 这个需要在app.ready触发之后使用
  protocol.registerFileProtocol('atom', (request, callback) => {
    const pathname = path.normalize(decodeURIComponent(request.url.replace('atom://', '')));
    callback(pathname)
  })
  createWindow()
  app.on('activate', function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

// app.on('session-created', session => {
//   if (mainWindow) {
//     downloadListener(mainWindow, session, log)
//   } else {
//     log.error('session-created: mainWindow is null')
//   }
// })

app.on('ready', () => {
  if (!isDevelopment) {
    startServer(log)
  }
})

app.on('window-all-closed', function () {
  // if (process.platform !== 'darwin') {
  //   app.quit()
  // }
  if (!isDevelopment) {
    closeServer()
  }
  app.quit()
})

ipcMain.on('minimize', () => {
  mainWindow?.minimize()
})

ipcMain.handle('is-maximized', () => mainWindow?.isMaximized())

ipcMain.on('toggle-maximize', () => {
  if (mainWindow?.isMaximized()) {
    mainWindow.unmaximize()
  } else {
    mainWindow?.maximize()
  }
})

ipcMain.on('close', () => {
  if (!isDevelopment) {
    stopServer()
  }
  mainWindow?.close()
})

ipcMain.on('toggle-devtools', () => {
  if (process.env.NODE_ENV === 'development') {
    mainWindow?.webContents.toggleDevTools()
  }
})

ipcMain.on('reload', () => {
  mainWindow?.reload()
})

ipcMain.on('force-reload', () => {
  mainWindow?.webContents.reloadIgnoringCache()
})

ipcMain.on('quit', () => {
  if (!isDevelopment) {
    stopServer()
  }
  app.quit()
})

ipcMain.handle('request-python', async (_, method: string, ...args: any[]) => {
  if (!method) {
    throw new Error('No method provided')
  }
  const url = `http://localhost:19020/api/${method}`
  try {
    const res = await got
      .post(url, {
        json: args
      })
      .json()
    return res
  } catch (e: any) {
    return {
      error: 1,
      message: e.message,
      data: null
    }
  }
})

ipcMain.handle('show-open-dialog', (_, options: OpenDialogOptions) => {
  if (mainWindow) {
    return dialog.showOpenDialog(mainWindow, options)
  }
})

ipcMain.handle('show-save-dialog', (_, options: SaveDialogOptions) => {
  if (mainWindow) {
    return dialog.showSaveDialog(mainWindow, options)
  }
})

ipcMain.handle('show-message-box', (_, options: MessageBoxOptions) => {
  if (mainWindow) {
    return dialog.showMessageBox(mainWindow, options)
  }
})

ipcMain.handle('show-error-box', (_, title: string, content: string) => {
  if (mainWindow) {
    return dialog.showErrorBox(title, content)
  }
})

ipcMain.handle('show-item-in-folder', (_, fullPath: string) =>
  shell.showItemInFolder(fullPath)
)

/**
 * 接收渲染进程 下载文件的通知
 */
ipcMain.on('download-file', function(event, url, filePath, fingerPrint) {
  if (mainWindow) {
    log.info('download-file', url)
    downloadListener(mainWindow, event.sender.session, log, true)
    downloadFile(mainWindow, log, url, filePath, fingerPrint)
  } else {
    log.error('mainWindow is null')
  }
})

ipcMain.handle('open-path', (_, path: string) => shell.openPath(path))

ipcMain.handle(
  'open-external',
  (_, url: string, options?: OpenExternalOptions) =>
    shell.openExternal(url, options)
)

ipcMain.handle('trash-item', (_, path: string) => shell.trashItem(path))

ipcMain.handle('beep', () => shell.beep())

ipcMain.handle('platform', () => os.platform())
ipcMain.handle('printer-list', () => mainWindow?.webContents.getPrintersAsync())

ipcMain.on('printer-print', (_, options: WebContentsPrintOptions, callback?: (success: boolean, failureReason: string) => void) => {
  mainWindow?.webContents.print(options, callback)
})

let count = 0
ipcMain.handle('check-heartbeat', async () => {
  try {
    const res = await got.get(
      'http://localhost:19020/__jianmu_api__/heartbeat',
      {
        timeout: 1000
      }
    )
    count = 0
    return res.statusCode === 200
  } catch(e) {
    count += 1
    log.info("check-heartbeat:", count)
    if (!isDevelopment && count > 30) {
      closeServer()
      startServer(log)
    }
    return false
  }
})


/**接收渲染进程 打开指定路径的本地文件 的通知 并返回结果（路径存在能打开就返回true，路径不存在无法打开就返回false）
 * @param {Object} event
 * @param {String} path
 */
ipcMain.handle('open-dir', function (event, path, isOpenFile) {
  log.info('open-dir', path);
  if (!path) return false;
  if (isOpenFile) {
    shell.openPath(path);//打开文件
    return true;
  } else {
    const checkPath = fs.existsSync(path);//以同步的方法检测文件路径是否存在。
    log.info('file exists:', checkPath);
    if (checkPath) {//文件存在直接打开所在目录
      shell.showItemInFolder(path);
      return true;
    } else {
      return false;
    }
  }

});

/**
 * 接收渲染进程 判断文件路径是否存在 的通知 返回是否存在的布尔值结果
 */
ipcMain.handle('fs-exists', function (event, path) {
  if (!path) return false;
  //以同步的方法检测文件路径是否存在。
  return fs.existsSync(path);
});

/**
 * 接收渲染进程 删除文件 的通知 返回是否时间啊名称及的布尔值结果
 */
ipcMain.handle('fs-delete', function (event, path) {
  if (!path) return false;
  const checkPath = fs.existsSync(path);
  if (checkPath) {
    fs.rmSync(path)
  }
  return true
});

ipcMain.handle('fs-mkdir', function (event, path){
  return fs.mkdirSync(path, { mode: 0o777, recursive: true})
})

ipcMain.handle('webcontent-func',(_, func: string, ...args: any[]) => {
  if (mainWindow) {
    try {
      const webContents: WebContents = mainWindow.webContents;

      // 检查函数是否存在，防止运行时错误
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      if (webContents[func] && typeof webContents[func] === 'function') {
        // 使用call()方法调用WebContents的方法
        // 注意：'this'在webContents对象中将被设置为webContents实例
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore
        return webContents[func].call(webContents, ...args);
      } else {
        console.warn(`Function ${func} does not exist on WebContents instance.`);
      }
    } catch(error) {
      log.error(`Error calling ${func}:`, error);
    }
  } else {
    log.error('No mainWindow found.');
  }
})
