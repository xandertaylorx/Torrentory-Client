import { useEffect, useState } from "react";
import { ArrowUpRight } from "lucide-react";
import { Link } from "./router";
import { Markdown, REPO } from "./Markdown";
import { PageHeading } from "./Layout";

const RAW = "https://raw.githubusercontent.com/xandertaylorx/Torrentory-Client/main";
const API = "https://api.github.com/repos/xandertaylorx/Torrentory-Client";

type Loaded<T> = { status: "loading" } | { status: "error" } | { status: "ok"; data: T };

function useRemote<T>(url: string, parse: (response: Response) => Promise<T>): Loaded<T> {
  const [state, setState] = useState<Loaded<T>>({ status: "loading" });
  useEffect(() => {
    const controller = new AbortController();
    setState({ status: "loading" });
    fetch(url, { signal: controller.signal })
      .then(response => { if (!response.ok) throw new Error(String(response.status)); return parse(response); })
      .then(data => setState({ status: "ok", data }))
      .catch(error => { if (error?.name !== "AbortError") setState({ status: "error" }); });
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url]);
  return state;
}

function Status({ state, fallbackHref, fallbackLabel }: { state: Loaded<unknown>; fallbackHref: string; fallbackLabel: string }) {
  if (state.status === "loading") return <p className="text-sm text-[var(--faint)]" role="status">Loading from GitHub…</p>;
  return <p className="text-sm text-[var(--muted)]">Could not load this right now. <a href={fallbackHref} className="underline underline-offset-4">{fallbackLabel}</a>.</p>;
}

