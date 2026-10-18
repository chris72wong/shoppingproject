"use client";
import { useEffect, useRef, useState } from "react";
import { ConversationProvider, useConversation } from "@elevenlabs/react";
import "./voice.css";
type Props = { consult: (message: string) => Promise<string>; disabled: boolean };
export default function VoiceStylist(props: Props) {
  return <ConversationProvider><VoiceControls {...props} /></ConversationProvider>;
}
function VoiceControls({ consult, disabled }: Props) {
  const [error, setError] = useState("");
  const [starting, setStarting] = useState(false);
  const [transcript, setTranscript] = useState<{ role: string; text: string }[]>([]);
  const generation = useRef(0);
  const mounted = useRef(true);
  const startingRef = useRef(false);
  const latestConsult = useRef(consult);
  latestConsult.current = consult;
  const voice = useConversation({
    clientTools: { consult_stylist: async ({ message }: { message: string }) => {
      if (typeof message !== "string" || !message.trim() || message.length > 2000) return "Please give a shopping request of up to 2000 characters.";
      try { return await latestConsult.current(message); }
      catch (cause) { return "The outfit update failed: " + (cause instanceof Error ? cause.message : "Please try again."); }
    } },
    onMessage: ({ source, message }) => setTranscript(rows => [...rows.slice(-99), { role: source === "user" ? "You" : "Stylist", text: message }]),
    onError: () => setError("The voice connection failed. You can retry or keep typing."),
  });
  const end = useRef(voice.endSession);
  end.current = voice.endSession;
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; generation.current++; void end.current(); };
  }, []);
  async function stop() {
    generation.current++;
    startingRef.current = false;
    setStarting(false);
    await voice.endSession();
  }
  async function start() {
    if (startingRef.current) return;
    startingRef.current = true;
    const attempt = ++generation.current;
    setStarting(true); setError("");
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error("Voice requires microphone access on HTTPS or localhost.");
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach(track => track.stop());
      if (attempt !== generation.current) return;
      const response = await fetch("/api/voice/token", { method: "POST" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Voice is unavailable.");
      if (attempt !== generation.current) return;
      setTranscript([]);
      await voice.startSession({ conversationToken: body.token, connectionType: "webrtc" });
      if (attempt !== generation.current) await voice.endSession();
      else voice.setMuted(false);
    } catch (cause) {
      if (mounted.current && attempt === generation.current) setError(cause instanceof Error && cause.name === "NotAllowedError" ? "Microphone permission was denied. Allow it in browser settings to talk, or keep typing." : cause instanceof Error ? cause.message : "Voice could not start.");
    } finally {
      if (mounted.current && attempt === generation.current) { setStarting(false); startingRef.current = false; }
    }
  }
  const active = voice.status === "connected";
  return <section className="voice-stylist" aria-label="Voice stylist">
    <div className="voice-controls">
      {!active && !starting && <button type="button" disabled={disabled} onClick={() => void start()}>Talk to your stylist</button>}
      <span role="status">{starting || voice.status === "connecting" ? "Connecting…" : active ? voice.isMuted ? "Microphone muted" : voice.isSpeaking ? "Stylist speaking…" : "Listening…" : "Voice off"}</span>
      {active && <button type="button" aria-pressed={voice.isMuted} onClick={() => voice.setMuted(!voice.isMuted)}>{voice.isMuted ? "Unmute" : "Mute"}</button>}
      {(active || starting || voice.status === "connecting") && <button type="button" onClick={() => void stop()}>End</button>}
    </div>
    <p className="voice-disclosure">Start to share microphone audio with ElevenLabs. Shopping requests also go to Gemini. You can keep typing.</p>
    {error && <p role="alert">{error}</p>}
    {transcript.length > 0 && <details open><summary>Voice conversation</summary><div className="voice-transcript" role="log" aria-live="polite">{transcript.map((row, index) => <p key={index}><strong>{row.role}: </strong>{row.text}</p>)}</div></details>}
  </section>;
}
