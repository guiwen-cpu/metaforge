import { http } from "@/lib/http";
import type { LogicFlow } from "@/types/logicModel";
import type { UISchema } from "@/types/uiModel";

export type AiGenerateKind = "form" | "page" | "flow";
export type AiPageKind = "form" | "list" | "detail";

export interface AiGeneratePayload {
  kind: AiGenerateKind;
  prompt: string;
  entity_key?: string;
  page_kind?: AiPageKind;
  context?: {
    dataSchemas?: unknown[];
    entity?: unknown;
    [key: string]: unknown;
  };
}

export interface AiGenerateResult {
  provider: string;
  artifact: UISchema | LogicFlow;
  assets: unknown[];
  warnings: string[];
}

export const aiApi = {
  async generate(payload: AiGeneratePayload): Promise<AiGenerateResult> {
    const { data } = await http.post<AiGenerateResult>("/platform/ai/generate", payload, {
      timeout: 60000
    });
    return {
      provider: data.provider ?? "unknown",
      artifact: data.artifact,
      assets: Array.isArray(data.assets) ? data.assets : [],
      warnings: Array.isArray(data.warnings) ? data.warnings : []
    };
  }
};
