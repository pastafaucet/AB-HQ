// Instant fallback for every hub under the app shell — the sidebar stays
// interactive while the destination page's data loads.
export default function Loading() {
  return (
    <section className="pane">
      <div className="skel-kicker" />
      <div className="skel-title" />
      <div className="skel-block" />
      <div className="skel-row" />
      <div className="skel-row" />
      <div className="skel-row" />
      <div className="skel-row short" />
    </section>
  );
}
