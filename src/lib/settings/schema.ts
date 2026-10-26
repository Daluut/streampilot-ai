import { z } from "zod";
import type { SessionSettings } from "@/lib/types";

export const SETTING_LIMITS = {
  bufferSize: { min: 100, max: 2000, default: 500 },
  analysisIntervalSec: { min: 15, max: 600, default: 45 },
} as const;

export const DEFAULT_SETTINGS: SessionSettings = {
  bufferSize: SETTING_LIMITS.bufferSize.default,
  analysisIntervalSec: SETTING_LIMITS.analysisIntervalSec.default,
  autoAnalysis: true,
  useAi: true,
};

/** Validates a partial settings update from the browser. Unknown keys are rejected. */
export const settingsPatchSchema = z
  .object({
    bufferSize: z.number().int().min(SETTING_LIMITS.bufferSize.min).max(SETTING_LIMITS.bufferSize.max).optional(),
    analysisIntervalSec: z
      .number()
      .int()
      .min(SETTING_LIMITS.analysisIntervalSec.min)
      .max(SETTING_LIMITS.analysisIntervalSec.max)
      .optional(),
    autoAnalysis: z.boolean().optional(),
    useAi: z.boolean().optional(),
  })
  .strict();

export type SettingsPatch = z.infer<typeof settingsPatchSchema>;
