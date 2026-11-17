import { captureMap } from './cooling-model.mjs';
self.addEventListener('message', event => {
  try { self.postMessage({ id: event.data.id, map: captureMap(event.data.parameters) }); }
  catch { self.postMessage({ id: event.data.id, error: '参数图计算未完成，请恢复示例后重试。' }); }
});
