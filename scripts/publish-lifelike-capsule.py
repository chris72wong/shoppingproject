"""Publish only the complete, reviewed staged capsule. Never upgrades physical fit.

Each case needs review.json with assetSha256, visualReviewPassed, viewsReviewed,
fullLoopReviewed, collisionReviewPassed and notes. The animation diagnostic is
separate from operator visual/collision review; passing it alone is insufficient.
"""
import hashlib,json,shutil
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
STAGE=ROOT/'.avatar-source/lifelike'
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
human=json.loads((STAGE/'human.json').read_text())
if sha(STAGE/'human.glb')!=human['sha256']:raise RuntimeError('Stale human output')
manifest=json.loads((ROOT/'public/models/preview-manifest.json').read_text())
missing=[str(STAGE/f'case-{case}'/name) for case in range(1,14) for name in ['outfit.glb','report.json','review.json','diagnostic.json'] if not (STAGE/f'case-{case}'/name).is_file()]
if missing:raise RuntimeError('Capsule remains staged: missing reviewed deliverables: '+', '.join(missing))
reports=[]
for case in range(1,14):
    directory=STAGE/f'case-{case}'
    report=json.loads((directory/'report.json').read_text())
    review=json.loads((directory/'review.json').read_text())
    diagnostic=json.loads((directory/'diagnostic.json').read_text())
    expected=manifest['combinations'][case-1]['productIds']
    if sorted(report['productIds'])!=sorted(expected):raise RuntimeError(f'Wrong product mapping {case}')
    if any(report[key]!=human[key] for key in ['avatarVersion','rigVersion','bodyMotionVersion','facialAnimationVersion','clipDurationSeconds']):raise RuntimeError(f'Incompatible animation {case}')
    if diagnostic['durationSeconds']!=human['clipDurationSeconds'] or diagnostic['garmentMeshCount']<len(expected):raise RuntimeError(f'Incomplete exported animation {case}')
    if sha(directory/'outfit.glb')!=report['sha256'] or review['assetSha256']!=report['sha256']:raise RuntimeError(f'Stale case {case}')
    if not report['loopApproved'] or not all(review.get(k) is True for k in ['visualReviewPassed','fullLoopReviewed','collisionReviewPassed']):raise RuntimeError(f'Unapproved case {case}')
    if set(review['viewsReviewed'])!={'front','side','back'} or diagnostic['penetratingSamples']:raise RuntimeError(f'Incomplete collision review {case}')
    if report['physicalFitValidated'] or any(not f['estimated'] or f['calibrationId'] is not None for f in report['fabric'].values()):raise RuntimeError('Draft coefficients cannot assert calibration')
    reports.append((directory,report,review,diagnostic))
# Prepare the entire directory before changing the active manifest.
target=ROOT/'public/models/lifelike-v1';target.mkdir(exist_ok=True)
shutil.copy2(STAGE/'human.glb',target/'human.glb')
provenance=json.loads((ROOT/'public/models/sample-human.provenance.json').read_text())
provenance.update(human);provenance.update({'status':'estimated sample appearance; physical fit unvalidated','license':'CC0-1.0','facialUnitContributor':'Mika Suominen'})
(target/'human.provenance.json').write_text(json.dumps(provenance,indent=2)+'\n')
versions={key:human[key] for key in ['avatarVersion','rigVersion','bodyMotionVersion','facialAnimationVersion','clipDurationSeconds']}
versions['clothBakeVersion']=1
manifest.update(versions);manifest.update({'schemaVersion':2,'status':'draft','avatarAsset':{'url':'/models/lifelike-v1/human.glb','sha256':human['sha256']},
    'reason':'Offline-simulated product-specific drafts. Pattern and fabric estimates remain uncalibrated; appearance on this sample body does not establish personal fit.'})
for product in manifest['products']:product['garmentVersion']=2;product['dimensionsVerified']=False
manifest['combinations']=[]
for case,(directory,report,review,diagnostic) in enumerate(reports,1):
    shutil.copy2(directory/'outfit.glb',target/f'outfit-{case}.glb')
    evidence={'bake':report,'review':review,'diagnostic':diagnostic}
    (target/f'review-{case}.json').write_text(json.dumps(evidence,indent=2)+'\n')
    manifest['combinations'].append(dict(versions,productIds=report['productIds'],url=f'/models/lifelike-v1/outfit-{case}.glb',sha256=report['sha256'],
        idleCollisionChecked=True,visualReviewPassed=True,reviewReferences=[f'/models/lifelike-v1/review-{case}.json']))
temporary=ROOT/'public/models/preview-manifest.pending.json'
temporary.write_text(json.dumps(manifest,indent=2)+'\n');temporary.replace(ROOT/'public/models/preview-manifest.json')
print('Published complete estimated capsule; physical fit remains unvalidated.')
