import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent } from "@zorviz/ui";
import { ArrowLeft } from "lucide-react";
import { listJobs, type JobSummary } from "../lib/orders-api";
import { StatusBadge } from "../components/status-badge";

function jobLabel(job: JobSummary): string {
    const s = (job.asset?.specs ?? {}) as Record<string, string>;
    return s.plateNumber || s.serialNumber || s.imei || [s.make, s.model].filter(Boolean).join(" ") || "Asset";
}

function elapsed(ms: number): string {
    const mins = Math.floor((Date.now() - ms) / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const h = Math.floor(mins / 60);
    if (h < 24) return `${h}h ago`;
    return `${Math.floor(h / 24)}d ago`;
}

export default function JobsPage() {
    const navigate = useNavigate();
    const [jobs, setJobs] = useState<JobSummary[]>([]);
    const [loaded, setLoaded] = useState(false);

    useEffect(() => {
        listJobs(true)
            .then(setJobs)
            .catch(() => {})
            .finally(() => setLoaded(true));
    }, []);

    return (
        <div className="min-h-screen bg-slate-50 dark:bg-slate-900">
            <header className="px-4 py-3 bg-white dark:bg-slate-800 shadow-sm flex items-center gap-3">
                <button onClick={() => navigate("/")} className="p-2 -ml-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700">
                    <ArrowLeft className="w-5 h-5" />
                </button>
                <h1 className="text-lg font-bold">My Jobs</h1>
            </header>

            <main className="p-4 max-w-md mx-auto space-y-3">
                {loaded && jobs.length === 0 && (
                    <p className="text-muted-foreground text-center py-10">No jobs assigned to you.</p>
                )}
                {jobs.map((job) => (
                    <Card
                        key={job.id}
                        className="cursor-pointer active:scale-95 transition-transform"
                        onClick={() => navigate(`/repair/ticket/${job.id}`)}
                    >
                        <CardContent className="p-4 space-y-2">
                            <div className="flex items-center justify-between gap-2">
                                <span className="font-semibold">{jobLabel(job)}</span>
                                <StatusBadge status={job.status} />
                            </div>
                            <div className="text-sm text-muted-foreground line-clamp-2">
                                {job.customer_complaint || "No complaint recorded"}
                            </div>
                            <div className="text-xs text-muted-foreground">{elapsed(job.created_at)}</div>
                        </CardContent>
                    </Card>
                ))}
            </main>
        </div>
    );
}
