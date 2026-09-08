import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";

export async function requireSession() {
  const session = await getSession();
  if (!session) redirect("/login");
  return session;
}

export async function requireMember() {
  const session = await requireSession();
  if (session.role !== "member") redirect("/admin");
  return session;
}

export async function requireParticipant() {
  const session = await requireSession();
  if (session.role !== "member" && session.role !== "super_admin") redirect("/admin");
  return session;
}

export async function requireAdmin() {
  const session = await requireSession();
  const { data: user } = await db().from("users").select("id,name,role").eq("id", session.id).single();
  if (!user || user.role === "member") redirect("/login");
  return user;
}

export async function requireSuperAdmin() {
  const user = await requireAdmin();
  if (user.role !== "super_admin") redirect("/admin");
  return user;
}
