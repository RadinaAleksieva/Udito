import type { NextAuthOptions } from "next-auth";
import type { Adapter, AdapterUser, AdapterAccount, AdapterSession, VerificationToken } from "next-auth/adapters";
import GoogleProvider from "next-auth/providers/google";
import CredentialsProvider from "next-auth/providers/credentials";
import { sql } from "@/lib/sql";
import bcrypt from "bcryptjs";
import { getServerSession } from "next-auth";
import { cookies } from "next/headers";
import {
  getSchemaForSite,
  createTenantTables,
  createTenantUser,
  getTenantUser,
  getTenantUserByEmail,
  getTenantUserByAccount,
  updateTenantUser,
  linkTenantAccount,
  createTenantSession,
  getTenantSessionAndUser,
  updateTenantSession,
  deleteTenantSession,
  getTenantCompany,
  type TenantUser,
} from "@/lib/tenant-db";

// =============================================================================
// SITE ID RESOLUTION
// =============================================================================

/**
 * Извлича site_id от различни източници
 * Приоритет: URL params > cookies > null
 */
export async function resolveSiteId(): Promise<string | null> {
  try {
    const cookieStore = await cookies();

    // Try wix_site_id cookie first
    const siteIdCookie = cookieStore.get("wix_site_id");
    if (siteIdCookie?.value) {
      return siteIdCookie.value;
    }

    // Try instance cookie
    const instanceCookie = cookieStore.get("wix_instance_id");
    if (instanceCookie?.value) {
      // Look up site_id from instance_id
      const result = await sql.query(`
        SELECT site_id FROM store_connections WHERE instance_id = $1 LIMIT 1
      `, [instanceCookie.value]);
      if (result.rows[0]?.site_id) {
        return result.rows[0].site_id;
      }
      return instanceCookie.value; // Use instance_id as fallback
    }

    return null;
  } catch (error) {
    console.error("[resolveSiteId] Error:", error);
    return null;
  }
}

// =============================================================================
// TENANT-AWARE ADAPTER
// =============================================================================

/**
 * Създава tenant-aware NextAuth adapter
 * Всички операции се извършват в schema на текущия магазин
 */
