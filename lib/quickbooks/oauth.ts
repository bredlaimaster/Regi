import { prisma } from "@/lib/prisma";
import { encrypt, decrypt } from "./crypto";

const AUTH_BASE = "https://appcenter.intuit.com/connect/oauth2";
const TOKEN_URL = "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer";

export function buildAuthUrl(state: string) {
  const params = new URLSearchParams({
    client_id: process.env.QBO_CLIENT_ID!,
    response_type: "code",
    scope: "com.intuit.quickbooks.accounting",
    redirect_uri: process.env.QBO_REDIRECT_URI!,
    state,
  });
  return `${AUTH_BASE}?${params.toString()}`;
}

type TokenResp = {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  x_refresh_token_expires_in: number;
};

async function fetchToken(body: URLSearchParams): Promise<TokenResp> {
  const auth = Buffer.from(`${process.env.QBO_CLIENT_ID}:${process.env.QBO_CLIENT_SECRET}`).toString("base64");
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      Accept: "application/json",
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });
  if (!res.ok) throw new Error(`QBO token error ${res.status}: ${await res.text()}`);
  return res.json();
}

export async function exchangeCode(code: string) {
  return fetchToken(new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: process.env.QBO_REDIRECT_URI!,
  }));
}

export async function refreshToken(refresh: string) {
  return fetchToken(new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refresh,
  }));
}

/** Get a valid access token for a tenant, refreshing if near expiry. */
export async function getValidAccessToken(tenantId: string): Promise<{ accessToken: string; realmId: string }> {
  const conn = await prisma.qboConnection.findUnique({ where: { tenantId } });
  if (!conn) throw new Error("QBO not connected for tenant");

  if (conn.expiresAt.getTime() - Date.now() > 60_000) {
    return { accessToken: conn.accessToken, realmId: conn.realmId };
  }

  const resp = await refreshToken(decrypt(conn.refreshTokenEnc));
  const updated = await prisma.qboConnection.update({
    where: { tenantId },
    data: {
      accessToken: resp.access_token,
      refreshTokenEnc: encrypt(resp.refresh_token),
      expiresAt: new Date(Date.now() + resp.expires_in * 1000),
    },
  });
  return { accessToken: updated.accessToken, realmId: updated.realmId };
}

export async function storeConnection(tenantId: string, realmId: string, tok: TokenResp) {
  const refreshTokenExpiresAt = tok.x_refresh_token_expires_in
    ? new Date(Date.now() + tok.x_refresh_token_expires_in * 1000)
    : new Date(Date.now() + 100 * 24 * 60 * 60 * 1000); // default 100 days

  await prisma.qboConnection.upsert({
    where: { tenantId },
    create: {
      tenantId,
      realmId,
      accessToken: tok.access_token,
      refreshTokenEnc: encrypt(tok.refresh_token),
      expiresAt: new Date(Date.now() + tok.expires_in * 1000),
      refreshTokenExpiresAt,
    },
    update: {
      realmId,
      accessToken: tok.access_token,
      refreshTokenEnc: encrypt(tok.refresh_token),
      expiresAt: new Date(Date.now() + tok.expires_in * 1000),
      refreshTokenExpiresAt,
    },
  });
}
