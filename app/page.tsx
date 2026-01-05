export default function Home() {
  return (
    <main>
      <nav className="nav">
        <span>UDITO</span>
        <div className="badges">
          <div className="badge">Wix Stores</div>
          <div className="badge">Fiscal Receipts</div>
          <div className="badge">NAP Audit XML</div>
        </div>
      </nav>
      <div className="container">
        <section className="hero">
          <div>
            <h1>Receipts and monthly audit export, built for Bulgarian ecommerce.</h1>
            <p>
              UDITO connects to Wix Stores, formats receipts the way you want, and
              prepares audit XML files ready for submission to NAP.
            </p>
            <a className="cta" href="/overview">
              Open dashboard
            </a>
          </div>
          <div className="hero-card">
            <h2>What it does</h2>
            <p>
              One place to manage receipts, templates, and monthly audit exports.
              Keep compliance tasks simple even across multiple Wix sites.
            </p>
            <div className="grid">
              <div className="card">
                <h3>Order sync</h3>
                <p>Listens to Wix order events and stores snapshots.</p>
              </div>
              <div className="card">
                <h3>Receipt templates</h3>
                <p>Injects your design and mandatory fiscal fields.</p>
              </div>
              <div className="card">
                <h3>Audit export</h3>
                <p>Monthly XML structure aligned with N-18 Appendix 38.</p>
              </div>
            </div>
          </div>
        </section>
      </div>
      <footer className="footer">UDITO by Designs by Po.</footer>
    </main>
  );
}