function createTenantAdapter(siteId: string): Adapter {
  return {
    async createUser(user: Omit<AdapterUser, "id">) {
      // Ensure tenant tables exist
      const schema = await getSchemaForSite(siteId);
      if (!schema) {
        console.log(`[createUser] Creating tenant tables for site ${siteId}`);
        await createTenantTables(siteId);
      }

      const tenantUser = await createTenantUser(siteId, {
        email: user.email,
        name: user.name ?? null,
        image: user.image ?? null,
        emailVerified: user.emailVerified ?? null,
        role: 'owner', // First user is owner
      });

      return {
        id: tenantUser.id,
        email: tenantUser.email,
        name: tenantUser.name ?? null,
        image: tenantUser.image ?? null,
        emailVerified: tenantUser.emailVerified ?? null,
      } as AdapterUser;
    },

    async getUser(id: string) {
      const user = await getTenantUser(siteId, id);
      if (!user) return null;
      return {
        id: user.id,
        email: user.email,
        name: user.name ?? null,
        image: user.image ?? null,
        emailVerified: user.emailVerified ?? null,
      } as AdapterUser;
    },

    async getUserByEmail(email: string) {
      const user = await getTenantUserByEmail(siteId, email);
      if (!user) return null;
      return {
        id: user.id,
        email: user.email,
        name: user.name ?? null,
        image: user.image ?? null,
        emailVerified: user.emailVerified ?? null,
      } as AdapterUser;
    },

    async getUserByAccount({ provider, providerAccountId }: { provider: string; providerAccountId: string }) {
      const user = await getTenantUserByAccount(siteId, provider, providerAccountId);
      if (!user) return null;
      return {
        id: user.id,
        email: user.email,
        name: user.name ?? null,
        image: user.image ?? null,
        emailVerified: user.emailVerified ?? null,
      } as AdapterUser;
    },

    async updateUser(user: Partial<AdapterUser> & Pick<AdapterUser, "id">) {
      const updated = await updateTenantUser(siteId, user.id, {
        email: user.email,
        name: user.name,
        image: user.image,
        emailVerified: user.emailVerified,
      });
      if (!updated) {
        throw new Error(`User ${user.id} not found`);
      }
      return {
        id: updated.id,
        email: updated.email,
        name: updated.name ?? null,
        image: updated.image ?? null,
        emailVerified: updated.emailVerified ?? null,
      } as AdapterUser;
    },

    async linkAccount(account: AdapterAccount) {
      await linkTenantAccount(siteId, {
        id: crypto.randomUUID(),
        userId: account.userId,
        type: account.type,
        provider: account.provider,
        providerAccountId: account.providerAccountId,
        refresh_token: account.refresh_token,
        access_token: account.access_token,
        expires_at: account.expires_at,
        token_type: account.token_type,
        scope: account.scope,
        id_token: account.id_token,
        session_state: account.session_state as string | undefined,
      });
      return account;
    },

    async createSession(session: { sessionToken: string; userId: string; expires: Date }) {
      await createTenantSession(siteId, session);
      return session as AdapterSession;
    },

    async getSessionAndUser(sessionToken: string) {
      const result = await getTenantSessionAndUser(siteId, sessionToken);
      if (!result) return null;
      return {
        session: result.session as AdapterSession,
        user: {
          id: result.user.id,
          email: result.user.email,
          name: result.user.name ?? null,
          image: result.user.image ?? null,
          emailVerified: result.user.emailVerified ?? null,
        } as AdapterUser,
      };
    },

    async updateSession(session: Partial<AdapterSession> & Pick<AdapterSession, "sessionToken">) {
      if (session.expires) {
        await updateTenantSession(siteId, session.sessionToken, session.expires);
      }
      return session as AdapterSession;
    },

    async deleteSession(sessionToken: string) {
      await deleteTenantSession(siteId, sessionToken);
    },

    // Verification tokens - not used with JWT strategy but required by interface
    async createVerificationToken(token: VerificationToken) {
      return token;
    },

    async useVerificationToken({ identifier, token }: { identifier: string; token: string }) {
      return null;
    },
  };
}

// =============================================================================
// FALLBACK PUBLIC ADAPTER (за случаи без site_id)
// =============================================================================

