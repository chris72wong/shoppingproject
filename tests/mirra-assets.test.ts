import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import raw from "../public/models/mirra-manifest.json";
import { inspectGlb } from "../lib/body/glb";
import { assertGarmentGroups } from "../lib/body/outfit-tryon";
import { avatarAsset } from "../lib/avatar-models";
import { previewManifest } from "../lib/preview-capsule";

test("both Mirra models cover the entire capsule with matching embedded and versioned assets", async () => {
  const models=raw.models as Record<string,{height:number;duration:number;assets:{url:string;sha256:string;productIds:string[]}[]}>;
  assert.deepEqual(Object.keys(models).sort(),["model-1","model-2"]);
  for (const [id,model] of Object.entries(models)) {
    assert.equal(model.assets.length,13);assert.equal(model.duration,12);
    const keys=new Set(model.assets.map(a=>[...a.productIds].sort().join("|")));
    assert.equal(keys.size,13);
    for(const expected of previewManifest.combinations) assert.ok(keys.has([...expected.productIds].sort().join("|")),`${id}: missing garment combination`);
    for(const asset of model.assets) {
      assert.match(asset.url,new RegExp(`^/models/mirra/${id}/look-\\d+\\.glb$`));
      const bytes=await readFile(`public${asset.url}`);
      assert.ok(bytes.length<30*1024*1024);
      assert.equal(createHash("sha256").update(bytes).digest("hex"),asset.sha256);
      const doc=inspectGlb(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength));
      assertGarmentGroups(doc,asset.productIds);
      assert.equal(doc.skins.length,1,"body and garments share one skeleton");
      assert.ok(doc.animations.some((a:{name:string})=>a.name==="FORM_Idle"));
      assert.ok(doc.images.length>0,"textures stay embedded for teammates");
      // Regression: a batch mask bake once detached facial actions after look zero.
      // Inspect the exported binary track, not merely the presence of morph labels.
      const bodyNode=doc.nodes.findIndex((node:{name:string})=>node.name==="body:sample");
      const clip=doc.animations.find((animation:{name:string})=>animation.name==="FORM_Idle");
      const channel=clip.channels.find((c:any)=>c.target.node===bodyNode && c.target.path==="weights");
      assert.ok(channel,`${asset.url}: facial animation must remain bound`);
      const sampler=clip.samplers[channel.sampler];
      const floats=(index:number) => {
        const accessor=doc.accessors[index], view=doc.bufferViews[accessor.bufferView];
        assert.equal(accessor.componentType,5126);
        const offset=28+bytes.readUInt32LE(12)+(view.byteOffset || 0)+(accessor.byteOffset || 0);
        return Array.from({length:accessor.count},(_,i)=>bytes.readFloatLE(offset+i*(view.byteStride || 4)));
      };
      const times=floats(sampler.input),weights=floats(sampler.output);
      const names=doc.meshes[doc.nodes[bodyNode].mesh].extras.targetNames as string[];
      const blinkFrame=times.findIndex((time:number)=>Math.abs(time-2.25)<.001);
      assert.ok(blinkFrame>=0);
      for(const name of ["eyeBlinkLeft","eyeBlinkRight"]) {
        assert.ok(names.includes(name));
        assert.ok(weights[blinkFrame*names.length+names.indexOf(name)]>.95,`${asset.url}: ${name} must close`);
      }
      for(let key=0;key<names.length;key++) assert.ok(Math.abs(weights[key]-weights[(times.length-1)*names.length+key])<.001,`${asset.url}: seamless facial loop`);
    }
  }
  const ids=models["model-1"].assets[0].productIds;
  assert.notEqual(avatarAsset("model-1",ids).url,avatarAsset("model-2",ids).url);
  assert.notEqual(models["model-1"].assets[0].sha256,models["model-2"].assets[0].sha256);
  assert.throws(()=>avatarAsset("model-1",["unavailable"]),/no preview/);
});
