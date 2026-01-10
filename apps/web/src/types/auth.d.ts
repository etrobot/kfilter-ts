import "better-auth/react";

declare module "better-auth/react" {
  interface Session {
    user: {
      id: string;
      email: string;
      emailVerified: boolean;
      name: string;
      image?: string | null;
      createdAt: Date;
      updatedAt: Date;
      isAdmin: boolean;
    };
  }
}
