"use client";
import { Suspense, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls, ContactShadows } from "@react-three/drei";
import SampleHuman from "./SampleHuman";

function ReviewClock({ elapsed, playing, onMetrics }: { elapsed: React.MutableRefObject<number>; playing: boolean; onMetrics: (fps: number, phase: number) => void }) {
  const count=useRef(0), start=useRef(0);
  useFrame((_,delta) => {
    if (playing) elapsed.current+=Math.min(delta,.1);
    count.current++;const now=performance.now();
    if (!start.current) start.current=now;
    if (now-start.current>1000) { onMetrics(Math.round(count.current*1000/(now-start.current)),elapsed.current%12);count.current=0;start.current=now; }
  });
  return null;
}
function Seek({ value, elapsed }: {value: number;elapsed: React.MutableRefObject<number>}) {
  const { invalidate }=useThree();
  if (value>=0 && elapsed.current!==value) { elapsed.current=value;invalidate(); }
  return null;
}
export default function LifelikeReview() {
  const elapsed=useRef(0);const [playing,setPlaying]=useState(true),[face,setFace]=useState(false),[outfit,setOutfit]=useState(false);
  const [fps,setFps]=useState(0),[phase,setPhase]=useState(0),[seek,setSeek]=useState(-1);
  const asset={url:outfit?"/models/lifelike-review/outfit.glb":"/models/lifelike-review/human.glb",productIds:outfit?["uq-489929-white","uq-482880-navy"]:[],durationSeconds:12};
  return <main style={{height:"100dvh",padding:20,display:"flex",flexDirection:"column",background:"#eeede8"}}>
    <h1>Lifelike preview · development review</h1>
    <p>Estimated appearance; physical fit unvalidated. FPS is measured on this browser, not a mobile hardware certification.</p>
    <div style={{display:"flex",gap:12,flexWrap:"wrap"}}>
      <button onClick={()=>{setPlaying(v=>!v);setSeek(-1);}}>{playing?"Pause":"Play"}</button>
      <button onClick={()=>setFace(v=>!v)}>{face?"Full body":"Face close-up"}</button>
      <button onClick={()=>setOutfit(v=>!v)}>{outfit?"Human only":"White tee and navy chinos"}</button>
      <button onClick={()=>{setPlaying(false);setSeek(0);}}>Eyes open</button>
      <button onClick={()=>{setPlaying(false);setSeek(2.25);}}>Blink closure</button>
      <label>Phase <input aria-label="Review phase" type="range" min="0" max="12" step=".05" value={playing?phase:Math.max(0,seek)} onChange={e=>{setPlaying(false);setSeek(Number(e.target.value));}} /></label>
      <output aria-label="Measured preview FPS">{fps} FPS · {phase.toFixed(2)} s</output>
    </div>
    <div style={{flex:1,minHeight:400}}>
      <Canvas key={face?"face":"body"} camera={{position:face?[0,1.26,1.5]:[0,0,6],fov:30}} dpr={[1,1.5]}>
        <ambientLight intensity={.9}/><directionalLight position={[3,4,4]} intensity={1.8}/><directionalLight position={[-3,2,1]} intensity={.5}/>
        <ReviewClock elapsed={elapsed} playing={playing} onMetrics={(value,time)=>{setFps(value);setPhase(time);}}/>
        <Seek elapsed={elapsed} value={seek}/>
        <Suspense fallback={null}><SampleHuman productIds={asset.productIds} elapsed={elapsed} reviewAsset={asset}/></Suspense>
        <OrbitControls target={face?[0,1.25,0]:[0,0,0]} enablePan={false}/>
        <ContactShadows position={[0,-1.51,0]} opacity={.25} scale={7} blur={2.5} far={4}/>
      </Canvas>
    </div>
  </main>;
}
