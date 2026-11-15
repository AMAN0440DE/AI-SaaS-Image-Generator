import { clerkPricingAppearance } from "@/lib/clerk-pricing-appearence";
import { PricingTable } from "@clerk/nextjs";

const plans = [
  { name: "Free", price: "$0", generations: "3 image generations per month" },
  { name: "Pro", price: "$19", generations: "75 image generations per month" },
  { name: "Studio", price: "$29", generations: "175 image generations per month" },
] as const;

export function PricingSection() {
  const billingEnabled = process.env.NEXT_PUBLIC_CLERK_BILLING_ENABLED === "true";

  return (
    <section id="pricing" className="section-shell mt-6 px-5 py-16 sm:px-8 sm:py-20 lg:px-12">
      <div className="mx-auto max-w-6xl">
        <div className="mb-10 text-center">
          <p className="caps-sm text-sm font-semibold uppercase text-primary">Pricing</p>
          <h2 className="mt-3 font-serif text-3xl tracking-tight text-foreground sm:text-4xl">
            Simple plans for every creator
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-base text-muted-foreground sm:text-lg">
            Pick Free, Pro, or Studio. Upgrade or change anytime from your account.
          </p>
        </div>

        <div className="w-full rounded-[1.75rem] border border-border/60 bg-card/40 p-4 sm:p-6 lg:p-8">
          {billingEnabled ? (
            <PricingTable for="user" appearance={clerkPricingAppearance} />
          ) : (
            <>
              <div className="grid gap-4 md:grid-cols-3">
                {plans.map((plan) => (
                  <article
                    key={plan.name}
                    className="rounded-2xl border border-border/60 bg-background/60 p-6"
                  >
                    <h3 className="text-lg font-semibold text-foreground">{plan.name}</h3>
                    <p className="mt-4 text-3xl font-semibold text-foreground">
                      {plan.price}
                      <span className="ml-1 text-sm font-normal text-muted-foreground">
                        / month
                      </span>
                    </p>
                    <p className="mt-3 text-sm text-muted-foreground">{plan.generations}</p>
                  </article>
                ))}
              </div>
              <p className="mt-6 text-center text-sm text-muted-foreground">
                Subscription checkout will be available when Clerk Billing is enabled.
              </p>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
