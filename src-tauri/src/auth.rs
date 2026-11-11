use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Duration;

use serde::Deserialize;
use serde_json::{json, Value};

use crate::model::{now_ms, Account, DeviceCodeInfo};
use crate::net::client;

/**
 * Microsoft → Xbox Live → XSTS → Minecraft kimlik doğrulama zinciri.
 * Cihaz kodu (device code) akışı kullanılır: kullanıcı tarayıcıda kod girer,
 * launcher token'ı kendisi alır. client_id, Azure uygulama kaydından gelir.
 */
const DEVICE_CODE_URL: &str = "https://login.microsoftonline.com/consumers/oauth2/v2.0/devicecode";
const TOKEN_URL: &str = "https://login.microsoftonline.com/consumers/oauth2/v2.0/token";
const XBL_URL: &str = "https://user.auth.xboxlive.com/user/authenticate";
const XSTS_URL: &str = "https://xsts.auth.xboxlive.com/xsts/authorize";
const MC_LOGIN_URL: &str = "https://api.minecraftservices.com/authentication/login_with_xbox";
const MC_PROFILE_URL: &str = "https://api.minecraftservices.com/minecraft/profile";
const MC_ENTITLEMENTS_URL: &str = "https://api.minecraftservices.com/entitlements/mcstore";
const SCOPE: &str = "XboxLive.signin offline_access";

#[derive(Deserialize, Clone, Debug)]
pub struct DeviceCode {
    pub device_code: String,
    pub user_code: String,
    pub verification_uri: String,
    pub expires_in: u64,
    #[serde(default)]
    pub interval: u64,
    #[serde(default)]
    pub message: String,
}

#[derive(Deserialize, Default)]
struct TokenResponse {
    access_token: Option<String>,
    refresh_token: Option<String>,
    expires_in: Option<u64>,
    error: Option<String>,
    error_description: Option<String>,
}

fn require_client_id(client_id_raw: &str) -> Result<String, String> {
    let id = client_id_raw.trim();
    if id.is_empty() {
        return Err(
            "Microsoft girişi için Ayarlar bölümüne Azure uygulama (client) ID girmelisin. Nasıl alınacağı Ayarlar sayfasında anlatılıyor."
                .to_string(),
        );
    }
    Ok(id.to_string())
}

async fn post_json(url: &str, body: &Value, bearer: Option<&str>) -> Result<Value, String> {
    let mut request = client()
        .post(url)
        .header("Content-Type", "application/json")
        .header("Accept", "application/json")
        .json(body);
    if let Some(token) = bearer {
        request = request.header("Authorization", format!("Bearer {token}"));
    }
    let res = request.send().await.map_err(|e| e.to_string())?;
    let status = res.status();
    let text = res.text().await.unwrap_or_default();
    let data: Value = if text.trim().is_empty() {
        Value::Null
    } else {
        serde_json::from_str(&text).unwrap_or(Value::Null)
    };
    if !status.is_success() {
        let message = data
            .get("error_description")
            .and_then(|value| value.as_str())
            .or_else(|| data.get("Message").and_then(|value| value.as_str()))
            .or_else(|| data.get("error").and_then(|value| value.as_str()))
            .map(|value| value.to_string())
            .unwrap_or_else(|| format!("HTTP {}", status.as_u16()));
        if let Some(xerr) = data.get("XErr").and_then(|value| value.as_u64()) {
            return Err(xsts_error_message(&xerr.to_string()));
        }
        return Err(message);
    }
    Ok(data)
}

fn xsts_error_message(xerr: &str) -> String {
    match xerr {
        "2148916233" => "Bu Microsoft hesabına bağlı bir Xbox profili yok. account.xbox.com adresinden bir profil oluştur.".to_string(),
        "2148916235" => "Xbox Live bu ülkede kullanılamıyor.".to_string(),
        "2148916236" | "2148916237" => "Hesap, yaş doğrulaması gerektiriyor (aile/çocuk hesabı).".to_string(),
        "2148916238" => "Çocuk hesabı bir yetişkin (aile) hesabına bağlanmalı.".to_string(),
        "2148916227" => "Bu Xbox hesabı yasaklanmış.".to_string(),
        other => format!("Xbox Live yetkilendirmesi başarısız (XErr: {other})."),
    }
}

