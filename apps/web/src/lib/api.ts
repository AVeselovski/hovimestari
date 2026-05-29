import type {
  RecipeImportResponse,
  State,
  SupportedImageMediaType,
} from "@hovi/shared";

export const API_BASE = import.meta.env.VITE_API_BASE ?? "/api";

export type StateResponse = { state: State; updatedAt: string };

export async function getState(): Promise<StateResponse> {
  const res = await fetch(`${API_BASE}/state`);
  if (!res.ok) throw new Error(`GET /state failed: ${res.status}`);
  return (await res.json()) as StateResponse;
}

export type PutResult =
  | { ok: true; updatedAt: string }
  | { ok: false; conflict: true; state: State; updatedAt: string }
  | { ok: false; conflict: false; error: string };

export async function putState(
  state: State,
  updatedAt: string,
): Promise<PutResult> {
  const res = await fetch(`${API_BASE}/state`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ state, updatedAt }),
  });
  if (res.ok) {
    const body = (await res.json()) as { updatedAt: string };
    return { ok: true, updatedAt: body.updatedAt };
  }
  if (res.status === 409) {
    const body = (await res.json()) as { state: State; updatedAt: string };
    return { ok: false, conflict: true, state: body.state, updatedAt: body.updatedAt };
  }
  return { ok: false, conflict: false, error: `HTTP ${res.status}` };
}

export class RecipeImportError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
    this.name = "RecipeImportError";
  }
}

export async function importRecipeFromText(
  text: string,
): Promise<RecipeImportResponse> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}/recipes/from-text`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text }),
    });
  } catch (err) {
    throw new RecipeImportError(0, (err as Error).message);
  }
  if (!res.ok) {
    let detail = "";
    try {
      detail = JSON.stringify(await res.json());
    } catch {
      detail = res.statusText;
    }
    throw new RecipeImportError(res.status, detail);
  }
  return (await res.json()) as RecipeImportResponse;
}

export async function importRecipeFromImage(
  blob: Blob,
  mediaType: SupportedImageMediaType,
): Promise<RecipeImportResponse> {
  const data = await blobToBase64(blob);
  let res: Response;
  try {
    res = await fetch(`${API_BASE}/recipes/from-image`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ image: { data, mediaType } }),
    });
  } catch (err) {
    throw new RecipeImportError(0, (err as Error).message);
  }
  if (!res.ok) {
    let detail = "";
    try {
      detail = JSON.stringify(await res.json());
    } catch {
      detail = res.statusText;
    }
    throw new RecipeImportError(res.status, detail);
  }
  return (await res.json()) as RecipeImportResponse;
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const r = reader.result;
      if (typeof r !== "string") {
        reject(new Error("FileReader returned non-string"));
        return;
      }
      const comma = r.indexOf(",");
      resolve(comma >= 0 ? r.slice(comma + 1) : r);
    };
    reader.onerror = () => reject(new Error("FileReader failed"));
    reader.readAsDataURL(blob);
  });
}
