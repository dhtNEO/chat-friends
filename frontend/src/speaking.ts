import { useEffect, useRef, useState } from "react";

// The SFU's active-speaker events are slow and only fire for loud speech, so
// the green ring is driven by the audio level measured right here. Analysers
// feed a muted sink; nothing measured here is played back.
const THRESHOLD = 0.012, // RMS of normal speech after gain, above room noise
  HOLD_MS = 350; // keep the ring through short pauses between words

type Source = { identity: string; track: MediaStreamTrack };
type Meter = {
  track: MediaStreamTrack;
  source: MediaStreamAudioSourceNode;
  analyser: AnalyserNode;
  last: number;
};

export function useSpeaking(sources: Source[], active: boolean) {
  const [speaking, setSpeaking] = useState<Set<string>>(new Set());
  const context = useRef<AudioContext | null>(null),
    sink = useRef<GainNode | null>(null),
    meters = useRef(new Map<string, Meter>()),
    latest = useRef(sources);
  latest.current = sources;
  // Rebuild only when the set of tracks changes, not on every render.
  const signature = sources
    .map((s) => s.identity + ":" + s.track.id)
    .sort()
    .join("|");
  useEffect(() => {
    if (!active) return;
    if (!context.current) {
      context.current = new AudioContext();
      sink.current = context.current.createGain();
      sink.current.gain.value = 0;
      // Chrome only processes nodes that reach the destination.
      sink.current.connect(context.current.destination);
    }
    const ctx = context.current;
    void ctx.resume().catch(() => {});
    const wanted = new Map(latest.current.map((s) => [s.identity, s.track]));
    for (const [identity, meter] of meters.current)
      if (wanted.get(identity) !== meter.track) {
        meter.source.disconnect();
        meter.analyser.disconnect();
        meters.current.delete(identity);
      }
    for (const [identity, track] of wanted)
      if (!meters.current.has(identity) && track.readyState === "live") {
        const source = ctx.createMediaStreamSource(new MediaStream([track]));
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 1024;
        source.connect(analyser).connect(sink.current!);
        meters.current.set(identity, { track, source, analyser, last: 0 });
      }
  }, [signature, active]);
  useEffect(() => {
    if (!active) {
      setSpeaking(new Set());
      return;
    }
    const samples = new Float32Array(1024);
    const timer = setInterval(() => {
      const now = performance.now(),
        next = new Set<string>();
      for (const [identity, meter] of meters.current) {
        meter.analyser.getFloatTimeDomainData(samples);
        let sum = 0;
        for (const v of samples) sum += v * v;
        if (Math.sqrt(sum / samples.length) > THRESHOLD) meter.last = now;
        if (now - meter.last < HOLD_MS) next.add(identity);
      }
      setSpeaking((old) =>
        old.size === next.size && [...next].every((id) => old.has(id))
          ? old
          : next,
      );
    }, 80);
    return () => clearInterval(timer);
  }, [active]);
  // Close everything when the call ends.
  useEffect(() => {
    if (active) return;
    for (const meter of meters.current.values()) {
      meter.source.disconnect();
      meter.analyser.disconnect();
    }
    meters.current.clear();
    void context.current?.close().catch(() => {});
    context.current = null;
    sink.current = null;
  }, [active]);
  return speaking;
}
