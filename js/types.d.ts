/**
 * Shared type definitions for the WhatsApp Wrapped client.
 * Imported via JSDoc:  `\@import('./types.d.ts').Message`
 */

export interface Message {
    datetime: Date;
    author: string;
    /** Empty for a deleted message: the tombstone is not what anyone wrote. */
    message: string;
    msgLen: number;
    /** WhatsApp's own messages (Meta AI, service notices). */
    isSystem: boolean;
    isMedia: boolean;
    isEdited: boolean;
    isDeleted: boolean;
    isPoll: boolean;
    isReaction: boolean;
    reactionEmoji?: string;
}

export interface PerPerson {
    count: number;
    percent: string;
    media: number;
    edited: number;
    deleted: number;
    emojis: number;
    links: number;
    totalChars: number;
    avgLen: number;
    nightMsgs: number;
    morningMsgs: number;
    avgResponseMin: number | null;
    peakHour: number;
    topEmoji: [string, number] | null;
    topDomain: [string, number] | null;
}

export interface Chapter {
    from: string;
    to: string;
    months: number;
    total: number;
    avgPerMonth: number;
    intensity: 'high' | 'steady' | 'low';
    ratio: number;
}

export interface Interactions {
    pairs: Array<{ a: string; b: string; count: number }>;
    closest: Record<string, { author: string; count: number }>;
    matrix: Record<string, Record<string, number>>;
}

export interface Profile {
    name: string;
    count: number;
    percent: string;
    avgLen: number;
    peakHour: number;
    emojis: number;
    topEmoji: [string, number] | null;
    media: number;
    links: number;
    topDomain: [string, number] | null;
    avgResponseMin: number | null;
    initiations: number;
    signatureWord: [string, number] | null;
    nightMsgs: number;
    morningMsgs: number;
}

export interface MediaTypes {
    images: number;
    gifs: number;
    stickers: number;
    videos: number;
    audio: number;
    documents: number;
    links: number;
}

export interface Ghost {
    silenced: string;
    revived: string;
    minutes: number;
    when: Date;
}

export interface Compatibility {
    score: number;
    components: {
        lengthSimilarity: number;
        volumeBalance: number;
        reciprocity: number;
        consistency: number;
    };
}

export interface SentimentResult {
    mlEnabled: boolean;
    device: string | null;
    ironyModel: boolean;
    perPerson: Array<{
        author: string;
        pos: number; neg: number;
        strongPos: number; strongNeg: number;
        sampled: number; sarcasmHits: number;
        intensity: number; stdDev: number;
        compliment: number; insult: number; words: number;
        rate: number;
        reactionsSent: number; reactionsSentMean: number;
        reactionsReceived: number; reactionsReceivedMean: number;
    }>;
    sweetest: any | null;
    sharpest: any | null;
    mostPositive: any | null;
    mostNegative: any | null;
    mostIntense: any | null;
    mostVolatile: any | null;
    mostStable: any | null;
    mostBeloved: any | null;
    mostExpressive: any | null;
    monthly: Record<string, number>;
    monthlyPerPerson: Record<string, Record<string, number>>;
    sentimentHourly: Array<number | null>;
    bestDays: NotableDay[];
    worstDays: NotableDay[];
    afterAuthor: Record<string, { mean: number; count: number }>;
}

export interface DayContext {
    messages: number;
    volumeRatio: number | null;
    topAuthor: { author: string; share: number } | null;
    participants: number;
    peakHour: number;
    peakHourShare: number;
    nightShare: number;
    questionShare: number;
    mediaShare: number;
    longestMessage: number;
    replyRatio: number | null;
    silenceBefore: number;
    silenceAfter: number;
    keywords: string[];
    emojis: string[];
}

export interface NotableDay {
    date: string;
    mean: number;
    count: number;
    perAuthor: Array<{ author: string; mean: number; count: number }>;
    /** Absent when the day held too little material to profile. */
    context?: DayContext;
}

