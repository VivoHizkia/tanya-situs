// Changes the plan of an account, for example after a customer has paid:
//
//   npm run plan -- someone@example.com pro
//
// With DATABASE_URL set this talks to the production database. Without it, it opens the local
// development database, which only works while `npm run dev` is not running.

import { getDb } from "../src/lib/db/client";
import { isPlanName, PLANS } from "../src/lib/limits";
import { setPlan } from "../src/lib/store";

async function main() {
  const [email, plan] = process.argv.slice(2);
  if (!email || !plan || !isPlanName(plan)) {
    console.error(`Usage: npm run plan -- <email> <${Object.keys(PLANS).join("|")}>`);
    process.exit(1);
  }

  const changed = await setPlan(await getDb(), email.toLowerCase(), plan);
  if (!changed) {
    console.error(`No account with the email ${email}.`);
    process.exit(1);
  }
  console.log(`${email} is now on the ${plan} plan.`);
  process.exit(0);
}

void main();
