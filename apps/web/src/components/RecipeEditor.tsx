import { useRef, useState } from "react";
import {
  ArrowLeft,
  Check,
  ChevronDown,
  ChevronUp,
  Plus,
  X,
} from "lucide-react";
import type { Recipe, Ingredient, AisleCategory } from "@hovi/shared";
import { CATEGORIES } from "../lib/categories.js";
import { Field } from "./Field.js";
import { SectionHead } from "./SectionHead.js";
import { formatImportSource } from "../lib/modelLabels.js";
import { AmountInput } from "./AmountInput.js";
import { recipeImageUrl, uploadRecipeImage } from "../lib/api.js";
import {
  ImageTooLargeError,
  preprocessImage,
} from "../lib/imagePreprocess.js";

export type RecipeEditorDraft = Omit<Recipe, "id"> & { id?: string };

export function RecipeEditor({
  initial,
  onSave,
  onCancel,
  warnings,
  importSource,
}: {
  initial: RecipeEditorDraft;
  onSave: (r: RecipeEditorDraft) => void;
  onCancel: () => void;
  warnings?: string[];
  importSource?: {
    provider: string;
    model: string;
    confidence: number;
    fallback?: { provider: string; model: string; confidence: number };
  };
}): JSX.Element {
  const [importSourceDismissed, setImportSourceDismissed] = useState(false);
  const [r, setR] = useState<RecipeEditorDraft>({
    ...initial,
    ingredients: initial.ingredients ?? [],
    instructions: initial.instructions ?? [],
  });
  const [imageUploading, setImageUploading] = useState(false);
  const [imageError, setImageError] = useState<string | null>(null);
  const imageInputRef = useRef<HTMLInputElement | null>(null);

  const handleImageFile = async (file: File): Promise<void> => {
    setImageError(null);
    setImageUploading(true);
    try {
      const { blob } = await preprocessImage(file);
      const { imageId } = await uploadRecipeImage(blob);
      setR((rr) => ({ ...rr, imageId }));
    } catch (err) {
      setImageError(
        err instanceof ImageTooLargeError
          ? "Kuva on liian iso"
          : "Kuvan lataus epäonnistui",
      );
    } finally {
      setImageUploading(false);
      if (imageInputRef.current !== null) imageInputRef.current.value = "";
    }
  };

  const removeImage = (): void => {
    setR((rr) => {
      const { imageId: _drop, ...rest } = rr;
      return rest;
    });
    setImageError(null);
  };

  const updateIng = (idx: number, patch: Partial<Ingredient>): void => {
    setR((rr) => ({
      ...rr,
      ingredients: rr.ingredients.map((ing, i) =>
        i === idx ? { ...ing, ...patch } : ing,
      ),
    }));
  };
  const addIng = (): void =>
    setR((rr) => ({
      ...rr,
      ingredients: [
        ...rr.ingredients,
        { name: "", amount: null, unit: "", category: "pantry" },
      ],
    }));
  const removeIng = (idx: number): void =>
    setR((rr) => ({
      ...rr,
      ingredients: rr.ingredients.filter((_, i) => i !== idx),
    }));

  const updateStep = (idx: number, value: string): void =>
    setR((rr) => ({
      ...rr,
      instructions: (rr.instructions ?? []).map((s, i) =>
        i === idx ? value : s,
      ),
    }));
  const addStep = (): void =>
    setR((rr) => ({
      ...rr,
      instructions: [...(rr.instructions ?? []), ""],
    }));
  const removeStep = (idx: number): void =>
    setR((rr) => ({
      ...rr,
      instructions: (rr.instructions ?? []).filter((_, i) => i !== idx),
    }));
  const moveStep = (idx: number, dir: -1 | 1): void =>
    setR((rr) => {
      const list = [...(rr.instructions ?? [])];
      const target = idx + dir;
      if (target < 0 || target >= list.length) return rr;
      [list[idx], list[target]] = [list[target], list[idx]];
      return { ...rr, instructions: list };
    });

  const save = (): void => {
    const cleaned: RecipeEditorDraft = {
      ...r,
      instructions: (r.instructions ?? [])
        .map((s) => s.trim())
        .filter((s) => s.length > 0),
    };
    onSave(cleaned);
  };

  const canSave = r.name.trim().length > 0;
  const steps = r.instructions ?? [];

  return (
    <div className="fixed inset-0 z-50 flex flex-col" style={{ background: "var(--paper)" }}>
      <header
        className="px-5 py-4 flex items-center justify-between border-b"
        style={{ borderColor: "var(--rule)" }}
      >
        <button
          onClick={onCancel}
          className="flex items-center gap-1 text-sm"
          style={{ color: "var(--ink)" }}
        >
          <ArrowLeft size={16} /> Takaisin
        </button>
        <p className="font-display text-lg">{initial.id ? "Muokkaa" : "Uusi resepti"}</p>
        <button
          onClick={() => canSave && save()}
          disabled={!canSave}
          className="text-sm px-3 py-1.5 rounded-full"
          style={{
            background: canSave ? "var(--ink)" : "var(--rule)",
            color: "var(--paper)",
          }}
        >
          Tallenna
        </button>
      </header>
      <div className="flex-1 overflow-y-auto px-5 py-5 space-y-5 pb-24">
        {warnings && warnings.length > 0 && (
          <div
            className="rounded-lg border-l-4 px-3 py-2 text-xs"
            style={{
              borderColor: "var(--berry)",
              background: "var(--paper-2)",
              color: "var(--ink)",
            }}
          >
            <p
              className="uppercase tracking-widest mb-1"
              style={{
                color: "var(--berry)",
                letterSpacing: "0.15em",
                fontSize: "10px",
              }}
            >
              AI-tuonnin huomiot
            </p>
            <ul className="list-disc pl-4 space-y-0.5">
              {warnings.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          </div>
        )}
        <Field label="Nimi">
          <input
            className="w-full px-3 py-2.5 rounded-lg border bg-transparent"
            style={{ borderColor: "var(--rule)" }}
            value={r.name}
            onChange={(e) => setR({ ...r, name: e.target.value })}
            placeholder="Esim. Kasviscurry"
          />
        </Field>
        <div>
          <SectionHead>Kansikuva</SectionHead>
          <div className="mt-2">
            {r.imageId ? (
              <div className="space-y-2">
                <div
                  className="rounded-xl border overflow-hidden aspect-[3/2]"
                  style={{
                    borderColor: "var(--rule)",
                    background: "var(--paper-2)",
                  }}
                >
                  <img
                    src={recipeImageUrl(r.imageId)}
                    alt="Kansikuva"
                    className="w-full h-full object-cover"
                  />
                </div>
                <button
                  onClick={removeImage}
                  className="text-xs"
                  style={{ color: "var(--berry)" }}
                >
                  Poista kuva
                </button>
              </div>
            ) : (
              <button
                onClick={() => imageInputRef.current?.click()}
                disabled={imageUploading}
                className="w-full rounded-xl border border-dashed py-6 text-sm"
                style={{
                  borderColor: "var(--rule)",
                  color: "var(--muted)",
                  background: "var(--paper-2)",
                }}
              >
                {imageUploading ? "Ladataan…" : "Lisää kansikuva"}
              </button>
            )}
            {imageError !== null && (
              <p className="text-xs mt-1.5" style={{ color: "var(--berry)" }}>
                {imageError}
              </p>
            )}
            <input
              ref={imageInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              disabled={imageUploading}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file !== undefined) void handleImageFile(file);
              }}
            />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Aika (min)">
            <input
              type="number"
              className="w-full px-3 py-2.5 rounded-lg border bg-transparent"
              style={{ borderColor: "var(--rule)" }}
              value={r.time}
              onChange={(e) =>
                setR({ ...r, time: parseInt(e.target.value) || 0 })
              }
            />
          </Field>
          <Field label="Annoksia">
            <input
              type="number"
              className="w-full px-3 py-2.5 rounded-lg border bg-transparent"
              style={{ borderColor: "var(--rule)" }}
              value={r.servings}
              onChange={(e) =>
                setR({ ...r, servings: parseInt(e.target.value) || 0 })
              }
            />
          </Field>
        </div>
        <Field label="Kategoria">
          <select
            className="w-full px-3 py-2.5 rounded-lg border bg-transparent"
            style={{ borderColor: "var(--rule)" }}
            value={r.category}
            onChange={(e) =>
              setR({ ...r, category: e.target.value as Recipe["category"] })
            }
          >
            <option value="common">Arki</option>
            <option value="special">Erikois</option>
          </select>
        </Field>
        <label className="flex items-center gap-3">
          <button
            onClick={() => setR({ ...r, keepsOvernight: !r.keepsOvernight })}
            className="w-5 h-5 rounded border flex items-center justify-center"
            style={{
              borderColor: "var(--ink)",
              background: r.keepsOvernight ? "var(--ink)" : "transparent",
            }}
            aria-label="Kestää yön yli"
          >
            {r.keepsOvernight && <Check size={13} style={{ color: "var(--paper)" }} />}
          </button>
          <span className="text-sm">Kestää yön yli (sopii lounaaksi)</span>
        </label>
        <div>
          <div className="flex items-center justify-between mb-2">
            <SectionHead>Ainekset</SectionHead>
            <button
              onClick={addIng}
              className="text-xs px-3 py-1.5 rounded-full"
              style={{ background: "var(--ink)", color: "var(--paper)" }}
            >
              <Plus size={12} className="inline -mt-0.5" /> Aines
            </button>
          </div>
          <div className="space-y-2">
            {r.ingredients.map((ing, i) => (
              <div
                key={i}
                className="rounded-lg border p-2 space-y-2"
                style={{ borderColor: "var(--rule)" }}
              >
                <input
                  className="w-full px-2 py-1.5 rounded border bg-transparent text-sm"
                  style={{ borderColor: "var(--rule)" }}
                  placeholder="Aineksen nimi"
                  value={ing.name}
                  onChange={(e) => updateIng(i, { name: e.target.value })}
                />
                <div className="flex items-center gap-1.5">
                  <AmountInput
                    value={ing.amount}
                    onChange={(next) => updateIng(i, { amount: next })}
                    className="flex-1 min-w-0 px-2 py-1.5 rounded border bg-transparent text-sm"
                  />
                  <input
                    className="w-16 shrink-0 px-2 py-1.5 rounded border bg-transparent text-sm"
                    style={{ borderColor: "var(--rule)" }}
                    placeholder="Yks."
                    value={ing.unit}
                    onChange={(e) => updateIng(i, { unit: e.target.value })}
                  />
                  <button
                    onClick={() => removeIng(i)}
                    className="p-1.5 shrink-0"
                    style={{ color: "var(--berry)" }}
                    aria-label="Poista aines"
                  >
                    <X size={14} />
                  </button>
                </div>
                <select
                  className="w-full min-w-0 px-2 py-1.5 rounded border bg-transparent text-xs"
                  style={{ borderColor: "var(--rule)" }}
                  value={ing.category}
                  onChange={(e) =>
                    updateIng(i, { category: e.target.value as AisleCategory })
                  }
                >
                  {CATEGORIES.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </div>
            ))}
            {r.ingredients.length === 0 && (
              <p className="text-xs text-center py-4" style={{ color: "var(--muted)" }}>
                Ei vielä aineksia.
              </p>
            )}
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <SectionHead>Ohjeet</SectionHead>
            <button
              onClick={addStep}
              className="text-xs px-3 py-1.5 rounded-full"
              style={{ background: "var(--ink)", color: "var(--paper)" }}
            >
              <Plus size={12} className="inline -mt-0.5" /> Lisää vaihe
            </button>
          </div>
          <div className="space-y-2">
            {steps.map((step, i) => (
              <div key={i} className="flex items-center gap-1.5">
                <span
                  className="font-mono text-xs w-6 text-right shrink-0"
                  style={{ color: "var(--muted)" }}
                >
                  {i + 1}.
                </span>
                <input
                  className="flex-1 min-w-0 px-2 py-1.5 rounded border bg-transparent text-sm"
                  style={{ borderColor: "var(--rule)" }}
                  placeholder={`Vaihe ${i + 1}`}
                  value={step}
                  maxLength={1000}
                  onChange={(e) => updateStep(i, e.target.value)}
                />
                <button
                  onClick={() => moveStep(i, -1)}
                  disabled={i === 0}
                  className="p-1.5 disabled:opacity-30"
                  style={{ color: "var(--muted)" }}
                  aria-label="Siirrä ylös"
                >
                  <ChevronUp size={16} />
                </button>
                <button
                  onClick={() => moveStep(i, 1)}
                  disabled={i === steps.length - 1}
                  className="p-1.5 disabled:opacity-30"
                  style={{ color: "var(--muted)" }}
                  aria-label="Siirrä alas"
                >
                  <ChevronDown size={16} />
                </button>
                <button
                  onClick={() => removeStep(i)}
                  className="p-1.5"
                  style={{ color: "var(--muted)" }}
                  aria-label="Poista vaihe"
                >
                  <X size={14} />
                </button>
              </div>
            ))}
            {steps.length === 0 && (
              <p className="text-xs text-center py-4" style={{ color: "var(--muted)" }}>
                Ei vielä ohjeita.
              </p>
            )}
          </div>
        </div>
      </div>
      {importSource !== undefined && !importSourceDismissed && (
        <div
          className="px-5 py-2 flex items-center justify-between gap-3 border-t border-dashed"
          style={{
            borderColor: "var(--rule)",
            background: "var(--paper-2)",
            color: "var(--muted)",
          }}
        >
          <p className="text-xs truncate">
            {formatImportSource(importSource.provider, importSource.model, importSource.confidence, importSource.fallback)}
          </p>
          <button
            onClick={() => setImportSourceDismissed(true)}
            aria-label="Sulje"
            className="p-1 shrink-0"
            style={{ color: "var(--muted)" }}
          >
            <X size={14} />
          </button>
        </div>
      )}
    </div>
  );
}

