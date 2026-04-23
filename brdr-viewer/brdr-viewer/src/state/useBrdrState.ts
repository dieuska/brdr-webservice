import { useEffect, useState } from "react";
import { loadBrdrResponse } from "../data/brdrResponse";
import { getDefaultRequestBody } from "../api/brdrApi";
import {
  type BrdrAlignmentParams,
  type UseBrdrStateOptions,
  assertSupportedCrs,
} from "../components/alignment/contracts";
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

export function useBrdrState(options: UseBrdrStateOptions) {
  const [requestBody, setRequestBody] = useState<BrdrRequestBody>(() => {
    assertSupportedCrs(options.crs);
    const next = structuredClone(getDefaultRequestBody());
    const nextParams = next.params as BrdrAlignmentParams;
    nextParams.crs = options.crs;

    if (options.initialGeometry) {
      if (next.featurecollection.features.length === 0) {
        next.featurecollection.features.push({
          type: "Feature",
          id: "1",
          properties: {},
          geometry: options.initialGeometry,
        });
      } else {
        next.featurecollection.features[0].geometry = options.initialGeometry;
      }
    }

    return next;
  });
  const [response, setResponse] = useState<BrdrResponse | null>(null);
  const [steps, setSteps] = useState<string[]>([]);
  const [values, setValues] = useState<number[]>([]);
  const [predictionScoreByStep, setPredictionScoreByStep] = useState<Record<string, number>>({});
  const [predictionByStep, setPredictionByStep] = useState<Record<string, boolean>>({});
  const [diffMetric, setDiffMetric] = useState<"area" | "length" | "count">("area");
  const [stepIndex, setStepIndex] = useState(0);
  const [stepKey, setStepKey] = useState<string>("");
  const [currentStep, setCurrentStep] = useState<BrdrStep | null>(null);
  const [inputGeometryBeforeApply, setInputGeometryBeforeApply] =
    useState<Geometry | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  function withUpdatedInputGeometry(
    body: BrdrRequestBody,
    geometry: Geometry
  ): BrdrRequestBody {
    const next = structuredClone(body);
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
  }

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
    setDiffMetric(nextResponse.diff_metric ?? "area");
    setPredictionByStep(nextResponse.predictions ?? {});
    setPredictionScoreByStep(nextResponse.prediction_scores ?? {});

    let bestIndex = 0;
    let bestScore = -Infinity;
    orderedSteps.forEach((step, index) => {
      const score = nextResponse.prediction_scores?.[step] ?? 0;
      if (score > bestScore) {
        bestScore = score;
        bestIndex = index;
      }
    });

    setStepIndex(bestIndex);
    setStepKey(orderedSteps[bestIndex]);
    setCurrentStep(nextResponse.series[orderedSteps[bestIndex]]);
  }

  async function runCalculation(nextRequestBody: BrdrRequestBody) {
    setLoading(true);
    setError(null);
    try {
      const nextResponse = await loadBrdrResponse(nextRequestBody);
      setRequestBody(nextRequestBody);
      setInputGeometryBeforeApply(null);
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
    setRequestBody((prev) => withUpdatedInputGeometry(prev, geometry));
  }

  function updateRequestParam(
    key:
      | "crs"
      | "grb_type"
      | "full_reference_strategy"
      | "od_strategy"
      | "snap_strategy"
      | "max_relevant_distance"
      | "processor",
    value: string | number
  ) {
    setRequestBody((prev) => {
      const next = structuredClone(prev);
      if (!next.params) {
        next.params = {
          crs: options.crs,
          grb_type: "GRB - ADP - administratief perceel",
          full_reference_strategy: "prefer_full_reference",
          od_strategy: "SNAP_ALL_SIDE",
          snap_strategy: "PREFER_VERTICES",
          max_relevant_distance: 6.0,
          processor: "AlignerGeometryProcessor",
        };
      }
      if (key === "max_relevant_distance") {
        next.params.max_relevant_distance = Number(value);
      } else {
        next.params[key] = String(value);
      }
      return next;
    });
  }

  async function calculateForCurrentGeometry() {
    await runCalculation(requestBody);
  }

  async function calculateForInputGeometry(geometry: Geometry) {
    const nextRequestBody = withUpdatedInputGeometry(requestBody, geometry);
    await runCalculation(nextRequestBody);
  }

  function applyCurrentStepToInputGeometry() {
    if (!currentStep) {
      return;
    }

    if (!inputGeometryBeforeApply) {
      const currentInputGeometry =
        requestBody.featurecollection.features[0]?.geometry ?? null;
      if (currentInputGeometry) {
        setInputGeometryBeforeApply(structuredClone(currentInputGeometry));
      }
    }

    updateInputGeometry(structuredClone(currentStep.result));
  }

  function resetAppliedInputGeometry() {
    if (!inputGeometryBeforeApply) {
      return;
    }

    updateInputGeometry(structuredClone(inputGeometryBeforeApply));
    setInputGeometryBeforeApply(null);
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
    predictionByStep,
    diffMetric,
    currentStepPredictionScore: predictionScoreByStep[stepKey] ?? 0,
    currentStepIsPrediction: predictionByStep[stepKey] ?? false,
    loading,
    error,
    requestParams: requestBody.params,
    updateRequestParam,
    inputGeometry: requestBody.featurecollection.features[0]?.geometry ?? null,
    updateInputGeometry,
    calculateForCurrentGeometry,
    calculateForInputGeometry,
    applyCurrentStepToInputGeometry,
    resetAppliedInputGeometry,
    hasAppliedInputGeometry: inputGeometryBeforeApply !== null,
    setStepIndex: setIndex,
  };
}
