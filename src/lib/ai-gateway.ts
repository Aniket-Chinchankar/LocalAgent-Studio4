import { createOpenAICompatible } from "@ai-sdk/openai-compatible";

export const createLovableAiGatewayProvider = (lovableApiKey: string) =>
  createOpenAICompatible({
    name: "lovable",
    baseURL: "https://ai.gateway.lovable.dev/v1",
    headers: {
      "Lovable-API-Key": lovableApiKey,
      "X-Lovable-AIG-SDK": "vercel-ai-sdk",
    },
  });

export const createGeminiDirectProvider = (geminiApiKey: string) =>
  createOpenAICompatible({
    name: "google",
    baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/",
    headers: {
      Authorization: `Bearer ${geminiApiKey}`,
    },
  });

export const getAiProvider = (apiKey: string) => {
  if (apiKey && apiKey.startsWith("AIzaSy")) {
    return createGeminiDirectProvider(apiKey);
  }
  return createLovableAiGatewayProvider(apiKey);
};

export const mapModelName = (modelName: string, apiKey: string): string => {
  if (apiKey && apiKey.startsWith("AIzaSy")) {
    if (modelName.includes("gemini-3-flash")) {
      return "gemini-2.5-flash";
    }
    if (modelName.includes("gemini-2.5-pro")) {
      return "gemini-2.5-pro";
    }
    if (modelName.startsWith("google/")) {
      return modelName.substring(7);
    }
  }
  return modelName;
};

export const DEFAULT_MODEL = "google/gemini-3-flash-preview";
