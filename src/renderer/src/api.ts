import type { Api } from '../../preload/index'

declare global {
  interface Window {
    api: Api
  }
}

export const api: Api = window.api

export function errorMessage(err: unknown): string {
  if (err instanceof Error) {
    // Electron IPC hataları "Error invoking remote method ...: Error: <mesaj>" biçiminde gelir
    const match = err.message.match(/Error: (.*)$/s)
    return match ? match[1] : err.message
  }
  return String(err)
}
