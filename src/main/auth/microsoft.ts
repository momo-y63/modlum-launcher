import type { Account, DeviceCodeInfo } from '../../shared/types'

/**
 * Microsoft → Xbox Live → XSTS → Minecraft kimlik doğrulama zinciri.
 * Cihaz kodu (device code) akışı kullanılır: kullanıcı tarayıcıda kod girer,
 * launcher token'ı kendisi alır. client_id, Azure uygulama kaydından gelir.
 */

const DEVICE_CODE_URL = 'https://login.microsoftonline.com/consumers/oauth2/v2.0/devicecode'
const TOKEN_URL = 'https://login.microsoftonline.com/consumers/oauth2/v2.0/token'
const XBL_URL = 'https://user.auth.xboxlive.com/user/authenticate'
const XSTS_URL = 'https://xsts.auth.xboxlive.com/xsts/authorize'
const MC_LOGIN_URL = 'https://api.minecraftservices.com/authentication/login_with_xbox'
const MC_PROFILE_URL = 'https://api.minecraftservices.com/minecraft/profile'
const MC_ENTITLEMENTS_URL = 'https://api.minecraftservices.com/entitlements/mcstore'

const SCOPE = 'XboxLive.signin offline_access'

interface DeviceCodeResponse {
  device_code: string
  user_code: string
  verification_uri: string
  expires_in: number
  interval: number
  message: string
}

interface TokenResponse {
  access_token?: string
  refresh_token?: string
  expires_in?: number
  error?: string
  error_description?: string
}

interface XblResponse {
  Token: string
  DisplayClaims: { xui: { uhs: string }[] }
}

interface XstsResponse {
  Token: string
  DisplayClaims: { xui: { uhs: string; xid?: string }[] }
}

export class AuthError extends Error {
  code?: string
  constructor(message: string, code?: string) {
    super(message)
    this.code = code
  }
}

async function postJson<T>(url: string, body: unknown, headers: Record<string, string> = {}): Promise<T> {
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...headers
    },
    body: JSON.stringify(body)
  })
  const text = await res.text()
  let data: any = null
  try {
    data = text ? JSON.parse(text) : null
  } catch {
    data = null
  }
  if (!res.ok) {
    const message = data?.error_description || data?.Message || data?.error || `HTTP ${res.status}`
    throw new AuthError(String(message), data?.error)
  }
  return data as T
}

function requireClientId(clientId: string): string {
  const id = clientId.trim()
  if (!id) {
    throw new AuthError(
      'Microsoft girişi için Ayarlar bölümüne Azure uygulama (client) ID girmelisin. Nasıl alınacağı Ayarlar sayfasında anlatılıyor.',
      'no_client_id'
    )
  }
  return id
}

export async function requestDeviceCode(clientIdRaw: string): Promise<DeviceCodeResponse> {
  const clientId = requireClientId(clientIdRaw)
  const res = await fetch(DEVICE_CODE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: clientId, scope: SCOPE })
  })
  const data = await res.json()
  if (!res.ok) {
    throw new AuthError(data?.error_description ?? `Cihaz kodu alınamadı (HTTP ${res.status})`)
  }
  return data as DeviceCodeResponse
}

async function pollToken(
  clientId: string,
  deviceCode: string,
  intervalSec: number,
  expiresInSec: number,
  onTick?: (secondsLeft: number) => void
): Promise<TokenResponse> {
  const started = Date.now()
  let interval = Math.max(3, intervalSec)
  while (Date.now() - started < expiresInSec * 1000) {
    await new Promise((r) => setTimeout(r, interval * 1000))
    const elapsed = Math.floor((Date.now() - started) / 1000)
    onTick?.(Math.max(0, expiresInSec - elapsed))

    const res = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
        client_id: clientId,
        device_code: deviceCode
      })
    })
    const data = (await res.json()) as TokenResponse

    if (res.ok && data.access_token) return data

    switch (data.error) {
      case 'authorization_pending':
        continue
      case 'slow_down':
        interval += 5
        continue
      case 'authorization_declined':
        throw new AuthError('Giriş iptal edildi.', data.error)
      case 'expired_token':
        throw new AuthError('Kodun süresi doldu, tekrar dene.', data.error)
      default:
        throw new AuthError(data.error_description || data.error || 'Microsoft girişi başarısız.', data.error)
    }
  }
  throw new AuthError('Giriş zaman aşımına uğradı.', 'expired_token')
}

function xstsErrorMessage(xerr: string): string {
  switch (xerr) {
    case '2148916233':
      return 'Bu Microsoft hesabına bağlı bir Xbox profili yok. account.xbox.com adresinden bir profil oluştur.'
    case '2148916235':
      return 'Xbox Live bu ülkede kullanılamıyor.'
    case '2148916236':
    case '2148916237':
      return 'Hesap, yaş doğrulaması gerektiriyor (aile/çocuk hesabı).'
    case '2148916238':
      return 'Çocuk hesabı bir yetişkin (aile) hesabına bağlanmalı.'
    case '2148916227':
      return 'Bu Xbox hesabı yasaklanmış.'
    default:
      return `Xbox Live yetkilendirmesi başarısız (XErr: ${xerr}).`
  }
}