export interface Stats {
    lang: string;
    startDate: Date;
    endDate: Date;
    totalDays: number;
    totalMessages: number;
    avgPerDay: string;
    totalChars: number;
    totalMedia: number;
    totalEdited: number;
    totalDeleted: number;
    totalLinks: number;
    avgMsgLen: number;
    participants: number;
    perPerson: Record<string, PerPerson>;
    ranking: Array<[string, PerPerson]>;
    hourly: number[];
    weekday: number[];
    heatmap: number[][];
    daily: Record<string, number>;
    monthly: Record<string, number>;
    monthlyPerPerson: Record<string, Record<string, number>>;
    peakHour: number;
    /** Monday = 0 — the index into the localised day names, not a label. */
    peakDayIndex: number;
    mostActiveDay: [string, number];
    topWords: Array<[string, number]>;
    topWordsPerPerson: Record<string, Array<[string, number]>>;
    uniqueWordsPerPerson: Record<string, Array<[string, number]>>;
    emojis: {
        total: number;
        unique: number;
        top: Array<[string, number]>;
        perPerson: Array<[string, number]>;
    };
    mediaTypes: MediaTypes;
    responseStats: {
        fastest: [string, number];
        slowest: [string, number];
        all: Array<[string, number]>;
    } | null;
    longestMessage: { author: string; datetime: Date | null; msgLen: number };
    streak: { max: number };
    firstMessage: { author: string; datetime: Date } | null;
    nightOwl: [string, number] | null;
    earlyBird: [string, number] | null;
    reactions: {
        total: number;
        topEmojis: Array<[string, number]>;
        perAuthor: Array<[string, number]>;
    };
    initiator: Array<[string, number]>;
    ghosting: {
        count: number;
        longest: Ghost[];
        revivers: Array<[string, number]>;
        silenced: Array<[string, number]>;
    };
    topDomains: Array<[string, number]>;
    interactions: Interactions;
    chapters: Chapter[];
    profiles: Profile[];
    sentiment: SentimentResult | null;
    compatibility: Compatibility | null;
}

export interface YearComparison {
    messages: { current: number; previous: number; pct: number | null };
    days: { current: number; previous: number };
    avgPerDay: { current: number; previous: number; pct: number | null };
    emojis: { current: number; previous: number; pct: number | null };
    media: { current: number; previous: number; pct: number | null };
    avgMsgLen: { current: number; previous: number; pct: number | null };
    streak: { current: number; previous: number; pct: number | null };
    appeared: Array<[string, number]>;
    disappeared: Array<[string, number]>;
}

export interface DateRange { from: string; to: string }

export interface ParseDiagnostics {
    totalLines: number;
    matched: number;
    detected: boolean;
    samples: string[];
}

export type WorkerInbound =
    | { kind: 'load'; blob: Blob }
    | { kind: 'stats'; year?: number | null; range?: DateRange | null; ai?: boolean }
    | { kind: 'reset' };

export type WorkerOutbound =
    | { kind: 'years'; years: number[]; yearCounts: Record<string, number>; bounds: DateRange }
    | { kind: 'progress'; text: string }
    | { kind: 'stats'; stats: Stats; comparison: YearComparison | null; cached: boolean }
    | { kind: 'error'; message: string; diagnostics: ParseDiagnostics | null };

export interface CardBar {
    label: string;
    value: string;
    ratio: number;
    color?: string;
}

/** Plain-data description of a slide, for the 1080x1920 image export. */
export interface SlideCard {
    gradient: string;
    tag?: string;
    title?: string;
    subtitle?: string;
    big?: { value: string; label: string };
    grid?: Array<[string | number, string]>;
    bars?: CardBar[];
    emojis?: Array<[string, number]>;
    lines?: string[];
}

export interface Slide {
    gradient: string;
    html: string;
    card?: SlideCard;
    chart?: (ctx: HTMLCanvasElement | CanvasRenderingContext2D, slide: HTMLElement) => void;
}

declare global {
    const LZString: {
        compressToEncodedURIComponent(input: string): string;
        decompressFromEncodedURIComponent(input: string): string | null;
    };
    const Chart: any;
    const JSZip: any;
    interface Window {
        JSZip: any;
        Chart: any;
        LZString: typeof LZString;
    }
}
