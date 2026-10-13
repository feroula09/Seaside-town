/** Title, renderer badge and the how-to-play strip (SPEC §12.1). */
export function mountHud(root: HTMLElement): { setBadge(backend: 'webgpu' | 'webgl2', atmosphere: string): void } {
  root.insertAdjacentHTML(
    'beforeend',
    `<header class="hud-title">
       <p class="eyebrow">MINIATURE STUDIES</p>
       <h1>Seaside Town.</h1>
     </header>
     <div class="hud-badge" role="status"><span class="dot"></span><span class="badge-text"></span></div>
     <footer class="hud-hint"><strong>How to play</strong> — Drag water for waves · Click water to poke · Drag elsewhere or right-drag to orbit · Scroll to zoom</footer>`,
  );
  const badge = root.querySelector<HTMLElement>('.hud-badge')!;
  const text = badge.querySelector<HTMLElement>('.badge-text')!;
  return {
    setBadge(backend, atmosphere) {
      badge.dataset.backend = backend;
      text.textContent = `${backend === 'webgpu' ? 'WebGPU' : 'WebGL2'} · ${atmosphere}`;
    },
  };
}

export function showFallback(root: HTMLElement, reason: string): void {
  root.innerHTML = `<div class="fallback">
    <h1>Seaside Town.</h1>
    <p>This browser can't run WebGPU or WebGL2, so the harbour can't be drawn.</p>
    <p class="fallback-reason"></p>
  </div>`;
  root.querySelector('.fallback-reason')!.textContent = reason;
}
