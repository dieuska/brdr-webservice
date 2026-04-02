import { useEffect, useState } from "react";
import { loadBrdrResponse } from "../data/brdrResponse";
import { getDefaultRequestBody } from "../api/brdrApi";
import type {
  BrdrRequestBody,
  BrdrResponse,
  BrdrStep,
  Geometry,
} from "../types/brdr";

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return "Onverwachte fout bij ophalen van BRDR-resultaat.";
}

export function useBrdrState() {
  const [requestBody, setRequestBody] = useState<BrdrRequestBody>(() =>
    structuredClone(getDefaultRequestBody())
  );
  const [response, setResponse] = useState<BrdrResponse | null>(null);
  const [steps, setSteps] = useState<string[]>([]);
  const [values, setValues] = useState<number[]>([]);
  const [stepIndex, setStepIndex] = useState(0);
  const [stepKey, setStepKey] = useState<string>("");
  const [currentStep, setCurrentStep] = useState<BrdrStep | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  function applyResponse(nextResponse: BrdrResponse) {
    const orderedSteps = Object.keys(nextResponse.series)
      .map(Number)
      .sort((a, b) => a - b)
      .map((v) => v.toFixed(1));

    if (orderedSteps.length === 0) {
      throw new Error("Geen BRDR-stappen ontvangen.");
    }

    setResponse(nextResponse);
    setSteps(orderedSteps);
    setValues(orderedSteps.map((k) => nextResponse.diffs[k] ?? 0));
    setStepIndex(0);
    setStepKey(orderedSteps[0]);
    setCurrentStep(nextResponse.series[orderedSteps[0]]);
  }

  async function runCalculation(nextRequestBody: BrdrRequestBody) {
    setLoading(true);
    setError(null);
    try {
      const nextResponse = await loadBrdrResponse(nextRequestBody);
      setRequestBody(nextRequestBody);
      applyResponse(nextResponse);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    runCalculation(requestBody);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function updateInputGeometry(geometry: Geometry) {
    setRequestBody((prev) => {
      const next = structuredClone(prev);
      if (next.featurecollection.features.length === 0) {
        next.featurecollection.features.push({
          type: "Feature",
          id: "1",
          properties: {},
          geometry,
        });
      } else {
        next.featurecollection.features[0].geometry = geometry;
      }
      return next;
    });
  }

  async function calculateForCurrentGeometry() {
    await runCalculation(requestBody);
  }

  function setIndex(i: number) {
    if (!response || !steps[i]) {
      return;
    }
    setStepIndex(i);
    setStepKey(steps[i]);
    setCurrentStep(response.series[steps[i]]);
  }

  return {
    steps,
    values,
    currentStep,
    stepKey,
    stepIndex,
    loading,
    error,
    inputGeometry: requestBody.featurecollection.features[0]?.geometry ?? null,
    updateInputGeometry,
    calculateForCurrentGeometry,
    setStepIndex: setIndex,
  };
}
