import { Router, type Response } from "express";
import { v4 as uuidv4 } from "uuid";
import {
  hashPassword, checkPassword, signToken, verifyToken,
  requireAuth, requireAdmin, type AuthRequest,
} from "../lib/auth.js";
import {
  getAllUsers, getUserByEmail, getUserByUsername, getUserById,
  countUsers, createUser, updateUserRole, updateUserPassword, deleteUser,
  type User,
} from "../lib/userStore.js";

const router = Router();

// POST /api/auth/register
router.post("/register", async (req, res: Response): Promise<void> => {
  const { username, email, password } = req.body;

  if (!username || !email || !password) {
    res.status(400).json({ error: "Username, email and password are required." }); return;
  }
  if (username.length < 3) {
    res.status(400).json({ error: "Username must be at least 3 characters." }); return;
  }
  if (password.length < 6) {
    res.status(400).json({ error: "Password must be at least 6 characters." }); return;
  }

  if (await getUserByEmail(email)) {
    res.status(400).json({ error: "Email already registered." }); return;
  }
  if (await getUserByUsername(username)) {
    res.status(400).json({ error: "Username already taken." }); return;
  }

  const total = await countUsers();
  const role: "admin" | "user" = total === 0 ? "admin" : "user";

  const newUser: User = {
    id: uuidv4(), username, email,
    passwordHash: await hashPassword(password),
    role, createdAt: new Date().toISOString(),
  };

  await createUser(newUser);

  const { passwordHash, ...safeUser } = newUser;
  const token = signToken(safeUser);
  res.json({ token, user: safeUser });
});

// POST /api/auth/login
router.post("/login", async (req, res: Response): Promise<void> => {
  const { email, password } = req.body;

  if (!email || !password) {
    res.status(400).json({ error: "Email and password are required." }); return;
  }

  const user = await getUserByEmail(email);
  if (!user || !(await checkPassword(password, user.passwordHash))) {
    res.status(401).json({ error: "Invalid email or password." }); return;
  }

  const { passwordHash, ...safeUser } = user;
  const token = signToken(safeUser);
  res.json({ token, user: safeUser });
});

// GET /api/auth/admin/users
router.get("/admin/users", requireAdmin as any, async (req: AuthRequest, res: Response): Promise<void> => {
  const users = await getAllUsers();
  const safe = users.map(({ passwordHash, ...u }) => u);
  res.json({ users: safe });
});

// POST /api/auth/admin/users
router.post("/admin/users", requireAdmin as any, async (req: AuthRequest, res: Response): Promise<void> => {
  const { username, email, password, role } = req.body;
  if (!username || !email || !password) {
    res.status(400).json({ error: "username, email and password required." }); return;
  }
  if (username.length < 3) {
    res.status(400).json({ error: "Username must be at least 3 characters." }); return;
  }
  if (password.length < 6) {
    res.status(400).json({ error: "Password must be at least 6 characters." }); return;
  }

  if (await getUserByEmail(email)) {
    res.status(400).json({ error: "Email already registered." }); return;
  }
  if (await getUserByUsername(username)) {
    res.status(400).json({ error: "Username already taken." }); return;
  }

  const newUser: User = {
    id: uuidv4(), username, email,
    passwordHash: await hashPassword(password),
    role: role === "admin" ? "admin" : "user",
    createdAt: new Date().toISOString(),
  };
  await createUser(newUser);

  const { passwordHash, ...safe } = newUser;
  res.json({ user: safe });
});

// PATCH /api/auth/admin/users/:id/role
router.patch("/admin/users/:id/role", requireAdmin as any, async (req: AuthRequest, res: Response): Promise<void> => {
  const { role } = req.body;
  if (role !== "admin" && role !== "user") {
    res.status(400).json({ error: "Role must be 'admin' or 'user'." }); return;
  }

  const updated = await updateUserRole(req.params.id, role);
  if (!updated) { res.status(404).json({ error: "User not found." }); return; }

  const { passwordHash, ...safe } = updated;
  res.json({ user: safe });
});

// PATCH /api/auth/admin/users/:id/password
router.patch("/admin/users/:id/password", requireAdmin as any, async (req: AuthRequest, res: Response): Promise<void> => {
  const { password } = req.body;
  if (!password || password.length < 6) {
    res.status(400).json({ error: "Password must be at least 6 characters." }); return;
  }

  const ok = await updateUserPassword(req.params.id, await hashPassword(password));
  if (!ok) { res.status(404).json({ error: "User not found." }); return; }
  res.json({ ok: true });
});

// DELETE /api/auth/admin/users/:id
router.delete("/admin/users/:id", requireAdmin as any, async (req: AuthRequest, res: Response): Promise<void> => {
  if (req.user?.id === req.params.id) {
    res.status(400).json({ error: "Cannot delete yourself." }); return;
  }

  const ok = await deleteUser(req.params.id);
  if (!ok) { res.status(404).json({ error: "User not found." }); return; }
  res.json({ ok: true });
});

// GET /api/auth/me
router.get("/me", (req: AuthRequest, res: Response): void => {
  const token = req.headers.authorization?.replace("Bearer ", "");
  if (!token) { res.status(401).json({ error: "Not authenticated." }); return; }

  const user = verifyToken(token);
  if (!user) { res.status(401).json({ error: "Invalid or expired token." }); return; }

  res.json({ user });
});

export default router;
