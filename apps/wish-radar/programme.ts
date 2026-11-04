// Dedicated Broadcast & TTS Script Generator for Wish Radar
// Produces radio and Watch programmes with presenter delivery directions,
// music cues, theme beds, product pictures, figure tiles, charts, and a live crawling ticker.
// Pure, deterministic, zero external network dependencies.

import type { Wish, WishSummary, LedgerData, State, ChartPoint } from './server.ts';
import { formatInr } from './server.ts';

export type Delivery = 'opening' | 'headline' | 'story' | 'aside' | 'closing';
export type Cue = 'intro' | 'sting' | 'outro';
export type Break = 'short' | 'story' | 'section';

export interface ProgrammeFigure {
  label: string;
  value: string;
  change?: number;
}

export interface ProgrammeChart {
  kind: 'line' | 'bars';
  title?: string;
  unit?: string;
  points?: number[];
  labels?: [string, string];
  base?: number;
  bars?: { label: string; value: number }[];
}

export interface ProgrammeSegment {
  text: string;
  delivery: Delivery;
  cue?: Cue;
  break?: Break;
  bed?: true;
  breaking?: true;
  kicker: string;
  heading: string;
  source?: string;
  image?: string;
  link?: string;
  at?: string;
  figures?: ProgrammeFigure[];
  chart?: ProgrammeChart;
}

export interface TickerItem {
  text: string;
  kicker?: string;
  link?: string;
  at?: string;
  fresh?: true;
  change?: number;
}

export interface Programme {
  title: string;
  badge?: string;
  segments: ProgrammeSegment[];
  ticker?: TickerItem[];
}

/** Converts integer paise to natural spoken Indian Rupee copy for the ear. */
export function spokenRupees(paise: number): string {
  const r = Math.abs(paise) / 100;
  if (r >= 1e7) {
    const cr = (r / 1e7).toLocaleString('en-IN', { maximumFractionDigits: 2 });
    return `${cr} crore rupees`;
  }
  if (r >= 1e5) {
    const lk = (r / 1e5).toLocaleString('en-IN', { maximumFractionDigits: 2 });
    return `${lk} lakh rupees`;
  }
  return `${Math.round(r).toLocaleString('en-IN')} rupees`;
}