const publicAdapter: Adapter = {
  async createUser(user: Omit<AdapterUser, "id">) {
    const id = crypto.randomUUID();
    await sql`
      INSERT INTO users (id, email, name, email_verified, image)
      VALUES (${id}, ${user.email}, ${user.name ?? null}, ${user.emailVerified?.toISOString() ?? null}, ${user.image ?? null})
    `;
    return {
      id,
      email: user.email,
      name: user.name ?? null,
      image: user.image ?? null,
      emailVerified: user.emailVerified ?? null,
    } as AdapterUser;
  },

  async getUser(id: string) {
    const result = await sql`SELECT * FROM users WHERE id = ${id}`;
    if (result.rows.length === 0) return null;
    const user = result.rows[0];
    return {
      id: user.id,
      email: user.email,
      name: user.name ?? null,
      image: user.image ?? null,
      emailVerified: user.email_verified ? new Date(user.email_verified) : null,
    } as AdapterUser;
  },

  async getUserByEmail(email: string) {
    const result = await sql`SELECT * FROM users WHERE email = ${email}`;
    if (result.rows.length === 0) return null;
    const user = result.rows[0];
    return {
      id: user.id,
      email: user.email,
      name: user.name ?? null,
      image: user.image ?? null,
      emailVerified: user.email_verified ? new Date(user.email_verified) : null,
    } as AdapterUser;
  },

  async getUserByAccount({ provider, providerAccountId }: { provider: string; providerAccountId: string }) {
    const result = await sql`
      SELECT u.* FROM users u
      JOIN accounts a ON u.id = a.user_id
      WHERE a.provider = ${provider} AND a.provider_account_id = ${providerAccountId}
    `;
    if (result.rows.length === 0) return null;
    const user = result.rows[0];
    return {
      id: user.id,
      email: user.email,
      name: user.name ?? null,
      image: user.image ?? null,
      emailVerified: user.email_verified ? new Date(user.email_verified) : null,
    } as AdapterUser;
  },

  async updateUser(user: Partial<AdapterUser> & Pick<AdapterUser, "id">) {
    const result = await sql`
      UPDATE users
      SET email = COALESCE(${user.email ?? null}, email),
          name = COALESCE(${user.name ?? null}, name),
          image = COALESCE(${user.image ?? null}, image),
          email_verified = COALESCE(${user.emailVerified?.toISOString() ?? null}, email_verified)
      WHERE id = ${user.id}
      RETURNING *
    `;
    const updated = result.rows[0];
    return {
      id: updated.id,
      email: updated.email,
      name: updated.name ?? null,
      image: updated.image ?? null,
      emailVerified: updated.email_verified ? new Date(updated.email_verified) : null,
    } as AdapterUser;
  },

  async linkAccount(account: AdapterAccount) {
    const id = crypto.randomUUID();
    await sql`
      INSERT INTO accounts (id, user_id, type, provider, provider_account_id, refresh_token, access_token, expires_at, token_type, scope, id_token, session_state)
      VALUES (${id}, ${account.userId}, ${account.type}, ${account.provider}, ${account.providerAccountId},
              ${account.refresh_token ?? null}, ${account.access_token ?? null}, ${account.expires_at ?? null},
              ${account.token_type ?? null}, ${account.scope ?? null}, ${account.id_token ?? null}, ${account.session_state ?? null})
    `;
    return account;
  },

  async createSession(session: { sessionToken: string; userId: string; expires: Date }) {
    await sql`
      INSERT INTO sessions (user_id, session_token, expires_at)
      VALUES (${session.userId}, ${session.sessionToken}, ${session.expires.toISOString()})
    `;
    return session as AdapterSession;
  },

  async getSessionAndUser(sessionToken: string) {
    const result = await sql`
      SELECT s.*, u.id as user_id, u.email, u.name, u.image, u.email_verified
      FROM sessions s
      JOIN users u ON s.user_id = u.id
      WHERE s.session_token = ${sessionToken} AND s.expires_at > NOW()
    `;
    if (result.rows.length === 0) return null;
    const row = result.rows[0];
    return {
      session: {
        sessionToken: row.session_token,
        userId: row.user_id,
        expires: new Date(row.expires_at),
      } as AdapterSession,
      user: {
        id: row.user_id,
        email: row.email,
        name: row.name ?? null,
        image: row.image ?? null,
        emailVerified: row.email_verified ? new Date(row.email_verified) : null,
      } as AdapterUser,
    };
  },

  async updateSession(session: Partial<AdapterSession> & Pick<AdapterSession, "sessionToken">) {
    if (session.expires) {
      await sql`
        UPDATE sessions SET expires_at = ${session.expires.toISOString()}
        WHERE session_token = ${session.sessionToken}
      `;
    }
    return session as AdapterSession;
  },

  async deleteSession(sessionToken: string) {
    await sql`DELETE FROM sessions WHERE session_token = ${sessionToken}`;
  },

  async createVerificationToken(token: VerificationToken) {
    return token;
  },

  async useVerificationToken({ identifier, token }: { identifier: string; token: string }) {
    return null;
  },
};

// =============================================================================
// AUTH OPTIONS
// =============================================================================

/**
 * Създава NextAuth options за конкретен site_id
 * Ако няма site_id, използва public adapter
 */
