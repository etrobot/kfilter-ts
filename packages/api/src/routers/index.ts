import { protectedProcedure, publicProcedure, router } from "../index";
import { stockRouter } from "./stock";
import { userRouter } from "./user";

export const appRouter = router({
  healthCheck: publicProcedure.query(() => {
    return "OK";
  }),
  privateData: protectedProcedure.query(({ ctx }) => {
    return {
      message: "This is private",
      user: ctx.session.user,
    };
  }),
  stock: stockRouter,
  user: userRouter,
});
export type AppRouter = typeof appRouter;
