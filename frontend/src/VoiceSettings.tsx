import { useEffect, useState } from "react";
import { useAudioSettings } from "./useAudioSettings";
import { useVoice } from "./voiceStore";
import { Avatar, avatarSrc, usePeople } from "./ui";

// The same settings as the call's microphone menu, in the settings panel.
// While in a call, changes go through the call so they apply at once.
export function VoiceSettings({ userId }: { userId: string }) {
  const [settings, setSettings] = useAudioSettings(userId);
  const voice = useVoice(),
    people = usePeople();
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  useEffect(() => {
    if (voice?.joined) return;
    void navigator.mediaDevices
      ?.enumerateDevices()
      .then((all) => setDevices(all.filter((d) => d.kind === "audioinput")))
      .catch(() => {});
  }, [voice?.joined]);
  const inputs = voice?.joined ? voice.devices : devices;
  const others = [...people.byId.values()].filter((m) => m.id !== userId);
  const slider = (
    label: string,
    value: number,
    max: number,
    onChange: (value: number) => void,
  ) => (
    <label className="volume-control">
      {label}{" "}
      <span className="volume-value" aria-hidden="true">
        {value}%
      </span>
      <input
        type="range"
        min="0"
        max={max}
        value={value}
        onChange={(e) => onChange(+e.target.value)}
      />
    </label>
  );
  return (
    <>
      <div className="settings-card">
        <h3>Microfone</h3>
        <label>
          Dispositivo de entrada
          <select
            value={voice?.device ?? "default"}
            disabled={!voice?.joined}
            onChange={(e) => voice?.setDevice(e.target.value)}
          >
            <option value="default">Padrão do sistema</option>
            {inputs
              .filter((d) => d.deviceId && d.deviceId !== "default")
              .map((d) => (
                <option key={d.deviceId} value={d.deviceId}>
                  {d.label || "Microfone"}
                </option>
              ))}
          </select>
        </label>
        {!voice?.joined && (
          <small>Entre na voz para trocar o dispositivo.</small>
        )}
        {slider("Volume do seu microfone", settings.microphone, 200, (v) =>
          voice?.joined
            ? voice.setMicVolume(v)
            : setSettings((old) => ({ ...old, microphone: v })),
        )}
        <label className="noise-toggle">
          <input
            type="checkbox"
            checked={settings.noise}
            disabled={voice?.audioBusy}
            onChange={(e) =>
              voice?.joined
                ? void voice.setNoise(e.target.checked)
                : setSettings((old) => ({ ...old, noise: e.target.checked }))
            }
          />{" "}
          Supressão de ruído
        </label>
        <label>
          Tipo de supressão
          <select
            value={settings.noiseMode}
            disabled={voice?.audioBusy}
            onChange={(e) => {
              const mode = e.target.value as "strong" | "browser";
              if (voice?.joined) void voice.setNoiseMode(mode);
              else setSettings((old) => ({ ...old, noiseMode: mode }));
            }}
          >
            <option value="strong">Forte (RNNoise, no seu navegador)</option>
            <option value="browser">Leve (do navegador)</option>
          </select>
        </label>
        <small>
          A forte remove teclado, ventilador e barulho de fundo com um modelo
          que roda no seu computador; o áudio não sai para nenhum serviço.
        </small>
      </div>

      <div className="settings-card">
        <h3>O que você ouve</h3>
        {slider("Volume geral de saída", settings.output, 100, (v) =>
          setSettings((old) => ({ ...old, output: v })),
        )}
        {slider("Som da transmissão", settings.stream, 100, (v) =>
          setSettings((old) => ({ ...old, stream: v })),
        )}
        {slider("Bot de música", settings.music, 100, (v) =>
          setSettings((old) => ({ ...old, music: v })),
        )}
        {slider("Efeitos sonoros", settings.effects, 100, (v) =>
          setSettings((old) => ({ ...old, effects: v })),
        )}
      </div>

      <div className="settings-card">
        <h3>Volume de cada pessoa</h3>
        <p className="muted">
          Só muda o que você ouve. Também dá para ajustar pelo ícone de volume
          no cartão da pessoa, na sala.
        </p>
        <div className="people-volumes">
          {others.map((m) => {
            const value = settings.people[m.id] ?? 100;
            return (
              <label key={m.id} className="person-volume-row">
                <Avatar name={m.displayName} src={avatarSrc(m)} size={28} />
                <span className="sr-only">Volume de {m.displayName}</span>
                <span aria-hidden="true">{m.displayName}</span>
                <input
                  type="range"
                  min="0"
                  max="200"
                  value={value}
                  onChange={(e) =>
                    setSettings((old) => ({
                      ...old,
                      people: { ...old.people, [m.id]: +e.target.value },
                    }))
                  }
                />
                <span className="volume-value">{value}%</span>
              </label>
            );
          })}
        </div>
      </div>

      <div className="settings-card">
        <h3>Transmissão</h3>
        <label className="noise-toggle">
          <input
            type="checkbox"
            checked={settings.hideCursor}
            onChange={(e) =>
              setSettings((old) => ({ ...old, hideCursor: e.target.checked }))
            }
          />{" "}
          Esconder o cursor do mouse ao transmitir
        </label>
        <small>
          Útil em jogos que escondem o mouse. Vale a partir da próxima
          transmissão; alguns navegadores ignoram este pedido.
        </small>
      </div>
      <small className="settings-foot">
        Volumes e preferências de áudio ficam salvos só neste navegador. Acima
        de 100% pode distorcer.
      </small>
    </>
  );
}
