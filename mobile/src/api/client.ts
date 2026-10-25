import { getBackendBaseUrl } from "../config/env";

export interface HealthResponse {
  status: string;
  service: string;
  version: string;
}

export interface AIStatusResponse {
  configured: boolean;
  model: string;
}

export interface AITestResponse {
  status: string;
  model: string;
  prompt: string;
  response: string;
}

export interface AIVisionResponse {
  status: string;
  model: string;
  prompt: string;
  description: string;
}

export interface ApiError {
  message: string;
  statusCode?: number;
}

const DEFAULT_TIMEOUT_MS = 6000;

async function fetchWithTimeout(
  url: string,
  options: RequestInit = {},
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
  externalSignal?: AbortSignal
): Promise<Response> {
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  if (externalSignal) {
    if (externalSignal.aborted) {
      clearTimeout(timer);
      const err = new Error("Request was cancelled by user.");
      err.name = "AbortError";
      throw err;
    }
    externalSignal.addEventListener("abort", () => {
      controller.abort();
    });
  }

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        ...(options.headers || {}),
      },
    });
    return response;
  } catch (error: any) {
    if (error.name === "AbortError") {
      if (timedOut) {
        throw new Error(
          `Connection timed out (${timeoutMs / 1000}s). Verify your phone and PC are on the same Wi-Fi network and firewall allows port 8000.`
        );
      }
      const cancelErr = new Error("Request cancelled.");
      cancelErr.name = "AbortError";
      throw cancelErr;
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Check backend health status (/api/v1/health).
 */
export async function checkBackendHealth(): Promise<HealthResponse> {
  const baseUrl = getBackendBaseUrl();
  const url = `${baseUrl}/api/v1/health`;

  try {
    const response = await fetchWithTimeout(url);
    if (!response.ok) {
      throw new Error(`Backend returned HTTP status ${response.status}`);
    }
    return (await response.json()) as HealthResponse;
  } catch (error: any) {
    throw new Error(
      error.message || "Failed to connect to SAARTHI backend server."
    );
  }
}

/**
 * Check whether Gemini AI is configured on the backend (/api/v1/ai/status).
 */
export async function checkAIStatus(): Promise<AIStatusResponse> {
  const baseUrl = getBackendBaseUrl();
  const url = `${baseUrl}/api/v1/ai/status`;

  try {
    const response = await fetchWithTimeout(url);
    if (!response.ok) {
      throw new Error(`AI status check failed with HTTP ${response.status}`);
    }
    return (await response.json()) as AIStatusResponse;
  } catch (error: any) {
    throw new Error(
      error.message || "Failed to query AI configuration status."
    );
  }
}

/**
 * Send a connectivity test prompt through the backend to Gemini (/api/v1/ai/test).
 */
export async function testAIConnectivity(
  prompt: string = "Say hello in 5 words or less."
): Promise<AITestResponse> {
  const baseUrl = getBackendBaseUrl();
  const url = `${baseUrl}/api/v1/ai/test`;

  try {
    const response = await fetchWithTimeout(
      url,
      {
        method: "POST",
        body: JSON.stringify({ prompt }),
      },
      12000 // Allow up to 12s for LLM upstream response
    );

    const data = await response.json();
    if (!response.ok) {
      const detail = data?.detail || `HTTP ${response.status}`;
      throw new Error(detail);
    }

    return data as AITestResponse;
  } catch (error: any) {
    throw new Error(error.message || "Failed to execute AI test request.");
  }
}

/**
 * Send a captured image to the backend for multimodal scene analysis (/api/v1/ai/vision).
 */
export async function analyzeSceneWithVision(
  imageBase64: string,
  prompt?: string,
  mimeType: string = "image/jpeg",
  signal?: AbortSignal
): Promise<AIVisionResponse> {
  const baseUrl = getBackendBaseUrl();
  const url = `${baseUrl}/api/v1/ai/vision`;

  const payload: {
    image_base64: string;
    prompt?: string;
    mime_type: string;
  } = {
    image_base64: imageBase64,
    mime_type: mimeType,
  };

  if (prompt && prompt.trim()) {
    payload.prompt = prompt.trim();
  }

  console.log(
    `[SAARTHI Vision Client] Sending request: b64_len=${imageBase64.length}, mimeType=${mimeType}, promptLen=${prompt?.length ?? 0}`
  );

  try {
    const response = await fetchWithTimeout(
      url,
      {
        method: "POST",
        body: JSON.stringify(payload),
      },
      30000, // Allow up to 30s for multimodal vision inference
      signal
    );

    const data = await response.json();
    if (!response.ok) {
      const detail = data?.detail || `HTTP ${response.status}`;
      throw new Error(detail);
    }

    const result = data as AIVisionResponse;
    console.log(
      `[SAARTHI Vision Client] Response OK: model=${result.model}, descLen=${result.description.length}`
    );

    return result;
  } catch (error: any) {
    if (error.name === "AbortError") {
      console.log("[SAARTHI Vision Client] Vision request aborted by user.");
      throw error;
    }
    throw new Error(error.message || "Failed to analyze image with Gemini Vision.");
  }
}
