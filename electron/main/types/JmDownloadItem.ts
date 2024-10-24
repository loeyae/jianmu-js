import DownloadItem = Electron.DownloadItem

interface JmDownloadItem {
  fingerPrint: string,
  url: string,
  filePath: string,
  item?: DownloadItem
}
