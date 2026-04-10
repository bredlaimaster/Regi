import { getValidAccessToken } from "./oauth";

function baseUrl() {
  return process.env.QBO_ENVIRONMENT === "production"
    ? "https://quickbooks.api.intuit.com"
    : "https://sandbox-quickbooks.api.intuit.com";
}

export async function qboFetch(tenantId: string, path: string, init: RequestInit = {}) {
  const { accessToken, realmId } = await getValidAccessToken(tenantId);
  const url = `${baseUrl()}/v3/company/${realmId}${path}`;
  const res = await fetch(url, {
    ...init,
    headers: {
      ...(init.headers ?? {}),
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
      "Content-Type": "application/json",
    },
  });
  if (!res.ok) throw new Error(`QBO ${res.status}: ${await res.text()}`);
  return res.json();
}