/* Security and license: rendered live from the repository files. */
export function DocPage({ file, title, eyebrow, intro, plain = false }: { file: string; title: string; eyebrow: string; intro: string; plain?: boolean }) {
  const state = useRemote(`${RAW}/${file}`, response => response.text());
  return <>
    <PageHeading eyebrow={eyebrow} title={title}>{intro}</PageHeading>
    <div className="mx-auto grid max-w-[1080px] gap-10 px-6 pb-28 lg:grid-cols-[220px_1fr] lg:gap-16">
      <aside className="text-xs leading-6 text-[var(--muted)] lg:sticky lg:top-8 lg:self-start">
        <p>Read live from <span className="mono text-[var(--fg)]">{file}</span> in the repository, so it is always the current version.</p>
        <a href={`${REPO}/blob/main/${file}`} className="mt-3 inline-flex items-center gap-1 underline underline-offset-4 hover:text-[var(--fg)]">View on GitHub <ArrowUpRight size={12} /></a>
      </aside>
      <div className="min-w-0 max-w-[680px]">
        {state.status === "ok"
          ? plain ? <pre className="whitespace-pre-wrap text-[13px] leading-6 text-[var(--muted)] [font-family:var(--font-mono)]">{state.data}</pre> : <Markdown source={state.data.replace(/^\s*#\s+.*\n/, "")} />
          : <Status state={state} fallbackHref={`${REPO}/blob/main/${file}`} fallbackLabel={`Read ${file} on GitHub`} />}
      </div>
    </div>
  </>;
}

/* Releases: every GitHub release with its full notes and installers. */
interface Asset { name: string; size: number; browser_download_url: string }
interface Release { id: number; tag_name: string; name: string | null; body: string | null; published_at: string | null; prerelease: boolean; draft: boolean; html_url: string; assets: Asset[] }

const mb = (bytes: number) => bytes >= 1048576 ? `${(bytes / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
const day = (iso: string | null) => iso ? new Date(iso).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }) : "";
const shown = (asset: Asset) => !/\.(sig|json|tar\.gz)$/i.test(asset.name);

export function ReleasesPage() {
  const state = useRemote<Release[]>(`${API}/releases?per_page=50`, response => response.json());
  const releases = state.status === "ok" ? state.data.filter(release => !release.draft) : [];
  return <>
    <PageHeading eyebrow="Releases" title="Every version, in full.">Release notes and installers for every Torrentory release, straight from GitHub.</PageHeading>
    <div className="mx-auto max-w-[1080px] px-6 pb-28">
      {state.status !== "ok" && <Status state={state} fallbackHref={`${REPO}/releases`} fallbackLabel="See all releases on GitHub" />}
      {state.status === "ok" && releases.length === 0 && <p className="text-sm text-[var(--muted)]">No releases yet.</p>}
      {releases.map((release, index) => (
        <article key={release.id} id={release.tag_name} className="rule grid scroll-mt-6 gap-6 py-12 md:grid-cols-[200px_1fr] md:gap-16">
          <div className="md:sticky md:top-8 md:self-start">
            <h2 className="text-2xl font-semibold tracking-[-.04em]">{release.tag_name}</h2>
            <p className="mt-1.5 text-xs text-[var(--muted)]">{day(release.published_at)}</p>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {index === 0 && !release.prerelease && <span className="rounded-full bg-[var(--fg)] px-2 py-0.5 text-[11px] font-medium text-[var(--bg)]">Latest</span>}
              {release.prerelease && <span className="rounded-full border border-[var(--line)] px-2 py-0.5 text-[11px] text-[var(--muted)]">Pre-release</span>}
            </div>
            <a href={release.html_url} className="mt-4 inline-flex items-center gap-1 text-xs text-[var(--muted)] underline underline-offset-4 hover:text-[var(--fg)]">On GitHub <ArrowUpRight size={12} /></a>
          </div>
          <div className="min-w-0 max-w-[680px]">
            {release.name && release.name !== release.tag_name && <p className="mb-5 text-lg font-medium tracking-[-.02em]">{release.name}</p>}
            {release.body ? <Markdown source={release.body} /> : <p className="text-sm text-[var(--muted)]">No notes for this release.</p>}
            {release.assets.some(shown) && (
              <div className="mt-8 divide-y divide-[var(--line)] rounded-lg border border-[var(--line)] bg-[var(--panel)] text-sm">
                {release.assets.filter(shown).map(asset => (
                  <a key={asset.name} href={asset.browser_download_url} className="flex items-center justify-between gap-4 px-4 py-3 hover:bg-[var(--soft)]"><span className="min-w-0 truncate">{asset.name}</span><span className="flex shrink-0 items-center gap-2 text-xs text-[var(--faint)]">{mb(asset.size)} <ArrowUpRight size={14} className="text-[var(--muted)]" /></span></a>
                ))}
              </div>
            )}
          </div>
        </article>
      ))}
    </div>
  </>;
}

/* Legal: plain-language terms. */
const statements: { title: string; body: string }[] = [
  { title: "Torrentory is a tool. What you do with it is on you.", body: "Torrentory is a content-neutral BitTorrent client. It does not host, index, search or recommend any content, and this website has no catalogue. Use it only for content you are authorised to download, share or distribute. Copyright law differs between countries, and knowing the rules where you live is your responsibility." },
  { title: "We can't see your downloads.", body: "The app has no accounts, no telemetry and no remote-control API. Torrent traffic goes directly between you and other peers, and nothing about what you download is sent to us. As with any BitTorrent client, the peers and trackers you connect to can see your IP address." },
  { title: "No warranty. Really.", body: "Torrentory is released under the MIT License and provided “as is”, without warranty of any kind. You use it at your own risk. The full licence text is on the license page." },
  { title: "Honest about signing.", body: "The macOS build is Developer ID signed but not notarised. Windows installers are not Authenticode signed. In-app updates are verified against an update key built into the app, and every release publishes SHA-256 checksums so you can verify downloads yourself." },
  { title: "This website keeps nothing.", body: "No cookies, no analytics, no accounts and no forms. Pages load fonts from Google Fonts and release information and documents from GitHub, which can see your IP address as part of those requests. Downloads are served by GitHub Releases." },
  { title: "Other names belong to other people.", body: "Product and company names mentioned here, such as macOS, Windows, Apple and GitHub, belong to their owners. Torrentory is not affiliated with or endorsed by them. Comparisons on this site describe typical freemium clients in general and do not refer to any one product." },
  { title: "Found a problem?", body: "For security issues, read the security page first and keep private data out of public reports. For anything else, open an issue on GitHub." },
];

export function LegalPage() {
  return <>
    <PageHeading eyebrow="Legal" title="The fine print, minus the fine print.">What Torrentory is, what it is not, and where responsibility sits. This page is general information, not legal advice.</PageHeading>
    <div className="mx-auto max-w-[1080px] px-6">
      <ul className="flex flex-wrap gap-2 pb-14 text-xs">
        {["Open source", "No telemetry", "No accounts", "Content-neutral"].map(tag => <li key={tag} className="rounded-full border border-[var(--line)] px-3 py-1 text-[var(--muted)]">{tag}</li>)}
      </ul>
    </div>
    <div className="mx-auto max-w-[1080px] px-6">
      {statements.map(({ title, body }, index) => (
        <section key={title} className="rule group grid gap-4 py-10 md:grid-cols-[110px_1.1fr_1fr] md:gap-10 md:py-14">
          <span aria-hidden="true" className="select-none text-6xl font-semibold tracking-[-.06em] text-transparent transition-colors [-webkit-text-stroke:1px_var(--faint)] group-hover:text-[var(--soft)] md:text-7xl">{String(index + 1).padStart(2, "0")}</span>
          <h2 className="text-2xl leading-[1.15] font-semibold tracking-[-.04em] sm:text-3xl">{title}</h2>
          <p className="text-sm leading-7 text-[var(--muted)] md:pt-1.5">{body}</p>
        </section>
      ))}
    </div>
    <div className="rule">
      <div className="mx-auto grid max-w-[1080px] gap-4 px-6 py-16 sm:grid-cols-3">
        {[["/license", "MIT License", "The full licence text."], ["/security", "Security", "How the app is protected."], ["/releases", "Releases", "Every version and checksum."]].map(([href, label, hint]) => (
          <Link key={href} href={href} className="group rounded-lg border border-[var(--line)] bg-[var(--panel)] p-5 hover:border-[color-mix(in_srgb,var(--line)_50%,var(--fg))]"><span className="flex items-center justify-between text-sm font-medium">{label} <ArrowUpRight size={15} className="text-[var(--muted)] transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" /></span><span className="mt-1 block text-xs text-[var(--muted)]">{hint}</span></Link>
        ))}
      </div>
    </div>
  </>;
}
