import type { BrdrRequestBody, BrdrResponse } from "../types/brdr";
import { fetchBrdrResponse } from "../api/brdrApi";

export async function loadBrdrResponse(
  requestBody: BrdrRequestBody
): Promise<BrdrResponse> {
  return fetchBrdrResponse(requestBody);
}
