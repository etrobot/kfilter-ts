import { db } from "@kfilter-ts/db";
import * as schema from "@kfilter-ts/db/schema/auth";
import { env } from "@kfilter-ts/env/server";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { eq, count } from "drizzle-orm";

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "sqlite",
    schema: schema,
  }),
  trustedOrigins: [env.CORS_ORIGIN],
  emailAndPassword: {
    enabled: true,
  },
  advanced: {
    defaultCookieAttributes: {
      sameSite: "none",
      secure: true,
      httpOnly: true,
    },
  },
  user: {
    additionalFields: {
      isAdmin: {
        type: "boolean",
        defaultValue: false,
        input: false,
      },
    },
  },
  databaseHooks: {
    user: {
      create: {
        after: async (user) => {
          console.log(`[Auth Hook] 用户注册成功:`, {
            userId: user.id,
            email: user.email,
          });
          
          // 检查这是否是第一个用户
          const userCount = await db.select({ count: count() }).from(schema.user);
          const totalUsers = userCount[0]?.count ?? 0;
          console.log(`[Auth Hook] 当前用户总数: ${totalUsers}`);
          
          if (totalUsers === 1) {
            console.log(`[Auth Hook] 检测到第一个用户，设置为管理员...`);
            
            const result = await db
              .update(schema.user)
              .set({ isAdmin: true })
              .where(eq(schema.user.id, user.id))
              .returning();
            
            console.log(`[Auth Hook] 管理员设置成功:`, {
              userId: result[0]?.id,
              email: result[0]?.email,
              isAdmin: result[0]?.isAdmin,
            });
          } else {
            console.log(`[Auth Hook] 不是第一个用户，保持普通用户权限`);
          }
        },
      },
    },
  },
  plugins: [],
});
