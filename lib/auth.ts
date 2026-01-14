import type { NextAuthOptions } from "next-auth";
import type { Adapter, AdapterUser, AdapterAccount, AdapterSession, VerificationToken } from "next-auth/adapters";
import GoogleProvider from "next-auth/providers/google";
import CredentialsProvider from "next-auth/providers/credentials";
import { sql } from "@vercel/postgres";
import bcrypt from "bcryptjs";
import { getServerSession } from "next-auth";

// Custom adapter for our existing database schema
const customAdapter: Adapter = {
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
    return account as AdapterAccount;
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
    await sql`
      INSERT INTO verification_tokens (identifier, token, expires)
      VALUES (${token.identifier}, ${token.token}, ${token.expires.toISOString()})
    `;
    return token as VerificationToken;
  },

  async useVerificationToken({ identifier, token }: { identifier: string; token: string }) {
    const result = await sql`
      DELETE FROM verification_tokens
      WHERE identifier = ${identifier} AND token = ${token}
      RETURNING *
    `;
    if (result.rows.length === 0) return null;
    const row = result.rows[0];
    return {
      identifier: row.identifier,
      token: row.token,
      expires: new Date(row.expires),
    } as VerificationToken;
  },
};

export const authOptions: NextAuthOptions = {
  adapter: customAdapter,
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID || "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
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

        const result = await sql`
          SELECT * FROM users WHERE email = ${credentials.email as string}
        `;

        if (result.rows.length === 0) {
          return null;
        }

        const user = result.rows[0];

        // If user has no password (OAuth only), can't use credentials
        if (!user.password_hash || !user.password_salt) {
          return null;
        }

        const isValid = await bcrypt.compare(
          credentials.password as string,
          user.password_hash
        );

        if (!isValid) {
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
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
      }
      return token;
    },
    async session({ session, token }) {
      if (token && session.user) {
        session.user.id = token.id as string;
      }
      return session;
    },
  },
};

// Helper function to get session in server components
export async function auth() {
  return getServerSession(authOptions);
}

export type ActiveStore = {
  siteId: string | null;
  instanceId: string | null;
  storeName: string | null;
  userId: string | null;
};

/**
 * CRITICAL: This is the SINGLE source of truth for the current active store.
 * All code should use this function instead of directly accessing Wix cookies.
 *
 * Priority:
 * 1. NextAuth session -> user's connected stores (most reliable)
 * 2. Wix cookies (legacy fallback, should be phased out)
 *
 * @param requestedStoreId - Optional: select a specific store by ID (must be one of user's stores)
 * @returns The active store or null if no store is active.
 */
export async function getActiveStore(requestedStoreId?: string | null): Promise<ActiveStore | null> {
  // Priority 1: NextAuth session
  const session = await auth();
  if (session?.user?.id) {
    const stores = await getUserStores(session.user.id);
    if (stores.length === 0) {
      // User is logged in but has no stores connected
      return null;
    }

    // If a specific store is requested, validate it belongs to this user
    if (requestedStoreId) {
      const requestedStore = stores.find(
        (s: any) => s.site_id === requestedStoreId || s.instance_id === requestedStoreId
      );
      if (requestedStore) {
        return {
          siteId: requestedStore.site_id || null,
          instanceId: requestedStore.instance_id || null,
          storeName: requestedStore.store_name || null,
          userId: session.user.id,
        };
      }
    }

    // Default to first connected store
    const store = stores[0];
    return {
      siteId: store.site_id || null,
      instanceId: store.instance_id || null,
      storeName: store.store_name || null,
      userId: session.user.id,
    };
  }

  // Priority 2: Legacy Wix cookies (fallback)
  // Import dynamically to avoid circular dependencies
  const { getActiveWixToken } = await import("@/lib/wix-context");
  const token = await getActiveWixToken();
  if (token) {
    return {
      siteId: token.site_id || null,
      instanceId: token.instance_id || null,
      storeName: null,
      userId: null,
    };
  }

  return null;
}

// Helper to get current user's connected stores
export async function getUserStores(userId: string) {
  const result = await sql`
    SELECT sc.id, sc.site_id, sc.instance_id, sc.user_id, sc.connected_at,
           COALESCE(sc.store_name, c.store_name) as store_name,
           c.store_domain
    FROM store_connections sc
    LEFT JOIN companies c ON c.site_id = sc.site_id
    WHERE sc.user_id = ${userId}
    ORDER BY sc.connected_at DESC
  `;
  return result.rows;
}

// Helper to link a store to user
export async function linkStoreToUser(userId: string, siteId: string, instanceId?: string) {
  // First try to update existing record
  // Use explicit null checks because SQL NULL = NULL is false
  const updated = await sql`
    UPDATE store_connections
    SET user_id = ${userId}
    WHERE (${siteId}::text IS NOT NULL AND site_id = ${siteId})
       OR (${instanceId}::text IS NOT NULL AND instance_id = ${instanceId})
    RETURNING id
  `;

  // If no record exists, create one
  if (updated.rows.length === 0) {
    // Get user's business_id or create one
    const userBusiness = await sql`
      SELECT business_id FROM business_users WHERE user_id = ${userId} LIMIT 1
    `;
    let businessId = userBusiness.rows[0]?.business_id;

    if (!businessId) {
      // Create a new business for this user
      businessId = crypto.randomUUID();
      await sql`
        INSERT INTO businesses (id, name, created_at, updated_at)
        VALUES (${businessId}, 'Моята фирма', NOW(), NOW())
      `;
      await sql`
        INSERT INTO business_users (business_id, user_id, role, created_at)
        VALUES (${businessId}, ${userId}, 'owner', NOW())
      `;
    }

    // Create store connection
    await sql`
      INSERT INTO store_connections (business_id, site_id, instance_id, user_id, provider, connected_at)
      VALUES (${businessId}, ${siteId || null}, ${instanceId || null}, ${userId}, 'wix', NOW())
      ON CONFLICT DO NOTHING
    `;
  }
}
