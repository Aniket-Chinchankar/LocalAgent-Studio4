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
    let token = "";
    if (authHeader && authHeader.startsWith("Bearer ")) {
      token = authHeader.replace("Bearer ", "");
    }

    const supabase = createMockSupabaseClient();
    let userId = "00000000-0000-0000-0000-000000000000";
    let email = "guest@agentflow.ai";
    let displayName = "Guest";

    if (token && token.startsWith("local-token:")) {
      try {
        const parts = token.split(":");
        userId = parts[1];
        email = parts[2];
        displayName = parts[3];
      } catch (err) {
        console.warn("[auth-middleware] Failed to parse local token, falling back to guest:", err);
      }
    } else if (token && token !== "mock-guest-token") {
      console.warn("[auth-middleware] Unrecognized or invalid token, falling back to guest.");
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