pub async fn request_device_code(client_id_raw: &str) -> Result<DeviceCode, String> {
    let client_id = require_client_id(client_id_raw)?;
    let res = client()
        .post(DEVICE_CODE_URL)
        .form(&[("client_id", client_id.as_str()), ("scope", SCOPE)])
        .send()
        .await
        .map_err(|e| e.to_string())?;
    let status = res.status();
    let text = res.text().await.unwrap_or_default();
    if !status.is_success() {
        let data: Value = serde_json::from_str(&text).unwrap_or(Value::Null);
        let message = data
            .get("error_description")
            .and_then(|value| value.as_str())
            .map(|value| value.to_string())
            .unwrap_or_else(|| format!("Cihaz kodu alınamadı (HTTP {})", status.as_u16()));
        return Err(message);
    }
    serde_json::from_str(&text).map_err(|e| e.to_string())
}

async fn poll_token(
    client_id: &str,
    device_code: &str,
    interval_sec: u64,
    expires_in_sec: u64,
) -> Result<TokenResponse, String> {
    let mut interval = interval_sec.max(3);
    let started = std::time::Instant::now();
    while started.elapsed() < Duration::from_secs(expires_in_sec.max(1)) {
        tokio::time::sleep(Duration::from_secs(interval)).await;
        let res = client()
            .post(TOKEN_URL)
            .form(&[
                ("grant_type", "urn:ietf:params:oauth:grant-type:device_code"),
                ("client_id", client_id),
                ("device_code", device_code),
            ])
            .send()
            .await
            .map_err(|e| e.to_string())?;
        let status = res.status();
        let text = res.text().await.unwrap_or_default();
        let data: TokenResponse = serde_json::from_str(&text).unwrap_or_default();
        if status.is_success() && data.access_token.is_some() {
            return Ok(data);
        }
        match data.error.as_deref() {
            Some("authorization_pending") => continue,
            Some("slow_down") => {
                interval += 5;
                continue;
            }
            Some("authorization_declined") => return Err("Giriş iptal edildi.".to_string()),
            Some("expired_token") => return Err("Kodun süresi doldu, tekrar dene.".to_string()),
            _ => {
                return Err(data
                    .error_description
                    .or(data.error)
                    .unwrap_or_else(|| "Microsoft girişi başarısız.".to_string()))
            }
        }
    }
    Err("Giriş zaman aşımına uğradı.".to_string())
}

async fn xbox_chain(ms_access_token: &str) -> Result<(String, Option<String>, String), String> {
    // 1) Xbox Live
    let xbl = post_json(
        XBL_URL,
        &json!({
            "Properties": {
                "AuthMethod": "RPS",
                "SiteName": "user.auth.xboxlive.com",
                "RpsTicket": format!("d={ms_access_token}")
            },
            "RelyingParty": "http://auth.xboxlive.com",
            "TokenType": "JWT"
        }),
        None,
    )
    .await?;
    let xbl_token = xbl
        .get("Token")
        .and_then(|value| value.as_str())
        .ok_or_else(|| "Xbox Live yanıtı beklenmedik biçimde geldi.".to_string())?
        .to_string();

    // 2) XSTS
    let xsts = post_json(
        XSTS_URL,
        &json!({
            "Properties": { "SandboxId": "RETAIL", "UserTokens": [xbl_token] },
            "RelyingParty": "rp://api.minecraftservices.com/",
            "TokenType": "JWT"
        }),
        None,
    )
    .await?;
    let xui = xsts
        .get("DisplayClaims")
        .and_then(|claims| claims.get("xui"))
        .and_then(|xui| xui.get(0));
    let uhs = xui
        .and_then(|entry| entry.get("uhs"))
        .and_then(|value| value.as_str())
        .ok_or_else(|| "XSTS yanıtı beklenmedik biçimde geldi.".to_string())?
        .to_string();
    let xuid = xui
        .and_then(|entry| entry.get("xid"))
        .and_then(|value| value.as_str())
        .map(|value| value.to_string());
    let xsts_token = xsts
        .get("Token")
        .and_then(|value| value.as_str())
        .ok_or_else(|| "XSTS yanıtı beklenmedik biçimde geldi.".to_string())?
        .to_string();

    // 3) Minecraft
    let mc = post_json(
        MC_LOGIN_URL,
        &json!({ "identityToken": format!("XBL3.0 x={uhs};{xsts_token}") }),
        None,
    )
    .await?;
    let mc_token = mc
        .get("access_token")
        .and_then(|value| value.as_str())
        .ok_or_else(|| "Minecraft token alınamadı.".to_string())?
        .to_string();

    Ok((mc_token, xuid, xsts_token))
}

