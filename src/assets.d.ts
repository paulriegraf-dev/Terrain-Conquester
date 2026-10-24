/** Musik wird beim Bauen als data:-URL eingebettet (esbuild-Loader „dataurl“). */
declare module '*.mp3' {
  const url: string;
  export default url;
}

/** Pixel-Grafiken (PixelLab/Aseprite) – beim Bauen als data:-URL eingebettet. */
declare module '*.png' {
  const url: string;
  export default url;
}