export async function completeDeviceLogin(
  clientIdRaw: string,
  deviceCode: DeviceCodeResponse,
  onTick?: (secondsLeft: number) => void
): Promise<Account> {
  const clientId = requireClientId(clientIdRaw)
  const token = await pollToken(
    clientId,
    deviceCode.device_code,
    deviceCode.interval,
    deviceCode.expires_in,
    onTick
  )
  if (!token.access_token) throw new AuthError('Microsoft token alınamadı.')

  // 1) Xbox Live
  const xbl = await postJson<XblResponse>(XBL_URL, {
    Properties: {
      AuthMethod: 'RPS',
      SiteName: 'user.auth.xboxlive.com',
      RpsTicket: `d=${token.access_token}`
    },
    RelyingParty: 'http://auth.xboxlive.com',
    TokenType: 'JWT'
  })

  // 2) XSTS
  let xsts: XstsResponse
  try {
    xsts = await postJson<XstsResponse>(XSTS_URL, {
      Properties: { SandboxId: 'RETAIL', UserTokens: [xbl.Token] },
      RelyingParty: 'rp://api.minecraftservices.com/',
      TokenType: 'JWT'
    })
  } catch (err) {
    const xerr = (err as AuthError & { XErr?: string }).XErr
    if (xerr) throw new AuthError(xstsErrorMessage(String(xerr)), String(xerr))
    throw err
  }

  const uhs = xsts.DisplayClaims.xui[0]?.uhs
  const xuid = xsts.DisplayClaims.xui[0]?.xid
  if (!uhs) throw new AuthError('XSTS yanıtı beklenmedik biçimde geldi.')

  // 3) Minecraft
  const mc = await postJson<{ access_token: string; expires_in: number }>(MC_LOGIN_URL, {
    identityToken: `XBL3.0 x=${uhs};${xsts.Token}`
  })

  // 4) Oyun sahipliği kontrolü
  try {
    const ent = await fetch(MC_ENTITLEMENTS_URL, {
      headers: { Authorization: `Bearer ${mc.access_token}` }
    })
    if (ent.ok) {
      const data = (await ent.json()) as { items?: unknown[] }
      if (!data.items || data.items.length === 0) {
        throw new AuthError('Bu hesap Minecraft: Java Edition sahibi görünmüyor.')
      }
    }
  } catch (err) {
    if (err instanceof AuthError) throw err
    // ağ hatasında devam et
  }

  const profileRes = await fetch(MC_PROFILE_URL, {
    headers: { Authorization: `Bearer ${mc.access_token}` }
  })
  if (!profileRes.ok) {
    if (profileRes.status === 404) {
      throw new AuthError('Bu hesapta Minecraft profili yok (oyun satın alınmamış olabilir).')
    }
    throw new AuthError(`Minecraft profili alınamadı (HTTP ${profileRes.status}).`)
  }
  const profile = (await profileRes.json()) as { id: string; name: string }

  return {
    id: `ms-${profile.id}`,
    type: 'microsoft',
    username: profile.name,
    uuid: profile.id,
    accessToken: mc.access_token,
    refreshToken: token.refresh_token,
    expiresAt: Date.now() + (mc.expires_in ?? 86400) * 1000,
    xuid
  }
}

export async function refreshMicrosoftAccount(account: Account, clientIdRaw: string): Promise<Account> {
  const clientId = requireClientId(clientIdRaw)
  if (!account.refreshToken) throw new AuthError('Yenileme anahtarı yok, tekrar giriş yapmalısın.')

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: clientId,
      refresh_token: account.refreshToken,
      scope: SCOPE
    })
  })
  const data = (await res.json()) as TokenResponse
  if (!res.ok || !data.access_token) {
    throw new AuthError(data.error_description || 'Microsoft oturumu yenilenemedi, tekrar giriş yap.')
  }

  const xbl = await postJson<XblResponse>(XBL_URL, {
    Properties: {
      AuthMethod: 'RPS',
      SiteName: 'user.auth.xboxlive.com',
      RpsTicket: `d=${data.access_token}`
    },
    RelyingParty: 'http://auth.xboxlive.com',
    TokenType: 'JWT'
  })

  const xsts = await postJson<XstsResponse>(XSTS_URL, {
    Properties: { SandboxId: 'RETAIL', UserTokens: [xbl.Token] },
    RelyingParty: 'rp://api.minecraftservices.com/',
    TokenType: 'JWT'
  })
  const uhs = xsts.DisplayClaims.xui[0]?.uhs
  if (!uhs) throw new AuthError('XSTS yanıtı beklenmedik biçimde geldi.')

  const mc = await postJson<{ access_token: string; expires_in: number }>(MC_LOGIN_URL, {
    identityToken: `XBL3.0 x=${uhs};${xsts.Token}`
  })

  return {
    ...account,
    accessToken: mc.access_token,
    refreshToken: data.refresh_token ?? account.refreshToken,
    expiresAt: Date.now() + (mc.expires_in ?? 86400) * 1000,
    xuid: xsts.DisplayClaims.xui[0]?.xid ?? account.xuid
  }
}

export function toDeviceCodeInfo(code: DeviceCodeResponse): DeviceCodeInfo {
  return {
    userCode: code.user_code,
    verificationUri: code.verification_uri,
    expiresIn: code.expires_in,
    message: code.message
  }
}
