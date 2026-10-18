"use client";
import { useEffect, useRef, useState } from "react";
import { ConversationProvider, useConversation } from "@elevenlabs/react";
import "./voice.css";
import type { StylistMode } from "@/lib/types";
const listeningGuidance = "You are Mirra's voice stylist. The app is called Mirra. Let the user do most of the talking. Respond only when they finish a request or ask a question. Default to one short sentence, ideally under 20 words. Skip small talk, repeated summaries, thinking-aloud and routine follow-up questions. Ask at most one brief clarification only when necessary to act. After answering, wait quietly. For every shopping or styling request call consult_stylist with the complete request, including outfit numbers and constraints. Wait for its result before speaking. State only the key outcome, not the full tool response or outfit list. Never invent successful outfit changes. Report failures and essential limitations accurately.";
type Props = { consult: (message: string) => Promise<string>; disabled: boolean; mode?: StylistMode };
async function deadline<T>(work: Promise<T>, milliseconds: number, message: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try { return await Promise.race([work, new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error(message)), milliseconds); })]); }
  finally { if (timer) clearTimeout(timer); }
}
export default function VoiceStylist(props: Props) {
  return <ConversationProvider><VoiceControls {...props} /></ConversationProvider>;
}
function VoiceControls({ consult, disabled, mode = "live" }: Props) {
  const [error, setError] = useState("");
  const [starting, setStarting] = useState(false);
  const [connectionLabel, setConnectionLabel] = useState("Connecting…");
  const [transcript, setTranscript] = useState<{ role: string; text: string }[]>([]);
  const generation = useRef(0);
  const mounted = useRef(true);
  const startingRef = useRef(false);
  const connectionTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const latestConsult = useRef(consult);
  latestConsult.current = consult;
  const voice = useConversation({
    clientTools: { consult_stylist: async ({ message }: { message: string }) => {
      if (typeof message !== "string" || !message.trim() || message.length > 2000) return "Please give a shopping request of up to 2000 characters.";
      try { return await latestConsult.current(message); }
      catch (cause) { return "The outfit update failed: " + (cause instanceof Error ? cause.message : "Please try again."); }
    } },
    onMessage: ({ source, message }) => setTranscript(rows => [...rows.slice(-99), { role: source === "user" ? "You" : "Stylist", text: message }]),
    onError: () => {
      if (!mounted.current) return;
      clearTimeout(connectionTimer.current); generation.current++;
      setStarting(false); startingRef.current = false;
      setError("The voice connection failed. You can retry or keep typing.");
    },
  });
  const end = useRef(voice.endSession);
  end.current = voice.endSession;
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; generation.current++; clearTimeout(connectionTimer.current); void end.current(); };
  }, []);
  useEffect(() => {
    if (voice.status !== "connected") return;
    if (!startingRef.current) { void end.current(); return; }
    clearTimeout(connectionTimer.current); setStarting(false); startingRef.current = false;
    voice.sendContextualUpdate(listeningGuidance); voice.setMuted(false);
  }, [voice.status]);
  async function stop() {
    generation.current++;
    clearTimeout(connectionTimer.current);
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
      setConnectionLabel("Allow microphone access…");
      await deadline(navigator.mediaDevices.getUserMedia({ audio: true }).then(stream => {
        // Also release a stream granted after cancellation or the permission deadline.
        stream.getTracks().forEach(track => track.stop());
      }), 20000, "Microphone access is still pending. Allow it in your browser, then retry, or keep typing.");
      if (attempt !== generation.current) return;
      setConnectionLabel("Connecting…");
      const response = await fetch("/api/voice/token", { method: "POST", signal: AbortSignal.timeout(15000) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Voice is unavailable.");
      if (attempt !== generation.current) return;
      setTranscript([]);
      // This installed React SDK starts asynchronously and returns void. Its
      // status transition, rather than the return value, confirms connection.
      voice.startSession({ conversationToken: body.token, connectionType: "webrtc" });
      connectionTimer.current = setTimeout(() => {
        if (mounted.current && attempt === generation.current && startingRef.current) {
          generation.current++; startingRef.current = false; setStarting(false);
          setError("The voice connection timed out. Retry or keep typing.");
          void end.current();
        }
      }, 20000);
    } catch (cause) {
      if (mounted.current && attempt === generation.current) {
        setError(cause instanceof Error && cause.name === "NotAllowedError" ? "Microphone permission was denied. Allow it in browser settings to talk, or keep typing." : cause instanceof Error ? cause.message : "Voice could not start.");
        generation.current++; setStarting(false); startingRef.current = false;
        void voice.endSession();
      }
    }
  }
  const active = voice.status === "connected";
  return <section className="voice-stylist" aria-label="Voice stylist">
    <div className="voice-controls">
      {!active && !starting && <button type="button" disabled={disabled} onClick={() => void start()}>Talk to your stylist</button>}
      <span role="status">{starting ? connectionLabel : voice.status === "connecting" ? "Connecting…" : active ? voice.isMuted ? "Microphone muted" : voice.isSpeaking ? "Stylist speaking…" : "Listening…" : "Voice off"}</span>
      {active && <button type="button" aria-pressed={voice.isMuted} onClick={() => voice.setMuted(!voice.isMuted)}>{voice.isMuted ? "Unmute" : "Mute"}</button>}
      {(active || starting || voice.status === "connecting") && <button type="button" onClick={() => void stop()}>End</button>}
    </div>
    <p className="voice-disclosure">{mode === "sample" ? "Voice connects to ElevenLabs. Outfit changes use sample responses." : "Voice connects to ElevenLabs. Styling requests go to Gemini."}</p>
    {error && <p role="alert">{error}</p>}
    {transcript.length > 0 && <details open><summary>Voice conversation</summary><div className="voice-transcript" role="log" aria-live="polite">{transcript.map((row, index) => <p key={index}><strong>{row.role}: </strong>{row.text}</p>)}</div></details>}
  </section>;
}
