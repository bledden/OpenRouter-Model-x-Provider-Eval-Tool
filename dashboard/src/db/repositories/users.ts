import { eq } from "drizzle-orm";
import { db, users, NewUser, User } from "../client";

/**
 * Create a new user
 */
export async function createUser(data: NewUser): Promise<User> {
  const [user] = await db.insert(users).values(data).returning();
  return user;
}

/**
 * Get user by ID
 */
export async function getUserById(id: string): Promise<User | null> {
  const [user] = await db.select().from(users).where(eq(users.id, id));
  return user || null;
}

/**
 * Get user by email
 */
export async function getUserByEmail(email: string): Promise<User | null> {
  const [user] = await db.select().from(users).where(eq(users.email, email));
  return user || null;
}

/**
 * Create or update user (upsert)
 */
export async function upsertUser(data: NewUser): Promise<User> {
  const existing = await getUserByEmail(data.email);

  if (existing) {
    const [updated] = await db
      .update(users)
      .set({
        name: data.name,
        image: data.image,
        updatedAt: new Date(),
      })
      .where(eq(users.id, existing.id))
      .returning();
    return updated;
  }

  return createUser(data);
}

/**
 * Update user role
 */
export async function updateUserRole(
  id: string,
  role: "user" | "admin"
): Promise<User | null> {
  const [user] = await db
    .update(users)
    .set({ role, updatedAt: new Date() })
    .where(eq(users.id, id))
    .returning();
  return user || null;
}

/**
 * Delete user
 */
export async function deleteUser(id: string): Promise<boolean> {
  const result = await db
    .delete(users)
    .where(eq(users.id, id))
    .returning({ id: users.id });
  return result.length > 0;
}

/**
 * Check if user is admin
 */
export async function isUserAdmin(id: string): Promise<boolean> {
  const user = await getUserById(id);
  return user?.role === "admin";
}
