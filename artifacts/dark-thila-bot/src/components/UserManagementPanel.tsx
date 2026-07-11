import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Users, ShieldCheck, User, Trash2, Key, Plus, X, Check, AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";

interface ManagedUser {
  id: string;
  username: string;
  email: string;
  role: "admin" | "user";
  createdAt: string;
}

async function apiFetch(path: string, options?: RequestInit) {
  const token = localStorage.getItem("auth_token");
  const res = await fetch(`/api/auth/admin${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...options?.headers,
    },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Request failed");
  return data;
}

function CreateUserModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [form, setForm] = useState({ username: "", email: "", password: "", role: "user" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const { toast } = useToast();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      await apiFetch("/users", { method: "POST", body: JSON.stringify(form) });
      toast({ title: "User created", description: `@${form.username} has been added.` });
      onCreated();
      onClose();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <motion.div
        className="bg-zinc-950 border border-zinc-700/40 rounded-xl p-6 w-full max-w-md space-y-4 shadow-2xl"
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-mono font-bold text-zinc-300 flex items-center gap-2">
            <Plus className="w-4 h-4" /> New User
          </h3>
          <Button variant="ghost" size="icon" className="w-7 h-7" onClick={onClose}>
            <X className="w-4 h-4" />
          </Button>
        </div>

        <form onSubmit={submit} className="space-y-3">
          <Input
            placeholder="Username"
            value={form.username}
            onChange={e => setForm(f => ({ ...f, username: e.target.value }))}
            className="bg-zinc-900 border-zinc-700 text-sm"
          />
          <Input
            placeholder="Email"
            type="email"
            value={form.email}
            onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
            className="bg-zinc-900 border-zinc-700 text-sm"
          />
          <Input
            placeholder="Password (min 6 chars)"
            type="password"
            value={form.password}
            onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
            className="bg-zinc-900 border-zinc-700 text-sm"
          />
          <select
            value={form.role}
            onChange={e => setForm(f => ({ ...f, role: e.target.value }))}
            className="w-full bg-zinc-900 border border-zinc-700 rounded-md px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:ring-1 focus:ring-white/30"
          >
            <option value="user">User</option>
            <option value="admin">Admin</option>
          </select>

          {error && (
            <p className="text-xs text-red-400 flex items-center gap-1">
              <AlertTriangle className="w-3 h-3" /> {error}
            </p>
          )}

          <Button
            type="submit"
            className="w-full bg-zinc-700 hover:bg-zinc-600 text-sm"
            disabled={loading}
          >
            {loading ? <RefreshCw className="w-4 h-4 animate-spin mr-2" /> : <Plus className="w-4 h-4 mr-2" />}
            Create User
          </Button>
        </form>
      </motion.div>
    </motion.div>
  );
}

function ResetPasswordModal({ user, onClose }: { user: ManagedUser; onClose: () => void }) {
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const { toast } = useToast();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      await apiFetch(`/users/${user.id}/password`, { method: "PATCH", body: JSON.stringify({ password }) });
      toast({ title: "Password reset", description: `Password for @${user.username} updated.` });
      onClose();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <motion.div
        className="bg-zinc-950 border border-zinc-700/40 rounded-xl p-6 w-full max-w-sm space-y-4"
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-mono font-bold text-amber-300 flex items-center gap-2">
            <Key className="w-4 h-4" /> Reset Password — @{user.username}
          </h3>
          <Button variant="ghost" size="icon" className="w-7 h-7" onClick={onClose}>
            <X className="w-4 h-4" />
          </Button>
        </div>

        <form onSubmit={submit} className="space-y-3">
          <Input
            placeholder="New password (min 6 chars)"
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            className="bg-zinc-900 border-zinc-700 text-sm"
          />
          {error && <p className="text-xs text-red-400">{error}</p>}
          <Button
            type="submit"
            className="w-full bg-amber-600 hover:bg-amber-500 text-sm"
            disabled={loading}
          >
            {loading ? <RefreshCw className="w-4 h-4 animate-spin mr-2" /> : <Key className="w-4 h-4 mr-2" />}
            Reset Password
          </Button>
        </form>
      </motion.div>
    </motion.div>
  );
}

export function UserManagementPanel() {
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [resetTarget, setResetTarget] = useState<ManagedUser | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const { toast } = useToast();

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const data = await apiFetch("/users");
      setUsers(data.users);
    } catch {
      toast({ title: "Error", description: "Failed to load users.", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const togglePanel = () => {
    if (!isOpen) fetchUsers();
    setIsOpen(v => !v);
  };

  const toggleRole = async (u: ManagedUser) => {
    const newRole = u.role === "admin" ? "user" : "admin";
    try {
      await apiFetch(`/users/${u.id}/role`, { method: "PATCH", body: JSON.stringify({ role: newRole }) });
      setUsers(prev => prev.map(x => x.id === u.id ? { ...x, role: newRole } : x));
      toast({ title: "Role updated", description: `@${u.username} is now ${newRole}.` });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  const deleteUser = async (u: ManagedUser) => {
    setDeletingId(u.id);
    try {
      await apiFetch(`/users/${u.id}`, { method: "DELETE" });
      setUsers(prev => prev.filter(x => x.id !== u.id));
      toast({ title: "User deleted", description: `@${u.username} removed.` });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setDeletingId(null);
    }
  };

  const formatDate = (iso: string) => new Date(iso).toLocaleDateString();

  return (
    <>
      <AnimatePresence>
        {showCreate && (
          <CreateUserModal onClose={() => setShowCreate(false)} onCreated={fetchUsers} />
        )}
        {resetTarget && (
          <ResetPasswordModal user={resetTarget} onClose={() => setResetTarget(null)} />
        )}
      </AnimatePresence>

      <motion.section
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.2 }}
        className="border border-zinc-800/30 rounded-xl overflow-hidden"
      >
        {/* Header */}
        <button
          onClick={togglePanel}
          className="w-full flex items-center justify-between px-5 py-4 bg-zinc-900/30 hover:bg-zinc-900/50 transition-colors"
        >
          <div className="flex items-center gap-3">
            <Users className="w-4 h-4 text-zinc-200" />
            <span className="text-sm font-mono font-bold text-zinc-100 tracking-wide">USER_MANAGEMENT</span>
            {users.length > 0 && (
              <span className="text-xs bg-zinc-700/50 text-zinc-300 rounded-full px-2 py-0.5 font-mono">
                {users.length}
              </span>
            )}
          </div>
          <motion.span
            animate={{ rotate: isOpen ? 45 : 0 }}
            transition={{ duration: 0.2 }}
            className="text-zinc-200 text-lg leading-none"
          >
            +
          </motion.span>
        </button>

        <AnimatePresence initial={false}>
          {isOpen && (
            <motion.div
              key="panel"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.3 }}
              className="overflow-hidden"
            >
              <div className="p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <p className="text-xs text-zinc-500 font-mono">Manage accounts and permissions</p>
                  <div className="flex gap-2">
                    <Button
                      onClick={fetchUsers}
                      variant="ghost"
                      size="sm"
                      className="text-xs text-zinc-500 hover:text-zinc-300 gap-1.5"
                    >
                      <RefreshCw className={`w-3 h-3 ${loading ? "animate-spin" : ""}`} />
                      Refresh
                    </Button>
                    <Button
                      onClick={() => setShowCreate(true)}
                      size="sm"
                      className="bg-zinc-700 hover:bg-zinc-600 text-xs gap-1.5"
                    >
                      <Plus className="w-3 h-3" /> Add User
                    </Button>
                  </div>
                </div>

                {loading ? (
                  <div className="flex justify-center py-8">
                    <RefreshCw className="w-5 h-5 animate-spin text-zinc-300" />
                  </div>
                ) : users.length === 0 ? (
                  <p className="text-center text-xs text-zinc-600 font-mono py-8">No users found.</p>
                ) : (
                  <div className="space-y-2">
                    <AnimatePresence>
                      {users.map(u => (
                        <motion.div
                          key={u.id}
                          initial={{ opacity: 0, x: -10 }}
                          animate={{ opacity: 1, x: 0 }}
                          exit={{ opacity: 0, x: 10 }}
                          className="flex items-center justify-between bg-zinc-900/50 border border-zinc-800/50 rounded-lg px-4 py-3 gap-3"
                        >
                          {/* User info */}
                          <div className="flex items-center gap-3 min-w-0">
                            <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                              u.role === "admin" ? "bg-zinc-800/60" : "bg-zinc-800"
                            }`}>
                              {u.role === "admin"
                                ? <ShieldCheck className="w-4 h-4 text-zinc-200" />
                                : <User className="w-4 h-4 text-zinc-500" />
                              }
                            </div>
                            <div className="min-w-0">
                              <p className="text-sm font-medium text-zinc-100 truncate">{u.username}</p>
                              <p className="text-xs text-zinc-500 truncate">{u.email}</p>
                            </div>
                          </div>

                          {/* Meta */}
                          <div className="hidden sm:flex items-center gap-2 flex-shrink-0">
                            <span className={`text-xs font-mono px-2 py-0.5 rounded-full ${
                              u.role === "admin"
                                ? "bg-zinc-800/50 text-zinc-300"
                                : "bg-zinc-800 text-zinc-400"
                            }`}>
                              {u.role}
                            </span>
                            <span className="text-xs text-zinc-600">{formatDate(u.createdAt)}</span>
                          </div>

                          {/* Actions */}
                          <div className="flex items-center gap-1 flex-shrink-0">
                            <Button
                              onClick={() => toggleRole(u)}
                              variant="ghost"
                              size="icon"
                              className="w-7 h-7 text-zinc-500 hover:text-zinc-200 hover:bg-zinc-900/40"
                              title={u.role === "admin" ? "Demote to User" : "Promote to Admin"}
                            >
                              {u.role === "admin"
                                ? <User className="w-3.5 h-3.5" />
                                : <ShieldCheck className="w-3.5 h-3.5" />
                              }
                            </Button>
                            <Button
                              onClick={() => setResetTarget(u)}
                              variant="ghost"
                              size="icon"
                              className="w-7 h-7 text-zinc-500 hover:text-amber-400 hover:bg-amber-950/30"
                              title="Reset Password"
                            >
                              <Key className="w-3.5 h-3.5" />
                            </Button>
                            <Button
                              onClick={() => deleteUser(u)}
                              variant="ghost"
                              size="icon"
                              className="w-7 h-7 text-zinc-600 hover:text-red-400 hover:bg-red-950/30"
                              title="Delete User"
                              disabled={deletingId === u.id}
                            >
                              {deletingId === u.id
                                ? <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                                : <Trash2 className="w-3.5 h-3.5" />
                              }
                            </Button>
                          </div>
                        </motion.div>
                      ))}
                    </AnimatePresence>
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.section>
    </>
  );
}
