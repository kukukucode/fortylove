import { FormFeedback } from "@/components/form-feedback";
import { redirect } from "next/navigation";
import { MemberHeader } from "@/components/member-header";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { submitFaqQuestion } from "@/app/server-actions/faq-actions";
import { ChatbotWidget } from "@/components/chatbot-widget";
import { readFaqs } from "@/lib/server/faq-data";

export const dynamic = "force-dynamic";

export default async function FaqPage({ searchParams }: { searchParams: Promise<{ submitted?: string; error?: string }> }) {
  const session = await getSession();
  if (!session) redirect("/login");
  const { submitted, error } = await searchParams;
  const client = db();
  const [{ data: user }, { data: faqs, error: faqsError }, { data: categories }, { data: settings }] = await Promise.all([
    client.from("users").select("name,avatar_url").eq("id", session.id).single(),
    readFaqs(true),
    client.from("faq_categories").select("name").order("sort_order").order("name"),
    client.from("app_settings").select("chatbot_member_enabled").eq("id", 1).maybeSingle(),
  ]);
  const usedCategories = [...new Set((faqs ?? []).map((faq) => faq.category))];
  const categoryNames = [
    ...(categories ?? []).map((category) => category.name).filter((name) => usedCategories.includes(name)),
    ...usedCategories.filter((name) => !(categories ?? []).some((category) => category.name === name)),
  ];
  return <main className="member-shell faq-page">
    <MemberHeader active="faq" name={user?.name ?? session.name} avatarUrl={user?.avatar_url} />
    <section className="faq-hero"><p className="eyebrow green">HELP CENTER</p><h1>よくある質問</h1><p>練習・イベントや入会について、よくある質問をまとめています。</p></section>
    <section className="faq-content">
      {faqsError && <div className="alert">FAQを読み込めませんでした。時間をおいてお試しください。</div>}
      {submitted && <div className="success-message">質問を受け付けました。回答は内容を確認後、FAQで公開します。</div>}
      {error && <div className="alert">{error === "question" ? "質問は5文字以上500文字以内で入力してください。" : "質問を送信できませんでした。もう一度お試しください。"}</div>}
      <details className="faq-question-panel"><summary>知りたいことを質問する</summary><form action={submitFaqQuestion}><FormFeedback /><label>質問内容<textarea name="question" minLength={5} maxLength={500} placeholder="FAQにない内容はこちらから質問できます" required /></label><small>回答は管理者が確認し、個人情報を含まない形でFAQへ公開します。</small><button className="primary">質問を送信する</button></form></details>
      {categoryNames.map((category) => <section className="faq-category" key={category}><h2>{category}</h2><div className="faq-list">
        {faqs?.filter((faq) => faq.category === category).map((faq) => <details className="faq-item" key={faq.id}><summary>{faq.question}</summary><p>{faq.answer}</p></details>)}
      </div></section>)}
      {!faqs?.length && <div className="empty"><p>現在、公開中のFAQはありません。</p></div>}
    </section>{settings?.chatbot_member_enabled === true && <ChatbotWidget mode="member" />}
  </main>;
}
