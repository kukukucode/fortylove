import { Instagram } from "lucide-react";
import Link from "next/link";

const INSTAGRAM_URL = "https://www.instagram.com/waseda_fortylove_shinkan";
const X_URL = "";

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="footer-main">
        <div className="footer-brand">
          <strong>Fortylove</strong>
          <p>早稲田大学のテニスサークル<br />新歓・練習管理サイト</p>
        </div>
        <nav className="footer-nav" aria-label="フッターナビゲーション">
          <strong>MENU</strong>
          <Link href="/home">ホーム</Link>
          <Link href="/events">イベント一覧</Link>
          <Link href="/profile">プロフィール</Link>
        </nav>
        <div className="footer-social">
          <strong>OFFICIAL SNS</strong>
          <small>新歓情報や活動の様子を発信しています</small>
          <div className="social-links">
            <a href={INSTAGRAM_URL} target="_blank" rel="noopener noreferrer" aria-label="Instagramを見る">
              <span className="social-mark"><Instagram /></span>
              <span>Instagram</span>
            </a>
            {X_URL ? (
              <a href={X_URL} target="_blank" rel="noopener noreferrer">
                <span className="social-mark social-x">X</span>
                <span>X<small>公式アカウント</small></span>
              </a>
            ) : (
              <span className="social-link-disabled">
                <span className="social-mark social-x">X</span>
                <span>X<small>COMING SOON</small></span>
              </span>
            )}
          </div>
        </div>
      </div>
      <div className="footer-bottom">
        <span>早大Fortylove</span>
        <small>© {new Date().getFullYear()} Kosuke Kuwahara. All rights reserved.</small>
      </div>
    </footer>
  );
}
