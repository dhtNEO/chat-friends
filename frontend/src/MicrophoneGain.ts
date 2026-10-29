import {
  Track,
  type AudioProcessorOptions,
  type TrackProcessor,
} from "livekit-client";
import {
  RnnoiseWorkletNode,
  loadRnnoise,
} from "@sapphi-red/web-noise-suppressor";
import rnnoiseWorklet from "@sapphi-red/web-noise-suppressor/rnnoiseWorklet.js?url";
import rnnoiseWasm from "@sapphi-red/web-noise-suppressor/rnnoise.wasm?url";
import rnnoiseSimdWasm from "@sapphi-red/web-noise-suppressor/rnnoise_simd.wasm?url";

// RNNoise is loaded once, on first use; the worklet module once per context.
// Compiling here first matters: if the page CSP forbids WebAssembly, the
// worklet would fail silently and output silence instead of the voice.
let wasm: Promise<ArrayBuffer> | undefined;
const modules = new WeakMap<BaseAudioContext, Promise<void>>();
async function denoiser(context: AudioContext) {
  wasm ??= loadRnnoise({ url: rnnoiseWasm, simdUrl: rnnoiseSimdWasm }).then(
    async (binary) => {
      await WebAssembly.compile(binary);
      return binary;
    },
  );
  if (!modules.has(context))
    modules.set(context, context.audioWorklet.addModule(rnnoiseWorklet));
  const [binary] = await Promise.all([wasm, modules.get(context)]);
  return new RnnoiseWorkletNode(context, {
    wasmBinary: binary,
    maxChannels: 1,
  });
}

/**
 * Optional RNNoise, gain and a limiter, applied before publication, without a
 * local monitor/echo path: source → [rnnoise] → gain → limiter → track.
 */
export class MicrophoneGain
  implements TrackProcessor<Track.Kind.Audio, AudioProcessorOptions>
{
  name = "microphone-gain";
  processedTrack?: MediaStreamTrack;
  private context?: AudioContext;
  private source?: MediaStreamAudioSourceNode;
  private noise?: RnnoiseWorkletNode;
  private gain?: GainNode;
  private limiter?: DynamicsCompressorNode;
  private destination?: MediaStreamAudioDestinationNode;
  private volume: number;
  private denoise: boolean;
  private noiseRevision = 0;
  private generation = 0;
  constructor(volume: number, denoise = false) {
    this.volume = volume;
    this.denoise = denoise;
  }
  setVolume(volume: number) {
    this.volume = volume;
    if (this.gain)
      this.gain.gain.setTargetAtTime(
        volume / 100,
        this.gain.context.currentTime,
        0.02,
      );
  }
  // RNNoise works on 48 kHz frames; other rates fall back to no filter.
  static supported(context?: BaseAudioContext) {
    return (
      typeof AudioWorkletNode !== "undefined" &&
      (!context || context.sampleRate === 48000)
    );
  }
  async setDenoise(on: boolean) {
    this.denoise = on;
    const revision = ++this.noiseRevision;
    const source = this.source,
      gain = this.gain,
      context = this.context;
    if (!source || !gain || !context) return;
    const current = () =>
      revision === this.noiseRevision &&
      this.source === source &&
      this.gain === gain &&
      this.context === context &&
      context.state !== "closed";
    if (on && MicrophoneGain.supported(context)) {
      let candidate: RnnoiseWorkletNode | undefined;
      try {
        // Do not attach a late worklet to a destroyed or restarted graph.
        // Keep the existing audio path connected while the filter loads.
        candidate = this.noise ?? (await denoiser(context));
        if (!current()) {
          if (candidate !== this.noise) {
            candidate.disconnect();
            candidate.destroy();
          }
          return;
        }
        source.disconnect();
        this.noise?.disconnect();
        this.noise = candidate;
        source.connect(candidate).connect(gain);
        return;
      } catch {
        if (candidate && candidate !== this.noise) {
          candidate.disconnect();
          candidate.destroy();
        }
        // WebAssembly or worklets blocked: keep the raw microphone working.
      }
    }
    if (!current()) return;
    source.disconnect();
    this.noise?.disconnect();
    source.connect(gain);
  }
  async init({ track, audioContext }: AudioProcessorOptions) {
    const generation = ++this.generation;
    this.context = audioContext;
    this.source = audioContext.createMediaStreamSource(
      new MediaStream([track]),
    );
    this.gain = audioContext.createGain();
    this.gain.gain.value = this.volume / 100;
    this.limiter = audioContext.createDynamicsCompressor();
    this.limiter.threshold.value = -3;
    this.limiter.knee.value = 0;
    this.limiter.ratio.value = 20;
    this.limiter.attack.value = 0.003;
    this.limiter.release.value = 0.1;
    const destination = audioContext.createMediaStreamDestination();
    this.destination = destination;
    this.gain.connect(this.limiter).connect(destination);
    await this.setDenoise(this.denoise);
    if (generation !== this.generation || this.destination !== destination) {
      destination.stream.getTracks().forEach((item) => item.stop());
      return;
    }
    this.processedTrack = destination.stream.getAudioTracks()[0];
  }
  async restart(options: AudioProcessorOptions) {
    await this.destroy();
    await this.init(options);
  }
  async destroy() {
    this.generation++;
    this.noiseRevision++;
    this.source?.disconnect();
    this.noise?.disconnect();
    this.noise?.destroy();
    this.gain?.disconnect();
    this.limiter?.disconnect();
    this.destination?.stream.getTracks().forEach((track) => track.stop());
    this.source = undefined;
    this.noise = undefined;
    this.gain = undefined;
    this.limiter = undefined;
    this.destination = undefined;
    this.context = undefined;
    this.processedTrack = undefined;
  }
}
