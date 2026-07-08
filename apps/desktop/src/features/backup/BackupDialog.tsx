import { useState, useEffect, useCallback } from "react";
import {
    Button,
    Input,
    Label,
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
} from "@zorviz/ui";
import { Save, RotateCcw, FolderCog, Images } from "lucide-react";
import { listBackups, backupNow, fullBackup, restoreBackup, setBackupDir, type BackupInfo } from "../../lib/backup-api";
import { useAuthStore } from "../../stores/auth";
import { useConfirm } from "../../components/confirm";

interface Props {
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

export function BackupDialog({ open, onOpenChange }: Props) {
    // Restore + changing the backup folder are destructive/admin ops (server-gated to
    // admin/owner). Advisors can create + view backups only. (BACK-2-015)
    const role = useAuthStore((s) => s.user?.role);
    const isAdmin = role === "owner" || role === "admin";
    const confirm = useConfirm();
    const [dir, setDir] = useState("");
    const [backups, setBackups] = useState<BackupInfo[]>([]);
    const [busy, setBusy] = useState(false);
    const [note, setNote] = useState("");

    const refresh = useCallback(async () => {
        try {
            const res = await listBackups();
            setDir(res.dir);
            setBackups(res.backups);
        } catch (e) {
            console.error(e);
        }
    }, []);

    useEffect(() => {
        if (open) {
            setNote("");
            refresh();
        }
    }, [open, refresh]);

    const doBackup = async () => {
        setBusy(true);
        setNote("");
        try {
            const { name } = await backupNow();
            setNote(`Backed up: ${name}`);
            await refresh();
        } catch {
            setNote("Backup failed.");
        } finally {
            setBusy(false);
        }
    };

    const doFullBackup = async () => {
        setBusy(true);
        setNote("Creating full backup (with photos)…");
        try {
            const { name } = await fullBackup();
            setNote(`Full backup: ${name}`);
            await refresh();
        } catch {
            setNote("Full backup failed.");
        } finally {
            setBusy(false);
        }
    };

    const saveDir = async () => {
        setBusy(true);
        try {
            await setBackupDir(dir);
            await refresh();
            setNote("Backup folder updated.");
        } catch {
            setNote("Could not update folder.");
        } finally {
            setBusy(false);
        }
    };

    const doRestore = async (name: string) => {
        const ok = await confirm({
            title: `Restore from "${name}"?`,
            message: "Your current data will be replaced by this backup on the next app restart.",
            verb: "Slide to restore",
            danger: true,
        });
        if (!ok) return;
        setBusy(true);
        try {
            await restoreBackup(name);
            window.alert("Restore staged. Close and reopen the app to complete it — your current data stays intact until then.");
        } catch {
            setNote("Restore failed.");
        } finally {
            setBusy(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-lg">
                <DialogHeader>
                    <DialogTitle>Backup &amp; Restore</DialogTitle>
                    <DialogDescription>
                        Backups are made automatically on launch. Keep the folder on a USB drive or second disk.
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4">
                    <div className="space-y-1">
                        <Label htmlFor="backupdir">Backup folder</Label>
                        <div className="flex gap-2">
                            <Input id="backupdir" value={dir} onChange={(e) => setDir(e.target.value)} disabled={!isAdmin} />
                            {isAdmin && (
                                <Button variant="outline" onClick={saveDir} disabled={busy}>
                                    <FolderCog className="w-4 h-4 mr-1" /> Save
                                </Button>
                            )}
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                        <Button onClick={doBackup} disabled={busy}>
                            <Save className="w-4 h-4 mr-1" /> Back Up Now
                        </Button>
                        <Button variant="outline" onClick={doFullBackup} disabled={busy}>
                            <Images className="w-4 h-4 mr-1" /> Full Backup
                        </Button>
                    </div>
                    <p className="text-xs text-muted-foreground -mt-2">
                        "Back Up Now" saves the database only (fast). "Full Backup" makes a single .zip with the
                        database <em>and</em> photos/logo — best for off-site copies.
                    </p>

                    <div className="space-y-1">
                        <Label>Available backups</Label>
                        <div className="max-h-56 overflow-y-auto rounded-md border divide-y">
                            {backups.length === 0 && <p className="p-3 text-sm text-muted-foreground">No backups yet.</p>}
                            {backups.map((b) => (
                                <div key={b.name} className="flex items-center justify-between gap-2 p-2 text-sm">
                                    <div className="min-w-0">
                                        <div className="truncate font-mono text-xs">
                                            {b.name}
                                            {b.name.endsWith(".zip") && (
                                                <span className="ml-2 rounded-full bg-primary/10 text-primary px-1.5 py-0.5 text-[10px] font-sans">full</span>
                                            )}
                                        </div>
                                        <div className="text-xs text-muted-foreground">
                                            {(b.size / 1024).toFixed(0)} KB · {new Date(b.modified).toLocaleString()}
                                        </div>
                                    </div>
                                    {isAdmin && (
                                        <Button variant="outline" size="sm" disabled={busy} onClick={() => doRestore(b.name)}>
                                            <RotateCcw className="w-4 h-4 mr-1" /> Restore
                                        </Button>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>

                    {note && <p className="text-sm text-muted-foreground">{note}</p>}
                </div>
            </DialogContent>
        </Dialog>
    );
}
