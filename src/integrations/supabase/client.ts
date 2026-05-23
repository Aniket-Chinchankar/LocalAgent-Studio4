import { createMockSupabaseClient } from "@/lib/mock-supabase";

// Export the default singleton proxy
export const supabase = createMockSupabaseClient();

// Export createClient creator for server-side dynamically created instances
export function createClient(url: string, key: string, options?: any) {
  return createMockSupabaseClient();
}
