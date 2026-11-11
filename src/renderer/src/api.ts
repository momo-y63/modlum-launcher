export { api, type Api } from './bridge'

export function errorMessage(err: unknown): string {
  if (err instanceof Error) {
    return err.message
  }
  if (typeof err === 'string') return err
  return String(err)
}
