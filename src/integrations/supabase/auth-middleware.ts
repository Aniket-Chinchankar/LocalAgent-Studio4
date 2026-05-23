import { createMiddleware } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { createMockSupabaseClient } from "@/lib/mock-supabase";

export const requireSupabaseAuth = createMiddleware({ type: "function" }).server(
  async ({ next }) => {
    const request = getRequest();

    if (!request?.headers) {
      throw new Error("Unauthorized: No request headers available");
    }

    const authHeader = request.headers.get("authorization");

    if (!authHeader) {
      throw new Error("Unauthorized: No authorization header provided");
    }

    if (!authHeader.startsWith("Bearer ")) {
      throw new Error("Unauthorized: Only Bearer tokens are supported");
    }

    const token = authHeader.replace("Bearer ", "");
    if (!token) {
      throw new Error("Unauthorized: No token provided");
    }

    const supabase = createMockSupabaseClient();
    let userId = "";
    let email = "";
    let displayName = "";

    if (token === "mock-guest-token") {
      userId = "00000000-0000-0000-0000-000000000000";
      email = "guest@agentflow.ai";
      displayName = "Guest";
    } else if (token.startsWith("local-token:")) {
      const parts = token.split(":");
      userId = parts[1];
      email = parts[2];
      displayName = parts[3];
    } else {
      throw new Error("Unauthorized: Invalid token");
    }

    const mockClaims = {
      sub: userId,
      email: email,
      app_metadata: { provider: "email" },
      user_metadata: { display_name: displayName },
      identities: [],
    };

    return next({
      context: {
        supabase,
        userId,
        claims: mockClaims as any,
      },
    });
  },
);
