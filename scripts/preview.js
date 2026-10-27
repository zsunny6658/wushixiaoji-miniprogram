// preview.js - 生成小程序真机预览二维码
const ci = require('miniprogram-ci');
const path = require('path');
const fs = require('fs');

async function preview() {
  const projectRoot = path.join(__dirname, '..');
  const projectPath = projectRoot;
  const privateKeyPath = path.join(projectPath, 'private.key');
  const qrcodeOutputDest = path.join(projectRoot, 'preview-qrcode.png');
  // 清理历史二维码产物，避免新旧混淆（每次预览生成的码都不同且会过期）
  for (const f of ['preview-qrcode.png', 'preview-qrcode.jpg', 'preview-qrcode-b64.txt']) {
    const p = path.join(projectRoot, f);
    if (fs.existsSync(p)) fs.unlinkSync(p);
  }
  const appid = 'wx5db374bc5466f04f';

  console.log('开始生成真机预览...');
  console.log('项目路径:', projectPath);

  // 创建 CIProject 对象（preview 内部需要 project 对象，不是 projectPath 字符串）
  const project = new ci.Project({
    appid: appid,
    type: 'miniProgram',
    projectPath: projectPath,
    privateKeyPath: privateKeyPath
  });

  try {
    const result = await ci.preview({
      project: project,
      appid: appid,
      desc: '真机预览: ' + new Date().toLocaleString('zh-CN'),
      qrcodeFormat: 'image',
      qrcodeOutputDest: qrcodeOutputDest,
      setting: {
        es6: true,
        minify: true,
        urlCheck: false,
        ignoreUploadNoFiles: true
      },
      onProgressUpdate: (task) => {
        console.log('进度:', JSON.stringify(task));
      }
    });

    console.log('预览已生成');
    console.log('二维码图片已保存到:', qrcodeOutputDest);
    console.log('响应:', JSON.stringify(result, null, 2));

    return result;
  } catch (err) {
    console.error('预览失败:', err.message);
    console.error(err.stack);
    process.exit(1);
  }
}

preview().catch(err => {
  console.error('错误:', err);
  process.exit(1);
});