/** Formats date in natural broadcast speech: e.g. "Monday, 2 November". */
export function broadcastDate(d: Date): string {
  return d.toLocaleDateString('en-GB', {
    timeZone: 'Asia/Kolkata',
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
}

/** Time-of-day greeting in Asia/Kolkata timezone. */
export function timeGreeting(d: Date): string {
  const hour = Number(
    d.toLocaleString('en-GB', { timeZone: 'Asia/Kolkata', hour: '2-digit', hour12: false })
  );
  if (hour < 5) return 'Good evening';
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

/** Trims unnecessary seller marketing copy from product titles for smooth spoken narration. */
export function cleanTitle(title: string): string {
  return title
    .replace(/\s*[|–—(].*$/g, '')
    .replace(/\b(?:with|for|by|in)\s+.*$/i, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 50);
}

/**
 * Builds the complete Wish Radar audio-visual broadcast programme.
 * Includes intro theme, headline deals over the steady theme bed, transition sting,
 * store comparison breakdown with figure tiles & charts, and a live crawling ticker.
 */
export function generateProgramme(s: State, l: LedgerData, now = new Date()): Programme {
  const title = 'Wish Radar Broadcast';
  const wishes = s.wishes ?? [];
  const dateStr = broadcastDate(now);
  const greeting = timeGreeting(now);

  if (!wishes.length) {
    return {
      title,
      badge: 'Empty Wishlist',
      segments: [
        {
          text: `${greeting}. This is your Wish Radar shopping bulletin for ${dateStr}. You are not tracking any wishes yet. Add your favourite products or paste an offer in Wish Radar to monitor price drops, delivery speeds and store comparisons.`,
          delivery: 'opening',
          cue: 'intro',
          kicker: 'Welcome',
          heading: 'Wish Radar is ready',
        },
        {
          text: 'Open the Overview surface to add your first wish or import your shopping list. Thanks for listening.',
          delivery: 'closing',
          cue: 'outro',
          kicker: 'Wish Radar',
          heading: 'Add your wishes to begin',
        },
      ],
      ticker: [
        { text: 'Wish Radar is ready. Add items with target prices in INR to monitor price drops across Indian stores.' },
      ],
    };
  }

  const segments: ProgrammeSegment[] = [];
  const ticker: TickerItem[] = [];
  const deals = l.summaries.filter((sm) => sm.status === 'target_met');
  const badge = deals.length > 0 ? `Live · ${deals.length} Deal${deals.length > 1 ? 's' : ''}` : 'Radar Active';

  // --- 1. Opening Segment (Intro music cue) ---------------------------------------
  let openingSummary = `We are currently monitoring ${wishes.length} item${wishes.length > 1 ? 's' : ''} across Indian merchants.`;
  if (deals.length > 0) {
    openingSummary += ` Great news today: ${deals.length} of your tracked item${deals.length > 1 ? 's have' : ' has'} met your target price, with total potential savings of ${spokenRupees(l.totalSavingsPaise)}.`;
  } else {
    openingSummary += ' All prices are currently above your target thresholds. We will keep watch for upcoming festival sales.';
  }

  segments.push({
    text: `${greeting}. Here is your Wish Radar shopping briefing for ${dateStr}. ${openingSummary}`,
    delivery: 'opening',
    cue: 'intro',
    break: 'short',
    kicker: 'Wish Radar',
    heading: `Briefing · ${dateStr}`,
    figures: [
      { label: 'Tracked Items', value: String(wishes.length) },
      { label: 'Active Deals', value: String(deals.length), change: deals.length > 0 ? 1 : 0 },
      { label: 'Potential Savings', value: formatInr(l.totalSavingsPaise) },
    ],
  });

  // --- 2. Headline Deals (Music bed, pulsing Deal Alert banner) ---------------------
  let isFirstStory = true;
  for (const sm of deals) {
    const wish = sm.wish;
    const priceSaid = sm.latestPricePaise != null ? spokenRupees(sm.latestPricePaise) : 'unknown price';
    const targetSaid = wish.targetPaise != null ? spokenRupees(wish.targetPaise) : '';
    const savingsSaid = spokenRupees(sm.savingsPaise);
    const shortTitle = cleanTitle(wish.title);

    let dealSpoken = `Deal alert on ${shortTitle}. It is currently available on ${sm.latestStore} for ${priceSaid}, beating your target of ${targetSaid} with instant savings of ${savingsSaid}.`;
    if (sm.rating) {
      dealSpoken += ` Customer rating stands at ${sm.rating} stars.`;
    }
    if (sm.deliveryInfo) {
      dealSpoken += ` Estimated delivery is ${sm.deliveryInfo}.`;
    }
    if (sm.latestOffer) {
      dealSpoken += ` Offer note: ${sm.latestOffer}.`;
    }

    segments.push({
      text: dealSpoken,
      delivery: 'headline',
      bed: true,
      breaking: true,
      cue: isFirstStory ? 'sting' : undefined,
      break: 'short',
      kicker: 'Deal Alert',
      heading: `${wish.title} at ${formatInr(sm.latestPricePaise ?? 0)}`,
      source: sm.latestStore,
      image: wish.image,
      link: wish.url,
      figures: [
        { label: 'Current Price', value: formatInr(sm.latestPricePaise ?? 0), change: -10 },
        { label: 'Target Price', value: wish.targetPaise != null ? formatInr(wish.targetPaise) : '—' },
        { label: 'You Save', value: formatInr(sm.savingsPaise), change: 10 },
        ...(sm.rating ? [{ label: 'Store Rating', value: `${sm.rating} / 5` }] : []),
      ],
    });

    isFirstStory = false;
  }

  // --- 3. Story Segments: Cross-Store Comparisons ----------------------------------
  const multiStoreSummaries = l.summaries.filter((sm) => sm.storeComparisons.length > 1);
  for (const sm of multiStoreSummaries.slice(0, 3)) {
    const wish = sm.wish;
    const shortTitle = cleanTitle(wish.title);
    const cheapest = sm.cheapestStore || 'Amazon.in';
    const cheapestPrice = sm.cheapestPaise != null ? spokenRupees(sm.cheapestPaise) : '';
    const otherStore = sm.storeComparisons.find((sc) => sc.store !== cheapest);
    const spread = otherStore && sm.cheapestPaise != null ? spokenRupees(otherStore.pricePaise - sm.cheapestPaise) : '';

    let compareSpoken = `Cross-merchant comparison for ${shortTitle}. `;
    if (cheapest && cheapestPrice) {
      compareSpoken += `${cheapest} offers the lowest price at ${cheapestPrice}. `;
      if (otherStore && spread) {
        compareSpoken += `This is ${spread} cheaper than ${otherStore.store}. `;
      }
    }
    if (sm.deliveryInfo) {
      compareSpoken += `Delivery to PIN ${sm.pincode || s.pincode || '560001'} is ${sm.deliveryInfo}.`;
    }

    const barPoints = sm.storeComparisons.map((sc) => ({
      label: sc.store,
      value: sm.cheapestPaise ? Math.round(((sc.pricePaise - sm.cheapestPaise) / sm.cheapestPaise) * 100) : 0,
    }));

    segments.push({
      text: compareSpoken,
      delivery: 'story',
      break: 'section',
      cue: isFirstStory ? 'sting' : undefined,
      kicker: 'Store Comparison',
      heading: `${wish.title} across ${sm.storeComparisons.length} merchants`,
      source: cheapest,
      image: wish.image,
      link: wish.url,
      figures: [
        { label: 'Lowest Store', value: cheapest },
        { label: 'Best Price', value: formatInr(sm.cheapestPaise ?? 0), change: -5 },
        ...(sm.rating ? [{ label: 'Rating', value: `${sm.rating} / 5` }] : []),
      ],
      chart: barPoints.length >= 2 ? { kind: 'bars', title: 'Price spread vs lowest seller', unit: '%', bars: barPoints } : undefined,
    });

    isFirstStory = false;
  }

  // --- 4. Historical Trend Deep Dive (if active wish selected) ----------------------
  if (l.selectedWishSummary && (l.selectedChartRecords?.length ?? 0) >= 3) {
    const sel = l.selectedWishSummary;
    const points = l.selectedChartRecords.map((r) => r.price);
    const labels: [string, string] = [l.selectedChartRecords[0]!.date, l.selectedChartRecords.at(-1)!.date];
    const targetVal = sel.wish.targetPaise != null ? sel.wish.targetPaise / 100 : undefined;
    const shortTitle = cleanTitle(sel.wish.title);
    const targetSpoken = sel.wish.targetPaise != null
      ? `, plotted against your ${spokenRupees(sel.wish.targetPaise)} target threshold.`
      : ' across your recorded observation history.';

    segments.push({
      text: `Looking at historical price movements for ${shortTitle}. Recorded observations range from an all-time low of ${spokenRupees(sel.minPricePaise ?? 0)} to a peak of ${spokenRupees(sel.maxPricePaise ?? 0)}${targetSpoken}`,
      delivery: 'story',
      break: 'section',
      cue: isFirstStory ? 'sting' : undefined,
      kicker: 'Price history',
      heading: `${sel.wish.title} trend`,
      source: sel.latestStore,
      image: sel.wish.image,
      figures: [
        { label: 'All-Time Low', value: formatInr(sel.minPricePaise ?? 0) },
        { label: 'Latest Check', value: formatInr(sel.latestPricePaise ?? 0) },
        { label: 'Your Target', value: sel.wish.targetPaise != null ? formatInr(sel.wish.targetPaise) : '—' },
      ],
      chart: {
        kind: 'line',
        title: `${shortTitle} price trend (INR)`,
        points,
        labels,
        base: targetVal,
      },
    });

    isFirstStory = false;
  }

  // --- 5. Market Timing & Sale Strategy --------------------------------------------
  segments.push({
    text: 'Shopping strategy advice. In Indian e-commerce, the deepest discounts occur during major festival windows including Diwali, the Amazon Great Indian Festival, Flipkart Big Billion Days, and seasonal brand sales. If an item has not met your target price, our recommendation is to hold off until the next seasonal promotional window.',
    delivery: 'aside',
    break: 'story',
    kicker: 'Shopping Strategy',
    heading: 'Seasonal Sales & Timing Advice',
  });

  // --- 6. Closing Segment (Outro music cue) -----------------------------------------
  segments.push({
    text: `That concludes your Wish Radar shopping briefing for ${dateStr}. All price points and observations are stored privately on your computer. Thanks for listening.`,
    delivery: 'closing',
    cue: 'outro',
    break: 'section',
    kicker: 'Wish Radar',
    heading: 'Private Local Price Ledger',
  });

  // --- 7. Live Crawling Ticker ------------------------------------------------------
  for (const sm of l.summaries) {
    const pStr = sm.latestPricePaise != null ? formatInr(sm.latestPricePaise) : 'No check';
    const isDeal = sm.status === 'target_met';
    const targetText = sm.wish.targetPaise != null ? ` (Target: ${formatInr(sm.wish.targetPaise)})` : '';
    const tickerText = `${sm.wish.title}: ${pStr} on ${sm.latestStore}${targetText}${sm.rating ? ` · Rating: ${sm.rating} / 5` : ''}${sm.deliveryInfo ? ` · ${sm.deliveryInfo}` : ''}`;

    ticker.push({
      text: tickerText,
      kicker: isDeal ? 'DEAL' : sm.wish.category,
      link: sm.wish.url,
      at: sm.latestDate ?? undefined,
      fresh: isDeal ? true : undefined,
      change: isDeal ? -10 : (sm.status === 'price_rose' ? 10 : 0),
    });
  }

  for (const obs of l.recentObservations.slice(0, 15)) {
    ticker.push({
      text: `${obs.wishTitle} checked at ${formatInr(obs.pricePaise)} on ${obs.store} (${obs.recordedAt.slice(0, 10)})`,
      kicker: 'CHECK',
      at: obs.recordedAt,
    });
  }

  return {
    title,
    badge,
    segments,
    ticker: ticker.slice(0, 40),
  };
}

/** Formats the programme into a comprehensive studio production TTS script. */
export function formatBroadcastScript(prog: Programme): string {
  const lines: string[] = [];
  lines.push(`# ${prog.title} · Audio-Visual Production Script`);
  lines.push(`**Broadcast Badge:** ${prog.badge || 'Standard'}`);
  lines.push(`**Total Broadcast Segments:** ${prog.segments.length}`);
  lines.push(`**Live Ticker Items:** ${prog.ticker?.length ?? 0}`);
  lines.push('');
  lines.push('---');
  lines.push('');

  prog.segments.forEach((seg, i) => {
    const cueTag = seg.cue ? ` · CUE: [${seg.cue.toUpperCase()}]` : '';
    const bedTag = seg.bed ? ' · [THEME BED UNDER PRESENTER]' : '';
    const breakTag = seg.break ? ` · BREAK: ${seg.break}` : '';
    const alertTag = seg.breaking ? ' · [BREAKING DEAL]' : '';

    lines.push(`### Segment ${i + 1}: ${seg.kicker} [${seg.delivery.toUpperCase()}]${cueTag}${bedTag}${alertTag}${breakTag}`);
    lines.push(`**On-Screen Heading:** ${seg.heading}`);
    if (seg.source) lines.push(`**Merchant Source:** ${seg.source}`);
    if (seg.image) lines.push(`**Product Thumbnail:** ${seg.image}`);

    if (seg.figures && seg.figures.length > 0) {
      const figStr = seg.figures.map((f) => `${f.label}: ${f.value}${f.change !== undefined ? ` (${f.change > 0 ? '+' : ''}${f.change}%)` : ''}`).join(' | ');
      lines.push(`**Watch Figure Tiles:** ${figStr}`);
    }

    if (seg.chart) {
      lines.push(`**Watch Dynamic Chart:** ${seg.chart.kind.toUpperCase()} - ${seg.chart.title || 'Chart'}`);
    }

    lines.push('');
    lines.push(`> "${seg.text}"`);
    lines.push('');
  });

  if (prog.ticker && prog.ticker.length > 0) {
    lines.push('---');
    lines.push('### Live Crawling Broadcast Ticker (Bottom of Watch Frame)');
    prog.ticker.forEach((item, idx) => {
      lines.push(`${idx + 1}. [${item.kicker || 'ITEM'}] ${item.text}`);
    });
  }

  return lines.join('\n');
}
