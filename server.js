const express = require('express');
const multer = require('multer');
const AdmZip = require('adm-zip');
const fs = require('fs-extra');
const path = require('path');
const { exec } = require('child_process');
const cors = require('cors');

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.static('public'));

const upload = multer({ dest: 'uploads/' });

// ====== FUNGSI BIKIN PROJECT CORDOVA ======
async function createCordovaProject(appName, appId, sourceType, sourceData) {
  const projectPath = path.join(__dirname, 'builds', appId);
  await fs.ensureDir(projectPath);

  // Init cordova project
  await runCmd(`npx cordova create "${projectPath}" ${appId} "${appName}"`);

  const wwwPath = path.join(projectPath, 'www');
  await fs.emptyDir(wwwPath);

  // Isi www sesuai tipe sumber
  if (sourceType === 'html') {
    // HTML langsung
    await fs.writeFile(path.join(wwwPath, 'index.html'), sourceData);
  } 
  else if (sourceType === 'zip') {
    // Extract zip
    const zip = new AdmZip(sourceData);
    zip.extractAllTo(wwwPath, true);
    // Pastikan ada index.html
    if (!fs.existsSync(path.join(wwwPath, 'index.html'))) {
      throw new Error('ZIP ga ada index.html, KONTOL!');
    }
  } 
  else if (sourceType === 'url') {
    // Bikin index.html yang redirect ke URL
    const html = `
<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${appName}</title>
<style>
  html,body,iframe{margin:0;padding:0;width:100%;height:100%;border:0;overflow:hidden;}
</style>
</head>
<body>
<iframe src="${sourceData}" allowfullscreen></iframe>
</body>
</html>`;
    await fs.writeFile(path.join(wwwPath, 'index.html'), html);
  }

  // Tambah platform android
  await runCmd(`cd "${projectPath}" && npx cordova platform add android`);

  // Build APK debug
  await runCmd(`cd "${projectPath}" && npx cordova build android`);

  // Cari APK hasil build
  const apkPath = path.join(
    projectPath,
    'platforms/android/app/build/outputs/apk/debug/app-debug.apk'
  );

  if (!fs.existsSync(apkPath)) throw new Error('Build gagal, ANJING!');

  return apkPath;
}

function runCmd(cmd) {
  return new Promise((resolve, reject) => {
    exec(cmd, { maxBuffer: 1024 * 1024 * 50 }, (err, stdout, stderr) => {
      if (err) return reject(new Error(stderr || err.message));
      resolve(stdout);
    });
  });
}

// ====== ROUTE BUILD ======
app.post('/build', upload.single('file'), async (req, res) => {
  try {
    const { appName, appId, type, url } = req.body;

    if (!appName || !appId) {
      return res.status(400).json({ error: 'Nama & ID aplikasi wajib, BANGSAT!' });
    }

    const safeId = appId.replace(/[^a-zA-Z0-9.]/g, '');
    let apkPath;

    if (type === 'html') {
      const htmlContent = req.body.html;
      if (!htmlContent) return res.status(400).json({ error: 'HTML kosong KONTOL!' });
      apkPath = await createCordovaProject(appName, safeId, 'html', htmlContent);
    } 
    else if (type === 'zip') {
      if (!req.file) return res.status(400).json({ error: 'ZIP mana ANJING?!' });
      apkPath = await createCordovaProject(appName, safeId, 'zip', req.file.path);
    } 
    else if (type === 'url') {
      if (!url) return res.status(400).json({ error: 'URL kosong BANGSAT!' });
      apkPath = await createCordovaProject(appName, safeId, 'url', url);
    } 
    else {
      return res.status(400).json({ error: 'Tipe ga dikenal KONTOL!' });
    }

    res.download(apkPath, `${appName}.apk`, (err) => {
      if (err) console.error('Download error:', err);
      // Cleanup file upload
      if (req.file) fs.remove(req.file.path).catch(()=>{});
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`🔥 APK Builder jalan di http://localhost:${PORT} — GASKEUN TUAN!`);
});