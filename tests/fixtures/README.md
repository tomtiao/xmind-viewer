# 回归样本

| 文件 | 来源 | 验证用途 |
| --- | --- | --- |
| [map-with-content.xmind](map-with-content.xmind) | 用户提供的 `Mind Map (2).xmind`，按原始字节保存 | MAP、标记、图片、自由主题及资源引用 |
| [map-with-content.reference.jpeg](map-with-content.reference.jpeg) | 用户提供的 `Mind Map.jpeg`，官方 Web 导出；用户确认与网页呈现一致 | 排版、主题内容、连线和配色对照 |

文件校验值由 [manifest.json](manifest.json) 维护。原始样本和参考图保持不变；测试输出写入 `test-results/`。新增样本使用新文件名，并补充来源、用途和哈希。

对照规则：

- 对齐整体平移和缩放后比较主题相对位置、尺寸、连线及内部内容。
- 排除参考图底部水印、画布外边距，以及 JPEG 压缩和抗锯齿的影响。
- 记录使用的字体；字体不一致时，先区分文字测量差异和布局差异。
- JSON 为真实内容；同包的 `content.xml` 是旧版本兼容警告页。
- 标记只有内置 ID，图标需要本地映射；图片通过 `xap:resources/…` 引用 ZIP 内容。

缺少折叠、手动换侧、图片调整大小等样本时，相关格式规则见 [实施进度](../../docs/implementation-progress.md)，不得由本样本外推为已验证规则。
