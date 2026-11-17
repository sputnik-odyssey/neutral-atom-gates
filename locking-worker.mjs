import { simulateLock } from './locking-model.mjs';
import { captureTimeline } from './locking-capture.mjs';
self.addEventListener('message', event => {
  try { self.postMessage({ id: event.data.id, samples: captureTimeline(simulateLock(event.data.parameters)) }); }
  catch { self.postMessage({ id: event.data.id, error: '入射时间扫描未完成；可继续查看所选单原子的结果。' }); }
});
