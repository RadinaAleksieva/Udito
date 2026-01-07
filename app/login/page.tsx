import TopNav from "../components/top-nav";
import LoginForm from "./login-form";

export const dynamic = "force-dynamic";

export default function LoginPage() {
  return (
    <main>
      <TopNav title="Вход" />
      <div className="container">
        <section className="hero">
          <div>
            <h1>Вход с код за достъп</h1>
            <p>
              Използвайте инстанс ID на магазина, за да влезете без Wix акаунт.
            </p>
          </div>
        </section>
        <LoginForm />
      </div>
      <footer className="footer">UDITO от Designs by Po.</footer>
    </main>
  );
}
