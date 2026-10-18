/** Headless evaluation of the actual GLB animation, not just its JSON labels. */
import { readFile, writeFile } from "node:fs/promises";
import { AnimationMixer, LoopOnce, Vector3, SkinnedMesh, BufferGeometry, Float32BufferAttribute, Triangle } from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { MeshBVH } from "three-mesh-bvh";
import { inspectGlb } from "../lib/body/glb";

async function main() {
const path=process.argv[2];
if (!path) throw new Error('Supply a GLB path');
const bytes=await readFile(path);
const document=inspectGlb(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength));
// Geometry-only loading avoids browser image APIs in Node. The original asset
// has already passed the embedded-resource contract above.
const json=structuredClone(document);
delete json.images;delete json.textures;
json.materials=json.materials.map((m: any)=>({name:m.name,doubleSided:true,pbrMetallicRoughness:{metallicFactor:0,roughnessFactor:.8}}));
const encoded=Buffer.from(JSON.stringify(json));const padding=Buffer.alloc((4-encoded.length%4)%4,32);
const binary=bytes.subarray(28+bytes.readUInt32LE(12));const length=28+encoded.length+padding.length+binary.length;
const header=Buffer.alloc(20);header.writeUInt32LE(0x46546c67,0);header.writeUInt32LE(2,4);header.writeUInt32LE(length,8);header.writeUInt32LE(encoded.length+padding.length,12);header.writeUInt32LE(0x4e4f534a,16);
const binHeader=Buffer.alloc(8);binHeader.writeUInt32LE(binary.length,0);binHeader.writeUInt32LE(0x004e4942,4);
const packed=Buffer.concat([header,encoded,padding,binHeader,binary]);
const gltf=await new GLTFLoader().parseAsync(packed.buffer.slice(packed.byteOffset,packed.byteOffset+packed.byteLength),'');
const clip=gltf.animations.find(clip=>clip.name==='FORM_Idle');
if (!clip || Math.abs(clip.duration-12)>.001) throw new Error('Expected a twelve-second idle');
const mixer=new AnimationMixer(gltf.scene),action=mixer.clipAction(clip);action.setLoop(LoopOnce,1);action.clampWhenFinished=true;
const meshes:SkinnedMesh[]=[];gltf.scene.traverse(object=>{if(object instanceof SkinnedMesh) meshes.push(object);});
function original(object: import('three').Object3D):string {return String(object.userData.name||object.name);}
function ancestor(mesh: import('three').Object3D,prefix:string):string|undefined {
  for(let object:import('three').Object3D|null=mesh;object;object=object.parent)if(original(object).startsWith(prefix))return original(object);
}
function at(time:number){action.reset().play();mixer.setTime(time);gltf.scene.updateMatrixWorld(true);for(const mesh of meshes)mesh.skeleton.update();}
function bone(name:string){const found=gltf.scene.getObjectByName(name);if(!found)throw new Error('Missing bone '+name);return found.getWorldPosition(new Vector3());}
at(0);const feet=['foot_l','foot_r'].map(bone);
if (['hand_l','hand_r'].some(name=>bone(name).y>1.10 || Math.abs(bone(name).x)>.34))throw new Error('Hands are not relaxed beside the body');
const head=bone('head');let maxFootDrift=0,maxHeadMotion=0;
for(let time=0;time<=12;time+=.25){at(time);maxHeadMotion=Math.max(maxHeadMotion,bone('head').distanceTo(head));for(let i=0;i<2;i++)maxFootDrift=Math.max(maxFootDrift,bone(['foot_l','foot_r'][i]).distanceTo(feet[i]));}
if(maxFootDrift>.002)throw new Error('Feet drift '+maxFootDrift+' metres');
if(maxHeadMotion<.003)throw new Error('Idle is not visibly moving');
at(2.25);
let blinkLeft=0,blinkRight=0;
for(const mesh of meshes){const names=mesh.morphTargetDictionary||{},values=mesh.morphTargetInfluences||[];blinkLeft=Math.max(blinkLeft,values[names.eyeBlinkLeft]||0);blinkRight=Math.max(blinkRight,values[names.eyeBlinkRight]||0);}
if(blinkLeft<.95||blinkRight<.95)throw new Error('Eyelids do not reach full closure');
const garmentMeshes=meshes.filter(mesh=>ancestor(mesh,'garment:'));
at(1/3);
if(!process.argv.includes('--skeletal'))for(const mesh of garmentMeshes){if(!Object.keys(mesh.morphTargetDictionary||{}).some(name=>name.startsWith('cloth_frame_')))throw new Error('Garment lacks baked cloth');if(!(mesh.morphTargetInfluences||[]).some(value=>value>.9))throw new Error('Cloth morph animation did not bind to '+mesh.name);}
function geometry(mesh:SkinnedMesh){const points=new Float32Array(mesh.geometry.attributes.position.count*3),p=new Vector3();for(let i=0;i<points.length/3;i++){mesh.getVertexPosition(i,p).applyMatrix4(mesh.matrixWorld);p.toArray(points,i*3);}const geometry=new BufferGeometry();geometry.setAttribute('position',new Float32BufferAttribute(points,3));geometry.setIndex(mesh.geometry.index!.clone());return geometry;}
let minBodyClearance=Infinity,penetratingSamples=0;
const collisionsByGarment:Record<string,{minClearanceM:number;penetratingSamples:number}>={};
if(process.argv.includes('--collisions')){
  const bodies=meshes.filter(mesh=>ancestor(mesh,'body:sample'));
  for(let time=0;time<=12;time+=.25){
    at(time);const pieces=bodies.map(geometry),body=mergeGeometries(pieces,false)!;pieces.forEach(g=>g.dispose());
    const bvh=new MeshBVH(body),position=body.attributes.position,index=body.index!,triangle=new Triangle(),p=new Vector3();
    for(const mesh of garmentMeshes){
      const id=ancestor(mesh,'garment:')!;
      const result=collisionsByGarment[id] ||= {minClearanceM:Infinity,penetratingSamples:0};
      for(let vertex=0;vertex<mesh.geometry.attributes.position.count;vertex+=3){
        mesh.getVertexPosition(vertex,p).applyMatrix4(mesh.matrixWorld);const hit=bvh.closestPointToPoint(p);
        if(!hit)continue;
        triangle.a.fromBufferAttribute(position,index.getX(hit.faceIndex*3));triangle.b.fromBufferAttribute(position,index.getX(hit.faceIndex*3+1));triangle.c.fromBufferAttribute(position,index.getX(hit.faceIndex*3+2));
        const signed=p.clone().sub(hit.point).dot(triangle.getNormal(new Vector3()));minBodyClearance=Math.min(minBodyClearance,signed);result.minClearanceM=Math.min(result.minClearanceM,signed);if(signed<-.002){penetratingSamples++;result.penetratingSamples++;}
      }
    }
    body.dispose();
  }
}
const report={asset:path,appearanceMode:process.argv.includes('--skeletal')?'skeletal preview':'baked cloth',durationSeconds:clip.duration,maxFootDriftM:maxFootDrift,maxHeadMotionM:maxHeadMotion,blinkLeft,blinkRight,garmentMeshCount:garmentMeshes.length,
  collisionChecksRun:process.argv.includes('--collisions'),minSampledBodyClearanceM:Number.isFinite(minBodyClearance)?minBodyClearance:null,penetratingSamples:process.argv.includes('--collisions')?penetratingSamples:null,collisionsByGarment,collisionStepSeconds:.25,
  limits:'Vertex sampling is a diagnostic, not a proof of complete triangle collision freedom or physical fit.'};
console.log(JSON.stringify(report,null,2));
const destination=process.argv.indexOf('--report');if(destination>=0)await writeFile(process.argv[destination+1],JSON.stringify(report,null,2)+'\n');
if(penetratingSamples)process.exitCode=2;

}
main().catch(error=>{console.error(error);process.exitCode=1;});

