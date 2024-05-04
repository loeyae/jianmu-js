import {
  BrowserWindow,
  ipcMain
} from 'electron'
import path from 'path'
import fs from 'fs'
import { MainLogger } from 'electron-log'

const downloadItems: any[] = [];


const downloadEvent = (mainWindow: BrowserWindow, log: MainLogger) => {
  mainWindow.webContents.session.on('will-download', (_, item) => {
    const downloadItemIndex = downloadItems.findIndex(i => i.url === item.getURL())
    const downloadItem = downloadItems[downloadItemIndex]
    const fingerPrint = downloadItem.fingerPrint
    downloadItem.item = item
    downloadItems[downloadItemIndex] = downloadItem
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
    item.on('done', (_, state) => {
      switch (state) {
        case 'completed': //下载完成
          mainWindow.webContents.send('watch-download-file-state', state, {//推送给渲染进程 下载过程中 的状态
            savedPath: filePath,
            fingerPrint: fingerPrint,
            url: item.getURL()
          })
          break;
        case 'interrupted': //下载中断
          mainWindow.webContents.send('watch-download-file-state', state, {//推送给渲染进程 下载过程中 的状态
            fingerPrint: fingerPrint,
            url: item.getURL()
          })
          break;
        case 'cancelled': //下载取消
          for (let i = 0; i < downloadItems.length; i++) {
            if (fingerPrint === downloadItems[i].fingerPrint && downloadItems[i].item.getURL() === item.getURL()) {
              downloadItems.splice(i, 1);
              break;
            }
          }
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
  ipcMain.on('download-file', (_, url, filePath, fingerPrint) => {
    const index = downloadItems.findIndex(i => i.url === url)
    if (index !== -1) {
      if (downloadItems[index].item) {
        const item = downloadItems[index].item;
        if (item.isPaused()) {
          item.resume()
          return
        } else {
          return
        }
      }
    }
    const directory = path.dirname(filePath)
    if (!fs.existsSync(directory)) {
      fs.mkdirSync(directory, { mode: 0o777, recursive: true })
    }
    downloadItems.push({fingerPrint, url, filePath})
    mainWindow.webContents.downloadURL(url)
  })

  /**
   * 接收渲染进程 获取下载状态 的通知
   * @param {String} fingerPrint 文件指纹（因为同一个文件即使不同名，下载路径也是一样的，所以需要消息指纹识别）
   * @param {String} url 文件下载路径
   * @param {String (str|obj)} returnType 返回的类型， 值为str是仅仅返回一个状态，值为obj返回一个对象
   */
  ipcMain.handle('get-download-file-state', function (_, fingerPrint, url, returnType = 'str') {
    let state = null;
    for (let i = 0; i < downloadItems.length; i++) {
      if (downloadItems[i].fingerPrint === fingerPrint) {
        const item = downloadItems[i].item;
        if (item && url === item.getURL()) {
          state = item.getState();//返回 string - 当前状态。 可以是 progressing、 completed、 cancelled 或 interrupted。
          if (state === 'progressing') {
            if (item.isPaused()) {
              state = 'interrupted';
            }
          }
          return returnType === 'str' ? state : {state: state};
        }
      }
    }
    return returnType === 'str' ? state : {state: state};
  });

  /**接收渲染进程 设置下载状态（暂停、恢复、取消） 的通知
   * @param {String} state 需要暂停下载的路径（pause：暂停下载，stop：取消下载，resume：恢复下载）
   * @param {String} fingerPrint 需要暂停下载的文件指纹（因为同一个文件即使不同名，下载路径也是一样的，所以需要消息指纹识别）
   * @param {String} url 需要暂停下载的路径
   *
   */
  ipcMain.on('set-download-file-state', function (_, state, fingerPrint, url) {
    for (let i = 0; i < downloadItems.length; i++) {
      if (downloadItems[i].fingerPrint === fingerPrint) {
        const item = downloadItems[i].item;
        if (item && url === item.getURL()) {
          switch (state) {
            case 'pause':
              item.pause();//暂停下载
              break;
            case 'cancel':
              item.cancel();//取消下载
              downloadItems.splice(i, 1);
              break;
            case 'resume':
              if (item.canResume()) {
                item.resume();
              }
              break;
          }
        }
      }
    }
  });

  /**接收渲染进程 获取某个下载文件的下载存放路径 的通知 返回下载存放路径
   * @param {String} fingerPrint 文件指纹
   */
  ipcMain.handle('get-download-file-saved-path', function (_, fingerPrint) {
    const item = downloadItems.find(i => i.fingerPrint === fingerPrint);
    if (!item) return null;
    console.info('get-download-file-saved-path', fingerPrint, item.item.getSavePath());
    return item.item ? item.item.getSavePath() : null;
  });

}

export default downloadEvent
