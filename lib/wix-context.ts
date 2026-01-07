import { cookies } from "next/headers";
import { getLatestWixTokenForSite } from "@/lib/db";

export async function getActiveWixToken() {
  const jar = cookies();
  const siteId = jar.get("udito_site_id")?.value ?? null;
  const instanceId = jar.get("udito_instance_id")?.value ?? null;
  if (!siteId && !instanceId) {
    return null;
  }
  const token = await getLatestWixTokenForSite({ siteId, instanceId });
  if (token) {
    return token;
  }
  if (!instanceId) {
    return null;
  }
  return {
    instance_id: instanceId,
    site_id: null,
    access_token: null,
    refresh_token: null,
    expires_at: null,
  };
}

export function getActiveWixContext() {
  const jar = cookies();
  return {
    siteId: jar.get("udito_site_id")?.value ?? null,
    instanceId: jar.get("udito_instance_id")?.value ?? null,
  };
}
