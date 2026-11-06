import Link from "next/link";

export function PageHeader({ eyebrow, title, description, backHref = "/browse", backLabel = "Back to marketplace" }: {
  eyebrow: string; title: string; description: string; backHref?: string; backLabel?: string;
}) {
  return <header className="mb-8 space-y-4 border-b editorial-rule pb-8">
    <Link href={backHref} className="inline-block text-sm text-muted-foreground transition hover:text-primary">← {backLabel}</Link>
    <p className="editorial-kicker text-primary">{eyebrow}</p>
    <h1 className="text-4xl font-semibold tracking-[-.05em] sm:text-5xl">{title}</h1>
    <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">{description}</p>
  </header>;
}
