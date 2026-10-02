import * as THREE from 'three';
import type { DeviceInfo } from './speedTest';

/** Everything in the speed-test report that does not need the GPU. */
export function basicDeviceInfo(): Omit<DeviceInfo, 'gpu'> {
  const nav = navigator as Navigator & { deviceMemory?: number };
  return {
    cores: navigator.hardwareConcurrency ?? 'unknown',
    memoryGb: nav.deviceMemory ?? 'unknown',
    screen: `${screen.width}x${screen.height}`,
    pixelRatio: window.devicePixelRatio,
    userAgent: navigator.userAgent,
  };
}

const size = new THREE.Vector2();

/** The full report header: the GPU name (when the browser shares it) and the drawing-buffer size. */
export function deviceInfo(renderer: THREE.WebGLRenderer): DeviceInfo {
  const gl = renderer.getContext();
  const ext = gl.getExtension('WEBGL_debug_renderer_info');
  renderer.getDrawingBufferSize(size);
  return {
    renderSize: `${size.x}x${size.y}`,
    gpu: ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : 'unknown',
    ...basicDeviceInfo(),
  };
}
