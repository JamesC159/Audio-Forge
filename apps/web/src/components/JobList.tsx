import { useEffect } from "react";
import { useAudioState, useAudioActions, type AudioJob } from "../context/AudioContext.js";
import { useAsyncData } from "../hooks/useAsyncData.js";
import { Waveform } from "./Waveform.js";

const API = import.meta.env.VITE_API_URL ?? "http://localhost:3001";

// Deterministic fake waveform seeded from job ID — real app would use audio analysis
function seedBars(id: string): number[] {
  const seed = id.charCodeAt(0) + id.charCodeAt(id.length - 1);
  return Array.from({ length: 40 }, (_, i) =>
    Math.abs(Math.sin(seed * i * 0.37)) * 0.8 + 0.1
  );
}

interface JobCardProps {
  job: AudioJob;
}

function JobCard({ job }: JobCardProps) {
  const statusColor: Record<AudioJob["status"], string> = {
    queued: "#f59e0b",
    processing: "#3b82f6",
    completed: "#10b981",
    failed: "#ef4444",
  };

  return (
    <div style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: 16, marginBottom: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
        <span style={{ fontWeight: 600, maxWidth: "70%", overflow: "hidden", textOverflow: "ellipsis" }}>
          {job.prompt}
        </span>
        <span style={{ color: statusColor[job.status], fontWeight: 500, fontSize: 13 }}>
          ● {job.status}
        </span>
      </div>
      {job.status === "completed" && <Waveform bars={seedBars(job.id)} />}
      <div style={{ fontSize: 12, color: "#9ca3af", marginTop: 8 }}>
        {new Date(job.createdAt).toLocaleString()}
        {job.durationMs && ` · generated in ${(job.durationMs / 1000).toFixed(1)}s`}
      </div>
    </div>
  );
}

interface JobListProps {
  token: string;
}

export function JobList({ token }: JobListProps) {
  const { jobs } = useAudioState();
  const { setJobs, updateJob } = useAudioActions();

  // Fetch initial job list on mount — cancelled automatically on unmount
  const { state, refetch } = useAsyncData(
    async (signal) => {
      const res = await fetch(`${API}/audio/jobs`, {
        headers: { Authorization: `Bearer ${token}` },
        signal,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = await res.json() as { jobs: AudioJob[] };
      return body.jobs;
    },
    { deps: [token] }
  );

  useEffect(() => {
    if (state.status === "success") setJobs(state.data);
  }, [state, setJobs]);

  // Poll in-progress jobs every 3 s
  useEffect(() => {
    const inFlight = jobs.filter((j) => j.status === "queued" || j.status === "processing");
    if (inFlight.length === 0) return;

    const interval = setInterval(async () => {
      await Promise.allSettled(
        inFlight.map(async (job) => {
          const res = await fetch(`${API}/audio/jobs/${job.id}`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (!res.ok) return;
          const updated = await res.json() as AudioJob;
          if (updated.status !== job.status) updateJob(updated);
        })
      );
    }, 3000);

    return () => clearInterval(interval);
  }, [jobs, token, updateJob]);

  if (state.status === "loading") return <p>Loading jobs…</p>;
  if (state.status === "error") return (
    <p style={{ color: "red" }}>
      {state.error.message} — <button onClick={refetch}>retry</button>
    </p>
  );

  if (jobs.length === 0) return <p style={{ color: "#9ca3af" }}>No jobs yet. Generate some audio!</p>;

  return (
    <div>
      {jobs.map((job) => <JobCard key={job.id} job={job} />)}
    </div>
  );
}