async fn verify_ownership(mc_token: &str) -> Result<(), String> {
    let res = client()
        .get(MC_ENTITLEMENTS_URL)
        .header("Authorization", format!("Bearer {mc_token}"))
        .send()
        .await;
    let Ok(res) = res else {
        // ağ hatasında devam et
        return Ok(());
    };
    if !res.status().is_success() {
        return Ok(());
    }
    let data: Value = res.json().await.unwrap_or(Value::Null);
    let empty = data
        .get("items")
        .and_then(|items| items.as_array())
        .map(|items| items.is_empty())
        .unwrap_or(true);
    if empty {
        return Err("Bu hesap Minecraft: Java Edition sahibi görünmüyor.".to_string());
    }
    Ok(())
}

pub async fn complete_device_login(
    client_id_raw: &str,
    device: &DeviceCode,
    cancelled: &AtomicBool,
) -> Result<Account, String> {
    let client_id = require_client_id(client_id_raw)?;
    let token = poll_token(
        &client_id,
        &device.device_code,
        device.interval,
        device.expires_in,
    )
    .await?;
    let ms_token = token
        .access_token
        .clone()
        .ok_or_else(|| "Microsoft token alınamadı.".to_string())?;
    if cancelled.load(Ordering::SeqCst) {
        return Err("Giriş iptal edildi.".to_string());
    }

    let (mc_token, xuid, _) = xbox_chain(&ms_token).await?;
    verify_ownership(&mc_token).await?;

    let res = client()
        .get(MC_PROFILE_URL)
        .header("Authorization", format!("Bearer {mc_token}"))
        .send()
        .await
        .map_err(|e| e.to_string())?;
    if !res.status().is_success() {
        if res.status().as_u16() == 404 {
            return Err("Bu hesapta Minecraft profili yok (oyun satın alınmamış olabilir).".to_string());
        }
        return Err(format!(
            "Minecraft profili alınamadı (HTTP {}).",
            res.status().as_u16()
        ));
    }
    let profile: Value = res.json().await.map_err(|e| e.to_string())?;
    let id = profile
        .get("id")
        .and_then(|value| value.as_str())
        .ok_or_else(|| "Minecraft profili okunamadı.".to_string())?
        .to_string();
    let name = profile
        .get("name")
        .and_then(|value| value.as_str())
        .unwrap_or("Oyuncu")
        .to_string();

    Ok(Account {
        id: format!("ms-{id}"),
        account_type: "microsoft".to_string(),
        username: name,
        uuid: id,
        access_token: Some(mc_token),
        refresh_token: token.refresh_token,
        expires_at: Some(now_ms() + token.expires_in.unwrap_or(86400) * 1000),
        xuid,
    })
}

pub async fn refresh_microsoft_account(account: &Account, client_id_raw: &str) -> Result<Account, String> {
    let client_id = require_client_id(client_id_raw)?;
    let refresh_token = account
        .refresh_token
        .clone()
        .ok_or_else(|| "Yenileme anahtarı yok, tekrar giriş yapmalısın.".to_string())?;

    let res = client()
        .post(TOKEN_URL)
        .form(&[
            ("grant_type", "refresh_token"),
            ("client_id", client_id.as_str()),
            ("refresh_token", refresh_token.as_str()),
            ("scope", SCOPE),
        ])
        .send()
        .await
        .map_err(|e| e.to_string())?;
    let text = res.text().await.unwrap_or_default();
    let data: TokenResponse = serde_json::from_str(&text).unwrap_or_default();
    let ms_token = data.access_token.clone().ok_or_else(|| {
        data.error_description
            .clone()
            .unwrap_or_else(|| "Microsoft oturumu yenilenemedi, tekrar giriş yap.".to_string())
    })?;

    let (mc_token, xuid, _) = xbox_chain(&ms_token).await?;

    let mut updated = account.clone();
    updated.access_token = Some(mc_token);
    updated.refresh_token = data.refresh_token.or(account.refresh_token.clone());
    updated.expires_at = Some(now_ms() + data.expires_in.unwrap_or(86400) * 1000);
    updated.xuid = xuid.or(account.xuid.clone());
    Ok(updated)
}

pub fn to_device_code_info(code: &DeviceCode) -> DeviceCodeInfo {
    DeviceCodeInfo {
        user_code: code.user_code.clone(),
        verification_uri: code.verification_uri.clone(),
        expires_in: code.expires_in,
        message: code.message.clone(),
    }
}
