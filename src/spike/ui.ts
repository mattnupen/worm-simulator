export interface SpikeUi {
  showStart(onStart: () => void): void;
  showRunning(label: string): void;
  showResult(text: string, pass: boolean): void;
  setFps(fps: number, tier: number): void;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, text = ''): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  e.textContent = text;
  return e;
}

function button(label: string, onClick: () => void): HTMLButtonElement {
  const b = el('button', label);
  b.type = 'button';
  b.addEventListener('click', onClick);
  return b;
}

export function createUi(root: HTMLElement): SpikeUi {
  const panel = el('div');
  panel.className = 'panel';
  panel.setAttribute('role', 'region');
  panel.setAttribute('aria-label', 'Speed test');
  panel.setAttribute('aria-live', 'polite');
  root.appendChild(panel);

  const fpsTag = el('div');
  fpsTag.className = 'fps';
  root.appendChild(fpsTag);
  let lastFpsUpdate = 0;

  return {
    showStart(onStart) {
      panel.hidden = false;
      panel.replaceChildren(
        el('h1', 'Chromebook speed test'),
        el('p', 'This checks if the 3D forest runs well on this computer.'),
        el('p', 'It takes about 30 seconds. Do not touch anything while it runs.'),
      );
      const b = button('Start speed test', onStart);
      panel.appendChild(b);
      b.focus();
    },
    showRunning(label) {
      const p = el('p', label);
      p.dataset.testid = 'running';
      panel.replaceChildren(p, el('p', 'Please wait.'));
    },
    showResult(text, pass) {
      const pre = el('pre', text);
      pre.dataset.testid = 'result';
      const copy = button('Copy results', async () => {
        try {
          await navigator.clipboard.writeText(text);
          copy.textContent = 'Copied!';
        } catch {
          const range = document.createRange();
          range.selectNodeContents(pre);
          getSelection()?.removeAllRanges();
          getSelection()?.addRange(range);
          copy.textContent = 'Text selected. Press Ctrl + C.';
        }
      });
      const drive = button('Try driving the worm', () => {
        panel.hidden = true;
      });
      panel.replaceChildren(el('h1', pass ? 'PASS' : 'FAIL'), pre, copy, drive);
      copy.focus();
    },
    setFps(fps, tier) {
      const now = performance.now();
      if (now - lastFpsUpdate < 250) return;
      lastFpsUpdate = now;
      fpsTag.textContent = `${Math.round(fps)} fps, quality ${tier}`;
    },
  };
}
