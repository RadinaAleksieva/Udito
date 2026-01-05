const sections = [
  {
    title: "Who we are",
    body: "UDITO is operated by DESIGNS BY PO Ltd. (BG207357583), Sofia, Bulgaria.",
  },
  {
    title: "What data we process",
    body: "We process order metadata from Wix Stores that is required to issue receipts and generate audit XML files.",
  },
  {
    title: "Why we process it",
    body: "We use the data to generate fiscal receipts and monthly audit exports required by Bulgarian regulations.",
  },
  {
    title: "How long we keep it",
    body: "Order snapshots are stored only as long as needed for compliance exports or at your request.",
  },
  {
    title: "Your rights",
    body: "You may request access, correction, or deletion of your data by emailing office@designedbypo.com.",
  },
];

export default function PrivacyPolicyPage() {
  return (
    <main>
      <nav className="nav">
        <span>UDITO</span>
        <div className="badges">
          <div className="badge">Privacy Policy</div>
        </div>
      </nav>
      <div className="container">
        <section className="hero">
          <div>
            <h1>Privacy Policy</h1>
            <p>
              This page is a starting draft. Update it with your full legal text
              before publishing the app.
            </p>
          </div>
          <div className="hero-card">
            <div className="grid">
              {sections.map((section) => (
                <div className="card" key={section.title}>
                  <h3>{section.title}</h3>
                  <p>{section.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>
      <footer className="footer">Contact: office@designedbypo.com</footer>
    </main>
  );
}
