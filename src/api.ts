import { isMaximized, isMenuActive } from './composables/useAppState'

const {
  on,
  send,
  invoke,
  close,
  minimize,
  toggleDevtools,
  toggleMaximize,
  reload,
  forceReload,
  quit,
  requestPython,
  os,
  checkHeartbeat,
  // dialog
  showOpenDialog,
  showSaveDialog,
  showMessageBox,
  showErrorBox,
  // shell
  showItemInFolder,
  openPath,
  trashItem,
  beep,
  webContents,
  //download
  download,
  getDownloadFileSavedPath,
  getDownloadFileState,
  setDownloadFileState
} = window.api

/**
 * Open the given external protocol URL in the desktop's default manner. (For
 * example, mailto: URLs in the user's default mail agent).
 *
 * @param url Max 2081 characters on windows.
 * @param options OpenExternalOptions
 *
 * @see {@link https://www.electronjs.org/docs/latest/api/shell#shellopenexternalurl-options}
 */
const openExternal = window.api.openExternal

export {
  isMaximized,
  isMenuActive,
  requestPython,
  close,
  minimize,
  toggleDevtools,
  toggleMaximize,
  reload,
  forceReload,
  quit,
  os,
  checkHeartbeat,
  // dialog
  showOpenDialog,
  showSaveDialog,
  showMessageBox,
  showErrorBox,
  // shell
  showItemInFolder,
  openPath,
  openExternal,
  trashItem,
  beep,
  webContents,
  on,
  send,
  invoke,
  download,
  getDownloadFileSavedPath,
  getDownloadFileState,
  setDownloadFileState
}
