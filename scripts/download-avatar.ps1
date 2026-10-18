$ErrorActionPreference = 'Stop'
# Run from repository root after npm install. Only one avatar is downloaded (~43 MB).
$avatarRevision = '0943055db6ec570bcef9f2c8b41c9e5467c808f9'
$avatarBase = "https://raw.githubusercontent.com/microsoft/Microsoft-Rocketbox/$avatarRevision"
New-Item -ItemType Directory -Force .avatar-source, public/models | Out-Null
Invoke-WebRequest "$avatarBase/LICENSE.md" -OutFile public/models/LICENSE-Rocketbox.txt
Invoke-WebRequest "$avatarBase/Assets/Avatars/Adults/Male_Adult_01/Export/Male_Adult_01.fbx" -OutFile .avatar-source/avatar.fbx
foreach ($avatarTexture in @('m002_body_color.tga', 'm002_head_color.tga', 'm002_opacity_color.tga')) {
  Invoke-WebRequest "$avatarBase/Assets/Avatars/Adults/Male_Adult_01/Textures/$avatarTexture" -OutFile ".avatar-source/$avatarTexture"
}
# Official Meta converter release. Kept in ignored processing directory.
Invoke-WebRequest 'https://github.com/facebookincubator/FBX2glTF/releases/download/v0.9.7/FBX2glTF-windows-x64.exe' -OutFile .avatar-source/FBX2glTF.exe
& ./.avatar-source/FBX2glTF.exe --input .avatar-source/avatar.fbx --output .avatar-source/converted --binary --compute-normals missing
if ($LASTEXITCODE -ne 0) { throw 'FBX conversion failed' }
# The FBX contains machine-local texture paths. prepare-avatar embeds the actual downloaded
# diffuse maps, removes unresolved normal maps and fixes the original Phong material values.
node scripts/prepare-avatar.mjs
if ($LASTEXITCODE -ne 0) { throw 'Avatar processing failed' }
