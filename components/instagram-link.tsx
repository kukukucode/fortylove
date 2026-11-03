export function InstagramLink({ id }: { id?: string | null }) {
  const username = id?.trim().replace(/^@+/, "");
  if (!username) return <>未登録</>;
  return (
    <a
      className="instagram-link"
      href={`https://www.instagram.com/${encodeURIComponent(username)}/`}
      target="_blank"
      rel="noreferrer noopener"
    >
      @{username}
    </a>
  );
}
