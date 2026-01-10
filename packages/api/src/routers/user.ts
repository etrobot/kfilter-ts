import { z } from "zod";
import { eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";

import { db } from "@kfilter-ts/db";
import { user } from "@kfilter-ts/db/schema/auth";
import { adminProcedure, router } from "../index";

export const userRouter = router({
  // 获取所有用户列表
  getAll: adminProcedure.query(async () => {
    const users = await db.select({
      id: user.id,
      name: user.name,
      email: user.email,
      emailVerified: user.emailVerified,
      image: user.image,
      isAdmin: user.isAdmin,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    }).from(user);
    
    return users;
  }),

  // 创建新用户
  create: adminProcedure
    .input(z.object({
      name: z.string().min(1, "Name is required"),
      email: z.string().email("Invalid email format"),
      isAdmin: z.boolean().default(false),
    }))
    .mutation(async ({ input }) => {
      try {
        const newUser = await db.insert(user).values({
          id: crypto.randomUUID(),
          name: input.name,
          email: input.email,
          isAdmin: input.isAdmin,
          emailVerified: false,
        }).returning();

        return newUser[0];
      } catch (error) {
        if (error instanceof Error && error.message.includes("UNIQUE constraint failed")) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "Email already exists",
          });
        }
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to create user",
        });
      }
    }),

  // 更新用户
  update: adminProcedure
    .input(z.object({
      id: z.string(),
      name: z.string().min(1, "Name is required").optional(),
      email: z.string().email("Invalid email format").optional(),
      isAdmin: z.boolean().optional(),
      emailVerified: z.boolean().optional(),
    }))
    .mutation(async ({ input }) => {
      const { id, ...updateData } = input;
      
      try {
        const updatedUser = await db
          .update(user)
          .set(updateData)
          .where(eq(user.id, id))
          .returning();

        if (updatedUser.length === 0) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "User not found",
          });
        }

        return updatedUser[0];
      } catch (error) {
        if (error instanceof TRPCError) {
          throw error;
        }
        if (error instanceof Error && error.message.includes("UNIQUE constraint failed")) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "Email already exists",
          });
        }
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to update user",
        });
      }
    }),

  // 删除用户
  delete: adminProcedure
    .input(z.object({
      id: z.string(),
    }))
    .mutation(async ({ input, ctx }) => {
      // 防止删除自己
      if (input.id === ctx.session.user.id) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Cannot delete your own account",
        });
      }

      const deletedUser = await db
        .delete(user)
        .where(eq(user.id, input.id))
        .returning();

      if (deletedUser.length === 0) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "User not found",
        });
      }

      return { success: true, deletedUser: deletedUser[0] };
    }),
});