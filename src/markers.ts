/** IDs follow https://github.com/xmindltd/xmind-sdk-js/blob/master/src/common/constants/marker.ts;
 * tag-red is also present in the fixed modern sample. Unrecognized IDs are retained. */
export const markerOptions = [
  ...Array.from({ length: 9 }, (_, i) => ({ id: `priority-${i + 1}`, label: `优先级 ${i + 1}` })),
  ...[['task-start', '未开始'], ['task-oct', '八分之一'], ['task-quarter', '四分之一'], ['task-3oct', '八分之三'], ['task-half', '一半'], ['task-5oct', '八分之五'], ['task-3quar', '四分之三'], ['task-7oct', '八分之七'], ['task-done', '已完成'], ['task-pause', '暂停']].map(([id, label]) => ({ id, label })),
  ...['red', 'orange', 'yellow', 'green', 'blue', 'purple', 'gray', 'dark-blue', 'dark-green', 'dark-gray'].flatMap(color => [
    { id: `flag-${color}`, label: `旗帜 ${color}` }, { id: `tag-${color}`, label: `标签 ${color}` }
  ]),
  ...['smiley-smile', 'smiley-laugh', 'smiley-cry', 'smiley-surprise', 'smiley-boring', 'smiley-angry', 'smiley-embarrass'].map(id => ({ id, label: id }))
]
export const markerColors: Record<string, string> = { red: '#f05252', orange: '#f89542', yellow: '#e5bb27', green: '#49b974', blue: '#4d97e8', purple: '#a474d1', gray: '#999', 'dark-blue': '#4164a0', 'dark-green': '#348356', 'dark-gray': '#666' }
