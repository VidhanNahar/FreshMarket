import Form from "next/form";
import Link from "next/link";
import Image from "next/image";
import { ArrowRight, Search, MapPin, ShieldCheck, Clock, Layers, Armchair, Smartphone, BookOpen, Shirt, Bike, Lamp } from "lucide-react";
import { HomeListings } from "@/components/listings/HomeListings";

const categories = [
  { path: "electronics", label: "Electronics", note: "Upgrade for less", icon: Smartphone },
  { path: "furniture", label: "Furniture", note: "Make room for character", icon: Armchair },
  { path: "fashion", label: "Fashion", note: "A fresh perspective", icon: Shirt },
  { path: "books", label: "Books", note: "Another chapter", icon: BookOpen },
  { path: "vehicles/bicycles", label: "Bicycles", note: "Find your next ride", icon: Bike },
  { path: "home", label: "Home & kitchen", note: "Everyday, reimagined", icon: Lamp },
];

export default function Home() {
  return <div>
    <section className="mx-auto grid max-w-[1440px] gap-8 px-5 py-8 sm:px-8 lg:grid-cols-[1.1fr_.9fr] lg:gap-14 lg:px-12 lg:py-14">
      <div className="flex flex-col justify-center py-4 lg:py-8">
        <p className="editorial-kicker flex items-center gap-2 text-primary"><span className="h-1.5 w-1.5 rounded-full bg-primary" />Good things deserve a second life</p>
        <h1 className="mt-7 text-[clamp(3.4rem,6.5vw,6.5rem)] font-semibold leading-[.98] tracking-[-.065em]">New to you.<br /><span className="font-serif font-normal italic text-primary">Worth finding.</span></h1>
        <p className="mt-6 max-w-md text-base leading-relaxed text-muted-foreground">Discover pre-loved pieces, everyday essentials, and unexpected finds from sellers in your city.</p>
        <Form action="/browse" className="mt-8 rounded-2xl border border-input bg-card p-2 shadow-[0_8px_30px_rgba(25,27,24,.04)]">
          <label className="flex items-center gap-3 px-3 py-3"><Search aria-hidden="true" className="h-5 w-5 shrink-0 text-primary" /><span className="sr-only">What are you looking for?</span><input name="q" type="search" placeholder="What are you looking for?" maxLength={128} className="w-full bg-transparent text-base outline-none" /></label>
          <div className="flex items-center gap-2 border-t border-border pt-2"><label className="flex flex-1 items-center gap-2 pl-3"><MapPin aria-hidden="true" className="h-4 w-4 shrink-0 text-muted-foreground" /><span className="sr-only">City</span><input name="city" placeholder="Your city (optional)" maxLength={128} className="w-full bg-transparent text-sm outline-none" /></label><button type="submit" className="flex shrink-0 items-center gap-2 whitespace-nowrap rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground transition hover:brightness-90">Find something<ArrowRight aria-hidden="true" className="h-4 w-4" /></button></div>
        </Form>
        <div className="mt-5 flex flex-wrap gap-2 text-xs text-muted-foreground"><span className="py-1">Try searching</span>{["iPhone", "Desk", "Books"].map(term => <Link key={term} href={`/browse?q=${encodeURIComponent(term)}`} className="rounded-full border border-border px-3 py-1 hover:border-primary hover:text-primary">{term} ↗</Link>)}</div>
      </div>
      <Link href="/browse?category=furniture" className="group relative isolate min-h-[360px] overflow-hidden rounded-2xl bg-[#ddd9cc] lg:min-h-[560px]" aria-label="Explore furniture listings">
        <Image src="/images/editorial-home.jpg" alt="A black reading lamp against a quiet sage wall" fill priority sizes="(max-width: 1024px) 100vw, 45vw" className="object-cover transition-transform duration-700 group-hover:scale-[1.025]" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/65 via-transparent to-black/5" />
        <span className="absolute left-6 top-6 rounded-full bg-background/95 px-4 py-2 text-xs font-semibold text-foreground">The considered home</span>
        <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-5 p-7 text-white"><div><p className="editorial-kicker text-white/80">Discover the collection</p><p className="mt-3 max-w-xs font-serif text-4xl leading-tight">A little character.<br />A whole new space.</p><p className="mt-3 text-xs text-white/80">Explore furniture & everyday finds</p></div><span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-white text-[#191b18]"><ArrowRight aria-hidden="true" className="h-5 w-5" /></span></div>
      </Link>
    </section>
    <section aria-labelledby="categories" className="mx-auto max-w-[1440px] px-5 py-9 sm:px-8 lg:px-12">
      <div className="mb-6 flex items-baseline justify-between gap-4"><h2 id="categories" className="text-xl font-semibold tracking-tight">Start with what you love.</h2><Link href="/browse" className="text-sm text-muted-foreground hover:text-primary">All categories ↗</Link></div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">{categories.map(({path,label,note,icon: Icon}) => <Link href={`/browse?category=${encodeURIComponent(path)}`} key={path} className="group rounded-2xl border border-border bg-card p-5 transition hover:border-primary hover:bg-secondary/40"><Icon aria-hidden="true" strokeWidth={1.3} className="mb-6 h-8 w-8 text-primary transition-transform group-hover:-translate-y-1" /><h3 className="text-sm font-semibold">{label}</h3><p className="mt-1 text-xs leading-relaxed text-muted-foreground">{note}</p></Link>)}</div>
    </section>
    <HomeListings />
    <section className="border-y editorial-rule bg-secondary/35"><div className="mx-auto grid max-w-[1440px] gap-10 px-5 py-12 sm:px-8 md:grid-cols-3 lg:px-12">{[
      {icon: ShieldCheck,title:"A seller behind every listing.",text:"See the seller’s wallet and verified ENS identity when available. Ownership is public; reputation is yours to assess."},
      {icon: Clock,title:"Less stale. More relevant.",text:"Listings expire unless their sellers renew them. Check availability and the remaining lifetime before buying."},
      {icon: Layers,title:"Your finds, beyond one storefront.",text:"The same public listings can appear in independent storefronts. Discover another perspective in SECOND LOOK."},
    ].map(({icon: Icon,title,text}) => <div key={title}><Icon aria-hidden="true" className="mb-4 h-6 w-6 text-primary" strokeWidth={1.5} /><h2 className="font-semibold">{title}</h2><p className="mt-3 text-sm leading-relaxed text-muted-foreground">{text}</p></div>)}</div></section>
    <section className="mx-auto grid max-w-[1440px] gap-6 px-5 py-16 sm:px-8 md:grid-cols-2 md:items-center lg:px-12"><div><p className="editorial-kicker text-primary">Built on open foundations</p><h2 className="mt-4 text-3xl font-semibold tracking-tight">The listing belongs to its seller.</h2></div><div><p className="text-sm leading-relaxed text-muted-foreground">Underneath the marketplace, Arkiv Rabdi stores wallet-owned listings with public availability and expiration. Browse freely, or connect a wallet to sell. This project runs on test networks.</p><Link href="/storefront" className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-primary">Explore SECOND LOOK<ArrowRight aria-hidden="true" className="h-4 w-4" /></Link></div></section>
  </div>;
}
