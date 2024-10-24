import { BrowserWindow, ipcMain, shell } from 'electron'
import path from 'path'
import fs from 'fs'
import { MainLogger } from 'electron-log'
import { Dictionary } from 'lodash'




const downloadItems: Dictionary<JmDownloadItem> = {};
const repeatedItems: Dictionary<JmDownloadItem[]> = {};

function getDownloadItemByUrl(url: string) {
  for (const downloadItemsKey in downloadItems) {
    if (downloadItems[downloadItemsKey].url === url) {
      return downloadItems[downloadItemsKey]
    }
  }
  return undefined
}

function downloadFile(win: BrowserWindow, log: MainLogger, url: string, filePath: string, fingerPrint: string) {
  log.info(`开始下载文件：${url}, 保存路径：${filePath}`)
  const jmItem = getDownloadItemByUrl(url)
  if (jmItem) {
    const item = jmItem.item;
    if (jmItem.fingerPrint === fingerPrint) {
      if (item?.isPaused()) {
        item.resume()
        return
      } else {
        return
      }
    } else {
      const repeatedItem = repeatedItems[fingerPrint] || []
      repeatedItem.push({url, filePath, fingerPrint})
      log.info(`文件重复下载，已添加到队列：${JSON.stringify(repeatedItem)}`)
      repeatedItems[fingerPrint] = repeatedItem
      downloadItems[fingerPrint] = {fingerPrint, url, filePath, item}
      return
    }
  }
  const directory = path.dirname(filePath)
  if (!fs.existsSync(directory)) {
    log.info(`创建下载目录：${directory}`)
    fs.mkdirSync(directory, { mode: 0o777, recursive: true })
  }
  downloadItems[fingerPrint] = {fingerPrint, url, filePath}
  win.webContents.downloadURL(url)
}

const downloadEvent = (mainWindow: BrowserWindow, log: MainLogger) => {
  mainWindow.webContents.session.on('will-download', function(event, item) {
    const downloadItem = getDownloadItemByUrl(item.getURL())
    if (!downloadItem) return
    const fingerPrint = downloadItem.fingerPrint
    downloadItem.item = item
    downloadItems[fingerPrint] = downloadItem
    const filePath = downloadItem.filePath
    item.setSavePath(filePath)
    //(2) 监听updated事件，当下载正在执行时，把下载进度发给渲染进程进行展示
    item.on('updated', (_, state) => {
      switch (state) {
        case 'interrupted'://下载中断
          mainWindow.webContents.send('watch-download-file-state', state, {//推送给渲染进程 下载过程中 的状态
            fingerPrint: fingerPrint,
            url: item.getURL()
          })
          break;
        case 'progressing'://下载中
          if (item.isPaused()) { // 下载停止
            mainWindow.webContents.send('watch-download-file-state', 'pause', {//推送给渲染进程 下载过程中 的状态
              fingerPrint: fingerPrint,
              url: item.getURL()
            })
          } else if (item.getReceivedBytes() && item.getTotalBytes()) {//下载中
            mainWindow.webContents.send('watch-download-file-state', state, {//推送给渲染进程 下载过程中 的状态
              savedPath: filePath,
              loaded: item.getReceivedBytes(),
              total: item.getTotalBytes(),
              fingerPrint: fingerPrint,
              url: item.getURL()
            })
          }
          break;
      }
    })
    //(3) 监听done事件，在下载完成时打开文件。
    item.on('done', function(event, state)  {
      switch (state) {
        case 'completed': //下载完成
          delete downloadItems[fingerPrint]
          mainWindow.webContents.send('watch-download-file-state', state, {//推送给渲染进程 下载过程中 的状态
            savedPath: filePath,
            fingerPrint: fingerPrint,
            url: item.getURL()
          })
          if (fingerPrint in repeatedItems) {
            for (let i = 0; i < repeatedItems[fingerPrint].length; i++) {
              const fi = repeatedItems[fingerPrint][i]
              fs.copyFileSync(filePath, fi.filePath)
              delete downloadItems[fingerPrint]
              mainWindow.webContents.send('watch-download-file-state', 'completed', {//推送给渲染进程 下载过程中 的状态
                savedPath: fi.filePath,
                fingerPrint: fi.fingerPrint,
                url: item.getURL()
              })
            }
          }
          break;
        case 'interrupted': //下载中断
          mainWindow.webContents.send('watch-download-file-state', state, {//推送给渲染进程 下载过程中 的状态
            fingerPrint: fingerPrint,
            url: item.getURL()
          })
          break;
        case 'cancelled': //下载取消
          delete downloadItems[fingerPrint]
          mainWindow.webContents.send('watch-download-file-state', state, {//推送给渲染进程 下载过程中 的状态
            fingerPrint: fingerPrint,
            url: item.getURL()
          })
          break;
      }
    })
  })

  /**
   * 接收渲染进程 下载文件的通知
   */
  ipcMain.on('download-file', function(event, url, filePath, fingerPrint) {
    downloadFile(mainWindow, log, url, filePath, fingerPrint)
  })

  ipcMain.on('ping', function(event, message){
    log.info(`ping: ${message}`)
  })

  /**
   * 接收渲染进程 获取下载状态 的通知
   * @param {String} fingerPrint 文件指纹（因为同一个文件即使不同名，下载路径也是一样的，所以需要消息指纹识别）
   * @param {String} url 文件下载路径
   * @param {String (str|obj)} returnType 返回的类型， 值为str是仅仅返回一个状态，值为obj返回一个对象
   */
  ipcMain.handle('get-download-file-state', function (event, fingerPrint, url, returnType = 'str') {
    let state = null;
    const jmItem = downloadItems[fingerPrint]
    const item = jmItem?.item;
    if (item && url === item.getURL()) {
      state = item.getState();//返回 string - 当前状态。 可以是 progressing、 completed、 cancelled 或 interrupted。
      if (state === 'progressing') {
        if (item.isPaused()) {
          state = 'interrupted';
        }
      }
      return returnType === 'str' ? state : {state: state};
    }
    return returnType === 'str' ? state : {state: state};
  });

  /**
   * 接收渲染进程 设置下载状态（暂停、恢复、取消） 的通知
   * @param {String} state 需要暂停下载的路径（pause：暂停下载，stop：取消下载，resume：恢复下载）
   * @param {String} fingerPrint 需要暂停下载的文件指纹（因为同一个文件即使不同名，下载路径也是一样的，所以需要消息指纹识别）
   * @param {String} url 需要暂停下载的路径
   *
   */
  ipcMain.on('set-download-file-state', function (event, state, fingerPrint, url) {
    const jmItem = downloadItems[fingerPrint]
    const item = jmItem?.item;
    if (item && url === item.getURL()) {
      switch (state) {
        case 'pause':
          item.pause();//暂停下载
          break;
        case 'cancel':
          item.cancel();//取消下载
          delete downloadItems[fingerPrint]
          break;
        case 'resume':
          if (item.canResume()) {
            item.resume();
          }
          break;
      }
    }
  });

  /**
   * 接收渲染进程 获取某个下载文件的下载存放路径 的通知 返回下载存放路径
   * @param {String} fingerPrint 文件指纹
   */
  ipcMain.handle('get-download-file-saved-path', function (event, fingerPrint) {
    const item = downloadItems[fingerPrint];
    if (!item) return null;
    return item.item ? item.item.getSavePath() : null;
  });

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

}

export default downloadEvent
