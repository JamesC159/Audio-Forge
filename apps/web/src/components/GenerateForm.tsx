import { useState, type FormEvent } from "react";
import { useAudioActions, useAudioState } from "../context/AudioContext.js";
import type { AudioJob } from "../context/AudioContext.js";

const API = import.meta.env.VITE_API_URL ?? "http://localhost:3001";

interface GenerateFormProps {
  token: string;
}

export function GenerateForm({ token }: GenerateFormProps) {
  const [prompt, setPrompt] = useState("");
  const [error, setError] = useState<string | null>(null);
  const { isGenerating } = useAudioState();
  const { addJob, setGenerating } = useAudioActions();

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!prompt.trim()) return;

    setGenerating(true);
    setError(null);

    try {
      const res = await fetch(`${API}/audio/generate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ prompt: prompt.trim(), durationSec: 30 }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`);
      }

      const job = (await res.json()) as AudioJob;
      addJob({ ...job, prompt: prompt.trim(), createdAt: new Date().toISOString() });
      setPrompt("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Generation failed");
    } finally {
      setGenerating(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: "flex", gap: 8 }}>
      <input
        type="text"
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        placeholder="Describe the audio you want…"
        disabled={isGenerating}
        style={{ flex: 1, padding: "8px 12px", borderRadius: 6, border: "1px solid #ccc" }}
      />
      <button
        type="submit"
        disabled={isGenerating || !prompt.trim()}
        style={{
          padding: "8px 18px",
          background: "#6366f1",
          color: "#fff",
          border: "none",
          borderRadius: 6,
          cursor: isGenerating ? "not-allowed" : "pointer",
        }}
      >
        {isGenerating ? "Generating…" : "Generate"}
      </button>
      {error && <p style={{ color: "red", margin: 0 }}>{error}</p>}
    </form>
  );
}
