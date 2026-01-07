import { cookies } from "next/headers";

export function getActiveSiteId() {
  const jar = cookies();
  return jar.get("udito_site_id")?.value ?? null;
}

export function getActiveInstanceId() {
  const jar = cookies();
  return jar.get("udito_instance_id")?.value ?? null;
}
