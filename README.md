# XMind Viewer

内部 XMind MAP 编辑器，基于 XMind 官方早期 MIT 开源项目。

## 运行

Node.js 版本见 [.nvmrc](.nvmrc)，兼容范围见 [package.json](package.json)。

```sh
npm ci
npm run dev
```

```sh
npm run build
npm run preview
```

`dist/` 为静态站点产物，支持子目录部署，通过 HTTP 服务访问。

## 验证

| 命令 | 用途 |
| --- | --- |
| `npm run check` | 单元测试、类型检查、生产构建 |
| `npm run check:all` | 增加生产版本浏览器测试 |
| `npm run test:watch` | 单元测试监听 |

浏览器测试从 PATH 查找系统 Chromium／Chrome。可覆盖路径：

```sh
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium npm run test:browser
```

## 实现依据

- [工作约定](AGENTS.md)：任务恢复与文档维护规则。
- [实现路线](docs/implementation-roadmap.md)：范围、架构与验收。
- [实施进度](docs/implementation-progress.md)：当前任务、验证和未决问题。
- [回归样本](tests/fixtures/README.md)：输入来源及视觉对照方法。

## 许可证

[MIT License](LICENSE)，保留 XMind Ltd. 原始版权声明。[上游项目](https://github.com/xmindltd/xmind-viewer)。
