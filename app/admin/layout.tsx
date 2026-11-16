import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { AdminNav } from "@/components/admin-nav";
import { ChatbotWidget } from "@/components/chatbot-widget";
import { db } from "@/lib/db";
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect("/login");
  const client = db();
  const [{ data: user }, { data: settings }] = await Promise.all([
    client.from("users").select("name,role").eq("id", session.id).single(),
    client.from("app_settings").select("chatbot_admin_enabled").eq("id", 1).maybeSingle(),
  ]);
  if (!user || user.role === "member") redirect("/login");
  return (
    <div className="admin-shell">
      <AdminNav role={user.role as "admin" | "super_admin"} />
      <main className="admin-main">
        <header className="admin-top">
          <span>早大Fortylove</span>
          <span className="admin-user">
            {user.name} <small>{user.role === "super_admin" ? "最高情報責任者" : "管理者"}</small>
          </span>
        </header>
        {children}
      </main>
      {(user.role === "super_admin" || settings?.chatbot_admin_enabled === true) && (
        <ChatbotWidget mode={user.role === "super_admin" ? "preview" : "admin"} />
      )}
    </div>
  );
}
