import Link from "next/link";
import { SiteHeader } from "@/components/SiteHeader";
import { PLANS } from "@/lib/limits";

const STEPS = [
  {
    title: "Give it your pages",
    text: "Type your website address and pick the pages that matter: prices, services, opening hours, contact. They are read in about a minute.",
  },
  {
    title: "Paste one line of code",
    text: "A chat button appears in the corner of your site. It works with WordPress, Shopify, Wix, or plain HTML.",
  },
  {
    title: "Read your inbox",
    text: "Visitors who want to order or book leave their name and number. Questions your site could not answer are listed, so you know what to add.",
  },
];

const PROMISES = [
  {
    title: "It only says what your site says",
    text: "Every answer links to the page it came from. A price that is not on your pages is never shown: that check runs in code, after the AI has answered.",
  },
  {
    title: "“I don't know” is an answer",
    text: "When your pages do not cover a question, the chatbot says so and offers to pass the visitor on to you, instead of making something up.",
  },
  {
    title: "Visitors ask in their own language",
    text: "Your pages can be in Indonesian and the question in English, or the other way round. The answer comes back in the visitor's language.",
  },
];

export default function HomePage() {
  const contactUrl = process.env.CONTACT_URL;

  return (
    <>
      <SiteHeader />
      <main>
        <section className="hero">
          <p className="eyebrow">Website chatbot for small businesses</p>
          <h1>Your website already has the answers. Let it give them at 2 a.m.</h1>
          <p className="hero__lead">
            Tanya Situs reads your own pages and answers visitors from them, with a link to the
            source. When it cannot answer, it takes their number for you.
          </p>
          <div className="button-row">
            <Link className="button button--large" href="/signup">
              Start free
            </Link>
            <a className="button button--quiet button--large" href="#how">
              How it works
            </a>
          </div>
        </section>

        <section className="band" id="how" aria-labelledby="how-title">
          <h2 id="how-title">Live on your site in three steps</h2>
          <ol className="steps">
            {STEPS.map((step) => (
              <li key={step.title}>
                <h3>{step.title}</h3>
                <p>{step.text}</p>
              </li>
            ))}
          </ol>
        </section>

        <section className="band band--tint" aria-labelledby="trust-title">
          <h2 id="trust-title">Built so you can trust it with customers</h2>
          <ul className="promises">
            {PROMISES.map((promise) => (
              <li key={promise.title}>
                <h3>{promise.title}</h3>
                <p>{promise.text}</p>
              </li>
            ))}
          </ul>
        </section>

        <section className="band" aria-labelledby="plans-title">
          <h2 id="plans-title">Plans</h2>
          <div className="plans">
            <article className="card plan">
              <h3>Free</h3>
              <ul>
                <li>{PLANS.free.bots} chatbot</li>
                <li>{PLANS.free.pagesPerBot} pages</li>
                <li>{PLANS.free.messagesPerMonth} messages a month</li>
                <li>Leads and unanswered questions</li>
              </ul>
              <Link className="button" href="/signup">
                Start free
              </Link>
            </article>
            <article className="card plan">
              <h3>Pro</h3>
              <ul>
                <li>{PLANS.pro.bots} chatbots</li>
                <li>{PLANS.pro.pagesPerBot} pages each</li>
                <li>{PLANS.pro.messagesPerMonth.toLocaleString("en")} messages a month</li>
                <li>Set up for you on request</li>
              </ul>
              {contactUrl ? (
                <a className="button button--quiet" href={contactUrl}>
                  Ask for Pro
                </a>
              ) : (
                <p className="muted">Start free and upgrade when you need more.</p>
              )}
            </article>
          </div>
        </section>
      </main>
      <footer className="site-footer">
        <p>Tanya Situs reads only the pages you add and obeys each site's robots.txt.</p>
      </footer>
    </>
  );
}
