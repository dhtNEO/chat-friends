import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { test, expect } from "@playwright/test";
import ts from "typescript";

// Exercise the real processor without loading browser assets or a call. Each
// fixture gets a fresh module so RNNoise's cached load promise stays isolated.
const compiled = ts.transpileModule(
  readFileSync(new URL("../src/MicrophoneGain.ts", import.meta.url), "utf8"),
  {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.CommonJS,
    },
  },
).outputText;

class AudioNodeStub {
  connections: string[] = [];
  destroyed = false;
  constructor(readonly name: string) {}
  connect(other: AudioNodeStub) {
    this.connections.push(other.name);
    return other;
  }
  disconnect() {
    this.connections = [];
  }
  destroy() {
    this.destroyed = true;
  }
}
class TrackStub {
  stopped = false;
  stop() {
    this.stopped = true;
  }
}
class AudioContextStub {
  sampleRate = 48000;
  state = "running";
  currentTime = 0;
  source = new AudioNodeStub("source");
  destinationTrack = new TrackStub();
  audioWorklet = { addModule: async () => undefined };
  createMediaStreamSource() {
    return this.source;
  }
  createGain() {
    return Object.assign(new AudioNodeStub("gain"), {
      gain: { value: 0, setTargetAtTime() {} },
    });
  }
  createDynamicsCompressor() {
    return Object.assign(new AudioNodeStub("limiter"), {
      threshold: { value: 0 },
      knee: { value: 0 },
      ratio: { value: 0 },
      attack: { value: 0 },
      release: { value: 0 },
    });
  }
  createMediaStreamDestination() {
    return Object.assign(new AudioNodeStub("destination"), {
      stream: {
        getTracks: () => [this.destinationTrack],
        getAudioTracks: () => [this.destinationTrack],
      },
    });
  }
}
type Options = { track: object; audioContext: AudioContextStub };
type Processor = {
  processedTrack?: TrackStub;
  init(options: Options): Promise<void>;
  restart(options: Options): Promise<void>;
  setDenoise(on: boolean): Promise<void>;
  destroy(): Promise<void>;
};

function fixture(strong = false) {
  let resolve!: (binary: ArrayBuffer) => void;
  let reject!: (error: Error) => void;
  const pending = new Promise<ArrayBuffer>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  const noises: Noise[] = [];
  class Noise extends AudioNodeStub {
    constructor(readonly context: AudioContextStub) {
      super("noise" + noises.length);
      noises.push(this);
    }
  }
  const exports = {} as {
    MicrophoneGain: new (volume: number, strong: boolean) => Processor;
  };
  runInNewContext(compiled, {
    exports,
    AudioWorkletNode: class {},
    MediaStream: class {},
    WebAssembly: { compile: async () => undefined },
    require(name: string) {
      if (name === "livekit-client") return {};
      if (name === "@sapphi-red/web-noise-suppressor")
        return { RnnoiseWorkletNode: Noise, loadRnnoise: () => pending };
      return { default: "test-asset" };
    },
  });
  return {
    processor: new exports.MicrophoneGain(100, strong),
    resolve: () => resolve(new ArrayBuffer(8)),
    reject,
    noises,
  };
}
const options = (audioContext: AudioContextStub): Options => ({
  track: {},
  audioContext,
});

test("destroy durante carga destrói o worklet tardio sem rejeitar", async () => {
  const f = fixture();
  const context = new AudioContextStub();
  await f.processor.init(options(context));
  const strong = f.processor.setDenoise(true);
  // Loading a filter must keep the currently working path connected.
  expect(context.source.connections).toEqual(["gain"]);
  await f.processor.destroy();
  f.resolve();
  await strong;
  expect(f.noises).toHaveLength(1);
  expect(f.noises[0].destroyed).toBe(true);
  expect(f.noises[0].connections).toEqual([]);
  expect(context.source.connections).toEqual([]);
});

test("Forte para Leve durante carga preserva somente o áudio bruto", async () => {
  const f = fixture();
  const context = new AudioContextStub();
  await f.processor.init(options(context));
  const strong = f.processor.setDenoise(true);
  await f.processor.setDenoise(false);
  f.resolve();
  await strong;
  expect(context.source.connections).toEqual(["gain"]);
  expect(f.noises[0].destroyed).toBe(true);
  expect(f.noises[0].connections).toEqual([]);
});

test("trocas concorrentes usam o último filtro sem duplicar caminhos", async () => {
  const f = fixture();
  const context = new AudioContextStub();
  await f.processor.init(options(context));
  const old = f.processor.setDenoise(true);
  await f.processor.setDenoise(false);
  const latest = f.processor.setDenoise(true);
  f.resolve();
  await Promise.all([old, latest]);
  expect(f.noises).toHaveLength(2);
  const live = f.noises.filter((noise) => !noise.destroyed);
  expect(live).toHaveLength(1);
  expect(context.source.connections).toEqual([live[0].name]);
  expect(live[0].connections).toEqual(["gain"]);
  await f.processor.setDenoise(false);
  expect(context.source.connections).toEqual(["gain"]);
  expect(live[0].connections).toEqual([]);
  await f.processor.setDenoise(true);
  expect(context.source.connections).toEqual([live[0].name]);
  expect(live[0].connections).toEqual(["gain"]);
  expect(f.noises).toHaveLength(2);
});

test("destroy durante init para a saída e impede track processada tardia", async () => {
  const f = fixture(true);
  const context = new AudioContextStub();
  const initial = f.processor.init(options(context));
  await f.processor.destroy();
  f.resolve();
  await initial;
  expect(context.destinationTrack.stopped).toBe(true);
  expect(f.processor.processedTrack).toBeUndefined();
  expect(f.noises[0].destroyed).toBe(true);
});

test("restart descarta init antigo e preserva a nova saída e contexto", async () => {
  const f = fixture(true);
  const oldContext = new AudioContextStub();
  const newContext = new AudioContextStub();
  const initial = f.processor.init(options(oldContext));
  const restarted = f.processor.restart(options(newContext));
  // Let restart finish its synchronous destroy before releasing the load.
  await Promise.resolve();
  f.resolve();
  await Promise.all([initial, restarted]);
  expect(oldContext.destinationTrack.stopped).toBe(true);
  expect(newContext.destinationTrack.stopped).toBe(false);
  expect(f.processor.processedTrack).toBe(newContext.destinationTrack);
  expect(oldContext.source.connections).toEqual([]);
  const live = f.noises.filter((noise) => !noise.destroyed);
  expect(live).toHaveLength(1);
  expect(live[0].context).toBe(newContext);
  expect(newContext.source.connections).toEqual([live[0].name]);
});

test("filtro indisponível mantém o fallback de microfone sem filtro", async () => {
  const f = fixture();
  const context = new AudioContextStub();
  await f.processor.init(options(context));
  const strong = f.processor.setDenoise(true);
  f.reject(new Error("worklet blocked"));
  await strong;
  expect(context.source.connections).toEqual(["gain"]);
  expect(context.destinationTrack.stopped).toBe(false);
  expect(f.processor.processedTrack).toBe(context.destinationTrack);
});

test("falha tardia do filtro não reconecta o grafo destruído", async () => {
  const f = fixture();
  const context = new AudioContextStub();
  await f.processor.init(options(context));
  const strong = f.processor.setDenoise(true);
  await f.processor.destroy();
  f.reject(new Error("worklet blocked"));
  await strong;
  expect(context.source.connections).toEqual([]);
  expect(context.destinationTrack.stopped).toBe(true);
  expect(f.processor.processedTrack).toBeUndefined();
});
