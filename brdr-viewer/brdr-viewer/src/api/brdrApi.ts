import requestBody from "../data/request_body.json";
import type { BrdrRequestBody, BrdrResponse } from "../types/brdr";

const API_BASE_URL = import.meta.env.VITE_BRDR_API_BASE_URL ?? "http://127.0.0.1:80";

export function getDefaultRequestBody(): BrdrRequestBody {
  return requestBody as BrdrRequestBody;
}

function getFeatureId(payload: BrdrRequestBody): string | null {
  const firstFeature = payload.featurecollection.features[0];
  if (!firstFeature?.id) {
    return null;
  }
  return String(firstFeature.id);
}

function formatErrorDetail(detail: unknown): string {
  if (typeof detail === "string") {
    return detail;
  }
  if (typeof detail === "number" || typeof detail === "boolean") {
    return String(detail);
  }
  if (Array.isArray(detail)) {
    return detail.map((item) => formatErrorDetail(item)).join(" | ");
  }
  if (detail && typeof detail === "object") {
    const record = detail as Record<string, unknown>;
    if (typeof record.msg === "string") {
      return record.msg;
    }
    if (typeof record.detail === "string") {
      return record.detail;
    }
    try {
      return JSON.stringify(record);
    } catch {
      return "Onbekende fout.";
    }
  }
  return "Onbekende fout.";
}

function cloneWithGrbType(
  payload: BrdrRequestBody,
  grbType: string
): BrdrRequestBody {
  const next = structuredClone(payload);
  next.params.grb_type = grbType;
  return next;
}

async function postViewerRequest(
  payload: BrdrRequestBody
): Promise<Response> {
  const featureId = getFeatureId(payload);
  const query = featureId ? `?feature_id=${encodeURIComponent(featureId)}` : "";
  const url = `${API_BASE_URL}/actualiser/viewer${query}`;

  return fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(payload),
  });
}

export async function fetchBrdrResponse(
  payload: BrdrRequestBody
): Promise<BrdrResponse> {
  let response = await postViewerRequest(payload);

  // Compatibiliteit: sommige backend-versies verwachten legacy GRB labels,
  // andere de nieuwe labels. Bij 422 proberen we automatisch de andere variant.
  if (response.status === 422) {
    let detailText = "";
    try {
      const errorBody = await response.clone().json();
      detailText = formatErrorDetail(errorBody?.detail ?? errorBody);
    } catch {
      detailText = "";
    }

    const expectsLegacy = detailText.includes("GRB - ADP - administratief perceel");
    const expectsNew = detailText.includes("Administratieve percelen");

    if (expectsLegacy && payload.params.grb_type === "Administratieve percelen") {
      response = await postViewerRequest(
        cloneWithGrbType(payload, "GRB - ADP - administratief perceel")
      );
    } else if (
      expectsNew &&
      payload.params.grb_type === "GRB - ADP - administratief perceel"
    ) {
      response = await postViewerRequest(
        cloneWithGrbType(payload, "Administratieve percelen")
      );
    }
  }

  if (!response.ok) {
    let detail = `${response.status} ${response.statusText}`;
    try {
      const errorBody = await response.json();
      if (errorBody?.detail !== undefined) {
        detail = formatErrorDetail(errorBody.detail);
      } else {
        detail = formatErrorDetail(errorBody);
      }
    } catch {
      // Keep default message when response body is not JSON.
    }
    throw new Error(`Failed to fetch BRDR response: ${detail}`);
  }

  const responseData = (await response.json()) as BrdrResponse;
  return responseData;
}
