// Project records use the host's public composition contract; validation here protects the app writer.
export type ClipKind = 'video' | 'image' | 'audio' | 'narration' | 'title' | 'caption' | 'chart' | 'figures';
export interface CompositionClip { id: string; label: string; kind: ClipKind; track: string; start: number; duration: number; in: number; src?: string; segment?: number; volume: number; fadeIn: number; fadeOut: number; loop: boolean; fit: 'contain' | 'cover'; x: number; y: number; muted: boolean; solo?: boolean }
export interface Composition { portrait: boolean; duration: number; clips: CompositionClip[]; loop?: { start: number; end: number }; captions: boolean }
const supported = new Set(['video', 'image', 'audio', 'narration', 'title', 'caption', 'chart', 'figures']);
const string = (v: unknown, size: number) => typeof v === 'string' ? v.trim().slice(0, size) : '';
function amount(v: unknown, fallback: number, low: number, high: number): number { const n = v === undefined ? fallback : v; if (typeof n !== 'number' || !Number.isFinite(n) || n < low || n > high) throw Error('Clip setting is outside its supported range'); return n; }
export function parseComposition(input: unknown, sceneCount: number): Composition | undefined {
  if (input === undefined || input === null) return;
  if (typeof input !== 'object') throw Error('Invalid project timeline');
  const project = input as Record<string, unknown>;
  if (!Array.isArray(project.clips) || project.clips.length > 400) throw Error('Keep at most 400 timeline clips');
  const unique = new Set<string>(); let end = .1;
  const clips = project.clips.map((value): CompositionClip => {
    if (!value || typeof value !== 'object') throw Error('Invalid clip record');
    const item = value as Record<string, unknown>, id = string(item.id, 80), kind = string(item.kind, 20) as ClipKind;
    if (!id || unique.has(id) || !supported.has(kind)) throw Error('Clip identity or kind is invalid'); unique.add(id);
    const start = amount(item.start, 0, 0, 14400), duration = amount(item.duration, 3, .05, 14400), sourceIn = amount(item.in, 0, 0, 14400);
    end = Math.max(end, start + duration); if (end > 14400) throw Error('The timeline exceeds four hours');
    const src = string(item.src, 2048), local = /^media:[0-9a-f-]{36}$/.test(src);
    if ((kind === 'video' || kind === 'audio') && !local) throw Error('Choose a saved Media asset');
    if (kind === 'image' && !local && !/^https:\/\/[^\s<>"']+$/.test(src)) throw Error('Choose a saved image or HTTPS source');
    const segment = item.segment;
    if (segment !== undefined && (!Number.isInteger(segment) || Number(segment) < 0 || Number(segment) >= sceneCount)) throw Error('Clip scene does not exist');
    if (['title', 'caption', 'narration', 'chart', 'figures'].includes(kind) && segment === undefined) throw Error('This clip needs a scene');
    return { id, kind, label: string(item.label, 120) || kind, track: string(item.track, 40) || kind, start, duration, in: sourceIn, ...(src ? { src } : {}), ...(segment !== undefined ? { segment: Number(segment) } : {}), volume: amount(item.volume, kind === 'audio' ? .18 : 1, 0, 1), fadeIn: amount(item.fadeIn, 0, 0, duration), fadeOut: amount(item.fadeOut, 0, 0, duration), loop: item.loop === true, fit: item.fit === 'cover' ? 'cover' : 'contain', x: amount(item.x, 50, 0, 100), y: amount(item.y, 50, 0, 100), muted: item.muted === true, solo: item.solo === true };
  });
  const duration = Math.max(end, amount(project.duration, end, .05, 14400));
  let loop: Composition['loop'];
  if (project.loop && typeof project.loop === 'object') { const range = project.loop as Record<string, unknown>, start = amount(range.start, 0, 0, duration), stop = amount(range.end, duration, 0, duration); if (stop <= start) throw Error('Loop end must follow its start'); loop = { start, end: stop }; }
  return { portrait: project.portrait === true, duration, clips, captions: project.captions !== false, ...(loop ? { loop } : {}) };
}
