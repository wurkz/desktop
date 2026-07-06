import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
    Button,
    Input,
    Label,
    Card,
    CardContent,
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
} from "@zorviz/ui";
import { ArrowLeft, UserPlus, Pencil } from "lucide-react";
import { useAuthStore } from "../stores/auth";
import { listAllUsers, createUser, updateUser, type StaffUser } from "../lib/users-api";

const ROLES = ["admin", "advisor", "mechanic"];

export default function UsersPage() {
    const navigate = useNavigate();
    const currentUser = useAuthStore((s) => s.user);
    const isAdmin = currentUser?.role === "admin" || currentUser?.role === "owner";

    const [users, setUsers] = useState<StaffUser[]>([]);
    const [editing, setEditing] = useState<StaffUser | null>(null); // null = closed
    const [creating, setCreating] = useState(false);

    // Form fields
    const [name, setName] = useState("");
    const [username, setUsername] = useState("");
    const [role, setRole] = useState("mechanic");
    const [pin, setPin] = useState("");
    const [active, setActive] = useState(true);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");

    const refresh = useCallback(() => {
        listAllUsers().then(setUsers).catch(() => {});
    }, []);

    useEffect(() => {
        refresh();
    }, [refresh]);

    const openCreate = () => {
        setEditing(null);
        setCreating(true);
        setName("");
        setUsername("");
        setRole("mechanic");
        setPin("");
        setActive(true);
        setError("");
    };
    const openEdit = (u: StaffUser) => {
        setCreating(false);
        setEditing(u);
        setName(u.name);
        setUsername(u.username);
        setRole(u.role);
        setPin("");
        setActive(u.is_active !== 0);
        setError("");
    };
    const close = () => {
        setCreating(false);
        setEditing(null);
    };

    const submit = async () => {
        setBusy(true);
        setError("");
        try {
            if (creating) {
                await createUser({ name, username, role, pin });
            } else if (editing) {
                await updateUser(editing.id, {
                    name,
                    role,
                    is_active: active ? 1 : 0,
                    ...(pin.trim() ? { pin } : {}),
                });
            }
            refresh();
            close();
        } catch (e) {
            setError(e instanceof Error ? e.message : "Save failed.");
        } finally {
            setBusy(false);
        }
    };

    const open = creating || editing !== null;

    return (
        <div className="min-h-screen bg-slate-50 dark:bg-slate-900">
            <header className="px-4 py-3 bg-white dark:bg-slate-800 shadow-sm flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <button onClick={() => navigate("/")} className="p-2 -ml-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700">
                        <ArrowLeft className="w-5 h-5" />
                    </button>
                    <h1 className="text-lg font-bold">Staff</h1>
                </div>
                {isAdmin && (
                    <Button size="sm" onClick={openCreate}>
                        <UserPlus className="w-4 h-4 mr-1" /> Add User
                    </Button>
                )}
            </header>

            <main className="p-4 max-w-md mx-auto space-y-3">
                {!isAdmin && <p className="text-muted-foreground">Only an admin can manage staff.</p>}
                {users.map((u) => (
                    <Card key={u.id}>
                        <CardContent className="p-4 flex items-center justify-between gap-2">
                            <div className="min-w-0">
                                <div className="font-medium truncate">
                                    {u.name}
                                    {u.is_active === 0 && <span className="ml-2 text-xs text-muted-foreground">(inactive)</span>}
                                </div>
                                <div className="text-xs text-muted-foreground">
                                    @{u.username} · <span className="capitalize">{u.role}</span>
                                </div>
                            </div>
                            {isAdmin && (
                                <Button variant="outline" size="sm" onClick={() => openEdit(u)}>
                                    <Pencil className="w-4 h-4" />
                                </Button>
                            )}
                        </CardContent>
                    </Card>
                ))}
            </main>

            <Dialog open={open} onOpenChange={(o) => { if (!o) close(); }}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>{creating ? "Add User" : "Edit User"}</DialogTitle>
                        <DialogDescription>
                            {creating ? "Create a staff login." : `Update ${editing?.username}.`}
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4">
                        <div className="space-y-1">
                            <Label htmlFor="uname">Name</Label>
                            <Input id="uname" value={name} onChange={(e) => setName(e.target.value)} />
                        </div>
                        {creating && (
                            <div className="space-y-1">
                                <Label htmlFor="uusername">Username</Label>
                                <Input id="uusername" value={username} onChange={(e) => setUsername(e.target.value)} />
                            </div>
                        )}
                        <div className="space-y-1">
                            <Label>Role</Label>
                            <div className="grid grid-cols-3 gap-2">
                                {ROLES.map((r) => (
                                    <button
                                        key={r}
                                        type="button"
                                        onClick={() => setRole(r)}
                                        className={`rounded-md border p-2 text-sm capitalize transition-colors ${
                                            role === r ? "bg-primary/10 border-primary text-primary" : "hover:bg-muted"
                                        }`}
                                    >
                                        {r}
                                    </button>
                                ))}
                            </div>
                        </div>
                        <div className="space-y-1">
                            <Label htmlFor="upin">{creating ? "PIN (exactly 6 digits)" : "Reset PIN — 6 digits (leave blank to keep)"}</Label>
                            <Input id="upin" type="password" inputMode="numeric" maxLength={6} value={pin} onChange={(e) => setPin(e.target.value)} />
                        </div>
                        {!creating && (
                            <label className="flex items-center gap-2 text-sm">
                                <input type="checkbox" className="h-4 w-4" checked={active} onChange={(e) => setActive(e.target.checked)} />
                                Active
                            </label>
                        )}
                        {error && <p className="text-sm text-destructive">{error}</p>}
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={close} disabled={busy}>Cancel</Button>
                        <Button onClick={submit} disabled={busy}>{busy ? "Saving…" : "Save"}</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
