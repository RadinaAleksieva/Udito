import { cookies } from "next/headers";
import { getLatestWixTokenForSite } from "@/lib/db";
import { auth } from "@/lib/auth";
import { getUserStores } from "@/lib/auth";

export async function getActiveWixToken() {
  const jar = cookies();
  let siteId = jar.get("udito_site_id")?.value ?? null;
  let instanceId = jar.get("udito_instance_id")?.value ?? null;

  // If no cookies, check user session for store_connections
  if (!siteId && !instanceId) {
    const session = await auth();
    if (session?.user?.id) {
      const userStores = await getUserStores(session.user.id);
      if (userStores.length > 0) {
        siteId = userStores[0].site_id ?? null;
        instanceId = userStores[0].instance_id ?? null;
      }
    }
  }

  if (!siteId && !instanceId) {
    return null;
  }

  const token = await getLatestWixTokenForSite({ siteId, instanceId });
  if (token) {
    return token;
  }
  if (!instanceId && !siteId) {
    return null;
  }
  return {
    instance_id: instanceId,
    site_id: siteId,
    access_token: null,
    refresh_token: null,
    expires_at: null,
  };
}

export async function getActiveWixContext() {
  const jar = cookies();
  let siteId = jar.get("udito_site_id")?.value ?? null;
  let instanceId = jar.get("udito_instance_id")?.value ?? null;

  // If no cookies, check user session for store_connections
  if (!siteId && !instanceId) {
    const session = await auth();
    if (session?.user?.id) {
      const userStores = await getUserStores(session.user.id);
      if (userStores.length > 0) {
        siteId = userStores[0].site_id ?? null;
        instanceId = userStores[0].instance_id ?? null;
      }
    }
  }

  return { siteId, instanceId };
}
