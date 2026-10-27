const ci = require('miniprogram-ci');
const path = require('path');
const fs = require('fs');
const pkg = require('../package.json');

// 版本单点维护：本仓 package.json 的 version 同步到 version.js
// （settings 页 / me 页「关于」require 此模块显示版本号；
//   注意：小程序 require 不支持 .json 文件，必须用 JS 模块）
const ROOT = path.resolve(__dirname, '..');
const miniVerPath = path.join(ROOT, 'version.js');
fs.writeFileSync(miniVerPath, '// 版本号由 scripts/upload.js 从本仓 package.json 自动同步，请勿手动编辑\nmodule.exports = { version: \'' + pkg.version + '\' };\n');
console.log('已同步版本号到 version.js: ' + pkg.version);

const appid = 'wx5db374bc5466f04f';
const projectPath = ROOT;
const privateKeyPath = path.join(ROOT, 'private.key');

(async () => {
  const project = new ci.Project({
    appid,
    type: 'miniProgram',
    projectPath,
    privateKeyPath,
    ignores: ['node_modules/**', 'package-lock.json']
  });

  console.log('上传版本: ' + pkg.version);
  const uploadResult = await ci.upload({
    project,
    version: pkg.version,
    desc: '体验版: ' + new Date().toLocaleString('zh-CN'),
    setting: {
      es6: true,
      es7: true,
      minifyJS: true,
      minifyWXML: true,
      minifyWXSS: true,
      codeProtect: false
    },
    onProgressUpdate: (task) => {
      if (task.status === 'uploading') {
        process.stdout.write(`\r上传中: ${task.progress}%`);
      }
    }
  });

  console.log('\n上传成功!');
  console.log('版本:', uploadResult);
  console.log('\n请到微信公众平台 → 版本管理 → 开发版本 设为体验版');
})().catch(err => {
  console.error('上传失败:', err);
  process.exit(1);
});
