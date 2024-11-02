import {
  contextBridge,
  ipcRenderer,
  MessageBoxOptions,
  MessageBoxReturnValue,
  OpenDialogOptions,
  OpenDialogReturnValue,
  OpenExternalOptions,
  SaveDialogOptions,
  SaveDialogReturnValue
} from 'electron'
import PythonResponse from './types/PythonResponse'
import WebContentsPrintOptions = Electron.WebContentsPrintOptions

const platform = () => ipcRenderer.invoke('platform') as Promise<string>
// platform.isMac = async () => (await platform()) === 'darwin'
// platform.isWindows = async () => (await platform()) === 'win32'
// platform.isLinux = async () => (await platform()) === 'linux'

const api = {
  os: { platform },
  on: (channel: string, listener: (event: any, ...args: any[]) => void) =>
    ipcRenderer.on(channel, listener),
  send: (channel: string, ...args: any[]) => ipcRenderer.send(channel, ...args),
  invoke: (channel: string, ...args: any[]) => ipcRenderer.invoke(channel, ...args) as Promise<any>,
  minimize: () => ipcRenderer.send('minimize'),
  isMaximized: () => ipcRenderer.invoke('is-maximized') as Promise<boolean>,
  toggleMaximize: () => ipcRenderer.send('toggle-maximize'),
  close: () => ipcRenderer.send('close'),
  toggleDevtools: () => ipcRenderer.send('toggle-devtools'),
  reload: () => ipcRenderer.send('reload'),
  forceReload: () => ipcRenderer.send('force-reload'),
  quit: () => ipcRenderer.send('quit'),
  printerList: () => ipcRenderer.invoke('printer-list'),
  printerPrint: (options: WebContentsPrintOptions, callback: (success: boolean, failureReason: string) => void) => ipcRenderer.send('printer-print', options, callback),
  requestPython: <T = any>(method: string, ...args: any[]) =>
    ipcRenderer.invoke('request-python', method, ...args) as Promise<
      PythonResponse<T>
    >,
  download: (url: string, filePath: string, fingerPrint: string) => ipcRenderer.send(
    'download-file',
    url,
    filePath,
    fingerPrint
  ),
  getDownloadFileState: (fingerPrint: string, url: string, returnType = 'str') => ipcRenderer.invoke(
    'get-download-file-state',
    fingerPrint, url, returnType
  ) as Promise<DownloadResult|string>,
  setDownloadFileState: (fingerPrint: string, url: string, state: string) => ipcRenderer.send(
    'set-download-file-state',
    state, fingerPrint, url
  ),
  getDownloadFileSavedPath: (fingerPrint: string) => ipcRenderer.invoke(
    'get-download-file-saved-path',
    fingerPrint
  ) as Promise<string>,
  showOpenDialog: (options: OpenDialogOptions) =>
    ipcRenderer.invoke(
      'show-open-dialog',
      options
    ) as Promise<OpenDialogReturnValue>,
  showSaveDialog: (options: SaveDialogOptions) =>
    ipcRenderer.invoke(
      'show-save-dialog',
      options
    ) as Promise<SaveDialogReturnValue>,
  showMessageBox: (options: MessageBoxOptions) =>
    ipcRenderer.invoke(
      'show-message-box',
      options
    ) as Promise<MessageBoxReturnValue>,
  showErrorBox: (title: string, content: string) =>
    ipcRenderer.invoke('show-error-box', title, content) as Promise<void>,
  showItemInFolder: (fullPath: string) =>
    ipcRenderer.invoke('show-item-in-folder', fullPath) as Promise<void>,
  openPath: (path: string) =>
    ipcRenderer.invoke('open-path', path) as Promise<string>,
  openExternal: (url: string, options?: OpenExternalOptions) =>
    ipcRenderer.invoke('open-external', url, options) as Promise<void>,
  trashItem: (path: string) =>
    ipcRenderer.invoke('trash-item', path) as Promise<void>,
  beep: () => ipcRenderer.invoke('beep') as Promise<void>,
  checkHeartbeat: () =>
    ipcRenderer.invoke('check-heartbeat') as Promise<boolean>,
  webContents: (func: string, ...args: any[]) =>
    ipcRenderer.invoke('webcontent-func', func, ...args) as Promise<any>,
  ping: (message: string) => ipcRenderer.invoke('ping', message) as Promise<void>,
  fileDelete: (path: string) => ipcRenderer.invoke('file-delete', path) as Promise<boolean>,
  fileExists: (path: string) => ipcRenderer.invoke('file-exists', path) as Promise<boolean>,
  openDir: (path: string, isOpenFile: boolean) => ipcRenderer.invoke('open-dir', path, isOpenFile) as Promise<string>
}

contextBridge.exposeInMainWorld('api', api)

export { api }
