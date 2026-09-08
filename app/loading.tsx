export default function Loading() {
  return <section className="page-loading" role="status" aria-label="ページを読み込み中" aria-busy="true">
    <p className="loading-copy">読み込み中<span className="loading-dots" aria-hidden="true"><i /><i /><i /></span></p>
    <div className="skeleton heading" /><div className="skeleton" /><div className="skeleton" />
    <span className="sr-only">読み込み中です</span>
  </section>;
}
