# 官方客户端验收

2026-11-17，Linux Xmind 27.01.05089（构建 202611160740）。样本来源和哈希见[样本说明](../tests/fixtures/README.md)与 [manifest](../tests/fixtures/manifest.json)。

本编辑器基于原样本修改并导出的 [editor-roundtrip.xmind](../tests/fixtures/editor-roundtrip.xmind)，在官方客户端重新打开后的[截图](../tests/fixtures/editor-roundtrip.official.png)显示：改名后的“换侧并折叠”主分支在左侧，其一个子主题被折叠；原有图片缩放为 120 × 97；自由主题显示在中心主题上方。文件中自由主题坐标由 `(-67, -193)` 改为 `(-7, -163)`，与编辑器拖动的增量一致。此前另一个编辑器导出文件经官方打开，新增子主题的红旗、priority-2 和带图片的新增自由主题均可见。

最终文件的根主题 `structureClass` 为 `org.xmind.ui.map.unbalanced`，根主题 `extensions` 含 `{"provider":"org.xmind.ui.map.unbalanced","content":[{"name":"right-number","content":"1"}]}`；官方显示第一项主分支在右，其余三项在左。主分支的 `branch: "folded"` 被官方识别。另一个折叠候选文件的两个子主题也被隐藏并显示数量 2。这些结果验证了官方读取编辑器输出及候选字段，并不证明官方编辑时必然写出相同字段。

官方界面曾将原右侧主分支拖至左侧，但未取得官方保存后的 JSON。嵌套折叠、官方保存后再次打开、更多图片排列及其他结构仍待验证。