export function createAuthOptions(siteId: string | null): NextAuthOptions {
  const adapter = siteId ? createTenantAdapter(siteId) : publicAdapter;

  return {
    adapter,
    providers: [
      GoogleProvider({
        clientId: process.env.GOOGLE_CLIENT_ID || "",
        clientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
        allowDangerousEmailAccountLinking: true,
      }),
      CredentialsProvider({
        name: "credentials",
        credentials: {
          email: { label: "Email", type: "email" },
          password: { label: "Password", type: "password" },
        },
        async authorize(credentials) {
          if (!credentials?.email || !credentials?.password) {
            return null;
          }

          // Platform-agnostic authentication:
          // Users always authenticate against public.users table.
          // Store connections (Wix, Shopify, etc.) are separate from user identity.
          const result = await sql`
            SELECT * FROM users WHERE email = ${credentials.email}
          `;

          if (result.rows.length === 0) {
            console.log("[authorize] User not found:", credentials.email);
            return null;
          }

          const user = result.rows[0];

          if (!user.password_hash) {
            console.log("[authorize] User has no password (OAuth only):", credentials.email);
            return null;
          }

          const isValid = await bcrypt.compare(
            credentials.password,
            user.password_hash
          );

          if (!isValid) {
            console.log("[authorize] Invalid password for:", credentials.email);
            return null;
          }

          return {
            id: user.id,
            email: user.email,
            name: user.name,
            image: user.image,
          };
        },
      }),
    ],
    session: {
      strategy: "jwt",
    },
    pages: {
      signIn: "/login",
      error: "/login",
    },
    callbacks: {
      async signIn({ user, account }) {
        // Store site_id in session for later use
        if (siteId && user?.id) {
          try {
            // Link user to store if not already linked
            await linkStoreToUser(user.id, siteId);
          } catch (error) {
            console.error("[signIn] Error linking store to user:", error);
          }
        }
        return true;
      },
      async jwt({ token, user }) {
        if (user) {
          token.id = user.id;
        }
        // Add site_id to token
        if (siteId) {
          token.siteId = siteId;
        }
        return token;
      },
      async session({ session, token }) {
        if (token && session.user) {
          session.user.id = token.id as string;
          // @ts-ignore
          session.siteId = token.siteId;
        }
        return session;
      },
    },
  };
}

// Default auth options (uses public adapter)
export const authOptions: NextAuthOptions = createAuthOptions(null);

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Get session in server components
 */
export async function auth() {
  return getServerSession(authOptions);
}

/**
 * Get session with site context
 */
export async function authWithSite(siteId: string) {
  const options = createAuthOptions(siteId);
  return getServerSession(options);
}

export type ActiveStore = {
  siteId: string | null;
  instanceId: string | null;
  storeName: string | null;
  userId: string | null;
  schemaName: string | null;
};

/**
 * CRITICAL: This is the SINGLE source of truth for the current active store.
 * All code should use this function instead of directly accessing Wix cookies.
 *
 * Priority:
 * 1. requestedStoreId from URL params (ALWAYS takes precedence when provided)
 * 2. NextAuth session -> user's connected stores
 * 3. Wix cookies (legacy fallback)
 */
