// Kenney "Top-down Tanks Redux" (CC0) images, inlined by Vite.
const files = import.meta.glob('../assets/kenney/*.png', { eager: true, import: 'default' });
export const IMG = {};
export const assetsReady = Promise.all(Object.entries(files).map(([path, url]) => new Promise((res) => {
  const name = path.split('/').pop().replace('.png', '');
  const im = new Image(); im.onload = res; im.onerror = res; im.src = url; IMG[name] = im;
})));
