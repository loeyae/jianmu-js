import { BrowserWindow, ipcMain, shell } from 'electron'
import path from 'path'
import fs from 'fs'
import { MainLogger } from 'electron-log'
import { Dictionary } from 'lodash'
import log from 'electron-log/main'




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

const downloadListener = (mainWindow: BrowserWindow, session: Electron.Session, log: MainLogger, unregister = false) => {
  const listener = (event: Event, item: Electron.DownloadItem) => {
    const webContents = mainWindow.webContents
    log.info(`收到下载文件通知：${item.getURL()}`)
    const downloadItem = getDownloadItemByUrl(item.getURL())
    if (!downloadItem) return
    const fingerPrint = downloadItem.fingerPrint
    downloadItem.item = item
    downloadItems[fingerPrint] = downloadItem
    const filePath = downloadItem.filePath
    item.setSavePath(filePath)
    //(2) 监听updated事件，当下载正在执行时，把下载进度发给渲染进程进行展示
    item.on('updated', (event, state) => {
      switch (state) {
        case 'interrupted'://下载中断
          webContents.send('watch-download-file-state', state, {          //推送给渲染进程 下载过程中 的状态
            fingerPrint: fingerPrint,
            url: item.getURL()
          })
          break;
        case 'progressing'://下载中
          if (item.isPaused()) { // 下载停止
            webContents.send('watch-download-file-state', 'pause', {         //推送给渲染进程 下载过程中 的状态
              fingerPrint: fingerPrint,
              url: item.getURL()
            })
          } else if (item.getReceivedBytes() && item.getTotalBytes()) {//下载中
            webContents.send('watch-download-file-state', state, {        //推送给渲染进程 下载过程中 的状态
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
    item.on('done', (event, state)=> {
      if (unregister) {
        item.removeAllListeners('updated')
        item.removeAllListeners('done')
        session.removeListener('will-download', listener)
      }
      switch (state) {
        case 'completed': //下载完成
          log.log(`文件${fingerPrint}:${item.getURL()}下载完成`)
          webContents.send('watch-download-file-state', state, {//推送给渲染进程 下载过程中 的状态
            savedPath: filePath,
            fingerPrint: fingerPrint,
            url: item.getURL()
          })
          if (fingerPrint in repeatedItems) {
            const i = 0
            while (i < repeatedItems[fingerPrint].length){
              const fi = repeatedItems[fingerPrint][i]
              log.log(`重复文件${fi.fingerPrint}:${item.getURL()}下载完成`)
              fs.copyFileSync(filePath, fi.filePath)
              webContents.send('watch-download-file-state', 'completed', {//推送给渲染进程 下载过程中 的状态
                savedPath: fi.filePath,
                fingerPrint: fi.fingerPrint,
                url: item.getURL()
              })
              delete repeatedItems[fingerPrint][i]
            }
            delete repeatedItems[fingerPrint]
          }
          if (fingerPrint in downloadItems) {
            if ('item' in downloadItems[fingerPrint]) {
              delete downloadItems[fingerPrint].item
            }
            delete downloadItems[fingerPrint]
          }
          break;
        case 'interrupted': //下载中断
          webContents.send('watch-download-file-state', state, {//推送给渲染进程 下载过程中 的状态
            fingerPrint: fingerPrint,
            url: item.getURL()
          })
          break;
        case 'cancelled': //下载取消
          webContents.send('watch-download-file-state', state, {//推送给渲染进程 下载过程中 的状态
            fingerPrint: fingerPrint,
            url: item.getURL()
          })
          if (fingerPrint in downloadItems) {
            if ('item' in downloadItems[fingerPrint]) {
              delete downloadItems[fingerPrint].item
            }
            delete downloadItems[fingerPrint]
            if (fingerPrint in repeatedItems) {
              delete repeatedItems[fingerPrint]
            }
          }
          break;
      }
    })
  }
  log.info('register download listener')
  session.on('will-download', listener)
}

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
        delete downloadItems[fingerPrint].item
        delete downloadItems[fingerPrint]
        delete repeatedItems[fingerPrint]
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


export {downloadFile, downloadListener}
