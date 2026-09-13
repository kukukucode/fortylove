import type { Metadata } from "next";
import "./globals.css";
import "./styles/features/shared-controls.css";
import "./styles/features/profile.css";
import "./styles/features/documents.css";
import "./styles/features/calendar.css";
import "./styles/features/account-navigation.css";
import "./styles/features/event-lists.css";
import "./styles/features/admin-events.css";
import "./styles/features/faq.css";
import "./styles/features/chatbot/preview.css";
import "./styles/features/chatbot/admin-settings.css";
import "./styles/features/chatbot/knowledge-management.css";
import "./styles/features/chatbot/widget.css";
import "./styles/features/chatbot/responsive.css";
import "./styles/features/admin.css";
import "./styles/features/footer.css";
import "./styles/interactions.css";
import "./styles/theme/foundation.css";
import "./styles/theme/auth.css";
import "./styles/theme/controls.css";
import "./styles/theme/shell-chrome.css";
import "./styles/theme/home-welcome.css";
import "./styles/theme/surfaces.css";
import "./styles/theme/chatbot-theme.css";
import "./styles/theme/reduced-motion.css";
import "./styles/member-navigation.css";
import "./styles/events/home-events.css";
import "./styles/events/events-page.css";
import "./styles/events/event-gallery.css";
import "./styles/events/event-detail.css";
import "./styles/events/responsive.css";
import "./styles/loading.css";
import { NavigationFeedback } from "@/components/navigation-feedback";
import { ScrollToTop } from "@/components/scroll-to-top";

export const metadata: Metadata = {
  title: "早大Fortylove",
  description: "早大Fortyloveの新歓・練習予約管理アプリ",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ja">
      <body><NavigationFeedback />{children}<ScrollToTop /></body>
    </html>
  );
}