export async function getActiveStore(requestedStoreId?: string | null): Promise<ActiveStore | null> {
  const session = await auth();

  // Priority 1: If a specific store is requested via URL params
  if (requestedStoreId) {
    const schemaName = await getSchemaForSite(requestedStoreId);
    if (session?.user?.id) {
      const stores = await getUserStores(session.user.id);
      const requestedStore = stores.find(
        (s: any) => s.site_id === requestedStoreId || s.instance_id === requestedStoreId
      );
      if (requestedStore) {
        return {
          siteId: requestedStore.site_id || null,
          instanceId: requestedStore.instance_id || null,
          storeName: requestedStore.store_name || null,
          userId: session.user.id,
          schemaName: requestedStore.schema_name || schemaName || null,
        };
      }
    }

    return {
      siteId: requestedStoreId,
      instanceId: requestedStoreId,
      storeName: null,
      userId: session?.user?.id || null,
      schemaName,
    };
  }

  // Priority 2: NextAuth session - use first connected store
  if (session?.user?.id) {
    const stores = await getUserStores(session.user.id);
    if (stores.length > 0) {
      const store = stores[0];
      return {
        siteId: store.site_id || null,
        instanceId: store.instance_id || null,
        storeName: store.store_name || null,
        userId: session.user.id,
        schemaName: store.schema_name || null,
      };
    }
  }

  // Priority 3: Legacy Wix cookies (fallback)
  const { getActiveWixToken } = await import("@/lib/wix-context");
  const token = await getActiveWixToken();
  if (token) {
    const schemaName = token.site_id ? await getSchemaForSite(token.site_id) : null;
    return {
      siteId: token.site_id || null,
      instanceId: token.instance_id || null,
      storeName: null,
      userId: null,
      schemaName,
    };
  }

  return null;
}

/**
 * Helper to get current user's connected stores
 */
export async function getUserStores(userId: string) {
  const result = await sql`
    SELECT sc.id, sc.site_id, sc.instance_id, sc.user_id, sc.connected_at, sc.schema_name,
           COALESCE(sc.store_name, c.store_name) as store_name,
           c.store_domain
    FROM store_connections sc
    LEFT JOIN companies c ON c.site_id = sc.site_id
    WHERE sc.user_id = ${userId}
    ORDER BY sc.connected_at DESC
  `;
  return result.rows;
}

/**
 * Helper to link a store to user
 */
export async function linkStoreToUser(userId: string, siteId: string, instanceId?: string) {
  // Get user's business_id first
  const businessResult = await sql`
    SELECT business_id FROM business_users WHERE user_id = ${userId} LIMIT 1
  `;
  const businessId = businessResult.rows[0]?.business_id;

  if (!businessId) {
    console.error("linkStoreToUser: No business found for user", userId);
    return;
  }

  // First try to update existing record
  const updated = await sql`
    UPDATE store_connections
    SET business_id = ${businessId}, user_id = ${userId}, updated_at = NOW()
    WHERE (${siteId}::text IS NOT NULL AND site_id = ${siteId})
       OR (${instanceId}::text IS NOT NULL AND instance_id = ${instanceId})
    RETURNING id
  `;

  // If no record exists, create one
  if (updated.rows.length === 0) {
    // Ensure tenant tables exist
    let schemaName = await getSchemaForSite(siteId);
    if (!schemaName) {
      await createTenantTables(siteId);
      schemaName = await getSchemaForSite(siteId);
    }

    // Create store connection
    await sql`
      INSERT INTO store_connections (business_id, site_id, instance_id, user_id, schema_name, provider, role, connected_at)
      VALUES (${businessId}, ${siteId || null}, ${instanceId || null}, ${userId}, ${schemaName}, 'wix', 'owner', NOW())
      ON CONFLICT (site_id) WHERE site_id IS NOT NULL DO UPDATE SET business_id = ${businessId}, user_id = ${userId}, updated_at = NOW()
    `;
  }

  console.log("✅ linkStoreToUser completed:", { userId, siteId, businessId });
}

/**
 * Check if onboarding is complete for a store
 */
export async function isOnboardingComplete(siteId: string): Promise<boolean> {
  const company = await getTenantCompany(siteId);
  return company?.onboardingCompleted ?? false;
}

/**
 * Check if subscription is active for a store
 */
export async function isSubscriptionActiveForStore(siteId: string): Promise<boolean> {
  const company = await getTenantCompany(siteId);
  if (!company) return false;

  const status = company.subscriptionStatus;
  if (status === 'active') return true;
  if (status === 'trial' && company.trialEndsAt && company.trialEndsAt > new Date()) return true;

  return false;
}
