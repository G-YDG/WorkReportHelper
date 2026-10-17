import { Notification } from 'electron'
export const showNotification = (title, body) =>
  new Notification({ title, body, silent: false }).show()
