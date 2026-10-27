# 屋事小记 · 微信小程序端（wushixiaoji-miniprogram）

家庭包裹驿站（family-parcel-hub）的微信小程序客户端，自 2026-10-27 起从主仓
[`family-parcel-hub-api`](https://github.com/zsunny6658/family-parcel-hub-api)
拆分为独立仓库（历史完整保留，由 subtree split 生成）。

## 架构位置

```
family-parcel-hub-api     服务端 + 内置 H5（自部署/Docker/fpk，一个包跑起来全都有）
wushixiaoji-miniprogram   本仓：微信小程序客户端（零代码耦合，独立发版）
```

- 小程序端**零代码耦合**：不引用服务端 shared/，仅通过 HTTP API（`/hub/*`、`/api/*`）通信
- 服务端地址在 `utils/` 内配置（NAS 自部署地址 / 阿里云 bridge 地址）
- 与主仓版本号独立维护：本仓 `package.json` 的 `version` 即小程序版本

## 开发与发版

```bash
npm install          # 安装 miniprogram-ci
npm run upload       # 上传体验版（版本号读本仓 package.json，自动同步 version.js）
npm run preview      # 生成真机预览二维码 preview-qrcode.png
```

- `private.key` 为微信小程序上传密钥（gitignore，不入库；丢失需在微信公众平台重置下载）
- `version.js` 由 upload 脚本自动生成（gitignore）
- 微信后台「体验版自动更新」已开启：upload 即自动成为体验版

## 目录

```
├── app.js / app.json / app.wxss   # 小程序入口与全局配置
├── pages/                         # 列表/详情/问答/统计/设置/发布 等页面
├── components/                    # ficon 等组件
├── custom-tab-bar/                # 自定义 TabBar
├── utils/                         # helpers（decorate 渲染层）/ api 等
└── scripts/                       # upload.js 体验版上传 / preview.js 预览码
```
